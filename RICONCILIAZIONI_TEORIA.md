# RICONCILIAZIONI_TEORIA.md
# Come funziona il sistema di riconciliazione — Teoria e regole

---

## Cos'è una riconciliazione

Nel contesto di questo sistema, **riconciliare** due documenti significa verificare che ciò che è stato richiesto corrisponda a ciò che è stato eseguito. È il controllo automatico tra due momenti di una stessa transazione commerciale.

Esempi concreti:
- Un ordine di acquisto inviato al fornitore ↔ La fattura ricevuta dal fornitore
- Un ordine ↔ Il DDT (documento di trasporto) che accompagna la merce
- Un ordine ↔ La packing list che certifica cosa è stato imballato e spedito
- Un ordine ↔ La conferma d'ordine inviata dal fornitore come risposta

La riconciliazione **non** è un confronto generico tra documenti: è sempre il confronto tra un documento che esprime un'intenzione (cosa vogliamo/abbiamo chiesto) e uno che attesta un'esecuzione (cosa è stato consegnato/fatturato).

---

## Tipi di documento gestiti

| Codice | Nome | Descrizione |
|--------|------|-------------|
| `order` | Ordine di acquisto | Richiesta formale inviata al fornitore |
| `invoice` | Fattura | Documento fiscale di addebito del fornitore |
| `ddt` | DDT — Documento di Trasporto | Accompagna fisicamente la merce |
| `packing_list` | Packing list | Dettaglio di cosa è stato imballato e in quante scatole |
| `confirmation` | Conferma d'ordine | Risposta del fornitore che accetta l'ordine |
| `price_list` | Tariffario / Listino prezzi | Tabella prezzi per prodotti o servizi di trasporto |
| `shipment` | Spedizione | Documento di tracking / export spedizioni corriere |
| `inventory` | Inventario | Elenco articoli a magazzino, spesso da file multi-sheet |
| `summary` | Riepilogo | Documento di sintesi, spesso generato automaticamente |
| `unknown` | Sconosciuto | Tipo non riconosciuto con certezza dall'AI |

---

## Normalizzazione del fornitore (`supplier_canonical`)

Prima di qualsiasi confronto, il nome del fornitore viene normalizzato in un campo separato: `supplier_canonical`. Questo campo è quello usato per il prefiltro dei candidati e per le guardie di deduplicazione.

Il processo di normalizzazione ha tre passi:

1. **Pulizia base**: minuscolo, rimozione punteggiatura, rimozione suffissi legali ("S.r.l.", "S.p.A.", "GmbH", "Ltd", "Inc", "B.V.", ecc.) e parole generiche ("forniture", "group", "italia").
2. **Fuzzy matching** con `rapidfuzz` (Levenshtein) sui canonical già presenti nel DB. Se la similarità è ≥ 85%, il nuovo documento viene agganciato al canonical esistente invece di crearne uno nuovo.
3. Il canonical viene salvato su `Document.supplier_canonical` al momento dell'elaborazione Celery.

Effetto pratico: "Alfa Forniture S.r.l.", "ALFA FORNITURE SRL" e "Alfa Forniture" producono tutti lo stesso `supplier_canonical = "alfa"`. Il prefiltro candidati usa questo campo per raggruppare in modo efficiente tutti i documenti dello stesso fornitore.

---

## Coppie che SI riconciliano

### 1. Coppie note (regola fissa, senza GPT)

Queste coppie sono hardcoded come "complementari" perché il rapporto tra i due tipi è sempre valido:

| Documento 1 | Documento 2 | Perché ha senso |
|-------------|-------------|-----------------|
| `order` | `invoice` | L'ordine definisce cosa acquistare; la fattura addebita quanto consegnato |
| `order` | `ddt` | L'ordine definisce cosa richiedere; il DDT certifica l'arrivo fisico |
| `order` | `packing_list` | L'ordine definisce le quantità; la packing list dice cosa c'è nelle scatole |
| `order` | `confirmation` | L'ordine viene confermato (o modificato) dal fornitore |
| `invoice` | `ddt` | La fattura deve corrispondere alla merce fisicamente consegnata |
| `shipment` | `invoice` | La spedizione corriere viene fatturata in base a peso/zone |
| `price_list` | `confirmation` | Il tariffario inviato dal fornitore viene confermato ufficialmente |

