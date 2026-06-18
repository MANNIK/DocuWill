# SCRIPT — Presentazione WeWill Challenge
### Copione parola per parola · Deep dive ~35 minuti · Demo live inclusa

---

## LEGENDA

> **Testo in corsivo** → dillo esattamente così, o con parole vicine
> 🎬 **[DEMO]** → azione concreta da fare sullo schermo — cosa cliccare
> *(nota di regia)* → istruzione tecnica, non la dici a voce
> 📂 → file da aprire nel terminale o nell'editor
> ❓ **[Q&A]** → risposta pronta a una domanda difficile → vedi Appendice

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
| 2. Architettura overview | ~3 min |
| 3. DEMO 1 — Upload CSV | ~5 min |
| 4. Area 1 — Parser universale | ~5 min |
| 5. Area 2 — Modelli e Database | ~3 min |
| 6. Area 3 — Coda asincrona | ~2 min |
| 7. Area 4 — Riconciliazione a cascata | ~6 min |
| 8. DEMO 2 — Riconciliazione + WhatsApp | ~4 min |
| 9. Sicurezza | ~4 min |
| 10. Chiusura | ~1 min |
| **Totale** | **~36 min** |

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

## 2 · ARCHITETTURA — PANORAMICA *(~3 min)*

*(puoi mostrare il diagramma a blocchi del CLAUDE.md o RICONCILIAZIONI_TEORIA.md, o disegnarlo su lavagna)*

> *"Il sistema è composto da cinque aree che collaborano, orchestrate con Docker Compose — un solo comando e parte tutto."*

> *"L'operatore interagisce col **frontend Next.js** — React, TypeScript, design system CSS custom. Il frontend parla col **backend Django** via REST API autenticate con JWT. Django persiste tutto su **PostgreSQL 16**. Quando arriva un file da processare, Django non aspetta: mette il job in una **coda Celery** e risponde subito con 202 Accepted. Il worker Celery prende il job, chiama il **microservizio FastAPI** che usa GPT-4o per capire la struttura del documento, e poi avvia l'engine di riconciliazione."*

> *"Perché due servizi Python separati, Django e FastAPI, invece di uno solo? Tre motivi concreti."*

> *"Primo: **isolamento dei crash**. Se GPT-4o restituisce JSON malformato e FastAPI esplode, Django continua a servire le API senza problemi. Con un monolite, un'eccezione potrebbe portarsi dietro tutta l'applicazione."*

> *"Secondo: **scaling indipendente**. Se il parsing diventa il collo di bottiglia perché arrivano cento file contemporaneamente, aggiungo solo container FastAPI senza toccare Django. Con un monolite devo scalare tutto insieme."*

> *"Terzo: **separazione di competenze** chiara. Django gestisce stato, autenticazione, ORM. FastAPI gestisce I/O asincrono e integrazione LLM. Ogni tecnologia fa quello per cui è ottimizzata."*

> *"Ci sono poi due sistemi trasversali: **Redis**, che fa tre cose distinte in tre database logici separati — coda Celery, cache embedding, cache column mapping. E **Docker Compose**, che orchestra i sette container con un solo comando."*

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

## 4 · AREA 1 — IL PARSER UNIVERSALE *(~5 min)*

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

> *"Ogni riga diventa una stringa del tipo 'Riga 4: FRN-045 | Multifunktionsbord | 50 | 97,09'. GPT vede questo testo e risponde con un JSON preciso: qual è l'indice della riga di intestazione, quali sono le righe di dati, quale colonna mappa su 'item_code', quale su 'quantity', chi è il fornitore, che tipo di documento è. Temperature zero — output il più deterministico possibile."*

> *"Ma attenzione: GPT vede **solo cinquanta righe** per capire la struttura. Il file più grande della challenge ha 564 righe. Come le estraiamo tutte? Python prende il `column_mapping` restituito da GPT e lo applica autonomamente a tutto il file, senza ulteriori chiamate API. Nessun costo aggiuntivo, nessuna latenza aggiuntiva."*

