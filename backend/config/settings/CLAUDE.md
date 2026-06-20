# CLAUDE.md — backend/config/settings/

## Scopo
Package di settings Django in tre livelli: `base` (shared production-safe), `local` (dev), `test` (pytest con SQLite in-memory).

## File chiave
- `base.py` — legge env via `django-environ`; dichiara `AI_SERVICE_URL`, JWT, CORS, DRF, Celery, MEDIA_URL/MEDIA_ROOT, Twilio (opzionali)
- `local.py` — `from .base import *`; DEBUG=True, ALLOWED_HOSTS=["*"]
- `test.py` — set env vars PRIMA di importare base, poi `from .base import *`; SQLite in-memory, `CELERY_TASK_ALWAYS_EAGER=True`, `CELERY_TASK_EAGER_PROPAGATES=True`

## Convenzioni
- **Ordine critico in `test.py`**: `os.environ.setdefault(...)` deve precedere `from .base import *` perché `base.py` legge `os.environ` all'importazione
- Non aggiungere secret hardcoded in nessun file di settings — usare `env("KEY")` da `django-environ`
- `AI_SERVICE_URL` default è `http://ai_service:8001` (hostname Docker compose)
- Redis DB allocation: DB 0 = Celery broker, DB 1 = embedding cache, DB 2 = CSV column-mapping cache, DB 3 = Django `CACHES` (contatori throttle)

## Comandi
```bash
# Verificare che test.py carichi correttamente
DJANGO_SETTINGS_MODULE=config.settings.test python manage.py check
```
