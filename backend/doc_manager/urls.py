from django.urls import path
from . import views

urlpatterns = [
    # Documenti
    path("documents/", views.DocumentListView.as_view(), name="document-list"),
    path("documents/upload/", views.DocumentUploadView.as_view(), name="document-upload"),
    path("documents/upload-image/", views.ImageUploadView.as_view(), name="document-upload-image"),
    path("documents/<int:pk>/", views.DocumentDetailView.as_view(), name="document-detail"),

    # Webhook WhatsApp
    path("webhook/whatsapp/", views.WhatsAppWebhookView.as_view(), name="whatsapp-webhook"),

    # Dev utility
    path("dev/reset/", views.ResetDatabaseView.as_view(), name="dev-reset"),

    # Riconciliazioni
    path("reconciliations/", views.ReconciliationListView.as_view(), name="reconciliation-list"),
    path("reconciliations/<int:pk>/", views.ReconciliationDetailView.as_view(), name="reconciliation-detail"),
    path("reconciliations/<int:pk>/review/", views.ReconciliationUpdateView.as_view(), name="reconciliation-review"),
]