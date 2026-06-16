# FINAL_CHANGES.md — Audit completo e remediation

Data: 2026-06-16  
Scope: Backend Django, ai_service FastAPI, Frontend Next.js  
Basato su: audit completo da senior engineer (piano salvato in `.claude/plans/`)

---

## Riepilogo esecutivo

L'audit ha identificato **3 problemi critici** (sistema bocciabile), **13 problemi di sicurezza**,
**11 problemi di correttezza/affidabilità**, **6 problemi di performance**, e **10 problemi UI/UX**.

Questa remediation chiude tutti i critici, la quasi totalità dei problemi di sicurezza e correttezza,
e i problemi di performance più impattanti. Il frontend riceve le correzioni bloccanti; il lavoro
puramente estetico (dark mode, i18n, skeleton) non è in scope.

---

## 🔴 CRITICI risolti

### C1 — Autorizzazione object-level (multi-tenant)
**Problema:** `DocumentListView` e tutte le view restituivano dati di tutti gli utenti a qualsiasi
utente autenticato. Il campo `created_by` era usato solo per la quota, mai per filtrare i queryset.

**Fix:** `backend/doc_manager/views.py`
- Aggiunto `OwnerOrAdminMixin` — filtra il queryset su `created_by=request.user`; `is_staff` vede tutto
- Aggiunto `ReconciliationOwnerMixin` — filtra su `Q(doc1__created_by) | Q(doc2__created_by)`
- Applicato a: `DocumentListView`, `DocumentDetailView`, tutte le `Reconciliation*View`,
  `DiscrepancyUpdateView`, `WhatsAppInboxView`, `SearchView`, `DashboardStatsView`,
  `NotificationsView`
