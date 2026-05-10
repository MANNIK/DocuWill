from django.shortcuts import render

# Create your views here.
import httpx
from django.conf import settings
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
    Riceve il webhook WhatsApp (o il mock endpoint).
    Payload atteso: {"from": "+39...", "media_url": "...", "caption": "..."}
    """
    permission_classes = [AllowAny]

    def post(self, request):
        media_url = request.data.get("media_url")
        caption = request.data.get("caption", "")
        sender = request.data.get("from", "")

        if not media_url:
            return Response(
                {"error": "media_url è obbligatorio"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Crea il documento in stato pending
        document = Document.objects.create(
            source=Document.SourceChoices.WHATSAPP,
            status=Document.StatusChoices.PENDING,
            file_url=media_url,
        )

        # Lancia il task Celery
        process_document_task.delay(
            document_id=document.id,
            file_content=None,
            filename=None,
            media_url=media_url,
            caption=caption,
        )

        return Response(
            {"status": "received", "document_id": document.id},
            status=status.HTTP_202_ACCEPTED,
        )


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