> *"C'è anche il caso **multi-sezione**: il file `04-multi-table.csv` contiene ordini di due fornitori diversi nello stesso CSV. GPT lo rileva e restituisce due sezioni. Il sistema crea due documenti separati nel database, uno per fornitore. Questo gestisce il caso reale in cui un operatore esporta tutti gli ordini del giorno in un unico file."*

> *"Ogni riga estratta viene salvata con **due rappresentazioni**. I sette campi normalizzati — item_code, description, quantity, unit, unit_price, total_price, discount — sono indicizzati, veloci, usati per il confronto matematico. E poi c'è il campo `raw_data` in formato JSONB PostgreSQL, che contiene tutti i valori originali con i nomi reali delle colonne del CSV. Questo è fondamentale per i documenti non-standard come i tariffari, dove le colonne si chiamano 'Zona A Express €' o 'Supplemento carburante' — cose che non si mappano nei sette campi standard ma che GPT deve comunque confrontare."*

> *"E infine: il parser non usa mai pandas.read_csv con header automatico. Legge il file riga per riga, manualmente, per non perdere le righe 'malformate' che in realtà sono i titoli di sezione. Un dettaglio che fa la differenza su file reali."*

---

## 5 · AREA 2 — MODELLI E DATABASE *(~3 min)*

📂 *(apri `backend/doc_manager/models.py` — oppure mostra Django admin con i documenti caricati)*

> *"Il database è PostgreSQL 16, con quattro modelli principali."*

> *"**Document** è il file caricato: tipo documento, fornitore normalizzato, numero, data, importo. Ha un campo `supplier_canonical` — il nome fornitore normalizzato con rimozione di suffissi societari come S.r.l., GmbH, Ltd, e fuzzy matching con rapidfuzz per agganciare varianti dello stesso nome. 'Alfa Forniture S.r.l.' e 'ALFA FORNITURE SRL' finiscono nello stesso canonical. Ha anche `file_hash`, lo SHA-256 del contenuto — ci torno."*

> *"**DocumentRow** è una singola riga di dati: i sette campi normalizzati più il `raw_data` JSONB."*

> *"**Reconciliation** è il collegamento tra due documenti: doc1 e doc2, lo status di revisione, un confidence score da zero a cento, e la lista delle discrepanze trovate."*

> *"**Discrepancy** è una singola differenza: il tipo di discrepanza, i valori nei due documenti, la severity — errore bloccante, warning o informazione — e il campo `llm_suggestion` dove GPT spiega in linguaggio naturale cosa potrebbe significare quella differenza."*

> *"Perché PostgreSQL con JSONB invece di un database NoSQL? Perché JSONB permette query sui campi JSON: posso cercare tutti i documenti dove `raw_data->>'Standard €' = '4.90'` senza doverlo normalizzare prima. E ho le garanzie di un database relazionale — transazioni ACID, foreign key — per i dati critici come le riconciliazioni."*

---

## 6 · AREA 3 — LA CODA ASINCRONA *(~2 min)*

> *"Quando carichi un CSV, il parsing con GPT-4o richiede da cinque a trenta secondi. Se Django aspettasse il risultato prima di rispondere, il browser rimarrebbe bloccato. La soluzione è la coda asincrona."*

> *"Funziona come un ristorante: il cameriere prende l'ordine — Django risponde 202 — e passa la comanda in cucina — il job va nella coda Celery. Tu non aspetti in piedi che cucinino. Vai al tavolo, il frontend continua a funzionare, e il cameriere torna da te quando è pronto."*

> *"Redis gestisce tre cose completamente separate con tre database logici distinti. DB zero è la coda Celery — i job da eseguire e i risultati. DB uno è la cache degli embedding — i vettori numerici float che rappresentano il significato delle descrizioni degli articoli, usati per il matching semantico. DB due è la cache dei column mapping — per ogni fornitore, il mapping tra le colonne del CSV e i campi del sistema, con TTL di trenta giorni."*

> *"Se Redis crasha e riparte, si perde solo la cache — i dati reali sono in PostgreSQL e vengono ricostruiti automaticamente. Il sistema è progettato per sopravvivere ai crash dei componenti."*

