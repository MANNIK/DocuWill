import pytest
from doc_manager.models import Document, DocumentRow
from doc_manager.tasks import process_document_task


AI_RESPONSE = {
    "documents": [{
        "doc_type": "order",
        "supplier_name": "Test Supplier",
        "document_number": "ORD-TEST-001",
        "document_date": "2026-01-15",
        "total_amount": 500.0,
        "rows": [{
            "row_index": 0,
            "item_code": "T-001",
            "description": "Test Widget",
            "quantity": 10.0,
            "unit": "pz",
            "unit_price": 50.0,
            "total_price": 500.0,
            "discount": None,
            "raw_data": {"Codice": "T-001", "Desc": "Test Widget"},
        }],
        "raw_extracted": {"filename": "test.csv", "total_rows": 1},
    }],
    "total_sections": 1,
}

TWO_SECTION_RESPONSE = {
    "documents": [
        {
            "doc_type": "order",
            "supplier_name": "Supplier A",
            "document_number": "ORD-A-001",
            "document_date": "",
            "total_amount": None,
            "rows": [{
                "row_index": 0, "item_code": "A-001", "description": "Item A",
                "quantity": 5.0, "unit": "pz", "unit_price": None, "total_price": None,
                "discount": None, "raw_data": {},
            }],
            "raw_extracted": {},
        },
        {
            "doc_type": "invoice",
            "supplier_name": "Supplier B",
            "document_number": "INV-B-001",
            "document_date": "",
            "total_amount": None,
            "rows": [{
                "row_index": 0, "item_code": "B-001", "description": "Item B",
                "quantity": 3.0, "unit": "pz", "unit_price": None, "total_price": None,
                "discount": None, "raw_data": {},
            }],
            "raw_extracted": {},
        },
    ],
    "total_sections": 2,
}


class MockResponse:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


def _make_client(response_data):
    class _Client:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, **kwargs):
            return MockResponse(response_data)

    return _Client


FILE_CONTENT = list(b"Codice,Desc\nT-001,Test Widget")


@pytest.mark.django_db(transaction=True)
def test_task_sets_processed_status(monkeypatch):
    monkeypatch.setattr("doc_manager.tasks.httpx.Client", _make_client(AI_RESPONSE))
    doc = Document.objects.create(
        source=Document.SourceChoices.UPLOAD,
        status=Document.StatusChoices.PENDING,
        original_filename="test.csv",
    )
    process_document_task(doc.id, FILE_CONTENT, "test.csv")
    doc.refresh_from_db()
    assert doc.status == Document.StatusChoices.PROCESSED


@pytest.mark.django_db(transaction=True)
def test_task_creates_document_rows(monkeypatch):
    monkeypatch.setattr("doc_manager.tasks.httpx.Client", _make_client(AI_RESPONSE))
    doc = Document.objects.create(
        source=Document.SourceChoices.UPLOAD,
        status=Document.StatusChoices.PENDING,
        original_filename="test.csv",
    )
    process_document_task(doc.id, FILE_CONTENT, "test.csv")
    assert DocumentRow.objects.filter(document=doc).count() == 1
    row = DocumentRow.objects.get(document=doc)
    assert row.item_code == "T-001"
    assert float(row.quantity) == 10.0


@pytest.mark.django_db(transaction=True)
def test_task_populates_document_metadata(monkeypatch):
    monkeypatch.setattr("doc_manager.tasks.httpx.Client", _make_client(AI_RESPONSE))
    doc = Document.objects.create(
        source=Document.SourceChoices.UPLOAD,
        status=Document.StatusChoices.PENDING,
        original_filename="test.csv",
    )
    process_document_task(doc.id, FILE_CONTENT, "test.csv")
    doc.refresh_from_db()
    assert doc.supplier_name == "Test Supplier"
    assert doc.document_number == "ORD-TEST-001"
    assert doc.doc_type == Document.TypeChoices.ORDER
    assert doc.supplier_canonical == "TEST SUPPLIER"


@pytest.mark.django_db(transaction=True)
def test_task_multi_section_creates_extra_documents(monkeypatch):
    monkeypatch.setattr("doc_manager.tasks.httpx.Client", _make_client(TWO_SECTION_RESPONSE))
    doc = Document.objects.create(
        source=Document.SourceChoices.UPLOAD,
        status=Document.StatusChoices.PENDING,
        original_filename="multi.csv",
    )
    initial_count = Document.objects.count()
    process_document_task(doc.id, FILE_CONTENT, "multi.csv")
    # Prima sezione aggiorna doc esistente, seconda crea un nuovo Document
    assert Document.objects.count() == initial_count + 1
    doc.refresh_from_db()
    assert doc.supplier_name == "Supplier A"
