from django.conf import settings
from django.http import HttpResponse
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from .models import Document, Reconciliation
from .serializers import (
    DocumentSerializer,
    DocumentUploadSerializer,
    ReconciliationSerializer,
    ReconciliationUpdateSerializer,
)
from .tasks import process_document_task


class DocumentListView(generics.ListAPIView):
    """Lista di tutti i documenti."""
    queryset = Document.objects.prefetch_related("rows").all()
    serializer_class = DocumentSerializer
    permission_classes = [AllowAny]  # toglieremo AllowAny quando aggiungiamo auth


class DocumentDetailView(generics.RetrieveAPIView):
    """Dettaglio di un singolo documento."""
    queryset = Document.objects.prefetch_related("rows").all()
    serializer_class = DocumentSerializer
    permission_classes = [AllowAny]


class DocumentUploadView(APIView):
    """
    Riceve il file CSV/Excel dall'operatore,
    crea il Document e lancia il task Celery.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DocumentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        file = serializer.validated_data["file"]

        # Crea il documento in stato pending
        document = Document.objects.create(
            source=Document.SourceChoices.UPLOAD,
            status=Document.StatusChoices.PENDING,
            original_filename=file.name,
        )

        # Salva il file in memoria per passarlo al task
        file_content = file.read()

        # Lancia il task Celery in modo asincrono
        process_document_task.delay(
            document_id=document.id,
            file_content=list(file_content),  # bytes non serializzabili in JSON
            filename=file.name,
        )

        return Response(
            DocumentSerializer(document).data,
            status=status.HTTP_202_ACCEPTED,
        )


class ImageUploadView(APIView):
    """
    Riceve un file immagine (jpg/png) dall'operatore — simula il flusso WhatsApp
    senza bisogno di un URL pubblico. Utile per testare l'OCR localmente.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "file è obbligatorio"}, status=status.HTTP_400_BAD_REQUEST)

        document = Document.objects.create(
            source=Document.SourceChoices.IMAGE,
            status=Document.StatusChoices.PENDING,
            original_filename=file.name,
        )

        file_content = file.read()
        process_document_task.delay(
            document_id=document.id,
            file_content=list(file_content),
            filename=file.name,
        )

        return Response(DocumentSerializer(document).data, status=status.HTTP_202_ACCEPTED)


class WhatsAppWebhookView(APIView):
    """
    Webhook WhatsApp compatibile con Twilio (form-data) e con il mock locale (JSON).

    Formato Twilio (produzione):
      POST multipart/form-data
      From=whatsapp:+39..., MediaUrl0=https://..., Body=caption, NumMedia=1
      Header X-Twilio-Signature per verifica HMAC

    Formato mock (sviluppo locale, TWILIO_AUTH_TOKEN non configurato):
      POST application/json
      {"from": "+39...", "media_url": "...", "caption": "..."}
    """
    permission_classes = [AllowAny]

    def post(self, request):
        twilio_configured = bool(settings.TWILIO_AUTH_TOKEN)

        if twilio_configured:
            # Verifica firma Twilio — protegge da chiamate non autorizzate.
            # Quando Django è dietro ngrok/proxy, request.build_absolute_uri()
            # restituisce http://backend:8000/... invece dell'URL pubblico.
            # Usiamo X-Forwarded-Proto e X-Forwarded-Host che ngrok imposta
            # per ricostruire l'URL esatto che Twilio ha usato per firmare.
            try:
                from twilio.request_validator import RequestValidator
                validator = RequestValidator(settings.TWILIO_AUTH_TOKEN)

                proto = request.META.get("HTTP_X_FORWARDED_PROTO", "https")
                host = request.META.get("HTTP_X_FORWARDED_HOST",
                       request.META.get("HTTP_HOST", ""))
                url = f"{proto}://{host}{request.path}"

                signature = request.META.get("HTTP_X_TWILIO_SIGNATURE", "")
                if not validator.validate(url, request.POST, signature):
                    return Response({"error": "firma Twilio non valida"}, status=403)
            except ImportError:
                pass  # twilio non installato nel container ancora

            # Parsare payload Twilio (form-data)
            num_media = int(request.POST.get("NumMedia", 0))
            if num_media == 0:
                # Messaggio senza allegati — ack e ignora
                return HttpResponse('<?xml version="1.0"?><Response/>', content_type="text/xml")

            media_url = request.POST.get("MediaUrl0", "")
            caption = request.POST.get("Body", "")
            sender = request.POST.get("From", "")
        else:
            # Dev mode: payload JSON manuale per test locali senza Twilio
            media_url = request.data.get("media_url", "")
            caption = request.data.get("caption", "")
            sender = request.data.get("from", "")

        if not media_url:
            return Response({"error": "media_url mancante"}, status=status.HTTP_400_BAD_REQUEST)

        document = Document.objects.create(
            source=Document.SourceChoices.WHATSAPP,
            status=Document.StatusChoices.PENDING,
            file_url=media_url,
        )

        process_document_task.delay(
            document_id=document.id,
            file_content=None,
            filename=f"whatsapp_{document.id}.jpg",
            media_url=media_url,
            caption=caption,
        )

        if twilio_configured:
            # Twilio richiede TwiML XML come risposta
            return HttpResponse('<?xml version="1.0"?><Response/>', content_type="text/xml")

        return Response({"status": "received", "document_id": document.id}, status=202)


class ResetDatabaseView(APIView):
    """Elimina tutti i documenti, riconciliazioni e discrepanze. Solo per sviluppo."""
    permission_classes = [AllowAny]

    def post(self, request):
        from .models import Discrepancy, Reconciliation, Document
        Discrepancy.objects.all().delete()
        Reconciliation.objects.all().delete()
        count = Document.objects.count()
        Document.objects.all().delete()
        return Response({"deleted": count})


class ReconciliationListView(generics.ListAPIView):
    """Lista di tutte le riconciliazioni."""
    queryset = Reconciliation.objects.select_related(
        "doc1", "doc2"
    ).prefetch_related("discrepancy_list").all()
    serializer_class = ReconciliationSerializer
    permission_classes = [AllowAny]


class ReconciliationDetailView(generics.RetrieveAPIView):
    """Dettaglio di una riconciliazione con tutte le discrepanze."""
    queryset = Reconciliation.objects.select_related(
        "doc1", "doc2"
    ).prefetch_related("discrepancy_list").all()
    serializer_class = ReconciliationSerializer
    permission_classes = [AllowAny]


class ReconciliationUpdateView(generics.UpdateAPIView):
    """L'operatore approva, rifiuta o corregge una riconciliazione."""
    queryset = Reconciliation.objects.all()
    serializer_class = ReconciliationUpdateSerializer
    permission_classes = [AllowAny]
    http_method_names = ["patch"]