> *"Il retry è intelligente: Celery riprova automaticamente fino a tre volte con sessanta secondi di pausa, ma **solo per errori transitori** — timeout di rete, connessione rifiutata. Se GPT restituisce JSON malformato, quello è un errore permanente: il documento finisce in stato 'error' direttamente, senza sprecare due ulteriori retry inutili."*

---

## 7 · AREA 4 — LA RICONCILIAZIONE A CASCATA *(~6 min)*

📂 *(apri `backend/doc_manager/reconciliation.py`)*

> *"Questa è la parte più interessante del sistema. L'engine di riconciliazione a tre livelli. Il principio di design è uno solo: **usa strumenti economici prima di quelli costosi**. Il confronto matematico è gratuito e richiede millisecondi. GPT-4o costa denaro e richiede secondi. Quindi si usa GPT solo dove serve davvero."*

> *"Prima di riconciliare, il sistema deve trovare il miglior candidato: tra tutti i documenti nel database, qual è quello più probabile che formi una coppia sensata col documento appena caricato? Si calcola un **match score** composito da zero a cento."*

> *"Stesso numero documento: più cinquanta punti — è il segnale più forte. Stesso fornitore per embedding similarity sopra l'ottantotto percento: più trenta. Stessa data: più dieci. Totali simili: più cinque o dieci. E overlap degli articoli misurato con l'indice di Jaccard — l'intersezione diviso l'unione dei codici articolo — fino a più quaranta. Soglia minima per tentare la riconciliazione: trenta punti. Sotto quella soglia, i documenti non hanno abbastanza in comune."*

> *"Ma prima ancora dello score, ci sono le **guardie di esclusione**. Si salta un candidato se esiste già una riconciliazione tra quei due documenti. Si salta se il confronto SHA-256 del contenuto dei file coincide — significa che è lo stesso file caricato due volte, eventualmente rinominato. Si salta se la coppia ha già un fingerprint identico nel database — stesso tipo, stesso fornitore, stesso numero documento. E si salta se GPT, interrogato sulla compatibilità dei tipi, dice che la coppia non ha senso — un ordine con un altro ordine dello stesso fornitore non si riconcilia, sono due acquisti distinti."*

> *"Una nota importante sul rilevamento duplicati: **non uso il filename**. Uso lo SHA-256 del contenuto. Il motivo è semplice: due file chiamati entrambi 'fattura_fornitore.csv' potrebbero essere due fatture completamente diverse, di mesi diversi. Con il solo confronto sul nome sarebbero state bloccate. Al contrario, lo stesso file caricato due volte con nomi diversi — 'fattura.csv' e 'fattura_copia.csv' — verrebbe correttamente riconosciuto come duplicato perché l'hash coincide."*

*(pausa breve)*

> *"Trovata la coppia, prima di avviare il confronto, il sistema assegna i ruoli **doc1 e doc2** seguendo una priorità semantica, non cronologica. Gli ordini e i tariffari sono sempre doc1 — sono il riferimento, l'intenzione originale. Le fatture e le conferme d'ordine vengono dopo. I DDT e le packing list per ultimi — attestano l'esecuzione fisica."*

> *"Perché importa? Perché le discrepanze sono **asimmetriche**. Un articolo presente in doc1 ma assente in doc2 è 'missing_in_doc2' con severity error — qualcosa è stato ordinato ma non è arrivato. Un articolo extra in doc2 è un warning — qualcosa di inatteso è apparso. Se invertissi l'ordine e il DDT diventasse doc1, un articolo mancante nel DDT apparirebbe come 'extra nell'ordine' con severity warning, verrebbe auto-approvato, e nessuno si accorgerebbe che manca una consegna."*

*(pausa)*

> *"Ora la cascata vera e propria."*

> *"**Livello 1 — confronto matematico**. Ogni documento viene indicizzato per item_code. Per ogni codice nel doc1, si cerca il corrispondente nel doc2. Se i valori numerici coincidono: ok. Se differiscono: discrepanza. Se l'articolo manca completamente nel doc2: 'missing_in_doc2', severity error."*

