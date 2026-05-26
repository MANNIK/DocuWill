import hashlib
import json
from datetime import date, timedelta

from django.conf import settings
from django.http import HttpResponse
from django.db.models import Avg, Count, F, ExpressionWrapper, DurationField
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated

from .models import AppSettings, Discrepancy, Document, Reconciliation
from .serializers import (
    AppSettingsSerializer,
    DocumentListSerializer,
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
    permission_classes = [IsAuthenticated]  # toglieremo AllowAny quando aggiungiamo auth


class DocumentDetailView(generics.RetrieveAPIView):
    """Dettaglio di un singolo documento."""
    queryset = Document.objects.prefetch_related("rows").all()
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]


class DocumentUploadView(APIView):
    """
    Riceve il file CSV/Excel dall'operatore,
    crea il Document e lancia il task Celery.
    """
    permission_classes = [IsAuthenticated]

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
    permission_classes = [IsAuthenticated]

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


class RegisterView(APIView):
    """Registrazione nuovo operatore."""
    permission_classes = [AllowAny]

    def post(self, request):
        from django.contrib.auth.models import User
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")
        email = request.data.get("email", "").strip()

        if not username or not password:
            return Response({"error": "username e password obbligatori"}, status=400)
        if len(password) < 6:
            return Response({"error": "password troppo corta (min 6 caratteri)"}, status=400)
        if User.objects.filter(username=username).exists():
            return Response({"error": "username già in uso"}, status=400)

        User.objects.create_user(username=username, password=password, email=email)
        return Response({"message": "Account creato. Puoi ora accedere."}, status=201)


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
    permission_classes = [IsAuthenticated]


class ReconciliationDetailView(generics.RetrieveAPIView):
    """Dettaglio di una riconciliazione con tutte le discrepanze."""
    queryset = Reconciliation.objects.select_related(
        "doc1", "doc2"
    ).prefetch_related("discrepancy_list").all()
    serializer_class = ReconciliationSerializer
    permission_classes = [IsAuthenticated]


class ReconciliationUpdateView(generics.UpdateAPIView):
    """L'operatore approva, rifiuta o corregge una riconciliazione."""
    queryset = Reconciliation.objects.all()
    serializer_class = ReconciliationUpdateSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["patch"]


# ─── Nuovi endpoint per UI v2 ────────────────────────────────────────────────

class DashboardStatsView(APIView):
    """KPI aggregati per la dashboard v2."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()
        seven_days_ago = today - timedelta(days=6)

        pending = Document.objects.filter(status=Document.StatusChoices.PENDING).count()
        processed_today = Document.objects.filter(
            status=Document.StatusChoices.PROCESSED,
            updated_at__date=today,
        ).count()

        recon_total = Reconciliation.objects.count()
        recon_approved = Reconciliation.objects.filter(
            status=Reconciliation.StatusChoices.APPROVED
        ).count()
        match_rate = round(recon_approved / recon_total * 100) if recon_total else 0

        avg_ms = Document.objects.filter(
            status=Document.StatusChoices.PROCESSED
        ).annotate(
            duration=ExpressionWrapper(
                F('updated_at') - F('created_at'),
                output_field=DurationField()
            )
        ).aggregate(avg=Avg('duration'))['avg']
        avg_processing_ms = int(avg_ms.total_seconds() * 1000) if avg_ms else 0

        queue = ReconciliationSerializer(
            Reconciliation.objects.select_related('doc1', 'doc2')
            .prefetch_related('discrepancy_list')[:8],
            many=True
        ).data

        ingestion_7d = []
        for i in range(7):
            d = seven_days_ago + timedelta(days=i)
            cnt = Document.objects.filter(created_at__date=d).count()
            ingestion_7d.append({"date": d.isoformat(), "count": cnt})

        disc_histogram = list(
            Discrepancy.objects.values('discrepancy_type')
            .annotate(count=Count('id'))
            .order_by('-count')[:10]
        )

        return Response({
            "pending": pending,
            "processed_today": processed_today,
            "match_rate": match_rate,
            "avg_processing_ms": avg_processing_ms,
            "queue": queue,
            "ingestion_7d": ingestion_7d,
            "discrepancy_histogram": disc_histogram,
        })


class WhatsAppInboxView(generics.ListAPIView):
    """Lista documenti ricevuti via WhatsApp/immagine per l'inbox v2."""
    serializer_class = DocumentListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Document.objects.filter(
            source__in=[Document.SourceChoices.WHATSAPP, Document.SourceChoices.IMAGE]
        ).order_by('-created_at')


