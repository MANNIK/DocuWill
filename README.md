# WeWill — Document Reconciliation System

Automatic ingestion and reconciliation of business documents (orders, invoices, DDTs, price lists, packing lists, shipment exports). Each supplier sends documents with different structures — non-standard CSV headers, WhatsApp photos of paper forms — and the system reconciles them automatically, surfacing discrepancies for operator review.

Built as a technical challenge for WeWill.

---

## Architecture

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

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript + Tailwind | Modern, typed, app router |
| Backend | Django 5.0 + DRF + django-environ | Solid ORM, admin, JWT auth |
| AI microservice | FastAPI + uvicorn | Async, separate from Django, faster parsing |
| Task queue | Celery 5.4 + Redis 7 | Async processing — OCR/parsing can take 10-30s |
| LLM | OpenAI GPT-4o | Vision + structured JSON output, multilingual |
| Embeddings | OpenAI text-embedding-3-small | Supplier name matching, section similarity |
| Database | PostgreSQL 16 | Reliable, JSONB for raw_data |
| Containers | Docker + Docker Compose | One-command setup |
| WhatsApp | Twilio WhatsApp Sandbox | Free tier, webhook HTTP, easiest for dev |
| Tunnel | ngrok (Docker service) | Expose localhost to Twilio |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- OpenAI API key

### 1. Clone and configure

```bash
git clone <repo>
cd wewill-challenge
```

Create `.env.backend` (see `.env.backend.example` for reference):

```env
POSTGRES_DB=wewill
POSTGRES_USER=wewill
POSTGRES_PASSWORD=wewill_dev
DJANGO_SECRET_KEY=<generate with python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())">
DJANGO_DEBUG=1
DATABASE_URL=postgresql://wewill:wewill_dev@db:5432/wewill
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
OPENAI_API_KEY=sk-...
AI_SERVICE_URL=http://ai_service:8001

# Twilio (optional — leave empty to use mock mode)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# ngrok (optional — only needed for WhatsApp testing)
NGROK_AUTHTOKEN=
```

### 2. Start

```bash
docker compose up
```

First run applies migrations automatically. Services:
- `http://localhost:3000` — Frontend
- `http://localhost:8000` — Django API
- `http://localhost:8001/docs` — FastAPI Swagger UI
- `http://localhost:8000/admin/` — Django Admin

### 3. Create admin user

```bash
docker compose run --rm backend python manage.py createsuperuser
```

### 4. Login

Go to `http://localhost:3000/login` and use the superuser credentials.

---

## WhatsApp Integration (optional)

The system supports two modes:

**Mock mode** (no Twilio needed): POST JSON directly to the webhook:
```bash
curl -X POST http://localhost:8000/api/webhook/whatsapp/ \
  -H "Content-Type: application/json" \
  -d '{"from": "+39123", "media_url": "https://...", "caption": ""}'
```

**Twilio Sandbox** (real WhatsApp):

