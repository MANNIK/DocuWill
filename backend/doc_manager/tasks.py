import logging

import httpx
from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

logger = logging.getLogger(__name__)

# Eccezioni transitori che vale la pena ritentare (rete, timeout).
# Errori permanenti (JSON malformato, file non riconosciuto, ValueError) non vengono ritentati.
_TRANSIENT_EXCEPTIONS = (
    httpx.TimeoutException,
    httpx.ConnectError,
    httpx.RemoteProtocolError,
    httpx.ReadTimeout,
)


def _ai_headers() -> dict:
    """Header di autenticazione interna verso l'ai_service (X-Internal-Token).
    L'ai_service non è esposto sull'host; questo token è la barriera applicativa."""
    token = getattr(settings, "AI_SERVICE_TOKEN", "")
    return {"X-Internal-Token": token} if token else {}


def _read_document_bytes(document, file_content):
    """Legge i bytes del file: dallo storage del Document (nuovo flusso) o, per
    retrocompatibilità, dalla lista di interi passata nel payload (vecchio flusso)."""
    if document.file:
        document.file.open("rb")
        try:
            return document.file.read()
        finally:
            document.file.close()
    if file_content is not None:
        return bytes(file_content)
    raise ValueError("Nessun contenuto file disponibile per il documento.")


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
            content_bytes = _read_document_bytes(document, file_content)
            import hashlib
            document.file_hash = hashlib.sha256(content_bytes).hexdigest()

            with httpx.Client(timeout=120) as client:
                response = client.post(
                    f"{settings.AI_SERVICE_URL}/parse/csv",
                    files={"file": (filename, content_bytes)},
                    headers=_ai_headers(),
                )
                response.raise_for_status()
                result = response.json()

            parsed_docs = result.get("documents", [])
            if not parsed_docs:
                raise ValueError("Nessun documento estratto dal file.")

            # Il primo documento aggiorna il record già creato
            first = parsed_docs[0]
            with transaction.atomic():
                _update_document(document, first)
                document.status = Document.StatusChoices.PROCESSED
                document.save()
            # find_and_reconcile fuori dalla transaction: può fallire indipendentemente
            find_and_reconcile(document)

            # Sezioni aggiuntive → nuovi Document separati (stessa created_by del primo)
            for extra in parsed_docs[1:]:
                with transaction.atomic():
                    extra_doc = Document.objects.create(
                        source=Document.SourceChoices.UPLOAD,
                        status=Document.StatusChoices.PROCESSED,
                        original_filename=filename,
                        created_by=document.created_by,  # propaga owner
                    )
                    _update_document(extra_doc, extra)
                    extra_doc.save()
                find_and_reconcile(extra_doc)

        elif document.source == Document.SourceChoices.IMAGE:
            content_bytes = _read_document_bytes(document, file_content)
            import hashlib
            document.file_hash = hashlib.sha256(content_bytes).hexdigest()
            with httpx.Client(timeout=120) as client:
                response = client.post(
                    f"{settings.AI_SERVICE_URL}/ocr/upload",
                    files={"file": (filename, content_bytes)},
                    headers=_ai_headers(),
                )
                response.raise_for_status()
                parsed = response.json()

            with transaction.atomic():
                _save_ocr_result(document, parsed)
                document.status = Document.StatusChoices.PROCESSED
                document.save()
            find_and_reconcile(document)

        elif document.source == Document.SourceChoices.WHATSAPP:
            # Le URL media di Twilio richiedono Basic Auth per il download.
            # GPT-4o Vision non può accedere a URL autenticati, quindi
            # scarichiamo i bytes qui e li mandiamo a /ocr/upload (come gli upload diretti).
            auth = None
            if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN:
                auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

            # Anti-SSRF (seconda barriera, oltre alla view): rivalida prima del
            # fetch, perché follow_redirects=True potrebbe seguire un redirect
            # verso un host interno.
            from .utils import is_safe_external_url
            if not is_safe_external_url(media_url):
                raise ValueError("media_url non consentito (SSRF).")

            with httpx.Client(timeout=60, follow_redirects=False) as client:
                media_resp = client.get(media_url, auth=auth)
                media_resp.raise_for_status()
                media_bytes = media_resp.content

            import hashlib
            document.file_hash = hashlib.sha256(media_bytes).hexdigest()

            content_type = media_resp.headers.get('content-type', 'image/jpeg')
            ext = content_type.split('/')[-1].split(';')[0]
            if ext not in ('jpeg', 'jpg', 'png', 'webp'):
                ext = media_url.split(".")[-1].split("?")[0] if "." in media_url else "jpg"
            fname = filename or f"whatsapp_{document.id}.{ext}"

            # Salva i bytes su disco per renderli accessibili dal frontend
            if not document.file:
                document.file.save(fname, ContentFile(media_bytes), save=True)

            with httpx.Client(timeout=120) as client:
                response = client.post(
                    f"{settings.AI_SERVICE_URL}/ocr/upload",
                    files={"file": (fname, media_bytes)},
                    headers=_ai_headers(),
                )
                response.raise_for_status()
                parsed = response.json()

            with transaction.atomic():
                _save_ocr_result(document, parsed)
                document.status = Document.StatusChoices.PROCESSED
                document.save()
            find_and_reconcile(document)

    except Exception as exc:
        from .models import Document
        try:
            doc = Document.objects.get(id=document_id)
            doc.status = Document.StatusChoices.ERROR
            # Non esporre dettagli tecnici (path, stack, chiavi API) nella
            # risposta API — loggare il dettaglio lato server.
            doc.error_message = "Errore durante l'elaborazione del documento."
            doc.save()
        except Exception:
            pass
        logger.exception(
            "process_document_task fallito per document_id=%s: %s",
            document_id, exc,
        )
        # Retry solo per errori transitori (rete, timeout).
        # Errori permanenti (file non valido, risposta AI malformata) non vengono ritentati.
        is_transient = isinstance(exc, _TRANSIENT_EXCEPTIONS)
        if isinstance(exc, httpx.HTTPStatusError):
            is_transient = exc.response.status_code >= 500
        if is_transient:
            raise self.retry(exc=exc, countdown=60)
        # Per errori permanenti il documento resta in stato ERROR senza retry.


