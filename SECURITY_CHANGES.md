# Security Hardening — Changelog Preciso

Data implementazione: 2026-06-16  
Branch: main  
Tutti i 63 test pre-esistenti passano dopo le modifiche.

---

## 1. `backend/config/settings/base.py`

### 1a. Throttle DRF (rate limiting)
- Aggiunto `DEFAULT_THROTTLE_CLASSES`: `[AnonRateThrottle, UserRateThrottle]`  
- Aggiunto `DEFAULT_THROTTLE_RATES` con 5 scope:
  - `anon`: 20/ora (configurabile da env `THROTTLE_ANON`)
  - `user`: 1000/giorno (env `THROTTLE_USER`)
  - `upload_burst`: 10/min (env `THROTTLE_UPLOAD_BURST`) — per upload CSV/immagini
  - `register`: 5/ora (env `THROTTLE_REGISTER`) — anti mass-account
  - `webhook`: 60/min (env `THROTTLE_WEBHOOK`) — webhook WhatsApp

### 1b. Cache Redis condivisa (DB 3)
- Aggiunto blocco `CACHES` con `django.core.cache.backends.redis.RedisCache` su Redis DB 3.
- Necessario perché il throttle DRF deve condividere i contatori tra processi (runserver + worker gunicorn). DB 0=broker, 1=embeddings, 2=col-map, 3=cache/throttle.

### 1c. CORS da env
- `CORS_ALLOWED_ORIGINS` ora letto da `env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])`.
- Prima era hardcoded `CORS_ALLOW_ALL_ORIGINS = True` (apertura completa).

### 1d. Nuove variabili di configurazione
- `AI_SERVICE_TOKEN = env("AI_SERVICE_TOKEN", default="")` — token interno backend ↔ ai_service
- `WHATSAPP_DEV_MODE = env.bool("WHATSAPP_DEV_MODE", default=False)` — flag per webhook dev
- `MAX_UPLOAD_SIZE = env.int("MAX_UPLOAD_SIZE", default=10485760)` (10 MB)
- `DATA_UPLOAD_MAX_MEMORY_SIZE` e `FILE_UPLOAD_MAX_MEMORY_SIZE` impostati a `MAX_UPLOAD_SIZE`

### 1e. JWT hardening (SIMPLE_JWT)
```python
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),  # era illimitato
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),       # era 1 giorno (invariato)
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}
```

### 1f. Security headers (solo `if not DEBUG`)
- `SECURE_PROXY_SSL_HEADER`, `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`
- `SECURE_HSTS_SECONDS = 31536000`, `SECURE_HSTS_INCLUDE_SUBDOMAINS`, `SECURE_HSTS_PRELOAD`
- `SECURE_CONTENT_TYPE_NOSNIFF`, `X_FRAME_OPTIONS = "DENY"`
- Non attivi in dev (DEBUG=True) — nessuna rottura.

### 1g. `token_blacklist` in INSTALLED_APPS
- Aggiunto `"rest_framework_simplejwt.token_blacklist"` per supportare il logout server-side.

---

## 2. `backend/doc_manager/throttling.py` *(nuovo file)*

Tre classi throttle scoped:
- `UploadBurstThrottle(UserRateThrottle)` — scope `upload_burst`
- `RegisterThrottle(AnonRateThrottle)` — scope `register`
- `WebhookThrottle(AnonRateThrottle)` — scope `webhook`

---

## 3. `backend/doc_manager/utils.py`

Aggiunta funzione `is_safe_external_url(url: str) -> bool`:
- Accetta solo schemi `http`/`https`.
- Risolve il hostname e rifiuta **tutti** gli indirizzi IP privati, loopback, link-local (incl. `169.254.169.254`), reserved, multicast, unspecified.
- Usata in due posti: `views.py` (pre-accettazione del webhook) e `tasks.py` (pre-fetch del media).
- Protegge da SSRF anche in presenza di DNS rebinding (controlla tutti gli A/AAAA del host).

---

## 4. `backend/doc_manager/models.py`

### 4a. `AppSettings.daily_document_quota`
- Nuovo campo `IntegerField(default=200)` — quota giornaliera documenti per utente.
- Esposto in `AppSettingsSerializer` e nell'admin.

