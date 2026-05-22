#!/usr/bin/env python3
from __future__ import annotations
"""
WeWill Test Agent
=================
Testa in modo approfondito il sistema di riconciliazione documenti.
Carica tutti i file di test, verifica le estrazioni, controlla le riconciliazioni.

Utilizzo:
    pip install httpx openai rich
    python scripts/test_agent.py [opzioni]

Opzioni:
    --reset           Pulisce il DB prima di iniziare
    --skip-generated  Salta i file generated/ (solo file challenge originali)
    --skip-ai         Salta l'analisi GPT-4o finale
    --verbose         Mostra tutti i dettagli di ogni documento
    --api-url URL     URL API (default: http://localhost:8000)
    --username USER   Username (default: admin)
    --password PASS   Password (default: admin123)
    --test-dir DIR    Cartella test (default: ~/Desktop/TEST PER QUORO/tests)
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from openai import OpenAI
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich import print as rprint

console = Console()

# ─── Configurazione ────────────────────────────────────────────────────────────

API_URL = os.environ.get("WEWILL_API_URL", "http://localhost:8000")
USERNAME = os.environ.get("WEWILL_USERNAME", "admin")
PASSWORD = os.environ.get("WEWILL_PASSWORD", "admin123")
DEFAULT_TEST_DIR = Path.home() / "Desktop" / "TEST PER QUORO" / "tests"

CSV_EXTENSIONS = {".csv", ".xlsx", ".xls"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# ─── Risultati attesi ──────────────────────────────────────────────────────────

EXPECTED_DOCS: dict[str, dict] = {
    "01-simple-order.csv": {
        "count": 1,
        "docs": [{"doc_type": "order", "min_rows": 4, "max_rows": 7,
                  "codes_sample": ["FRN-001", "FRN-045"]}],
    },
    "02-european-invoice.csv": {
        "count": 1,
        "docs": [{"doc_type": "invoice", "min_rows": 3, "max_rows": 6}],
    },
    "03-header-offset.csv": {
        "count": 1,
        "docs": [{"doc_type": "order", "supplier_contains": "Nordic Design",
                  "min_rows": 2, "max_rows": 5}],
    },
    "04-multi-table.csv": {
        "count": 2,
        "docs": [
            {"supplier_contains": "Nordic Design", "min_rows": 2},
            {"supplier_contains": "Alpine", "min_rows": 2,
             "codes_sample": ["ALP-843", "ALP-574", "ALP-114"]},
        ],
    },
    "05-multi-sheet.xlsx": {
        "count": 3,
        "docs": [{"min_rows": 6}, {"min_rows": 1}, {"min_rows": 1}],
    },
    "06-dirty-data.csv": {
        "count": 1,
        "docs": [{"supplier_contains": "Acme", "min_rows": 3}],
    },
    "07-nested-packing.csv": {
        "count": 2,
        "docs": [
            {"doc_type": "packing_list", "min_rows": 4,
             "codes_sample": ["ALP-843", "ALP-574", "ALP-114"]},
            {"doc_type": "packing_list", "min_rows": 2,
             "codes_sample": ["ALP-867", "ALP-507"]},
        ],
    },
    "09-shipping-tariff.csv": {
        "count": 4,
        "docs": [
            {"doc_type": "price_list", "min_rows": 6},
            {"doc_type": "price_list", "min_rows": 6},
            {"doc_type": "price_list", "min_rows": 6},
            {"doc_type": "price_list", "min_rows": 5},
        ],
    },
}

EXPECTED_RECONCILIATIONS = [
    {
        "files": ("04-multi-table.csv", "07-nested-packing.csv"),
        "description": "Ordine Alpine Möbel ↔ Packing List DL-7741",
        "expected_errors_min": 1,
        "expected_discrepancy_types": ["quantity_mismatch"],
        "expected_status": "pending",
    },
    {
        "files": ("p1-order-perfect.csv", "p1-invoice-perfect.csv"),
        "description": "Match perfetto → auto-approvato",
        "expected_errors_min": 0,
        "expected_errors_max": 0,
        "expected_status": "approved",
    },
    {
        "files": ("p2-order-mismatch.csv", "p2-invoice-mismatch.csv"),
        "description": "BD-220 prezzo + BD-221 quantità",
        "expected_errors_min": 2,
        "expected_status": "pending",
    },
    {
        "files": ("p3-order-missing-row.csv", "p3-ddt-missing-row.csv"),
        "description": "GT-A04 non consegnato",
        "expected_errors_min": 1,
        "expected_status": "pending",
    },
    {
        "files": ("p4-order-fuzzy.csv", "p4-confirm-fuzzy.csv"),
        "description": "Fuzzy match DM-001↔DM001 → auto-approvato",
        "expected_errors_min": 0,
        "expected_errors_max": 0,
        "expected_warnings_min": 3,
        "expected_status": "approved",
    },
    {
        "files": ("p5-tariff-nonstandard.csv", "p5-confirm-nonstandard.csv"),
        "description": "Prezzo diverso Centro Italia",
        "expected_errors_min": 1,
        "expected_status": "pending",
    },
]


# ─── Dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class TestResult:
    passed: int = 0
    warnings: int = 0
    failed: int = 0
    issues: list[str] = field(default_factory=list)

    def ok(self, msg: str):
        self.passed += 1
        console.print(f"    [green]✓[/green] {msg}")

    def warn(self, msg: str):
        self.warnings += 1
        self.issues.append(f"⚠ {msg}")
        console.print(f"    [yellow]⚠[/yellow] {msg}")

    def fail(self, msg: str):
        self.failed += 1
        self.issues.append(f"✗ {msg}")
        console.print(f"    [red]✗[/red] {msg}")

    @property
    def total(self):
        return self.passed + self.warnings + self.failed


# ─── Client API ───────────────────────────────────────────────────────────────

class APIClient:
    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.token: str | None = None
        self.client = httpx.Client(timeout=180)

    def authenticate(self) -> bool:
        try:
            r = self.client.post(f"{self.base_url}/api/auth/token/",
                                 json={"username": self.username, "password": self.password})
            if r.status_code == 200:
                self.token = r.json()["access"]
                return True
            console.print(f"[red]Auth fallita: {r.status_code} {r.text[:100]}[/red]")
            return False
        except Exception as e:
            console.print(f"[red]Auth errore: {e}[/red]")
            return False

    @property
    def headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def reset(self):
        self.client.post(f"{self.base_url}/api/dev/reset/", headers=self.headers)

    def upload_csv(self, path: Path) -> dict | None:
        with open(path, "rb") as f:
            r = self.client.post(f"{self.base_url}/api/documents/upload/",
                                 files={"file": (path.name, f)},
                                 headers=self.headers)
        return r.json() if r.status_code in (200, 201, 202) else None

    def upload_image(self, path: Path) -> dict | None:
        with open(path, "rb") as f:
            r = self.client.post(f"{self.base_url}/api/documents/upload-image/",
                                 files={"file": (path.name, f)},
                                 headers=self.headers)
        return r.json() if r.status_code in (200, 201, 202) else None

    def get_document(self, doc_id: int) -> dict:
        r = self.client.get(f"{self.base_url}/api/documents/{doc_id}/",
                            headers=self.headers)
        return r.json()

    def get_documents(self) -> list[dict]:
        r = self.client.get(f"{self.base_url}/api/documents/", headers=self.headers)
        return r.json() if r.status_code == 200 else []

    def get_reconciliations(self) -> list[dict]:
        r = self.client.get(f"{self.base_url}/api/reconciliations/", headers=self.headers)
        return r.json() if r.status_code == 200 else []

    def wait_for_docs(self, doc_ids: list[int], timeout: int = 180) -> list[dict]:
        """Aspetta che tutti i documenti siano elaborati (non pending)."""
        start = time.time()
        pending = set(doc_ids)
        results = {}
        while pending and (time.time() - start) < timeout:
            still_pending = set()
            for doc_id in pending:
                doc = self.get_document(doc_id)
                if doc.get("status") == "pending":
                    still_pending.add(doc_id)
                else:
                    results[doc_id] = doc
            pending = still_pending
            if pending:
                time.sleep(3)
        # Aggiungi eventuali timeout
        for doc_id in pending:
            results[doc_id] = {"id": doc_id, "status": "timeout", "original_filename": "?"}
        return list(results.values())


# ─── AGENTE 1: Ingestion ──────────────────────────────────────────────────────

class IngestionAgent:
    def __init__(self, api: APIClient, test_dir: Path, include_generated: bool,
                 include_images: bool, verbose: bool):
        self.api = api
        self.test_dir = test_dir
        self.include_generated = include_generated
        self.include_images = include_images
        self.verbose = verbose

    def run(self) -> tuple[dict[str, list[dict]], TestResult]:
        """
        Carica tutti i file e aspetta l'elaborazione.
        Ritorna: {filename: [docs]}, TestResult
        """
        console.print(Panel("[bold cyan]AGENTE 1 — Ingestion[/bold cyan]", expand=False))
        result = TestResult()
        uploaded: dict[str, list[int]] = {}  # filename → [doc_ids]

        # Raccogli file
        csv_files = sorted([f for f in self.test_dir.glob("*.csv")
                            if "copia" not in f.name.lower() and f.name != ".DS_Store"])
        xlsx_files = sorted(self.test_dir.glob("*.xlsx"))

        gen_dir = self.test_dir / "generated"
        generated_files = []
        if self.include_generated and gen_dir.exists():
            generated_files = sorted(gen_dir.glob("*.csv"))

        image_files = []
        if self.include_images:
            img_dir = self.test_dir / "files"
            if img_dir.exists():
                image_files = sorted([f for f in img_dir.iterdir()
                                      if f.suffix.lower() in IMAGE_EXTENSIONS])

        all_csv = csv_files + xlsx_files + generated_files
        console.print(f"  File da caricare: {len(all_csv)} CSV/Excel, {len(image_files)} immagini\n")

        # Upload CSV/Excel
        for path in all_csv:
            t0 = time.time()
            doc = self.api.upload_csv(path)
            if doc:
                doc_id = doc["id"]
                fname = path.name
                if fname not in uploaded:
                    uploaded[fname] = []
                uploaded[fname].append(doc_id)
                console.print(f"  [dim]↑ {fname} (id={doc_id})[/dim]")
            else:
                result.fail(f"Upload fallito: {path.name}")

        # Upload immagini
        for path in image_files:
            doc = self.api.upload_image(path)
            if doc:
                uploaded[path.name] = [doc["id"]]
            else:
                result.fail(f"Upload immagine fallito: {path.name}")

        if not uploaded:
            result.fail("Nessun file caricato")
            return {}, result

        # Aspetta elaborazione
        all_ids = [doc_id for ids in uploaded.values() for doc_id in ids]
        console.print(f"\n  [dim]Aspetto elaborazione di {len(all_ids)} documenti...[/dim]")
        all_docs = self.api.wait_for_docs(all_ids, timeout=300)

        # Raggruppa per filename e verifica status
        docs_by_file: dict[str, list[dict]] = {}

        # Ricollega doc_id → filename
        id_to_fname = {doc_id: fname for fname, ids in uploaded.items() for doc_id in ids}

        for doc in all_docs:
            fname = id_to_fname.get(doc["id"], doc.get("original_filename", "unknown"))
            if fname not in docs_by_file:
                docs_by_file[fname] = []
            docs_by_file[fname].append(doc)

        # Report per file
        console.print()
        for fname, docs in sorted(docs_by_file.items()):
            errors = [d for d in docs if d.get("status") == "error"]
            timeouts = [d for d in docs if d.get("status") == "timeout"]
            ok_docs = [d for d in docs if d.get("status") == "processed"]

            if timeouts:
                result.fail(f"{fname}: timeout elaborazione")
            elif errors:
                msg = errors[0].get("error_message", "")[:80]
                result.fail(f"{fname}: errore — {msg}")
            else:
                elapsed = ""
                result.ok(f"{fname}: {len(ok_docs)} doc elaborati")
                if self.verbose:
                    for d in ok_docs:
                        rows = len(d.get("rows", []))
                        console.print(f"      [{d['doc_type']}] {d.get('supplier_name','—')} "
                                      f"| {rows} righe | {d.get('document_number','—')}")

        return docs_by_file, result


# ─── AGENTE 2: Validation ─────────────────────────────────────────────────────

class ValidationAgent:
    def __init__(self, verbose: bool):
        self.verbose = verbose

    def run(self, docs_by_file: dict[str, list[dict]]) -> TestResult:
        console.print(Panel("[bold cyan]AGENTE 2 — Validation[/bold cyan]", expand=False))
        result = TestResult()

        for fname, expected_cfg in EXPECTED_DOCS.items():
            if fname not in docs_by_file:
                result.warn(f"{fname}: non caricato, skip")
                continue

            docs = docs_by_file[fname]
            processed = [d for d in docs if d.get("status") == "processed"]

            # Verifica numero sezioni
            expected_count = expected_cfg["count"]
            if len(processed) < expected_count:
                result.fail(f"{fname}: attese {expected_count} sezioni, trovate {len(processed)}")
                continue
            elif len(processed) > expected_count + 1:
                result.warn(f"{fname}: {len(processed)} sezioni (attese ~{expected_count})")
            else:
                issues_found = False
                for i, exp_doc in enumerate(expected_cfg.get("docs", [])):
                    if i >= len(processed):
                        break
                    doc = processed[i]
                    rows = doc.get("rows", [])
                    codes = [r["item_code"] for r in rows if r.get("item_code")]

                    # doc_type
                    if "doc_type" in exp_doc and doc.get("doc_type") != exp_doc["doc_type"]:
                        result.warn(f"{fname}[{i}]: doc_type '{doc.get('doc_type')}' "
                                    f"(atteso '{exp_doc['doc_type']}')")
                        issues_found = True

                    # righe
                    min_r = exp_doc.get("min_rows", 0)
                    max_r = exp_doc.get("max_rows", 9999)
                    if len(rows) < min_r:
                        result.fail(f"{fname}[{i}]: {len(rows)} righe (attese ≥{min_r})")
                        issues_found = True
                    elif len(rows) > max_r:
                        result.warn(f"{fname}[{i}]: {len(rows)} righe (attese ≤{max_r})")
                        issues_found = True

                    # supplier
                    if "supplier_contains" in exp_doc:
                        sup = doc.get("supplier_name", "")
                        if exp_doc["supplier_contains"].lower() not in sup.lower():
                            result.warn(f"{fname}[{i}]: supplier '{sup}' "
                                        f"(atteso contenga '{exp_doc['supplier_contains']}')")
                            issues_found = True

                    # item codes campione
                    for expected_code in exp_doc.get("codes_sample", []):
                        if expected_code not in codes:
                            result.warn(f"{fname}[{i}]: codice '{expected_code}' non trovato "
                                        f"(trovati: {codes[:5]})")
                            issues_found = True

                    # righe con quantità negative o zero
                    bad_qty = [r for r in rows
                               if r.get("quantity") is not None and float(r["quantity"]) <= 0]
                    if bad_qty:
                        result.warn(f"{fname}[{i}]: {len(bad_qty)} righe con quantità ≤0")
                        issues_found = True

                if not issues_found:
                    result.ok(f"{fname}: {len(processed)} sezioni validate ✓")

        # Verifica errori generici (documenti in error status)
        all_error_docs = []
        for fname, docs in docs_by_file.items():
            if fname not in EXPECTED_DOCS:
                for doc in docs:
                    if doc.get("status") == "processed":
                        rows = len(doc.get("rows", []))
                        if self.verbose:
                            result.ok(f"{fname}: {doc.get('doc_type','?')} "
                                      f"| {rows}r | {doc.get('supplier_name','—')}")
                    elif doc.get("status") == "error":
                        result.fail(f"{fname}: ERROR — {doc.get('error_message','')[:60]}")

        return result


# ─── AGENTE 3: Reconciliation ─────────────────────────────────────────────────

class ReconciliationAgent:
    def __init__(self, api: APIClient, verbose: bool):
        self.api = api
        self.verbose = verbose

    def run(self) -> TestResult:
        console.print(Panel("[bold cyan]AGENTE 3 — Reconciliation[/bold cyan]", expand=False))
        result = TestResult()

        reconciliations = self.api.get_reconciliations()
        console.print(f"  Riconciliazioni trovate nel DB: {len(reconciliations)}\n")

        if not reconciliations:
            result.warn("Nessuna riconciliazione trovata — alcune coppie potrebbero non aver matchato")

        # Indicizza per file
        def filenames_of(rec: dict) -> set[str]:
            return {rec["doc1"]["original_filename"], rec["doc2"]["original_filename"]}

        for exp in EXPECTED_RECONCILIATIONS:
            target_files = set(exp["files"])
            # Cerca riconciliazione con questi file
            matching = [r for r in reconciliations if filenames_of(r) == target_files]

            if not matching:
                result.fail(f"Riconciliazione MANCANTE: {exp['description']} "
                            f"({' ↔ '.join(exp['files'])})")
                continue

            rec = matching[0]
            disc = rec.get("discrepancy_list", [])
            errors = [d for d in disc if d["severity"] == "error"]
            warnings = [d for d in disc if d["severity"] == "warning"]
            status = rec.get("status", "")

            issues = []

            # Controlla errori attesi
            if "expected_errors_min" in exp:
                if len(errors) < exp["expected_errors_min"]:
                    issues.append(f"{len(errors)} errori (attesi ≥{exp['expected_errors_min']})")
            if "expected_errors_max" in exp:
                if len(errors) > exp["expected_errors_max"]:
                    issues.append(f"{len(errors)} errori (attesi ≤{exp['expected_errors_max']})")

            # Controlla warning attesi
            if "expected_warnings_min" in exp:
                if len(warnings) < exp["expected_warnings_min"]:
                    issues.append(f"{len(warnings)} warning (attesi ≥{exp['expected_warnings_min']})")

            # Controlla status
            if "expected_status" in exp and status != exp["expected_status"]:
                issues.append(f"status '{status}' (atteso '{exp['expected_status']}')")

            # Controlla tipo discrepanza
            if "expected_discrepancy_types" in exp:
                found_types = {d["discrepancy_type"] for d in disc}
                for t in exp["expected_discrepancy_types"]:
                    if t not in found_types:
                        issues.append(f"discrepanza '{t}' non trovata (trovate: {found_types})")

            if issues:
                result.fail(f"{exp['description']}: " + ", ".join(issues))
            else:
                result.ok(f"{exp['description']}: "
                          f"{len(errors)} err | {len(warnings)} warn | {status} ✓")

                if self.verbose:
                    for d in disc:
                        sev_color = "red" if d["severity"] == "error" else "yellow"
                        console.print(f"      [{sev_color}]{d['discrepancy_type']}[/{sev_color}] "
                                      f"{d['field_name']}: {d['value_doc1']} → {d['value_doc2']}")

        # Segnala riconciliazioni inattese (non nei expected)
        expected_file_pairs = [set(e["files"]) for e in EXPECTED_RECONCILIATIONS]
        unexpected = [r for r in reconciliations if filenames_of(r) not in expected_file_pairs]
        if unexpected:
            result.warn(f"{len(unexpected)} riconciliazioni non previste:")
            for r in unexpected[:5]:
                console.print(f"    [dim]{r['doc1']['original_filename']} ↔ "
                               f"{r['doc2']['original_filename']}[/dim]")

        return result


# ─── AGENTE AI: Analisi GPT-4o ────────────────────────────────────────────────

class AIAnalysisAgent:
    def __init__(self):
        api_key = os.environ.get("OPENAI_API_KEY")
        self.client = OpenAI(api_key=api_key) if api_key else None

    def run(self, all_issues: list[str], docs_summary: list[dict]) -> str | None:
        if not self.client:
            return "OPENAI_API_KEY non configurata — analisi AI saltata."
        if not all_issues:
            return "Nessuna anomalia trovata — sistema funzionante correttamente."

        console.print(Panel("[bold cyan]AGENTE AI — Analisi GPT-4o[/bold cyan]", expand=False))

        prompt = f"""Sei un esperto di sistemi di riconciliazione documenti aziendali.
