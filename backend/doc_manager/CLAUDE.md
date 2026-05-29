# CLAUDE.md — backend/doc_manager/

## Scopo
Unica app Django del progetto. Contiene modelli, serializzatori, view API, URL, task Celery e l'engine di riconciliazione a tre livelli.

## File chiave
- `models.py` — `AppSettings` (singleton), `Document`, `DocumentRow`, `Reconciliation`, `Discrepancy`. Doc types: order/invoice/ddt/price_list/packing_list/shipment/confirmation/summary/inventory
- `views.py` — DRF APIView/generics; autenticazione JWT (`IsAuthenticated`); dispatch `process_document_task.delay(...)`
- `urls.py` — tabella route completa: documents, reconciliations, suppliers, inbox WhatsApp, settings, search, notifications, dashboard stats, auth/me, dev/reset
- `serializers.py` — usa `source="get_X_display"` per i label dei choices
- `tasks.py` — `process_document_task` Celery: chiama `/parse/csv` o `/ocr/upload` dell'ai_service, poi `find_and_reconcile`
- `reconciliation.py` — pipeline L1 (math) → L2 (GPT semantic) → L3 (decide); `find_and_reconcile` è l'entry point; embedding cache su Redis DB 1
- `utils.py` — `normalize_supplier`, `_normalize_for_match`, `canonical_supplier_name` (con rapidfuzz fuzzy)

## Dipendenze cross-folder (CRITICO)
- `utils.py` `_COMPANY_SUFFIXES` e `_normalize_for_match` DEVONO restare sincronizzati con `ai_service/utils/supplier.py` — calcolano la stessa cache key Redis DB 2

## Convenzioni
- Importare modelli dentro le funzioni Celery (non a livello modulo) — evita circular import
- Redis DB 0 = broker, DB 1 = embeddings, DB 2 = CSV column-mapping cache
- `_update_document()` e `_save_ocr_result()` sono helpers interni a `tasks.py` — non esportarli
- I documenti con `source=IMAGE` usano `/ocr/upload`; con `source=UPLOAD` usano `/parse/csv`

## Comandi
```bash
python manage.py makemigrations doc_manager
python manage.py migrate
python manage.py normalize_existing_suppliers  # backfill supplier_canonical dopo migration 0007
```
