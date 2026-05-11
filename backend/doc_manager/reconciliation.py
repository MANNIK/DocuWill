import json
import os
import re
from openai import OpenAI
from .models import Document, Reconciliation, Discrepancy

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


def _normalize_value(val: str) -> float | str:
    """Converte '€ 15,00' o '15,00' in 15.0 se possibile, altrimenti lascia stringa."""
    cleaned = re.sub(r"[€$£\s%]", "", str(val)).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return val

# ─────────────────────────────────────────────
# LIVELLO 1 — Match matematico esatto
# ─────────────────────────────────────────────

def level1_exact_match(rows1: dict, rows2: dict) -> tuple[bool, list[dict]]:
    """
    Confronto matematico puro — nessuna chiamata esterna.
    Restituisce (tutto_ok, discrepanze_trovate).
    """
    discrepancies = []

    for key, row1 in rows1.items():
        if key not in rows2:
            discrepancies.append({
                "type": "missing_in_doc2",
                "field": "row",
                "value_doc1": row1.description or row1.item_code,
                "value_doc2": "",
                "severity": "error",
            })
            continue

        row2 = rows2[key]

        if row1.quantity is not None and row2.quantity is not None:
            if abs(float(row1.quantity) - float(row2.quantity)) > 0.001:
                discrepancies.append({
                    "type": "quantity_mismatch",
                    "field": "quantity",
                    "value_doc1": str(row1.quantity),
                    "value_doc2": str(row2.quantity),
                    "severity": "error",
                })

        if row1.unit_price is not None and row2.unit_price is not None:
            if abs(float(row1.unit_price) - float(row2.unit_price)) > 0.001:
                discrepancies.append({
                    "type": "price_mismatch",
                    "field": "unit_price",
                    "value_doc1": str(row1.unit_price),
                    "value_doc2": str(row2.unit_price),
                    "severity": "error",
                })

        if row1.unit and row2.unit:
            if row1.unit.lower().strip() != row2.unit.lower().strip():
                discrepancies.append({
                    "type": "unit_mismatch",
                    "field": "unit",
                    "value_doc1": row1.unit,
                    "value_doc2": row2.unit,
                    "severity": "warning",
                })

        if row1.discount is not None and row2.discount is not None:
            if abs(float(row1.discount) - float(row2.discount)) > 0.001:
                discrepancies.append({
                    "type": "discount_mismatch",
                    "field": "discount",
                    "value_doc1": str(row1.discount),
                    "value_doc2": str(row2.discount),
                    "severity": "warning",
                })

    # Righe extra in doc2
    for key, row2 in rows2.items():
        if key not in rows1:
            discrepancies.append({
                "type": "extra_in_doc2",
                "field": "row",
                "value_doc1": "",
                "value_doc2": row2.description or row2.item_code,
                "severity": "warning",
            })

    # Totali
    return len(discrepancies) == 0, discrepancies


# ─────────────────────────────────────────────
# LIVELLO 2 — Claude valuta le discrepanze
# ─────────────────────────────────────────────

def serialize_document_for_claude(doc: Document) -> dict:
    """
    Serializza il documento includendo solo i campi con valori reali
    più il raw_data originale — Claude vede tutto quello che c'è.
    """
    rows = []
    for row in doc.rows.all():
        row_data = {"row_index": row.row_index}
        if row.item_code:
            row_data["item_code"] = row.item_code
        if row.description:
            row_data["description"] = row.description
        if row.quantity is not None:
            row_data["quantity"] = float(row.quantity)
        if row.unit:
            row_data["unit"] = row.unit
        if row.unit_price is not None:
            row_data["unit_price"] = float(row.unit_price)
        if row.total_price is not None:
            row_data["total_price"] = float(row.total_price)
        if row.discount is not None:
            row_data["discount"] = float(row.discount)
        if row.raw_data:
            row_data["raw_data"] = row.raw_data
        rows.append(row_data)

    return {
        "doc_type": doc.doc_type,
        "supplier_name": doc.supplier_name,
        "document_number": doc.document_number,
        "document_date": str(doc.document_date) if doc.document_date else "",
        "total_amount": float(doc.total_amount) if doc.total_amount else None,
        "rows": rows,
    }


