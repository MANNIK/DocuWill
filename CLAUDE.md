# CLAUDE.md — Contesto progetto WeWill Challenge

## Obiettivo del progetto

Sistema di gestione e riconciliazione automatica di documenti aziendali (ordini, fatture, DDT, tariffari, packing list, export spedizioni). Ogni fornitore manda documenti con strutture diverse — CSV con header non standard, foto WhatsApp di modulistica cartacea — e il sistema deve:

1. Ingestionare CSV/Excel dalla dashboard (qualsiasi struttura, qualsiasi lingua)
2. Ricevere foto WhatsApp di documenti cartacei via webhook
3. Riconciliare automaticamente i due documenti (trovare le discrepanze)
4. Presentare all'operatore le discrepanze per approvazione/rifiuto

Contesto business: challenge tecnica per entrare in WeWill (startup italiana). Valutazione su ragionamento architetturale, qualità codice, gestione edge case. Repo privato con invite a emilio.tracanella@wewill.ai.

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|-----------|
| Frontend | Next.js (App Router) + React + TypeScript + design system custom "Quoro" (classi `q-*`) |
| Backend principale | Django 5.0 + DRF + django-environ |
| Database | PostgreSQL 16 |
| Microservizio AI | FastAPI + uvicorn |
| Task queue | Celery 5.4 + Redis 7 |
| LLM | OpenAI GPT-4o (via `openai` SDK) |
| Containerizzazione | Docker + Docker Compose |

**Librerie chiave:**
- Backend: `djangorestframework`, `djangorestframework-simplejwt`, `django-cors-headers`, `httpx`, `celery`, `psycopg2-binary`, `openai`
- AI Service: `fastapi`, `pandas`, `openpyxl`, `anthropic` (rimossa, ora solo `openai`)
- Frontend: Next.js 16 con App Router, Tailwind CSS

---

## Struttura del progetto

```
wewill-challenge/
├── docker-compose.yml
├── .env.backend          ← variabili Django/Celery/DB/OpenAI
├── .env.ai               ← variabili ai_service (minimale, gitignored)
├── .env.frontend         ← variabili Next.js
├── .gitignore
├── CLAUDE.md
├── README.md
│
├── backend/              ← Django
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── manage.py
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py   ← settings comuni
│   │   │   └── local.py  ← import base + DEBUG=True
│   │   ├── celery.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── config/settings/  ← base.py + local.py + test.py (pytest, SQLite in-memory)
│   ├── tests/            ← pytest Django/DRF + riconciliazione (conftest, 5 file test)
│   └── doc_manager/      ← app principale
│       ├── models.py     ← AppSettings, Document, DocumentRow, Reconciliation, Discrepancy
│       ├── views.py      ← API endpoints (IsAuthenticated)
│       ├── serializers.py
│       ├── tasks.py      ← Celery task principale (process_document_task)
│       ├── reconciliation.py ← logica riconciliazione a cascata (L1→L2→L3) + embedding cache
│       ├── tariff_reconciliation.py ← confronto deterministico per tariffari/doc non-standard
│       ├── throttling.py ← classi throttle scoped (UploadBurst, Register, Webhook, LoginBurst)
│       ├── utils.py      ← is_safe_external_url() (anti-SSRF), normalize_supplier, canonical
│       ├── management/commands/ ← normalize_existing_suppliers (backfill supplier_canonical)
│       ├── migrations/   ← 0001→0007
│       ├── urls.py
│       └── admin.py
│
├── ai_service/           ← FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── deps.py           ← dependency require_internal_token (header X-Internal-Token)
│   ├── tests/            ← pytest (csv_parser, supplier_normalize) — tutto mocked
│   ├── utils/            ← supplier.py (normalize_for_cache, KEEP IN SYNC con backend)
│   └── routers/
│       ├── __init__.py
│       ├── csv_parser.py ← parsing CSV/Excel con GPT-4o
│       ├── table_segmentation.py ← rilevamento multi-tabella deterministico (zero GPT)
│       ├── ocr.py        ← OCR immagini con GPT-4o Vision (/ocr/image + /ocr/upload)
│       └── classifier.py ← classificazione tipo documento
│
├── frontend/             ← Next.js (design system "Quoro")
│   ├── Dockerfile
│   └── src/
│       ├── app/v2/       ← UI attiva: dashboard, upload, inbox, reconciliations,
│       │                   documents/[id], suppliers, settings, profile
│       ├── components/v2/ ← primitivi + widget (Card, Pill, DocCard, DiscrepancyRail, …)
│       └── lib/api.ts    ← client HTTP tipizzato con JWT auto-refresh
│
└── scripts/
    ├── start-worker.sh
    ├── start-beat.sh
    ├── test_agent.py     ← runner E2E black-box
    └── generate_ocr_docs.py ← genera HTML→PDF per test OCR
```

