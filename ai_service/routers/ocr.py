import base64
import httpx
import anthropic
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/ocr", tags=["OCR"])

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


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
    """
    Scarica l'immagine e usa Claude Vision per estrarre
    i dati strutturati dal documento fotografato.
    """
    # Scarica l'immagine
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            response = await http.get(request.image_url)
            response.raise_for_status()
            image_data = base64.standard_b64encode(response.content).decode("utf-8")
            content_type = response.headers.get("content-type", "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Impossibile scaricare l'immagine: {e}")

    prompt = """Sei un sistema OCR specializzato in documenti aziendali italiani.
Analizza questa immagine di un documento (fattura, DDT, ordine, tariffario, packing list, ecc.)
ed estrai tutti i dati strutturati.

Rispondi SOLO con un JSON valido, nessun testo prima o dopo, con questa struttura esatta:
{
  "doc_type": "invoice|ddt|order|price_list|packing_list|shipment|confirmation|unknown",
  "supplier_name": "nome fornitore o azienda emittente",
  "document_number": "numero documento",
  "document_date": "data in formato YYYY-MM-DD o stringa originale",
  "total_amount": numero o null,
  "rows": [
    {
      "row_index": 0,
      "item_code": "codice articolo",
      "description": "descrizione prodotto",
      "quantity": numero o null,
      "unit": "pz|kg|l|m|scatola|ecc",
      "unit_price": numero o null,
      "total_price": numero o null,
      "discount": numero percentuale o null
    }
  ],
  "raw_text": "tutto il testo estratto dal documento"
}

Note importanti:
- Se un campo non è presente nel documento, usa null o stringa vuota
- I numeri devono essere float, non stringhe
- Estrai TUTTE le righe della tabella, anche se sono molte
- Per doc_type usa solo i valori elencati sopra
"""

    try:
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": content_type,
                                "data": image_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": prompt + (f"\n\nCaption del mittente: {request.caption}" if request.caption else ""),
                        },
                    ],
                }
            ],
        )

        raw_response = message.content[0].text

        # Pulisci eventuali backtick markdown
        clean = raw_response.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        import json
        data = json.loads(clean)

        return OCRResult(**data)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Claude ha restituito JSON non valido: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore OCR: {str(e)}")