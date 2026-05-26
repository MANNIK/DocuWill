import pytest
from routers.csv_parser import parse_number, read_raw_file, rows_to_text


class TestParseNumber:
    def test_european_format(self):
        assert parse_number("1.234,56") == pytest.approx(1234.56)

    def test_us_format(self):
        assert parse_number("1,234.56") == pytest.approx(1234.56)

    def test_simple_integer(self):
        assert parse_number("42") == pytest.approx(42.0)

    def test_euro_symbol(self):
        assert parse_number("€ 15,00") == pytest.approx(15.0)

    def test_empty_returns_none(self):
        assert parse_number("") is None

    def test_dash_returns_none(self):
        assert parse_number("-") is None

    def test_na_returns_none(self):
        assert parse_number("N/A") is None

    def test_comma_as_decimal_separator(self):
        # "15,5" → 1 cifra dopo la virgola → decimale → 15.5
        assert parse_number("15,5") == pytest.approx(15.5)

    def test_comma_as_thousands_separator(self):
        # "1,500" → 3 cifre dopo la virgola → migliaia → 1500.0
        assert parse_number("1,500") == pytest.approx(1500.0)

    def test_zero(self):
        assert parse_number("0") == pytest.approx(0.0)

    def test_negative(self):
        assert parse_number("-15.50") == pytest.approx(-15.5)


class TestReadRawFile:
    def test_csv_semicolon_separator(self):
        content = b"codice;descrizione;qta\nFRN-001;Sedia;10\nFRN-002;Tavolo;5\n"
        sheets = read_raw_file(content, "test.csv")
        assert len(sheets) == 1
        rows = sheets[0]
        assert len(rows[0]) == 3
        assert rows[0][0] == "codice"
        assert rows[1][0] == "FRN-001"
        assert rows[1][2] == "10"

    def test_csv_comma_separator(self):
        content = b"item_code,description,quantity\nFRN-001,Chair,10\n"
        sheets = read_raw_file(content, "test.csv")
        rows = sheets[0]
        assert rows[0] == ["item_code", "description", "quantity"]
        assert rows[1][1] == "Chair"

    def test_empty_lines_excluded(self):
        content = b"a,b\n\n1,2\n\n3,4\n"
        sheets = read_raw_file(content, "test.csv")
        rows = sheets[0]
        assert len(rows) == 3  # header + 2 dati, righe vuote filtrate

    def test_latin1_encoding(self):
        # Simula file con caratteri latin-1 (accentati)
        content = "codice;fornitore\nFRN-001;Società Örsted\n".encode("latin-1")
        sheets = read_raw_file(content, "test.csv")
        rows = sheets[0]
        assert rows[0][1] == "fornitore"


class TestRowsToText:
    def test_basic_format(self):
        sheets = [[["FRN-001", "Sedia", "10"], ["FRN-002", "Tavolo", "5"]]]
        text = rows_to_text(sheets, max_rows_per_sheet=50)
        assert "Riga 0:" in text
        assert "FRN-001" in text
        assert "|" in text

    def test_single_sheet_no_sheet_header(self):
        sheets = [[["A", "1"]]]
        text = rows_to_text(sheets, max_rows_per_sheet=50)
        assert "--- SHEET" not in text

    def test_multiple_sheets_adds_sheet_header(self):
        sheets = [[["A", "1"]], [["B", "2"]]]
        text = rows_to_text(sheets, max_rows_per_sheet=50)
        assert "--- SHEET 1 ---" in text
        assert "--- SHEET 2 ---" in text

    def test_empty_rows_skipped(self):
        sheets = [[["FRN-001", "Sedia"], ["", ""], ["FRN-002", "Tavolo"]]]
        text = rows_to_text(sheets, max_rows_per_sheet=50)
        lines_with_data = [line for line in text.split("\n") if line.startswith("Riga")]
        assert len(lines_with_data) == 2
