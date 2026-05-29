"""
Verifica che normalize_for_cache() produca output coerenti con _normalize_for_match()
del backend (backend/doc_manager/utils.py — KEEP IN SYNC).

Questi test non importano il backend (container separati): testano i casi noti
e garantiscono che ai_service usi lo stesso algoritmo.
"""
import pytest
from utils.supplier import normalize_for_cache


CASES = [
    # (raw_name, expected_canonical)
    ("Nordic Design AB", "NORDIC DESIGN"),
    ("Alpine Möbel AG", "ALPINE MOBEL"),
    ("Acme Furniture S.r.l.", "ACME FURNITURE"),
    ("Acme Furniture S.R.L.S.", "ACME FURNITURE"),
    ("Translog GmbH & Co. KG", "TRANSLOG"),
    ("Zeta Logistics S.p.A.", "ZETA LOGISTICS"),
    ("Omega Solutions Ltd.", "OMEGA SOLUTIONS"),
    ("Global Corp Inc.", "GLOBAL"),
    ("BV Supplies B.V.", "BV SUPPLIES"),
    ("", ""),
]


@pytest.mark.parametrize("raw, expected", CASES)
def test_normalize_for_cache_known_cases(raw, expected):
    assert normalize_for_cache(raw) == expected


class TestCacheKeyConsistency:
    def test_same_supplier_different_suffix_same_key(self):
        # "Nordic Design AB" e "Nordic Design" → stesso canonical → stessa cache key
        assert normalize_for_cache("Nordic Design AB") == normalize_for_cache("Nordic Design")

    def test_case_insensitive(self):
        assert normalize_for_cache("acme") == normalize_for_cache("ACME")

    def test_accent_stripped(self):
        # Möbel → MOBEL
        assert normalize_for_cache("Möbel GmbH") == normalize_for_cache("Mobel GmbH")

    def test_extra_whitespace_collapsed(self):
        assert normalize_for_cache("Nordic  Design") == normalize_for_cache("Nordic Design")

    def test_empty_returns_empty(self):
        assert normalize_for_cache("") == ""

    def test_only_suffix_returns_empty(self):
        assert normalize_for_cache("AB") == ""
