---
title: Challenge tecnica WeWill — versione per Nikola Manev + Ruben Havrestiuc
category: tech
created: 2026-04-19
updated: 2026-04-19
tags: [hiring, challenge, nikola, ruben, fusion-dominik-mattia]
audience: [candidates]
---

# WeWill — Challenge tecnica

## Contesto

Gestire documenti aziendali (ordini, conferme, DDT, fatture, listini) in
formati diversi è un problema comune: ogni fornitore manda i suoi dati
con una struttura differente, a volte come foto WhatsApp, a volte come
CSV/Excel con header non standard, tabelle multiple, dati sporchi.

Questa challenge ti mette davanti proprio questo scenario.

## Obiettivo

Costruisci un sistema che gestisce il flusso **doc 1 → doc 2** con
riconciliazione automatica.

Non c'è una coppia fissa ordine/conferma. Il primo documento può essere
di una tipologia qualsiasi (ordine, tariffario, fattura, packing list,
export spedizioni, ecc.) e il secondo documento è la sua contropartita
o conferma di tipologia correlata ma non necessariamente identica (es.
tariffario + conferma prezzi di un fornitore, shipment + fattura
corriere, ordine + DDT, ecc.). Il sistema deve **capire da sé** qual è
la relazione fra i due e riconciliare.

Il workflow da implementare:

1. **Ingestion doc 1 (CSV/Excel)** — l'operatore carica da dashboard il
   file tabulare. Il sistema estrae i dati strutturati, classifica la
   tipologia e persiste.
2. **Ingestion doc 2 (foto WhatsApp)** — via webhook WhatsApp arriva una
   foto che si riferisce al doc 1 (può essere una conferma, un documento
   operativo correlato, un riscontro). Il sistema riceve, fa OCR + LLM,
   estrae i dati e persiste.
3. **Riconciliazione** — il sistema collega i due documenti (decidi tu
   la logica: numero riferimento? fornitore? semantica LLM?) e confronta
   i dati: evidenzia righe/valori che non tornano, campi mancanti,
   discrepanze tra ciò che era atteso e ciò che è stato confermato.
4. **UI di revisione** — l'operatore vede doc 1 + doc 2 + discrepanze
   evidenziate, decide se approvare, correggere o rifiutare.

Il sistema deve inoltre:
- Classificare il tipo di documento (ordine, fattura, DDT, ecc.) anche
  dinamicamente
- Persistere tutto in database e gestire l'elaborazione async

Non si cerca un prodotto pronto per produzione. Si cerca di capire come
pensi ai problemi, come strutturi il codice, come giustifichi le scelte.

## Setup dati di test — tua responsabilità

In allegato trovi 9 file CSV/Excel. Per testare il flusso completo
(ingestion + riconciliazione con foto) dovrai generarti tu stesso i
documenti cartacei corrispondenti.

**Importante:** non limitarti a esportare i CSV in PDF "tali e quali".
Sarebbe troppo facile per l'OCR. Quello che ti serve sono documenti che
assomiglino a **modulistica classica** che un fornitore manda davvero:
layout a carta intestata, campi form, tabelle con bordi, eventuali
timbri/firme, intestazione con partita IVA e dati fiscali, piè pagina.
La struttura visiva deve essere **diversa** da quella del CSV — il
punto è costringere il sistema a capire che due layout differenti
descrivono gli stessi dati.

Opzioni per generarli:

1. **Genera con AI** un'immagine di un PDF realistico (ChatGPT, Claude,
   Gemini, Midjourney, qualsiasi tool con capacità image generation o
   layout HTML-to-PDF). Prompt del tipo: "crea un PDF di fattura/DDT/
   tariffario fornitore italiano con i seguenti dati: ...". Puoi dargli
   i dati del CSV come input e farglieli rendere in un layout diverso.
2. **Parti da template PDF** esistenti (modulistica gratuita online,
   template di fatture/DDT/tariffari scaricabili) e riempili coi dati
   del CSV modificando manualmente o via script.
