"""
tariff_reconciliation.py — Confronto deterministico per documenti non-standard
==============================================================================

Posizione: backend/doc_manager/tariff_reconciliation.py

IL PROBLEMA DI L2b (stato precedente)
-------------------------------------
Per i documenti non-standard (tariffari) il codice chiamava level2_full_semantic
che mandava l'intero raw_data a GPT. Conseguenze:
  1. COSTO: ogni riconciliazione inviava tutto il documento ogni volta.
  2. NON DETERMINISMO: il confronto numerico lo faceva GPT, può allucinare.
  3. NON SCALA: tariffari grandi saturano il context window.

PROBLEMA AGGIUNTIVO — DUE FORMATI DI raw_data
----------------------------------------------
Lo stesso tariffario può arrivare in due modi:

  Via CSV (DocumentRow.raw_data conserva i nomi colonna originali):
    {"Zona": "A", "Peso Min Kg": "0", "Peso Max Kg": "1",
     "Standard €": "4,90", "Express €": "7,20"}

  Via OCR/WhatsApp (il prompt ocr.py "esplode" il tariffario in righe
  con item_code e unit_price normalizzati):
    {"item_code": "ZONA-A-0.5-1.0",
     "description": "Standard Conv. — Zona A, 0.5÷1.0 kg",
     "unit_price": 4.9, "unit": "spedizione", "quantity": None}

Strutture diverse → confronto diretto impossibile.

SOLUZIONE
---------
1. Normalizzazione: converte entrambi i formati in una rappresentazione comune.
2. Classificazione colonne: separa dimensioni (chiave) da valori (prezzi).
3. Confronto deterministico colonna-per-colonna: Python, zero GPT nel caso comune.
4. Fallback GPT (level2_full_semantic) solo quando i formati sono troppo divergenti.

NOTA: la decisione "standard vs non-standard" vive in reconciliation.py
(is_standard_document + _NONSTANDARD_DOC_TYPES). Qui NON viene duplicata, per
evitare drift tra le due definizioni.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Parsing numerico (allineato a parse_number dell'ai_service)
# ─────────────────────────────────────────────────────────────────────────────

def _to_number(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    text = re.sub(r"[€$£\s%]", "", text)
    if not text or text in ("-", "N/A", "n/a"):
        return None
    if "," in text and "." in text:
        if text.rindex(",") > text.rindex("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        parts = text.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Rilevamento formato raw_data e normalizzazione
# ─────────────────────────────────────────────────────────────────────────────

# Campi standard che il parser OCR mette nel raw_data dei tariffari esplosi.
_OCR_FIELDS = {"item_code", "description", "unit_price", "unit", "quantity", "discount"}

_ITEM_CODE_SEP = re.compile(r"[-_]")


def _is_ocr_format(rows_raw: list[dict[str, Any]]) -> bool:
    """
    True se il raw_data ha il formato prodotto dall'OCR (campi normalizzati)
    invece dei nomi colonna originali del CSV.
    Un documento è in formato OCR se >60% delle righe hanno il campo 'unit_price'.
    """
    if not rows_raw:
        return False
    with_unit_price = sum(1 for r in rows_raw if "unit_price" in r)
    return (with_unit_price / len(rows_raw)) > 0.6


def _parse_item_code_dimensions(item_code: str) -> dict[str, str]:
    """
    Estrae le dimensioni dall'item_code costruito dall'OCR.
    Es: "ZONA-A-0.5-1.0" → {"_dim_0": "zona", "_dim_1": "a", "_dim_2": "0.5", "_dim_3": "1.0"}
    Es: "STD-1-3"         → {"_dim_0": "std", "_dim_1": "1", "_dim_2": "3"}

    Usa chiavi prefissate _dim_N per non collidere con colonne CSV reali.
    """
    parts = _ITEM_CODE_SEP.split(item_code.strip().lower())
    return {f"_dim_{i}": p for i, p in enumerate(parts)}


def _normalize_ocr_row(row: dict[str, Any]) -> dict[str, Any]:
    """
    Converte una riga in formato OCR in una riga normalizzata comparabile
    con il formato CSV: dimensioni (da item_code) come chiave, _price come valore.
    """
    result: dict[str, Any] = {}

    item_code = str(row.get("item_code", "")).strip()
    if item_code:
        result.update(_parse_item_code_dimensions(item_code))

    description = str(row.get("description", "")).strip()
    if description:
        result["_description"] = description

    unit_price = row.get("unit_price")
    if unit_price is not None:
        result["_price"] = unit_price

    discount = row.get("discount")
    if discount is not None:
        result["_discount"] = discount

    return result


def _normalize_rows(rows_raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Normalizza una lista di raw_data verso una rappresentazione comune.
    CSV: colonne originali intatte. OCR: convertite via _normalize_ocr_row.
    """
    if not rows_raw:
        return []
    if _is_ocr_format(rows_raw):
        return [_normalize_ocr_row(r) for r in rows_raw]
    # formato CSV: già utilizzabile direttamente
    return rows_raw


