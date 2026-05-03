import json
import os
from openai import OpenAI
from .models import Document, Reconciliation, Discrepancy

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

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


def level2_semantic_check(
    doc1: Document,
    doc2: Document,
    discrepancies: list[dict],
) -> list[dict]:
    """
    Manda a GPT solo le righe coinvolte nelle discrepanze,
    non l'intero documento.
    """
    # Estrai solo i codici articolo coinvolti nelle discrepanze
    involved_keys = set()
    for d in discrepancies:
        if d.get("value_doc1"):
            involved_keys.add(d["value_doc1"])
        if d.get("value_doc2"):
            involved_keys.add(d["value_doc2"])

    # Filtra solo le righe rilevanti
    def get_relevant_rows(doc: Document) -> list[dict]:
        rows = []
        for row in doc.rows.all():
            key = row.item_code or row.description
            # Includi la riga solo se è coinvolta in una discrepanza
            if key in involved_keys or not involved_keys:
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
                rows.append(row_data)
        return rows

    # Contesto minimo — solo metadati e righe rilevanti
    doc1_context = {
        "doc_type": doc1.doc_type,
        "supplier": doc1.supplier_name,
        "rows": get_relevant_rows(doc1),
    }
    doc2_context = {
        "doc_type": doc2.doc_type,
        "supplier": doc2.supplier_name,
        "rows": get_relevant_rows(doc2),
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
    Sistema a cascata:
    1. Match matematico esatto (gratuito, millisecondi)
    2. Claude valuta le discrepanze (solo se necessario)
    """
    rows1 = {
        (r.item_code or r.description): r
        for r in doc1.rows.all()
        if r.item_code or r.description
    }
    rows2 = {
        (r.item_code or r.description): r
        for r in doc2.rows.all()
        if r.item_code or r.description
    }

    # LIVELLO 1
    perfect_match, discrepancies = level1_exact_match(rows1, rows2)

    if perfect_match:
        # Tutto quadra matematicamente — Claude non serve
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

    # Articoli in comune — criterio di fallback fondamentale
    codes_a = set(
        r.item_code.strip()
        for r in doc_a.rows.all()
        if r.item_code and r.item_code.strip()
    )
    codes_b = set(
        r.item_code.strip()
        for r in doc_b.rows.all()
        if r.item_code and r.item_code.strip()
    )

    if codes_a and codes_b:
        common = codes_a & codes_b
        total = codes_a | codes_b
        overlap = len(common) / len(total)  # Jaccard similarity

        if overlap >= 0.8:
            score += 40  # quasi tutti gli articoli coincidono
        elif overlap >= 0.5:
            score += 25
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
    Chiede a Claude se due documenti hanno senso come coppia.
    Nessuna lista fissa — Claude ragiona sul contesto.
    """
    prompt = f"""Hai due documenti aziendali. Dimmi se ha senso riconciliarli insieme,
    cioè se uno potrebbe essere la risposta, conferma o contropartita dell'altro.

    DOCUMENTO A: tipo={doc_a.doc_type}, fonte={doc_a.source}, 
                fornitore={doc_a.supplier_name}, filename={doc_a.original_filename}

    DOCUMENTO B: tipo={doc_b.doc_type}, fonte={doc_b.source},
                fornitore={doc_b.supplier_name}, filename={doc_b.original_filename}

    Esempi di coppie che hanno senso: ordine+fattura, ordine+DDT, tariffario+conferma prezzi,
    spedizione+fattura corriere, ordine+packing list.

    Esempi di coppie che NON hanno senso: ordine+ordine, fattura+fattura, due file identici.

    Rispondi SOLO con JSON:
    {{
    "complementary": true/false,
    "reasoning": "spiegazione breve"
    }}
    """

    try:
        message = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=150,
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
        # Se Claude non risponde, non bloccare — lascia passare
        return True