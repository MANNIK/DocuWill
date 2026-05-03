import io
import json
import os
import re
from openai import OpenAI
import pandas as pd
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/parse", tags=["CSV Parser"])
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


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
            return rows

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
                all_rows.extend(df.fillna("").values.tolist())
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


def rows_to_text(raw_rows: list[list[Any]], max_rows: int = 50) -> str:
    lines = []
    for i, row in enumerate(raw_rows[:max_rows]):
        cells = [str(cell).strip() for cell in row]
        if not any(cells):
            continue
        lines.append(f"Riga {i}: {' | '.join(cells)}")
    return "\n".join(lines)


def ask_claude_to_understand_structure(preview_text: str, filename: str) -> list[dict]:
    """
    Chiede a GPT di identificare tutte le sezioni del file.
    Restituisce una lista di strutture — una per sezione.
    """
    prompt = f"""Sei un esperto di documenti aziendali. Analizza questo file
chiamato "{filename}" e identifica TUTTE le sezioni di dati presenti.

Un file può contenere più tabelle o sezioni separate — per esempio
ordini di fornitori diversi, o una tabella dati + una tabella riepilogo.

CONTENUTO DEL FILE:
{preview_text}

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
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
      "doc_type": "order|invoice|ddt|price_list|packing_list|shipment|confirmation|unknown",
      "doc_type_confidence": <0-100>,
      "notes": ""
    }}
  ]
}}

Regole:
- Crea una sezione separata per ogni fornitore diverso, ogni tipo di documento diverso,
  ogni tabella logicamente indipendente
- Escludi da data_row_indices: titoli, header, righe vuote, totali/riepiloghi
- Se il file ha una sola tabella, restituisci sections con un solo elemento
- Le sezioni di riepilogo sono sezioni separate solo se contengono dati utili,
  altrimenti ignorale
- Non sovrapporre data_row_indices tra sezioni diverse
- Per documenti con colonne "Qty per Box" e "Total Qty", mappa sempre
  "quantity" sulla colonna del totale (Total Qty/Qtà Totale), non sulla
  quantità unitaria per collo
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
        return result.get("sections", [])
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

            raw_data[f"col_{col_idx}"] = cell_value

            if field_name == "ignore" or not cell_value:
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


@router.post("/csv", response_model=ParsedDocumentList)
async def parse_csv_excel(file: UploadFile = File(...)):
    """
    Riceve un file CSV o Excel di qualsiasi formato e struttura.
    Restituisce uno o più documenti — uno per sezione logica trovata.
    Funziona con qualsiasi lingua, layout, fornitore.
    """
    content = await file.read()
    filename = file.filename or "document"

    # 1. Leggi il file grezzo senza assumere niente
    raw_rows = read_raw_file(content, filename)
    if not raw_rows:
        raise HTTPException(status_code=400, detail="Il file è vuoto.")

    # 2. Anteprima per GPT
    preview = rows_to_text(raw_rows, max_rows=50)

    # 3. GPT identifica tutte le sezioni
    sections = ask_claude_to_understand_structure(preview, filename)
    if not sections:
        raise HTTPException(status_code=422, detail="Nessuna sezione dati trovata nel file.")

    # 4. Crea un ParsedDocument per ogni sezione
    documents = []
    for section in sections:
        column_mapping = {
            str(k): v
            for k, v in section.get("column_mapping", {}).items()
        }

        rows = extract_rows(
            raw_rows,
            data_start=section.get("data_start_row_index", 0),
            column_mapping=column_mapping,
            data_row_indices=section.get("data_row_indices"),
        )

        metadata = section.get("metadata", {})
        total = metadata.get("total_amount")
        if total is None:
            calculated = sum(r.total_price for r in rows if r.total_price is not None)
            total = calculated if calculated else None

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
            },
        ))

    return ParsedDocumentList(
        documents=documents,
        total_sections=len(documents),
    )