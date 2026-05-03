import httpx
from celery import shared_task
from django.conf import settings


@shared_task(bind=True, max_retries=3)
def process_document_task(
    self,
    document_id: int,
    file_content: list | None,
    filename: str | None,
    media_url: str | None = None,
    caption: str | None = None,
):
    from .models import Document, DocumentRow
    from .reconciliation import find_and_reconcile

    try:
        document = Document.objects.get(id=document_id)

        if document.source == Document.SourceChoices.UPLOAD:
            content_bytes = bytes(file_content)

            with httpx.Client(timeout=120) as client:
                response = client.post(
                    f"{settings.AI_SERVICE_URL}/parse/csv",
                    files={"file": (filename, content_bytes)},
                )
                response.raise_for_status()
                result = response.json()

            parsed_docs = result.get("documents", [])
            if not parsed_docs:
                raise ValueError("Nessun documento estratto dal file.")

            # Il primo documento aggiorna il record già creato
            first = parsed_docs[0]
            _update_document(document, first)
            document.status = Document.StatusChoices.PROCESSED
            document.save()
            find_and_reconcile(document)

            # Sezioni aggiuntive → nuovi Document separati
            for extra in parsed_docs[1:]:
                extra_doc = Document.objects.create(
                    source=Document.SourceChoices.UPLOAD,
                    status=Document.StatusChoices.PROCESSED,
                    original_filename=filename,
                )
                _update_document(extra_doc, extra)
                extra_doc.save()
                find_and_reconcile(extra_doc)

        elif document.source == Document.SourceChoices.WHATSAPP:
            with httpx.Client(timeout=120) as client:
                response = client.post(
                    f"{settings.AI_SERVICE_URL}/ocr/image",
                    json={"image_url": media_url, "caption": caption or ""},
                )
                response.raise_for_status()
                parsed = response.json()

            document.doc_type = parsed.get("doc_type", Document.TypeChoices.UNKNOWN)
            document.supplier_name = parsed.get("supplier_name", "")
            document.document_number = parsed.get("document_number", "")
            document.total_amount = parsed.get("total_amount")
            document.extracted_data = {"raw_text": parsed.get("raw_text", "")}

            date_str = parsed.get("document_date", "")
            if date_str:
                try:
                    from datetime import date
                    document.document_date = date.fromisoformat(date_str)
                except ValueError:
                    pass

            rows_data = parsed.get("rows", [])
            DocumentRow.objects.filter(document=document).delete()
            DocumentRow.objects.bulk_create([
                DocumentRow(
                    document=document,
                    row_index=i,
                    item_code=row.get("item_code", ""),
                    description=row.get("description", ""),
                    quantity=row.get("quantity"),
                    unit=row.get("unit", ""),
                    unit_price=row.get("unit_price"),
                    total_price=row.get("total_price"),
                    discount=row.get("discount"),
                    raw_data=row,
                )
                for i, row in enumerate(rows_data)
            ])

            document.status = Document.StatusChoices.PROCESSED
            document.save()
            find_and_reconcile(document)

    except Exception as exc:
        from .models import Document
        try:
            doc = Document.objects.get(id=document_id)
            doc.status = Document.StatusChoices.ERROR
            doc.error_message = str(exc)
            doc.save()
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=60)


def _update_document(document, parsed: dict):
    """
    Aggiorna un Document con i dati estratti da FastAPI.
    Estratto in funzione separata perché usato sia per il primo
    documento che per le sezioni aggiuntive.
    """
    from .models import Document, DocumentRow

    document.doc_type = parsed.get("doc_type", Document.TypeChoices.UNKNOWN)
    document.supplier_name = parsed.get("supplier_name", "")
    document.document_number = parsed.get("document_number", "")
    document.total_amount = parsed.get("total_amount")
    document.extracted_data = parsed.get("raw_extracted", {})

    date_str = parsed.get("document_date", "")
    if date_str:
        try:
            from datetime import date
            document.document_date = date.fromisoformat(date_str)
        except ValueError:
            pass

    DocumentRow.objects.filter(document=document).delete()
    DocumentRow.objects.bulk_create([
        DocumentRow(
            document=document,
            row_index=row.get("row_index", i),
            item_code=row.get("item_code", ""),
            description=row.get("description", ""),
            quantity=row.get("quantity"),
            unit=row.get("unit", ""),
            unit_price=row.get("unit_price"),
            total_price=row.get("total_price"),
            discount=row.get("discount"),
            raw_data=row.get("raw_data", {}),
        )
        for i, row in enumerate(parsed.get("rows", []))
    ])