def is_standard_document(doc: Document) -> bool:
    """
    Un documento è 'standard' se la maggioranza delle righe ha item_code
    (codice prodotto, SKU, codice paese, nome servizio).
    I tariffari hanno unit_price ma non item_code → non-standard.
    """
    rows = list(doc.rows.all())
    if not rows:
        return True
    with_code = sum(1 for r in rows if r.item_code)
    return (with_code / len(rows)) > 0.5


def level2_semantic_check(
    doc1: Document,
    doc2: Document,
    discrepancies: list[dict],
) -> list[dict]:
    """
    Per documenti standard: manda solo le righe coinvolte nelle discrepanze.
    Per documenti non-standard (tariffari, fasce, zone): manda tutte le righe
    con raw_data — sono piccoli per definizione, il costo token è trascurabile.
    """
    both_standard = is_standard_document(doc1) and is_standard_document(doc2)

    involved_keys = set()
    for d in discrepancies:
        if d.get("value_doc1"):
            involved_keys.add(d["value_doc1"])
        if d.get("value_doc2"):
            involved_keys.add(d["value_doc2"])

    def get_rows(doc: Document) -> list[dict]:
        rows = []
        for row in doc.rows.all():
            key = row.item_code or row.description
            # Standard: solo righe discrepanti. Non-standard: tutte.
            if both_standard and involved_keys and key not in involved_keys:
                continue
            row_data = {}
            if row.item_code:
                row_data["item_code"] = row.item_code
            if row.description:
                row_data["description"] = row.description
            if row.quantity is not None:
                row_data["quantity"] = float(row.quantity)
            if row.unit_price is not None:
                row_data["unit_price"] = float(row.unit_price)
            if row.unit:
                row_data["unit"] = row.unit
            if row.discount is not None:
                row_data["discount"] = float(row.discount)
            # Per doc non-standard includi anche i dati grezzi originali
            if not both_standard and row.raw_data:
                row_data["raw_data"] = row.raw_data
            rows.append(row_data)
        return rows

    doc1_context = {
        "doc_type": doc1.doc_type,
        "supplier": doc1.supplier_name,
        "rows": get_rows(doc1),
    }
    doc2_context = {
        "doc_type": doc2.doc_type,
        "supplier": doc2.supplier_name,
        "rows": get_rows(doc2),
    }

    prompt = f"""Valuta queste discrepanze trovate tra due documenti aziendali.
Per ogni discrepanza decidi se è un errore reale o rappresentazioni diverse della stessa cosa.

DOCUMENTO 1: {json.dumps(doc1_context, ensure_ascii=False)}
DOCUMENTO 2: {json.dumps(doc2_context, ensure_ascii=False)}

DISCREPANZE DA VALUTARE:
{json.dumps(discrepancies, ensure_ascii=False, indent=2)}

Rispondi SOLO con JSON:
{{
  "discrepancies": [
    {{
      "type": "...",
      "field": "...",
      "value_doc1": "...",
      "value_doc2": "...",
      "severity": "error|warning|info",
      "note": "spiegazione"
    }}
  ],
  "summary": "una frase"
}}
"""

    message = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    result = json.loads(raw.strip())
    return result.get("discrepancies", discrepancies)


# ─────────────────────────────────────────────
# LIVELLO 2b — Semantic full (coppie non-standard)
# ─────────────────────────────────────────────

def _build_full_context(doc: Document) -> dict:
    """
    Serializza un documento non-standard con tutto il raw_data.
    Ogni riga include un campo '_id' con un identificatore leggibile
    (usato da GPT nelle discrepanze invece del dict grezzo).
    """
    rows = []
    for row in doc.rows.all():
        # Per i doc non-standard usiamo SOLO raw_data con i nomi originali delle
        # colonne CSV. Questo rende il confronto in L2 immune a come GPT ha mappato
        # le colonne: "Standard €" è sempre "Standard €" in entrambi i documenti,
        # indipendentemente da quale campo standard gli è stato assegnato.
        if row.raw_data:
            # Normalizza i valori numerici ("€ 15,00" → 15.0) per rendere
            # il confronto in GPT immune a differenze di formato/simboli di valuta
            entry = {k: _normalize_value(v) for k, v in row.raw_data.items()}
        else:
            # Fallback per righe senza raw_data: usa i campi standard
            entry = {}
            if row.item_code:
                entry["item_code"] = row.item_code
            if row.description:
                entry["description"] = row.description
            if row.unit_price is not None:
                entry["unit_price"] = float(row.unit_price)
            if row.quantity is not None:
                entry["quantity"] = float(row.quantity)

        # Costruisci un identificatore leggibile per questa riga
        # che GPT userà nelle discrepanze invece del dict completo
        if row.item_code:
            row_id = row.item_code
        elif row.description:
            row_id = row.description[:60]
        elif row.raw_data:
            # Prendi i primi due valori non vuoti come label
            vals = [str(v) for v in row.raw_data.values() if v and str(v).strip()][:2]
            row_id = " - ".join(vals) if vals else f"riga {row.row_index}"
        else:
            row_id = f"riga {row.row_index}"
        if entry:
            # _id tenuto separato: usato solo come label nelle note,
            # non come campo dati (GPT altrimenti lo confronta e genera falsi warning)
            rows.append({"_id": row_id, **entry})

    return {
        "doc_type": doc.doc_type,
        "supplier": doc.supplier_name,
        "rows": rows,
    }


