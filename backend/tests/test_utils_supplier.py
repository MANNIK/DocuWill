import pytest
from doc_manager.utils import normalize_supplier, _normalize_for_match, canonical_supplier_name


class TestNormalizeSupplier:
    def test_whitespace_trimmed(self):
        assert normalize_supplier("  Nordic Design  ") == "Nordic Design"

    def test_extra_spaces_collapsed(self):
        assert normalize_supplier("Nordic  Design   AB") == "Nordic Design AB"

    def test_empty_string_returns_empty(self):
        assert normalize_supplier("") == ""


class TestNormalizeForMatch:
    def test_uppercases_input(self):
        assert _normalize_for_match("acme") == "ACME"

    def test_strips_accent(self):
        # ö → O (NFD decomposition → Mn category removed)
        assert _normalize_for_match("Möbel") == "MOBEL"

    def test_strips_ab_suffix(self):
        assert _normalize_for_match("Nordic Design AB") == "NORDIC DESIGN"

    def test_strips_srl_suffix(self):
        assert _normalize_for_match("Acme Furniture S.r.l.") == "ACME FURNITURE"

    def test_strips_gmbh_and_co_kg(self):
        # Nested suffix: GmbH & Co. KG → entrambi rimossi
        assert _normalize_for_match("Translog GmbH & Co. KG") == "TRANSLOG"

    def test_strips_spa_suffix(self):
        assert _normalize_for_match("Zeta Logistics S.p.A.") == "ZETA LOGISTICS"

    def test_strips_srls_suffix(self):
        assert _normalize_for_match("Acme Furniture S.R.L.S.") == "ACME FURNITURE"

    def test_strips_ltd_suffix(self):
        assert _normalize_for_match("Omega Solutions Ltd.") == "OMEGA SOLUTIONS"

    def test_strips_inc_suffix(self):
        assert _normalize_for_match("Global Corp Inc.") == "GLOBAL"

    def test_empty_returns_empty(self):
        assert _normalize_for_match("") == ""

    def test_only_suffix_stripped_to_empty(self):
        # "AB" è un suffisso → rimosso → stringa vuota
        assert _normalize_for_match("AB") == ""


class TestCanonicalSupplierName:
    def test_returns_normalized_without_existing(self):
        assert canonical_supplier_name("Nordic Design AB") == "NORDIC DESIGN"

    def test_fuzzy_matches_existing_exact_canonical(self):
        # "Alpine Möbel AG" normalizza a "ALPINE MOBEL"
        # WRatio("ALPINE MOBEL", "ALPINE MOBEL") = 100 ≥ 92 → riusa
        existing = ["ALPINE MOBEL"]
        result = canonical_supplier_name("Alpine Möbel AG", existing_canonicals=existing)
        assert result == "ALPINE MOBEL"

    def test_no_fuzzy_match_for_unrelated_name(self):
        existing = ["ACME"]
        result = canonical_supplier_name("Zebra Corp", existing_canonicals=existing)
        assert result == "ZEBRA"

    def test_empty_existing_no_fuzzy(self):
        result = canonical_supplier_name("Nordic Design AB", existing_canonicals=[])
        assert result == "NORDIC DESIGN"

    def test_variants_produce_same_canonical(self):
        # "Nordic Design" e "Nordic Design AB" devono dare lo stesso canonical
        assert canonical_supplier_name("Nordic Design") == canonical_supplier_name("Nordic Design AB")

    def test_accent_variant_fuzzy_unified(self):
        # "Alpine Mobel" (senza umlaut) deve matchare "ALPINE MOBEL"
        existing = ["ALPINE MOBEL"]
        result = canonical_supplier_name("Alpine Mobel AG", existing_canonicals=existing)
        assert result == "ALPINE MOBEL"