# ─────────────────────────────────────────────────────────────────────────────
# Classificazione colonne: dimensione (chiave) vs valore (prezzo)
# ─────────────────────────────────────────────────────────────────────────────

_CURRENCY_RE = re.compile(r"[€$£¥]")

# Colonne sintetiche create dalla normalizzazione OCR che sono SEMPRE valori
_SYNTHETIC_VALUE_COLS = {"_price", "_discount"}


def _all_columns(*row_lists: list[dict[str, Any]]) -> list[str]:
    cols: list[str] = []
    for rows in row_lists:
        for r in rows:
            for k in r.keys():
                if k not in cols:
                    cols.append(k)
    return cols


def _numeric_ratio(col: str, rows: list[dict[str, Any]]) -> float:
    present = [r[col] for r in rows if col in r and str(r[col]).strip()]
    if not present:
        return 0.0
    numeric = sum(1 for v in present if _to_number(v) is not None)
    return numeric / len(present)


def _has_currency(col: str, rows: list[dict[str, Any]]) -> bool:
    if _CURRENCY_RE.search(col):
        return True
    hits = sum(
        1 for r in rows
        if col in r and _CURRENCY_RE.search(str(r[col]))
    )
    return hits > 0


def _value_multiset(col: str, rows: list[dict[str, Any]]) -> tuple:
    vals = sorted(
        str(r[col]).strip().lower()
        for r in rows if col in r and str(r[col]).strip()
    )
    return tuple(vals)


def _is_stable_across(col: str, rows1, rows2) -> bool:
    """True se la colonna ha lo stesso insieme di valori nei due documenti.
    Le dimensioni (griglia) non cambiano tra versioni; i prezzi sì."""
    return _value_multiset(col, rows1) == _value_multiset(col, rows2)


def _row_key(row_raw: dict[str, Any], key_cols: list[str]) -> tuple:
    return tuple(
        str(row_raw.get(c, "")).strip().lower()
        for c in key_cols
    )


def _distinct_key_count(rows: list[dict[str, Any]], key_cols: list[str]) -> int:
    return len({_row_key(r, key_cols) for r in rows})


def _is_unique_key(rows: list[dict[str, Any]], key_cols: list[str]) -> bool:
    return _distinct_key_count(rows, key_cols) == len(rows)


def _classify_columns(
    rows1_norm: list[dict[str, Any]],
    rows2_norm: list[dict[str, Any]],
) -> tuple[list[str], list[str]]:
    """
    Separa le colonne in key_cols (dimensioni) e value_cols (prezzi),
    usando segnali in cascata:
      1. Colonne sintetiche _price/_discount → value certo.
      2. Simbolo valuta (€ $ £ ¥) nell'header o nei valori → value certo.
      3. Colonne non numeriche → key certa.
      4. Colonne numeriche senza valuta (ambigue): entrano nella chiave solo se
         necessarie all'univocità; tra le ambigue si preferiscono le stabili
         cross-documento (le fasce di peso non cambiano; i prezzi sì).
    """
    union = rows1_norm + rows2_norm
    if not union:
        return [], []

    cols = _all_columns(rows1_norm, rows2_norm)

    definite_keys: list[str] = []
    definite_values: list[str] = []
    ambiguous: list[str] = []

    for col in cols:
        if not any(col in r and str(r[col]).strip() for r in union):
            continue
        # colonne sintetiche dalla normalizzazione OCR
        if col in _SYNTHETIC_VALUE_COLS:
            definite_values.append(col)
        elif _has_currency(col, union):
            definite_values.append(col)
        elif _numeric_ratio(col, union) >= 0.7:
            ambiguous.append(col)
        else:
            definite_keys.append(col)

    # Risolvi le ambigue per minimalità di chiave
    keys = list(definite_keys)
    ambiguous.sort(key=lambda c: (not _is_stable_across(c, rows1_norm, rows2_norm), c))

    leftover: list[str] = []
    for col in ambiguous:
        if _is_unique_key(rows1_norm, keys) and _is_unique_key(rows2_norm, keys):
            leftover.append(col)
            continue
        before = _distinct_key_count(rows1_norm, keys)
        after = _distinct_key_count(rows1_norm, keys + [col])
        if after > before:
            keys.append(col)
        else:
            leftover.append(col)

    value_cols = definite_values + leftover
    return keys, value_cols


# ─────────────────────────────────────────────────────────────────────────────
# Confronto deterministico
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class _AlignResult:
    discrepancies: list[dict]
    unmatched_doc1: list[dict]
    unmatched_doc2: list[dict]


def _numeric_equal(a: float | None, b: float | None, tol: float = 0.001) -> bool:
    if a is None or b is None:
        return a is b
    return abs(a - b) <= tol


def _fmt(v: float | None) -> str:
    if v is None:
        return ""
    return f"{v:.2f}".rstrip("0").rstrip(".")


