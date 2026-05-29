# CLAUDE.md — backend/doc_manager/management/commands/

## Scopo
Comandi Django custom (`python manage.py <nome>`). Usati per operazioni di manutenzione one-shot o backfill dati.

## File chiave
- `normalize_existing_suppliers.py` — backfill di `Document.supplier_canonical` in 3 passate:
  1. Whitespace normalization su tutti i documenti
  2. Suffix-strip deterministico senza fuzzy (popola canonical per la prima volta)
  3. Fuzzy unification: ricalcola con la lista di canonicals già presenti per raggruppare varianti

## Convenzioni
- Ogni comando è idempotente — può essere rieseguito senza danni
- Un `Command(BaseCommand)` per file, con metodo `handle()`
- Non fare operazioni destructive — solo update di campi già esistenti o nuovi
- `normalize_existing_suppliers` avverte di fare flush della cache Redis DB 2 dopo l'esecuzione (i mapping in cache usano il canonical come parte della key — se il canonical cambia, le vecchie key sono irraggiungibili ma occupano spazio)

## Comandi
```bash
python manage.py normalize_existing_suppliers
python manage.py normalize_existing_suppliers --dry-run  # (se implementato)
# Dopo il backfill, flush cache Redis DB 2 opzionale:
docker compose exec redis redis-cli -n 2 FLUSHDB
```