def level2_full_semantic(doc1: Document, doc2: Document) -> list[dict]:
    """
    Per coppie non-standard (tariffari, zone, supplementi, ecc.):
    salta il confronto matematico e manda tutto a GPT.
    GPT riceve il raw_data completo di entrambi i documenti e trova
    le discrepanze semantiche direttamente — senza dipendere da L1.
    """
    ctx1 = _build_full_context(doc1)
    ctx2 = _build_full_context(doc2)

    prompt = f"""Sei un esperto di documenti aziendali. Hai due versioni correlate dello stesso documento
e devi trovare tutte le discrepanze sui DATI (prezzi, quantità, tariffe, condizioni).

DOCUMENTO 1:
{json.dumps(ctx1, ensure_ascii=False, indent=2)}

DOCUMENTO 2:
{json.dumps(ctx2, ensure_ascii=False, indent=2)}

Regole:
- Il campo "_id" è un identificatore interno della riga — NON confrontarlo tra i documenti,
  usalo solo per abbinare le righe corrispondenti e come riferimento nelle note
- I dati di ogni riga usano i nomi originali delle colonne CSV (es. "Standard €", "Express €",
  "Peso Min Kg"). Confronta colonna per colonna: "Standard €" di doc1 contro "Standard €" di doc2
- Per "value_doc1" e "value_doc2" usa SEMPRE valori brevi e leggibili (es. "7.50", "20.00"),
  mai oggetti JSON o dict completi
- Per righe mancanti usa il valore di "_id" come identificatore nel campo "value_doc1"
- Ignora righe "A PREVENTIVO" se presenti in entrambi i documenti

Rispondi SOLO con JSON valido:
{{
  "discrepancies": [
    {{
      "type": "price_mismatch|quantity_mismatch|missing_in_doc2|extra_in_doc2|description_mismatch|other",
      "field": "nome del campo che differisce (es. 'Express €', 'Standard €')",
      "value_doc1": "valore leggibile dal doc 1",
      "value_doc2": "valore leggibile dal doc 2",
      "severity": "error|warning|info",
      "note": "riga identificata da: [_id della riga]"
    }}
  ],
  "summary": "una frase che descrive le discrepanze trovate"
}}

Se i documenti sono perfettamente allineati restituisci "discrepancies": [].
"""

    message = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=2048,
        temperature=0,  # output deterministico, riduce allucinazioni su valori identici
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    result = json.loads(raw.strip())
    return result.get("discrepancies", [])


# ─────────────────────────────────────────────
# LIVELLO 3 — Decisione finale
# ─────────────────────────────────────────────

def level3_decide(reconciliation: Reconciliation):
    """
    Se dopo il giudizio di Claude non ci sono errori reali,
    la riconciliazione viene auto-approvata.
    Se ci sono errori, rimane pending e l'operatore deve intervenire.
    In futuro: WebSocket / email / notifica push.
    """
    has_real_errors = any(
        d.get("severity") == "error"
        for d in reconciliation.discrepancies
    )

    if not has_real_errors:
        reconciliation.status = Reconciliation.StatusChoices.APPROVED
        reconciliation.save()
    # Se ha errori rimane PENDING — l'operatore lo vedrà nella UI


# ─────────────────────────────────────────────
# Funzione principale — cascata
# ─────────────────────────────────────────────