def align_and_compare(
    rows1_norm: list[dict[str, Any]],
    rows2_norm: list[dict[str, Any]],
) -> _AlignResult:
    """
    Allinea le righe sulla chiave-dimensione e confronta le colonne-valore.
    Riceve righe già normalizzate (output di _normalize_rows).
    """
    key_cols, value_cols = _classify_columns(rows1_norm, rows2_norm)

    index2: dict[tuple, dict] = {}
    for r in rows2_norm:
        index2.setdefault(_row_key(r, key_cols), r)

    discrepancies: list[dict] = []
    matched_keys2: set[tuple] = set()
    unmatched1: list[dict] = []

    for r1 in rows1_norm:
        k = _row_key(r1, key_cols)
        r2 = index2.get(k)
        if r2 is None:
            unmatched1.append(r1)
            continue
        matched_keys2.add(k)

        label = " / ".join(str(r1.get(c, "")) for c in key_cols) or "riga"
        for col in value_cols:
            v1 = _to_number(r1.get(col))
            v2 = _to_number(r2.get(col))
            if v1 is None and v2 is None:
                continue
            if not _numeric_equal(v1, v2):
                # usa il nome colonna originale se disponibile, altrimenti il sintetico
                col_label = col.lstrip("_") if col.startswith("_") else col
                discrepancies.append({
                    "type": "price_mismatch",
                    "field": col_label,
                    "value_doc1": _fmt(v1),
                    "value_doc2": _fmt(v2),
                    "severity": "error",
                    "note": f"{col_label} differente per: {label}",
                })

    unmatched2 = [
        r for r in rows2_norm
        if _row_key(r, key_cols) not in matched_keys2
    ]

    for r1 in unmatched1:
        label = " / ".join(str(r1.get(c, "")) for c in key_cols) or "riga"
        discrepancies.append({
            "type": "missing_in_doc2",
            "field": "row",
            "value_doc1": label,
            "value_doc2": "",
            "severity": "warning",
            "note": f"Riga nel doc1 non allineata nel doc2: {label}",
        })

    # righe presenti solo in doc2 (es. nuova zona/fascia aggiunta nella versione 2)
    for r2 in unmatched2:
        label = " / ".join(str(r2.get(c, "")) for c in key_cols) or "riga"
        discrepancies.append({
            "type": "extra_in_doc2",
            "field": "row",
            "value_doc1": "",
            "value_doc2": label,
            "severity": "warning",
            "note": f"Riga nel doc2 non allineata nel doc1: {label}",
        })

    return _AlignResult(
        discrepancies=discrepancies,
        unmatched_doc1=unmatched1,
        unmatched_doc2=unmatched2,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Entry point ibrido: deterministico + GPT solo sul residuo
# ─────────────────────────────────────────────────────────────────────────────

def reconcile_nonstandard(
    doc1,
    doc2,
    *,
    gpt_fallback=None,
) -> list[dict]:
    """
    Sostituto di level2_full_semantic per documenti non-standard.

    Gestisce sia tariffari CSV (raw_data con colonne originali) che
    tariffari OCR (raw_data con item_code/unit_price normalizzati):
    normalizza entrambi prima del confronto, poi procede in modo identico.

    Strategia:
      1. Normalizza i raw_data di entrambi i documenti → formato comune.
      2. align_and_compare → confronto deterministico, zero GPT.
      3. Se >30% delle righe non si allineano (formati troppo divergenti),
         l'allineamento è inaffidabile → si delega a gpt_fallback, che è
         AUTORITATIVO (rianalizza l'intero documento). In quel caso NON si
         concatenano i risultati deterministici per evitare doppio conteggio
         delle stesse righe.
    """
    rows1_raw = [r.raw_data for r in doc1.rows.all() if r.raw_data]
    rows2_raw = [r.raw_data for r in doc2.rows.all() if r.raw_data]

    if not rows1_raw or not rows2_raw:
        if gpt_fallback:
            return gpt_fallback(rows1_raw, rows2_raw)
        return []

    # Normalizza entrambi → formato comune indipendente da CSV/OCR
    rows1_norm = _normalize_rows(rows1_raw)
    rows2_norm = _normalize_rows(rows2_raw)

    result = align_and_compare(rows1_norm, rows2_norm)

    total_rows = max(len(rows1_norm), len(rows2_norm))
    unmatched = len(result.unmatched_doc1) + len(result.unmatched_doc2)

    if unmatched == 0 or gpt_fallback is None or not total_rows:
        return result.discrepancies

    if unmatched / total_rows > 0.3:
        # Allineamento deterministico inaffidabile: il fallback GPT è autoritativo.
        # Ritorna solo il suo output (no concat → niente discrepanze duplicate).
        extra = gpt_fallback(result.unmatched_doc1, result.unmatched_doc2)
        return extra if extra else result.discrepancies

    return result.discrepancies