---

## Architettura e decisioni tecniche

### Flusso principale
```
CSV upload → Django (crea Document pending) → Celery task
  → FastAPI /parse/csv → GPT-4o capisce struttura → estrae righe
  → Django persiste Document + DocumentRow
  → find_and_reconcile() cerca candidato
  → Riconciliazione a cascata (L1 math → L2 GPT-4o semantico → L3 decisione)
  → Reconciliation + Discrepancy salvati
  → Operatore vede tutto nella UI v2 (dashboard, coda, dettaglio riconciliazione)

Foto WhatsApp / upload immagine → webhook/endpoint Django → Celery task
  → FastAPI /ocr/upload (bytes) o /ocr/image (URL) → GPT-4o Vision estrae dati
  → stesso flusso di riconciliazione
```

### Decisioni architetturali chiave

**Parser CSV — GPT-4o invece di keyword matching**
Scartato approccio con liste di keyword per trovare header e mappare colonne. Usato GPT-4o: riceve un preview compatto (testa + coda di ogni tabella + tutte le righe header-like), restituisce JSON con `header_row_index`, `data_row_indices`, `column_mapping`, `metadata`, `doc_type` per ogni sezione. Poi Python usa quella struttura per estrarre tutte le righe del file (anche 564+).

**Multi-sezione: rilevamento deterministico dei confini (zero GPT)**
File 04-multi-table.csv aveva ordini di 2 fornitori diversi nello stesso file. Prima di chiamare GPT, `table_segmentation.detect_table_segments()` scorre TUTTE le righe in puro Python e trova i confini fisici delle tabelle con segnali strutturali: confine di sheet Excel, N righe vuote consecutive, header ripetuto, cambio brusco del n° colonne piene, shift della "firma" di riga (da righe-dati numeriche a riga-header testuale). I confini ambigui (`confidence=low`) sono confermati da una sola chiamata GPT batch (`confirm_ambiguous_boundaries`). `build_segmented_preview()` manda a GPT testa (15) + coda (5) di ogni segmento PIÙ tutte le righe che "sembrano header" — così GPT vede l'inizio di ogni tabella anche oltre la riga 50. GPT restituisce una lista di sezioni, ognuna diventa un `Document` separato nel DB (cap `MAX_SECTIONS=20`).

**Riconciliazione a cascata (3 livelli)**
- L1: confronto matematico esatto (gratuito, millisecondi) — se tutto quadra, stop
- L2: GPT-4o valuta SOLO le discrepanze trovate dal L1 (non manda tutto il doc, solo le righe coinvolte nelle discrepanze → risparmio ~10x token)
- L3: se dopo L2 nessun `severity=error`, auto-approva; altrimenti rimane `pending` per l'operatore

**Matching documenti**
`compute_match_score()` calcola score 0-100 su: numero documento identico (+50), stesso fornitore (+30), stessa data (+10), totali simili (+5-10), overlap codici articolo Jaccard (+10-40). Soglia minima: 30. `are_documents_complementary()` chiede a GPT se la coppia ha senso prima di tentare il match (evita di riconciliare due ordini identici).

