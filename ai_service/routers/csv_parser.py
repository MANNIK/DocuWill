import hashlib
import io
import json
import os
import re
from openai import OpenAI
from utils.supplier import normalize_for_cache
import pandas as pd
import redis as redis_lib
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/parse", tags=["CSV Parser"])
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# ─── Cache column mapping per fornitore ──────────────────────────────────────
# Redis DB 2 (DB 0 = Celery broker, DB 1 = embedding cache in reconciliation.py)
_struct_redis = None


def _get_struct_redis():
    global _struct_redis
    if _struct_redis is None:
        try:
            url = os.environ.get(
                "CELERY_BROKER_URL", "redis://redis:6379/0"
            ).replace("/0", "/2")
            r = redis_lib.from_url(url, socket_connect_timeout=1)
            r.ping()
            _struct_redis = r
        except Exception:
            pass  # Redis non disponibile → nessuna cache, prosegue normalmente
    return _struct_redis


def _headers_fingerprint(headers: list[str]) -> str:
    normalized = sorted(h.strip().lower() for h in headers if h.strip())
    return hashlib.md5("|".join(normalized).encode()).hexdigest()[:12]


def _extract_supplier_hint(raw_rows: list[list]) -> str | None:
    """Cerca supplier nelle prime 10 righe (senza GPT) per cache lookup pre-call."""
    keywords = {"fornitore", "supplier", "vendor", "from", "mittente",
                "azienda", "ragione sociale", "company"}
    for row in raw_rows[:10]:
        for i, cell in enumerate(row):
            if str(cell).strip().lower().rstrip(":") in keywords and i + 1 < len(row):
                val = str(row[i + 1]).strip()
                if len(val) > 2:
                    return val
    return None


_COL_MAP_TTL = 30 * 86400  # 30 giorni


def _cache_col_map_get(supplier: str, headers: list[str]) -> dict | None:
    r = _get_struct_redis()
    if not r or not supplier:
        return None
    s_hash = hashlib.md5(normalize_for_cache(supplier).encode()).hexdigest()[:12]
    key = f"col_map:{s_hash}:{_headers_fingerprint(headers)}"
    try:
        data = r.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None


def _cache_col_map_set(supplier: str, headers: list[str], mapping: dict, doc_type: str):
    r = _get_struct_redis()
    if not r or not supplier:
        return
    s_hash = hashlib.md5(normalize_for_cache(supplier).encode()).hexdigest()[:12]
    key = f"col_map:{s_hash}:{_headers_fingerprint(headers)}"
    try:
        r.setex(key, _COL_MAP_TTL, json.dumps({"column_mapping": mapping, "doc_type": doc_type}))
    except Exception:
        pass


class ParsedRow(BaseModel):
    row_index: int
    item_code: str = ""
    description: str = ""
    quantity: float | None = None
    unit: str = ""
    unit_price: float | None = None
    total_price: float | None = None
    discount: float | None = None
    raw_data: dict[str, Any] = {}


class ParsedDocument(BaseModel):
    doc_type: str = "unknown"
    supplier_name: str = ""
    document_number: str = ""
    document_date: str = ""
    total_amount: float | None = None
    rows: list[ParsedRow] = []
    raw_extracted: dict[str, Any] = {}


class ParsedDocumentList(BaseModel):
    documents: list[ParsedDocument] = []
    total_sections: int = 0


