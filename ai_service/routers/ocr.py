# Sostituisci tutto il file con questo
import os
from openai import OpenAI
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
import json

router = APIRouter(prefix="/ocr", tags=["OCR"])
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


class OCRRequest(BaseModel):
    image_url: str
    caption: str = ""


class OCRResult(BaseModel):
    doc_type: str
    supplier_name: str = ""
    document_number: str = ""
    document_date: str = ""
    total_amount: float | None = None
    rows: list[dict[str, Any]] = []
    raw_text: str = ""


@router.post("/image", response_model=OCRResult)
async def ocr_image(request: OCRRequest):
    prompt = """Sei un sistema OCR specializzato in documenti aziendali italiani.
Analizza questa immagine di un documento (fattura, DDT, ordine, tariffario, ecc.)
ed estrai tutti i dati strutturati.

Rispondi SOLO con JSON valido, nessun testo prima o dopo:
{
  "doc_type": "invoice|ddt|order|price_list|packing_list|shipment|confirmation|unknown",
  "supplier_name": "nome fornitore",
  "document_number": "numero documento",
  "document_date": "YYYY-MM-DD o stringa originale",
  "total_amount": numero o null,
  "rows": [
    {
      "row_index": 0,
      "item_code": "codice",
      "description": "descrizione",
      "quantity": numero o null,
      "unit": "pz|kg|l|m|ecc",
      "unit_price": numero o null,
      "total_price": numero o null,
      "discount": numero o null
    }
  ],
  "raw_text": "tutto il testo estratto"
}"""

    try:
        message = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": request.image_url},
                        },
                        {
                            "type": "text",
                            "text": prompt + (f"\n\nCaption: {request.caption}" if request.caption else ""),
                        },
                    ],
                }
            ],
        )

        raw = message.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)
        return OCRResult(**data)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON non valido: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore OCR: {str(e)}")