Analizza questi problemi trovati durante i test automatici del sistema WeWill:

PROBLEMI TROVATI:
{chr(10).join(f"- {issue}" for issue in all_issues)}

RIEPILOGO DOCUMENTI ELABORATI:
{json.dumps(docs_summary[:20], indent=2, ensure_ascii=False)}

Per ogni problema:
1. Spiega la probabile causa tecnica
2. Indica se è un bug del sistema o un comportamento atteso
3. Suggerisci come migliorare il sistema

Sii conciso e diretto (max 300 parole). Usa italiano."""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Errore analisi AI: {e}"


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="WeWill Test Agent")
    parser.add_argument("--reset", action="store_true", help="Pulisce il DB prima di iniziare")
    parser.add_argument("--skip-generated", action="store_true", help="Salta file generated/")
    parser.add_argument("--skip-images", action="store_true", help="Salta upload immagini OCR")
    parser.add_argument("--skip-ai", action="store_true", help="Salta analisi GPT-4o")
    parser.add_argument("--verbose", action="store_true", help="Mostra tutti i dettagli")
    parser.add_argument("--api-url", default=API_URL)
    parser.add_argument("--username", default=USERNAME)
    parser.add_argument("--password", default=PASSWORD)
    parser.add_argument("--test-dir", default=str(DEFAULT_TEST_DIR))
    args = parser.parse_args()

    test_dir = Path(args.test_dir)
    if not test_dir.exists():
        console.print(f"[red]Cartella test non trovata: {test_dir}[/red]")
        sys.exit(1)

    console.print(Panel(
        "[bold white]WeWill Document Reconciliation — Test Agent[/bold white]\n"
        f"API: {args.api_url}  |  Test dir: {test_dir}",
        style="blue"
    ))

    # Auth
    api = APIClient(args.api_url, args.username, args.password)
    console.print(f"\n[dim]Autenticazione come '{args.username}'...[/dim]")
    if not api.authenticate():
        console.print("[red]Autenticazione fallita. Verifica credenziali e che il server sia attivo.[/red]")
        sys.exit(1)
    console.print(f"[green]✓ Autenticato[/green]\n")

    # Reset opzionale
    if args.reset:
        console.print("[dim]Reset DB...[/dim]")
        api.reset()
        console.print("[green]✓ DB pulito[/green]\n")

    # AGENTE 1
    ingestion = IngestionAgent(
        api=api,
        test_dir=test_dir,
        include_generated=not args.skip_generated,
        include_images=not args.skip_images,
        verbose=args.verbose,
    )
    docs_by_file, r1 = ingestion.run()
    console.print()

    # AGENTE 2
    validator = ValidationAgent(verbose=args.verbose)
    r2 = validator.run(docs_by_file)
    console.print()

    # Attendi che le riconciliazioni siano create (potrebbero richiedere ancora qualche secondo)
    console.print("[dim]Attendo completamento riconciliazioni...[/dim]")
    time.sleep(5)

    # AGENTE 3
    reconciler = ReconciliationAgent(api=api, verbose=args.verbose)
    r3 = reconciler.run()
    console.print()

    # Raccogli tutti i problemi per l'analisi AI
    all_issues = r1.issues + r2.issues + r3.issues
    docs_summary = [
        {
            "file": fname,
            "count": len(docs),
            "types": [d.get("doc_type") for d in docs],
            "statuses": [d.get("status") for d in docs],
        }
        for fname, docs in docs_by_file.items()
    ]

    # AGENTE AI
    ai_report = None
    if not args.skip_ai:
        ai_agent = AIAnalysisAgent()
        ai_report = ai_agent.run(all_issues, docs_summary)
        if ai_report:
            console.print(Panel(ai_report, title="[cyan]Analisi AI[/cyan]", expand=False))
        console.print()

    # ─── Summary finale ───────────────────────────────────────────────────────
    total_passed = r1.passed + r2.passed + r3.passed
    total_warnings = r1.warnings + r2.warnings + r3.warnings
    total_failed = r1.failed + r2.failed + r3.failed

    table = Table(title="Summary", show_header=True, header_style="bold")
    table.add_column("Agente")
    table.add_column("✅ Passed", style="green", justify="right")
    table.add_column("⚠️  Warnings", style="yellow", justify="right")
    table.add_column("❌ Failed", style="red", justify="right")
    table.add_row("Ingestion", str(r1.passed), str(r1.warnings), str(r1.failed))
    table.add_row("Validation", str(r2.passed), str(r2.warnings), str(r2.failed))
    table.add_row("Reconciliation", str(r3.passed), str(r3.warnings), str(r3.failed))
    table.add_section()
    table.add_row("[bold]TOTALE[/bold]",
                  f"[bold green]{total_passed}[/bold green]",
                  f"[bold yellow]{total_warnings}[/bold yellow]",
                  f"[bold red]{total_failed}[/bold red]")
    console.print(table)

    if total_failed == 0 and total_warnings == 0:
        console.print("\n[bold green]🎉 TUTTI I TEST PASSATI[/bold green]")
    elif total_failed == 0:
        console.print(f"\n[bold yellow]⚠ {total_warnings} warning — nessun failure critico[/bold yellow]")
    else:
        console.print(f"\n[bold red]❌ {total_failed} failure, {total_warnings} warning[/bold red]")
        if all_issues:
            console.print("\n[bold]Problemi trovati:[/bold]")
            for issue in all_issues:
                console.print(f"  {issue}")

    sys.exit(0 if total_failed == 0 else 1)


if __name__ == "__main__":
    main()
