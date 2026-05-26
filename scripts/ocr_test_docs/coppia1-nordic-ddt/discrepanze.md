# Discrepanze deliberate — Coppia 1

**CSV (doc1):** `03-header-offset.csv` — Ordine ORD-2026-W07, Nordic Design AB
**Documento (doc2):** `ddt-nordic-design.html` — DDT N. DDT-2026-0089

## Discrepanze attese dalla riconciliazione

| Tipo | Campo | Valore doc1 (CSV) | Valore doc2 (DDT) | Severità |
|------|-------|-------------------|-------------------|----------|
| `quantity_mismatch` | quantity | 50 (FRN-045) | 48 | error |
| `missing_in_doc2` | row | FRN-078 Scrivania angolare | assente | error |
| `extra_in_doc2` | row | assente | LMP-901 Lampada LED Stockholm | warning |
| `date_mismatch` | document_date | 09/02/2026 | 15/02/2026 | warning |

## Come testare

1. Aprire `ddt-nordic-design.html` nel browser
2. File > Stampa > Salva come PDF (oppure `Cmd+P` → "Salva come PDF")
3. Avviare il sistema: `docker compose up`
4. Dalla UI (http://localhost:3000):
   - Upload `03-header-offset.csv` nella zona **Doc 1 — File tabulare**
   - Attendere elaborazione (badge passa da "In elaborazione" a "Elaborato")
   - Upload PDF/screenshot del DDT nella zona **Doc 2 — Foto documento**
5. Aprire **Riconciliazioni** → selezionare la coppia Nordic Design
6. Verificare almeno 3 discrepanze: quantity_mismatch + missing + extra

## Suggerimento per lo screenshot

Per un test OCR più realistico, aprire il PDF su schermo intero e scattare
una foto con il cellulare leggermente inclinato (non perfettamente frontale).
