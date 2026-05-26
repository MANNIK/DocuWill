import pytest
from doc_manager.reconciliation import level1_exact_match, _compare_rows, _fuzzy_find


# ─── _compare_rows ────────────────────────────────────────────────────────────

class TestCompareRows:
    def test_no_discrepancy_equal_quantities(self, make_row):
        r1 = make_row(item_code="FRN-001", quantity=10.0, unit_price=5.0)
        r2 = make_row(item_code="FRN-001", quantity=10.0, unit_price=5.0)
        assert _compare_rows(r1, r2) == []

    def test_quantity_mismatch_is_error(self, make_row):
        r1 = make_row(quantity=50.0)
        r2 = make_row(quantity=48.0)
        result = _compare_rows(r1, r2)
        assert len(result) == 1
        assert result[0]["type"] == "quantity_mismatch"
        assert result[0]["severity"] == "error"
        assert result[0]["value_doc1"] == "50.0"
        assert result[0]["value_doc2"] == "48.0"

    def test_price_mismatch_is_error(self, make_row):
        r1 = make_row(unit_price=55.0)
        r2 = make_row(unit_price=62.5)
        result = _compare_rows(r1, r2)
        assert len(result) == 1
        assert result[0]["type"] == "price_mismatch"
        assert result[0]["severity"] == "error"

    def test_unit_mismatch_is_warning(self, make_row):
        r1 = make_row(unit="pz")
        r2 = make_row(unit="sct")
        result = _compare_rows(r1, r2)
        assert len(result) == 1
        assert result[0]["type"] == "unit_mismatch"
        assert result[0]["severity"] == "warning"

    def test_discount_mismatch_is_warning(self, make_row):
        r1 = make_row(discount=0.0)
        r2 = make_row(discount=5.0)
        result = _compare_rows(r1, r2)
        assert len(result) == 1
        assert result[0]["type"] == "discount_mismatch"
        assert result[0]["severity"] == "warning"

    def test_no_comparison_when_quantity_is_none(self, make_row):
        r1 = make_row(quantity=10.0)
        r2 = make_row(quantity=None)
        assert _compare_rows(r1, r2) == []

    def test_multiple_mismatches_returned(self, make_row):
        r1 = make_row(quantity=10.0, unit_price=5.0)
        r2 = make_row(quantity=12.0, unit_price=6.0)
        result = _compare_rows(r1, r2)
        types = [d["type"] for d in result]
        assert "quantity_mismatch" in types
        assert "price_mismatch" in types


# ─── level1_exact_match ───────────────────────────────────────────────────────

class TestLevel1ExactMatch:
    def test_perfect_match_empty_discrepancies(self, make_row):
        rows1 = {
            "FRN-001": make_row(item_code="FRN-001", quantity=2.0),
            "FRN-045": make_row(item_code="FRN-045", quantity=50.0),
        }
        rows2 = {
            "FRN-001": make_row(item_code="FRN-001", quantity=2.0),
            "FRN-045": make_row(item_code="FRN-045", quantity=50.0),
        }
        ok, discrepancies = level1_exact_match(rows1, rows2)
        assert ok is True
        assert discrepancies == []

    def test_quantity_mismatch_detected(self, make_row):
        rows1 = {"FRN-045": make_row(item_code="FRN-045", quantity=50.0)}
        rows2 = {"FRN-045": make_row(item_code="FRN-045", quantity=48.0)}
        ok, discrepancies = level1_exact_match(rows1, rows2)
        assert ok is False
        assert any(d["type"] == "quantity_mismatch" for d in discrepancies)

    def test_missing_in_doc2(self, make_row):
        # description="" → embedding fallback skippato (nessuna chiamata OpenAI)
        rows1 = {
            "FRN-045": make_row(item_code="FRN-045", quantity=50.0),
            "FRN-078": make_row(item_code="FRN-078", description="", quantity=22.0),
        }
        rows2 = {
            "FRN-045": make_row(item_code="FRN-045", quantity=50.0),
        }
        ok, discrepancies = level1_exact_match(rows1, rows2)
        assert ok is False
        missing = [d for d in discrepancies if d["type"] == "missing_in_doc2"]
        assert len(missing) == 1
        assert missing[0]["severity"] == "error"

    def test_extra_in_doc2(self, make_row):
        rows1 = {"FRN-045": make_row(item_code="FRN-045", quantity=50.0)}
        rows2 = {
            "FRN-045": make_row(item_code="FRN-045", quantity=50.0),
            "LMP-901": make_row(item_code="LMP-901", description="", quantity=8.0),
        }
        ok, discrepancies = level1_exact_match(rows1, rows2)
        assert ok is False
        extra = [d for d in discrepancies if d["type"] == "extra_in_doc2"]
        assert len(extra) == 1
        assert extra[0]["severity"] == "warning"

    def test_fuzzy_item_code_gives_code_mismatch_not_missing(self, make_row):
        # "FRN-001" vs "FRN001": SequenceMatcher ratio ≈ 0.923 ≥ 0.9 → fuzzy match
        rows1 = {"FRN-001": make_row(item_code="FRN-001", quantity=10.0)}
        rows2 = {"FRN001": make_row(item_code="FRN001", quantity=10.0)}
        ok, discrepancies = level1_exact_match(rows1, rows2)
        types = [d["type"] for d in discrepancies]
        assert "missing_in_doc2" not in types
        assert "code_mismatch" in types
        code_disc = next(d for d in discrepancies if d["type"] == "code_mismatch")
        assert code_disc["severity"] == "warning"

    def test_empty_dicts_is_perfect_match(self, make_row):
        ok, discrepancies = level1_exact_match({}, {})
        assert ok is True
        assert discrepancies == []

    def test_reordered_rows_still_match(self, make_row):
        # L1 usa dict → l'ordine non conta, i codici sì
        rows1 = {
            "FRN-001": make_row(quantity=2.0),
            "FRN-002": make_row(quantity=5.0),
        }
        rows2 = {
            "FRN-002": make_row(quantity=5.0),
            "FRN-001": make_row(quantity=2.0),
        }
        ok, discrepancies = level1_exact_match(rows1, rows2)
        assert ok is True


# ─── _fuzzy_find ──────────────────────────────────────────────────────────────

class TestFuzzyFind:
    def test_format_variant_matched(self):
        # "FRN-001" vs "FRN001": ratio ≈ 0.923 ≥ 0.9
        best, score = _fuzzy_find("FRN-001", {"FRN001", "FRN-002"})
        assert best == "FRN001"
        assert score >= 0.9

    def test_no_match_below_threshold(self):
        # "FRN-001" vs "FRN-002": ratio 0.857 < 0.9 → no match
        best, _ = _fuzzy_find("FRN-001", {"FRN-002", "FRN-003"})
        assert best is None

    def test_empty_candidates(self):
        best, _ = _fuzzy_find("FRN-001", set())
        assert best is None
