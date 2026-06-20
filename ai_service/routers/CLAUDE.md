# CLAUDE.md — ai_service/routers/

## Scopo
Router FastAPI — un file per capability. Ogni router viene importato e registrato in `main.py`.

## File chiave
- `csv_parser.py` — prefix `/parse`; endpoint `POST /parse/csv`: legge CSV/Excel, segmenta le tabelle (vedi sotto), chiede a GPT di identificare struttura (sezioni, header, column mapping), estrae righe, cachea mapping su Redis DB 2
- `table_segmentation.py` — **NON è un router** (nessun `APIRouter`), è il modulo di rilevamento multi-tabella deterministico usato da `csv_parser.py`: `detect_table_segments()` (zero GPT, segnali strutturali), `confirm_ambiguous_boundaries()` (una chiamata GPT batch sui soli confini ambigui), `build_segmented_preview()` (testa+coda di ogni segmento + tutte le righe header-like), `_looks_like_header()`
- `ocr.py` — prefix `/ocr`; endpoint `POST /ocr/image` (URL) e `POST /ocr/upload` (bytes); GPT-4o Vision estrae dati da foto di documenti
- `classifier.py` — prefix `/classify`; classifica il tipo documento da campi già estratti

## Convenzioni
- Ogni file espone un `router = APIRouter(prefix=..., tags=[...])` a livello modulo — non cambiare il nome
- Le response shapes sono Pydantic `BaseModel` definite in `csv_parser.py` (`ParsedRow`, `ParsedDocument`, `ParsedDocumentList`)
- Prompt GPT in italiano, modello `gpt-4o`, `temperature=0` per output deterministico
- Pipeline parser CSV: `read_raw_file()` → `detect_table_segments()` + `build_segmented_preview()` (da `table_segmentation.py`) → `ask_claude_to_understand_structure()` → `extract_rows()`. La vecchia `rows_to_text()` resta come fallback ma il path attivo è quello segment-aware
- `temperature=0` è impostato su `ask_claude_to_understand_structure` per ridurre la varianza nelle sezioni identificate tra run successivi
- `table_segmentation.py` è puro Python (deterministico): se serve modificare i segnali di confine (sheet, righe vuote, header ripetuto, shift firma) si tocca lì, non nel prompt

## Dipendenze cross-folder
- `csv_parser.py` importa `from utils.supplier import normalize_for_cache` per generare la cache key — NON usare una normalizzazione ad-hoc inline

## Comandi
```bash
curl -X POST http://localhost:8001/parse/csv -F "file=@/path/to/file.csv"
curl http://localhost:8001/docs  # Swagger UI
```
