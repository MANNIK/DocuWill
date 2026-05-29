# CLAUDE.md — ai_service/routers/

## Scopo
Router FastAPI — un file per capability. Ogni router viene importato e registrato in `main.py`.

## File chiave
- `csv_parser.py` — prefix `/parse`; endpoint `POST /parse/csv`: legge CSV/Excel, chiede a GPT di identificare struttura (sezioni, header, column mapping), estrae righe, cachea mapping su Redis DB 2
- `ocr.py` — prefix `/ocr`; endpoint `POST /ocr/image` (URL) e `POST /ocr/upload` (bytes); GPT-4o Vision estrae dati da foto di documenti
- `classifier.py` — prefix `/classify`; classifica il tipo documento da campi già estratti

## Convenzioni
- Ogni file espone un `router = APIRouter(prefix=..., tags=[...])` a livello modulo — non cambiare il nome
- Le response shapes sono Pydantic `BaseModel` definite in `csv_parser.py` (`ParsedRow`, `ParsedDocument`, `ParsedDocumentList`)
- Prompt GPT in italiano, modello `gpt-4o`, `temperature=0` per output deterministico
- Il parser CSV usa `read_raw_file()` → `rows_to_text()` → `ask_claude_to_understand_structure()` → `extract_rows()`
- `temperature=0` è impostato su `ask_claude_to_understand_structure` per ridurre la varianza nelle sezioni identificate tra run successivi

## Dipendenze cross-folder
- `csv_parser.py` importa `from utils.supplier import normalize_for_cache` per generare la cache key — NON usare una normalizzazione ad-hoc inline

## Comandi
```bash
curl -X POST http://localhost:8001/parse/csv -F "file=@/path/to/file.csv"
curl http://localhost:8001/docs  # Swagger UI
```
