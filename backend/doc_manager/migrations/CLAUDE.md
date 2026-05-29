# CLAUDE.md — backend/doc_manager/migrations/

## Scopo
Migration Django auto-generate per l'app `doc_manager`. Ogni migration è atomica e idempotente.

## File chiave
- `0001_initial.py` — Document, DocumentRow, Reconciliation, Discrepancy base
- `0002_add_summary_doc_type.py` — aggiunge `summary` a TypeChoices
- `0003_add_image_source.py` — aggiunge `image` a SourceChoices
- `0004_add_inventory_doc_type.py` — aggiunge `inventory` a TypeChoices
- `0005_add_appsettings.py` — modello AppSettings singleton
- `0006_discrepancy_llm_suggestion_discrepancy_operator_note_and_more.py` — Discrepancy esteso (llm_suggestion, operator_note, resolution, resolved_by, ecc.)
- `0007_document_supplier_canonical.py` — campo `Document.supplier_canonical` con db_index

## Convenzioni
- **Non editare migration già applicate in produzione** — creare una nuova migration corretta
- Dopo ogni `models.py` change: `python manage.py makemigrations doc_manager` poi commit della migration generata
- Quando si aggiunge un valore a `TextChoices`: Django genera `migrations.AlterField` — non è necessario gestirlo manualmente
- Se si aggiunge un CharField `NOT NULL` senza default: Django chiede un default temporaneo durante `makemigrations` — fornire `''`
- ⚠ Dopo deploy in container: eseguire `docker compose exec backend python manage.py migrate` per applicare le nuove migration; il Celery worker deve essere riavviato per caricare i modelli aggiornati

## Comandi
```bash
python manage.py showmigrations doc_manager
python manage.py migrate doc_manager
python manage.py migrate doc_manager 0005  # rollback a 0005
```
