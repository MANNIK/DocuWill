# CLAUDE.md — backend/

## Scopo
Server Django 5.0 + DRF + Celery. Espone `/api/...`, persiste documenti e riconciliazioni in PostgreSQL, delega l'analisi AI al microservizio FastAPI via HTTP, esegue task asincroni con Celery.

## File chiave
- `manage.py` — entrypoint Django; `DJANGO_SETTINGS_MODULE=config.settings.local` (dev) o `config.settings.test` (pytest)
- `Dockerfile` — immagine usata dal servizio `backend` in `docker-compose.yml`
- `requirements.txt` — dipendenze: djangorestframework, simplejwt, cors-headers, httpx, celery, psycopg2, openai, rapidfuzz, django-environ
- `pytest.ini` — `DJANGO_SETTINGS_MODULE=config.settings.test`, testpaths=tests

## Dipendenze cross-folder
- Chiama `ai_service` via `settings.AI_SERVICE_URL` (default `http://ai_service:8001`); non importare mai moduli da `ai_service/`
- Il frontend (`frontend/src/lib/api.ts`) consuma gli endpoint dichiarati in `doc_manager/urls.py`

## Convenzioni
- Una sola app Django: `doc_manager` — non creare app aggiuntive
- Settings split: `base.py` (commons) → `local.py` (dev) → `test.py` (pytest); mai usare `config.settings` direttamente
- Tutte le chiamate HTTP verso `ai_service` avvengono inside Celery tasks, mai inline nelle view
- Importare i modelli Django dentro le funzioni Celery (non a livello modulo) per evitare circular import

## Comandi
```bash
# All'interno del container (o via docker compose exec backend)
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
pytest -v
python manage.py normalize_existing_suppliers  # backfill supplier_canonical
```
