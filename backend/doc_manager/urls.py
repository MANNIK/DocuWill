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

    # Auth
    path("auth/register/", views.RegisterView.as_view(), name="register"),

    # Dev utility
    path("dev/reset/", views.ResetDatabaseView.as_view(), name="dev-reset"),

    # Riconciliazioni
    path("reconciliations/", views.ReconciliationListView.as_view(), name="reconciliation-list"),
    path("reconciliations/<int:pk>/", views.ReconciliationDetailView.as_view(), name="reconciliation-detail"),
    path("reconciliations/<int:pk>/review/", views.ReconciliationUpdateView.as_view(), name="reconciliation-review"),

    # UI v2 — nuovi endpoint
    path("dashboard/stats/", views.DashboardStatsView.as_view(), name="dashboard-stats"),
    path("whatsapp/inbox/", views.WhatsAppInboxView.as_view(), name="whatsapp-inbox"),
    path("suppliers/", views.SuppliersListView.as_view(), name="suppliers-list"),
    path("suppliers/<str:name>/", views.SupplierDetailView.as_view(), name="supplier-detail"),
    path("settings/", views.SettingsView.as_view(), name="settings"),
    path("settings/cache/", views.ClearCacheView.as_view(), name="settings-cache"),
]