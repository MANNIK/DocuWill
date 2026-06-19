# SCRIPT — Presentazione WeWill Challenge
### Copione parola per parola · Deep dive ~55 minuti · Demo live inclusa

---

## LEGENDA

> **Testo in corsivo** → dillo esattamente così, o con parole vicine
> 🎬 **[DEMO]** → azione concreta da fare sullo schermo — cosa cliccare
> *(nota di regia)* → istruzione tecnica, non la dici a voce
> 📂 → file da aprire nel terminale o nell'editor
> ❓ **[Q&A]** → risposta pronta a una domanda difficile → vedi Appendice
> 🔬 → approfondimento tecnico profondo — puoi tagliarlo se sei a corto di tempo, ma studia queste parti: sono quelle su cui ti faranno domande difficili

---

## SETUP PRE-PRESENTAZIONE *(fai questo prima che entrino)*

```bash
# Assicurati che tutto giri
docker compose up -d

# Verifica tutti i container attivi
docker compose ps

# Login già fatto nel browser → http://localhost:3000
# Utente: administrator / Password: [la tua]

# Tieni pronti questi file da qualche parte accessibile:
# /Users/nikolamanev/Desktop/TEST PER QUORO/tests/02-european-invoice.csv
# /Users/nikolamanev/Desktop/TEST PER QUORO/tests/03-header-offset.csv
# /Users/nikolamanev/Desktop/TEST PER QUORO/tests/04-multi-table.csv
# Un file ZIP con p3-order-missing-row.csv e p3-ddt-missing-row.csv insieme
# Una foto di documento (per la sezione WhatsApp)
```