def read_raw_file(content: bytes, filename: str) -> list[list[Any]]:
    try:
        if filename.endswith(".csv"):
            for encoding in ["utf-8", "latin-1", "cp1252"]:
                try:
                    text = content.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="Encoding non riconoscibile.")

            lines = [l for l in text.splitlines() if l.strip()]
            separators = [",", ";", "\t", "|"]
            sep_counts = {s: sum(line.count(s) for line in lines) for s in separators}
            sep = max(sep_counts, key=sep_counts.get)
            if sep_counts[sep] == 0:
                sep = ","

            rows = []
            for line in lines:
                cells = line.split(sep)
                rows.append([c.strip() for c in cells])
            # CSV → lista singola avvolta in lista (un solo "sheet")
            return [rows]

        elif filename.endswith((".xlsx", ".xls")):
            xls = pd.ExcelFile(io.BytesIO(content))
            sheets = []
            for sheet in xls.sheet_names:
                df = pd.read_excel(
                    io.BytesIO(content),
                    sheet_name=sheet,
                    header=None,
                    dtype=str,
                )
                sheets.append(df.fillna("").values.tolist())
            # Excel → una lista per sheet
            return sheets

        else:
            raise HTTPException(
                status_code=400,
                detail="Formato non supportato. Usa CSV, XLSX o XLS."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura file: {e}")


def rows_to_text(sheets: list[list[list[Any]]], max_rows_per_sheet: int = 50, tail_rows: int = 15) -> str:
    lines = []
    global_index = 0
    for sheet_idx, sheet_rows in enumerate(sheets):
        if len(sheets) > 1:
            lines.append(f"--- SHEET {sheet_idx + 1} ---")

        total = len(sheet_rows)
        cutoff = min(max_rows_per_sheet, total)
        tail_start = max(cutoff, total - tail_rows)

        for row in sheet_rows[:cutoff]:
            cells = [str(cell).strip() for cell in row]
            if not any(cells):
                global_index += 1
                continue
            lines.append(f"Riga {global_index}: {' | '.join(cells)}")
            global_index += 1

        skipped = tail_start - cutoff
        if skipped > 0:
            lines.append(f"... [{skipped} righe omesse] ...")
            global_index += skipped

        for row in sheet_rows[tail_start:]:
            cells = [str(cell).strip() for cell in row]
            if not any(cells):
                global_index += 1
                continue
            lines.append(f"Riga {global_index}: {' | '.join(cells)}")
            global_index += 1

    return "\n".join(lines)


def ask_claude_to_understand_structure(preview_text: str, filename: str) -> dict:
    """
    Chiede a GPT di identificare tutte le sezioni del file.
    Restituisce {"sections": [...], "file_summary": {...}}.
    """
    prompt = f"""Sei un esperto di documenti aziendali. Analizza questo file
chiamato "{filename}" e identifica TUTTE le sezioni di dati presenti.

Un file può contenere più tabelle o sezioni separate.

CONTENUTO DEL FILE:
{preview_text}

Rispondi SOLO con JSON valido:
{{
  "sections": [
    {{
      "section_name": "nome descrittivo della sezione",
      "header_row_index": <indice riga header o null>,
      "data_row_indices": [<indici esatti delle righe con dati reali>],
      "column_mapping": {{
        "<indice colonna>": "item_code|description|quantity|unit|unit_price|total_price|discount|ignore"
      }},
      "metadata": {{
        "supplier_name": "",
        "document_number": "",
        "document_date": "",
        "total_amount": null
      }},
      "doc_type": "order|invoice|ddt|price_list|packing_list|shipment|confirmation|inventory|unknown",
      "doc_type_confidence": <0-100>,
      "notes": ""
    }}
  ],
  "file_summary": {{
    "<nome campo>": <valore numerico>
  }}
}}

Regole sul column_mapping:
- Mappa OGNI colonna al campo più vicino semanticamente — non usare "ignore"
  a meno che la colonna sia davvero irrilevante (es. colonne vuote, numeri riga)
- Per documenti di spedizione: numero spedizione → item_code, mittente/destinatario
  → description, peso/importo → quantity o total_price

- item_code serve a IDENTIFICARE univocamente un articolo o servizio in modo che
  due documenti diversi possano confrontare la stessa riga. Usalo solo se la colonna
  risponde alla domanda "cosa stiamo comprando/vendendo?":
  ✓ Valido: codici prodotto (FRN-001, SKU-123), codici paese (DE, FR),
            nomi servizio ("Consegna al piano"), numeri spedizione
  ✗ Non valido: misure fisiche (Peso Min Kg, Volume, Distanza),
               valori continui usati come intervalli (0.5, 1.1, 3.1),
               riferimenti ordine quando esiste già una colonna item_code separata,
               indici di riga o numeri progressivi
  Se nessuna colonna è un identificatore genuino, lascia item_code vuoto e usa
  description per il campo più descrittivo della riga
- Per documenti non-standard (tariffari, zone, supplementi, tabelle lookup):
  mappa su unit_price il valore numerico principale se identificabile, usa "ignore"
  per i restanti. I nomi originali delle colonne vengono preservati automaticamente
- Priorità colonne quantità (in ordine): "Total Qty" > "Qty per Box" > altre quantità.
  Mappa SEMPRE "quantity" su "Total Qty" se presente. "Qty per Box" e "Boxes" → "ignore".
  "Weight Kg", "Peso Kg", "Gross Weight", "Net Weight" sono PESI, non quantità → sempre "ignore"
- Se una colonna ha nomi come "Prezzo Scontato" o "Importo Netto" mappala
  su total_price, non su discount

Regole sulle sezioni:
- Crea una sezione separata per ogni fornitore diverso, ogni tipo di documento
  diverso, ogni tabella logicamente indipendente
- NON creare sezioni per dati aggregati o riepilogativi (es. "RIEPILOGO SPEDIZIONE",
  "Totale Colli", "Subtotale", "Grand Total", "Summary"). Questi non sono documenti
  commerciali autonomi — una sezione valida deve contenere righe di prodotti o
  servizi con codici articolo o descrizioni di dettaglio
- Se trovi dati aggregati logistici (totale colli, peso totale, volume, n. pallet),
  mettili in "file_summary" come {{"{{"nome_campo": valore}}}} invece di creare
  una sezione separata. Esempio: {{"Totale Colli": 98, "Peso Kg": 3244, "Volume M3": 7.44}}
- Colonne come "Peso Kg", "Volume M3", "N. Colli" sono dati logistici, NON prezzi
- Escludi da data_row_indices: titoli, header, righe vuote, totali/riepiloghi
- Se il file ha una sola tabella, restituisci sections con un solo elemento
- Non sovrapporre data_row_indices tra sezioni diverse
- Se vedi marcatori "--- SHEET N ---", ogni sheet è un foglio Excel separato
- Se vedi "... [N righe omesse] ...", il file contiene più righe di quelle mostrate;
  le ultime righe visibili dopo il marcatore sono la coda reale del file — usale per
  riconoscere righe di riepilogo/totale da escludere da data_row_indices
- Per documenti con colonne "Qty per Box"/"Quantità per Collo" E "Total Qty"/
  "Quantità Totale", mappa SEMPRE "quantity" sulla colonna del totale,
  non sulla quantità unitaria per collo
- "Prezzo Scontato", "Importo Netto", "Prezzo Finale" → mappa su total_price,
  non su discount. "Sconto %" o "% Sconto" → mappa su discount
"""

    message = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        result = json.loads(raw)
        return {
            "sections": result.get("sections", []),
            "file_summary": result.get("file_summary", {}),
        }
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Struttura non valida: {e}\nRisposta: {raw[:200]}"
        )