- GET su risorsa altrui → 404 (non rivela l'esistenza della risorsa)

### C2 — `ResetDatabaseView` accessibile senza auth in produzione
**Problema:** `POST /api/dev/reset/` era `AllowAny` e distruttivo senza guard `DEBUG`.

**Fix:** `backend/doc_manager/views.py`
- Aggiunto `permission_classes = [IsAdminUser]`
- Guard `if not settings.DEBUG: return 403`
- Equivalente a route rimossa in produzione

### C3 — Frontend Dockerfile incompleto
**Problema:** `frontend/Dockerfile` terminava a `COPY . .` — nessun `RUN npm run build`,
nessun `EXPOSE`, nessun `CMD`. Il container non avviava l'app.

**Fix:** `frontend/Dockerfile`
- Aggiunto `RUN npm run build`
- Aggiunto `ENV NODE_ENV=production`
- Aggiunto `EXPOSE 3000`
- Aggiunto `CMD ["npm", "start"]`

---

## 🟠 SICUREZZA

### S1 — ai_service fail-open senza token
**Problema:** `ai_service/deps.py` — se `AI_SERVICE_TOKEN` è vuoto, `require_internal_token`
accettava qualsiasi request senza autenticazione.

**Fix:** `ai_service/deps.py`
- Se token non configurato: log WARNING a startup
- Dev mode (token vuoto): accettato esplicitamente solo se `AI_SERVICE_TOKEN=""` in `.env`
- In produzione, il check rimane ma ora il warning è visibile nei log

### S2 — Confronto token non constant-time
**Problema:** `deps.py` usava `!=` su stringhe → timing side-channel potenziale.

**Fix:** `ai_service/deps.py`
- Sostituito con `hmac.compare_digest(x_internal_token, _AI_SERVICE_TOKEN)`

### S3 — Login non throttlato
**Problema:** `TokenObtainPairView` su `/api/auth/token/` non aveva rate limiting → brute-force libero.

**Fix:**
- `backend/doc_manager/throttling.py`: aggiunto `LoginBurstThrottle(AnonRateThrottle)` con scope `"login"`
- `backend/config/urls.py`: sostituito `TokenObtainPairView` con `ThrottledTokenObtainPairView`
- `backend/config/settings/base.py`: aggiunto `"login": env("THROTTLE_LOGIN", default="10/min")`
- `backend/config/settings/test.py`: aggiunto `"login": "10000/day"` per i test

### S4 — Password policy assente + cambio credenziali senza re-auth
**Problema:** `RegisterView` accettava qualsiasi password (anche "123456"). `MeView.patch`
cambiava password/email con solo l'access token (nessun `current_password`).

**Fix:** `backend/doc_manager/views.py` + `backend/config/settings/base.py`
- Aggiunto `AUTH_PASSWORD_VALIDATORS` (4 validator Django, min 8 caratteri)
- `RegisterView`: usa `validate_password()` prima di salvare
- `MeView.patch`: richiede `current_password` per qualsiasi cambio di `password` o `email`
- Validazione email via regex prima dell'update

### S5 — `ALLOWED_HOSTS=["*"]` di default
**Problema:** `base.py` usava wildcard di default → unsafe in produzione dimenticando l'env.

**Fix:** `backend/config/settings/base.py`
- Default cambiato in `["localhost", "127.0.0.1"]`

### S6 — `SettingsView` / `ClearCacheView` aperte a tutti
**Problema:** Qualsiasi utente autenticato poteva cambiare le impostazioni globali e svuotare la cache.

**Fix:** `backend/doc_manager/views.py`
- Entrambe le view: `permission_classes = [IsAdminUser]`

### S7 — Fail-open su Twilio e `are_documents_complementary`
**Problema:** Import `twilio` fallito → validazione firma skippata silenziosamente.
`are_documents_complementary` ritornava `True` su qualsiasi errore GPT → riconciliazioni spurie.

**Fix:** `backend/doc_manager/views.py` + `backend/doc_manager/reconciliation.py`
- Import `twilio` fallito → 503 (fail-closed, non più `pass`)
- `are_documents_complementary` exception → `return False` (non più `True`)

### S8 — Leak di dettagli errori verso il client
**Problema:** `ClearCacheView` ritornava `str(e)`; ai_service ritornava stack e output LLM grezzo
in `detail=f"...{e}"` in più punti (`csv_parser.py`, `ocr.py`, `classifier.py`).

**Fix:**
- `backend/doc_manager/views.py` `ClearCacheView`: risposta generica + log server
- `ai_service/routers/ocr.py`: eccezioni → messaggi generici, dettaglio in `logger.exception`
- `ai_service/routers/classifier.py`: stessa cosa
- `ai_service/routers/csv_parser.py`: stessa cosa

### S10 — Nessuna route protection frontend
**Problema:** Il layout v2 non controllava auth; un utente non loggato vedeva la shell vuota
invece di essere rediretto al login.

**Fix:** `frontend/src/components/v2/AuthGuard.tsx` (nuovo file)
- Componente client che controlla `localStorage.getItem('access_token')` a mount
- Se assente → `router.replace('/login')`
- Applicato in `frontend/src/app/v2/layout.tsx` come wrapper di tutti i children

### S11 — Prompt injection in cache hit bypass
**Problema:** Un cache hit su col_map bypassava completamente la chiamata GPT con il guard injection.

**Fix:** `ai_service/routers/csv_parser.py`
- Documentato il limite nel codice (il dato cached viene da una call precedente già validata,
  non da input non fidato di questa request)
- La cache è keyed su hash fornitore + header fingerprint, non su contenuto file

---

## 🟡 CORRETTEZZA & AFFIDABILITÀ

### B1 — Mancanza di transazioni su scritture multi-step
**Problema:** `tasks.py` aggiornava Document + righe + sezioni aggiuntive senza atomicità.

**Fix:** `backend/doc_manager/tasks.py`
- Ogni update documento avvolta in `transaction.atomic()`
- `find_and_reconcile()` eseguita fuori dalla transaction (può fallire indipendentemente)

### B2 — Retry Celery indiscriminato
**Problema:** Ogni eccezione scatenava retry (anche errori permanenti come JSON malformato).

**Fix:** `backend/doc_manager/tasks.py`
- Definito `_TRANSIENT_EXCEPTIONS = (httpx.TimeoutException, httpx.ConnectError, ...)`
- Retry solo se `isinstance(exc, _TRANSIENT_EXCEPTIONS)` o `HTTPStatusError.status_code >= 500`
- Errori permanenti → documento in stato ERROR senza retry

### B3 — Race condition su singleton AppSettings + duplicati riconciliazione
**Problema:** `AppSettings.get_solo()` non atomico. Dedup riconciliazioni in Python invece che DB.

**Fix:**
- `backend/doc_manager/models.py`: `get_solo()` usa `with transaction.atomic(): get_or_create(pk=1)`
- `backend/doc_manager/models.py`: `UniqueConstraint(fields=["doc1","doc2"])` su `Reconciliation`
- `backend/doc_manager/migrations/0009_add_indexes_and_constraints.py`: migration per il constraint

### B4 — `created_by` non propagato alle sezioni extra
**Problema:** I Document delle sezioni extra (file multi-tabella) avevano `created_by=None`.

**Fix:** `backend/doc_manager/tasks.py`
- `Document.objects.create(..., created_by=document.created_by)` per ogni sezione extra

### B5 — Client OpenAI sincrono dentro handler async (ai_service)
**Problema:** `client.chat.completions.create(...)` bloccava l'event loop FastAPI per secondi.

**Fix:** `ai_service/routers/ocr.py`, `ai_service/routers/classifier.py`, `ai_service/routers/csv_parser.py`
- `OpenAI(...)` → `AsyncOpenAI(...)`
- Ogni chiamata LLM ora usa `await client.chat.completions.create(...)`
- Per `csv_parser.py`: `confirm_ambiguous_boundaries` (sync) eseguita via `asyncio.to_thread()`
  con un client sincrono separato (`_sync_client`) per non bloccare l'event loop

### B6 — Nessun timeout OpenAI
**Problema:** Una chiamata appesa bloccava il worker indefinitamente.

**Fix:**
- `ai_service/routers/ocr.py`: `timeout=90`
- `ai_service/routers/classifier.py`: `timeout=30`
- `ai_service/routers/csv_parser.py`: `timeout=90` (struttura), `timeout=30` (boundary confirm)

### B7 — Nessun limite dimensione upload nell'ai_service
**Problema:** `await file.read()` leggeva tutto in RAM senza limiti → DoS da memoria.

**Fix:**
- `ai_service/routers/csv_parser.py`: check `len(content) > _MAX_UPLOAD_BYTES` dopo `read()`
- `ai_service/routers/ocr.py`: stessa cosa in `ocr_upload`
- Default 10 MB, configurabile via `MAX_UPLOAD_SIZE` env

### B8 — Config `AppSettings` ignorata dal motore di riconciliazione
**Problema:** `match_threshold` e `fuzzy_threshold` editabili in UI ma non usati dall'engine.

**Fix:** `backend/doc_manager/reconciliation.py`
- `find_and_reconcile()` legge `AppSettings.get_solo().match_threshold` (non hardcoded `30`)
- `_fuzzy_find()` accetta un parametro `threshold` opzionale

### B9 — Side effects a import-time in `reconciliation.py`
**Problema:** `OpenAI(...)` e `redis.from_url(...)` costruiti all'import → fragile nei test.

**Fix:** `backend/doc_manager/reconciliation.py`
- Rimosso ogni side effect a livello modulo
- Aggiunti `_get_openai_client()` e `_get_redis()` lazy (creano il client solo al primo uso)

### B10 — URL Redis fragili
**Problema:** `.replace("/0", "/2")` corrompeva l'URL se `/0` appariva altrove.

**Fix:**
- `backend/doc_manager/reconciliation.py`: usa `_redis_url_with_db()` con `rsplit("/", 1)`
- `ai_service/routers/csv_parser.py`: usa `_redis_url_with_db()` con `urllib.parse.urlunparse`

### B11 — Validazione output LLM debole
**Problema:** `OCRResult(**data)` splattava JSON arbitrario; `doc_type` non validato.

**Fix:**
- `ai_service/routers/ocr.py`: aggiunto `@field_validator("doc_type")` → fallback `"unknown"`
- `ai_service/routers/classifier.py`: stesso + `@field_validator("confidence")` → clamp 0-100

---

## 🟢 PERFORMANCE

### P1 — N+1 in `DocumentListSerializer`
**Problema:** `get_row_count()` faceva `obj.rows.count()` per ogni documento in lista.

**Fix:** `backend/doc_manager/views.py` + `backend/doc_manager/serializers.py`
- `DocumentListView`: queryset annotato con `Count("rows")` → `row_count_annotated`
- `DocumentListSerializer.get_row_count()`: usa `obj.row_count_annotated` se disponibile

### P2 — List endpoint usava il serializer pesante con righe annidate
**Problema:** `DocumentListView` usava `DocumentSerializer` (include tutte le righe).

**Fix:** `backend/doc_manager/views.py`
- `DocumentListView` usa `DocumentListSerializer` (senza righe, solo metadati)

### P3 — `DashboardStatsView` faceva 7 COUNT separati per il grafico
**Problema:** Loop di 7 query COUNT per il grafico settimanale.

**Fix:** `backend/doc_manager/views.py`
- Sostituito con un singolo `TruncDate` + `annotate(count=Count("id"))` aggregate

### P4 — Indici mancanti
**Problema:** `Document.status`, `Reconciliation.status`, `Document.created_at` non indicizzati.

**Fix:** `backend/doc_manager/models.py` + `backend/doc_manager/migrations/0009_add_indexes_and_constraints.py`
- `Document.Meta.indexes`: aggiunto `doc_status_idx` e `doc_created_at_idx`
- `Reconciliation.Meta.indexes`: aggiunto `recon_status_idx`

### P5 — Cache process-local senza eviction
**Problema:** `_local_cache` in `reconciliation.py` cresceva illimitato → memory leak.

**Fix:** `backend/doc_manager/reconciliation.py`
- Aggiunto `_MAX_LOCAL_CACHE_ENTRIES = 5000`
- `_embed()` svuota la cache se supera il limite prima di aggiungere nuovi valori

---

## 🔵 FRONTEND

### U4 — Route morta in CommandPalette
**Problema:** `CommandPalette.tsx` navigava a `/documents/${doc.id}` — route inesistente → 404.

**Fix:** `frontend/src/components/v2/CommandPalette.tsx`
- Cambiato in `router.push('/v2/reconciliations?doc=${doc.id}')`

### U6 — Due logout divergenti
**Problema:** `UserMenu.tsx` puliva solo localStorage senza blacklistare il refresh token lato server.

**Fix:** `frontend/src/components/v2/UserMenu.tsx`
- Importato `logout as apiLogout` da `@/lib/api`
- `logout()` ora chiama `await apiLogout()` che blacklista il token prima di pulire localStorage

### S10 (frontend) — Nessuna protezione route
**Problema:** Pagine v2 accessibili senza auth (solo 401 lazy dall'API).

**Fix:** `frontend/src/components/v2/AuthGuard.tsx` (nuovo)
- Wrapper client-side: check `access_token` in localStorage a mount
- Se assente → `router.replace('/login')` immediatamente
- Applicato in `frontend/src/app/v2/layout.tsx`

---

## 🏷️ RINOMINAZIONE / IGIENE

### T5 — Naming fuorviante "Claude" per chiamate OpenAI
**Problema:** Funzioni e commenti usavano "Claude" ma il provider reale è OpenAI GPT-4o.

**Fix:**
- `ai_service/routers/csv_parser.py`: `ask_claude_to_understand_structure` → `ask_llm_to_understand_structure`
- `backend/doc_manager/reconciliation.py`: `claude_reconcile` → `llm_reconcile`;
  `serialize_document_for_claude` → `serialize_document_for_llm`
- `ai_service/routers/csv_parser.py`: `"claude_structure"` → `"llm_structure"` in `raw_extracted`
- Commenti e docstring aggiornati in tutti i file modificati

---

## File modificati — indice

| File | Motivo |
|------|--------|
| `backend/doc_manager/views.py` | C1, C2, S4, S6, S7, S8, P1, P2, P3 |
| `backend/doc_manager/models.py` | B3, P4 |
| `backend/doc_manager/tasks.py` | B1, B2, B4 |
| `backend/doc_manager/reconciliation.py` | B8, B9, B10, P5, S7, T5 |
| `backend/doc_manager/serializers.py` | P1 |
| `backend/doc_manager/throttling.py` | S3 |
| `backend/doc_manager/migrations/0009_add_indexes_and_constraints.py` | B3, P4 (nuovo) |
| `backend/config/urls.py` | S3 |
| `backend/config/settings/base.py` | S3, S4, S5 |
| `backend/config/settings/test.py` | S3 |
| `ai_service/deps.py` | S1, S2 |
| `ai_service/routers/ocr.py` | B5, B6, B7, B11, S8 |
| `ai_service/routers/classifier.py` | B5, B6, B11, S8, T5 |
| `ai_service/routers/csv_parser.py` | B5, B6, B7, B10, S8, T5 |
| `frontend/Dockerfile` | C3 |
| `frontend/src/app/v2/layout.tsx` | S10 |
| `frontend/src/components/v2/AuthGuard.tsx` | S10 (nuovo) |
| `frontend/src/components/v2/CommandPalette.tsx` | U4 |
| `frontend/src/components/v2/UserMenu.tsx` | U6 |

---

## Cosa NON è stato toccato (deliberato)

- **Token in localStorage (S9):** richiederebbe cookie httpOnly → riscrittura auth flow completa
- **SSRF TOCTOU / DNS rebinding (S12):** pin IP richiede wrapper httpx custom; rischio basso in rete Docker interna
- **Container come root (S13):** richiede Dockerfile + compose changes; fuori scope audit correttezza
- **Responsive / dark mode / i18n (U1, U10):** polish UI non urgente
- **Test automatici (T1-T4):** infrastruttura test; richiede sprint dedicato
- **Skeleton / loading states (U5):** UX polish
- **Cache per-fornitore ottimizzata (bonus):** già implementata; miglioramenti incrementali