def claude_reconcile(doc1: Document, doc2: Document) -> tuple[list[dict], int]:
    """
    Riconciliazione adattiva a cascata:

    Coppie standard (entrambi hanno item_code):
      L1 math → se tutto quadra stop, altrimenti L2 corregge

    Coppie non-standard (tariffari, zone, supplementi, ecc.):
      Salta L1 — strutture incomparabili matematicamente
      L2 full semantic — GPT riceve raw_data completo e trova discrepanze direttamente
    """
    both_standard = is_standard_document(doc1) and is_standard_document(doc2)

    if not both_standard:
        try:
            discrepancies = level2_full_semantic(doc1, doc2)
        except Exception as e:
            discrepancies = [{
                "type": "description_mismatch",
                "field": "system",
                "value_doc1": "",
                "value_doc2": "",
                "severity": "info",
                "note": f"Analisi semantica non disponibile: {str(e)}",
            }]
        return discrepancies, 0

    # Flusso standard: L1 → L2
    def _index_rows(doc: Document) -> dict:
        all_rows = list(doc.rows.all())
        has_codes = any(r.item_code for r in all_rows)
        if has_codes:
            # Documento con item_code: usa solo righe codificate.
            # Esclude sub-items e righe senza codice (es. "Sub-item: maniglie")
            # che non esistono nell'altro documento e genererebbero falsi positivi.
            return {r.item_code: r for r in all_rows if r.item_code}
        else:
            return {r.description: r for r in all_rows if r.description}

    rows1 = _index_rows(doc1)
    rows2 = _index_rows(doc2)

    # LIVELLO 1
    perfect_match, discrepancies = level1_exact_match(rows1, rows2)

    if perfect_match:
        return [], +10

    # LIVELLO 2 — Claude entra solo se ci sono discrepanze
    try:
        discrepancies = level2_semantic_check(doc1, doc2, discrepancies)
    except Exception as e:
        # Claude non disponibile — teniamo le discrepanze del livello 1
        # e aggiungiamo una nota di sistema
        discrepancies.append({
            "type": "description_mismatch",
            "field": "system",
            "value_doc1": "",
            "value_doc2": "",
            "severity": "info",
            "note": f"Valutazione semantica non disponibile: {str(e)}",
        })

    return discrepancies, 0


# ─────────────────────────────────────────────
# Entry point — chiamato dal task Celery
# ─────────────────────────────────────────────

def compute_match_score(doc_a: Document, doc_b: Document) -> int:
    score = 0

    # Numero documento identico (peso massimo)
    if (
        doc_a.document_number
        and doc_b.document_number
        and doc_a.document_number.strip() == doc_b.document_number.strip()
    ):
        score += 50

    # Stesso fornitore
    if (
        doc_a.supplier_name
        and doc_b.supplier_name
        and doc_a.supplier_name.lower().strip() == doc_b.supplier_name.lower().strip()
    ):
        score += 30

    # Stessa data
    if doc_a.document_date and doc_b.document_date:
        if doc_a.document_date == doc_b.document_date:
            score += 10

    # Totali simili
    if doc_a.total_amount and doc_b.total_amount:
        diff = abs(doc_a.total_amount - doc_b.total_amount)
        max_val = max(doc_a.total_amount, doc_b.total_amount)
        if diff < 0.01:
            score += 10
        elif diff / max_val < 0.1:
            score += 5

    # Articoli in comune — Jaccard su item_code
    codes_a = {r.item_code.strip() for r in doc_a.rows.all() if r.item_code and r.item_code.strip()}
    codes_b = {r.item_code.strip() for r in doc_b.rows.all() if r.item_code and r.item_code.strip()}

    if codes_a and codes_b:
        overlap = len(codes_a & codes_b) / len(codes_a | codes_b)
        if overlap >= 0.8:
            score += 40
        elif overlap >= 0.5:
            score += 25
        elif overlap >= 0.2:
            score += 10
    elif not codes_a and not codes_b:
        # Doc non-standard senza item_code: confronta i valori di raw_data
        values_a = {str(v) for r in doc_a.rows.all() for v in r.raw_data.values() if v}
        values_b = {str(v) for r in doc_b.rows.all() for v in r.raw_data.values() if v}
        if values_a and values_b:
            overlap = len(values_a & values_b) / len(values_a | values_b)
            if overlap >= 0.5:
                score += 20
            elif overlap >= 0.2:
                score += 10

    return min(score, 100)


