# Discrepanze deliberate — Coppia 2

**CSV (doc1):** `07-nested-packing.csv` — Packing List EUROPACK LOGISTICS, Alpine Möbel
**Documento (doc2):** `conferma-alpine.html` — Conferma d'Ordine CO-2026-0341

## Discrepanze attese dalla riconciliazione

| Tipo | Campo | Valore doc1 (CSV) | Valore doc2 (Conferma) | Severità |
|------|-------|-------------------|------------------------|----------|
| `quantity_mismatch` | quantity | 6 (ALP-843) | 4 | error |
| `price_mismatch` | unit_price | 82,00 (ALP-114) | 87,50 | error |
| `description_mismatch` | description | Comodino | Comodino Legno di Pino Massiccio XL | info |

## Come testare

1. Aprire `conferma-alpine.html` nel browser → Salva come PDF
2. Dalla UI: upload `07-nested-packing.csv` come Doc 1
3. Upload PDF/screenshot della conferma come Doc 2
4. Verificare in Riconciliazioni: 2-3 discrepanze

## Nota

Il CSV ha sub-items (maniglie, ripiani) sotto ALP-843 — il sistema dovrebbe ignorarli
(sono righe senza item_code e con description generica). La conferma ha solo le righe principali.