class SuppliersListView(APIView):
    """Lista fornitori con statistiche aggregate."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Max, Q
        suppliers = (
            Document.objects
            .exclude(supplier_name='')
            .values('supplier_name')
            .annotate(
                doc_count=Count('id'),
                last_upload=Max('created_at'),
            )
            .order_by('-doc_count')
        )

        result = []
        for s in suppliers:
            name = s['supplier_name']
            recon_q = Reconciliation.objects.filter(
                Q(doc1__supplier_name=name) | Q(doc2__supplier_name=name)
            )
            total_recon = recon_q.count()
            approved = recon_q.filter(status=Reconciliation.StatusChoices.APPROVED).count()
            match_rate = round(approved / total_recon * 100) if total_recon else 0
            result.append({
                "name": name,
                "doc_count": s['doc_count'],
                "last_upload": s['last_upload'],
                "match_rate": match_rate,
            })

        return Response(result)


class SupplierDetailView(APIView):
    """Dettaglio fornitore con stats e cache mapping Redis."""
    permission_classes = [IsAuthenticated]

    def get(self, request, name):
        from django.db.models import Q
        docs = Document.objects.filter(supplier_name=name)
        if not docs.exists():
            return Response({"error": "Fornitore non trovato"}, status=404)

        by_type = dict(docs.values('doc_type').annotate(c=Count('id')).values_list('doc_type', 'c'))
        recon_q = Reconciliation.objects.filter(
            Q(doc1__supplier_name=name) | Q(doc2__supplier_name=name)
        )
        total_recon = recon_q.count()
        approved = recon_q.filter(status=Reconciliation.StatusChoices.APPROVED).count()
        match_rate = round(approved / total_recon * 100) if total_recon else 0

        cached_mappings = []
        try:
            import redis as redis_lib
            broker_url = getattr(settings, 'CELERY_BROKER_URL', 'redis://redis:6379/0')
            cache_url = broker_url.rsplit('/', 1)[0] + '/2'
            r = redis_lib.from_url(cache_url, socket_connect_timeout=1)
            name_hash = hashlib.md5(name.lower().encode()).hexdigest()[:12]
            keys = r.keys(f'col_map:{name_hash}:*')
            for key in keys:
                raw = r.get(key)
                if raw:
                    data = json.loads(raw)
                    ttl = r.ttl(key)
                    fingerprint = key.decode().split(':')[-1] if isinstance(key, bytes) else key.split(':')[-1]
                    cached_mappings.append({
                        "headers_fingerprint": fingerprint,
                        "mapping": data.get("column_mapping", {}),
                        "doc_type": data.get("doc_type", ""),
                        "ttl_days": round(ttl / 86400) if ttl > 0 else 0,
                    })
        except Exception:
            pass

        return Response({
            "name": name,
            "doc_count": docs.count(),
            "match_rate": match_rate,
            "docs_by_type": by_type,
            "cached_mappings": cached_mappings,
        })


class SettingsView(APIView):
    """Legge e aggiorna le impostazioni applicazione."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        obj = AppSettings.get_solo()
        return Response(AppSettingsSerializer(obj).data)

    def patch(self, request):
        obj = AppSettings.get_solo()
        serializer = AppSettingsSerializer(obj, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        serializer.save()
        return Response(serializer.data)


class ClearCacheView(APIView):
    """Svuota la cache Redis dei column mapping per i fornitori (DB 2)."""
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        try:
            import redis as redis_lib
            broker_url = getattr(settings, 'CELERY_BROKER_URL', 'redis://redis:6379/0')
            cache_url = broker_url.rsplit('/', 1)[0] + '/2'
            r = redis_lib.from_url(cache_url, socket_connect_timeout=1)
            keys = r.keys('col_map:*')
            deleted = len(keys)
            if keys:
                r.delete(*keys)
            return Response({"deleted": deleted})
        except Exception as e:
            return Response({"error": str(e)}, status=500)