import io
import pytest
from unittest.mock import patch, MagicMock
from django.contrib.auth.models import User


@pytest.mark.django_db
class TestAuth:
    def test_upload_without_auth_returns_401(self, api_client):
        resp = api_client.post("/api/documents/upload/", {})
        assert resp.status_code == 401

    def test_reconciliation_list_without_auth_returns_401(self, api_client):
        resp = api_client.get("/api/reconciliations/")
        assert resp.status_code == 401

    def test_register_creates_user(self, api_client):
        resp = api_client.post(
            "/api/auth/register/",
            {"username": "operatore1", "password": "securepass123"},
            format="json",
        )
        assert resp.status_code == 201
        assert User.objects.filter(username="operatore1").exists()

    def test_register_duplicate_username_returns_400(self, api_client):
        User.objects.create_user(username="esistente", password="pass123")
        resp = api_client.post(
            "/api/auth/register/",
            {"username": "esistente", "password": "pass123"},
            format="json",
        )
        assert resp.status_code == 400

    def test_register_short_password_returns_400(self, api_client):
        resp = api_client.post(
            "/api/auth/register/",
            {"username": "nuovo", "password": "abc"},
            format="json",
        )
        assert resp.status_code == 400


@pytest.mark.django_db
class TestDocumentUpload:
    @patch("doc_manager.tasks.process_document_task.delay")
    def test_upload_csv_returns_202_and_schedules_task(self, mock_delay, api_client, auth_headers):
        mock_delay.return_value = MagicMock(id="fake-task-id")
        csv_content = b"item_code,quantity\nFRN-001,10\nFRN-002,20\n"
        csv_file = io.BytesIO(csv_content)
        csv_file.name = "test.csv"

        resp = api_client.post(
            "/api/documents/upload/",
            {"file": csv_file},
            format="multipart",
            **auth_headers,
        )

        assert resp.status_code == 202
        assert mock_delay.called
        data = resp.json()
        assert data["status"] == "pending"
        assert data["source"] == "upload"
        assert data["original_filename"] == "test.csv"

    @patch("doc_manager.tasks.process_document_task.delay")
    def test_upload_without_file_returns_400(self, mock_delay, api_client, auth_headers):
        resp = api_client.post(
            "/api/documents/upload/",
            {},
            format="multipart",
            **auth_headers,
        )
        assert resp.status_code == 400
        assert not mock_delay.called


@pytest.mark.django_db
class TestListEndpoints:
    def test_documents_list_empty_on_fresh_db(self, api_client, auth_headers):
        resp = api_client.get("/api/documents/", **auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_reconciliations_list_empty_on_fresh_db(self, api_client, auth_headers):
        resp = api_client.get("/api/reconciliations/", **auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []
