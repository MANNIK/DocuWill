import anthropic
import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter(prefix="/classify", tags=["Classifier"])

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))


class ClassifyRequest(BaseModel):
    extracted_data: dict[str, Any]
    filename: str = ""


class ClassifyResult(BaseModel):
    doc_type: str
    confidence: int
    reasoning: str


@router.post("/document", response_model=ClassifyResult)
async def classify_document(request: ClassifyRequest):
    """
    Usa Claude per classificare il tipo di documento
    basandosi sui dati estratti.
    """
    prompt = f"""Classifica il tipo di documento aziendale basandoti su questi dati estratti.

Dati estratti:
{json.dumps(request.extracted_data, ensure_ascii=False, indent=2)}

Nome file originale: {request.filename}

Rispondi SOLO con JSON valido:
{{
  "doc_type": "order|invoice|ddt|price_list|packing_list|shipment|confirmation|unknown",
  "confidence": numero da 0 a 100,
  "reasoning": "breve spiegazione della classificazione"
}}
"""

    try:
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )

        clean = message.content[0].text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        data = json.loads(clean)
        return ClassifyResult(**data)

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON non valido: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore classificazione: {str(e)}")