*(Apri il browser su http://localhost:3000 con la dashboard già caricata e loggata.
Apri l'editor con `ai_service/routers/csv_parser.py` in una tab, `backend/doc_manager/reconciliation.py`
in un'altra, `backend/doc_manager/models.py` in una terza. Minimizza fino a che non serve.)*

---

## TIMING INDICATIVO

| Sezione | Durata |
|---------|--------|
| 1. Apertura + problema | ~3 min |
| 2. Architettura overview | ~5 min |
| 3. DEMO 1 — Upload CSV | ~5 min |
| 4. Area 1 — Parser universale | ~8 min |
| 5. Area 2 — Modelli e Database | ~5 min |
| 6. Area 3 — Coda asincrona + Cache | ~8 min |
| 7. Area 4 — Riconciliazione a cascata | ~10 min |
| 8. DEMO 2 — Riconciliazione + WhatsApp | ~4 min |
| 9. Sicurezza | ~6 min |
| 10. Chiusura | ~1 min |
| **Totale** | **~55 min** |

> *(Nota: questo è lo script di studio completo. Per la presentazione live puoi saltare i blocchi 🔬 senza perdere il filo — ma studia comunque tutti perché sono le domande difficili.)*

---

---

## 1 · APERTURA — IL PROBLEMA REALE *(~3 min)*

*(respira, pausa, poi parti con calma)*

> *"Immaginate un ufficio acquisti di una piccola-media impresa. Ogni settimana arrivano documenti da venti fornitori diversi: ordini, fatture, DDT — cioè documenti di trasporto — packing list, tariffari aggiornati. Venti fornitori, venti formati diversi."*

> *"Il fornitore svedese manda un CSV con le intestazioni in svedese e i numeri con la virgola come separatore decimale. Il fornitore austriaco manda un Excel con tre fogli, dove il vero header delle colonne è in riga tre perché le righe uno e due sono l'intestazione aziendale. Il fornitore italiano vi manda la foto di un modulo cartaceo su WhatsApp."*

> *"L'operatore amministrativo riceve tutto questo, apre ogni file, e controlla a mano: le quantità corrispondono a quelle che ho ordinato? Il prezzo è quello che abbiamo pattuito? Manca qualche articolo nella consegna? Questo richiede ore ogni settimana, scala pessimo, ed è soggetto a errori umani su un'attività critica per la contabilità."*

*(pausa breve)*

> *"WeWill risolve questo. In una riga: carico due documenti correlati — per esempio l'ordine che ho mandato al fornitore e la fattura che mi arriva — e il sistema mi dice automaticamente dove c'è differenza, classificata per gravità, e mi chiede solo di approvare o rifiutare le eccezioni. Il novanta percento dei casi si risolve da solo, senza toccare niente."*

*(pausa)*

> *"Quello che vedrete oggi non è un prototipo accademico. È un sistema con autenticazione JWT, autorizzazione per-utente, throttling, protezione SSRF, validazione dei file a livello di byte, e un engine di riconciliazione a tre livelli. Ho fatto un audit completo del codice e ho chiuso ogni buco prima di questa presentazione."*

> *"Partiamo dall'architettura, poi facciamo una demo live, e poi smonto il codice componente per componente."*

---

## 2 · ARCHITETTURA — PANORAMICA *(~5 min)*

*(puoi mostrare il diagramma a blocchi del CLAUDE.md o RICONCILIAZIONI_TEORIA.md, o disegnarlo su lavagna)*

> *"Il sistema è composto da cinque aree che collaborano, orchestrate con Docker Compose — un solo comando e parte tutto."*

> *"L'operatore interagisce col **frontend Next.js** — React, TypeScript, design system CSS custom. Il frontend parla col **backend Django** via REST API autenticate con JWT. Django persiste tutto su **PostgreSQL 16**. Quando arriva un file da processare, Django non aspetta: mette il job in una **coda Celery** e risponde subito con 202 Accepted. Il worker Celery prende il job, chiama il **microservizio FastAPI** che usa GPT-4o per capire la struttura del documento, e poi avvia l'engine di riconciliazione."*

> *"Perché due servizi Python separati, Django e FastAPI, invece di uno solo? Tre motivi concreti."*

> *"Primo: **isolamento dei crash**. Se GPT-4o restituisce JSON malformato e FastAPI esplode, Django continua a servire le API senza problemi. Con un monolite, un'eccezione potrebbe portarsi dietro tutta l'applicazione."*

> *"Secondo: **scaling indipendente**. Se il parsing diventa il collo di bottiglia perché arrivano cento file contemporaneamente, aggiungo solo container FastAPI senza toccare Django. Con un monolite devo scalare tutto insieme."*

> *"Terzo: **separazione di competenze** chiara. Django gestisce stato, autenticazione, ORM. FastAPI gestisce I/O asincrono e integrazione LLM. Ogni tecnologia fa quello per cui è ottimizzata."*

> *"Ci sono poi due sistemi trasversali: **Redis**, che fa tre cose distinte in tre database logici separati — coda Celery, cache embedding, cache column mapping. E **Docker Compose**, che orchestra i sette container con un solo comando."*

🔬 > *"Qualche parola in più sulle tecnologie, perché potrei usarle in modo banale — invece ogni scelta ha una ragione precisa."*

🔬 > *"**Django Rest Framework**, o DRF, è un layer sopra Django che aggiunge serializzatori — classi che traducono i modelli ORM in JSON e viceversa, con validazione automatica — autenticazione pluggabile, throttling, negoziazione del content type. Senza DRF dovrei scrivere tutta quella logica a mano."*

🔬 > *"**JWT — JSON Web Token**. Il modello tradizionale di autenticazione web usa sessioni server-side: login, il server crea una sessione in database o Redis, ti dà un cookie con l'ID sessione, ogni request verifica quel ID. Funziona ma non scala orizzontalmente — tutti i server devono condividere lo stesso store sessioni. JWT inverte il modello: il server crea un token firmato crittograficamente con una chiave segreta, che contiene i claim dell'utente — user_id, exp, iat. Il client lo manda nell'header Authorization. Il server verifica la firma matematicamente, senza toccare il database. È stateless: qualsiasi istanza del backend può verificare qualsiasi token. Il rovescio è che non si può revocare un token prima della scadenza — per questo ho token di accesso corti, quindici minuti, con refresh token separato che viene ruotato e può essere blacklistato."*

🔬 > *"**Celery con Redis come broker**. L'alternativa a Celery per operazioni lente è usare thread Django. Il problema dei thread è che condividono memoria — race condition — e Python ha il GIL, il Global Interpreter Lock, che impedisce vera parallelizzazione CPU-bound. Celery usa processi separati, ognuno con il proprio interprete, memoria isolata, senza GIL. Redis come broker è una lista FIFO in memoria: `.delay()` serializza i parametri in JSON e fa RPUSH sulla lista `celery`. Il worker fa BLPOP — blocking pop — che dorme finché non arriva un job, lo prende, lo esegue in isolamento. Un crash del job non tocca gli altri worker."*

---

## 3 · DEMO 1 — UPLOAD CSV END-TO-END *(~5 min)* 🎬

*(passi al browser, dashboard aperta)*

> *"Partiamo subito dalla demo. Vi mostro il flusso completo dall'upload al risultato."*

🎬 **[DEMO]** Vai su `/v2/upload` — pagina upload della dashboard.

> *"Questa è la pagina di upload. Drag and drop, multi-file. Prendo un file dalla challenge: è una fattura europea con separatore punto-e-virgola, numeri con la virgola come decimale, intestazioni in italiano. Un caso che farebbe impazzire un parser tradizionale."*

🎬 **[DEMO]** Trascina `02-european-invoice.csv` nell'area di upload.

> *"Ho rilasciato il file. Guardate cosa succede: il frontend chiama `POST /api/documents/upload/` e Django risponde immediatamente con **202 Accepted** — senza aspettare niente. Crea il documento nel database con status 'pending' e mette il job nella coda Celery."*

> *"Il frontend ora fa polling ogni secondo e mezzo. Vedete il progress tracker — i passi si completano uno dopo l'altro man mano che il task avanza: invio al microservizio, analisi GPT, estrazione righe, matching candidati."*

*(mentre aspetti il processing)*

> *"Nel frattempo, dietro le quinte, il worker Celery ha preso il job, calcolato subito l'hash SHA-256 del contenuto del file — ci torno dopo sul perché — e ha inviato il file al microservizio FastAPI. FastAPI legge le prime cinquanta righe, le trasforma in testo tabellare leggibile, e le manda a GPT-4o con un prompt che chiede di identificare la struttura: dove sono le intestazioni, quale colonna è la quantità, quale il prezzo, chi è il fornitore. GPT risponde con JSON strutturato. Python prende quel JSON e lo usa come schema per estrarre tutte le righe — non solo quelle che GPT ha visto."*

🎬 **[DEMO]** Quando il documento appare come "processed", cliccaci sopra per vedere il dettaglio.

> *"Eccolo: tipo documento 'invoice', fornitore normalizzato, numero documento, data, importo totale. E sotto, tutte le righe estratte con i campi normalizzati. Il sistema ha capito da solo che il separatore era il punto-e-virgola, che il decimale era la virgola, che l'header era in riga quattro perché le prime tre erano metadati aziendali."*

---

## 4 · AREA 1 — IL PARSER UNIVERSALE *(~8 min)*

📂 *(apri `ai_service/routers/csv_parser.py` nell'editor)*

> *"Parliamo del parser in dettaglio, perché è la prima scelta architetturale fondamentale."*

> *"L'approccio ingenuo per gestire CSV di fornitori diversi sarebbe questo:"*

*(scrivi o mostra sul codice)*

```python
if "qty" in header.lower() or "quantità" in header.lower() or "menge" in header.lower():
    column_type = "quantity"
```

> *"Lista di keyword hardcoded per ogni lingua, ogni abbreviazione, ogni variante. Funziona per i casi che ho previsto. Ma cosa succede quando arriva un fornitore giapponese? O quando una packing list ha sia 'Qty per Box' che 'Total Qty' nella stessa tabella, e devo capire quale delle due è quella giusta da usare? Non scala. Non si mantiene. Non è intelligente."*

> *"La scelta che ho fatto è diversa: **dare a GPT-4o le prime cinquanta righe come testo tabellare** e chiedergli di capire la struttura. Non il contenuto — la struttura. Guardate come viene trasformato un file:"*

> *"Ogni riga diventa una stringa del tipo 'Riga 4: FRN-045 | Multifunktionsbord | 50 | 97,09'. GPT vede questo testo e risponde con un JSON preciso: qual è l'indice della riga di intestazione, quali sono le righe di dati, quale colonna mappa su 'item_code', quale su 'quantity', chi è il fornitore, che tipo di documento è."*

🔬 > *"Una scelta specifica che ha impatto enorme: **temperature zero**. GPT genera testo campionando dalla distribuzione di probabilità sui token possibili. A temperature 1, campiona in modo stocastico — la stessa prompt può dare risposte diverse. A temperature zero, si prende sempre il token con probabilità più alta — è praticamente deterministico. Per output strutturato come JSON, temperature zero è l'unica scelta sensata: voglio che lo stesso file processato domani dia lo stesso column_mapping di oggi."*

🔬 > *"**AsyncOpenAI invece di OpenAI**. FastAPI è costruito su asyncio — event loop singolo che gestisce migliaia di richieste concorrenti con coroutine. Se usassi il client OpenAI sincrono, la chiamata a GPT bloccherebbe l'intero event loop per tutta la durata — cinque, dieci secondi — e nessun'altra richiesta potrebbe essere gestita. AsyncOpenAI usa `await` per cedere il controllo all'event loop mentre aspetta la risposta di GPT. In pratica: con venti upload simultanei, AsyncOpenAI gestisce tutti e venti in parallelo con un solo thread. Il client sincrono li processava in serie."*

🔬 > *"**Pre-segmentazione in Python, prima di GPT**. Il parser ha una funzione `table_segmentation()` che analizza le righe del CSV in Python puro, senza chiamare GPT, per rilevare se ci sono più tabelle: guarda se il numero di colonne cambia bruscamente tra righe consecutive, o se ci sono righe completamente vuote che separano sezioni. Se il file ha una sola tabella continua, questa fase è O(N) ma zero costo API. Solo quando rileva potenziali sezioni multiple passa quel contesto a GPT."*

> *"Ma attenzione: GPT vede **solo cinquanta righe** per capire la struttura. Il file più grande della challenge ha 564 righe. Come le estraiamo tutte? Python prende il `column_mapping` restituito da GPT e lo applica autonomamente a tutto il file, senza ulteriori chiamate API. Nessun costo aggiuntivo, nessuna latenza aggiuntiva."*

🔬 > *"**Parsing numeri in formato europeo**. Il CSV ha '1.234,56' — punto come separatore migliaia, virgola come decimale. La funzione `parse_number()` non usa regex generiche. Algoritmo: conto le occorrenze di punto e virgola. Se trovo solo virgola, è il decimale — '97,09' diventa 97.09. Se trovo entrambi, il separatore decimale è l'ultimo — '1.234,56': l'ultimo separatore è la virgola, quindi il punto è il separatore migliaia, risultato 1234.56. Funziona anche con il formato anglosassone '1,234.56' per simmetria."*

> *"C'è anche il caso **multi-sezione**: il file `04-multi-table.csv` contiene ordini di due fornitori diversi nello stesso CSV. GPT lo rileva e restituisce due sezioni. Il sistema crea due documenti separati nel database, uno per fornitore. Questo gestisce il caso reale in cui un operatore esporta tutti gli ordini del giorno in un unico file."*

🔬 > *"**Cap MAX_SECTIONS=20**. Se un attaccante costruisce un file CSV ad arte con cinquecento sezioni, potrebbe creare cinquecento Document nel database con una sola chiamata API — amplificazione di risorse via LLM. Il cap a venti sezioni spezza questo vettore. Se GPT restituisce ventuno sezioni, le ultime vengono scartate."*

🔬 > *"**Perché split manuale e non pandas.read_csv**. Il parser legge il file riga per riga con `content.split('\\n')`, manualmente. Se usassi pandas con `header=None`, pandas normalizza tutte le righe alla stessa lunghezza del numero massimo di colonne, aggiunge NaN, e perde completamente le righe 'malformate' — che in realtà sono i titoli di sezione come 'Ordini dalla settimana 7'. Quelle righe sono fondamentali per capire la struttura di un file multi-sezione. Lo split manuale le preserva intatte."*

> *"Ogni riga estratta viene salvata con **due rappresentazioni**. I sette campi normalizzati — item_code, description, quantity, unit, unit_price, total_price, discount — sono indicizzati, veloci, usati per il confronto matematico. E poi c'è il campo `raw_data` in formato JSONB PostgreSQL, che contiene tutti i valori originali con i nomi reali delle colonne del CSV. Questo è fondamentale per i documenti non-standard come i tariffari, dove le colonne si chiamano 'Zona A Express €' o 'Supplemento carburante' — cose che non si mappano nei sette campi standard ma che GPT deve comunque confrontare."*

---

## 5 · AREA 2 — MODELLI E DATABASE *(~5 min)*

📂 *(apri `backend/doc_manager/models.py` — oppure mostra Django admin con i documenti caricati)*

> *"Il database è PostgreSQL 16, con quattro modelli principali."*

> *"**Document** è il file caricato: tipo documento, fornitore normalizzato, numero, data, importo. Ha un campo `supplier_canonical` — il nome fornitore normalizzato con rimozione di suffissi societari e fuzzy matching. Ha anche `file_hash`, lo SHA-256 del contenuto — ci torno."*

🔬 > *"**Come funziona `supplier_canonical`**. Quando un documento viene parsato, il task Celery chiama `canonical_supplier_name()`. Questa funzione scarica dal database la lista di tutti i canonical già esistenti. Per ogni canonical, calcola con rapidfuzz — una libreria C compilata, molto più veloce di Levenshtein Python puro — la similarità tra il nuovo nome fornitore e il canonical esistente, dopo aver rimosso i suffissi societari: S.r.l., GmbH, Ltd, AB, S.p.A., LLC, e una ventina di altre varianti internazionali. 'Alfa Forniture S.r.l.' diventa 'Alfa Forniture', 'ALFA FORNITURE SRL' diventa 'ALFA FORNITURE', la similarità tra le due è 100%. Se la similarità è sopra l'85%, il nuovo fornitore usa il canonical esistente. Altrimenti ne crea uno nuovo. Risultato: tutti i documenti dello stesso fornitore, anche con nomi leggermente diversi, hanno lo stesso `supplier_canonical` — fondamentale per il matching."*

🔬 > *"**Niente tabella Supplier separata**. I fornitori non hanno una tabella propria — sono campi su Document. La 'lista fornitori' che si vede nella dashboard è una vista derivata: `Document.objects.values('supplier_canonical').annotate(count=Count('id'))` — una GROUP BY SQL. Vantaggi: niente migration aggiuntiva, niente foreign key da mantenere, niente sync tra tabelle. Il svantaggio è che un fornitore 'esiste' solo se ha almeno un documento. Per questo use case è perfetto."*

🔬 > *"**KEEP IN SYNC**. La logica di normalizzazione fornitore — la funzione `_normalize_for_match` e la lista `_COMPANY_SUFFIXES` — esiste in due posti: `backend/doc_manager/utils.py` e `ai_service/utils/supplier.py`. Devono essere identiche. Il motivo: entrambi costruiscono la stessa chiave Redis per la cache column mapping — `col_map:<md5(supplier_canonical)[:12]>:<md5(headers)[:12]>`. Se la normalizzazione divergesse, Django e FastAPI costruirebbero chiavi diverse e la cache non funzionerebbe mai. Questo è documentato con un commento `# KEEP IN SYNC` in entrambi i file."*

> *"**DocumentRow** è una singola riga di dati: i sette campi normalizzati più il `raw_data` JSONB."*

🔬 > *"**JSONB vs colonne fisse**. JSONB è JSON binario in PostgreSQL — pre-parsato, compresso, indicizzabile. Il vantaggio su colonne fisse: posso fare query arbitrarie sui campi interni. `WHERE raw_data->>'Zona A Express €' = '4.90'` funziona senza aggiungere colonne. Vs JSON testuale: JSONB è più veloce in lettura perché il parsing è già fatto, ma leggermente più lento in scrittura. E posso aggiungere un indice GIN per ricerche full-text sul contenuto JSON. Vs NoSQL: ho le garanzie ACID di PostgreSQL per i dati critici — le riconciliazioni non possono essere parziali — e JSONB per la flessibilità dove serve."*

> *"**Reconciliation** è il collegamento tra due documenti: doc1 e doc2, lo status di revisione, un confidence score da zero a cento, e la lista delle discrepanze trovate."*

> *"**Discrepancy** è una singola differenza: il tipo di discrepanza, i valori nei due documenti, la severity — errore bloccante, warning o informazione — e il campo `llm_suggestion` dove GPT spiega in linguaggio naturale cosa potrebbe significare quella differenza."*

---

## 6 · AREA 3 — LA CODA ASINCRONA E LE CACHE *(~8 min)*

> *"Quando carichi un CSV, il parsing con GPT-4o richiede da cinque a trenta secondi. Se Django aspettasse il risultato prima di rispondere, il browser rimarrebbe bloccato. La soluzione è la coda asincrona."*

> *"Funziona come un ristorante: il cameriere prende l'ordine — Django risponde 202 — e passa la comanda in cucina — il job va nella coda Celery. Tu non aspetti in piedi che cucinino. Vai al tavolo, il frontend continua a funzionare, e il cameriere torna da te quando è pronto."*

> *"Redis gestisce tre cose completamente separate con tre database logici distinti. Ve li spiego uno per uno."*

🔬 > *"**Redis DB 0 — broker Celery**. Quando il task viene schedulato con `.delay()`, Celery serializza i parametri in JSON e fa RPUSH sulla lista `celery` nel Redis DB 0. Il worker fa BLPOP — blocking pop — che dorme aspettando il prossimo elemento. Appena arriva il job, lo preleva, lo deserializza, e lo esegue. I risultati del task vengono salvati con chiave `celery-task-meta-<uuid>` nello stesso DB 0, con TTL di un giorno. Questo permette al frontend di fare polling sullo status del task con `GET /api/documents/<id>/` — Django legge lo status dal modello Document, aggiornato dal worker al completamento."*

🔬 > *"**Redis DB 1 — cache embedding**. Questo è il sistema più interessante. Spiego il problema: nell'engine di riconciliazione, devo confrontare il fornitore del documento appena caricato con tutti i candidati nel database. Se ho duecento documenti da venti fornitori diversi, ho al massimo venti nomi fornitore unici. Ma se calcolo la similarity per ogni coppia documento-candidato individualmente, chiamo OpenAI O(N) volte per ogni nuovo documento — e N cresce. Con la cache, ogni nome fornitore viene calcolato una volta sola e riutilizzato infinite volte."*

🔬 > *"La funzione `_embed(text)` implementa una **cascata a tre livelli**. Livello uno: dizionario Python in-process `_local_cache`, lookup O(1), zero I/O, sub-microsecondo. Questo dict è bounded — limitato a cinquemila voci. Perché il limite? Un sistema long-running con migliaia di fornitori unici riempirebbe progressivamente la RAM del worker senza mai liberarla — memory leak lento ma reale. Quando si supera il limite, viene eliminata una voce casuale. Livello due: Redis DB 1, chiave `emb:<testo>` con TTL di ventiquattro ore, condiviso tra tutti i worker Celery. Se worker A ha calcolato l'embedding di 'Nordic Design AB' e lo ha messo in Redis, worker B lo trova in Redis senza chiamare OpenAI. Livello tre: solo se miss su entrambi i livelli precedenti, si chiama l'API OpenAI `text-embedding-3-small`, che restituisce un vettore di millequinquecentotrentasei float che rappresenta il significato semantico del testo. Si mette in cache su entrambi i livelli e si ritorna."*

🔬 > *"**Fail-soft totale**. Ogni punto del codice che usa Redis o OpenAI per gli embedding è wrappato in try-except. `_get_redis()` ritorna None se la connessione fallisce — mai un'eccezione. `_get_openai_client()` stessa cosa. Se Redis è giù, si salta al livello tre. Se anche OpenAI è giù, `_embed()` ritorna None e il componente fornitore del match score vale zero — la riconciliazione non crasha, degrada gracefully. Lazy init: né il client Redis né il client OpenAI vengono creati al boot del worker. Vengono creati al primo uso, in modo che un Redis non ancora pronto all'avvio non impedisca il boot."*

🔬 > *"**Cosine similarity in Python puro**, senza numpy. La formula è: prodotto scalare dei due vettori diviso per il prodotto delle loro norme. `dot = sum(a*b for a,b in zip(v1, v2))`. `norm = math.sqrt(sum(x*x for x in v))`. Il risultato è un numero tra zero e uno: uno significa vettori identici, zero significa non correlati. Su vettori da millequinquecentotrentasei float, questo richiede circa un decimo di millisecondo su hardware moderno. Perché non numpy? Meno dipendenze nel microservizio di riconciliazione, che è il backend Django — numpy è una dipendenza grossa e non serve per nient'altro."*

🔬 > *"**Redis DB 2 — cache column mapping**. Questo è il secondo sistema di cache. Quando GPT analizza un CSV e capisce la struttura — 'la colonna tre è quantity, la colonna cinque è unit_price' — quel mapping viene salvato in Redis DB 2 con una chiave composita: `col_map:<MD5 del supplier_canonical>:<MD5 degli header ordinati>`. TTL: trenta giorni. Ragionamento: un fornitore di solito non cambia il formato del CSV in un mese. Se lo cambia, gli header cambiano, la chiave è diversa, cache miss automatico, GPT ricalcola. La prossima volta che arriva un file dello stesso fornitore con gli stessi header, il parser trova il mapping già pronto in Redis e salta la chiamata GPT per la struttura. Zero costo, zero latenza. Nota onesta: la lettura pre-GPT funziona solo se il nome fornitore è dichiarato esplicitamente nelle prime dieci righe del file grezzo — tipo 'Fornitore: Nordic Design AB'. Se non è lì, non sappiamo a quale mapping cercare prima di aver chiamato GPT. Ma la scrittura post-GPT funziona sempre, quindi la cache si popola per tutti i fornitori."*

> *"Il retry è intelligente: Celery riprova automaticamente fino a tre volte con sessanta secondi di pausa, ma **solo per errori transitori** — timeout di rete, connessione rifiutata, 5xx dal microservizio. Se GPT restituisce JSON malformato, quello è un errore permanente: il documento finisce in stato 'error' direttamente, senza sprecare due ulteriori retry inutili e senza ritardare il feedback all'utente."*

---

## 7 · AREA 4 — LA RICONCILIAZIONE A CASCATA *(~10 min)*

📂 *(apri `backend/doc_manager/reconciliation.py`)*

> *"Questa è la parte più interessante del sistema. L'engine di riconciliazione a tre livelli. Il principio di design è uno solo: **usa strumenti economici prima di quelli costosi**. Il confronto matematico è gratuito e richiede millisecondi. GPT-4o costa denaro e richiede secondi. Quindi si usa GPT solo dove serve davvero."*

> *"Prima di riconciliare, il sistema deve trovare il miglior candidato: tra tutti i documenti nel database, qual è quello più probabile che formi una coppia sensata col documento appena caricato? Si calcola un **match score** composito da zero a cento."*

🔬 > *"**Match score campo per campo — i numeri reali**. Stesso numero documento: più cinquanta punti — è il segnale più forte, quasi certezza. Stesso fornitore misurato con cosine similarity degli embedding: se la similarity è sopra ottantotto percento, più trenta punti — stesso fornitore; se è sopra settantadue percento, più quindici — probabilmente lo stesso fornitore con variante di nome. Stessa data: più dieci. Totali simili: se la differenza percentuale è sotto l'uno percento, più dieci; sotto il cinque percento, più cinque. E overlap degli articoli misurato con l'**indice di Jaccard** — intersezione diviso unione degli insiemi di item_code. Jaccard sopra il settanta percento: più quaranta punti; sopra il quaranta: più venticinque; sopra il dieci: più dieci. Soglia minima: trenta punti. Un documento con solo il fornitore in comune — quindici punti — e qualche articolo condiviso — dieci punti — non supera la soglia: non si tenta la riconciliazione perché le probabilità di un match falso sono troppo alte."*

> *"Ma prima ancora dello score, ci sono le **guardie di esclusione**. Si salta un candidato se esiste già una riconciliazione tra quei due documenti. Si salta se il confronto SHA-256 del contenuto dei file coincide — significa che è lo stesso file caricato due volte, eventualmente rinominato. Si salta se la coppia ha già un fingerprint identico nel database — stesso tipo, stesso fornitore, stesso numero documento. E si salta se GPT, interrogato sulla compatibilità dei tipi, dice che la coppia non ha senso — un ordine con un altro ordine dello stesso fornitore non si riconcilia, sono due acquisti distinti."*

> *"Una nota importante sul rilevamento duplicati: **non uso il filename**. Uso lo SHA-256 del contenuto. Il motivo è semplice: due file chiamati entrambi 'fattura_fornitore.csv' potrebbero essere due fatture completamente diverse, di mesi diversi. Con il solo confronto sul nome sarebbero state bloccate. Al contrario, lo stesso file caricato due volte con nomi diversi — 'fattura.csv' e 'fattura_copia.csv' — verrebbe correttamente riconosciuto come duplicato perché l'hash coincide."*

*(pausa breve)*

> *"Trovata la coppia, prima di avviare il confronto, il sistema assegna i ruoli **doc1 e doc2** seguendo una priorità semantica, non cronologica. Gli ordini e i tariffari sono sempre doc1 — sono il riferimento, l'intenzione originale. Le fatture e le conferme d'ordine vengono dopo. I DDT e le packing list per ultimi — attestano l'esecuzione fisica."*

> *"Perché importa? Perché le discrepanze sono **asimmetriche**. Un articolo presente in doc1 ma assente in doc2 è 'missing_in_doc2' con severity error — qualcosa è stato ordinato ma non è arrivato. Un articolo extra in doc2 è un warning — qualcosa di inatteso è apparso. Se invertissi l'ordine e il DDT diventasse doc1, un articolo mancante nel DDT apparirebbe come 'extra nell'ordine' con severity warning, verrebbe auto-approvato, e nessuno si accorgerebbe che manca una consegna."*

*(pausa)*

> *"Ora la cascata vera e propria."*

> *"**Livello 1 — confronto matematico**. Ogni documento viene indicizzato per item_code. Per ogni codice nel doc1, si cerca il corrispondente nel doc2. Se i valori numerici coincidono: ok. Se differiscono: discrepanza. Se l'articolo manca completamente nel doc2: 'missing_in_doc2', severity error."*

🔬 > *"**Fuzzy match su item_code — `_fuzzy_find`**. Prima del fallback embedding, c'è un fuzzy match sui codici articolo usando `SequenceMatcher` della libreria standard `difflib`. La formula è: `2 * M / T` dove M è il numero di caratteri comuni nelle sequenze allineate e T è il totale dei caratteri nelle due stringhe. 'FRN-001' ha sette caratteri, 'FRN001' ne ha sei, i caratteri comuni sono F, R, N, 0, 0, 1 — sei. `2*6 / (7+6) = 12/13 = 0.923`. La soglia è 0.9. 'FRN-001' e 'FRN001' vengono abbinati come stesso articolo, con un warning 'code_mismatch' per registrare la differenza di formato. Perché la soglia 0.9 e non, che so, 0.85? Ho testato con i file della challenge: la soglia 0.9 prende le varianti di formato reali senza falsi positivi — 'FRN-001' e 'GRN-001' darebbero 0.857, che è sotto la soglia, quindi vengono correttamente trattati come articoli diversi."*

🔬 > *"**Fallback embedding su descrizione**. Se dopo il fuzzy match sull'item_code non si trova corrispondenza, il livello 1 non si arrende: calcola l'embedding della descrizione testuale di doc1 e della descrizione di doc2, e misura la cosine similarity. Se è sopra il 88%: stesso articolo descritto in modo diverso, abbinamento con nota 'description_match_via_embedding'. Questo gestisce il caso reale in cui un fornitore cambia il codice articolo tra ordine e fattura ma mantiene la descrizione."*

🔬 > *"**`_compare_rows` — quali campi danno error e quali warning**. Trovata la coppia di righe corrispondenti, il sistema le confronta campo per campo. `quantity` e `unit_price`: tolleranza 0.001, ovvero lo 0.1% — discrepanze reali danno severity error. `unit` di misura: discrepanza dà severity warning — 'pz' vs 'pezzi' è probabilmente lo stesso. `discount` e `total_price`: tolleranza 0.001, severity warning — il totale potrebbe differire per arrotondamento. Perché la tolleranza 0.001? Floating point: `8155.65 * 1.0 = 8155.650000000001` in IEEE 754 — senza tolleranza, questo darebbe una discrepanza falsa su ogni riga."*

> *"Se il livello 1 non trova nessuna discrepanza, la riconciliazione viene **auto-approvata immediatamente**. Zero chiamate GPT. Zero costo."*

> *"**Livello 2 — validazione semantica**. Ci sono discrepanze. Ma prima di segnalarle come errori reali, chiediamo a GPT se sono davvero problemi o solo differenze di rappresentazione. E qui c'è l'ottimizzazione fondamentale: **GPT non vede mai tutto il documento**. Riceve solo le righe coinvolte nelle discrepanze. Se un documento ha cento righe e tre hanno discrepanze, GPT vede solo quelle tre. Su file da cinquecento righe, questo è un risparmio del novantasei percento di token. GPT può declassare severity da error a warning — per esempio se riconosce che i codici articolo sono formattati diversamente ma rappresentano la stessa cosa — oppure può aumentare la confidence della coppia se trova la corrispondenza particolarmente coerente."*

> *"Per i documenti non-standard come i tariffari, il livello 1 non funziona — non ci sono item_code, i prezzi sono in colonne dinamiche tipo 'Zona A Express €'. In questo caso si salta il livello 1 e si manda il `raw_data` completo a GPT, che capisce la struttura matriciale e confronta le celle corrispondenti."*

> *"**Livello 3 — decisione finale**. Se dopo il livello 2 non rimane nessuna discrepanza con severity error: auto-approvato. Se rimane almeno un errore: status 'pending', l'operatore deve intervenire."*

---

## 8 · DEMO 2 — RICONCILIAZIONE + WHATSAPP *(~4 min)* 🎬

*(torna al browser)*

> *"Vi mostro adesso una riconciliazione con una discrepanza reale."*

🎬 **[DEMO]** Vai su `/v2/reconciliations` — lista riconciliazioni.

> *"Qui vedete tutte le riconciliazioni. I badge colorati indicano lo status: verde approvato, arancio pending in attesa di revisione, rosso rifiutato. Apro una di quelle pending."*

🎬 **[DEMO]** Clicca su una riconciliazione pending (idealmente la p3 con riga mancante, o la p2 con prezzo diverso).

> *"Questo è il cuore dell'interfaccia operatore. A sinistra il documento di riferimento — l'ordine. A destra il documento da verificare — il DDT o la fattura. Le righe senza problemi sono bianche. Quelle con discrepanze sono evidenziate: rosso per gli errori bloccanti, arancio per i warning, grigio per le informazioni."*

> *"Nel pannello laterale, la DiscrepancyRail: ogni discrepanza è elencata con il tipo, i valori nei due documenti, la severity, e il suggerimento di GPT. L'operatore può risolverle una per una: mantieni il valore doc1, mantieni il valore doc2, sono equivalenti, ignora. Oppure approva o rifiuta l'intera riconciliazione in un colpo solo."*

🎬 **[DEMO]** Mostra la discrepanza: `value_doc1` vs `value_doc2`, poi il `llm_suggestion` sotto.

> *"Vedete qui: GPT ha scritto in linguaggio naturale perché secondo lui quella discrepanza potrebbe essere un problema reale o una consegna parziale attesa. Questo aiuta l'operatore a prendere una decisione informata, non solo vedere due numeri diversi."*

---

*(se hai il setup WhatsApp, aggiungi questa parte — altrimenti salta)*

🎬 **[DEMO WhatsApp — opzionale]** Vai su `/v2/inbox`.

> *"Questa è l'inbox WhatsApp. Il sistema riceve foto di documenti cartacei tramite un webhook Twilio. Django scarica i byte dell'immagine, li manda al microservizio FastAPI che li codifica in base64 e li invia a GPT-4o Vision con un prompt specializzato per l'OCR. GPT estrae fornitore, numero documento, righe con codici e quantità. Da lì in poi: stesso identico flusso di un CSV."*

---

## 9 · SICUREZZA *(~6 min)*

> *"Prima di chiudere, voglio parlare di sicurezza — perché è una delle cose su cui ho lavorato di più, e su cui viene spesso trascurata nei prototipi."*

> *"Ho fatto un **audit sistematico** dell'intero codebase e ho trovato e chiuso una serie di problemi. Li vado a elencare."*

> *"**Autenticazione e autorizzazione**. Ogni endpoint richiede JWT valido — nessun endpoint è pubblico in produzione. Ma autenticazione non è autorizzazione. Ho implementato **autorizzazione object-level per-utente**: ogni utente vede e modifica solo i propri documenti e le proprie riconciliazioni. Il filtro `created_by=request.user` è in ogni `get_queryset`. Se provi a fare GET su un documento di un altro utente, ricevi 404."*

🔬 > *"**Perché 404 e non 403**? Il 403 Forbidden rivela tre cose: l'endpoint esiste, una risorsa con quell'ID esiste, e tu non puoi accederci. Con questa informazione, un attaccante può enumerare quali ID esistono nel sistema facendo richieste a caso — un ID che restituisce 403 esiste, uno che restituisce 404 no. Il 404 non distingue tra 'non esiste' e 'esiste ma non è tuo' — nessuna informazione trapela. Gli utenti staff vedono tutto. Gli endpoint amministrativi richiedono `IsAdminUser`."*

> *"**Rate limiting scoped**. Non ho messo throttle globale — avrebbe bloccato il polling della dashboard in meno di un minuto. Ho throttle chirurgici: dieci upload al minuto per utente, cinque registrazioni all'ora per IP, sessanta webhook al minuto per IP. Il throttle login previene il brute force su `POST /api/auth/token/`."*

> *"**JWT hardening**. Il token di accesso dura quindici minuti. Il refresh token viene ruotato ad ogni uso — se qualcuno intercetta un refresh token già usato, il sistema lo rigetta. Il logout chiama un endpoint che mette il refresh token nella blacklist lato server — prima fare logout non serviva a niente."*

> *"**SSRF — Server Side Request Forgery**. Se un attaccante manda un messaggio WhatsApp con un link immagine che in realtà punta a `169.254.169.254` — l'endpoint dei metadati di AWS — il sistema deve bloccarlo."*

🔬 > *"La mitigazione SSRF è a tre strati. Primo: validazione del formato URL — deve essere http o https, non file://, gopher://, o altri schemi. Secondo: `is_safe_external_url()` risolve il DNS in Python e controlla che l'IP risultante non sia in range privati — 10.x, 192.168.x, 172.16-31.x, 127.x, il link-local 169.254.x, IPv6 loopback e link-local. Terzo, e cruciale: `follow_redirects=False`. Senza questa opzione, un redirect da un URL inizialmente valido verso `http://169.254.169.254/` bypasserebbe tutti i controlli precedenti. Con `follow_redirects=False`, il sistema fa una sola richiesta HTTP e si ferma — i redirect non vengono seguiti."*

> *"**FastAPI non è esposto**. La porta 8001 è visibile solo all'interno della rete Docker. Django deve presentare un token segreto nell'header `X-Internal-Token` per poter parlare con FastAPI."*

🔬 > *"**compare_digest e timing attack**. Un confronto normale `token_a == token_b` in Python esce al primo carattere diverso — se il token corretto inizia con 'abc' e tu provi 'xyz', l'uscita è immediata; se provi 'abd', ci vuole un microsecondo in più. Un attaccante che può misurare il tempo di risposta con precisione sufficiente può ricostruire il token carattere per carattere. `hmac.compare_digest` itera sempre su tutti i caratteri indipendentemente da dove si trova la differenza — tempo costante garantito. E se il token non è configurato, `require_internal_token` fa fail-closed: lancia un'eccezione 401, non lascia passare silenziosamente."*

> *"**Validazione dei file**. Il serializer Django controlla estensione e dimensione — massimo dieci megabyte. Ma questo non basta: l'estensione la dichiara l'utente."*

🔬 > *"**Magic bytes**. I formati file hanno firme binarie nelle prime posizioni: PNG inizia con `\\x89PNG`, JPEG con `\\xff\\xd8\\xff`, PDF con `%PDF-`, ZIP con `PK\\x03\\x04`. Questi byte non possono essere fatti coincidere senza corrompere il file — un file con header PNG ma contenuto JavaScript è un file PNG corrotto, non uno script eseguibile. Il router OCR di FastAPI legge i magic bytes prima di passare il file a GPT Vision. Un file `.png` con header ZIP viene rifiutato con 422."*

> *"**Prompt injection guard**. Tutti e tre i router AI hanno un blocco esplicito nel prompt che dice a GPT di ignorare istruzioni embedded nel contenuto del documento. GPT risponde con un campo `injection_detected`. Se è true: log server-side, HTTP 422 al client con messaggio generico. Il contenuto malevolo non passa mai."*

> *"**Errori generici verso il client**. Il client non vede mai stack trace, path di file, nomi di variabili. Riceve sempre un messaggio generico. Il dettaglio tecnico va solo nei log del server."*

> *"**Deduplicazione SHA-256**. Ho già menzionato che uso l'hash del contenuto del file per rilevare duplicati. Questo ha anche un'implicazione di sicurezza: previene che qualcuno carichi lo stesso file mille volte cambiandogli solo il nome per esaurire la quota GPT."*

---

## 10 · CHIUSURA *(~1 min)*

> *"Ricapitolando quello che avete visto: un sistema di ingestion universale che capisce qualsiasi formato CSV o Excel senza configurazione per fornitore. Un OCR basato su GPT-4o Vision per documenti cartacei via WhatsApp. Un engine di riconciliazione a tre livelli che usa GPT solo dove serve, riducendo i costi del novanta percento. Un'interfaccia operatore che mostra le discrepanze classificate per gravità e permette la risoluzione discrepanza per discrepanza. E una copertura di sicurezza che resiste a un audit serio."*

> *"Cosa c'è nella roadmap? L'integrazione WhatsApp reale con Twilio — ora ho il mock funzionante, manca solo il numero di produzione. La cache dei column mapping completa: l'infrastruttura c'è, Redis è pieno di dati, manca la fase di pre-lookup che recupera il fornitore dal database invece che dal file grezzo — questo permetterebbe di saltare GPT completamente per i fornitori già visti. E i WebSocket per le notifiche push in tempo reale invece del polling."*

*(pausa, guardali)*

> *"Domande?"*

---

---

# APPENDICE — DOMANDE DIFFICILI CON RISPOSTE PRONTE

*(leggi solo se ti fanno la domanda)*

---

❓ **"GPT non è deterministico — come gestisci le variazioni tra un parsing e l'altro?"**

> *"Tre livelli di difesa. Primo: `temperature=0` nelle chiamate di parsing — GPT usa la distribuzione softmax sul vocabolario dei token, e temperature zero sceglie sempre il token con probabilità più alta, il cosiddetto argmax. Non è matematicamente garantito al cento percento ma è il comportamento più stabile possibile. Secondo: la cache column mapping salva il mapping già validato per ogni fornitore — il secondo upload dello stesso fornitore non chiama GPT per la struttura, usa la cache con TTL trenta giorni. Terzo: anche se GPT sbagliasse il mapping tra un run e l'altro, il `raw_data` JSONB salva sempre tutti i valori originali con i nomi reali delle colonne CSV. Il livello 2 della riconciliazione usa `raw_data` per il confronto effettivo, quindi è immune alle variazioni di mapping."*

---

❓ **"Come scala il sistema se arrivano mille file al giorno?"**

> *"Il bottleneck principale è il Celery worker. Per parallelizzare basta aggiungere istanze di `celery_worker` nel Docker Compose — ognuna prende job indipendenti dalla coda Redis. FastAPI è stateless, si scala allo stesso modo. PostgreSQL con gli indici che ho aggiunto — su `supplier_canonical`, `status`, `created_at` — regge facilmente migliaia di documenti al giorno. Redis DB 1 è condiviso tra tutti i worker: la cache embedding è calda per l'intera flotta subito, senza che ogni worker debba ricostruirla da zero. Per scala enterprise: Kubernetes con autoscaling orizzontale dei worker, PostgreSQL read replicas, Redis Cluster. L'architettura a microservizi nasce proprio per questo."*

---

❓ **"Perché hai usato Django E FastAPI invece di scegliere uno solo?"**

> *"Django è il migliore per gestire stato, autenticazione, ORM, relazioni tra modelli. Ha un ecosistema maturo per tutto quello. FastAPI è il migliore per I/O asincrono e integrazione LLM — la sua gestione nativa async/await con AsyncOpenAI è fondamentale perché le chiamate a GPT-4o possono durare secondi e non devo bloccare il thread. Se usassi solo Django, le chiamate OpenAI bloccherebbero il worker WSGI per tutta la durata della risposta. Se usassi solo FastAPI, dovrei reimplementare da zero autenticazione, ORM, admin, serialization. Usarli insieme in microservizi è la scelta che massimizza i punti di forza di entrambi."*

---

❓ **"Come funziona la deduplicazione se qualcuno carica lo stesso file due volte?"**

> *"Due livelli. Il primo è l'hash SHA-256 del contenuto del file, calcolato subito al momento dell'upload nel task Celery — prima ancora di chiamare FastAPI. SHA-256 è una funzione crittografica: due file con contenuto identico danno sempre lo stesso hash, due file con anche un solo byte diverso danno hash completamente diversi. Se due documenti nel DB hanno lo stesso hash, sono identici a livello di byte e non vengono mai riconciliati tra loro — anche se li hai caricati con nomi diversi. Il secondo livello è il fingerprint della coppia già riconciliata: se esiste già una Reconciliation con gli stessi tipo-fornitore-numero per entrambi i documenti, quella coppia viene saltata. Questo gestisce il caso in cui qualcuno carichi lo stesso documento con un piccolo cambiamento — hash diverso, ma stessa coppia logica."*

---

❓ **"Come funziona la sicurezza del webhook Twilio?"**

> *"Twilio firma ogni request con HMAC-SHA1, usando il tuo `AUTH_TOKEN` come chiave segreta e l'URL completo più i parametri POST come messaggio. Django verifica questa firma prima di processare qualsiasi webhook. Se la firma non corrisponde, risponde 403. Questo significa che anche se qualcuno conosce l'URL del webhook, non può triggerare OCR senza conoscere il token Twilio. Per i test in locale, c'è una modalità dev che bypass la verifica della firma — ma viene disabilitata in produzione tramite variabile d'ambiente."*

---

❓ **"Il sistema funziona senza OpenAI?"**

> *"No, GPT-4o è centrale sia per il parsing che per l'OCR e la valutazione semantica. Senza API key, i documenti rimangono in stato 'pending' e poi passano a 'error' con un messaggio generico — nessun dettaglio tecnico viene esposto al client. Detto questo, i test unitari girano completamente senza OpenAI perché tutte le chiamate API sono mockate con monkeypatch. I test E2E invece richiedono l'API key reale."*

---

❓ **"La cache dei column mapping è davvero efficace?"**

> *"La risposta onesta è: l'infrastruttura è completa e funzionante — Redis DB 2 riceve il mapping dopo ogni parsing, con TTL di trenta giorni. Il punto su cui sono ancora a lavoro è il pre-lookup: per leggere la cache prima di chiamare GPT, devo sapere il nome del fornitore in anticipo. Ora lo estraggo dal file grezzo scansionando le prime dieci righe alla ricerca di keyword come 'Fornitore:' o 'Supplier:'. Non tutti i file hanno una riga del genere. Il miglioramento ovvio è usare il `supplier_canonical` già salvato nel database dal parsing precedente per costruire la chiave cache, invece di cercarlo nel file. Questo renderebbe la cache efficace per tutti i fornitori già visti, non solo quelli che usano un formato specifico."*

---

❓ **"Perché usare embedding semantico e non solo fuzzy string matching per confrontare i fornitori?"**

> *"Il fuzzy matching con SequenceMatcher misura distanza di edit — quante operazioni per trasformare una stringa nell'altra. Funziona benissimo per varianti minime dello stesso nome dopo normalizzazione: 'ALFA SRL' e 'Alfa S.r.l.' dopo stripping dei suffissi societari diventano entrambe 'ALFA', similarità 100%. Ma non funziona per nomi semanticamente equivalenti ma strutturalmente diversi: 'Nordic Design' e 'Nordisches Design GmbH' hanno bassa similarità di edit ma sono lo stesso fornitore scritto in lingue diverse. L'embedding trasforma il testo in un vettore di millequinquecentotrentasei numeri float che cattura il significato semantico — parole correlate in lingue diverse hanno vettori vicini nello spazio perché il modello è addestrato su testo multilingua. Il cosine tra i loro vettori misura l'angolo: zero significa non correlati, uno identici. Sopra 0.88 è stesso fornitore, sopra 0.72 è probabilmente lo stesso. L'approccio combinato — rapidfuzz per il canonical name e embedding per il match score — gestisce sia le varianti ortografiche che le traduzioni."*

---

❓ **"Cosa succede se Redis crasha durante una riconciliazione?"**

> *"Il sistema è progettato fail-soft su tutta la cache. `_get_redis()` ritorna None se la connessione fallisce — mai un'eccezione che propaga. Ogni punto del codice che usa Redis per gli embedding è wrappato in try-except con fallback: se la cache non risponde, si chiama direttamente OpenAI. Se anche OpenAI è irraggiungibile, la componente fornitore del match score vale zero e la riconciliazione degrada gracefully senza crashare. I dati critici — documenti, riconciliazioni, discrepanze — sono tutti in PostgreSQL, non in Redis. Redis è solo accelerazione. Se crasha e riparte, la cache si ripopola organicamente con i prossimi upload. L'unica perdita reale è la coda Celery se Redis crasha senza persistence — i job in coda vengono persi e i documenti restano in stato 'pending'. Il fix è abilitare Redis AOF persistence o usare RabbitMQ come broker. Per lo scope della challenge è un tradeoff accettabile."*

---

❓ **"Hai fatto test automatici?"**

> *"Sì. Test unitari con pytest sul backend Django, con fixtures e monkeypatching — nessuna chiamata reale a GPT o al database esterno. Coprono l'engine di riconciliazione a tutti i livelli — fuzzy matching, embedding fallback, multi-sezione, riconciliazione cascata, deduplicazione SHA-256. I test girano in isolamento: `conftest.py` pulisce la cache Redis prima di ogni test e imposta rate limit altissimi nei settings di test per non essere bloccati dal throttling durante le suite."*

---

❓ **"Come hai gestito i file con struttura 'difficile' — multi-foglio Excel, header spostate, sezioni multiple?"**

> *"Ogni caso testato con un file reale. L'Excel multi-foglio viene trattato come N sezioni, uno per foglio. I file con metadati nelle prime righe prima dell'header vero: GPT identifica qual è la riga di header e quali sono le righe di dati — le righe precedenti vengono usate solo per estrarre i metadati come fornitore e numero documento. I file con più tabelle nella stessa pagina: GPT identifica le sezioni e crea un documento separato per ciascuna. Per i file con righe sporche nel mezzo — righe vuote, sottotitoli — c'è una regola nel prompt: se una sezione non ha valori numerici e non ha item_code, viene scartata come 'sezione fantasma'. E c'è un cap di venti sezioni massimo per file, per prevenire amplificazione malevola con file strutturati ad arte."*

---

*(fine script)*
