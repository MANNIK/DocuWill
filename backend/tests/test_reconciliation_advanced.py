import json
import pytest
from unittest.mock import patch, MagicMock
from doc_manager.models import Document, DocumentRow, Reconciliation
from doc_manager.reconciliation import compute_match_score, level3_decide, level2_semantic_check


@pytest.fixture
def two_docs(db):
    """Coppia di Document PROCESSED senza supplier_name (evita chiamate embedding OpenAI)."""
    doc1 = Document.objects.create(
        source=Document.SourceChoices.UPLOAD,
        doc_type=Document.TypeChoices.ORDER,
        status=Document.StatusChoices.PROCESSED,
        original_filename="order.csv",
    )
    doc2 = Document.objects.create(
        source=Document.SourceChoices.UPLOAD,
        doc_type=Document.TypeChoices.INVOICE,
        status=Document.StatusChoices.PROCESSED,
        original_filename="invoice.csv",
    )
    return doc1, doc2


class TestComputeMatchScore:
    def test_identical_document_number_adds_50(self, two_docs):
        doc1, doc2 = two_docs
        doc1.document_number = "ORD-2026-001"
        doc1.save()
        doc2.document_number = "ORD-2026-001"
        doc2.save()
        assert compute_match_score(doc1, doc2) >= 50

    def test_different_document_numbers_no_50_bonus(self, two_docs):
        doc1, doc2 = two_docs
        doc1.document_number = "ORD-001"
        doc1.save()
        doc2.document_number = "INV-999"
        doc2.save()
        assert compute_match_score(doc1, doc2) < 50

    def test_perfect_item_code_overlap_adds_40(self, two_docs):
        doc1, doc2 = two_docs
        for i, code in enumerate(["A-001", "A-002", "A-003"]):
            DocumentRow.objects.create(document=doc1, row_index=i, item_code=code)
            DocumentRow.objects.create(document=doc2, row_index=i, item_code=code)
        # Jaccard = 3/3 = 1.0 → +40
        assert compute_match_score(doc1, doc2) >= 40

    def test_partial_item_code_overlap_adds_10(self, two_docs):
        doc1, doc2 = two_docs
        for i, code in enumerate(["A-001", "A-002", "A-003", "A-004"]):
            DocumentRow.objects.create(document=doc1, row_index=i, item_code=code)
        for i, code in enumerate(["A-001", "X-999"]):
            DocumentRow.objects.create(document=doc2, row_index=i, item_code=code)
        # jaccard ≈ 1/5 = 0.2 → +10
        assert compute_match_score(doc1, doc2) >= 10

    def test_no_overlap_no_jaccard_bonus(self, two_docs):
        doc1, doc2 = two_docs
        DocumentRow.objects.create(document=doc1, row_index=0, item_code="A-001")
        DocumentRow.objects.create(document=doc2, row_index=0, item_code="Z-999")
        assert compute_match_score(doc1, doc2) == 0

    def test_score_capped_at_100(self, two_docs):
        doc1, doc2 = two_docs
        doc1.document_number = "ORD-001"
        doc1.save()
        doc2.document_number = "ORD-001"
        doc2.save()
        for i, code in enumerate(["A-001", "A-002", "A-003"]):
            DocumentRow.objects.create(document=doc1, row_index=i, item_code=code)
            DocumentRow.objects.create(document=doc2, row_index=i, item_code=code)
        assert compute_match_score(doc1, doc2) <= 100

    def test_same_date_adds_10(self, two_docs):
        doc1, doc2 = two_docs
        from datetime import date
        doc1.document_date = date(2026, 3, 15)
        doc1.save()
        doc2.document_date = date(2026, 3, 15)
        doc2.save()
        assert compute_match_score(doc1, doc2) >= 10


