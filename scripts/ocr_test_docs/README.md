# Documenti OCR di test — WeWill Challenge

Tre coppie di documenti per testare il flusso OCR + riconciliazione.

## Struttura

```
ocr_test_docs/
├── coppia1-nordic-ddt/
│   ├── ddt-nordic-design.html      ← DDT per 03-header-offset.csv
│   └── discrepanze.md
├── coppia2-alpine-conferma/
│   ├── conferma-alpine.html        ← Conferma per 07-nested-packing.csv
│   └── discrepanze.md
└── coppia3-acme-fattura/
    ├── fattura-acme.html           ← Fattura per 06-dirty-data.csv
    └── discrepanze.md
```

## Flusso di test (per ogni coppia)

1. **Apri il file HTML** nel browser (Chrome/Safari)
2. **Stampa come PDF**: `Cmd+P` → Destinazione: "Salva come PDF" → A4
3. **Avvia il sistema**: `docker compose up` (dalla root del progetto)
4. **Crea un utente** se non esiste:
   ```bash
   docker compose run --rm backend python manage.py createsuperuser
   ```
5. **Vai alla UI**: http://localhost:3000 → Login
6. **Carica il CSV** nella zona "Doc 1 — File tabulare"
7. **Attendi elaborazione** (la riga passa da "In elaborazione" a "Elaborato")
8. **Carica il PDF** (o uno screenshot) nella zona "Doc 2 — Foto documento"
9. **Vai su Riconciliazioni** → seleziona la coppia appena creata
10. **Verifica le discrepanze** — vedi `discrepanze.md` per i dettagli attesi

## Per un test OCR più realistico

Invece del PDF diretto, apri il PDF su schermo intero e scatta una foto
con il cellulare (leggermente inclinata, non perfettamente frontale).
Questo testa l'OCR su una vera immagine fotografica, come da specifica della challenge.

## Riepilogo discrepanze per coppia

| Coppia | CSV sorgente | Documento | Discrepanze |
|--------|-------------|-----------|-------------|
| 1 — Nordic Design | `03-header-offset.csv` | DDT DDT-2026-0089 | qty_mismatch, missing, extra, date |
| 2 — Alpine Möbel | `07-nested-packing.csv` | Conferma CO-2026-0341 | qty_mismatch, price, description |
| 3 — Acme Furniture | `06-dirty-data.csv` | Fattura FP-2026-0118 | price, discount×2, extra |
