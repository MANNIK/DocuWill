"""
Throttle DRF dedicati agli endpoint che innescano chiamate LLM costose.

Ogni classe usa uno `scope` proprio, le cui frequenze sono definite in
`REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]` (config/settings/base.py) e
sovrascrivibili da env. Lo stato dei contatori vive nella cache Redis (DB 3),
condivisa tra processi — vedi `CACHES` in base.py.

Difesa a due livelli contro lo spam di documenti:
  • throttle in frequenza (queste classi)  → blocca i burst
  • quota giornaliera persistente per utente (views.py) → blocca il volume
"""
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class UploadBurstThrottle(UserRateThrottle):
    """Limite di burst sugli upload (CSV/Excel/immagini) per utente autenticato."""
    scope = "upload_burst"


class RegisterThrottle(AnonRateThrottle):
    """Limita la creazione di account dallo stesso IP — anti mass-registration."""
    scope = "register"


class WebhookThrottle(AnonRateThrottle):
    """Limita le chiamate al webhook WhatsApp (per IP) — ogni media innesca OCR+LLM."""
    scope = "webhook"


class LoginBurstThrottle(AnonRateThrottle):
    """Limita i tentativi di login per IP — anti brute-force / credential stuffing."""
    scope = "login"
