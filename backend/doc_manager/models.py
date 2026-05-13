from django.db import models


class Document(models.Model):
    """Rappresenta un documento caricato nel sistema (doc1 o doc2)."""

    class TypeChoices(models.TextChoices):
        UNKNOWN = "unknown", "Sconosciuto"
        ORDER = "order", "Ordine"
        INVOICE = "invoice", "Fattura"
        DDT = "ddt", "DDT"
        PRICE_LIST = "price_list", "Tariffario"
        PACKING_LIST = "packing_list", "Packing List"
        SHIPMENT = "shipment", "Spedizione"
        CONFIRMATION = "confirmation", "Conferma"
        SUMMARY = "summary", "Riepilogo"
        INVENTORY = "inventory", "Inventario"

    class SourceChoices(models.TextChoices):
        UPLOAD = "upload", "Upload CSV/Excel"
        WHATSAPP = "whatsapp", "WhatsApp"
        IMAGE = "image", "Immagine caricata"

    class StatusChoices(models.TextChoices):
        PENDING = "pending", "In elaborazione"
        PROCESSED = "processed", "Elaborato"
        ERROR = "error", "Errore"

    # Metadati documento
    source = models.CharField(max_length=20, choices=SourceChoices.choices)
    doc_type = models.CharField(
        max_length=20,
        choices=TypeChoices.choices,
        default=TypeChoices.UNKNOWN,
    )
    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.PENDING,
    )

    # File originale
    original_filename = models.CharField(max_length=255, blank=True)
    file_url = models.URLField(blank=True)  # per le foto WhatsApp

    # Dati estratti (raw JSON da FastAPI)
    extracted_data = models.JSONField(default=dict, blank=True)

    # Metadati estratti
    supplier_name = models.CharField(max_length=255, blank=True)
    document_date = models.DateField(null=True, blank=True)
    document_number = models.CharField(max_length=100, blank=True)
    total_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )

    # Errore elaborazione
    error_message = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_doc_type_display()} — {self.supplier_name or self.original_filename}"

    class Meta:
        ordering = ["-created_at"]


class DocumentRow(models.Model):
    """Una riga di dati estratta da un documento."""

    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="rows"
    )

    row_index = models.PositiveIntegerField()

    # Dati della riga
    item_code = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    quantity = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    unit = models.CharField(max_length=50, blank=True)
    unit_price = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    total_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    discount = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True
    )

    # Dati grezzi della riga (tutto quello che non rientra nei campi standard)
    raw_data = models.JSONField(default=dict)

    def __str__(self):
        return f"Riga {self.row_index} — {self.description[:50]}"

    class Meta:
        ordering = ["row_index"]
        unique_together = ["document", "row_index"]


class Reconciliation(models.Model):
    """Collegamento e confronto tra doc1 e doc2."""

    class StatusChoices(models.TextChoices):
        PENDING = "pending", "In attesa di revisione"
        APPROVED = "approved", "Approvato"
        REJECTED = "rejected", "Rifiutato"
        CORRECTED = "corrected", "Corretto"

    doc1 = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="reconciliations_as_doc1"
    )
    doc2 = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="reconciliations_as_doc2"
    )

    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.PENDING,
    )

    # Score di confidenza del matching (0-100)
    match_confidence = models.PositiveSmallIntegerField(default=0)

    # Risultato della riconciliazione (JSON con tutte le discrepanze)
    discrepancies = models.JSONField(default=list)

    # Note dell'operatore
    operator_notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Riconciliazione {self.doc1} ↔ {self.doc2}"

    class Meta:
        ordering = ["-created_at"]


class Discrepancy(models.Model):
    """Una singola discrepanza trovata durante la riconciliazione."""

    class TypeChoices(models.TextChoices):
        MISSING_IN_DOC2 = "missing_in_doc2", "Riga mancante nel doc2"
        EXTRA_IN_DOC2 = "extra_in_doc2", "Riga extra nel doc2"
        QUANTITY_MISMATCH = "quantity_mismatch", "Quantità diversa"
        PRICE_MISMATCH = "price_mismatch", "Prezzo diverso"
        DATE_MISMATCH = "date_mismatch", "Data diversa"
        TOTAL_MISMATCH = "total_mismatch", "Totale non corrispondente"
        DESCRIPTION_MISMATCH = "description_mismatch", "Descrizione diversa"
        CODE_MISMATCH = "code_mismatch", "Codice articolo diverso"
        UNIT_MISMATCH = "unit_mismatch", "Unità di misura diversa"
        DISCOUNT_MISMATCH = "discount_mismatch", "Sconto diverso"

    reconciliation = models.ForeignKey(
        Reconciliation, on_delete=models.CASCADE, related_name="discrepancy_list"
    )

    discrepancy_type = models.CharField(max_length=30, choices=TypeChoices.choices)

    # Riferimento alle righe coinvolte (opzionale)
    doc1_row = models.ForeignKey(
        DocumentRow,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="discrepancies_as_doc1",
    )
    doc2_row = models.ForeignKey(
        DocumentRow,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="discrepancies_as_doc2",
    )

    # Valori a confronto
    field_name = models.CharField(max_length=100)
    value_doc1 = models.TextField(blank=True)
    value_doc2 = models.TextField(blank=True)

    # Severità (info, warning, error)
    severity = models.CharField(
        max_length=10,
        choices=[("info", "Info"), ("warning", "Warning"), ("error", "Errore")],
        default="warning",
    )

    def __str__(self):
        return f"{self.get_discrepancy_type_display()} — {self.field_name}"