def find_and_reconcile(new_doc: Document):
    candidates = Document.objects.filter(
        status=Document.StatusChoices.PROCESSED,
    ).exclude(id=new_doc.id)

    best_match = None
    best_score = 0

    for candidate in candidates:
        already_exists = Reconciliation.objects.filter(
            doc1=candidate, doc2=new_doc
        ).exists() or Reconciliation.objects.filter(
            doc1=new_doc, doc2=candidate
        ).exists()
        if already_exists:
            continue

        # Stesso filename = duplicato, salta sempre
        if candidate.original_filename == new_doc.original_filename:
            continue

        # Claude decide se la coppia ha senso
        if not are_documents_complementary(new_doc, candidate):
            continue

        score = compute_match_score(new_doc, candidate)
        if score > best_score:
            best_score = score
            best_match = candidate

    if best_score < 30 or best_match is None:
        return

    if new_doc.created_at < best_match.created_at:
        doc1, doc2 = new_doc, best_match
    else:
        doc1, doc2 = best_match, new_doc

    discrepancies, confidence_adjustment = claude_reconcile(doc1, doc2)

    reconciliation = Reconciliation.objects.create(
        doc1=doc1,
        doc2=doc2,
        match_confidence=min(best_score + confidence_adjustment, 100),
        status=Reconciliation.StatusChoices.PENDING,
        discrepancies=discrepancies,
    )

    Discrepancy.objects.bulk_create([
        Discrepancy(
            reconciliation=reconciliation,
            discrepancy_type=d.get("type", "description_mismatch"),
            field_name=d.get("field", ""),
            value_doc1=str(d.get("value_doc1", "")),
            value_doc2=str(d.get("value_doc2", "")),
            severity=d.get("severity", "warning"),
        )
        for d in discrepancies
    ])

    level3_decide(reconciliation)


# VERIFICA SE DOCUMENTI COMPLEMENTARI
def are_documents_complementary(doc_a: Document, doc_b: Document) -> bool:
    """
    Decide se due documenti ha senso riconciliarli.
    Prima applica regole fast (senza GPT), poi chiede a GPT solo per i casi ambigui.
    """
    same_supplier = (
        doc_a.supplier_name
        and doc_b.supplier_name
        and doc_a.supplier_name.lower().strip() == doc_b.supplier_name.lower().strip()
    )
    same_type = doc_a.doc_type == doc_b.doc_type

    # Fast-path: stesso fornitore + stesso tipo = confronto versioni (es. tariffario rev3 vs rev4)
    # Nessuna chiamata GPT necessaria — è sempre valido confrontarli.
    if same_supplier and same_type:
        return True

    # Fast-path: tipi complementari noti → risparmia una chiamata GPT
    _known_pairs = {
        frozenset({"order", "invoice"}),
        frozenset({"order", "ddt"}),
        frozenset({"order", "packing_list"}),
        frozenset({"order", "confirmation"}),
        frozenset({"invoice", "ddt"}),
        frozenset({"shipment", "invoice"}),
        frozenset({"price_list", "confirmation"}),
    }
    if frozenset({doc_a.doc_type, doc_b.doc_type}) in _known_pairs:
        return True

    # Casi ambigui → GPT decide
    prompt = f"""Hai due documenti aziendali. Dimmi se ha senso riconciliarli insieme,
cioè se uno potrebbe essere la risposta, conferma, aggiornamento o contropartita dell'altro.

DOCUMENTO A: tipo={doc_a.doc_type}, fornitore={doc_a.supplier_name}, file={doc_a.original_filename}
DOCUMENTO B: tipo={doc_b.doc_type}, fornitore={doc_b.supplier_name}, file={doc_b.original_filename}

Coppie che hanno senso: ordine+fattura, ordine+DDT, tariffario+conferma prezzi,
spedizione+fattura corriere, due versioni dello stesso documento (aggiornamenti).

Coppie che NON hanno senso: due ordini diversi tra fornitori diversi, due fatture non correlate.

Rispondi SOLO con JSON:
{{"complementary": true/false, "reasoning": "spiegazione breve"}}"""

    try:
        message = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        result = json.loads(raw.strip())
        return result.get("complementary", True)
    except Exception:
        return True