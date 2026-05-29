# CLAUDE.md — scripts/

## Scopo
Script operativi e di test a livello di repo — non fanno parte di nessun container. Si eseguono sulla macchina host con lo stack Docker già avviato.

## File chiave
- `test_agent.py` — runner E2E black-box: autentica contro `http://localhost:8000`, carica tutti i fixture da `~/Desktop/TEST PER QUORO/tests/`, valida estrazioni (`EXPECTED_DOCS`) e riconciliazioni (`EXPECTED_RECONCILIATIONS`), supporta `--reset` (pulisce DB via `/api/dev/reset/`), `--skip-ai`, `--verbose`
- `generate_ocr_docs.py` — genera i file HTML e `discrepanze.md` in `scripts/ocr_test_docs/`; opzionale WeasyPrint per PDF
- `start-worker.sh` — `celery -A config worker` con `DJANGO_SETTINGS_MODULE=config.settings.local`; invocato da `docker-compose.yml` per il servizio `celery_worker`
- `start-beat.sh` — `celery -A config beat`; invocato per `celery_beat`
- `requirements-test.txt` — `httpx`, `openai`, `rich` — solo per `test_agent.py`

## Convenzioni
- `test_agent.py` richiede lo stack avviato (`docker compose up`) e `pip install -r scripts/requirements-test.txt` sulla macchina host
- I fixture CSV non sono committed nel repo — vivono in `~/Desktop/TEST PER QUORO/tests/` (8 file challenge + 10 file sintetici p1-p5 + 3 screenshot OCR in `files/`)
- Gli sh script assumono di essere eseguiti con CWD = `backend/` (referenziano `config.settings.local`)
- `test_agent.py` è standalone: non importare da `backend/` o `ai_service/`

## Comandi
```bash
pip3 install -r scripts/requirements-test.txt
python3 scripts/test_agent.py --reset --skip-ai --verbose
python3 scripts/generate_ocr_docs.py
```
