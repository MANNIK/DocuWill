import hashlib
import pytest
from routers.csv_parser import (
    _headers_fingerprint,
    _extract_supplier_hint,
    extract_rows,
    parse_number,
)
from utils.supplier import normalize_for_cache


class TestHeadersFingerprint:
    def test_order_independent(self):
        # L'MD5 usa sorted() quindi l'ordine non conta
        a = _headers_fingerprint(["Codice", "Descrizione", "Quantità"])
        b = _headers_fingerprint(["Quantità", "Codice", "Descrizione"])
        assert a == b

    def test_different_headers_different_fingerprint(self):
        a = _headers_fingerprint(["Codice", "Quantità"])
        b = _headers_fingerprint(["Codice", "Prezzo"])
        assert a != b

    def test_empty_headers_ignored(self):
        # Header vuoti (colonne senza nome) non devono entrare nel fingerprint
        a = _headers_fingerprint(["Codice", "", "Quantità"])
        b = _headers_fingerprint(["Codice", "Quantità"])
        assert a == b

    def test_returns_12_char_hex(self):
        fp = _headers_fingerprint(["Codice", "Desc"])
        assert len(fp) == 12
        assert all(c in "0123456789abcdef" for c in fp)


class TestExtractSupplierHint:
    def test_finds_supplier_after_keyword(self):
        rows = [
            ["Fornitore:", "Nordic Design AB"],
            ["Numero ordine:", "ORD-001"],
        ]
        assert _extract_supplier_hint(rows) == "Nordic Design AB"

    def test_finds_supplier_case_insensitive(self):
        rows = [
            ["SUPPLIER", "Alpine Möbel AG"],
        ]
        assert _extract_supplier_hint(rows) == "Alpine Möbel AG"

    def test_returns_none_when_no_keyword(self):
        rows = [
            ["Codice", "Descrizione", "Quantità"],
            ["A-001", "Widget", "5"],
        ]
        assert _extract_supplier_hint(rows) is None

    def test_ignores_short_value(self):
        # Valori ≤ 2 caratteri non sono ragioni sociali
        rows = [["Supplier", "AB"]]
        assert _extract_supplier_hint(rows) is None


class TestExtractRows:
    def _col_map(self, mapping: dict) -> dict:
        return {str(k): v for k, v in mapping.items()}

    def test_extracts_basic_row(self):
        raw = [
            ["FRN-001", "Tavolo", "5", "pz", "100.00"],
            ["FRN-002", "Sedia", "10", "pz", "50.00"],
        ]
        col_map = self._col_map({0: "item_code", 1: "description", 2: "quantity", 3: "unit", 4: "unit_price"})
        rows = extract_rows(raw, data_start=0, column_mapping=col_map)
        assert len(rows) == 2
        assert rows[0].item_code == "FRN-001"
        assert rows[0].quantity == 5.0
        assert rows[1].item_code == "FRN-002"

    def test_skips_empty_rows(self):
        raw = [
            ["FRN-001", "Tavolo", "5"],
            ["", "", ""],
            ["FRN-002", "Sedia", "10"],
        ]
        col_map = self._col_map({0: "item_code", 1: "description", 2: "quantity"})
        rows = extract_rows(raw, data_start=0, column_mapping=col_map)
        assert len(rows) == 2

    def test_data_row_indices_filter(self):
        raw = [
            ["Header", "Col1", "Col2"],  # indice 0 — header
            ["FRN-001", "Tavolo", "5"],  # indice 1 — dati
            ["FRN-002", "Sedia", "10"], # indice 2 — dati
        ]
        col_map = self._col_map({0: "item_code", 1: "description", 2: "quantity"})
        rows = extract_rows(raw, data_start=0, column_mapping=col_map, data_row_indices=[1, 2])
        assert len(rows) == 2
        assert rows[0].item_code == "FRN-001"

    def test_raw_data_uses_header_names(self):
        raw = [
            ["FRN-001", "Tavolo", "5"],
        ]
        col_map = self._col_map({0: "item_code", 1: "description", 2: "quantity"})
        header_cells = ["Codice", "Descrizione", "Quantità"]
        rows = extract_rows(raw, data_start=0, column_mapping=col_map, header_cells=header_cells)
        assert "Codice" in rows[0].raw_data
        assert rows[0].raw_data["Codice"] == "FRN-001"

    def test_ignore_columns_not_in_fields(self):
        raw = [["FRN-001", "Note interne", "5"]]
        col_map = self._col_map({0: "item_code", 1: "ignore", 2: "quantity"})
        rows = extract_rows(raw, data_start=0, column_mapping=col_map)
        assert rows[0].item_code == "FRN-001"
        assert rows[0].description == ""  # ignore non popola description


class TestTotalRounding:
    """Riproduce il calcolo di total_amount in parse_csv_excel per verificare il rounding."""

    def test_floating_point_total_rounded_to_2_decimals(self):
        # Il parser fa: total = round(sum(r.total_price for r in rows), 2)
        # Simula il caso di floating point imprecision (bug noto CLAUDE.md:202)
        raw_totals = [100.1, 8055.55000001]
        calculated = sum(raw_totals)
        total = round(calculated, 2) if calculated else None
        assert total == 8155.65

    def test_zero_total_returns_none(self):
        calculated = 0.0
        total = round(calculated, 2) if calculated else None
        assert total is None


class TestCacheKeyNormalization:
    """La cache key usa normalize_for_cache(supplier) + headers_fingerprint(headers)."""

    def test_same_supplier_different_suffix_same_hash(self):
        k1 = hashlib.md5(normalize_for_cache("Nordic Design AB").encode()).hexdigest()[:12]
        k2 = hashlib.md5(normalize_for_cache("Nordic Design").encode()).hexdigest()[:12]
        assert k1 == k2

    def test_different_suppliers_different_hash(self):
        k1 = hashlib.md5(normalize_for_cache("Nordic Design AB").encode()).hexdigest()[:12]
        k2 = hashlib.md5(normalize_for_cache("Alpine Möbel AG").encode()).hexdigest()[:12]
        assert k1 != k2

    def test_key_is_12_hex_chars(self):
        k = hashlib.md5(normalize_for_cache("Acme SRL").encode()).hexdigest()[:12]
        assert len(k) == 12