**Estrazione righe da file grandi**
GPT vede solo un campione (testa + coda di ogni segmento) per capire la struttura. Il `data_row_indices` restituito copre solo il campione: per i file a sezione singola, l'estrazione estende automaticamente `data_row_indices` dalla prima riga dati fino alla fine del file, senza ulteriori chiamate API.

**Tariffari e documenti non-standard — confronto deterministico (`tariff_reconciliation.py`)**
Per i tariffari (price_list) il confronto numerico non passa più da GPT (costoso, non deterministico, non scala). `reconcile_nonstandard()` normalizza i due `raw_data` — gestendo sia il formato CSV (nomi colonna originali) sia quello OCR (item_code "esploso" con dimensioni nel codice) — classifica le colonne (chiave vs valore numerico vs valuta), allinea le righe per chiave e confronta i numeri con tolleranza. Tutto in Python.

---

## Stato attuale

### ✅ Implementato e funzionante

**Infrastruttura**
- Docker Compose con tutti e 7 i container (Django, FastAPI, Celery worker, Celery beat, PostgreSQL, Redis, Next.js)
- Settings Django con `base.py` + `local.py`, `DJANGO_SETTINGS_MODULE=config.settings.local`
- Celery connesso a Redis, task `process_document_task` registrato e funzionante

**Backend Django**
- Modelli: `AppSettings`, `Document`, `DocumentRow`, `Reconciliation`, `Discrepancy` con tutte le relazioni
- API endpoints completi (vedi sezione "Endpoint API principali"): documents (+upload, +upload-image), reconciliations (+review), discrepancies, suppliers, settings (+cache), dashboard/stats, whatsapp inbox+webhook, notifications, search, auth (register/logout/me/token), dev/reset
- Tutti gli endpoint protetti da JWT (`IsAuthenticated`); object-level authz su `created_by` (404, non 403)
- Admin Django registrato per tutti i modelli
- Celery task che chiama FastAPI, persiste dati, lancia riconciliazione

**FastAPI AI Service**
- `POST /parse/csv` — parser universale CSV/Excel con GPT-4o
  - Rileva separatore automaticamente (`,` `;` `\t` `|`)
  - Gestisce encoding (UTF-8, latin-1, cp1252)
  - Gestisce multi-sezione (un file → N documenti)
  - Estrae tutte le righe (non solo il campione di 50)
  - Restituisce `ParsedDocumentList` con lista di `ParsedDocument`
- `POST /ocr/image` — OCR con GPT-4o Vision
- `POST /classify/document` — classificazione tipo documento

**Riconciliazione**
- `find_and_reconcile()` — trova il miglior candidato con score composito
- `are_documents_complementary()` — GPT decide se la coppia ha senso
- `level1_exact_match()` — confronto matematico
- `level2_semantic_check()` — GPT valuta discrepanze (solo righe coinvolte)
- `level3_decide()` — auto-approva se nessun errore reale
- `reconcile_nonstandard()` (`tariff_reconciliation.py`) — confronto deterministico per tariffari/doc non-standard
- Embedding cache su Redis DB 1 (`_embed()`: dict in-process → Redis TTL 24h → OpenAI text-embedding-3-small), cosine similarity in puro Python, fail-soft
- Prefiltro candidati per `supplier_canonical` + cap `MAX_RECON_CANDIDATES=25`

