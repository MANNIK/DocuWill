# CLAUDE.md — ai_service/utils/

## Scopo
Helper Python puri condivisi dai router: nessun I/O, nessuna rete, nessun DB.

## File chiave
- `supplier.py` — `normalize_for_cache(name)`: normalizzazione deterministica del nome fornitore per generare la chiave Redis della column-mapping cache. Upper, strip accenti, strip punteggiatura, rimuovi suffissi societari in loop (longest-match-first)

## Dipendenze cross-folder (CRITICO ⚠)
- `supplier.py` è uno SPECCHIO di `backend/doc_manager/utils.py::_normalize_for_match`
- `_COMPANY_SUFFIXES` e la logica di normalization DEVONO essere identici byte per byte
- Se modifichi i suffissi o l'algoritmo qui, aggiorna `backend/doc_manager/utils.py` nello stesso commit
- Le due funzioni calcolano la stessa key Redis DB 2 usata da entrambi i servizi

## Convenzioni
- No dipendenze esterne eccetto `unicodedata` e `re` (stdlib)
- No rapidfuzz qui (nessun fuzzy — solo strip deterministico)
- No DB, no Redis: questa cartella è una "pure function library"
- I test di parità si trovano in `ai_service/tests/test_supplier_normalize.py`

## Comandi
```bash
# Test parità con backend
pytest ai_service/tests/test_supplier_normalize.py -v
pytest backend/tests/test_utils_supplier.py -v
```