### 2. Tipi "versionabili" (stesso tipo, stesso fornitore)

Alcuni tipi di documento vengono aggiornati periodicamente: quando arriva una nuova versione dello stesso documento, ha senso confrontarla con quella precedente.

Tipi versionabili: `confirmation`, `summary`, `inventory`

**Regola:** due documenti dello stesso tipo versionabile, dello stesso fornitore → riconciliati automaticamente.

Esempio: il fornitore manda una conferma d'ordine revisionata (`OC-2026-IT-0094-rev2`). Il sistema la confronta con la versione precedente per evidenziare cosa è cambiato.

### 3. Casi ambigui → GPT decide

Se la coppia non rientra nelle regole fisse sopra, il sistema interroga GPT con una domanda semplice:

> "Questi due documenti potrebbero essere uno la risposta, conferma, aggiornamento o contropartita dell'altro?"

GPT riceve tipo, fornitore e nome file di entrambi i documenti e risponde `true/false`. Questo gestisce situazioni non previste dalle regole fisse.

---

## Coppie che NON si riconciliano

### 1. Due documenti transazionali dello stesso tipo (regola fissa)

I tipi **transazionali** sono: `order`, `invoice`, `ddt`, `packing_list`, `shipment`, `price_list`.

Ogni documento transazionale è un'entità distinta: un ordine non ha senso confrontarlo con un altro ordine diverso (sono due acquisti distinti, non due versioni della stessa cosa). Stesso discorso per i tariffari: zone diverse dello stesso tariffario o versioni aggiornate non vengono riconciliate automaticamente, evitando decine di false discrepanze tra sezioni.

**Eccezione:** se i due documenti transazionali dello stesso tipo hanno lo stesso numero documento, allora sono quasi certamente una revisione dello stesso documento → vengono riconciliati.

Esempi:
- `order` + `order` (fornitore diverso) → ❌ NON riconciliati
- `order` + `order` (stesso fornitore, numero diverso) → ❌ NON riconciliati
- `order` + `order` (stesso numero documento) → ✅ Riconciliati (revisione)
- `price_list` + `price_list` (stesse zone, fornitore uguale) → ❌ NON riconciliati
- `price_list` + `price_list` (stesso numero documento) → ✅ Riconciliati (aggiornamento tariffe)

Un tariffario si riconcilia comunque con una **conferma prezzi** (`price_list` + `confirmation`) tramite le coppie note.

### 2. Documenti già riconciliati — deduplicazione

Il sistema previene la creazione di riconciliazioni duplicate tramite due livelli di guardia:

