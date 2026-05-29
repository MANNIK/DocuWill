# CLAUDE.md — ai_service/

## Scopo
Microservizio FastAPI stateless per l'analisi AI. Non ha DB proprio — usa solo Redis DB 2 per la cache column-mapping. Viene chiamato esclusivamente dal backend Django (Celery task).

## File chiave
- `main.py` — app FastAPI; monta i router `csv_parser`, `ocr`, `classifier`; endpoint `/health`
- `Dockerfile` — immagine; uvicorn con `--reload` in dev
- `requirements.txt` — FastAPI, uvicorn, openai, pandas, redis, rapidfuzz, pillow
- `pytest.ini` — pytest config per il servizio

## Dipendenze cross-folder
- Espone `/parse/csv`, `/ocr/image`, `/ocr/upload`, `/classify/document` — consumati da `backend/doc_manager/tasks.py` via `settings.AI_SERVICE_URL`
- `utils/supplier.py` DEVE restare sincronizzato con `backend/doc_manager/utils.py` (KEEP IN SYNC)

## Convenzioni
- Stateless: nessun stato in-process tra request; tutta la persistenza è Redis o passata come risposta
- Ogni nuovo router va registrato in `main.py` con `app.include_router(router)`
- `OPENAI_API_KEY` letta da `os.environ` — non hardcoded
- Redis DB 2 per column-mapping cache: key `col_map:<supplier_hash[:12]>:<headers_hash[:12]>`, TTL 30 giorni

## Comandi
```bash
# Dentro il container
uvicorn main:app --reload --host 0.0.0.0 --port 8001
pytest -v
```