def parse_number(value: str) -> float | None:
    if not value:
        return None
    text = value.strip()
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


def extract_rows(
    raw_rows: list[list[Any]],
    data_start: int,
    column_mapping: dict[str, str],
    data_row_indices: list[int] | None = None,
    header_cells: list[str] | None = None,
) -> list[ParsedRow]:
    parsed_rows = []
    row_counter = 0

    for i, row in enumerate(raw_rows):
        if data_row_indices is not None:
            if i not in data_row_indices:
                continue
        else:
            if i < data_start:
                continue

        cells = [str(c).strip() for c in row]
        if not any(cells):
            continue

        fields: dict[str, Any] = {
            "item_code": "",
            "description": "",
            "quantity": None,
            "unit": "",
            "unit_price": None,
            "total_price": None,
            "discount": None,
        }
        raw_data = {}

        for col_idx, field_name in column_mapping.items():
            try:
                cell_value = cells[int(col_idx)]
            except IndexError:
                continue

            if not cell_value:
                continue

            # raw_data contiene SEMPRE tutte le colonne con il nome originale dell'header,
            # incluse quelle mappate a campi standard. È la fonte di verità completa:
            # immune a scelte di mapping di GPT, usata da L2 full-semantic per confrontare
            # per nome colonna originale anziché per tipo campo generico.
            col_name = (
                header_cells[int(col_idx)]
                if header_cells and int(col_idx) < len(header_cells) and header_cells[int(col_idx)]
                else f"col_{col_idx}"
            )
            raw_data[col_name] = cell_value

            if field_name == "ignore":
                continue

            if field_name in ("quantity", "unit_price", "total_price", "discount"):
                fields[field_name] = parse_number(cell_value)
            elif field_name in fields:
                fields[field_name] = cell_value[:500]

        has_data = any([
            fields["item_code"],
            fields["description"],
            fields["quantity"] is not None,
            fields["unit_price"] is not None,
            bool(raw_data),  # righe con soli campi "ignore" ma dati non vuoti (es. "A PREVENTIVO")
        ])
        if not has_data:
            continue

        parsed_rows.append(ParsedRow(
            row_index=row_counter,
            raw_data=raw_data,
            **fields,
        ))
        row_counter += 1

    return parsed_rows


"""
    Riceve un file CSV o Excel di qualsiasi formato e struttura.
    Restituisce uno o più documenti — uno per sezione logica trovata.
    Funziona con qualsiasi lingua, layout, fornitore.
    """