**Guardia 1 — per ID:** se tra i due Document (identificati dall'ID nel database) esiste già una riconciliazione, non viene creata una nuova.

**Guardia 2 — per fingerprint:** se esiste già una riconciliazione con la stessa combinazione `(tipo_doc1, fornitore_doc1, numero_doc1) × (tipo_doc2, fornitore_doc2, numero_doc2)`, quella coppia viene saltata. Questo previene duplicati quando lo stesso file fisico viene caricato due volte: si creano due Document con ID diversi ma stesso contenuto, e senza questa guardia si genererebbero due riconciliazioni identiche.

La guardia 2 si attiva **solo** quando almeno uno dei due documenti ha un numero documento valorizzato (DDT-AM-2026-0318, DL-7741, ORD-2026-W07, ecc.). Se entrambi non hanno numero documento il fingerprint sarebbe troppo generico e rischierebbe di bloccare riconciliazioni legittime.

### 3. Stesso contenuto (hash SHA-256) o stesso filename

Il sistema calcola l'hash SHA-256 del contenuto del file nel momento in cui viene elaborato dal task Celery. L'hash viene salvato nel campo `Document.file_hash` (indicizzato).

La logica di confronto è:

- **Entrambi i documenti hanno hash** → confronto SHA-256. Solo se gli hash coincidono il documento è un duplicato e viene saltato.
- **Uno o entrambi mancano di hash** (documenti caricati prima di questa feature) → fallback al confronto di `original_filename`.

Questo distingue correttamente tre scenari che il solo confronto sul filename non riusciva a gestire:

| Scenario | filename | hash | Esito |
|----------|----------|------|-------|
| Stesso file caricato due volte, stesso nome | uguale | uguale | ❌ Saltato (duplicato) |
| Due file diversi con lo stesso nome (es. `fattura_fornitore.csv` di mesi diversi) | uguale | diverso | ✅ Riconciliati |
| Stesso file caricato due volte, rinominato | diverso | uguale | ❌ Saltato (duplicato) |
| Due file diversi con nomi diversi | diverso | diverso | ✅ Riconciliati (se score ≥ soglia) |

---

## Algoritmo di selezione del candidato

Quando viene caricato un nuovo documento, il sistema cerca il miglior candidato per la riconciliazione seguendo questi passi:

### Passo 1 — Prefiltro candidati

Non si guarda tutto il database: si lavora su un sottoinsieme di massimo **25 candidati**, selezionati per:
1. Stesso `supplier_canonical` (normalizzazione del nome fornitore) → priorità massima
2. Documenti processati negli ultimi **30 giorni** → cattura coppie tra fornitori con canonical leggermente diverso

### Passo 2 — Guardie di esclusione

Per ogni candidato si verificano nell'ordine:
- Già riconciliato per ID? → salta
- Stesso hash SHA-256? (fallback: stesso filename se hash assente) → salta
- Stesso fingerprint di una coppia già riconciliata? → salta
- `are_documents_complementary()` dice no? → salta

### Passo 3 — Punteggio di matching

Per i candidati che superano tutte le guardie, si calcola uno score 0–100:

| Criterio | Punti |
|----------|-------|
| Numero documento identico | +50 |
| Stesso fornitore (embedding similarity ≥ 88%) | +30 |
| Fornitore simile (similarity 72–88%) | +15 |
| Stessa data documento | +10 |
| Totali identici (diff < 0.01) | +10 |
| Totali simili (diff < 10%) | +5 |
| Overlap articoli Jaccard ≥ 80% | +40 |
| Overlap articoli Jaccard 50–80% | +25 |
| Overlap articoli Jaccard 20–50% | +10 |

**Soglia minima configurabile:** per default score < 30 → nessuna riconciliazione avviata. La soglia è modificabile tramite `AppSettings.match_threshold` nella UI di amministrazione.

Il candidato con lo score più alto vince.

---

## Ordinamento semantico doc1 / doc2

Una volta trovata la coppia vincente, il sistema assegna i ruoli **doc1** (documento di riferimento) e **doc2** (documento da verificare) seguendo una priorità semantica, non cronologica:

| Priorità | Tipi | Ruolo |
|----------|------|-------|
| 0 (più alto) | `order`, `price_list` | doc1 — esprime l'intenzione originale |
| 1 | `invoice`, `confirmation` | doc2 — risponde all'intenzione |
| 2 | `ddt`, `packing_list` | doc2 — attesta l'esecuzione fisica |
| 3 | `shipment` | doc2 — tracking finale |
| 5 (default) | qualsiasi altro | ordine cronologico (upload precedente = doc1) |

**Perché è importante:** le discrepanze sono asimmetriche. Un articolo presente in **doc1 ma assente in doc2** diventa `missing_in_doc2` con severity **error** (qualcosa è stato richiesto ma non consegnato/fatturato). Un articolo presente in **doc2 ma assente in doc1** diventa `extra_in_doc2` con severity **warning** (qualcosa di inatteso è apparso nel documento di risposta).

Se l'ordine fosse invertito (DDT come doc1, ordine come doc2), una riga mancante nel DDT apparirebbe come "extra nell'ordine" con severity warning — e verrebbe auto-approvata invece di restare pending per revisione operatore.

---

## Algoritmo di riconciliazione a cascata (L1 → L2 → L3)

Una volta assegnati doc1 e doc2, si avvia la riconciliazione in tre livelli:

### Livello 1 — Confronto matematico (documenti standard)

Per documenti con item_code (ordini, fatture, DDT, packing list):
- Ogni riga del doc1 viene abbinata a una riga del doc2 per item_code
- **Matching esatto** → confronto diretto dei valori numerici
- **Matching fuzzy** (similarità ≥ 90%, es. `FRN-001` vs `FRN001`) → confronto + warning `code_mismatch`
- **Matching semantico per descrizione** (embedding cosine similarity ≥ 88%, es. "Apple Juice 1L" vs "Succo di Mela 1 litro") → confronto + warning; usa OpenAI `text-embedding-3-small` con cache Redis DB 1
- Nessun match → discrepanza `missing_in_doc2` (severity: **error**)
- Righe extra nel doc2 non abbinate → `extra_in_doc2` (severity: **warning**)
- Se tutto quadra: stop qui, auto-approvazione (L3)

### Livello 1b — Confronto deterministico (documenti non-standard)

Per tariffari e listini prezzi (`price_list`), il confronto per item_code non funziona (strutture diverse tra fornitori e tra CSV/OCR). Si usa invece `reconcile_nonstandard` che:
- Raggruppa le righe per `section_name` (ZONA A, ZONA B, SUPPLEMENTI…)
- Abbina le righe all'interno della stessa sezione per chiave colonna
- Confronta i valori numerici cella per cella
- GPT interviene come fallback solo se le strutture sono troppo divergenti

### Livello 2 — Valutazione semantica GPT (solo se ci sono discrepanze)

GPT non vede l'intero documento: riceve **solo le righe coinvolte nelle discrepanze** trovate al L1, per risparmiare ~10× di token rispetto a mandare tutto.

Eccezione: per documenti non-standard (tariffari) vengono mandate tutte le righe, ma i tariffari sono piccoli per definizione (poche decine di righe).

Per ogni discrepanza GPT decide:
- È un errore reale? → mantiene severity **error**
- È una rappresentazione diversa della stessa cosa? → abbassa a **warning** o **info**
- È irrilevante? → può rimuovere la discrepanza

Esempio: `FRN-001` in doc1 e `FRN001` in doc2 → GPT capisce che è lo stesso codice con formattazione diversa e abbassa la severity da warning a info.

GPT può anche aumentare il `match_confidence` finale se ritiene la coppia molto coerente (`confidence_adjustment` sommato allo score iniziale, cappato a 100).

### Livello 3 — Decisione finale

- **Nessuna discrepanza severity=error** → riconciliazione auto-approvata (`approved`)
- **Almeno una discrepanza severity=error** → rimane `pending`, l'operatore deve intervenire manualmente

---

## Flusso visivo

```
Documento caricato
       │
       ▼
Normalizza supplier_canonical (rapidfuzz fuzzy sui canonical esistenti)
       │
       ▼
Prefiltro candidati (supplier_canonical + ultimi 30gg, max 25)
       │
       ▼
Per ogni candidato:
  ├── già riconciliato per ID? → skip
  ├── stesso hash SHA-256? (fallback: stesso filename) → skip
  ├── stesso fingerprint coppia? → skip
  ├── are_documents_complementary()? → skip se NO
  └── compute_match_score() → tiene il migliore

       │
       ▼
Score ≥ soglia (default 30)?
  ├── NO → nessuna riconciliazione
  └── SI → assegna doc1/doc2 per priorità semantica
              │ (order/price_list = doc1; ddt/packing_list = doc2)
              ▼
       Documenti standard?
       ├── SI → L1 math (exact → fuzzy → embedding) → discrepanze? → L2 GPT
       └── NO → L1b deterministico (tariffari, per sezione) → [GPT residuo]
              │
              ▼
       L3 decide
       ├── errori → status: pending (operatore)
       └── no errori → status: approved (auto)
```

---

## Esempi reali dalla test suite

### p1 — match perfetto (zero discrepanze)
- `p1-invoice-perfect.csv` (fattura) ↔ `p1-order-perfect.csv` (ordine)
- Stesso fornitore Alfa Forniture, stessi articoli, stesse quantità, stessi prezzi
- Score: 50 (fornitore +30, Jaccard 100% +20)
- L1: 0 discrepanze → L3: auto-approvata
- Risultato: `approved`

### p2 — discrepanze reali (prezzo e quantità)
- `p2-invoice-mismatch.csv` (fattura) ↔ `p2-order-mismatch.csv` (ordine)
- Ordine: Monitor qty=8 €399, Tastiera qty=15. Fattura: Monitor €419, Tastiera qty=12
- Score: 70 (stesso fornitore Beta Distribuzione +30, Jaccard 100% +40)
- L1: 2 discrepanze error (price_mismatch, quantity_mismatch)
- Risultato: `pending` con 2 errori da approvare

### p3 — riga mancante nel DDT
- `p3-order-missing-row.csv` (ordine, 5 articoli) ↔ `p3-ddt-missing-row.csv` (DDT, 4 articoli)
- Il DDT non include GT-A04 "Cavo Cat6 305m" (non consegnato)
- doc1 = ordine (priorità 0), doc2 = DDT (priorità 2)
- L1: GT-A04 presente in doc1 (ordine) ma assente in doc2 (DDT) → `missing_in_doc2` severity=**error**
- Risultato: `pending` con 1 errore critico

### p4 — codici articolo con formato diverso
- `p4-order-fuzzy.csv` ↔ `p4-confirm-fuzzy.csv`
- Ordine usa `DM-001`, conferma usa `DM001` (stessa cosa, trattino diverso)
- Score: 100 (stesso fornitore Delta Mobili, fuzzy match al 92%)
- L1: 4 warning `code_mismatch` (DM-001 vs DM001) → L2: GPT abbassa a info
- Risultato: `approved` (solo info, nessun errore reale)

### p5 — discrepanza prezzo su tariffario
- `p5-tariff-nonstandard.csv` (price_list) ↔ `p5-confirm-nonstandard.csv` (confirmation)
- Coppia nota: `price_list` + `confirmation`
- Tariffa "Standard" nel tariffario €22 vs conferma €25
- L1b deterministico: 1 discrepanza `price_mismatch` severity=error
- Risultato: `pending` con 1 errore

### Coppia marginale: `04-multi-table.csv` ↔ `07-nested-packing.csv`
- Ordine Alpine Möbel (ALP-843 qty=4) ↔ Packing list EuroPack (ALP-843 qty=6)
- Fornitori diversi (fornitore prodotto vs corriere/imballatore) — match cross-fornitore
- Score: 40 (basso — fornitore diverso, solo overlap codici articolo)
- Risultato: `pending` con 1 errore `quantity_mismatch` — l'operatore decide se la coppia è sensata

### Coppia che NON si riconcilia: sezioni di `09-shipping-tariff.csv`
- Il file ha 4 zone tariffarie (A-D, E-H, EU, extra-EU) → 4 documenti `price_list`
- Due `price_list` dello stesso fornitore → tipo transazionale, nessuna riconciliazione automatica
- Risultato: nessuna riconciliazione tra le sezioni dello stesso tariffario

### Coppia che NON si riconcilia: `03-header-offset.csv` ↔ sezione Nordic Design di `04-multi-table.csv`
- Entrambi `order` → tipo transazionale, non riconciliabile con stesso tipo
- Numeri documento diversi (ORD-2026-W07 vs nessuno)
- Risultato: `are_documents_complementary()` → False, skip

---

## Cache fornitori (column-mapping cache)

### Cos'è e perché esiste

Ogni volta che viene caricato un CSV, il sistema chiama GPT per capire la struttura del file: quali colonne corrispondono a `item_code`, `description`, `quantity`, `unit_price` e così via. Questa chiamata è la più costosa dell'intero flusso (latenza ~2–5 secondi, consumo token significativo) e si ripete ogni volta che lo stesso fornitore manda un file con le stesse intestazioni di colonna.

La **cache fornitori** evita di fare questa chiamata se il sistema ha già visto lo stesso fornitore con le stesse colonne: la risposta di GPT viene salvata in Redis e riutilizzata direttamente.

### Come funziona

La cache è salvata su **Redis DB 2** (DB 0 = broker Celery, DB 1 = embedding cache della riconciliazione).

La chiave di cache è composta da due hash MD5 a 12 caratteri:

```
col_map:<hash_fornitore>:<hash_headers>
```

- **`hash_fornitore`**: MD5 del nome fornitore normalizzato (maiuscolo → minuscolo, suffissi legali rimossi: "S.r.l.", "S.p.A.", "GmbH" ecc.). Ad esempio "Alfa Forniture S.r.l." e "ALFA FORNITURE SRL" producono lo stesso hash.
- **`hash_headers`**: MD5 dell'insieme ordinato delle intestazioni di colonna trovate nel file, indipendentemente dall'ordine in cui appaiono (si usa `sorted()`). Questo garantisce che due file con le stesse colonne in ordine diverso colpiscano la stessa cache.

Il valore memorizzato è un JSON con:
```json
{
  "column_mapping": {"0": "item_code", "1": "description", "2": "quantity", ...},
  "doc_type": "order"
}
```

TTL: **30 giorni**. Dopo 30 giorni la cache scade e la prossima chiamata aggiorna il mapping (utile se il fornitore cambia struttura del file).

### Flusso dettagliato

```
File CSV ricevuto
      │
      ▼
Pre-lookup (prima della chiamata GPT):
  1. Cerca il nome fornitore nelle prime 10 righe del file (regex "Fornitore:", "Supplier:", ecc.)
  2. Trova la riga con più celle non vuote nelle prime 20 righe → candidate headers
  3. Calcola col_map:<hash_fornitore>:<hash_headers>
  4. Redis hit? → usa il mapping cached, SALTA la chiamata GPT
  5. Redis miss → chiama GPT per capire la struttura
      │
      ▼
Dopo la chiamata GPT (solo in caso di miss):
  6. GPT restituisce il mapping completo
  7. Il mapping viene salvato in Redis con TTL 30 giorni
  8. Le prossime richieste dello stesso fornitore atterrano in cache
```

### Quando la cache viene usata e quando no

| Scenario | Comportamento |
|----------|---------------|
| Stesso fornitore, stesse colonne | ✅ Cache hit — GPT saltato |
| Stesso fornitore, colonne in ordine diverso | ✅ Cache hit — l'hash è sull'insieme ordinato |
| Stesso fornitore, colonna aggiunta/rinominata | ❌ Cache miss — hash headers cambia |
| Fornitore diverso, stesse colonne | ❌ Cache miss — hash fornitore diverso |
| Fornitore non rilevabile (campo assente nel file) | ❌ Cache bypassata — lookup impossibile |
| File con più sezioni (multi-table) | ❌ Cache non applicata — struttura ambigua |

### Risparmio atteso

In uno scenario produttivo dove ogni fornitore manda file simili ogni settimana:
- Prima richiesta per ogni fornitore: chiamata GPT (~3 secondi, ~1500 token)
- Richieste successive (stesso fornitore, stesse colonne): 0ms, 0 token
- Con 10 fornitori attivi e 4 upload/settimana ciascuno: risparmio del ~90% delle chiamate di parsing

### Invalidazione manuale

Se un fornitore cambia la struttura del CSV e il sistema usa ancora il vecchio mapping (cache stale), basta svuotare la cache Redis DB 2:

```bash
docker compose exec redis redis-cli -n 2 FLUSHDB
```

Questo invalida tutti i mapping cached. Le successive richieste chiameranno GPT e ri-popoleranno la cache con le nuove strutture.

Per invalidare solo un fornitore specifico (senza toccare gli altri):

```bash
docker compose exec redis redis-cli -n 2 KEYS "col_map:*" | head -20
# identifica la chiave del fornitore, poi:
docker compose exec redis redis-cli -n 2 DEL col_map:<hash_fornitore>:<hash_headers>
```

---

## Note operative

**Quando una riconciliazione produce risultati strani:**
1. Verificare che i `doc_type` estratti siano corretti (visibile nel dettaglio documento)
2. Verificare che il `supplier_canonical` sia stato normalizzato correttamente
3. Se i documenti hanno item_code incompatibili (es. struttura OCR vs CSV), la riconciliazione non è utile → rifiutarla manualmente

**Pulizia riconciliazioni indesiderate:**
```bash
docker compose exec backend python manage.py shell -c "
from doc_manager.models import Reconciliation
Reconciliation.objects.filter(id__in=[<id1>, <id2>]).delete()
"
```

**Reset completo del database (solo in sviluppo):**
```bash
# Endpoint disponibile solo con DEBUG=True
curl -X POST http://localhost:8000/api/dev/reset/
```
