from rest_framework import serializers
from .models import Document, DocumentRow, Reconciliation, Discrepancy, AppSettings


class DocumentRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentRow
        fields = [
            "id",
            "row_index",
            "item_code",
            "description",
            "quantity",
            "unit",
            "unit_price",
            "total_price",
            "discount",
            "raw_data",
        ]


class DocumentSerializer(serializers.ModelSerializer):
    rows = DocumentRowSerializer(many=True, read_only=True)
    doc_type_display = serializers.CharField(
        source="get_doc_type_display", read_only=True
    )
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )
    source_display = serializers.CharField(
        source="get_source_display", read_only=True
    )

    class Meta:
        model = Document
        fields = [
            "id",
            "source",
            "source_display",
            "doc_type",
            "doc_type_display",
            "status",
            "status_display",
            "original_filename",
            "supplier_name",
            "document_date",
            "document_number",
            "total_amount",
            "extracted_data",
            "error_message",
            "file_url",
            "file",
            "rows",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "doc_type",
            "extracted_data",
            "error_message",
            "created_at",
            "updated_at",
        ]


class DocumentUploadSerializer(serializers.Serializer):
    """Usato solo per l'upload del file — non un ModelSerializer."""
    file = serializers.FileField()


class DiscrepancySerializer(serializers.ModelSerializer):
    discrepancy_type_display = serializers.CharField(
        source="get_discrepancy_type_display", read_only=True
    )
    resolution_display = serializers.CharField(
        source="get_resolution_display", read_only=True
    )

    class Meta:
        model = Discrepancy
        fields = [
            "id",
            "discrepancy_type",
            "discrepancy_type_display",
            "field_name",
            "value_doc1",
            "value_doc2",
            "severity",
            "doc1_row",
            "doc2_row",
            "resolution",
            "resolution_display",
            "resolved_value",
            "operator_note",
            "llm_suggestion",
            "resolved_at",
        ]


class DiscrepancyUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Discrepancy
        fields = ["resolution", "resolved_value", "operator_note"]


class ReconciliationSerializer(serializers.ModelSerializer):
    doc1 = DocumentSerializer(read_only=True)
    doc2 = DocumentSerializer(read_only=True)
    discrepancy_list = DiscrepancySerializer(many=True, read_only=True)
    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )

    class Meta:
        model = Reconciliation
        fields = [
            "id",
            "doc1",
            "doc2",
            "status",
            "status_display",
            "match_confidence",
            "discrepancies",
            "discrepancy_list",
            "operator_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "doc1",
            "doc2",
            "match_confidence",
            "discrepancies",
            "created_at",
            "updated_at",
        ]


class ReconciliationUpdateSerializer(serializers.ModelSerializer):
    """Usato dall'operatore per approvare/rifiutare/correggere."""

    class Meta:
        model = Reconciliation
        fields = ["status", "operator_notes"]


class AppSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppSettings
        fields = ["whatsapp_provider", "ocr_engine", "match_threshold", "fuzzy_threshold", "updated_at"]
        read_only_fields = ["updated_at"]


class DocumentListSerializer(serializers.ModelSerializer):
    """Versione leggera di DocumentSerializer per liste (senza rows)."""
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    doc_type_display = serializers.CharField(source="get_doc_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    row_count = serializers.SerializerMethodField()

    def get_row_count(self, obj):
        return obj.rows.count()

    class Meta:
        model = Document
        fields = [
            "id", "source", "source_display", "doc_type", "doc_type_display",
            "status", "status_display", "original_filename", "supplier_name",
            "document_date", "document_number", "total_amount", "error_message",
            "file_url", "file", "row_count", "created_at", "updated_at",
        ]