1. Create free account at [twilio.com](https://twilio.com)
2. Console → Messaging → Try it out → Send a WhatsApp message
3. Get ngrok authtoken from [dashboard.ngrok.com](https://dashboard.ngrok.com)
4. Fill `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `NGROK_AUTHTOKEN` in `.env.backend`
5. Start with ngrok:
   ```bash
   docker compose --profile whatsapp up
   ```
6. Get public URL: `http://localhost:4040`
7. In Twilio Console → Sandbox Settings → webhook: `https://<ngrok-url>/api/webhook/whatsapp/`
8. Send a photo to the Twilio sandbox number from your phone

---

## Key Architectural Decisions

### 1. GPT-4o for parsing instead of keyword/regex mapping

**The problem**: every supplier uses different column names, languages, layouts. A keyword-based mapper ("if column contains 'qty' → quantity") breaks immediately on a German supplier.

**Our approach**: GPT-4o reads the first 50 rows + last 15 rows of any file and returns a structured JSON schema: `{header_row_index, column_mapping, sections, doc_type, metadata}`. Python then uses this schema to extract all rows — even files with 500+ rows.

**Trade-off**: GPT can make inconsistent mapping decisions across two parse calls of the same file (non-determinism). We mitigate this by storing ALL original column values in `raw_data` with their real header names, making the reconciliation comparison resilient to mapping differences.

### 2. Dual data model: normalized fields + raw_data

Each `DocumentRow` has two representations:
- **7 standard fields** (`item_code`, `description`, `quantity`, `unit_price`, etc.) — normalized by GPT, used by L1 math comparison
- **`raw_data` dict** — all original CSV cell values with real column names (`{"Standard €": 4.90, "Express €": 7.50, ...}`) — used by L2 semantic for non-standard documents

This allows the reconciliation to use fast exact comparison for standard documents (orders, invoices) and full semantic comparison for non-standard ones (tariff tables, zone pricing).

### 3. Adaptive reconciliation cascade

**L1** uses the 7 standard fields — free, deterministic, milliseconds. Works for 90% of order/invoice/DDT pairs.

**L2 standard**: GPT sees only the discrepant rows (not the whole document), saving ~10x tokens vs sending everything.

**L2 full semantic**: For non-standard document pairs (tariff + price confirmation), L1 is skipped entirely. GPT receives the complete `raw_data` of both documents with original column names and finds discrepancies semantically. Affordable because non-standard documents are small by definition.

### 4. Embedding-based supplier matching

Exact string matching breaks on supplier name variants ("TransLog Express S.p.A." vs "Trans-Log Express"). We use `text-embedding-3-small` with cosine similarity (threshold 0.88) to match suppliers across documents. Results are cached in Redis (TTL 24h) shared across all Celery workers.

### 5. Complementary document type detection

Two documents are reconcilable if they're semantically complementary:
- **Known pairs** (fast, no GPT): `order+invoice`, `order+ddt`, `order+packing_list`, `price_list+confirmation`, etc.
- **Versionable types** (same type, same supplier): two tariff versions, two price list revisions
- **Transactional types** (same type): only reconcilable if they share the same `document_number` (revision of same order)
- **Ambiguous**: GPT decides

---

## API Reference

```
POST /api/auth/token/              Login — returns access + refresh JWT tokens
POST /api/auth/token/refresh/      Refresh access token

GET  /api/documents/               List all documents
POST /api/documents/upload/        Upload CSV/Excel file
POST /api/documents/upload-image/  Upload image for OCR (local WhatsApp simulation)
GET  /api/documents/<id>/          Document detail with extracted rows
POST /api/webhook/whatsapp/        Twilio WhatsApp webhook (or mock JSON)

GET  /api/reconciliations/         List all reconciliations
GET  /api/reconciliations/<id>/    Reconciliation detail with discrepancies
PATCH /api/reconciliations/<id>/review/  Approve / reject / correct

POST /api/dev/reset/               Delete all data (development only)
```

---

## What Works

- CSV/Excel parsing with any layout, any language, any supplier (tested on 9 diverse files)
- Multi-section files (multiple suppliers/documents in one file)
- Multi-sheet Excel
- European number formats (1.234,56), dirty data, offset headers
- OCR from photos via GPT-4o Vision
- WhatsApp integration with Twilio (real signature verification, authenticated media download)
- Adaptive reconciliation handling both standard (order/invoice) and non-standard (tariffs, zone pricing) documents
- Fuzzy item code matching (FRN-001 ↔ FRN001) via SequenceMatcher
- Embedding-based description matching for multilingual item names
- Auto-approval when no real errors found
- Full operator review UI (side-by-side documents, color-coded discrepancies, approve/reject/correct)
- Section-aware matching prevents cross-zone tariff reconciliation errors

## What's Missing / Known Limitations

- **OCR accuracy on dense tables**: when multiple quantity columns exist (COLLI, QTÀ/COLLO, QTÀ TOTALE), GPT-4o Vision occasionally reads the wrong column on low-quality photos. High-resolution images work reliably.
- **No automated tests**: zero test coverage. Would add pytest-django + factory_boy for models and httpx mock for FastAPI integration tests.
- **Tariff multi-dimensional tables**: weight range tariffs (Zona A/B/C, multiple service levels) don't map cleanly to the 7 standard fields. The system stores everything in `raw_data` and uses L2 full semantic, which works but loses the normalized representation.
- **No per-supplier column mapping cache**: if the same supplier sends files with consistent headers, GPT re-analyzes every time. Caching the `column_mapping` after first parse would save tokens.
- **ngrok URL changes on restart**: free ngrok account generates a new URL each session. Updating Twilio Console webhook URL is a manual step.

## What I'd Refactor

- **Embed cache in Redis per vector DB**: currently embeddings are cached in Redis as JSON blobs. For scale, a proper vector store (pgvector, Pinecone) would enable semantic search across all historical documents.
- **Streaming reconciliation results**: the current flow is fire-and-forget via Celery. WebSocket push would let the operator see reconciliation results as they arrive without polling.
- **LLM provider abstraction**: the system is tightly coupled to OpenAI. An adapter layer would allow switching to Anthropic Claude or Google Gemini with a config change.
- **Confidence-based retry**: if `doc_type_confidence < 50`, retry parsing with a larger preview window. Currently confidence is stored but not acted on.
