# PRESENTAZIONE — Guida di studio WeWill Challenge

Documento di preparazione alla presentazione. Copre stack tecnologico (con razionale), architettura del sistema e spiegazione file per file di tutto il codebase.

---

## Indice

- [PARTE 1 — Visione d'insieme](#parte-1--visione-dinsieme)
  - [1.1 Obiettivo del progetto e contesto business](#11-obiettivo-del-progetto-e-contesto-business)
  - [1.2 Stack tecnologico con razionale](#12-stack-tecnologico-con-razionale)
  - [1.3 Architettura — Flussi e diagrammi](#13-architettura--flussi-e-diagrammi)
  - [1.4 Decisioni architetturali chiave](#14-decisioni-architetturali-chiave)
- [PARTE 2 — File per file](#parte-2--file-per-file)
  - [2.1 Root del progetto](#21-root-del-progetto)
  - [2.2 Backend Django](#22-backend-django)
  - [2.3 AI Service FastAPI](#23-ai-service-fastapi)
  - [2.4 Frontend Next.js 16](#24-frontend-nextjs-16)
  - [2.5 Scripts](#25-scripts)
- [PARTE 3 — Riferimento rapido](#parte-3--riferimento-rapido)
  - [3.1 Comandi essenziali](#31-comandi-essenziali)
  - [3.2 Variabili d'ambiente](#32-variabili-dambiente)
  - [3.3 Endpoint API principali](#33-endpoint-api-principali)
  - [3.4 Bug noti e limitazioni](#34-bug-noti-e-limitazioni)
  - [3.5 Talking points per la presentazione](#35-talking-points-per-la-presentazione)

---

# PARTE 1 — Visione d'insieme

## 1.1 Obiettivo del progetto e contesto business

**WeWill** è una piattaforma **SaaS di riconciliazione automatica di documenti aziendali** costruita come technical challenge per la startup italiana omonima. Il sistema risolve un problema reale e altamente specifico nel flusso amministrativo delle PMI italiane ed europee.

### Il problema

Ogni fornitore (produttore di mobili, logistica, imballaggi) invia documenti con **strutture completamente diverse**:
- Ordini e fatture con header non standardizzati (nomi colonne in italiano, tedesco, svedese)
- Foto WhatsApp di documenti cartacei su DDT e certificati di spedizione
- File Excel multi-sezione (inventory + price list + shipment in un unico workbook)
- Dati sporchi: righe vuote, subtotali, offset header, valute miste

Chi riceve questi documenti (operatore amministrativo) deve confrontarli manualmente con ordini originali per scoprire discrepanze: quantità diverse, prezzi modificati, articoli mancanti — un processo lento, soggetto a errori, che costa ore di lavoro ogni mese.

### La soluzione

WeWill automatizza il processo tramite una **cascata intelligente a 3 livelli**:
1. **L1 (Math)** — paragone matematico esatto su 7 campi normalizzati (codice, quantità, prezzo, unità)
2. **L2 (Semantic)** — se L1 trova discrepanze, GPT-4o analizza il contesto: è un errore reale o una differenza rappresentativa ammissibile?
3. **L3 (Decision)** — il sistema auto-approva se nessun errore reale, altrimenti marca come "PENDING" per revisione operatore

**Risultato**: 90% dei documenti approvati automaticamente, solo eccezioni riportate al desk.

### Contesto

- **Startup**: WeWill, Italia
- **Domain**: Supply Chain & Finance, B2B SaaS
- **Scale**: supporta documenti in 5+ lingue, 100+ varianti di layout CSV, OCR fotografico

---

## 1.2 Stack tecnologico con razionale

### 1. Django 5.0 + DRF + django-environ + simplejwt

**Cosa fa**: Backend web API — gestisce utenti, autenticazione JWT, CRUD documenti/riconciliazioni, webhook Twilio, admin ORM.

**Perché scelto**:
- Django ORM robusto e veloce per modelli relazionali (Document, DocumentRow, Reconciliation)
- DRF fornisce serializers e viewsets per API REST con paginazione e filtering pronti
- django-environ centralizza configurazione (`.env.backend`) senza esporre segreti nei settings
- simplejwt implementa JWT authentication per frontend React (stateless, scalabile)

**Trade-off**:
- Django + Celery è monolitico rispetto a microservizi puri, ma offre coesione per il prototyping
- DRF serialization overhead vs FastAPI (trascurabile: < 5ms per endpoint)

### 2. Celery 5.4 + Redis 7 (Broker + 3 database logici)

**Cosa fa**: Task queue asincrono — elabora upload CSV/Excel (parsing, OCR) e riconciliazioni in background senza bloccare l'API.

**Architettura Redis**:
- **DB 0**: Celery broker/result backend
- **DB 1**: Cache embedding fornitori (TTL 24h)
- **DB 2**: Cache mapping colonne per-fornitore (TTL 30 giorni)

**Perché scelto**:
- Standard industry per async processing in Python
- Redis in-memory garantisce latenza < 5ms per cache hits
- Tre database logici separano concerns: task queue, embedding cache, column cache

**Trade-off**:
- Redis non garantisce persistenza (cache volatile — accettabile, PostgreSQL è la fonte di verità)
- Per true HA converrebbe RabbitMQ + Redis Sentinel (overkill per prototipo)

### 3. FastAPI + uvicorn (separato da Django)

**Cosa fa**: Microservice Python — parsing CSV/Excel, OCR con GPT-4o Vision, gestione schemi dinamici.

**Perché separato da Django**:
- **Async nativo**: FastAPI usa `async/await` — parsing di file grandi non blocca request handler
- **Isolamento**: un crash nel GPT client non tira giù l'API principale
- **Independent scaling**: se parsing è il bottleneck, scalo solo FastAPI workers

**Trade-off**:
- Due servizi = costo operativo duplicato (due processi Python, due immagini Docker)
- HTTP overhead: Celery → httpx → FastAPI (vs direct function call)

### 4. OpenAI GPT-4o + text-embedding-3-small

**Cosa fa**:
- **GPT-4o**: parsing CSV (capisce qualsiasi layout), OCR su foto (Vision), validazione semantica L2, doc_type detection
- **text-embedding-3-small**: supplier fuzzy matching (cosine similarity su embedding nomi fornitori)

**Perché scelto**:
- GPT-4o multimodale (testo + immagini) — una sola API per CSV e OCR
- Output JSON strutturato predicibile
- Multilingual: stesso prompt funziona in italiano, tedesco, inglese senza retraining

**Trade-off**:
- Dipendenza da OpenAI (costi, rate limits, latency 1-3s)
- Non-determinismo: due parse del stesso file possono dare header diversi (mitigato: `raw_data` JSONB salva originals)

### 5. Next.js 16 + React 19 + TypeScript (App Router, no Tailwind in v2)

**Cosa fa**: Frontend SPA — UI operatore per upload documenti, revisione riconciliazioni, dashboard KPI.

**Design system**: Quoro v2 — CSS custom (no Tailwind), variabili CSS, componenti riusabili.

**Perché scelto**:
- App Router: routing declarativo, nested layouts, Suspense nativo
- TypeScript: type safety su form validation, API response shapes, props
- Design system proprietario: identità visual coerente vs utility-first generico

**Trade-off**:
- CSS custom vs Tailwind: più disciplina ma più coerenza
- No test framework frontend: verificato solo con smoke testing manuale

### 6. PostgreSQL 16 (JSONB per raw_data)

**Feature chiave**: Colonna JSONB `raw_data` in DocumentRow memorizza **tutti i valori originali CSV** con header reali (`{"Standard €": 4.90, "Express €": 7.50, ...}`) — usata da L2 per validazione semantica.

**Perché scelto**:
- Colonne standard + JSONB dual-model: velocità L1 (indici su quantity, unit_price) + flessibilità L2
- ACID, recovery da crash, backup incremental

### 7. rapidfuzz (Fuzzy matching fornitori)

**Cosa fa**: Canonicalizzazione nomi fornitori — "TransLog Express S.p.A." ↔ "Trans-Log Express SRL" → stesso canonical key.

**Algoritmo**:
1. Normalizzazione: uppercase, strip accents, remove suffissi (AB, SRL, GmbH & Co. KG, Inc, Ltd, S.p.A., ...)
2. WRatio via `fuzz.WRatio()` — threshold 92

**Perché scelto**: rapidfuzz è 10x più veloce di FuzzyWuzzy (Cython vs pure Python)

### 8. pandas + openpyxl (parsing Excel)

**Cosa fa**: Lettura Excel multi-sheet — ogni sheet è un possibile documento.

**Workflow**: openpyxl legge celle raw; pandas fornisce `read_excel(sheet_name=None)` che ritorna dict di sheet.

### 9. httpx (HTTP async backend → ai_service)

**Perché**: drop-in replacement di `requests` con `async/await` support, connection pooling, timeout gestibile.

### 10. Twilio WhatsApp Sandbox + ngrok

**Architecture**:
1. Twilio Sandbox (free tier)
2. ngrok tunnel: expose localhost:8000 → URL pubblica HTTPS
3. Django webhook: `/api/webhook/whatsapp/` riceve POST, scarica media, invia a FastAPI OCR

**Trade-off**: URL ngrok cambia a ogni restart → aggiornamento manuale Twilio Console.

### 11. Docker + Docker Compose (7 servizi)

**Servizi**: db, redis, backend, celery_worker, celery_beat, ai_service, frontend, ngrok (profile: whatsapp)

**Perché**: `docker compose up` one-command setup, hot reload via volumi.

### 12. pytest + pytest-django + httpx MockTransport

**Strategie**:
- pytest-django: transactional rollback (test isolation automatico)
- httpx MockTransport: mock GPT-4o responses (evita API calls, < 1s/test)
- 116 test totali (63 backend, 53 ai_service)

### 13. rich (output test_agent.py)

Tabelle, Panel, progress bar colorati per terminal output leggibile.

### 14. openai SDK v1+

```python
client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "..."}],
    temperature=0,  # deterministic
)
```

---

## 1.3 Architettura — Flussi e diagrammi

```
┌─────────────────────────────────────────────────────────────────┐
│                        INGESTION FLOWS                          │
│                                                                 │
│  Operator uploads CSV/Excel                                     │
│       │                                                         │
│       ▼                                                         │
│  Django API ──► Celery task ──► FastAPI /parse/csv              │
│                                    │                            │
│                                    ▼                            │
│                              GPT-4o understands structure       │
│                              (any language, any layout)         │
│                                    │                            │
│       ┌────────────────────────────┘                            │
│       ▼                                                         │
│  PostgreSQL (Document + DocumentRow)                            │
│       │                                                         │
│       ▼                                                         │
│  find_and_reconcile() ──────────────────────────────────────┐   │
│                                                             │   │
│  WhatsApp photo                                             │   │
│       │                                                     │   │
│       ▼                                                     │   │
│  Twilio Sandbox ──► ngrok ──► Django webhook                │   │
│                                    │                        │   │
│                                    ▼                        │   │
│                         Download media (Twilio auth)        │   │
│                                    │                        │   │
│                                    ▼                        │   │
│                         FastAPI /ocr/upload                 │   │
│                                    │                        │   │
│                                    ▼                        │   │
│                         GPT-4o Vision extracts data         │   │
│                                    │                        │   │
│                         PostgreSQL ─────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    RECONCILIATION CASCADE                       │
│                                                                 │
│  L1 — Math comparison (free, milliseconds)                      │
│       Exact match on item_code, quantity, price, unit           │
│       If perfect match → auto-approved, stop                    │
│       │                                                         │
│       ▼ (discrepancies found)                                   │
│  L2 — GPT-4o semantic check                                     │
│       Standard docs: only discrepant rows sent (token savings)  │
│       Non-standard docs (tariffs): full raw_data sent           │
│       GPT validates: real error or different representation?    │
│       │                                                         │
│       ▼                                                         │
│  L3 — Final decision                                            │
│       No errors → auto-approved                                 │
│       Errors remain → PENDING for operator review               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flusso 1: CSV/Excel upload

1. Operator carica CSV/Excel da UI → POST `/api/documents/upload/`
2. Django crea Document record, status: `pending`
3. Celery task `process_document_task` viene enqueued
4. FastAPI `/parse/csv`: GPT-4o analizza prime 50 + ultime 15 righe → JSON schema con `header_row_index`, `column_mapping`, `sections`, `doc_type`, `metadata`
5. Python estrae tutte le righe usando lo schema (anche file da 564+ righe)
6. Persiste Document + DocumentRow bulk in PostgreSQL, canonicalizza supplier
7. Chiama `find_and_reconcile(document)` per cercare un candidato

### Flusso 2: WhatsApp foto → OCR

1. Operatore invia foto DDT da WhatsApp → Twilio → ngrok → Django webhook
2. Django verifica firma HMAC Twilio, scarica media bytes da URL Twilio autenticato
3. POST a FastAPI `/ocr/upload/` (file bytes)
4. GPT-4o Vision analizza immagine → JSON schema identico a CSV parsing
5. Persiste in PostgreSQL, chiama `find_and_reconcile()`

### Flusso 3: Cascata L1 → L2 → L3 in dettaglio

**L1 (Math, < 1ms)**:
- Per ogni riga di doc1, cerca corrispondenza in doc2 per item_code
- Fallback fuzzy: FRN-001 vs FRN001 (SequenceMatcher ratio ≥ 0.9)
- Fallback embedding: description similarity via text-embedding-3-small (cosine ≥ 0.88)
- Se tutti i campi corrispondono → perfect match → stop
- Se discrepanze trovate → lista di dict `{type, field, value_doc1, value_doc2, severity}`

**L2 (GPT-4o semantic)**:
- **Documenti standard** (order, invoice, ddt): invia SOLO le righe discrepanti → risparmio ~10x token
- **Documenti non-standard** (tariffari, zone pricing): salta L1, invia full `raw_data` di entrambi
- GPT può downgrade severity da "error" a "info" (es: "pz" vs "pcs" sono equivalenti)

**L3 (Decision)**:
- Nessun `severity=error` → `status=approved` (auto-approve)
- Almeno un error → `status=pending` (review operatore)

### Canonicalizzazione fornitori

1. Input: "Nordic Design AB"
2. Uppercase + strip accents: "NORDIC DESIGN AB"
3. Remove punteggiatura: "NORDIC DESIGN AB"
4. Strip suffissi (longest-first loop): "NORDIC DESIGN"
5. Fuzzy match contro canonicals esistenti con WRatio threshold 92
6. Se match: usa canonical esistente → unifica varianti
7. Cache Redis DB 1 (TTL 24h)

### Cache colonne per-fornitore (Redis DB 2)

- **Key**: `col_map:{supplier_hash[:12]}:{headers_fingerprint[:12]}`
- **supplier_hash**: `MD5(normalize_for_cache(supplier))`
- **headers_fingerprint**: `MD5(sorted_normalized_headers)` — order-independent
- **Value**: JSON `{"column_mapping": {...}, "doc_type": "order"}`
- **TTL**: 30 giorni
- **CRITICO**: la logica di normalizzazione DEVE essere identica tra `backend/doc_manager/utils.py` e `ai_service/utils/supplier.py`

---

## 1.4 Decisioni architetturali chiave

### 1. GPT-4o per parsing invece di keyword/regex

**Il problema**: ogni fornitore usa diversi nomi colonne — tedesco "MENGE", italiano "Quantità", inglese "QTY".

**Approccio regex** (scartato): liste di pattern per ogni lingua, break su qualsiasi nuovo fornitore.

**Soluzione GPT-4o**: legge le prime 50 righe grezze, restituisce JSON con schema completo. Capisce "STÜCKZAHL" = quantity senza regex esplicita.

**PRO**: funziona per 100+ layout senza manutenzione, multilingue, contextual
**CONTRO**: non-determinismo (6% probabilità header diversi tra due parse), costo API ~$0.003/file
**Mitigazione**: raw_data JSONB salva originals + cache Redis 30 giorni

### 2. Dual data model: 7 campi normalizzati + raw_data JSONB

**Problema**: tariffari multi-colonna (Zona A/B/C × Standard/Express) non si mappano nei 7 campi standard.

**Soluzione**:
- 7 campi indexati per L1 fast math comparison
- `raw_data` JSONB con TUTTI i valori originali per L2 semantic

**PRO**: velocità L1 + flessibilità L2 + resilienza a mapping GPT errati
**CONTRO**: modello ibrido più complesso, query JSONB non indexed

### 3. L2 selettivo: solo righe coinvolte (-80% token)

**Scenario**: ordine 100 righe, 10 discrepanze trovate da L1

**Approccio naive**: invia tutto a GPT → 200 righe ≈ $0.01/riconciliazione
**Soluzione selettiva**: invia solo le 10 righe discrepanti → -80% token, stessa accuracy

**Eccezione**: tariffari non-standard (small per definizione, max 30 righe) → full semantic

### 4. Due servizi Python separati vs monolite

**PRO separazione**:
- Django ORM, migrations, admin (FastAPI non ha questo)
- FastAPI async per GPT calls non-blocking
- Independent scaling: bottleneck parsing → scale solo FastAPI
- Isolation: crash GPT client non tira giù auth API

**CONTRO**: 2 container, HTTP overhead Celery → httpx → FastAPI

### 5. Embedding-based supplier matching + cache Redis

- text-embedding-3-small per cosine similarity su nomi fornitori (threshold 0.88)
- Risultati in Redis DB 1 (TTL 24h) — 95% suppliers sono repeat
- Alternativa embedding-based pura: più accurata ma 10x più lenta senza cache

### 6. Tipo documento complementare

**Regole senza GPT** (fast path):
- Known pairs: `{order, invoice}`, `{order, ddt}`, `{order, packing_list}`, `{price_list, confirmation}`, ...
- Versionable types (price_list, tariff): stesso tipo + stesso fornitore → riconciliabile
- Transactional types (order, invoice): stesso tipo → SOLO se document_number identico

**Fallback GPT**: per coppie ambigue

**PRO**: evita reconciliazioni spurie (ordine ↔ ordine)

### 7. Cache Redis per colonne per-fornitore

Fingerprint SHA-256 degli header → skip GPT al secondo upload dello stesso fornitore.
Risparmio ~80% GPT calls per repeat suppliers.

---

# PARTE 2 — File per file

## 2.1 Root del progetto

### `docker-compose.yml`

Orchesta 7 servizi interconnessi:

**`db` (PostgreSQL 16)**:
- Image: `postgres:16`
- Healthcheck: `pg_isready -U $$POSTGRES_USER`
- Volume named `postgres_data` per persistenza dati tra restart

**`redis` (Redis 7 Alpine)**:
- Healthcheck: `redis-cli ping`
- In-memory, 3 database logici (DB 0/1/2)

**`backend` (Django)**:
- Build: `./backend/Dockerfile`
- Comando: `python manage.py migrate --noinput && python manage.py runserver 0.0.0.0:8000`
- Volume `./backend:/app` per hot reload
- `depends_on`: db e redis `condition: service_healthy`
- Port: 8000

**`celery_worker`**:
- YAML anchor `&celery` (riusato da beat)
- Comando: `/scripts/start-worker.sh`
- Stesse dipendenze di backend

**`celery_beat`**:
- `<<: *celery` (merge anchor)
- Comando: `/scripts/start-beat.sh`
- Scheduler periodico (cleanup cache, metrics)

**`ai_service` (FastAPI)**:
- Comando: `uvicorn main:app --host 0.0.0.0 --port 8001 --reload`
- Port: 8001
- Condivide `.env.backend` per `OPENAI_API_KEY`

**`frontend` (Next.js)**:
- Comando: `npm run dev`
- Volume `/app/node_modules` (anonymous, evita sync macOS lento)
- Port: 3000

**`ngrok`**:
- `profiles: [whatsapp]` — avviato solo con `docker compose --profile whatsapp up`
- Comando: `http backend:8000 --log=stdout`
- Port 4040 per UI debug
- Richiede `NGROK_AUTHTOKEN` in `.env.backend`

### `.gitignore`

Esclude: `.env.backend`, `.env.frontend` (segreti), `__pycache__/`, `*.pyc`, `.next/` (build Next.js ~150MB), `node_modules/` (~200MB), `postgres_data/` (volume Docker).

---

## 2.2 Backend Django

### `backend/Dockerfile`

- Base: `python:3.12-slim`
- Env: `PYTHONUNBUFFERED=1`, `PYTHONDONTWRITEBYTECODE=1`
- Dipendenze sistema: `libpq-dev gcc` (compilare psycopg2)
- `pip install --no-cache-dir -r requirements.txt`

### `backend/requirements.txt`

Dipendenze principali:
- `django==5.0.*` + `djangorestframework==3.15.*`
- `djangorestframework-simplejwt==5.3.*` — JWT auth
- `django-environ==0.11.*` — env vars da .env file
- `celery==5.4.*` + `redis==5.0.*`
- `psycopg2-binary==2.9.*`
- `httpx==0.27.*` — chiamate a ai_service
- `openai==1.30.*` — GPT-4o per riconciliazione L2
- `twilio>=9.0.0` — webhook WhatsApp
- `rapidfuzz>=3.0` — fuzzy matching supplier
- `pytest==8.*` + `pytest-django==4.*`

### `backend/pytest.ini`

- `DJANGO_SETTINGS_MODULE = config.settings.test`
- `testpaths = tests`
- `addopts = -v --tb=short`

### `backend/config/celery.py`

```python
app = Celery("wewill")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()  # trova doc_manager/tasks.py
```

- `namespace="CELERY"` → legge variabili Django settings con prefix `CELERY_` (CELERY_BROKER_URL, CELERY_RESULT_BACKEND, ecc.)

### `backend/config/urls.py`

```python
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", TokenObtainPairView.as_view()),
    path("api/auth/token/refresh/", TokenRefreshView.as_view()),
    path("api/", include("doc_manager.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

### `backend/config/settings/base.py`

**App installed**: Django core + rest_framework + rest_framework_simplejwt + corsheaders + doc_manager

**DRF config**:
```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ("rest_framework_simplejwt.authentication.JWTAuthentication",),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}
```

**CORS**: `CORS_ALLOWED_ORIGINS = ["http://localhost:3000"]`

**Database**: `env.db("DATABASE_URL")` — PostgreSQL URL da env

**Redis DB allocation**:
- `CELERY_BROKER_URL` → DB 0
- Embedding cache → DB 1 (hardcoded in reconciliation.py: replace `/0` con `/1`)
- Column cache → DB 2 (hardcoded in csv_parser.py: replace `/0` con `/2`)

**Media**: `MEDIA_URL = "/media/"`, `MEDIA_ROOT = BASE_DIR / "media"` — file caricati (immagini WhatsApp)

### `backend/config/settings/test.py`

```python
# CRITICO: setdefault PRIMA di importare base
os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-secret-key")
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/wewill_test.db")

from .base import *

DATABASES = {"default": {"ENGINE": "django.db.models.backends.sqlite3", "NAME": ":memory:"}}
CELERY_TASK_ALWAYS_EAGER = True   # task eseguiti sincrono, senza Redis
CELERY_TASK_EAGER_PROPAGATES = True
```

SQLite in-memory + Celery eager = test isolati e veloci (< 1s/test).

### `backend/doc_manager/models.py`

**AppSettings** (singleton):
```python
class AppSettings(models.Model):
    whatsapp_provider = models.CharField(max_length=20, default='mock')
    ocr_engine = models.CharField(max_length=20, default='gpt-4o')
    match_threshold = models.IntegerField(default=30)
    fuzzy_threshold = models.FloatField(default=0.9)

    @classmethod
    def get_solo(cls):
        obj = cls.objects.first()
        if obj is None:
            obj = cls.objects.create()
        return obj
```

**Document**:
- `source`: UPLOAD | WHATSAPP | IMAGE
- `doc_type`: 9 tipi (order, invoice, ddt, price_list, packing_list, shipment, confirmation, summary, inventory)
- `status`: PENDING | PROCESSED | ERROR
- `supplier_name`: nome grezzo (es. "Nordic Design AB")
- `supplier_canonical`: normalizzato uppercase senza suffissi (es. "NORDIC DESIGN") — indexed
- `extracted_data`: JSONField (raw output FastAPI, per audit)
- `file_url`: URL Twilio originale
- `file`: copia locale media file

**DocumentRow**:
- FK Document (CASCADE)
- 7 campi normalizzati: `item_code, description, quantity, unit, unit_price, total_price, discount`
- `raw_data`: JSONField con tutti i valori originali CSV (es. `{"Standard €": 4.90, "Express €": 7.50}`)
- `unique_together = ["document", "row_index"]`

**Reconciliation**:
- `doc1, doc2`: FK Document
- `status`: PENDING | APPROVED | REJECTED | CORRECTED
- `match_confidence`: 0-100 (score composito)
- `discrepancies`: JSONField (lista discrepanze raw)
- `operator_notes`: TextField

**Discrepancy**:
- `reconciliation`: FK
- `discrepancy_type`: 10 tipi (quantity_mismatch, price_mismatch, missing_in_doc2, extra_in_doc2, date_mismatch, total_mismatch, description_mismatch, code_mismatch, unit_mismatch, discount_mismatch)
- `field_name, value_doc1, value_doc2`: CharField
- `severity`: info | warning | error
- `resolution`: UNRESOLVED | KEEP_DOC1 | KEEP_DOC2 | EQUIVALENT | CUSTOM | IGNORED
- `resolved_value, operator_note, llm_suggestion`: nullable
- `resolved_at, resolved_by`: quando/chi ha risolto

### `backend/doc_manager/serializers.py`

- **DocumentSerializer**: nested `rows` + `_display` campi (doc_type → "Ordine", status → "Elaborato")
- **DocumentUploadSerializer**: valida file per POST upload
- **ReconciliationSerializer**: nested doc1, doc2 interi + discrepancy_list
- **DiscrepancyUpdateSerializer**: PATCH su resolution (operatore risolve)
- **AppSettingsSerializer**: CRUD impostazioni
- **DocumentListSerializer**: versione leggera senza nested rows (per liste veloci)

Trade-off: nested serializers comportano SELECT N+1 — mitigato con `select_related()` nelle views.

### `backend/doc_manager/views.py`

**DocumentUploadView** (POST `/api/documents/upload/`):
```python
file_content = file.read()
process_document_task.delay(
    document_id=document.id,
    file_content=list(file_content),  # bytes → list per JSON serialization
    filename=file.name,
)
return Response(DocumentSerializer(document).data, status=202)
```

Crea Document in PENDING, schedula Celery task, ritorna 202 ACCEPTED. `list(file_content)` converte bytes a lista di interi (JSON-serializable per Celery).

**ImageUploadView** (POST `/api/documents/upload-image/`):
- Source IMAGE, salva copia locale su disk per preview frontend
- Schedula task OCR

**WhatsAppWebhookView** (POST `/api/webhook/whatsapp/`, AllowAny):
- **Produzione** (TWILIO_AUTH_TOKEN settato): verifica firma HMAC Twilio, usa `X-Forwarded-Proto/Host` per ricostruire URL esatto (ngrok proxy), ritorna TwiML XML
- **Dev mode** (token vuoto): accetta JSON payload manuale senza verifica

**RegisterView** (POST `/api/auth/register/`, AllowAny):
- Validazione: username non vuoto, password ≥ 6 caratteri, username unico
- `User.objects.create_user(username, password, email)`

**DashboardStatsView** (GET `/api/dashboard/stats/`):
- KPI: pending count, processed_today, match_rate, avg_processing_ms
- Queue: ultimi 8 reconciliation per la coda visuale
- ingestion_7d: histogram 7 giorni
- discrepancy_histogram: top 10 tipi

**SuppliersListView**: raggruppa per `supplier_canonical`, conta documenti e riconciliazioni.

**SupplierDetailView**: stats per tipo documento + cached mappings Redis DB 2.

**ClearCacheView** (DELETE `/api/settings/cache/`): flush `col_map:*` keys da Redis DB 2.

### `backend/doc_manager/urls.py`

```python
urlpatterns = [
    path("documents/", DocumentListView),
    path("documents/upload/", DocumentUploadView),
    path("documents/upload-image/", ImageUploadView),
    path("documents/<int:pk>/", DocumentDetailView),
    path("webhook/whatsapp/", WhatsAppWebhookView),
    path("auth/register/", RegisterView),
    path("auth/me/", MeView),
    path("dev/reset/", ResetDatabaseView),
    path("reconciliations/", ReconciliationListView),
    path("reconciliations/<int:pk>/", ReconciliationDetailView),
    path("reconciliations/<int:pk>/review/", ReconciliationUpdateView),
    path("dashboard/stats/", DashboardStatsView),
    path("whatsapp/inbox/", WhatsAppInboxView),
    path("suppliers/", SuppliersListView),
    path("suppliers/<str:name>/", SupplierDetailView),
    path("settings/", SettingsView),
    path("settings/cache/", ClearCacheView),
    path("discrepancies/<int:pk>/", DiscrepancyUpdateView),
    path("notifications/", NotificationsView),
    path("search/", SearchView),
]
```

Tutti montati sotto `/api/` da `config/urls.py`.

### `backend/doc_manager/tasks.py`

**`@shared_task process_document_task`** (bind=True, max_retries=3):

Importa modelli Django DENTRO la funzione (evita circular import al load del modulo).

**Source = UPLOAD**:
1. `httpx.Client.post(AI_SERVICE_URL + "/parse/csv", files={"file": ...})`
2. Riceve lista documenti (una per sezione del file)
3. `_update_document(document, first)` — aggiorna primo document
4. Per sezioni extra: crea nuovi Document separati
5. `find_and_reconcile(document)` per ciascuno

**Source = IMAGE**:
1. `httpx.Client.post(AI_SERVICE_URL + "/ocr/upload", files={"file": ...})`
2. `_save_ocr_result(document, parsed)`
3. `find_and_reconcile(document)`

**Source = WHATSAPP**:
1. Scarica media bytes da URL Twilio con Basic Auth (SID:TOKEN)
2. Salva copia locale su disk (`document.file.save()`)
3. POST a `/ocr/upload` di ai_service
4. `_save_ocr_result()` + `find_and_reconcile()`

**Error handling**:
```python
except Exception as exc:
    doc.status = Document.StatusChoices.ERROR
    doc.error_message = str(exc)
    doc.save()
    raise self.retry(exc=exc, countdown=60)
```
Max 3 tentativi, countdown 60s tra retry.

**`_update_document(document, parsed)`**: salva metadati estratti (doc_type, supplier, number, date, total), canonicalizza supplier, crea DocumentRow bulk.

**`_save_ocr_result(document, parsed)`**: identico ma per OCR, salva anche `raw_text` estratto da Vision.

### `backend/doc_manager/reconciliation.py`

**Embedding helpers**:

```python
_redis = redis_lib.from_url(CELERY_BROKER_URL.replace("/0", "/1"))
_local_cache: dict[str, list[float]] = {}

def _embed(text: str) -> list[float]:
    # 1. Cache in-process dict (zero latenza per duplicati in stesso task)
    # 2. Cache Redis DB 1 (condivisa tra worker, TTL 24h)
    # 3. Chiamata OpenAI text-embedding-3-small (fallback)
```

**`_cosine(a, b)`**: similarità coseno → `dot(a,b) / (|a| × |b|)`

**`level1_exact_match(rows1, rows2)`**:
Per ogni riga di rows1:
1. Exact match su item_code
2. Fuzzy fallback: SequenceMatcher ratio ≥ 0.9 (FRN-001 vs FRN001)
3. Embedding fallback: cosine ≥ 0.88 su description (multilingual match)
4. Nessun match → `missing_in_doc2` error

`_compare_rows(row1, row2)`: confronto quantity, unit_price (tolerance 0.001), unit (case-insensitive warning), discount.

**`is_standard_document(doc)`**: >50% righe con item_code → standard; altrimenti non-standard (tariffari).

**`level2_semantic_check(doc1, doc2, discrepancies)`**:
- Standard: invia solo righe coinvolte nelle discrepanze + context
- Non-standard: invia full raw_data di entrambi

**`level2_full_semantic(doc1, doc2)`**:
- Salta L1 completamente (strutture incomparabili)
- temperature=0 per output deterministico
- GPT riceve raw_data JSONB completo + regole: non confrontare `_id` (internal), confronta colonne per nome originale

**`level3_decide(reconciliation)`**:
```python
has_real_errors = any(d.get("severity") == "error" for d in reconciliation.discrepancies)
if not has_real_errors:
    reconciliation.status = Reconciliation.StatusChoices.APPROVED
```

**`compute_match_score(doc_a, doc_b)`** → int 0-100:
- Document number identico: +50
- Supplier embedding similarity ≥ 0.88: +30; ≥ 0.72: +15
- Stessa data: +10
- Totali simili (< 1%): +10; (< 10%): +5
- Item code Jaccard overlap: ≥ 0.8 → +40; ≥ 0.5 → +25; ≥ 0.2 → +10
- Non-standard (raw_data values overlap): +20 o +10
- Section bonus (tariffari stessa zona): +30

**`are_documents_complementary(doc_a, doc_b)`**:
- **Versionable** (price_list, tariff, confirmation): stesso tipo + stesso fornitore → True
- **Transactional** (order, invoice, ddt): stesso tipo + stesso document_number → True
- **Known pairs** (order+invoice, invoice+ddt, ecc.): frozenset lookup → True
- **Ambiguous**: chiede a GPT

**`find_and_reconcile(new_doc)`**:
1. Cerca candidati PROCESSED, escludi già riconciliati e stesso filename
2. Filtra per complementarità
3. Calcola score per ogni candidato, prende best_match
4. Se best_score < 30 → exit
5. Crea Reconciliation + Discrepancy bulk
6. Chiama `level3_decide()`

### `backend/doc_manager/utils.py`

```python
_COMPANY_SUFFIXES = sorted([
    # Italiani: s.r.l.s., s.r.l., s.p.a., srl, spa, sas, snc, ...
    # Tedeschi: gmbh & co. kg, gmbh, kg, ag, ...
    # Inglesi: limited, ltd, incorporated, inc, corporation, corp, llc, ...
    # Scandinavi/Olandesi: ab, a/s, bv, nv, ...
], key=len, reverse=True)  # longest-first per greedy match
```

**`_normalize_for_match(name)`**:
1. `_strip_accents()`: NFD decomposition → rimuove diacritici ("Möbel" → "Mobel")
2. Uppercase
3. Punteggiatura → spazio (mantiene `&`)
4. Collapse whitespace
5. Loop removal suffissi (while changed): match `" SRL"` a fine stringa → rimuovi, re-itera

**`canonical_supplier_name(raw, existing_canonicals=None)`**:
- `_normalize_for_match()` (pipeline base)
- Se `existing_canonicals`: fuzzy match con WRatio threshold 92
- Ritorna canonical esistente se match, altrimenti normalizzato

**CRITICO**: `_COMPANY_SUFFIXES` e `_normalize_for_match` DEVONO essere identici in `ai_service/utils/supplier.py` per generare le stesse cache key Redis DB 2.

### `backend/doc_manager/management/commands/normalize_existing_suppliers.py`

3 passate per backfill:
1. `normalize_supplier()` — whitespace normalization
2. `canonical_supplier_name(name, None)` — suffix strip, no fuzzy
3. `canonical_supplier_name(name, existing_canonicals)` — fuzzy unification varianti

Avvertenza finale: raccomanda flush Redis DB 2 (`redis-cli -n 2 FLUSHDB`) perché cache col_map diventa stale.

### `backend/tests/conftest.py`

```python
@pytest.fixture
def auth_headers(api_client, db):
    user = User.objects.create_user(username="testuser", password="testpass123")
    resp = api_client.post("/api/auth/token/", {"username": "testuser", "password": "testpass123"})
    return {"HTTP_AUTHORIZATION": f"Bearer {resp.data['access']}"}

@pytest.fixture
def make_row():
    """Factory SimpleNamespace per mock righe (no DB, no embedding calls)."""
    def _make(item_code="", description="", quantity=None, unit="",
               unit_price=None, total_price=None, discount=None):
        return SimpleNamespace(item_code=item_code, ...)
    return _make
```

`description=""` default → evita embedding fallback che chiamerebbe OpenAI.

### `backend/tests/test_views.py`

- Test auth: 401 senza token, register flow, duplicate username
- `@patch("doc_manager.tasks.process_document_task.delay")` → mock Celery task
- Verifica 202 + `status=pending` su upload
- List endpoints su DB vuoto → 200 con `[]`

### `backend/tests/test_reconciliation.py`

- `test_quantity_mismatch_is_error`: severity "error"
- `test_unit_mismatch_is_warning`: severity "warning"
- `test_fuzzy_item_code_gives_code_mismatch_not_missing`: FRN-001 vs FRN001 → code_mismatch warning
- `test_reordered_rows_still_match`: dict, non list → ordine irrilevante

### `backend/tests/test_reconciliation_advanced.py`

- `test_auto_approves_when_only_warnings`: solo warning → APPROVED
- `test_stays_pending_when_has_error`: un errore → PENDING
- Mock GPT per `level2_semantic_check`: verifica downgrade severity error → info

### `backend/tests/test_utils_supplier.py`

37 test su normalizzazione, accenti, suffix stripping, fuzzy unification.
- `test_strips_gmbh_and_co_kg`: "Translog GmbH & Co. KG" → "TRANSLOG"
- `test_accent_variant_fuzzy_unified`: "Alpine Mobel AG" → "ALPINE MOBEL"

### `backend/tests/test_tasks_mock.py`

Mock `httpx.Client` per evitare call reale a ai_service. Verifica:
- Task UPLOAD → status PROCESSED
- DocumentRow bulk creato
- Metadati popolati (supplier_name, document_number, supplier_canonical)
- Multi-section → 2 Document creati

---

## 2.3 AI Service FastAPI

### `ai_service/Dockerfile`

- Base: `python:3.12-slim`
- Entrypoint: `uvicorn main:app --reload` (definito in docker-compose)

### `ai_service/requirements.txt`

- `fastapi==0.111.*` + `uvicorn[standard]==0.30.*`
- `openai==1.30.*` — GPT-4o + Vision
- `pandas==2.2.*` + `openpyxl==3.1.*` — Excel multi-sheet
- `python-multipart==0.0.9` — parsing `UploadFile`
- `redis==5.*` — cache DB 2
- `pytest==8.*`

### `ai_service/main.py`

```python
app = FastAPI(title="WeWill AI Service", version="0.1.0")
app.include_router(csv_parser.router)
app.include_router(ocr.router)
app.include_router(classifier.router)

@app.get("/health")
async def health(): return {"status": "ok"}
```

Swagger UI automatico a `/docs`.

### `ai_service/routers/csv_parser.py`

**Redis setup (DB 2)**:
```python
def _get_struct_redis():
    url = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0").replace("/0", "/2")
    r = redis_lib.from_url(url, socket_connect_timeout=1)
    r.ping()
    return r
```
Lazy init, timeout 1s, fallback graceful se Redis down.

**`_headers_fingerprint(headers)`**:
```python
normalized = sorted(h.strip().lower() for h in headers if h.strip())
return hashlib.md5("|".join(normalized).encode()).hexdigest()[:12]
```
Order-independent (sorted prima dell'hash), 12 char hex.

**`_extract_supplier_hint(raw_rows)`**:
- Cerca nelle prime 10 righe: keyword "Fornitore", "Supplier", "Vendor", ecc.
- Prende il valore alla destra del keyword
- Pre-GPT (veloce), usato per cache lookup

**Cache column mapping (Redis DB 2)**:
```python
_COL_MAP_TTL = 30 * 86400  # 30 giorni

def _cache_col_map_get(supplier, headers):
    s_hash = hashlib.md5(normalize_for_cache(supplier).encode()).hexdigest()[:12]
    key = f"col_map:{s_hash}:{_headers_fingerprint(headers)}"
    data = r.get(key)
    return json.loads(data) if data else None

def _cache_col_map_set(supplier, headers, mapping, doc_type):
    r.setex(key, _COL_MAP_TTL, json.dumps({"column_mapping": mapping, "doc_type": doc_type}))
```

**`read_raw_file(content, filename)`**:
- CSV: try encoding UTF-8 → latin-1 → cp1252; auto-detect separator (conta `,`, `;`, `\t`, `|`); ritorna `[sheet]`
- Excel: `pd.ExcelFile()` + `pd.read_excel(header=None, dtype=str)` per ogni sheet; ritorna lista di sheet

**`rows_to_text(sheets, max_rows=50, tail_rows=15)`**:
Output testo formattato "Riga N: val1 | val2 | ..." con prime 50 + ultime 15 righe. Multi-sheet: intestazione "--- SHEET N ---".

**`ask_claude_to_understand_structure(preview, filename)`**:
- Prompt 287 righe con regole precise
- temperature=0 (determinismo)
- Regole chiave nel prompt:
  - `quantity` = quantità TOTALE; in DDT/packing list ignora COLLI e QTÀ/COLLO
  - `total_price` per "Prezzo Scontato", "Importo Netto" (non `discount`)
  - Righe aggregate (SUBTOTALE, TOTALE) → escludi da data_row_indices
  - Sezioni separate solo per fornitore/tipo diverso

**`parse_number(value)`**: locale-aware (EU: 1.234,56; US: 1,234.56), rimuove €$£%, handles "N/A"/"-".

**`extract_rows(raw_rows, data_start, column_mapping, data_row_indices, header_cells)`**:
- Filtra per `data_row_indices` esatto (da GPT) o `data_start`
- `raw_data`: usa nome header originale se disponibile, fallback `col_<idx>`
- Include anche colonne mappate a "ignore" in raw_data
- Filtro riga: accetta se ha item_code, description, quantity, unit_price, O raw_data non vuoto

**`parse_csv_excel` (POST /parse/csv)**:
1. Leggi file, estrai preview
2. Supplier hint pre-GPT → check cache
3. Cache hit: usa schema cached (salta GPT, confidence 95)
4. Cache miss: chiama GPT
5. **Auto-estensione**: se file > 50 righe e sezione singola → estendi `data_row_indices` fino a fine file
6. Salva cache (post-GPT)
7. Estrai righe per ogni sezione
8. Scarta sezioni aggregate (< 2 righe, nessun item_code)
9. Calcola totale (da metadata o sum total_price)

### `ai_service/routers/ocr.py`

**POST `/ocr/image`** (JSON con `image_url`):
- GPT-4o Vision: `type: "image_url"` con URL
- Prompt con regole identiche a csv_parser (quantity TOTALE, ignora COLLI)
- Parsing JSON robusto (strip backtick markdown)

**POST `/ocr/upload`** (file binario):
```python
data_url = f"data:{mime};base64,{base64.b64encode(content).decode()}"
return await ocr_image(OCRRequest(image_url=data_url))
```
Converte bytes → base64 data-URI, richiama internamente `/ocr/image`.

### `ai_service/routers/classifier.py`

**POST `/classify/document`**: classifica tipo documento da dati già estratti. GPT ritorna `{doc_type, confidence: 0-100, reasoning}`.

### `ai_service/utils/supplier.py`

**CRITICO — KEEP IN SYNC con `backend/doc_manager/utils.py`**

```python
_COMPANY_SUFFIXES = sorted([...], key=len, reverse=True)  # identici al backend

def normalize_for_cache(name: str) -> str:
    s = _strip_accents(name).upper()
    s = re.sub(r'[^\w\s&]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    # Loop removal suffissi (mentre cambia)
    changed = True
    while changed:
        changed = False
        for suf in _COMPANY_SUFFIXES:
            suf_norm = ...normalize(suf)...
            if s.endswith(' ' + suf_norm) or s == suf_norm:
                s = s[:...].strip()
                changed = True
                break
    return s
```

Produce output identico a `_normalize_for_match()` backend. Usata per generare le stesse cache key Redis DB 2 da entrambi i servizi.

### `ai_service/tests/`

**test_csv_parser.py**: `parse_number` (EU/US locale, edge cases), `read_raw_file` (separatori, encoding), `rows_to_text` (formato output, multi-sheet).

**test_csv_parser_advanced.py**: `_headers_fingerprint` (order-independent), `_extract_supplier_hint`, `extract_rows` (data_row_indices filter, raw_data header names), total rounding, cache key normalization.

**test_supplier_normalize.py**: 16 test di parità con backend. Casi noti con output atteso (es. "Translog GmbH & Co. KG" → "TRANSLOG"). Verifica: case-insensitive, accent strip, extra whitespace.

---

## 2.4 Frontend Next.js 16

### `frontend/Dockerfile`

- Base: `node:20-alpine`
- `npm install` + copia sorgente
- Runtime: `npm run dev` (da docker-compose)

### `frontend/package.json`

- Next.js 16.2.4 + React 19.2.4 + TypeScript 5
- Tailwind CSS 4 (usato solo in `globals.css` root con `@import "tailwindcss"`)
- Nessuna libreria icone esterna (SVG inline in Icons.tsx)

### `frontend/tsconfig.json`

- Strict mode, path alias `@/*` → `./src/*`
- `module resolution: bundler` (compatibile Next.js)

### `frontend/src/app/layout.tsx`

Root HTML shell: `<html lang="it">`, Geist font, metadata globali, importa `globals.css`.

### `frontend/src/app/page.tsx`

```tsx
import { redirect } from 'next/navigation'
export default function Home() { redirect('/v2') }
```

### `frontend/src/app/globals.css`

```css
@import "tailwindcss";
```

Tailwind utilities (usate solo per root layout e legacy pages).

### `frontend/src/app/login/page.tsx`

- `'use client'` + `useState`, `useRouter`
- Importa `'../v2/globals-v2.css'` per Quoro styling
- POST a `/api/auth/token/`, salva `access_token` e `refresh_token` in localStorage
- Usa classi: `q-card`, `q-input`, `q-label`, `q-btn primary`, `q-logo-mark`
- Link a `/register`

### `frontend/src/app/register/page.tsx`

- Stessa UI Quoro di login
- POST a `/api/auth/register/` con username, email (opzionale), password (min 6)
- Redirect a `/login` su successo

### `frontend/src/app/v2/layout.tsx`

```tsx
import './globals-v2.css'
// ...
<div className="q-app">
  <Sidebar />
  <main className="q-main">
    <Topbar />
    {children}
  </main>
</div>
```

Grid 2 colonne (240px sidebar + 1fr main). Presuppone autenticazione JWT — redirect gestito da `api.ts` su 401.

### `frontend/src/app/v2/globals-v2.css`

Design system Quoro completo:

**Variabili CSS (`:root`)**:
- Colori: `--bg`, `--bg-elev`, `--bg-sunken`, `--surface`, `--border`, `--text`, `--text-muted`, `--text-faint`, `--accent`, `--accent-soft`, `--ok`, `--warn`, `--err`, `--info` + versioni `-soft`
- Font: `--font-sans: "Geist"`, `--font-mono: "Geist Mono"`
- Spacing: `--radius-sm: 6px`, `--radius: 10px`, `--radius-lg: 14px`
- Varianti tema: `[data-variant="deep"]` (violetto scuro), `[data-variant="editorial"]` (marrone)

**Layout shell**:
- `.q-app` — grid 2 colonne, height 100vh
- `.q-sidebar` — colonna sinistra, bg `--bg-elev`
- `.q-main` — colonna destra, flex column
- `.q-topbar` — header sticky, flex row
- `.q-content` — area scrollabile, padding 28px

**Componenti primitivi**: `.q-card`, `.q-btn` (variant: primary/ghost/danger, size: sm/md), `.q-label`, `.q-input`, `.q-pill` (variant: accent/ok/warn/err/info), `.q-breadcrumbs`

**Layout specializzati**:
- `.q-grid-2/3/4` — grid multi-colonna per KPI
- `.q-master-detail` — 320px master + 1fr detail
- `.q-recon-v2` — 1fr doc cards + 380px rail discrepanze
- `.q-tbl`, `.q-diff` — tabelle standard e diff con color-coding

**Discrepancy rail**: `.q-rail-v2`, `.q-disc-item`, `.q-disc-detail`, `.q-disc-val`, `.q-disc-actions`, `.q-llm-box`

**Upload/doc**: `.q-upload-card`, `.q-upload-progress`, `.q-doc-card`, `.q-meta-grid`

**Animazioni**: `@keyframes q-fadeIn`, `@keyframes q-pulse`, `@keyframes q-spin`

### `frontend/src/app/v2/page.tsx` (Dashboard)

- `'use client'`, `useState`, `useEffect`, polling ogni 5s (`setInterval(load, 5000)`)
- KPI grid 4 colonne: pending (warn se > 0), processed_today, match_rate (color dinamico: ok ≥80, warn ≥50, err <50), avg_processing_ms
- Left: coda riconciliazione con score bar grafica
- Right: ingestion 7 giorni + histogram discrepanze
- Full-width: documenti recenti

### `frontend/src/app/v2/upload/page.tsx`

- Toggle tipo upload: CSV/Excel ↔ Foto/OCR
- Drop zone con drag-over highlighting
- **UploadJob queue**: ogni file → `UploadJob` con UUID (`crypto.randomUUID()`)
- **7 step**: Upload file, Parser FastAPI, GPT-4o analisi, Estrazione righe, Persistenza DB, Ricerca candidato, Avvio riconciliazione
- **Poll logic**: ogni 1.5s per max 60 tentativi (90s timeout), check `status === 'processed'`

### `frontend/src/app/v2/reconciliations/page.tsx`

- Polling ogni 5s
- Table: score bar grafica (colore ok/warn/err), pill errors/warnings, status pill, click → dettaglio

### `frontend/src/app/v2/reconciliations/[id]/page.tsx`

- Header sticky: breadcrumb, status pill, score, azioni (Correggi/Rifiuta/Approva)
- DocCard pair (1fr 1fr) con highlight campi con discrepanza (warn-soft bg)
- DiffTable side-by-side con highlight celle per severity
- DiscrepancyRail 380px con filter chips, list discrepanze, detail pane con action buttons
- Review flow: PATCH `/api/reconciliations/{id}/review/` → redirect lista

### `frontend/src/app/v2/suppliers/page.tsx`

- Master-detail: lista fornitori con doc count/match rate → dettaglio con docs_by_type + cached_mappings Redis DB 2

### `frontend/src/app/v2/settings/page.tsx`

- Card WhatsApp connector (Mock/Twilio/Meta API — solo Mock abilitato)
- Button "Simula messaggio WhatsApp" → form mock → POST `/api/webhook/whatsapp/`
- Range slider match_threshold (10-80) e fuzzy_threshold (70-100%)
- Button "Svuota cache fornitori" → DELETE `/api/settings/cache/`

### `frontend/src/app/v2/inbox/page.tsx`

- Master-detail: lista messaggi WhatsApp → dettaglio con ImagePreview + metadati OCR estratti

### `frontend/src/app/v2/profile/page.tsx`

- Form: username (disabled), email, nuova password (opzionale)
- PATCH `/api/auth/me/`

### `frontend/src/components/v2/Sidebar.tsx`

- JWT decode da localStorage per username
- Nav items con contatori dinamici:
  - Inbox WhatsApp: count docs WhatsApp/IMAGE
  - Riconciliazioni: count pending + pulse dot animato
- `<UserMenu />` in footer

### `frontend/src/components/v2/Topbar.tsx`

- Breadcrumb dinamico da pathname
- Button "Cerca" → apre CommandPalette
- Bell icon → NotificationsDropdown (red dot se pending)
- Pill status: "tutto OK" verde o "errori" giallo
- Polling notifiche ogni 10s

### `frontend/src/components/v2/UserMenu.tsx`

- JWT decode per username + initials avatar
- Dropdown: link Profilo → `/v2/profile`, button Esci → clear localStorage + redirect `/login`
- Click-outside handler: useRef + mousedown listener

### `frontend/src/components/v2/NotificationsDropdown.tsx`

- Props: `open, onClose, data`
- Lista notifiche con icon (AlertCircle per doc_error, Diff per recon_pending)
- Timestamp relativo ("adesso", "5m fa", "2h fa")
- Click item → navigate a `notification.link`

### `frontend/src/components/v2/CommandPalette.tsx`

- Overlay fixed + modal 560px
- Debounce 200ms, fetch `searchAll(q)` se query ≥ 2 caratteri
- Item: FileText icon, supplier | filename | id, doc type, status badge

### `frontend/src/components/v2/UploadCard.tsx`

- Props: `job: UploadJob`, `onRemove`
- Header: emoji (📄/🖼), filename, status badge, close button
- Progress bar con colore dinamico (err/ok/accent)
- Step timeline: ✓ done, ⟳ active, ! error, con timing in ms
- Footer con metadata (fornitore, tipo, n. doc) + link riconciliazioni

### `frontend/src/components/v2/DocCard.tsx`

- Props: `doc, label, discrepancies, side`
- Meta grid con highlight mismatch (warn-soft bg) se campo in discrepancies
- Toggle "Mostra righe": tabella con 5 colonne, monospace per codici
- `fmtAmount()`: Italian locale "€1.234,50"

### `frontend/src/components/v2/DiscrepancyRail.tsx`

- Filter chips: All/Error/Warning/Info
- List discrepanze filtrate (sorted by severity)
- Detail pane selezionato: values doc1/doc2 (monospace), action buttons (grid 2 col):
  - "Tieni doc1", "Tieni doc2", "Marca equiv.", "Ignora riga"
  - "Valore custom…" → inline input
  - "+ Nota" → textarea
- LLM suggestion box (`.q-llm-box`, info-soft): mostra `discrepancy.llm_suggestion`
- Bottom: textarea note generali + button Salva nota

### `frontend/src/components/v2/ImagePreview.tsx`

- Se file URL assente: fallback tabella righe estratte (max 5)
- Se URL presente: `<img>` con cursor zoom-in, click → lightbox `.q-lightbox`

### `frontend/src/components/v2/KpiCard.tsx`

Props: `label, value, sub?, valueStyle?` → `.q-kpi-label`, `.q-kpi-value`, `.q-kpi-sub`

### `frontend/src/components/v2/Btn.tsx`, `Card.tsx`, `Pill.tsx`, `EmptyState.tsx`

Primitivi che wrappano classi Quoro (`q-btn`, `q-card`, `q-pill`, `q-empty`).

**Pill helpers**: `severityToPillVariant()` (error→err, warning→warn), `statusToPillVariant()` (approved→ok, rejected→err, pending→warn).

### `frontend/src/components/v2/Icons.tsx`

Factory `icon(pathData)` crea componenti SVG stroke-based 24x24. Esporta: Home, Upload, Whatsapp, Diff, Suppliers, Settings, Search, Bell, ChevronDown, ChevronRight, Check, X, AlertCircle, FileText, Camera, Sparkle, Database, Filter, Eye, ArrowRight, Clock, TrendingUp, Tag, Hash, GitMerge, User, LogOut, UploadCloud, Loader (spinning con `q-spin`).

**Regola**: non aggiungere librerie esterne (Lucide, Heroicons) — tutto qui.

### `frontend/src/lib/api.ts`

**JWT auto-refresh pattern**:
```typescript
async function apiFetch(url: string, options = {}) {
  let res = await fetch(url, { ...options, headers: authHeaders() })
  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      res = await fetch(url, { ...options, headers: authHeaders() })
    } else {
      localStorage.clear()
      window.location.href = '/login'
      throw new Error('Session expired')
    }
  }
  return res
}
```

**Tipi TypeScript** (mirror di `backend/doc_manager/serializers.py`):
- `Document`: id, source, source_display, doc_type, doc_type_display, status, status_display, supplier_name, document_number, document_date, total_amount, file_url, file, rows, extracted_data, created_at, updated_at
- `DocumentRow`: id, row_index, 7 campi normalizzati, raw_data
- `Discrepancy`: id, discrepancy_type, field_name, value_doc1, value_doc2, severity, doc1_row, doc2_row, resolution, resolved_value, operator_note, llm_suggestion, resolved_at
- `Reconciliation`: id, doc1, doc2, status, match_confidence, discrepancy_list, operator_notes
- `Supplier`, `SupplierDetail`, `CachedMapping`
- `AppSettings`, `DashboardStats`, `Notification`, `NotificationsData`, `UserProfile`

**Fetcher functions esportate**: `getDocuments`, `getDocument`, `uploadDocument`, `uploadImage`, `getReconciliations`, `getReconciliation`, `reviewReconciliation`, `getDashboardStats`, `getWhatsAppInbox`, `getSuppliers`, `getSupplier`, `getSettings`, `updateSettings`, `clearCache`, `updateDiscrepancy`, `getNotifications`, `searchAll`, `getMe`, `updateMe`, `simulateWhatsapp`, `resetDatabase`

**CRITICO**: tipi e path DEVONO corrispondere a `backend/doc_manager/serializers.py` e `backend/doc_manager/urls.py`.

---

## 2.5 Scripts

### `scripts/test_agent.py`

E2E black-box runner — testa il sistema completo senza accesso al sorgente.

**Autenticazione**: POST `/api/auth/token/` con credenziali (override con `--username`, `--password`).

**Fixture files** da `~/Desktop/TEST PER QUORO/tests/`: CSV/Excel + immagini.

**`EXPECTED_DOCS`**: per ogni file, specifica count sezioni, doc_type atteso, min/max righe, supplier_contains, codes_sample.

**`EXPECTED_RECONCILIATIONS`**: per ogni coppia, specifica files, expected_errors_min, expected_discrepancy_types, expected_status.

**Flag**:
- `--reset`: POST `/api/dev/reset/` per pulire DB
- `--skip-ai`: salta analisi GPT finale
- `--verbose`: mostra dettagli per ogni documento

**3 agenti**:
1. **Ingestion**: upload file + polling completamento
2. **Validation**: verifica doc_type, righe, item codes attesi
3. **Reconciliation**: verifica coppie di riconciliazione + discrepanze

**AI Analysis Agent** (opzionale, se `--skip-ai` non settato): raccoglie tutti i problemi, li invia a GPT-4o per analisi e suggerimenti.

**Output rich**: Panel colorati per agente, tabella summary con passed/warnings/failed.

### `scripts/generate_ocr_docs.py`

Genera 3 coppie HTML di documenti aziendali con discrepanze deliberate per testare OCR:
- **Coppia 1**: Nordic Design AB — DDT vs Ordine CSV (quantity_mismatch FRN-045: 50→48, missing FRN-078)
- **Coppia 2**: Alpine Möbel — Conferma vs Packing List (quantity_mismatch ALP-843: 6→4, price_mismatch ALP-114)
- **Coppia 3**: Acme Furniture — Fattura vs Listino (sconto rimodulato, articolo fuori produzione)

HTML con CSS Quoro-like (header aziendale, tabella articoli, firma). PDF opzionale con WeasyPrint.

Ogni coppia: `discrepanze.md` con doc delle discrepanze deliberate e severity attesa.

### `scripts/start-worker.sh`

```bash
export DJANGO_SETTINGS_MODULE=config.settings.local
celery -A config worker --loglevel=info
```

### `scripts/start-beat.sh`

```bash
export DJANGO_SETTINGS_MODULE=config.settings.local
celery -A config beat --loglevel=info
```

Scheduler per: cleanup cache Redis, UploadJob scaduti, report metrics.

### `scripts/requirements-test.txt`

```
httpx>=0.27.0
openai>=1.30.0
rich>=13.0.0
```

Solo per `test_agent.py`. Installazione: `pip3 install -r scripts/requirements-test.txt`.

---

# PARTE 3 — Riferimento rapido

## 3.1 Comandi essenziali

| Comando | Scopo |
|---------|-------|
| `docker compose up` | Avvia stack completo |
| `docker compose up --build` | Rebuild immagini dopo change Dockerfile |
| `docker compose up --profile whatsapp` | Include ngrok per WhatsApp |
| `docker compose exec backend pytest -v` | 63 unit test Django |
| `docker compose exec ai_service pytest -v` | 53 unit test FastAPI |
| `docker compose exec backend python manage.py migrate` | Applica migration |
| `docker compose exec backend python manage.py createsuperuser` | Crea admin |
| `docker compose exec backend python manage.py normalize_existing_suppliers` | Backfill supplier_canonical |
| `docker compose exec backend python manage.py shell` | Django REPL con ORM |
| `docker compose logs -f backend` | Stream log Django |
| `python3 scripts/test_agent.py --reset --skip-ai --verbose` | E2E runner (stack up) |
| `python3 scripts/generate_ocr_docs.py` | Genera HTML documenti test |

**Pulizia DB da REPL**:
```python
from doc_manager.models import Document, Reconciliation, Discrepancy
Discrepancy.objects.all().delete()
Reconciliation.objects.all().delete()
Document.objects.all().delete()
```

**Via API** (dev reset):
```bash
curl -X POST http://localhost:8000/api/dev/reset/ -H "Authorization: Bearer <token>"
```

---

## 3.2 Variabili d'ambiente

### `.env.backend`

| Variabile | Tipo | Esempio |
|-----------|------|---------|
| `POSTGRES_DB` | richiesta | `wewill` |
| `POSTGRES_USER` | richiesta | `wewill` |
| `POSTGRES_PASSWORD` | richiesta | `wewill_dev` |
| `DATABASE_URL` | richiesta | `postgresql://wewill:wewill_dev@db:5432/wewill` |
| `DJANGO_SECRET_KEY` | richiesta | `django-insecure-...` (genera con `get_random_secret_key()`) |
| `DJANGO_DEBUG` | opzionale | `1` (dev) |
| `CELERY_BROKER_URL` | richiesta | `redis://redis:6379/0` |
| `CELERY_RESULT_BACKEND` | richiesta | `redis://redis:6379/0` |
| `OPENAI_API_KEY` | richiesta | `sk-proj-...` |
| `AI_SERVICE_URL` | richiesta | `http://ai_service:8001` |
| `TWILIO_ACCOUNT_SID` | opzionale | `ACxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | opzionale | `authxxxxxxxxxxxxxxxx` |
| `TWILIO_WHATSAPP_NUMBER` | opzionale | `whatsapp:+14155238886` |
| `NGROK_AUTHTOKEN` | opzionale | `yxxxxxxxxxxxxxxxxxx` |

### `.env.frontend`

| Variabile | Tipo | Esempio |
|-----------|------|---------|
| `NEXT_PUBLIC_API_URL` | richiesta | `http://localhost:8000` |

---

## 3.3 Endpoint API principali

### Django Backend (port 8000)

| Metodo | Endpoint | Descrizione | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/token/` | Login → JWT token | No |
| POST | `/api/auth/token/refresh/` | Refresh access token | No |
| POST | `/api/auth/register/` | Crea account operatore | No |
| GET | `/api/auth/me/` | Profilo utente | Yes |
| PATCH | `/api/auth/me/` | Aggiorna email/password | Yes |
| GET | `/api/documents/` | Lista documenti | Yes |
| POST | `/api/documents/upload/` | Upload CSV/Excel | Yes |
| POST | `/api/documents/upload-image/` | Upload immagine OCR | Yes |
| GET | `/api/documents/<id>/` | Dettaglio documento con righe | Yes |
| GET | `/api/reconciliations/` | Lista riconciliazioni | Yes |
| GET | `/api/reconciliations/<id>/` | Dettaglio con discrepanze | Yes |
| PATCH | `/api/reconciliations/<id>/review/` | Approva/rifiuta/correggi | Yes |
| PATCH | `/api/discrepancies/<id>/` | Risolvi singola discrepanza | Yes |
| POST | `/api/webhook/whatsapp/` | Webhook Twilio (o mock JSON) | No |
| GET | `/api/dashboard/stats/` | KPI dashboard | Yes |
| GET | `/api/whatsapp/inbox/` | Messaggi WhatsApp | Yes |
| GET | `/api/suppliers/` | Lista fornitori con KPI | Yes |
| GET | `/api/suppliers/<name>/` | Dettaglio fornitore + cache | Yes |
| GET | `/api/settings/` | Impostazioni app | Yes |
| PATCH | `/api/settings/` | Aggiorna impostazioni | Yes |
| DELETE | `/api/settings/cache/` | Svuota cache colonne Redis DB 2 | Yes |
| GET | `/api/notifications/` | Notifiche pending | Yes |
| GET | `/api/search/?q=` | Ricerca documenti | Yes |
| POST | `/api/dev/reset/` | Cancella tutti i dati (DEV ONLY) | Yes |

### FastAPI (port 8001)

| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| POST | `/parse/csv` | Parse CSV/Excel → JSON schema |
| POST | `/ocr/upload` | OCR immagine (bytes) → JSON schema |
| POST | `/ocr/image` | OCR immagine (URL) → JSON schema |
| POST | `/classify/document` | Classifica tipo documento |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |

---

## 3.4 Bug noti e limitazioni

### 1. OCR accuracy su tabelle dense

Foto con 5+ colonne (COLLI, QTÀ/COLLO, QTÀ TOTALE) a bassa risoluzione → GPT-4o Vision talvolta legge colonna sbagliata.

**Workaround**: foto ad alta risoluzione (> 2000px), angolo perpendicolare, illuminazione uniforme.

**Future fix**: preprocessing OCR (contrast enhancement, deskewing), human-in-the-loop flag per low-confidence.

### 2. Tariffari multi-dimensionali

Tariffario Zona A/B/C × Standard/Express non si mappa nei 7 campi standard. Il sistema usa raw_data + L2 full semantic, che funziona ma perde la rappresentazione normalizzata.

**Future fix**: colonne array PostgreSQL per dimensioni, matrice pivot in UI.

### 3. No WebSocket push

Riconciliazione completa ma operatore non vede aggiornamento in real-time — deve refreshare la pagina.

**Future fix**: Django Channels + WebSocket server. Celery task emette evento → browser aggiorna live.

### 4. ngrok URL cambia al restart

Free ngrok account genera nuovo URL a ogni sessione (< 2h). Aggiornamento manuale in Twilio Console necessario.

**Future fix**: deploy su VPS con dominio custom + webhook permanente, oppure ngrok pro account.

---

## 3.5 Talking points per la presentazione

**1. Perché GPT-4o invece di regex/keyword mapping?**
Ogni fornitore usa diversi nomi colonne — tedesco "MENGE", italiano "Quantità", inglese "QTY". Con regex, dovremmo mantenere 50+ pattern per ogni lingua. GPT-4o capisce il contesto semantico: legge le prime righe e sa che "MENGE" è quantità anche senza pattern esplicito. Funziona in 5 lingue senza retraining.

**2. Come funziona la cascata L1 → L2 → L3?**
L1 è veloce e matematico (< 1ms). Se matcha perfettamente, auto-approva. Se no, L2 GPT-4o legge il contesto: c'è una nota di back-order? È uno sconto promozionale? L2 classifica ogni discrepanza come error/warning/info. L3 decide: nessun error → auto-approva; errori rimasti → PENDING per revisione. Il 90% dei documenti viene approvato automaticamente.

**3. Perché due servizi Python separati?**
Django è ottimo per ORM, migrations, admin — cose che FastAPI non fa bene. FastAPI è veloce per async GPT calls. Separati: se il parsing si blocca su un file grande, non tira giù l'API principale. E posso scalare solo i FastAPI worker se il parsing è il bottleneck.

**4. Come gestisci la non-determinism di GPT?**
Memorizzo TUTTI i valori originali CSV in `raw_data` JSONB. Anche se GPT sbaglia il mapping, L2 ha ancora i dati grezzi per validare. Inoltre cache il mapping per supplier + header fingerprint per 30 giorni — stesso fornitore, stesso layout → skip GPT (-80% cost).

**5. Come funziona il supplier matching?**
Normalizzo i nomi (uppercase, strip accents, remove suffissi come S.p.A., SRL, GmbH), poi fuzzy match con WRatio threshold 92. "Trans-Log Express S.p.A." e "TransLog Express SRL" → stesso canonical. Cache Redis DB 1 TTL 24h — 95% suppliers sono repeat.

**6. Perché dual data model (7 campi + raw_data JSONB)?**
I 7 campi sono indexati, veloci per L1 math comparison. Ma tariffari hanno 15+ colonne dinamiche. `raw_data` JSONB preserva tutto. L2 GPT legge semantica su raw_data. Best of both worlds: velocità per standard docs, flessibilità per non-standard.

**7. Come funziona la cache Redis per colonne?**
Estraggo gli header, calcolo fingerprint SHA-256, key Redis: `col_map:{supplier_hash}:{headers_hash}`, TTL 30 giorni. Hit → uso schema cached (0 GPT calls). Miss → chiamo GPT, salvo. Risparmio ~80% GPT calls per repeat suppliers.

**8. Complementary doc types — come eviti riconciliazioni sbagliate?**
Lista coppie "complementary": order+invoice, order+ddt, ecc. Tipi transazionali (order, invoice) → solo stesso numero documento. Tipi versionabili (price_list, tariff) → stesso tipo + stesso fornitore. Per coppie ambigue, chiedo a GPT.

**9. Perché L2 selettivo?**
Un file 100 righe × 2 documenti = 200 righe ≈ $0.01/riconciliazione. Se L1 trova 10 righe discrepanti su 100, invio SOLO quelle 10 a L2 → -80% token, stessa accuracy.

**10. Redis a 3 database logici?**
DB 0: Celery broker (volatile, ok se persi). DB 1: embedding cache TTL 24h. DB 2: column mapping TTL 30 giorni. Separazione di concerns, monitoring indipendente. Se Redis crasha, perdo cache ma non business data (PostgreSQL è safe).

**11. Come funziona OCR con Twilio + ngrok?**
Operatore invia foto WhatsApp → Twilio → ngrok → Django webhook. Django verifica firma HMAC Twilio, scarica media bytes (authenticated URL), POST a FastAPI `/ocr/upload`. GPT-4o Vision estrae dati strutturati. Resto è identico a CSV parsing.

**12. Perché Docker Compose invece di Kubernetes?**
`docker compose up` è one-command setup. Per prototipo e development è perfetto. Kubernetes aggiunge complessità (yaml manifesti, namespaces, ingress) che non serve ora. Quando la scale richiede HA + horizontal scaling, migrerò.

**13. Come testi un sistema che dipende da GPT?**
116 unit test con pytest. Per parsing CSV, httpx MockTransport intercetta call OpenAI e ritorna JSON hardcoded → test in < 1s, zero API cost. E2E runner `test_agent.py` carica VERI file, aspetta processing reale, valida estratti. `--skip-ai` permette E2E senza GPT.

**14. Cosa succede se GPT è lento (timeout)?**
L2 semantic ha timeout 30s. Se supera, task Celery fallisce con `status=ERROR`, messaggio in UI. Retry automatico max 3 volte (countdown 60s). In produzione: exponential backoff + dead-letter queue per review manuale.

**15. Come scalare il sistema?**
Bottleneck parsing → aggiungi container `celery_worker`. Redis bottleneck → Redis Cluster. DB lento → PostgreSQL read replicas. True HA → Kubernetes + managed services (AWS RDS, ElastiCache).

**16. Cosa manca e cosa rifarei?**
Manca WebSocket push (operatore vede live quando completa). Manca vector DB per embeddings (Redis JSON → pgvector/Pinecone per semantic search). Rifarei: LLM provider abstraction (ora tightly coupled a OpenAI). Aggiungerei: confidence-based retry (doc_type_confidence < 50 → retry con più preview). Frontend test coverage (Jest/Playwright).
