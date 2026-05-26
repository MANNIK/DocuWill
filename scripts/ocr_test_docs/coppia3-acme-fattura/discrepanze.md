# Discrepanze deliberate — Coppia 3

**CSV (doc1):** `06-dirty-data.csv` — Listino Prezzi Marzo 2026, Acme Furniture S.r.l.
**Documento (doc2):** `fattura-acme.html` — Fattura Proforma FP-2026-0118

## Discrepanze attese dalla riconciliazione

| Tipo | Campo | Valore doc1 (CSV) | Valore doc2 (Fattura) | Severità |
|------|-------|-------------------|-----------------------|----------|
| `price_mismatch` | total_price | €382,50 (A-001) | €405,00 | error |
| `discount_mismatch` | discount | 15% (A-001) | 10% | warning |
| `discount_mismatch` | discount | 0% (A-003) | 5% | warning |
| `extra_in_doc2` | row | assente (B-002 fuori prod.) | B-002 Tappeto 200x300 | warning |

## Come testare

1. Aprire `fattura-acme.html` nel browser → Salva come PDF
2. Dalla UI: upload `06-dirty-data.csv` come Doc 1
3. Upload PDF/screenshot della fattura come Doc 2
4. Verificare in Riconciliazioni: 3-4 discrepanze

## Note sul CSV sorgente

Il CSV `06-dirty-data.csv` ha dati sporchi: righe vuote, sottotitoli (SOTTOTALE MOBILI),
totale in fondo. Il sistema dovrebbe filtrare queste righe e estrarre solo gli articoli.
Articolo B-002 è marcato FUORI PRODUZIONE nel CSV — nella fattura appare come disponibile.
