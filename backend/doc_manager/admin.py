from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Document, DocumentRow, Reconciliation, Discrepancy


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ["id", "doc_type", "source", "status", "supplier_name", "created_at"]
    list_filter = ["status", "doc_type", "source"]
    search_fields = ["supplier_name", "document_number", "original_filename"]


@admin.register(DocumentRow)
class DocumentRowAdmin(admin.ModelAdmin):
    list_display = ["id", "document", "row_index", "item_code", "description", "quantity"]


@admin.register(Reconciliation)
class ReconciliationAdmin(admin.ModelAdmin):
    list_display = ["id", "doc1", "doc2", "status", "match_confidence", "created_at"]
    list_filter = ["status"]


@admin.register(Discrepancy)
class DiscrepancyAdmin(admin.ModelAdmin):
    list_display = ["id", "reconciliation", "discrepancy_type", "severity", "field_name"]
    list_filter = ["discrepancy_type", "severity"]