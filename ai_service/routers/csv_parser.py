import io
import json
import os
import anthropic
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/parse", tags=["CSV Parser"])
client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


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


def read_raw_file(content: bytes, filename: str) -> list[list[Any]]:
    """
    Legge il file senza assumere niente sulla struttura.
    Restituisce una lista di righe grezze.
    """
    try:
        if filename.endswith(".csv"):
            for encoding in ["utf-8", "latin-1", "cp1252"]:
                try:
                    df = pd.read_csv(
                        io.BytesIO(content),
                        header=None,
                        encoding=encoding,
                        dtype=str,  # tutto come stringa, nessuna conversione automatica
                    )
                    return df.fillna("").values.tolist()
                except UnicodeDecodeError:
                    continue
            raise HTTPException(status_code=400, detail="Encoding del file non riconoscibile.")

        elif filename.endswith((".xlsx", ".xls")):
            xls = pd.ExcelFile(io.BytesIO(content))
            all_rows = []
            for sheet in xls.sheet_names:
                df = pd.read_excel(
                    io.BytesIO(content),
                    sheet_name=sheet,
                    header=None,
                    dtype=str,
                )
                sheet_rows = df.fillna("").values.tolist()
                all_rows.extend(sheet_rows)
            return all_rows

        else:
            raise HTTPException(
                status_code=400,
                detail="Formato non supportato. Usa CSV, XLSX o XLS."
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore lettura file: {e}")


def rows_to_text(raw_rows: list[list[Any]], max_rows: int = 30) -> str:
    """
    Converte le prime N righe in testo tabellare leggibile da Claude.
    """
    lines = []
    for i, row in enumerate(raw_rows[:max_rows]):
        cells = [str(cell).strip() for cell in row]
        # Salta righe completamente vuote
        if not any(cells):
            continue
        lines.append(f"Riga {i}: {' | '.join(cells)}")
    return "\n".join(lines)


def ask_claude_to_understand_structure(preview_text: str, filename: str) -> dict:
    """
    Manda l'anteprima del file a Claude e chiede di capire la struttura.
    Claude restituisce: quale riga è l'header, il mapping delle colonne,
    i metadati del documento, e il tipo di documento.
    """
    prompt = f"""Sei un esperto di documenti aziendali. Ti mostro le prime righe di un file
chiamato "{filename}". Analizza la struttura e restituisci le informazioni richieste.

CONTENUTO DEL FILE:
{preview_text}

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{{
  "header_row_index": <numero della riga che contiene le intestazioni delle colonne, o null se non c'è>,
  "data_start_row_index": <numero della prima riga con dati veri (dopo l'header)>,
  "column_mapping": {{
    <indice colonna come stringa>: "item_code|description|quantity|unit|unit_price|total_price|discount|ignore"
  }},
  "metadata": {{
    "supplier_name": "<nome fornitore/azienda se presente, altrimenti stringa vuota>",
    "document_number": "<numero documento se presente, altrimenti stringa vuota>",
    "document_date": "<data documento in formato YYYY-MM-DD se presente, altrimenti stringa vuota>",
    "total_amount": <totale documento come numero se presente, altrimenti null>
  }},
  "doc_type": "order|invoice|ddt|price_list|packing_list|shipment|confirmation|unknown",
  "doc_type_confidence": <numero da 0 a 100>,
  "notes": "<eventuali osservazioni sulla struttura del file>"
}}

Regole:
- column_mapping deve coprire TUTTE le colonne presenti (usa "ignore" per quelle non rilevanti)
- Le colonne vengono identificate per indice numerico (0, 1, 2, ...)
- Se ci sono più sheet o sezioni, considera quella principale con i dati di riga
- Se il totale è nelle righe finali (es. "Totale: 1234.56"), estrailo nei metadata
- Non inventare dati: se un campo non è presente, lascialo vuoto o null
"""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Rimuovi eventuali backtick markdown
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Claude ha restituito una struttura non valida: {e}\nRisposta: {raw[:200]}"
        )


def extract_rows(
    raw_rows: list[list[Any]],
    data_start: int,
    column_mapping: dict[str, str],
) -> list[ParsedRow]:
    """
    Usa il mapping fornito da Claude per estrarre le righe dati.
    """
    parsed_rows = []
    row_counter = 0

    for i, row in enumerate(raw_rows):
        if i < data_start:
            continue

        # Salta righe completamente vuote
        cells = [str(c).strip() for c in row]
        if not any(cells):
            continue

        # Costruisci i campi standard dal mapping
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

            raw_data[f"col_{col_idx}"] = cell_value

            if field_name == "ignore" or not cell_value:
                continue

            if field_name in ("quantity", "unit_price", "total_price", "discount"):
                fields[field_name] = parse_number(cell_value)
            elif field_name in fields:
                fields[field_name] = cell_value[:500]

        # Salta righe che sembrano totali/riepilogo
        desc = fields.get("description", "").lower()
        if any(k in desc for k in ["totale", "subtotale", "grand total", "subtotal"]):
            continue

        # Salta righe senza nessun dato utile
        has_data = any([
            fields["item_code"],
            fields["description"],
            fields["quantity"] is not None,
            fields["unit_price"] is not None,
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


def parse_number(value: str) -> float | None:
    """
    Converte una stringa in numero gestendo formati europei e americani.
    Lascia fare a Python, non a keyword.
    """
    if not value:
        return None
    text = value.strip()
    # Rimuovi simboli valuta, spazi, caratteri non numerici tranne , . -
    import re
    text = re.sub(r"[€$£\s%]", "", text)
    if not text or text in ("-", "N/A", "n/a"):
        return None
    # Formato europeo: 1.234,56
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


@router.post("/csv", response_model=ParsedDocument)
async def parse_csv_excel(file: UploadFile = File(...)):
    """
    Riceve un file CSV o Excel di qualsiasi formato e struttura.
    Usa Claude per capire la struttura del documento, poi estrae i dati.
    Funziona con qualsiasi lingua, layout, fornitore.
    """
    content = await file.read()
    filename = file.filename or "document"

    # 1. Leggi il file grezzo senza assumere niente
    raw_rows = read_raw_file(content, filename)

    if not raw_rows:
        raise HTTPException(status_code=400, detail="Il file è vuoto.")

    # 2. Prepara anteprima per Claude (prime 30 righe)
    preview = rows_to_text(raw_rows, max_rows=30)

    # 3. Chiedi a Claude di capire la struttura
    structure = ask_claude_to_understand_structure(preview, filename)

    # 4. Estrai le righe usando il mapping di Claude
    data_start = structure.get("data_start_row_index", 1)
    column_mapping = {
        str(k): v
        for k, v in structure.get("column_mapping", {}).items()
    }

    rows = extract_rows(raw_rows, data_start, column_mapping)

    # 5. Calcola totale se non già nei metadata
    metadata = structure.get("metadata", {})
    total = metadata.get("total_amount")
    if total is None:
        calculated = sum(r.total_price for r in rows if r.total_price is not None)
        total = calculated if calculated else None

    return ParsedDocument(
        doc_type=structure.get("doc_type", "unknown"),
        supplier_name=metadata.get("supplier_name", ""),
        document_number=metadata.get("document_number", ""),
        document_date=metadata.get("document_date", ""),
        total_amount=total,
        rows=rows,
        raw_extracted={
            "filename": filename,
            "total_rows": len(rows),
            "doc_type_confidence": structure.get("doc_type_confidence", 0),
            "structure_notes": structure.get("notes", ""),
            "claude_structure": structure,
        },
    )