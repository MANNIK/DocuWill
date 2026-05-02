import json
import os
import anthropic
from .models import Document, Reconciliation, Discrepancy

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


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
    Claude riceve i due documenti e le discrepanze già trovate.
    Il suo compito non è trovarne di nuove — è valutare se quelle
    trovate sono errori reali o rappresentazioni diverse della stessa cosa.
    Aggiorna la severity di conseguenza.
    """
    prompt = f"""Sei un esperto di documenti aziendali italiani.
Un sistema automatico ha confrontato questi due documenti e ha trovato
delle discrepanze. Il tuo compito è valutare ogni discrepanza e decidere
se è un errore reale oppure solo una rappresentazione diversa della stessa cosa.

DOCUMENTO 1 (tipo: {doc1.doc_type}, fonte: {doc1.source}):
{json.dumps(serialize_document_for_claude(doc1), ensure_ascii=False, indent=2)}

DOCUMENTO 2 (tipo: {doc2.doc_type}, fonte: {doc2.source}):
{json.dumps(serialize_document_for_claude(doc2), ensure_ascii=False, indent=2)}

DISCREPANZE TROVATE DAL SISTEMA:
{json.dumps(discrepancies, ensure_ascii=False, indent=2)}

Per ogni discrepanza aggiorna la severity:
- "error" → differenza reale che richiede intervento umano
- "warning" → probabilmente la stessa cosa rappresentata diversamente
- "info" → differenza marginale, non bloccante

Esempi di ragionamento:
- "Bulloni M6 zincati" vs "M6-ZN-BLT" → stesso articolo, severity: warning
- quantità 10 vs 8 → errore reale, severity: error
- "100 pz" vs "1 scatola da 100" → equivalenti, severity: info
- prezzo 9.99 vs 10.00 → verifica se è arrotondamento o errore reale

Rispondi SOLO con JSON valido:
{{
  "discrepancies": [
    {{
      "type": "...",
      "field": "...",
      "value_doc1": "...",
      "value_doc2": "...",
      "severity": "error|warning|info",
      "note": "spiegazione breve"
    }}
  ],
  "summary": "cosa hai trovato in una frase"
}}
"""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    result = json.loads(raw)
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

    if (
        doc_a.document_number
        and doc_b.document_number
        and doc_a.document_number.strip() == doc_b.document_number.strip()
    ):
        score += 50

    if (
        doc_a.supplier_name
        and doc_b.supplier_name
        and doc_a.supplier_name.lower().strip() == doc_b.supplier_name.lower().strip()
    ):
        score += 30

    if doc_a.document_date and doc_b.document_date:
        if doc_a.document_date == doc_b.document_date:
            score += 10

    if doc_a.total_amount and doc_b.total_amount:
        diff = abs(doc_a.total_amount - doc_b.total_amount)
        max_val = max(doc_a.total_amount, doc_b.total_amount)
        if diff < 0.01:
            score += 10
        elif diff / max_val < 0.1:
            score += 5

    return min(score, 100)


def find_and_reconcile(new_doc: Document):
    """
    Chiamato dal task Celery dopo che un documento è stato processato.
    Cerca il miglior candidato e avvia la cascata di riconciliazione.
    """
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

        score = compute_match_score(new_doc, candidate)
        if score > best_score:
            best_score = score
            best_match = candidate

    if best_score < 40 or best_match is None:
        return

    if new_doc.created_at < best_match.created_at:
        doc1, doc2 = new_doc, best_match
    else:
        doc1, doc2 = best_match, new_doc

    # Cascata livello 1 + 2
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

    # Livello 3 — decisione finale
    level3_decide(reconciliation)