> *"Due ottimizzazioni qui. Il **fuzzy match su item_code**: 'FRN-001' e 'FRN001' sono lo stesso articolo scritto in modo diverso. Il SequenceMatcher calcola una similarità del 92% sopra la soglia del 90% — vengono abbinati con un warning 'code_mismatch', non un errore. Il **fallback embedding**: se i codici sono troppo diversi ma le descrizioni sono simili — 'Apple Juice 1L' e 'Succo di Mela 1 litro' — si calcola la cosine similarity dei vettori embedding di OpenAI. Sopra 88%: stesso articolo, abbinamento con nota."*

> *"Se il livello 1 non trova nessuna discrepanza, la riconciliazione viene **auto-approvata immediatamente**. Zero chiamate GPT. Zero costo."*

> *"**Livello 2 — validazione semantica**. Ci sono discrepanze. Ma prima di segnalarle come errori reali, chiediamo a GPT se sono davvero problemi o solo differenze di rappresentazione. E qui c'è l'ottimizzazione fondamentale: **GPT non vede mai tutto il documento**. Riceve solo le righe coinvolte nelle discrepanze. Se un documento ha cento righe e tre hanno discrepanze, GPT vede solo quelle tre. Su file da cinquecento righe, questo è un risparmio del novantasei percento di token. GPT può declassare severity da error a warning — per esempio se riconosce che i codici articolo sono formattati diversamente ma rappresentano la stessa cosa — oppure può aumentare la confidence della coppia se trova la corrispondenza particolarmente coerente."*

> *"Per i documenti non-standard come i tariffari, il livello 1 non funziona — non ci sono item_code, i prezzi sono in colonne dinamiche tipo 'Zona A Express €'. In questo caso si salta il livello 1 e si manda il raw_data completo a GPT, che capisce la struttura matriciale e confronta le celle corrispondenti."*

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

## 9 · SICUREZZA *(~4 min)*

> *"Prima di chiudere, voglio parlare di sicurezza — perché è una delle cose su cui ho lavorato di più, e su cui viene spesso trascurata nei prototipi."*

> *"Ho fatto un **audit sistematico** dell'intero codebase e ho trovato e chiuso una serie di problemi. Li vado a elencare."*

> *"**Autenticazione e autorizzazione**. Ogni endpoint richiede JWT valido — nessun endpoint è pubblico in produzione. Ma autenticazione non è autorizzazione. Ho implementato **autorizzazione object-level per-utente**: ogni utente vede e modifica solo i propri documenti e le proprie riconciliazioni. Il filtro `created_by=request.user` è in ogni `get_queryset`. Se provi a fare GET su un documento di un altro utente, ricevi 404 — non 403, perché il 403 rivelerebbe l'esistenza della risorsa. Gli utenti staff vedono tutto. Gli endpoint amministrativi come le impostazioni globali e la pulizia cache richiedono `IsAdminUser`."*

> *"**Rate limiting scoped**. Non ho messo throttle globale — avrebbe bloccato il polling della dashboard in meno di un minuto. Ho throttle chirurgici: dieci upload al minuto per utente, cinque registrazioni all'ora per IP, sessanta webhook al minuto per IP. Il throttle login previene il brute force su `POST /api/auth/token/`."*

> *"**JWT hardening**. Il token di accesso dura quindici minuti. Il refresh token viene ruotato ad ogni uso — se qualcuno intercetta un refresh token già usato, il sistema lo rigetta. Il logout chiama un endpoint che mette il refresh token nella blacklist lato server — prima fare logout non serviva a niente."*

> *"**SSRF — Server Side Request Forgery**. Se un attaccante manda un messaggio WhatsApp con un link immagine che in realtà punta a `169.254.169.254` — l'endpoint dei metadati di AWS — il sistema deve bloccarlo. `is_safe_external_url()` risolve il DNS e rifiuta qualsiasi IP privato, loopback, o link-local. E non si seguono i redirect — un redirect potrebbe aggirare il controllo iniziale."*

> *"**FastAPI non è esposto**. La porta 8001 è visibile solo all'interno della rete Docker. Django deve presentare un token segreto nell'header `X-Internal-Token` per poter parlare con FastAPI. Il confronto del token usa `hmac.compare_digest` — confronto a tempo costante — per prevenire timing attacks. E se il token non è configurato, il sistema fa fail-closed: rifiuta la richiesta, non la lascia passare silenziosamente."*

> *"**Validazione dei file**. Il serializer Django controlla estensione e dimensione — massimo dieci megabyte. Ma questo non basta: l'estensione la dichiara l'utente. Il microservizio FastAPI controlla i **magic bytes** — i primi byte del file che identificano il formato reale indipendentemente dal nome. Un file `.png` con header PDF viene rifiutato."*

> *"**Prompt injection guard**. Tutti e tre i router AI hanno un blocco esplicito nel prompt che dice a GPT di ignorare istruzioni embedded nel contenuto del documento. GPT risponde con un campo `injection_detected`. Se è true: log server-side, HTTP 422 al client con messaggio generico. Il contenuto malevolo non passa mai."*

> *"**Errori generici verso il client**. Il client non vede mai stack trace, path di file, nomi di variabili. Riceve sempre un messaggio generico. Il dettaglio tecnico va solo nei log del server, accessibili solo agli amministratori."*

> *"**Deduplicazione SHA-256**. Ho già menzionato che uso l'hash del contenuto del file per rilevare duplicati. Questo ha anche un'implicazione di sicurezza: previene che qualcuno carichi lo stesso file mille volte cambiandogli solo il nome per esaurire la quota GPT."*

> *"**Password policy**. Il sistema applica i validator Django standard: lunghezza minima, nessuna password troppo comune, nessuna password identica all'username. Il cambio password richiede la password corrente — un access token rubato non basta per cambiare le credenziali dell'account."*

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

> *"Tre livelli di difesa. Primo: `temperature=0` nelle chiamate di parsing — questo maximizza il determinismo dell'output GPT. Secondo: la cache column mapping salva il mapping già validato per ogni fornitore — il secondo upload dello stesso fornitore non chiama GPT per la struttura, usa la cache. Terzo, e questo è il più importante: anche se GPT sbaglia il mapping tra un run e l'altro, il `raw_data` JSONB salva sempre tutti i valori originali con i nomi reali delle colonne CSV. Il livello 2 della riconciliazione usa `raw_data` per il confronto effettivo, quindi è immune alle variazioni di mapping."*

---

❓ **"Come scala il sistema se arrivano mille file al giorno?"**

> *"Il bottleneck principale è il Celery worker. Per parallelizzare basta aggiungere istanze di `celery_worker` nel Docker Compose — ognuna prende job indipendenti dalla coda Redis. FastAPI è stateless, si scala allo stesso modo. PostgreSQL con gli indici che ho aggiunto — su `supplier_canonical`, `status`, `created_at` — regge facilmente migliaia di documenti al giorno. Redis con questo volume è abbondantemente sufficiente. Per scala enterprise: Kubernetes con autoscaling orizzontale dei worker, PostgreSQL read replicas, Redis Cluster. L'architettura a microservizi nasce proprio per questo."*

---

❓ **"Perché hai usato Django E FastAPI invece di scegliere uno solo?"**

> *"Django è il migliore per gestire stato, autenticazione, ORM, relazioni tra modelli. Ha un ecosistema maturo per tutto quello. FastAPI è il migliore per I/O asincrono e integrazione LLM — la sua gestione nativa async/await è fondamentale perché le chiamate a GPT-4o possono durare secondi e non devo bloccare il thread. Se usassi solo Django, le chiamate OpenAI bloccherebbero il worker WSGI per tutta la durata. Se usassi solo FastAPI, dovrei reimplementare da zero autenticazione, ORM, admin, serialization. Usarli insieme in microservizi è la scelta che massimizza i punti di forza di entrambi."*

---

❓ **"Come funziona la deduplicazione se qualcuno carica lo stesso file due volte?"**

> *"Due livelli. Il primo è l'hash SHA-256 del contenuto del file, calcolato subito al momento dell'upload. Se due documenti hanno lo stesso hash, sono identici a livello di byte — anche se li hai caricati con nomi diversi — e non vengono mai riconciliati tra loro. Il secondo livello è il fingerprint della coppia già riconciliata: se esiste già una riconciliazione con gli stessi tipo-fornitore-numero per entrambi i documenti, quella coppia viene saltata. Questo gestisce il caso in cui qualcuno carichi lo stesso documento con un piccolo cambiamento — hash diverso, ma stessa coppia logica."*

---

❓ **"Come funziona la sicurezza del webhook Twilio?"**

> *"Twilio firma ogni request con HMAC-SHA1, usando il tuo `AUTH_TOKEN` come chiave segreta e l'URL completo più i parametri POST come messaggio. Django verifica questa firma prima di processare qualsiasi webhook. Se la firma non corrisponde, risponde 403. Questo significa che anche se qualcuno conosce l'URL del webhook, non può triggerare OCR senza conoscere il token Twilio. Per i test in locale, c'è una modalità dev che bypass la verifica della firma — ma viene disabilitata in produzione tramite variabile d'ambiente."*

---

❓ **"Il sistema funziona senza OpenAI?"**

> *"No, GPT-4o è centrale sia per il parsing che per l'OCR e la valutazione semantica. Senza API key, i documenti rimangono in stato 'pending' e poi passano a 'error' con un messaggio generico — nessun dettaglio tecnico viene esposto al client. Detto questo, i test unitari — ne ho 116 — girano completamente senza OpenAI perché tutte le chiamate API sono mockate con monkeypatch. I test E2E invece richiedono l'API key reale."*

---

❓ **"La cache dei column mapping è davvero efficace?"**

> *"La risposta onesta è: l'infrastruttura è completa e funzionante — Redis DB 2 riceve il mapping dopo ogni parsing, con TTL di trenta giorni. Il punto su cui sono ancora a lavoro è il pre-lookup: per leggere la cache prima di chiamare GPT, devo sapere il nome del fornitore in anticipo. Ora lo estraggo dal file grezzo, ma non tutti i file hanno una riga esplicita 'Fornitore: X'. Il miglioramento ovvio — e quello che farei dopo questa challenge — è usare il `supplier_canonical` già salvato nel database dal parsing precedente per costruire la chiave cache, invece di cercarlo nel file. Questo renderebbe la cache efficace per tutti i fornitori già visti, non solo quelli che usano un formato specifico."*

---

❓ **"Hai fatto test automatici?"**

> *"Sì. Centodieci test unitari con pytest sul backend Django, scritti con fixtures e monkeypatching — nessuna chiamata reale a GPT o al database esterno. Coprono l'engine di riconciliazione a tutti i livelli — fuzzy matching, embedding fallback, multi-sezione, riconciliazione cascata, deduplicazione. E una suite di test di integrazione che carica i file challenge reali, aspetta l'elaborazione Celery, e verifica che i risultati corrispondano alle aspettative. I test girano in isolamento: conftest pulisce la cache Redis prima di ogni test e imposta rate limit altissimi per non essere bloccati dal throttling."*

---

❓ **"Come hai gestito i file con struttura 'difficile' — multi-foglio Excel, header spostate, sezioni multiple?"**

> *"Ogni caso testato con un file reale. L'Excel multi-foglio viene trattato come N sezioni, uno per foglio. I file con metadati nelle prime righe prima dell'header vero: GPT identifica qual è la riga di header e quali sono le righe di dati — le righe precedenti vengono usate solo per estrarre i metadati come fornitore e numero documento. I file con più tabelle nella stessa pagina: GPT identifica le sezioni e crea un documento separato per ciascuna. Per i file con righe sporche nel mezzo — righe vuote, sottotitoli — c'è una regola nel prompt: se una sezione non ha valori numerici e non ha item_code, viene scartata come 'sezione fantasma'. E c'è un cap di venti sezioni massimo per file, per prevenire amplificazione malevola con file strutturati ad arte."*

---

*(fine script)*
