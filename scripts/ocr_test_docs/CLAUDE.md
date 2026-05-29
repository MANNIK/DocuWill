# CLAUDE.md — scripts/ocr_test_docs/

## Scopo
Documenti sintetici per testare il flusso OCR end-to-end: ogni `coppiaN-*/` contiene un HTML stampabile come PDF e un `discrepanze.md` con le discrepanze intenzionalmente iniettate.

## Struttura
```
coppia1-nordic-ddt/
  ddt-nordic-design.html   ← DDT Nordic Design AB per ORD-2026-W07 (03-header-offset.csv)
  discrepanze.md           ← qty FRN-045: 50→48, FRN-078 mancante, LMP-901 extra, date mismatch

coppia2-alpine-conferma/
  conferma-alpine.html     ← Conferma d'Ordine Alpine Möbel per 07-nested-packing.csv
  discrepanze.md           ← qty ALP-843: 6→4, price ALP-114: 82→87.50

coppia3-acme-fattura/
  fattura-acme.html        ← Fattura Proforma Acme Furniture per 06-dirty-data.csv
  discrepanze.md           ← price A-001: €382.50→€405, discount A-001: 15%→10%, extra B-002
```

## Come usare
1. Aprire l'HTML in un browser e stampare come PDF (oppure usare WeasyPrint)
2. Fotografare il PDF con smartphone → salvare in `~/Desktop/TEST PER QUORO/tests/files/`
3. Il sistema carica la foto via `/api/documents/upload-image/` → OCR → riconcilia con il CSV partner

## Rigenera i file
```bash
python3 scripts/generate_ocr_docs.py
```

## Convenzioni
- Le discrepanze sono intenzionali — non "fissarle" negli HTML
- I PDF/foto finali non sono committati nel repo
