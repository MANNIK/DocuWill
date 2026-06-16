import pytest
from types import SimpleNamespace
from rest_framework.test import APIClient
from django.contrib.auth.models import User


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    """
    Svuota la cache DRF (throttle counters) prima di ogni test.
    Impedisce che i contatori accumulati da test precedenti facciano scattare
    il rate limit su un test successivo (es. 3 register test → 429 sul 4°).
    Safe: nei test non vengono popolate cache persistenti (embedding, col-map)
    perché le chiamate AI sono tutte mockkate.
    """
    from django.core.cache import cache
    cache.clear()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_headers(api_client, db):
    user = User.objects.create_user(username="testuser", password="testpass123")
    resp = api_client.post(
        "/api/auth/token/",
        {"username": "testuser", "password": "testpass123"},
        format="json",
    )
    token = resp.data["access"]
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}


@pytest.fixture
def make_row():
    """
    Factory per oggetti row-like compatibili con _compare_rows e level1_exact_match.
    Usare description="" (default) per evitare il fallback embedding che chiama OpenAI.
    """
    def _make(item_code="", description="", quantity=None,
               unit="", unit_price=None, total_price=None, discount=None):
        return SimpleNamespace(
            item_code=item_code,
            description=description,
            quantity=quantity,
            unit=unit,
            unit_price=unit_price,
            total_price=total_price,
            discount=discount,
        )
    return _make