3. **HTML+CSS→PDF**: costruisci un template HTML stile fattura/DDT
   aziendale e generalo con wkhtmltopdf, puppeteer, weasyprint ecc.

Il doc 2 deve essere un **PDF ricco** (modulistica, non tabella nuda) da
cui il tuo sistema dovrà fare estrazione vera: intestazioni, metadati,
corpo tabella strutturata, totali, note, piè pagina. Quando lo fotografi
a schermo (cellulare, screenshot), la pipeline OCR + LLM dovrà tirar
fuori dati comparabili con quelli del CSV.

Per testare davvero la riconciliazione, crea più versioni del doc 2 in
cui **manipoli i dati** per coprire **tutte le tipologie di discrepanza**
che un sistema reale deve gestire:

- **Quantità diverse** (ordinate 10, confermate 8)
- **Prezzi cambiati** (preventivo vs confermato)
- **Righe mancanti nel doc 2** (articoli ordinati ma non confermati)
- **Righe aggiunte nel doc 2** (articoli extra non presenti in doc 1)
- **Descrizioni diverse ma stesso codice articolo** (fornitore usa
  nomenclatura diversa)
- **Codici articolo diversi ma stessa descrizione** (tipico su listini
  aggiornati)
- **Date diverse** (data richiesta vs data consegna reale)
- **Totali/subtotali che non combaciano** con la somma delle righe
- **Sconti applicati in modo diverso** (a riga vs a totale)
- **Valute o unità di misura diverse** (€/€, pz/scatole)
- **Righe riordinate** (stessi dati, ordine diverso)

Copri più tipologie possibili: il tuo sistema deve riconoscerle **tutte**
e distinguere fra "dato mancante", "dato cambiato", "dato equivalente
con rappresentazione diversa".

È uno sforzo ben speso: ti dà un dataset realistico e testa davvero
OCR + LLM + logica di riconciliazione su layout e dati che differiscono
dalla sorgente tabulare.

## Stack tecnico obbligatorio

| Layer | Tecnologia |
|-------|-----------|
| Frontend | Next.js + React + TypeScript |
| Backend principale | Django (API + Admin + Auth) |
| Database | PostgreSQL |
| Microservizio ingestion AI | FastAPI |
| Task queue async | Celery + Redis |
| Containerizzazione | Docker + Docker Compose |

## WhatsApp integration — libertà di scelta

Le opzioni consigliate, in ordine di consigliabilità:

1. **Twilio WhatsApp Sandbox** — free tier, setup in 10 minuti, webhook HTTP
   affidabile. La scelta più semplice per il challenge.
   → https://www.twilio.com/docs/whatsapp/sandbox
2. **Meta WhatsApp Business API (Cloud API)** — gratuito per primi 1000
   messaggi/mese, richiede verifica business. Più production-ready.
   → https://developers.facebook.com/docs/whatsapp/cloud-api
3. **Mock endpoint locale** — simulare il webhook con un endpoint POST che
   accetta `{"from":"+39...", "media_url":"...", "caption":"..."}`. Va
   bene se vuoi concentrarti su tutto il resto.

Qualsiasi scelta fai, motivala nel README.

## OCR — libertà di scelta

- Tesseract (offline, gratis, accuracy media)
- Google Cloud Document AI (accurato, fattura per chiamata)
- Claude / GPT-4o / Gemini via vision API (ottimi su layout complessi)
- Combinazioni ibride (Tesseract + LLM per strutturazione)

## Ingestion CSV/Excel

Il parser deve gestire:
- Header non in prima riga (metadati sopra)
- Tabelle multiple nello stesso file/foglio
- Excel multi-sheet
- Righe di riepilogo/totali
- Formati numerici europei (1.234,56) e americani (1,234.56)
- Nomi colonna in più lingue

