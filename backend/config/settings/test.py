import os

# Impostare PRIMA di importare base (che legge solo da os.environ, senza read_env)
os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key-not-for-production")
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/wewill_test.db")
os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6379/0")
os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
os.environ.setdefault("AI_SERVICE_URL", "http://localhost:8001")
os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")
os.environ.setdefault("AI_SERVICE_TOKEN", "test-internal-token")

from .base import *  # noqa: F401, E402

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Cache in-memory per i test: i test non dipendono da Redis e i throttle DRF
# usano LocMemCache invece che Redis (ogni processo ha la propria cache —
# non si «pestano» tra test paralleli).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Rate limit altissimi nei test: non vogliamo che i test siano bloccati dal throttle.
# Sovrascrivono i valori da env impostati in base.py.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # type: ignore[index]
    "anon": "10000/day",
    "user": "10000/day",
    "upload_burst": "10000/day",
    "register": "10000/day",
    "webhook": "10000/day",
}

# Non applicare security headers in test (niente HTTPS, HSTS, ecc.)
SECURE_SSL_REDIRECT = False