**Testato con file reali:**
- 01-simple-order.csv ✅
- 02-european-invoice.csv ✅ (separatore `;`, numeri europei)
- 03-header-offset.csv ✅ (metadati sopra l'header)
- 04-multi-table.csv ✅ (multi-sezione, 2 fornitori)
- 05-multi-sheet.xlsx ✅ (3 sheet separati)
- 06-dirty-data.csv ✅ (dati sporchi, righe vuote, sottotitoli)
- 07-nested-packing.csv ✅ (sub-items, 2 delivery note)
- 08-large-courier-export.csv ✅ (564 righe estratte)
- 09-shipping-tariff.csv ✅ (4 sezioni tariffarie)

Riconciliazione testata con 04+07: trovata discrepanza quantità su ALP-843 (ordinati 4, consegnati 6).

**Sicurezza (implementata 2026-06-16)**
- Rate limiting scoped: `UploadBurstThrottle` (10/min), `RegisterThrottle` (5/ora), `WebhookThrottle` (60/min) — nessun throttle globale (romperebbe il polling della UI)
- Quota giornaliera per utente (default 200 documenti/giorno) via `AppSettings.daily_document_quota`
- Anti-SSRF: `is_safe_external_url()` in `utils.py` risolve il DNS e rifiuta tutti gli IP privati/loopback/link-local incluso `169.254.169.254`; `follow_redirects=False` nel fetch Twilio
- Autenticazione interna backend↔ai_service via header `X-Internal-Token` (dep `require_internal_token` in `deps.py`); porta 8001 rimossa dall'host Docker
- JWT hardening: `ACCESS_TOKEN_LIFETIME=60min` (override via `JWT_ACCESS_MINUTES`), `ROTATE_REFRESH_TOKENS=True`, blacklist al logout; endpoint `POST /api/auth/logout/`; throttle dedicato sul login (`LoginBurstThrottle`)
- Validazione upload: estensione + dimensione (max 10 MB) nel serializer; magic bytes MIME per le immagini nel router OCR
- Cap `MAX_SECTIONS=20` in csv_parser (evita amplificazione LLM con file ostili)
- Cap `MAX_RECON_CANDIDATES=25` in reconciliation + prefiltro per `supplier_canonical` (O(N) LLM → O(1) ammortizzato)
- Prompt injection guard in tutti e 3 i router AI: blocco esplicito nel prompt, campo `injection_detected` nella risposta GPT → HTTP 422 se rilevato
- CORS da env (`CORS_ALLOWED_ORIGINS`), prima era `CORS_ALLOW_ALL_ORIGINS=True`
- Security headers HTTP (HSTS, X-Frame-Options, NOSNIFF) attivi solo in produzione (`not DEBUG`)
- `error_message` generico verso il client; stack trace solo nei log server
- Cache Redis DB 3 condivisa tra processi per i contatori throttle
- `.env.ai` minimale per ai_service (non vede `DJANGO_SECRET_KEY`, `DATABASE_URL`, `TWILIO_*`)
- `conftest.py` nei test: `cache.clear()` prima di ogni test, throttle rates altissimi per i test

**Frontend Next.js (design system "Quoro" — `app/v2/`)**
- Dashboard con KPI, coda riconciliazione, grafici ingestion/discrepanze, documenti recenti
- Upload multiplo (un `UploadJob` per file, progress async), inbox WhatsApp/immagini
- Lista + dettaglio riconciliazione (DocCard pair + DiscrepancyRail), dettaglio documento (`documents/[id]`), suppliers, settings, profilo
- Client `lib/api.ts` tipizzato con JWT auto-refresh su 401

**Autenticazione JWT** — enforced su tutti gli endpoint (`IsAuthenticated`); login/register/logout/me funzionanti

**Test automatici** — pytest backend (`backend/tests/`, 5 file) e ai_service (`ai_service/tests/`, 3 file), tutto mockato (zero OpenAI/Redis reali)

**Cache per-fornitore** — implementata: column-mapping cache su Redis DB 2 (key `col_map:<supplier_hash>:<headers_hash>`, TTL 30gg)

### 🔴 Non ancora iniziato / parziale

- **WhatsApp integration reale** — webhook funziona; integrazione Twilio/Meta API end-to-end non completata
- **WebSocket/notifiche push** — endpoint notifications via polling; nessun push real-time
- **Confidence check con retry** — `doc_type_confidence` estratto ma non usato per retry con più contesto

---

## Problemi noti e workaround

### Bug storici (risolti — tenuti come memoria)

1. **Riepilogo finale incluso nelle righe (file 08)** — risolto: la coda di ogni segmento è mostrata a GPT (`build_segmented_preview`) così le righe `RIEPILOGO`/`Totale` vengono escluse dai `data_row_indices`.
2. **`quantity` su "Qty per Box" invece di "Total Qty" (file 07)** — risolto con regola dedicata nel prompt di struttura.
3. **`discount` invece di `total_price` per prezzi scontati (file 06)** — risolto: "Prezzo Scontato/Importo Netto/Prezzo Finale" → `total_price`, "Sconto %" → `discount` nel prompt.
4. **`doc_type: "summary"` non in TypeChoices** — risolto: aggiunti `SUMMARY` e `INVENTORY` a `Document.TypeChoices`.
5. **Floating point nei totali** (`8155.650000000001`) — risolto con `round(total, 2)`.

### Limitazioni note

- Il preview mandato a GPT è un campione (testa+coda di ogni segmento + righe header-like): per file con struttura che cambia in mezzo a un segmento il mapping può sbagliare in casi estremi.
- `are_documents_complementary()` chiama GPT per ogni coppia candidata; mitigato dal prefiltro `supplier_canonical` + cap `MAX_RECON_CANDIDATES=25`.
- File con encoding non standard (es. windows-1252 con caratteri speciali) può fallire silenziosamente.

---

## Prossimi passi (residui)

### 1. WhatsApp integration reale
Il webhook esiste; manca l'integrazione end-to-end con Twilio sandbox o Meta API per il flusso completo foto→OCR→riconciliazione in produzione.

### 2. Notifiche push real-time
Le notifiche sono via polling (`/api/notifications/`); valutare WebSocket/SSE per il push immediato all'operatore quando L3 lascia una riconciliazione `pending`.

### 3. README
Scrivere README con: architettura, come eseguire (`docker compose up`), scelte tecniche, cosa è implementato/cosa no.

### 4. (Bonus) Confidence check con retry
Se `doc_type_confidence < 50`, ritentare con più righe di preview.

---

## Convenzioni e regole

### Naming
- App Django: `doc_manager` (non `documents` — conflitto con modulo Python)
- Settings: `config.settings.local` per dev, mai `config.settings` direttamente
- File env: `.env.backend` per Django/Celery/DB, `.env.frontend` per Next.js, `.env.ai` per ai_service (minimale)

### Pattern Django
- Tutte le view usano `permission_classes = [IsAuthenticated]`; l'authz object-level filtra per `created_by=request.user` e risponde 404 (non 403) sugli oggetti altrui
- I task Celery importano i modelli dentro la funzione (non a livello modulo) per evitare problemi di circular import
- `_update_document()` e `_save_ocr_result()` sono helper in `tasks.py` per evitare duplicazione tra primo documento e sezioni aggiuntive
- Il throttle va applicato **view-per-view** con classi scoped, mai globalmente in `DEFAULT_THROTTLE_CLASSES` — gli endpoint di polling della UI (dashboard/stats, notifications, documents, reconciliations) generano ~1800 req/ora e verrebbero bloccati in meno di un minuto
- Ogni chiamata `httpx` verso ai_service deve includere `headers=_ai_headers()` (token interno)
- Validare `media_url` con `is_safe_external_url()` prima di qualsiasi fetch da URL esterno; usare `follow_redirects=False`

### Pattern sicurezza
- Aggiungere un blocco prompt injection guard **prima** del contenuto del documento in tutti i prompt GPT che ricevono testo utente
- Controllare `injection_detected` nella risposta GPT; se `True` → log server-side + HTTP 422 al client con messaggio generico
- Non esporre stack trace al client: `error_message` generico nel modello, `logger.exception()` per i dettagli
- Le image upload devono essere validate con magic bytes (non solo estensione dichiarata dall'utente)

### Pattern FastAPI
- Il parser CSV NON usa pandas per la lettura iniziale — splitta manualmente per riga per non perdere righe "malformate" che sono titoli di sezione
- GPT vede sempre il file come testo tabellare con formato `"Riga N: val1 | val2 | val3"`
- La risposta di GPT viene sempre pulita da eventuali backtick markdown prima del `json.loads()`

### Cose da NON fare
- Non usare keyword hardcoded per trovare header o mappare colonne — tutto demandato a GPT
- Non usare `COMPLEMENTARY_TYPES` dict hardcoded per decidere quali tipi matchare — usare `are_documents_complementary()` con GPT
- Non mandare tutto il documento a GPT nel livello 2 della riconciliazione — solo le righe coinvolte nelle discrepanze
- Non usare `pandas.read_csv()` con `header=None` per file multi-sezione — usa split manuale
- Non commitare `.env.backend`, `.env.frontend` o `.env.ai` — sono in `.gitignore`
- Non aggiungere throttle a `DEFAULT_THROTTLE_CLASSES` — rompe il polling della UI (vedi sezione sicurezza in Stato attuale)
- Non usare `follow_redirects=True` per fetch di URL forniti dall'utente — bypass SSRF
- Non mandare a GPT URL o path di sistema come parte del contesto documento — vettore di prompt injection
- Non esporre `str(exc)` come `error_message` nel modello — usa messaggio generico e logga con `logger.exception()`

---

## Snippet e strutture dati chiave

### Struttura risposta FastAPI `/parse/csv`
```json
{
  "documents": [
    {
      "doc_type": "order",
      "supplier_name": "Nordic Design AB",
      "document_number": "ORD-2026-W07",
      "document_date": "09/02/2026",
      "total_amount": null,
      "rows": [
        {
          "row_index": 0,
          "item_code": "FRN-045",
          "description": "Tavolo multifunzione",
          "quantity": 50,
          "unit": "",
          "unit_price": 97.09,
          "total_price": null,
          "discount": 0,
          "raw_data": {"col_0": "FRN-045", "col_1": "Bianco lucido", ...}
        }
      ],
      "raw_extracted": {
        "filename": "03-header-offset.csv",
        "section_name": "Order from Nordic Design AB",
        "total_rows": 3,
        "doc_type_confidence": 90,
        "claude_structure": { ... }
      }
    }
  ],
  "total_sections": 1
}
```

### Struttura JSON discrepanza
```json
{
  "type": "quantity_mismatch",
  "field": "quantity",
  "value_doc1": "4.0000",
  "value_doc2": "6.0000",
  "severity": "error",
  "note": "Quantità ordinate diverse da quelle nella packing list"
}
```

### Prompt GPT per struttura CSV (estratto chiave)
```
Rispondi SOLO con JSON valido:
{
  "sections": [
    {
      "section_name": "...",
      "header_row_index": <int o null>,
      "data_row_indices": [<lista indici righe dati>],
      "column_mapping": {"<idx>": "item_code|description|quantity|unit|unit_price|total_price|discount|ignore"},
      "metadata": {"supplier_name": "", "document_number": "", "document_date": "", "total_amount": null},
      "doc_type": "order|invoice|ddt|price_list|packing_list|shipment|confirmation|summary|inventory|unknown",
      "doc_type_confidence": <0-100>,
      "notes": ""
    }
  ]
}
```

### Variabili d'ambiente richieste (`.env.backend`)
```
POSTGRES_DB=wewill
POSTGRES_USER=wewill
POSTGRES_PASSWORD=wewill_dev
DJANGO_SECRET_KEY=<generare con get_random_secret_key()>
DJANGO_DEBUG=1
DATABASE_URL=postgresql://wewill:wewill_dev@db:5432/wewill
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
OPENAI_API_KEY=sk-...
AI_SERVICE_URL=http://ai_service:8001
AI_SERVICE_TOKEN=<token condiviso con .env.ai, generare con secrets.token_hex(32)>
WHATSAPP_DEV_MODE=1
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### Variabili d'ambiente richieste (`.env.ai`)
```
OPENAI_API_KEY=sk-...
AI_SERVICE_TOKEN=<stesso token di .env.backend>
CELERY_BROKER_URL=redis://redis:6379/0
```
`AI_SERVICE_TOKEN` va generato una volta sola (`python -c "import secrets; print(secrets.token_hex(32))"`) e copiato identico nei due file env. Se lasciato vuoto il token viene saltato (modalità dev senza autenticazione interna).

### Comando per avviare tutto
```bash
docker compose up
# oppure per rebuild dopo modifiche Python
docker compose up --build
```

### Comando per pulire DB durante sviluppo
```bash
docker compose run --rm backend python manage.py shell -c "
from doc_manager.models import Document, Reconciliation, Discrepancy
Discrepancy.objects.all().delete()
Reconciliation.objects.all().delete()
Document.objects.all().delete()
print('DB pulito')
"
```

### Endpoint API principali (tutti JWT, `IsAuthenticated`)
```
# Auth
POST /api/auth/token/                   login → access+refresh (throttled)
POST /api/auth/token/refresh/           refresh access token
POST /api/auth/register/                registrazione
POST /api/auth/logout/                  blacklist refresh token
GET  /api/auth/me/                      utente corrente

# Documenti
GET  /api/documents/                    lista documenti
POST /api/documents/upload/             upload CSV/Excel (multipart, field: file)
POST /api/documents/upload-image/       upload immagine documento (OCR)
GET  /api/documents/<id>/               dettaglio documento con righe

# Riconciliazioni / discrepanze
GET  /api/reconciliations/              lista
GET  /api/reconciliations/<id>/         dettaglio con discrepanze
PATCH /api/reconciliations/<id>/review/ {status, operator_notes}
PATCH /api/discrepancies/<id>/          aggiorna singola discrepanza

# Fornitori / settings / utility
GET  /api/suppliers/  ·  GET /api/suppliers/<name>/
GET/PATCH /api/settings/  ·  POST /api/settings/cache/   (clear cache)
GET  /api/dashboard/stats/              KPI + coda + grafici + recent docs
GET  /api/whatsapp/inbox/  ·  POST /api/webhook/whatsapp/
GET  /api/notifications/  ·  GET /api/search/
POST /api/dev/reset/                    pulisce il DB (solo dev)

# FastAPI (porta 8001, interno — header X-Internal-Token)
POST /parse/csv                        upload file CSV/Excel
POST /ocr/image                        {image_url, caption}
POST /ocr/upload                       upload immagine (bytes)
POST /classify/document                classifica tipo documento
GET  /docs                             Swagger UI
```

### Modelli Django — campi chiave
```python
AppSettings (singleton):
  daily_document_quota (default 200), altri parametri runtime

Document:
  source: upload | whatsapp | image
  doc_type: unknown|order|invoice|ddt|price_list|packing_list|shipment|confirmation|summary|inventory
  status: pending | processed | error
  supplier_name, supplier_canonical (db_index), document_number, document_date, total_amount
  created_by: FK(User)  ← authz object-level
  file_hash: SHA-256 del contenuto  ← dedup upload
  extracted_data: JSONField (raw output FastAPI)
  error_message: TextField

DocumentRow:
  document: FK(Document)
  row_index, item_code, description, quantity, unit
  unit_price, total_price, discount
  raw_data: JSONField

Reconciliation:
  doc1, doc2: FK(Document)
  status: pending | approved | rejected | corrected
  match_confidence: 0-100
  discrepancies: JSONField (lista discrepanze)
  operator_notes: TextField

Discrepancy:
  reconciliation: FK(Reconciliation)
  discrepancy_type: missing_in_doc2|extra_in_doc2|quantity_mismatch|
                    price_mismatch|date_mismatch|total_mismatch|
                    description_mismatch|code_mismatch|unit_mismatch|discount_mismatch
  field_name, value_doc1, value_doc2
  severity: info | warning | error
```