In allegato trovi 9 file di test di complessità crescente (dal CSV banale
a 5 righe fino all'export di un gestionale con centinaia di righe e
decine di colonne). Usali per verificare il tuo parser.

## Scope consigliato

Quattro milestone. Consiglio di implementarle in ordine:

1. **Ingestion doc 1 via dashboard** — upload file tabulare → Celery task
   → FastAPI estrae e classifica tipologia → Django persiste → UI mostra
   risultato strutturato
2. **Ingestion doc 2 via WhatsApp** — webhook → download media → Celery
   task → FastAPI fa OCR + LLM → Django persiste
3. **Riconciliazione** — il sistema collega doc 2 al doc 1 corrispondente
   e confronta i dati: evidenzia righe/campi mancanti, valori diversi,
   discrepanze. Decidi tu la logica di matching (numero riferimento?
   nominativo fornitore? semantica LLM?)
4. **UI di revisione** — operatore vede doc 1 + doc 2 + discrepanze,
   può correggere, approvare o rifiutare. Stato finale persistito.

Bonus (se hai tempo e voglia):
- Classificazione automatica del tipo documento (le tipologie presenti
  nei file allegati sono varie: ordine, fattura, tariffario, packing
  list, export spedizioni, ecc.)
- Cache per-fornitore (se lo stesso fornitore manda file con header
  simili, velocizza)
- Logica di matching robusta con nomi fornitori fuzzy
- Threshold di confidence sulla riconciliazione

## Deliverable

1. **Repo GitHub privato** con invite a emilio.tracanella@wewill.ai.
   Singolo repo o monorepo, scegli tu.
2. **README chiaro** con:
   - Architettura (diagramma o descrizione)
   - Come eseguire (docker compose up probabilmente)
   - Scelte tecniche principali e perché
   - Cosa è implementato, cosa no, cosa rifaresti

Quando hai finito scrivimi, fissiamo una call e ne parliamo a voce
direttamente: mi mostri il flusso e discutiamo insieme le scelte
architetturali.

## Criteri di valutazione

- **Ragionamento:** come hai decomposto il problema, quali scelte hai
  fatto e perché
- **Architettura:** separazione responsabilità, testabilità, estensibilità
- **Qualità del codice:** leggibilità, struttura, nomi sensati, gestione
  errori
- **Gestione edge case:** cosa succede se il file è corrotto, se OCR
  fallisce, se LLM restituisce JSON malformato
- **Documentazione:** quanto velocemente un altro dev può capire e
  contribuire
- **Onestà:** se qualcosa non hai avuto tempo di farlo, scrivilo nel
  README. Zero problema.

## Tempistiche

Nessuna deadline. Indicativamente 2-4 settimane di lavoro part-time nel
tempo libero vanno bene. Se impieghi meno, meglio per te; se impieghi di
più per farla bene, nessun problema. Scrivimi quando hai qualcosa di
presentabile.

## Risorse WeWill utili

In allegato trovi anche un documento con lo stack tecnologico completo
che usiamo in WeWill, con link a repo di riferimento utili per
familiarizzare con i framework.

Tool che usiamo quotidianamente:
- **Antigravity** — fork VS Code ottimizzato per AI-assisted dev
- **Claude Code** / **Cursor** — usa pure AI, è accettato, anzi incoraggiato
  (anche noi lavoriamo così)
- **Vibe-Kanban** — multi-agent piattaforma per coordinare più agenti
- **Caddy** — reverse proxy con HTTPS automatico
- **Hetzner** / **DigitalOcean** — se ti serve hosting per testare demo

## API keys e risorse

Se ti serve una chiave API (OpenAI, Anthropic, Google) dimmelo e te la
passo con un canale sicuro (password manager, non via email).

## Domande

Scrivi pure via email o su WhatsApp per qualsiasi chiarimento durante lo
sviluppo. È pensato per essere una conversazione, non un esame a porte
chiuse.

In bocca al lupo.

Emilio