def _save_ocr_result(document, parsed: dict):
    """Salva il risultato OCR (da /ocr/image o /ocr/upload) su un Document."""
    from .models import Document, DocumentRow
    from .utils import normalize_supplier, canonical_supplier_name

    document.doc_type = parsed.get("doc_type", Document.TypeChoices.UNKNOWN)
    document.supplier_name = normalize_supplier(parsed.get("supplier_name", ""))
    existing = list(
        Document.objects.exclude(pk=document.pk).exclude(supplier_canonical='')
        .values_list('supplier_canonical', flat=True).distinct()
    )
    document.supplier_canonical = canonical_supplier_name(document.supplier_name, existing)
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

    DocumentRow.objects.filter(document=document).delete()
    DocumentRow.objects.bulk_create([
        DocumentRow(
            document=document,
            row_index=i,
            item_code=row.get("item_code") or "",
            description=row.get("description", ""),
            quantity=row.get("quantity"),
            unit=row.get("unit", ""),
            unit_price=row.get("unit_price"),
            total_price=row.get("total_price"),
            discount=row.get("discount"),
            raw_data=row,
        )
        for i, row in enumerate(parsed.get("rows", []))
    ])


def _update_document(document, parsed: dict):
    """
    Aggiorna un Document con i dati estratti da FastAPI.
    Estratto in funzione separata perché usato sia per il primo
    documento che per le sezioni aggiuntive.
    """
    from .models import Document, DocumentRow
    from .utils import normalize_supplier, canonical_supplier_name

    _valid_types = {c[0] for c in Document.TypeChoices.choices}
    raw_type = parsed.get("doc_type", Document.TypeChoices.UNKNOWN)
    document.doc_type = raw_type if raw_type in _valid_types else Document.TypeChoices.UNKNOWN
    document.supplier_name = normalize_supplier(parsed.get("supplier_name", ""))
    existing = list(
        Document.objects.exclude(pk=document.pk).exclude(supplier_canonical='')
        .values_list('supplier_canonical', flat=True).distinct()
    )
    document.supplier_canonical = canonical_supplier_name(document.supplier_name, existing)
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
            item_code=row.get("item_code") or "",
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