class TestLevel3Decide:
    def _make_reconciliation(self, db, discrepancies: list) -> Reconciliation:
        doc1 = Document.objects.create(
            source=Document.SourceChoices.UPLOAD,
            status=Document.StatusChoices.PROCESSED,
        )
        doc2 = Document.objects.create(
            source=Document.SourceChoices.UPLOAD,
            status=Document.StatusChoices.PROCESSED,
        )
        return Reconciliation.objects.create(
            doc1=doc1, doc2=doc2,
            match_confidence=70,
            discrepancies=discrepancies,
        )

    def test_auto_approves_when_only_warnings(self, db):
        recon = self._make_reconciliation(db, [
            {"type": "unit_mismatch", "severity": "warning"},
            {"type": "code_mismatch", "severity": "info"},
        ])
        level3_decide(recon)
        recon.refresh_from_db()
        assert recon.status == Reconciliation.StatusChoices.APPROVED

    def test_stays_pending_when_has_error(self, db):
        recon = self._make_reconciliation(db, [
            {"type": "quantity_mismatch", "severity": "error"},
            {"type": "unit_mismatch", "severity": "warning"},
        ])
        level3_decide(recon)
        recon.refresh_from_db()
        assert recon.status == Reconciliation.StatusChoices.PENDING

    def test_auto_approves_when_empty_discrepancies(self, db):
        recon = self._make_reconciliation(db, [])
        level3_decide(recon)
        recon.refresh_from_db()
        assert recon.status == Reconciliation.StatusChoices.APPROVED

    def test_multiple_errors_stays_pending(self, db):
        recon = self._make_reconciliation(db, [
            {"type": "price_mismatch", "severity": "error"},
            {"type": "quantity_mismatch", "severity": "error"},
        ])
        level3_decide(recon)
        recon.refresh_from_db()
        assert recon.status == Reconciliation.StatusChoices.PENDING


class TestLevel2SemanticCheckMocked:
    """Verifica che level2_semantic_check usi la risposta GPT per aggiornare le severity."""

    def _make_docs_with_row(self, db) -> tuple:
        doc1 = Document.objects.create(
            source=Document.SourceChoices.UPLOAD,
            doc_type=Document.TypeChoices.ORDER,
            status=Document.StatusChoices.PROCESSED,
            supplier_name="Nordic Design AB",
        )
        doc2 = Document.objects.create(
            source=Document.SourceChoices.UPLOAD,
            doc_type=Document.TypeChoices.INVOICE,
            status=Document.StatusChoices.PROCESSED,
            supplier_name="Nordic Design AB",
        )
        DocumentRow.objects.create(
            document=doc1, row_index=0, item_code="X-001", description="Widget A"
        )
        DocumentRow.objects.create(
            document=doc2, row_index=0, item_code="X-001", description="Widget A"
        )
        return doc1, doc2

    def test_gpt_downgrades_severity(self, db):
        doc1, doc2 = self._make_docs_with_row(db)
        original = [
            {
                "type": "unit_mismatch", "field": "unit",
                "value_doc1": "pz", "value_doc2": "pcs",
                "severity": "error",
            }
        ]
        gpt_json = json.dumps({
            "discrepancies": [{
                "type": "unit_mismatch", "field": "unit",
                "value_doc1": "pz", "value_doc2": "pcs",
                "severity": "info", "note": "Italiano/inglese — equivalenti",
            }],
            "summary": "Stessa unità, notazione diversa.",
        })
        mock_msg = MagicMock()
        mock_msg.choices[0].message.content = gpt_json

        with patch("doc_manager.reconciliation.client.chat.completions.create", return_value=mock_msg):
            result = level2_semantic_check(doc1, doc2, original)

        assert len(result) == 1
        assert result[0]["severity"] == "info"

    def test_gpt_response_preserved_on_parse_error(self, db):
        """Se GPT restituisce JSON invalido, level2 torna alle discrepanze originali."""
        doc1, doc2 = self._make_docs_with_row(db)
        original = [{"type": "price_mismatch", "severity": "error"}]
        mock_msg = MagicMock()
        mock_msg.choices[0].message.content = "non è json valido!!!"

        with patch("doc_manager.reconciliation.client.chat.completions.create", return_value=mock_msg):
            with pytest.raises(Exception):
                # Il json.loads fallisce → eccezione propagata (claude_reconcile la cattura)
                level2_semantic_check(doc1, doc2, original)
