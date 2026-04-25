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
    """
    Task principale di elaborazione documento.
    Chiama FastAPI per estrarre i dati, poi aggiorna il Document.
    """
    from .models import Document

    try:
        document = Document.objects.get(id=document_id)

        # TODO: chiamata a FastAPI (implementiamo nel prossimo step)
        # Per ora segniamo solo come processed
        document.status = Document.StatusChoices.PROCESSED
        document.save()

    except Document.DoesNotExist:
        pass
    except Exception as exc:
        from .models import Document
        try:
            document = Document.objects.get(id=document_id)
            document.status = Document.StatusChoices.ERROR
            document.error_message = str(exc)
            document.save()
        except Exception:
            pass
        raise self.retry(exc=exc, countdown=60)