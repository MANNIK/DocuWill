# CLAUDE.md — backend/config/

## Scopo
Package di configurazione del progetto Django: impostazioni (settings package), URL root, ASGI/WSGI, e applicazione Celery.

## File chiave
- `urls.py` — URL root: monta `admin/`, JWT (`api/auth/token/`, `api/auth/token/refresh/`), `api/auth/register/`, e `api/` → `doc_manager.urls`
- `celery.py` — app Celery `wewill`; `autodiscover_tasks()` trova `doc_manager/tasks.py`
- `__init__.py` — importa `celery.app` perché `@shared_task` funzioni a livello di app
- `asgi.py` / `wsgi.py` — standard, puntano a `config.settings.local`

## Dipendenze cross-folder
- `settings/` è un package separato — vedi `backend/config/settings/CLAUDE.md`
- Non importare mai da `doc_manager` qui per evitare circular import

## Convenzioni
- Aggiungere nuovi URL di `doc_manager` in `doc_manager/urls.py`, non qui
- Il prefix `/api/` è montato qui; `doc_manager/urls.py` definisce i path relativi
- Celery non ha beat schedule hardcoded qui — le periodic task sono configurate nell'admin

## Comandi
```bash
celery -A config worker --loglevel=info
celery -A config beat --loglevel=info
```
