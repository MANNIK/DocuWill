import base64
import json
import os
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from openai import OpenAI
from pydantic import BaseModel

router = APIRouter(prefix="/ocr", tags=["OCR"])
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

_MIME_MAP = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


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
      "unit": "pz|kg|l|m|spedizione|ecc",
      "unit_price": numero o null,
      "total_price": numero o null,
      "discount": numero o null
    }
  ],
  "raw_text": "tutto il testo estratto"
}

Regole per documenti standard (ordini, fatture, DDT, packing list):
- quantity: usa SEMPRE la colonna della quantità TOTALE (QTÀ TOTALE, Total Qty, Pezzi Totali).
  Ignora COLLI, QTÀ/COLLO, Qty per Box — sono dati logistici, non la quantità ordinata.
  Regola pratica: se vedi COLLI + QTÀ/COLLO + QTÀ TOTALE, usa solo QTÀ TOTALE.
- item_code: usa SKU/Cod. Art., non numeri di riga o riferimenti ordine.

Regole per tariffari e listini prezzi (doc_type: price_list):
- Se il documento è una tabella tariffaria a matrice (es. fasce di peso × zone/servizi),
  espandi ogni combinazione fascia-servizio in una riga separata.
  Esempio: tariffario con ZONA A, ZONA B e fasce 0-1kg, 1-3kg → genera una riga per ogni cella.
- item_code: codice compatto della combinazione, es. "ZONA-A-0.5-1.0" o "STD-1-3".
- description: descrizione leggibile, es. "Standard Conv. — Zona A, 0.5÷1.0 kg".
- unit_price: il prezzo negoziato/scontato (colonna "Conv.", "Clienti", "Scontato") se presente,
  altrimenti il prezzo base.
- unit: "spedizione" per tariffe a collo/spedizione, "kg" per tariffe al kg.
- quantity: null (le tariffe non hanno quantità).
- discount: percentuale di sconto applicata, se indicata esplicitamente (es. –8%).
- Estrai TUTTE le righe della matrice — non fermarti alla prima zona o alla prima fascia."""

    try:
        message = client.chat.completions.create(
            model="gpt-4o",
            max_tokens=8192,
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


@router.post("/upload", response_model=OCRResult)
async def ocr_upload(file: UploadFile = File(...)):
    """Accetta un file immagine direttamente (jpg, png, webp) — simula il flusso WhatsApp senza URL pubblico."""
    content = await file.read()
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    mime = _MIME_MAP.get(ext, "image/jpeg")
    data_url = f"data:{mime};base64,{base64.b64encode(content).decode()}"

    # Riusa esattamente la stessa logica di /ocr/image passando il data-URI come URL
    fake_request = OCRRequest(image_url=data_url)
    return await ocr_image(fake_request)