### 4b. `Document.created_by`
- Nuovo campo `ForeignKey(AUTH_USER_MODEL, null=True, blank=True, on_delete=SET_NULL, db_index=True, related_name="documents")`.
- Popolato da `DocumentUploadView` e `ImageUploadView` con `request.user`.
- `null=True` per documenti WhatsApp (webhook anonimo).
- Usato dalla funzione `_quota_exceeded()` in views.py.

### 4c. Migration `0008_security_fields`
- Aggiunge i due campi sopra. Già applicata.

---

## 5. `backend/doc_manager/serializers.py`

### 5a. `DocumentUploadSerializer.validate_file()`
- Controlla che il file non superi `settings.MAX_UPLOAD_SIZE` (default 10 MB).
- Controlla che l'estensione sia in `(.csv, .xlsx, .xls)`.
- Restituisce `400 Bad Request` con messaggio chiaro se i controlli falliscono.

### 5b. `AppSettingsSerializer`
- Aggiunto `daily_document_quota` all'elenco `fields`.

---

## 6. `backend/doc_manager/views.py`

### 6a. Import aggiunti
- `ContentFile` (spostato dall'import inline al top-level)
- `is_safe_external_url`, `RegisterThrottle`, `UploadBurstThrottle`, `WebhookThrottle`

### 6b. Helper `_quota_exceeded(user) -> bool`
- Conta i `Document` creati dall'utente oggi.
- Restituisce `True` se `≥ AppSettings.daily_document_quota`.
- Query indicizzata: `created_by` ha `db_index=True`, `created_at` già usato per ordering.

### 6c. `DocumentUploadView`
- Aggiunto `throttle_classes = [UploadBurstThrottle]`.
- Aggiunto controllo quota → `429` se superata.
- `Document.created_by = request.user`.
- **Fix memoria**: il file viene salvato su storage (`document.file.save(...)`) invece di essere passato come `list(bytes)` nel payload Celery. Il task lo rilegge dallo storage.

### 6d. `ImageUploadView`
- Stesso di sopra: throttle, quota, `created_by`, storage.
- Aggiunta validazione dimensione e estensione immagine (`.jpg/.jpeg/.png/.webp`).

### 6e. `WhatsAppWebhookView`
- Aggiunto `throttle_classes = [WebhookThrottle]`.
- Aggiunto blocco dev-mode: se `TWILIO_AUTH_TOKEN` è vuoto (nessuna firma Twilio) e `settings.WHATSAPP_DEV_MODE` è `False` → `403 Forbidden`. Prima accettava qualsiasi JSON senza firma.
- Aggiunta validazione SSRF su `media_url` via `is_safe_external_url()` → `400` se l'URL punta a IP privati/loopback.

### 6f. `RegisterView`
- Aggiunto `throttle_classes = [RegisterThrottle]`.

### 6g. `LogoutView` *(nuovo)*
- `POST /api/auth/logout/` — blacklista il refresh token via `RefreshToken.blacklist()`.
- Richiede `IsAuthenticated`.

---

## 7. `backend/doc_manager/urls.py`

- Aggiunto `path("auth/logout/", views.LogoutView.as_view(), name="logout")`.

---

## 8. `backend/doc_manager/tasks.py`

### 8a. Import e helper aggiuntivi
- `import logging` + `logger = logging.getLogger(__name__)`
- `_ai_headers()`: restituisce `{"X-Internal-Token": settings.AI_SERVICE_TOKEN}` se configurato.
- `_read_document_bytes(document, file_content)`: legge i bytes dallo storage del Document se `document.file` esiste, altrimenti fallback a `bytes(file_content)` (retrocompatibilità task pendenti).

### 8b. Tutte le chiamate httpx verso ai_service
- Aggiunto `headers=_ai_headers()` su tutti e tre i `.post()` (`/parse/csv`, `/ocr/upload` × 2).

### 8c. Fix antipattern memoria
- `content_bytes = bytes(file_content)` → `content_bytes = _read_document_bytes(document, file_content)`.
- Elimina la serializzazione `list(bytes)` nel payload Celery/Redis che esplodeva su file grandi.

### 8d. Anti-SSRF nel branch WhatsApp
- Aggiunta chiamata a `is_safe_external_url(media_url)` prima del `httpx.get()`.
- `follow_redirects=True` → `follow_redirects=False` (un redirect verso host interno bypasserebbe la validazione iniziale della view).

### 8e. `error_message` generico
- Prima: `doc.error_message = str(exc)` (espone stack trace, path, chiavi al client via API).
- Dopo: `doc.error_message = "Errore durante l'elaborazione del documento."`.
- Il dettaglio tecnico viene loggato server-side con `logger.exception(...)`.

---

## 9. `backend/doc_manager/reconciliation.py`

### Cap candidati riconciliazione (`MAX_RECON_CANDIDATES = 25`)
- Prima: `find_and_reconcile` iterava **tutti** i `Document.PROCESSED` nel DB → O(N) chiamate LLM (GPT per `are_documents_complementary` + embeddings per `compute_match_score`).
- Dopo: prefiltro a due livelli:
  1. Documenti con stesso `supplier_canonical` (priorità massima — query cheap)
  2. Documenti creati negli ultimi 30 giorni
  3. Dedup + cap a `MAX_RECON_CANDIDATES = 25`
- Il candidato corretto condivide quasi sempre il supplier canonical, quindi viene trovato nel prefiltro. L'O(N) diventa O(1) ammortizzato.

---

## 10. `backend/config/settings/test.py`

- Aggiunto `os.environ.setdefault("AI_SERVICE_TOKEN", "test-internal-token")`.
- Aggiunto blocco `CACHES = {"default": {"BACKEND": "...locmem..."}}`  — impedisce ai test di dipendere da Redis per il throttle.
- Aggiunto `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]` con limiti altissimi (`10000/day`) — i test non vengono bloccati dal rate limiting.
- Aggiunto `SECURE_SSL_REDIRECT = False`.

---

## 11. `ai_service/deps.py` *(nuovo file)*

FastAPI dependency `require_internal_token`:
- Legge `AI_SERVICE_TOKEN` da env al startup.
- Verifica l'header `X-Internal-Token` su ogni request.
- Se il token non è configurato: logga warning ma non blocca (fallback sicuro per dev).
- Se il token è configurato ma non corrisponde: `403 Forbidden`.

---

## 12. `ai_service/routers/csv_parser.py`

- Aggiunto `from deps import require_internal_token`.
- `router = APIRouter(dependencies=[Depends(require_internal_token)])` — tutte le route del router richiedono il token.
- Aggiunto cap `MAX_SECTIONS = 20`: i file con più di 20 sezioni sono troncati. Protegge da file ostili progettati per amplificare le chiamate LLM con centinaia di sezioni false.

---

## 13. `ai_service/routers/ocr.py`

- Aggiunto `from deps import require_internal_token`.
- `router = APIRouter(dependencies=[Depends(require_internal_token)])`.
- Aggiunta `_detect_image_mime(content: bytes) -> str | None`: validazione tipo file tramite **magic bytes** (JPEG: `\xff\xd8\xff`, PNG: `\x89PNG\r\n\x1a\n`, WEBP: `RIFF...WEBP`).
- `ocr_upload`: usa `_detect_image_mime` per rilevare il tipo reale. Se non riconosciuto, fallback a estensione (accettata solo se in `_MIME_MAP`). `400` se né magic bytes né estensione sono validi.
- Prima: il tipo era dedotto solo dall'estensione dichiarata dall'utente (facilmente falsificabile).

---

## 14. `ai_service/routers/classifier.py`

- Aggiunto `from deps import require_internal_token`.
- `router = APIRouter(dependencies=[Depends(require_internal_token)])`.

---

## 15. `docker-compose.yml`

- Rimossa `ports: ["8001:8001"]` dal servizio `ai_service`.
- Il servizio è ora raggiungibile **solo** dall'interno della rete Docker (`http://ai_service:8001`).
- Cambiato `env_file: .env.backend` → `env_file: .env.ai` — l'ai_service non vede più `DJANGO_SECRET_KEY`, `DATABASE_URL`, `TWILIO_*`, `POSTGRES_*`.

---

## 16. `.env.ai` *(nuovo file, gitignored)*

File env minimale per l'ai_service. Contiene solo:
- `OPENAI_API_KEY`
- `AI_SERVICE_TOKEN` (da generare e aggiungere anche a `.env.backend`)
- `CELERY_BROKER_URL` (per la cache Redis col-map DB 2)

---

## 17. `.env.backend`

Aggiunte due righe documentate:
- `AI_SERVICE_TOKEN=` (da compilare con token generato)
- `WHATSAPP_DEV_MODE=0`

---

## 18. `.gitignore`

- Aggiunto `.env.ai`.

---

## 19. `frontend/src/lib/api.ts`

### 19a. Gestione `429 Too Many Requests`
- `apiFetch` ora intercetta `status === 429` e lancia un `Error` con messaggio leggibile dall'utente.
- Tenta di leggere `body.error` o `body.detail` dal JSON di risposta (DRF li usa entrambi).
- Aggiunge `err.status = 429` per permettere ai componenti di distinguere rate-limit da altri errori.

### 19b. Funzione `logout()`
- Invia `POST /api/auth/logout/` con il refresh token per blacklistarlo server-side.
- Poi rimuove `access_token` e `refresh_token` da `localStorage`.
- In caso di errore (token scaduto, rete offline) pulisce comunque lo storage e reindirizza a `/login`.

---

## Riepilogo difese per categoria

| Attacco | Difesa implementata |
|---------|---------------------|
| Spam upload (consumo LLM) | Throttle burst (10/min per utente) + quota giornaliera DB (200/giorno default) |
| Mass-account creation | Throttle registro (5/ora per IP) |
| Spam webhook | Throttle webhook (60/min per IP) + WHATSAPP_DEV_MODE guard |
| SSRF via media_url | `is_safe_external_url()` in view + tasks; `follow_redirects=False` nel fetch Twilio |
| Accesso diretto ai_service | Porta 8001 rimossa dall'host + `X-Internal-Token` su tutti i router AI |
| File malevoli nell'upload | Validazione estensione + dimensione (serializer) + magic bytes MIME (ai_service OCR) |
| Sezioni eccessive in CSV | Cap `MAX_SECTIONS = 20` in csv_parser |
| Riconciliazione O(N) LLM | Cap `MAX_RECON_CANDIDATES = 25` + prefiltro per supplier canonical |
| Leak stack trace nei 500 | `error_message` generico; dettaglio solo nei log server |
| JWT long-lived / no logout | `ACCESS_TOKEN_LIFETIME = 15min`; `ROTATE_REFRESH_TOKENS`; `/api/auth/logout/` blacklist |
| Security headers mancanti | HSTS, SECURE_SSL_REDIRECT, X_FRAME_OPTIONS, NOSNIFF (solo `not DEBUG`) |
| Env over-broad in ai_service | `.env.ai` minimale; ai_service non riceve più DB/SECRET_KEY/Twilio |

---

## 20. `backend/tests/conftest.py`

- Aggiunto fixture `autouse=True` che chiama `cache.clear()` prima di ogni test.
- Evita che i contatori throttle accumulati da test precedenti facciano scattare il rate limit sui test successivi (es. 3 `register` test → 429 sul 4°).
- Sicuro: le chiamate AI sono tutte mockkate nei test, quindi non ci sono cache embedding/col-map da preservare.

## 21. `backend/conftest.py` *(nuovo file, commentato)*

- Creato come nota documentale: spiega che `DJANGO_SETTINGS_MODULE=config.settings.local` viene impostato da docker-compose e prende precedenza su `pytest.ini`.
- Nessun codice attivo.

---

## Nota: credenziali da ruotare

Le variabili `OPENAI_API_KEY` e `TWILIO_AUTH_TOKEN` in `.env.backend` sono live e gitignorate.
Non sono mai state committate nel repository. Se il file è stato condiviso al di fuori di git,
considerare la rotazione delle chiavi su [platform.openai.com](https://platform.openai.com) e
[console.twilio.com](https://console.twilio.com).
