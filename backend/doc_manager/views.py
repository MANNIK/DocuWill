import hashlib
import json
from datetime import date, timedelta

from django.conf import settings
from django.core.files.base import ContentFile
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
    DiscrepancyUpdateSerializer,
    DocumentListSerializer,
    DocumentSerializer,
    DocumentUploadSerializer,
    ReconciliationSerializer,
    ReconciliationUpdateSerializer,
)
from .throttling import RegisterThrottle, UploadBurstThrottle, WebhookThrottle
from .utils import is_safe_external_url, normalize_supplier, supplier_key
from .tasks import process_document_task


def _quota_exceeded(user) -> bool:
    """
    True se l'utente ha già raggiunto la quota giornaliera di documenti.
    Tetto persistente sul budget LLM, complementare al throttle di frequenza.
    Conta i documenti creati oggi (query indicizzata su created_by + created_at).
    """
    quota = AppSettings.get_solo().daily_document_quota
    if not quota or quota <= 0:
        return False
    today = timezone.now().date()
    used = Document.objects.filter(
        created_by=user, created_at__date=today
    ).count()
    return used >= quota


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
    throttle_classes = [UploadBurstThrottle]

    def post(self, request):
        if _quota_exceeded(request.user):
            return Response(
                {"error": "Quota giornaliera di documenti raggiunta. Riprova domani."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = DocumentUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        file = serializer.validated_data["file"]

        # Crea il documento in stato pending
        document = Document.objects.create(
            source=Document.SourceChoices.UPLOAD,
            status=Document.StatusChoices.PENDING,
            original_filename=file.name,
            created_by=request.user,
        )

        # Persisti il file su storage: il task lo rilegge da lì.
        # Evita di serializzare i bytes come lista di interi nel payload Celery/Redis
        # (esplosione di memoria su file grandi).
        document.file.save(file.name, ContentFile(file.read()), save=True)

        process_document_task.delay(
            document_id=document.id,
            file_content=None,
            filename=file.name,
        )

        return Response(
            DocumentSerializer(document, context={'request': request}).data,
            status=status.HTTP_202_ACCEPTED,
        )


class ImageUploadView(APIView):
    """
    Riceve un file immagine (jpg/png) dall'operatore — simula il flusso WhatsApp
    senza bisogno di un URL pubblico. Utile per testare l'OCR localmente.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [UploadBurstThrottle]

    # Estensioni immagine accettate per l'OCR (coerenti con _MIME_MAP dell'ai_service).
    ALLOWED_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")

    def post(self, request):
        if _quota_exceeded(request.user):
            return Response(
                {"error": "Quota giornaliera di documenti raggiunta. Riprova domani."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "file è obbligatorio"}, status=status.HTTP_400_BAD_REQUEST)

        max_size = getattr(settings, "MAX_UPLOAD_SIZE", 10 * 1024 * 1024)
        if file.size > max_size:
            return Response(
                {"error": f"File troppo grande (max {max_size // (1024 * 1024)} MB)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (file.name or "").lower().endswith(self.ALLOWED_IMAGE_EXTENSIONS):
            return Response(
                {"error": "Formato immagine non supportato. Usa JPG, PNG o WEBP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        document = Document.objects.create(
            source=Document.SourceChoices.IMAGE,
            status=Document.StatusChoices.PENDING,
            original_filename=file.name,
            created_by=request.user,
        )

        # Persisti l'immagine su storage: serve sia come preview sia come sorgente
        # per il task (che la rilegge da lì invece di riceverla nel payload Celery).
        document.file.save(file.name, ContentFile(file.read()), save=True)

        process_document_task.delay(
            document_id=document.id,
            file_content=None,
            filename=file.name,
        )

        return Response(DocumentSerializer(document, context={'request': request}).data, status=status.HTTP_202_ACCEPTED)


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
      Accettato SOLO se WHATSAPP_DEV_MODE=True (off di default in produzione).
    """
    permission_classes = [AllowAny]
    throttle_classes = [WebhookThrottle]

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
            # Dev mode: payload JSON non firmato. Abilitato solo esplicitamente,
            # altrimenti chiunque potrebbe innescare OCR+LLM su URL arbitrari.
            if not settings.WHATSAPP_DEV_MODE:
                return Response(
                    {"error": "Webhook non configurato (firma Twilio assente)."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            media_url = request.data.get("media_url", "")
            caption = request.data.get("caption", "")
            sender = request.data.get("from", "")

        if not media_url:
            return Response({"error": "media_url mancante"}, status=status.HTTP_400_BAD_REQUEST)

        # Anti-SSRF: il media_url verrà scaricato dal worker. Rifiuta schemi non
        # http(s) e host che risolvono a IP privati/loopback/link-local.
        # I media Twilio (api.twilio.com) sono pubblici e passano il controllo.
        if not is_safe_external_url(media_url):
            return Response(
                {"error": "media_url non valido o non consentito."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
    throttle_classes = [RegisterThrottle]

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


class LogoutView(APIView):
    """
    Logout server-side: blacklista il refresh token così non è più utilizzabile
    (richiede `token_blacklist` in INSTALLED_APPS + ROTATE/BLACKLIST in SIMPLE_JWT).
    Il client rimuove comunque i token da localStorage.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = request.data.get("refresh", "")
        if not refresh:
            return Response({"error": "refresh token mancante"}, status=400)
        try:
            RefreshToken(refresh).blacklist()
        except Exception:
            # Token già scaduto/invalido: il logout è comunque considerato riuscito.
            pass
        return Response({"message": "Logout effettuato."}, status=200)


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

        recent_docs = DocumentListSerializer(
            Document.objects.order_by('-created_at')[:10],
            many=True,
            context={'request': request},
        ).data

        return Response({
            "pending": pending,
            "processed_today": processed_today,
            "match_rate": match_rate,
            "avg_processing_ms": avg_processing_ms,
            "queue": queue,
            "ingestion_7d": ingestion_7d,
            "discrepancy_histogram": disc_histogram,
            "recent_documents": recent_docs,
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
    """Lista fornitori con statistiche aggregate (raggruppati per canonical name)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Max, Q

        rows = (
            Document.objects
            .exclude(supplier_canonical='')
            .values('supplier_canonical')
            .annotate(
                doc_count=Count('id'),
                last_upload=Max('created_at'),
            )
            .order_by('-doc_count')
        )

        result = []
        for row in rows:
            canon = row['supplier_canonical']
            # Display name: nome originale più recente associato al canonical
            display_name = (
                Document.objects.filter(supplier_canonical=canon)
                .exclude(supplier_name='').order_by('-created_at')
                .values_list('supplier_name', flat=True).first()
            ) or canon

            recon_q = Reconciliation.objects.filter(
                Q(doc1__supplier_canonical=canon) | Q(doc2__supplier_canonical=canon)
            )
            total_recon = recon_q.count()
            approved = recon_q.filter(status=Reconciliation.StatusChoices.APPROVED).count()
            avg_conf = recon_q.aggregate(avg=Avg('match_confidence'))['avg'] or 0
            match_rate = round(approved / total_recon * 100) if total_recon else round(avg_conf)
            result.append({
                "name": display_name,
                "name_key": canon,
                "doc_count": row['doc_count'],
                "last_upload": row['last_upload'],
                "match_rate": match_rate,
            })

        return Response(result)


class SupplierDetailView(APIView):
    """Dettaglio fornitore con stats e cache mapping Redis."""
    permission_classes = [IsAuthenticated]

    def get(self, request, name):
        from django.db.models import Q
        from .utils import canonical_supplier_name

        # Risolvi il canonical: cerca prima un doc con quel display name
        canon = (
            Document.objects.filter(supplier_name=name)
            .values_list('supplier_canonical', flat=True).first()
        ) or canonical_supplier_name(name)

        docs = Document.objects.filter(supplier_canonical=canon)
        if not docs.exists():
            # Fallback: cerca per nome esatto (prima del backfill)
            docs = Document.objects.filter(supplier_name__iexact=name)
            if not docs.exists():
                return Response({"error": "Fornitore non trovato"}, status=404)

        by_type = dict(docs.values('doc_type').annotate(c=Count('id')).values_list('doc_type', 'c'))
        recon_q = Reconciliation.objects.filter(
            Q(doc1__supplier_canonical=canon) | Q(doc2__supplier_canonical=canon)
        )
        total_recon = recon_q.count()
        approved = recon_q.filter(status=Reconciliation.StatusChoices.APPROVED).count()
        avg_conf = recon_q.aggregate(avg=Avg('match_confidence'))['avg'] or 0
        match_rate = round(approved / total_recon * 100) if total_recon else round(avg_conf)

        cached_mappings = []
        try:
            import redis as redis_lib
            broker_url = getattr(settings, 'CELERY_BROKER_URL', 'redis://redis:6379/0')
            cache_url = broker_url.rsplit('/', 1)[0] + '/2'
            r = redis_lib.from_url(cache_url, socket_connect_timeout=1)
            name_hash = hashlib.md5(supplier_key(canon).encode()).hexdigest()[:12]
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

        display_name = docs.order_by('-created_at').values_list('supplier_name', flat=True).first() or name
        return Response({
            "name": display_name,
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


class DiscrepancyUpdateView(generics.UpdateAPIView):
    """L'operatore risolve una singola discrepanza."""
    from .models import Discrepancy as _Disc
    queryset = Discrepancy.objects.all()
    serializer_class = DiscrepancyUpdateSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["patch"]

    def perform_update(self, serializer):
        resolution = serializer.validated_data.get('resolution', '')
        extra = {}
        if resolution and resolution != Discrepancy.ResolutionChoices.UNRESOLVED:
            extra['resolved_at'] = timezone.now()
            extra['resolved_by'] = self.request.user
        serializer.save(**extra)


class NotificationsView(APIView):
    """Notifiche per la topbar: riconciliazioni pending, errori, ecc."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        last_24h = timezone.now() - timezone.timedelta(hours=24)

        pending_recons = Reconciliation.objects.filter(
            status=Reconciliation.StatusChoices.PENDING
        ).select_related('doc1', 'doc2').order_by('-created_at')[:20]

        error_docs = Document.objects.filter(
            status=Document.StatusChoices.ERROR,
            updated_at__gte=last_24h,
        ).order_by('-updated_at')[:10]

        items = []
        for r in pending_recons:
            items.append({
                "type": "recon_pending",
                "message": f"Riconciliazione {r.doc1.supplier_name or r.doc1.original_filename} in attesa",
                "link": f"/v2/reconciliations/{r.id}",
                "created_at": r.created_at.isoformat(),
            })
        for d in error_docs:
            items.append({
                "type": "doc_error",
                "message": f"Errore elaborazione: {d.original_filename or d.supplier_name}",
                "link": f"/documents/{d.id}",
                "created_at": d.updated_at.isoformat(),
            })

        errors_last_24h = Document.objects.filter(
            status=Document.StatusChoices.ERROR,
            updated_at__gte=last_24h,
        ).count()

        return Response({
            "pending_reconciliations": Reconciliation.objects.filter(
                status=Reconciliation.StatusChoices.PENDING
            ).count(),
            "pending_documents": Document.objects.filter(
                status=Document.StatusChoices.PENDING
            ).count(),
            "errors_last_24h": errors_last_24h,
            "items": items,
        })


class SearchView(APIView):
    """Ricerca full-text su documenti per la command palette."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        q = request.query_params.get('q', '').strip()
        if len(q) < 2:
            return Response([])
        docs = Document.objects.filter(
            Q(supplier_name__icontains=q) |
            Q(supplier_canonical__icontains=q) |
            Q(document_number__icontains=q) |
            Q(original_filename__icontains=q)
        ).order_by('-created_at')[:10]
        return Response(DocumentListSerializer(
            docs, many=True, context={'request': request}
        ).data)


class MeView(APIView):
    """Profilo dell'utente corrente."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "date_joined": u.date_joined.isoformat(),
        })

    def patch(self, request):
        u = request.user
        email = request.data.get('email')
        password = request.data.get('password')
        if email is not None:
            u.email = email
        if password:
            if len(password) < 6:
                return Response({"error": "password troppo corta (min 6 caratteri)"}, status=400)
            u.set_password(password)
        u.save()
        return Response({
            "id": u.id,
            "username": u.username,
            "email": u.email,
        })