@router.post("/csv", response_model=ParsedDocumentList)
async def parse_csv_excel(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename or "document"

    sheets = read_raw_file(content, filename)
    if not sheets or not any(sheets):
        raise HTTPException(status_code=400, detail="Il file è vuoto.")

    all_rows = []
    for sheet in sheets:
        all_rows.extend(sheet)

    # GPT vede solo le prime 50 righe per capire la struttura
    # ma extract_rows usa TUTTE le righe
    preview = rows_to_text(sheets, max_rows_per_sheet=50)

    # ─── Cache pre-GPT: salta la chiamata se stesso fornitore + stessi header ───
    _pre_supplier = _extract_supplier_hint(all_rows)
    _pre_cached = None
    if _pre_supplier:
        _candidate = max(
            all_rows[:20],
            key=lambda r: sum(1 for c in r if str(c).strip()),
            default=[],
        )
        _pre_headers = [str(c).strip() for c in _candidate]
        if _pre_headers:
            _pre_cached = _cache_col_map_get(_pre_supplier, _pre_headers)

    if _pre_cached:
        gpt_result = {
            "sections": [{
                "section_name": "cache_hit",
                "header_row_index": None,
                "data_row_indices": None,
                "column_mapping": _pre_cached["column_mapping"],
                "metadata": {
                    "supplier_name": _pre_supplier,
                    "document_number": "",
                    "document_date": "",
                    "total_amount": None,
                },
                "doc_type": _pre_cached.get("doc_type", "unknown"),
                "doc_type_confidence": 95,
                "notes": "Struttura letta dalla cache Redis (stesso fornitore + stessi header).",
            }],
            "file_summary": {},
        }
    else:
        gpt_result = ask_claude_to_understand_structure(preview, filename)
    sections = gpt_result["sections"]
    file_summary = gpt_result.get("file_summary", {})

    if not sections:
        raise HTTPException(status_code=422, detail="Nessuna sezione dati trovata.")

    documents = []
    for section in sections:
        column_mapping = {
            str(k): v
            for k, v in section.get("column_mapping", {}).items()
        }

        data_row_indices = section.get("data_row_indices")
        data_start = section.get("data_start_row_index", 0)

        # Auto-estensione solo per file grandi a sezione singola:
        # GPT vede max 50 righe, ma il file ne può avere centinaia.
        # In quel caso prendiamo il primo indice dati e estendiamo
        # fino alla fine del file (GPT non poteva vedere quelle righe).
        # Per file multi-sezione o file piccoli (tutto visibile a GPT)
        # gli indici restituiti da GPT sono già precisi — non toccarli.
        if data_row_indices and len(sections) == 1 and len(all_rows) > 50:
            first_data_row = min(data_row_indices)
            extended_indices = []
            for i in range(first_data_row, len(all_rows)):
                row = all_rows[i]
                cells = [str(c).strip() for c in row]
                if not any(cells):
                    continue
                extended_indices.append(i)
            data_row_indices = extended_indices

        # Estrai la riga header per usare i nomi reali delle colonne in raw_data
        header_row_idx = section.get("header_row_index")
        header_cells = None
        if header_row_idx is not None and int(header_row_idx) < len(all_rows):
            header_cells = [str(c).strip() for c in all_rows[int(header_row_idx)]]

        # ─── Cache post-GPT: salva il mapping per uso futuro ───
        _section_meta = section.get("metadata", {})
        _supplier_for_cache = (
            _section_meta.get("supplier_name", "")
            or _extract_supplier_hint(all_rows)
            or ""
        )
        if header_cells and _supplier_for_cache and not _pre_cached:
            _cache_col_map_set(
                _supplier_for_cache,
                header_cells,
                column_mapping,
                section.get("doc_type", "unknown"),
            )

        rows = extract_rows(
            all_rows,
            data_start=data_start,
            column_mapping=column_mapping,
            data_row_indices=data_row_indices,
            header_cells=header_cells,
        )

        # Scarta sezioni aggregate (nessun item_code, meno di 2 righe):
        # sono footer/riepilogo, non documenti commerciali autonomi
        if len(rows) < 2 and not any(r.item_code for r in rows):
            continue

        metadata = section.get("metadata", {})
        total = metadata.get("total_amount")
        if total is None:
            calculated = sum(r.total_price for r in rows if r.total_price is not None)
            total = round(calculated, 2) if calculated else None

        documents.append(ParsedDocument(
            doc_type=section.get("doc_type", "unknown"),
            supplier_name=metadata.get("supplier_name", ""),
            document_number=metadata.get("document_number", ""),
            document_date=metadata.get("document_date", ""),
            total_amount=total,
            rows=rows,
            raw_extracted={
                "filename": filename,
                "section_name": section.get("section_name", ""),
                "total_rows": len(rows),
                "doc_type_confidence": section.get("doc_type_confidence", 0),
                "structure_notes": section.get("notes", ""),
                "claude_structure": section,
                **({"file_summary": file_summary} if file_summary else {}),
            },
        ))

    return ParsedDocumentList(
        documents=documents,
        total_sections=len(documents),
    )