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
| Frontend | Next.js + React + TypeScript + Tailwind |
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
├── .env.frontend         ← variabili Next.js
├── .gitignore
├── CLAUDE.md
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
│   └── doc_manager/      ← app principale
│       ├── models.py     ← Document, DocumentRow, Reconciliation, Discrepancy
│       ├── views.py      ← API endpoints
│       ├── serializers.py
│       ├── tasks.py      ← Celery task principale
│       ├── reconciliation.py ← logica riconciliazione a cascata
│       ├── urls.py
│       └── admin.py
│
├── ai_service/           ← FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   └── routers/
│       ├── __init__.py
│       ├── csv_parser.py ← parsing CSV/Excel con GPT-4o
│       ├── ocr.py        ← OCR immagini con GPT-4o Vision
│       └── classifier.py ← classificazione tipo documento
│
├── frontend/             ← Next.js
│   ├── Dockerfile
│   └── src/
│       └── app/          ← App Router (ancora pagina default)
│
└── scripts/
    ├── start-worker.sh
    └── start-beat.sh
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
  → Operatore vede tutto in UI (da fare)

Foto WhatsApp → webhook Django → Celery task
  → FastAPI /ocr/image → GPT-4o Vision estrae dati
  → stesso flusso di riconciliazione
```

### Decisioni architetturali chiave

**Parser CSV — GPT-4o invece di keyword matching**
Scartato approccio con liste di keyword per trovare header e mappare colonne. Usato GPT-4o: legge le prime 50 righe grezze, restituisce JSON con `header_row_index`, `data_row_indices`, `column_mapping`, `metadata`, `doc_type`. Poi Python usa quella struttura per estrarre tutte le righe del file (anche 564+).

**Multi-sezione: un file può contenere più documenti**
File 04-multi-table.csv aveva ordini di 2 fornitori diversi nello stesso file. GPT-4o restituisce una lista di `sections`, ognuna diventa un `Document` separato nel DB. Il Celery task aggiorna il primo Document e crea nuovi Document per le sezioni aggiuntive.

**Riconciliazione a cascata (3 livelli)**
- L1: confronto matematico esatto (gratuito, millisecondi) — se tutto quadra, stop
- L2: GPT-4o valuta SOLO le discrepanze trovate dal L1 (non manda tutto il doc, solo le righe coinvolte nelle discrepanze → risparmio ~10x token)
- L3: se dopo L2 nessun `severity=error`, auto-approva; altrimenti rimane `pending` per l'operatore

**Matching documenti**
`compute_match_score()` calcola score 0-100 su: numero documento identico (+50), stesso fornitore (+30), stessa data (+10), totali simili (+5-10), overlap codici articolo Jaccard (+10-40). Soglia minima: 30. `are_documents_complementary()` chiede a GPT se la coppia ha senso prima di tentare il match (evita di riconciliare due ordini identici).

**Estrazione righe da file grandi**
GPT vede solo le prime 50 righe per capire la struttura. Il `data_row_indices` restituito da GPT copre solo il campione. La funzione `parse_csv_excel` estende automaticamente `data_row_indices` dalla prima riga dati fino alla fine del file, senza ulteriori chiamate API.

---

## Stato attuale

### ✅ Implementato e funzionante

**Infrastruttura**
- Docker Compose con tutti e 7 i container (Django, FastAPI, Celery worker, Celery beat, PostgreSQL, Redis, Next.js)
- Settings Django con `base.py` + `local.py`, `DJANGO_SETTINGS_MODULE=config.settings.local`
- Celery connesso a Redis, task `process_document_task` registrato e funzionante

**Backend Django**
- Modelli: `Document`, `DocumentRow`, `Reconciliation`, `Discrepancy` con tutte le relazioni
- API endpoints: `GET /api/documents/`, `POST /api/documents/upload/`, `GET /api/documents/<id>/`, `POST /api/webhook/whatsapp/`, `GET /api/reconciliations/`, `GET /api/reconciliations/<id>/`, `PATCH /api/reconciliations/<id>/review/`
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

### 🔴 Non ancora iniziato

- **Frontend Next.js** — pagina ancora quella di default, zero UI implementata
- **Autenticazione** — `AllowAny` su tutti gli endpoint, JWT non configurato
- **WhatsApp integration** — solo mock endpoint, nessuna integrazione reale (Twilio o Meta API)
- **WebSocket/notifiche** — L3 segna pending ma non notifica l'operatore
- **Test automatici** — zero test scritti

### ⚠️ Parzialmente implementato

- **Confidence check** — `doc_type_confidence` estratto ma non usato per retry con più contesto
- **Cache per-fornitore** — non implementata (bonus della challenge)

---

## Problemi noti e workaround

### Bug noti da fixare prima della consegna

1. **Riepilogo finale incluso nelle righe (file 08)**
   File 08 ha righe di riepilogo alla fine (`RIEPILOGO PERIODO`, `Totale Spedizioni`, ecc.) che vengono incluse nei dati. Il fix è filtrare righe senza `item_code` E senza valore numerico significativo quando la `description` contiene parole come "totale", "riepilogo", "peso totale".

2. **Colonna sbagliata per `quantity` in packing list (file 07)**
   GPT mappa `quantity` su "Qty per Box" invece di "Total Qty". Fix: aggiunta regola nel prompt di `ask_claude_to_understand_structure`:
   > "Per documenti con colonne 'Qty per Box' E 'Total Qty', mappa SEMPRE quantity sulla colonna del totale"

3. **`discount` invece di `total_price` per prezzi scontati (file 06)**
   "Prezzo Scontato"/"Importo Netto" viene mappato su `discount` invece di `total_price`. Fix: aggiunta regola nel prompt:
   > "'Prezzo Scontato', 'Importo Netto', 'Prezzo Finale' → total_price. 'Sconto %' → discount"

4. **`doc_type: "summary"` non in TypeChoices**
   File 05 genera una sezione con `doc_type: "summary"` che non esiste nei choices Django. Fix: aggiungere `SUMMARY = "summary", "Riepilogo"` a `Document.TypeChoices` oppure mappare su `unknown` nel task.

5. **Floating point imprecision nei totali**
   `8155.650000000001` invece di `8155.65`. Fix: `round(total, 2)` prima di assegnare `total_amount`.

### Limitazioni note

- GPT vede solo 50 righe di preview per capire la struttura. Per file con struttura che cambia dopo la riga 50 potrebbe sbagliare il mapping. Attualmente non gestito.
- `are_documents_complementary()` chiama GPT per ogni coppia candidata — se ci sono molti documenti nel DB questo diventa lento. Va ottimizzato con il cache fornitore.
- File con encoding non standard (es. windows-1252 con caratteri speciali) può fallire silenziosamente.

---

## Prossimi passi (in ordine di priorità)

### 1. Fix bug noti (prima di tutto)
- [ ] Fix riepilogo finale incluso nelle righe (file 08)
- [ ] Fix `quantity` → Total Qty invece di Qty per Box (file 07)
- [ ] Fix `discount` vs `total_price` per prezzi scontati (file 06)
- [ ] Fix `doc_type: "summary"` non in TypeChoices
- [ ] Fix floating point `round(total, 2)`

### 2. Frontend Next.js
Pagine da costruire:
- **Dashboard** — lista documenti con status (pending/processed/error), pulsante upload
- **Upload** — form drag&drop CSV/Excel, feedback asincrono mentre Celery processa
- **Riconciliazioni** — lista con badge status (pending/approved/rejected)
- **Dettaglio riconciliazione** — doc1 + doc2 affiancati, discrepanze evidenziate con colore per severità, bottoni Approva/Rifiuta/Correggi

### 3. Generare documenti di test per OCR
La challenge richiede di fotografare PDF "ricchi" (modulistica, non tabelle nude) per testare l'OCR. Generare HTML→PDF con dati dei CSV, introdurre discrepanze deliberate (quantità diverse, prezzi cambiati, righe mancanti) e fotografare.

### 4. Test end-to-end WhatsApp
Implementare mock webhook o Twilio sandbox e testare il flusso completo foto→OCR→riconciliazione.

### 5. README
Scrivere README con: architettura, come eseguire (`docker compose up`), scelte tecniche, cosa è implementato/cosa no.

### 6. (Bonus) Cache per-fornitore
Salvare il `column_mapping` per fornitore. Se stesso fornitore manda file con header simili, verificare se il mapping cached è ancora valido (confronto intestazioni) prima di chiamare GPT.

### 7. (Bonus) Confidence check con retry
Se `doc_type_confidence < 50`, ritentare con più righe di preview (60 invece di 50).

---

## Convenzioni e regole

### Naming
- App Django: `doc_manager` (non `documents` — conflitto con modulo Python)
- Settings: `config.settings.local` per dev, mai `config.settings` direttamente
- File env: `.env.backend` per Django/Celery/DB, `.env.frontend` per Next.js

### Pattern Django
- Tutte le view usano `permission_classes = [AllowAny]` temporaneamente — da sostituire con JWT prima della consegna
- I task Celery importano i modelli dentro la funzione (non a livello modulo) per evitare problemi di circular import
- `_update_document()` è una funzione helper in `tasks.py` per evitare duplicazione di codice tra primo documento e sezioni aggiuntive

### Pattern FastAPI
- Il parser CSV NON usa pandas per la lettura iniziale — splitta manualmente per riga per non perdere righe "malformate" che sono titoli di sezione
- GPT vede sempre il file come testo tabellare con formato `"Riga N: val1 | val2 | val3"`
- La risposta di GPT viene sempre pulita da eventuali backtick markdown prima del `json.loads()`

### Cose da NON fare
- Non usare keyword hardcoded per trovare header o mappare colonne — tutto demandato a GPT
- Non usare `COMPLEMENTARY_TYPES` dict hardcoded per decidere quali tipi matchare — usare `are_documents_complementary()` con GPT
- Non mandare tutto il documento a GPT nel livello 2 della riconciliazione — solo le righe coinvolte nelle discrepanze
- Non usare `pandas.read_csv()` con `header=None` per file multi-sezione — usa split manuale
- Non commitare `.env.backend` o `.env.frontend` — sono in `.gitignore`

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
      "doc_type": "order|invoice|ddt|price_list|packing_list|shipment|confirmation|unknown",
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
```

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

### Endpoint API principali
```
GET  /api/documents/                    lista documenti
POST /api/documents/upload/             upload CSV/Excel (multipart/form-data, field: file)
GET  /api/documents/<id>/              dettaglio documento con righe
POST /api/webhook/whatsapp/            mock webhook {from, media_url, caption}
GET  /api/reconciliations/             lista riconciliazioni
GET  /api/reconciliations/<id>/        dettaglio con discrepanze
PATCH /api/reconciliations/<id>/review/ {status: approved|rejected|corrected, operator_notes: ""}

# FastAPI (porta 8001)
POST /parse/csv                        upload file CSV/Excel
POST /ocr/image                        {image_url, caption}
GET  /docs                             Swagger UI
```

### Modelli Django — campi chiave
```python
Document:
  source: upload | whatsapp
  doc_type: unknown|order|invoice|ddt|price_list|packing_list|shipment|confirmation
  status: pending | processed | error
  supplier_name, document_number, document_date, total_amount
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
