# CLAUDE.md — ai_service/tests/

## Scopo
Pytest per il microservizio FastAPI. Tutto mocked — zero chiamate OpenAI reali.

## File chiave
- `conftest.py` — `OPENAI_API_KEY=test-key-not-real`, inserisce `ai_service/` su `sys.path` per `from routers...` e `from utils...`
- `test_csv_parser.py` — `parse_number` (formati EU/US, simboli valuta, edge case), `read_raw_file` (separatori, encoding), `rows_to_text` (multi-sheet)
- `test_csv_parser_advanced.py` — `_headers_fingerprint` (order-independent, 12-char hex), `_extract_supplier_hint`, `extract_rows` (basic, empty-skip, header names, ignore), total rounding, cache key properties
- `test_supplier_normalize.py` — 10 casi noti di `normalize_for_cache` + invarianti di consistenza (case, accenti, whitespace, suffix-only)

## Convenzioni
- Non testare `ask_claude_to_understand_structure` direttamente (chiama OpenAI) — testare le funzioni che chiama (già estratte)
- Per testare il router FastAPI end-to-end senza OpenAI: usare `monkeypatch` su `client.chat.completions.create`
- `sys.path` è configurato in `conftest.py` — non aggiungere `sys.path.insert` nei test file

## Comandi
```bash
pytest -v
pytest tests/test_supplier_normalize.py -v  # verifica parità con backend
```
