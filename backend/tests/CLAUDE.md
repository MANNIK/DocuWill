# CLAUDE.md — backend/tests/

## Scopo
Pytest per Django/DRF e l'engine di riconciliazione. Usa SQLite in-memory (`config.settings.test`), Celery eager, OpenAI/httpx mockati.

## File chiave
- `conftest.py` — fixture: `api_client` (DRF APIClient), `auth_headers` (crea user + JWT), `make_row` (factory SimpleNamespace per `_compare_rows`/`level1_exact_match`)
- `test_reconciliation.py` — L1: `_compare_rows`, `level1_exact_match`, `_fuzzy_find`
- `test_reconciliation_advanced.py` — `compute_match_score` (doc number, Jaccard, date), `level3_decide` (auto-approve/pending), `level2_semantic_check` con mock GPT
- `test_tasks_mock.py` — `process_document_task` con httpx mock: status PROCESSED, rows create, metadata, multi-section
- `test_utils_supplier.py` — `normalize_supplier`, `_normalize_for_match`, `canonical_supplier_name` (11 suffix variants, fuzzy, accenti)
- `test_views.py` — auth 401, register, upload 202, liste vuote

## Coverage gap (documentata, non coperta)
- `find_and_reconcile` con candidati multipli nel DB (richiede mock OpenAI embedding)
- `are_documents_complementary` con GPT mock
- `level2_full_semantic` (tariffari)
- Task Celery per source=WHATSAPP/IMAGE (richiederebbero file reali o mock complessi)
- WhatsApp webhook

## Convenzioni
- Mai chiamare OpenAI o Redis reali nei test — usare `unittest.mock.patch`
- `make_row` usa `description=""` per evitare il fallback embedding che chiamerebbe OpenAI
- Per i task Celery: `process_document_task(...)` direttamente (non `.delay()`) per evitare comportamenti eager-retry imprevedibili

## Comandi
```bash
pytest -v
pytest tests/test_utils_supplier.py -v
pytest -k "level3" -v  # filtra per nome
```
