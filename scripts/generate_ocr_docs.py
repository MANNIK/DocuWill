#!/usr/bin/env python3
"""
Genera 3 coppie di documenti HTML italiani realistici per testare il flusso OCR.

Ogni coppia: CSV (doc1) + documento cartaceo simulato (doc2) con discrepanze deliberate.
Le discrepanze coprono tutti i tipi gestiti dal sistema di riconciliazione.

Uso:
    python scripts/generate_ocr_docs.py

Output in: scripts/ocr_test_docs/
"""
from pathlib import Path

OUT = Path(__file__).parent / "ocr_test_docs"

CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
.page { max-width: 210mm; margin: 0 auto; padding: 20mm 18mm; }

/* Header aziendale */
.header { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid #1a3a5c; padding-bottom: 12px; margin-bottom: 16px; }
.company-info h1 { font-size: 18pt; font-weight: 900; color: #1a3a5c; letter-spacing: 1px; }
.company-info p { font-size: 9pt; color: #555; line-height: 1.5; margin-top: 4px; }
.doc-box { border: 2px solid #1a3a5c; padding: 10px 16px; text-align: center; min-width: 180px; }
.doc-box .doc-type { font-size: 13pt; font-weight: 700; color: #1a3a5c; text-transform: uppercase;
                     letter-spacing: 2px; }
.doc-box .doc-number { font-size: 12pt; font-weight: 600; margin-top: 4px; }
.doc-box .doc-date { font-size: 9pt; color: #555; margin-top: 2px; }

/* Sezione parti */
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
.party-box { border: 1px solid #ccc; padding: 10px 12px; border-radius: 3px; }
.party-box .label { font-size: 8pt; font-weight: 700; color: #888; text-transform: uppercase;
                    letter-spacing: 1px; margin-bottom: 4px; }
.party-box .name { font-size: 11pt; font-weight: 700; color: #1a1a1a; }
.party-box p { font-size: 9pt; color: #444; line-height: 1.5; margin-top: 2px; }

/* Riferimenti */
.refs { background: #f4f6f9; padding: 8px 12px; border-radius: 3px; margin-bottom: 16px;
        font-size: 9.5pt; display: flex; gap: 24px; flex-wrap: wrap; }
.refs span { color: #555; }
.refs strong { color: #1a1a1a; }

/* Tabella dati */
table { width: 100%; border-collapse: collapse; margin: 12px 0; }
thead tr { background: #1a3a5c; color: white; }
thead th { padding: 8px 10px; text-align: left; font-size: 9.5pt; font-weight: 600; }
tbody tr:nth-child(even) { background: #f8f9fb; }
tbody tr:hover { background: #eef1f6; }
tbody td { padding: 7px 10px; font-size: 10pt; border-bottom: 1px solid #e8e8e8; vertical-align: middle; }
.td-code { font-family: monospace; font-size: 9.5pt; font-weight: 600; color: #1a3a5c; }
.td-num { text-align: right; }
.td-total { text-align: right; font-weight: 600; }

/* Totali */
.totals { margin-left: auto; width: 280px; border-top: 2px solid #1a3a5c; margin-top: 8px; }
.totals tr td { padding: 5px 10px; font-size: 10pt; }
.totals tr:last-child td { font-weight: 700; font-size: 12pt; color: #1a3a5c;
                            border-top: 1px solid #ccc; padding-top: 8px; }

/* Note */
.notes { margin-top: 16px; padding: 10px 12px; border-left: 3px solid #1a3a5c;
         background: #f9fafb; font-size: 9.5pt; color: #444; }
.notes strong { color: #1a3a5c; }

/* Footer */
.footer { margin-top: 32px; display: flex; justify-content: space-between;
          align-items: flex-end; border-top: 1px solid #ccc; padding-top: 16px; }
.footer-info { font-size: 8.5pt; color: #666; line-height: 1.6; }
.stamp { width: 80px; height: 80px; border: 3px solid #1a3a5c; border-radius: 50%;
         display: flex; align-items: center; justify-content: center; text-align: center;
         color: #1a3a5c; font-size: 7pt; font-weight: 700; text-transform: uppercase;
         line-height: 1.3; padding: 8px; }
.signature { text-align: center; font-size: 9pt; color: #555; }
.signature-line { border-bottom: 1px solid #555; width: 120px; height: 30px; margin: 0 auto 4px; }

@media print { @page { size: A4; margin: 0; } .page { padding: 15mm 16mm; } }
"""


def html_page(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<style>
{CSS}
</style>
</head>
<body>
<div class="page">
{body}
</div>
</body>
</html>"""


def write(path: Path, content: str):
    path.write_text(content, encoding="utf-8")
    print(f"  Creato: {path.name}")


def try_generate_pdf(html_path: Path):
    try:
        from weasyprint import HTML
        pdf_path = html_path.with_suffix(".pdf")
        HTML(filename=str(html_path)).write_pdf(str(pdf_path))
        print(f"  PDF:    {pdf_path.name}")
    except ImportError:
        pass  # weasyprint non installato — solo HTML


# ─────────────────────────────────────────────────────────────────────────────
# COPPIA 1 — Nordic Design AB
# CSV (doc1): 03-header-offset.csv (ordine ORD-2026-W07)
# Documento (doc2): DDT con discrepanze deliberate
# ─────────────────────────────────────────────────────────────────────────────

def coppia1_ddt():
    body = """
<div class="header">
  <div class="company-info">
    <h1>NORDIC DESIGN AB</h1>
    <p>Industrigatan 14 · SE-211 21 Malmö · Sweden<br>
       VAT: SE556789012301 · Tel: +46 40 555 0123<br>
       Email: logistics@nordicdesign.se · nordicdesign.se</p>
  </div>
  <div class="doc-box">
    <div class="doc-type">DDT</div>
    <div class="doc-number">N. DDT-2026-0089</div>
    <div class="doc-date">Data: 15/02/2026</div>
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="label">Mittente / Expediteur</div>
    <div class="name">Nordic Design AB</div>
    <p>Industrigatan 14<br>SE-211 21 Malmö<br>Sweden</p>
    <p style="margin-top:6px;font-size:8.5pt;">VAT: SE556789012301</p>
  </div>
  <div class="party-box">
    <div class="label">Destinatario / Consignataire</div>
    <div class="name">Casa Bella Trading SRL</div>
    <p>Via Garibaldi 88<br>20121 Milano (MI)<br>Italy</p>
    <p style="margin-top:6px;font-size:8.5pt;">P.IVA: IT02341890157</p>
  </div>
</div>

<div class="refs">
  <span><strong>Rif. Ordine:</strong> ORD-2026-W07</span>
  <span><strong>Data Ordine:</strong> 09/02/2026</span>
  <span><strong>Vettore:</strong> DHL Freight</span>
  <span><strong>Modalità:</strong> DAP Milano</span>
  <span><strong>Colli totali:</strong> 14</span>
</div>

<table>
  <thead>
    <tr>
      <th>N.</th>
      <th>Codice Articolo</th>
      <th>Descrizione</th>
      <th>Finitura</th>
      <th class="td-num">Q.tà</th>
      <th>U.M.</th>
      <th>Note</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td class="td-code">FRN-045</td>
      <td>Tavolo multifunzione</td>
      <td>Bianco lucido</td>
      <td class="td-num"><strong>48</strong></td>
      <td>pz</td>
      <td>⚠ Q.tà modificata (v. note)</td>
    </tr>
    <tr>
      <td>2</td>
      <td class="td-code">FRN-112</td>
      <td>Armadio 1 anta</td>
      <td>Bianco opaco</td>
      <td class="td-num">34</td>
      <td>pz</td>
      <td></td>
    </tr>
    <tr>
      <td>3</td>
      <td class="td-code">LMP-901</td>
      <td>Lampada LED Stockholm</td>
      <td>Nero mat</td>
      <td class="td-num">8</td>
      <td>pz</td>
      <td>Aggiunto da ordine separato</td>
    </tr>
  </tbody>
</table>

<div class="notes">
  <strong>Note di spedizione:</strong> Articolo FRN-045 spedito in Q.tà 48 pz (2 pz in
  back-order, spedizione entro 15/03/2026). Articolo FRN-078 (Scrivania angolare) NON
  incluso in questa spedizione — in attesa di disponibilità magazzino. Articolo LMP-901
  aggiunto su richiesta cliente (rif. email del 12/02/2026).
</div>

<div class="footer">
  <div class="footer-info">
    Nordic Design AB · Reg. nr: 556789-0123 · Bankgiro: 123-4567<br>
    Documento generato il 15/02/2026 · Operatore: Lars Eriksson
  </div>
  <div class="signature">
    <div class="signature-line"></div>
    <span>Firma e timbro</span>
  </div>
  <div class="stamp">NORDIC<br>DESIGN AB<br>APPROVED</div>
</div>
"""
    return html_page("DDT Nordic Design AB — DDT-2026-0089", body)


DISCREPANZE_COPPIA1 = """# Discrepanze deliberate — Coppia 1

**CSV (doc1):** `03-header-offset.csv` — Ordine ORD-2026-W07, Nordic Design AB
**Documento (doc2):** `ddt-nordic-design.html` — DDT N. DDT-2026-0089

## Discrepanze attese dalla riconciliazione

| Tipo | Campo | Valore doc1 (CSV) | Valore doc2 (DDT) | Severità |
|------|-------|-------------------|-------------------|----------|
| `quantity_mismatch` | quantity | 50 (FRN-045) | 48 | error |
| `missing_in_doc2` | row | FRN-078 Scrivania angolare | assente | error |
| `extra_in_doc2` | row | assente | LMP-901 Lampada LED Stockholm | warning |
| `date_mismatch` | document_date | 09/02/2026 | 15/02/2026 | warning |

## Come testare

1. Aprire `ddt-nordic-design.html` nel browser
2. File > Stampa > Salva come PDF (oppure `Cmd+P` → "Salva come PDF")
3. Avviare il sistema: `docker compose up`
4. Dalla UI (http://localhost:3000):
   - Upload `03-header-offset.csv` nella zona **Doc 1 — File tabulare**
   - Attendere elaborazione (badge passa da "In elaborazione" a "Elaborato")
   - Upload PDF/screenshot del DDT nella zona **Doc 2 — Foto documento**
5. Aprire **Riconciliazioni** → selezionare la coppia Nordic Design
6. Verificare almeno 3 discrepanze: quantity_mismatch + missing + extra

## Suggerimento per lo screenshot

Per un test OCR più realistico, aprire il PDF su schermo intero e scattare
una foto con il cellulare leggermente inclinato (non perfettamente frontale).
"""


# ─────────────────────────────────────────────────────────────────────────────
# COPPIA 2 — Alpine Möbel / EUROPACK LOGISTICS
# CSV (doc1): 07-nested-packing.csv (packing list)
# Documento (doc2): Conferma d'ordine con discrepanze
# ─────────────────────────────────────────────────────────────────────────────

def coppia2_conferma():
    body = """
<div class="header">
  <div class="company-info">
    <h1>ALPINE MÖBEL AG</h1>
    <p>Bergstraße 22 · 6020 Innsbruck · Austria<br>
       UID: ATU45678901 · Tel: +43 512 555 0177<br>
       Email: orders@alpinemoebel.at · alpinemoebel.at</p>
  </div>
  <div class="doc-box">
    <div class="doc-type">Conferma d'Ordine</div>
    <div class="doc-number">N. CO-2026-0341</div>
    <div class="doc-date">Data: 05/03/2026</div>
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="label">Fornitore / Lieferant</div>
    <div class="name">Alpine Möbel AG</div>
    <p>Bergstraße 22<br>6020 Innsbruck<br>Austria</p>
    <p style="margin-top:6px;font-size:8.5pt;">UID: ATU45678901</p>
  </div>
  <div class="party-box">
    <div class="label">Acquirente / Käufer</div>
    <div class="name">EUROPACK LOGISTICS SRL</div>
    <p>Via della Spedizione 5<br>40128 Bologna (BO)<br>Italy</p>
    <p style="margin-top:6px;font-size:8.5pt;">P.IVA: IT08734120374</p>
  </div>
</div>

<div class="refs">
  <span><strong>Rif. Delivery Note:</strong> DL-7741 / DL-4469</span>
  <span><strong>Data consegna prev.:</strong> 09/03/2026 – 10/03/2026</span>
  <span><strong>Incoterm:</strong> FCA Innsbruck</span>
  <span><strong>Pagamento:</strong> 60 gg d.f.f.m.</span>
</div>

<table>
  <thead>
    <tr>
      <th>Cod. Ordine</th>
      <th>Codice Art.</th>
      <th>Descrizione</th>
      <th class="td-num">Q.tà Conf.</th>
      <th>U.M.</th>
      <th class="td-num">Prezzo Unit. €</th>
      <th class="td-num">Totale €</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>ORD-W11-01</td>
      <td class="td-code">ALP-843</td>
      <td>Armadio 2 ante scorrevoli</td>
      <td class="td-num"><strong>4</strong></td>
      <td>pz</td>
      <td class="td-num">285,00</td>
      <td class="td-total">1.140,00</td>
    </tr>
    <tr>
      <td>ORD-W11-01</td>
      <td class="td-code">ALP-574</td>
      <td>Comò 4 cassetti</td>
      <td class="td-num">14</td>
      <td>pz</td>
      <td class="td-num">195,00</td>
      <td class="td-total">2.730,00</td>
    </tr>
    <tr>
      <td>ORD-W11-02</td>
      <td class="td-code">ALP-114</td>
      <td>Comodino Legno di Pino Massiccio XL</td>
      <td class="td-num">6</td>
      <td>pz</td>
      <td class="td-num"><strong>87,50</strong></td>
      <td class="td-total">525,00</td>
    </tr>
    <tr>
      <td>ORD-W11-03</td>
      <td class="td-code">ALP-867</td>
      <td>Scaffale 180cm</td>
      <td class="td-num">8</td>
      <td>pz</td>
      <td class="td-num">145,00</td>
      <td class="td-total">1.160,00</td>
    </tr>
    <tr>
      <td>ORD-W11-03</td>
      <td class="td-code">ALP-507</td>
      <td>Scarpiera 3 ante</td>
      <td class="td-num">2</td>
      <td>pz</td>
      <td class="td-num">115,00</td>
      <td class="td-total">230,00</td>
    </tr>
  </tbody>
</table>

<table class="totals">
  <tr><td>Imponibile</td><td class="td-num">5.785,00 €</td></tr>
  <tr><td>IVA 22%</td><td class="td-num">1.272,70 €</td></tr>
  <tr><td>Totale</td><td class="td-num">7.057,70 €</td></tr>
</table>

<div class="notes">
  <strong>Condizioni di consegna:</strong> La quantità dell'articolo ALP-843 è stata
  confermata in 4 pz (disponibilità magazzino ridotta). Per la differenza di 2 pz
  contattare l'ufficio commerciale. Articolo ALP-114 (Comodino): nuovo prezzo unitario
  €87,50 (aggiornamento listino marzo 2026). Descrizione aggiornata con specifiche
  materiale.
</div>

<div class="footer">
  <div class="footer-info">
    Alpine Möbel AG · FN 123456a Handelsgericht Innsbruck<br>
    Bank: Raiffeisen Tirol · IBAN: AT12 3456 7890 1234 5678<br>
    Documento valido 30 giorni dalla data di emissione
  </div>
  <div class="signature">
    <div class="signature-line"></div>
    <span>Responsabile Vendite</span>
  </div>
  <div class="stamp">ALPINE<br>MÖBEL AG<br>CONFIRMED</div>
</div>
"""
    return html_page("Conferma Ordine Alpine Möbel — CO-2026-0341", body)


DISCREPANZE_COPPIA2 = """# Discrepanze deliberate — Coppia 2

**CSV (doc1):** `07-nested-packing.csv` — Packing List EUROPACK LOGISTICS, Alpine Möbel
**Documento (doc2):** `conferma-alpine.html` — Conferma d'Ordine CO-2026-0341

## Discrepanze attese dalla riconciliazione

| Tipo | Campo | Valore doc1 (CSV) | Valore doc2 (Conferma) | Severità |
|------|-------|-------------------|------------------------|----------|
| `quantity_mismatch` | quantity | 6 (ALP-843) | 4 | error |
| `price_mismatch` | unit_price | 82,00 (ALP-114) | 87,50 | error |
| `description_mismatch` | description | Comodino | Comodino Legno di Pino Massiccio XL | info |

## Come testare

1. Aprire `conferma-alpine.html` nel browser → Salva come PDF
2. Dalla UI: upload `07-nested-packing.csv` come Doc 1
3. Upload PDF/screenshot della conferma come Doc 2
4. Verificare in Riconciliazioni: 2-3 discrepanze

## Nota

Il CSV ha sub-items (maniglie, ripiani) sotto ALP-843 — il sistema dovrebbe ignorarli
(sono righe senza item_code e con description generica). La conferma ha solo le righe principali.
"""


# ─────────────────────────────────────────────────────────────────────────────
# COPPIA 3 — Acme Furniture
# CSV (doc1): 06-dirty-data.csv (listino prezzi Acme)
# Documento (doc2): Fattura proforma con discrepanze
# ─────────────────────────────────────────────────────────────────────────────

def coppia3_fattura():
    body = """
<div class="header">
  <div class="company-info">
    <h1>ACME FURNITURE S.R.L.</h1>
    <p>Via dell'Artigianato 12/B · 36100 Vicenza (VI)<br>
       P.IVA: IT03456789016 · C.F.: 03456789016<br>
       Tel: 0444 123456 · info@acmefurniture.it · www.acmefurniture.it</p>
  </div>
  <div class="doc-box">
    <div class="doc-type">Fattura Proforma</div>
    <div class="doc-number">N. FP-2026-0118</div>
    <div class="doc-date">Data: 01/04/2026</div>
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="label">Cedente / Prestatore</div>
    <div class="name">Acme Furniture S.r.l.</div>
    <p>Via dell'Artigianato 12/B<br>36100 Vicenza (VI)<br>Italy</p>
    <p style="margin-top:6px;font-size:8.5pt;">P.IVA: IT03456789016<br>
       Reg. Imp. VI · REA: VI-123456</p>
  </div>
  <div class="party-box">
    <div class="label">Cessionario / Committente</div>
    <div class="name">Casa Bella Trading SRL</div>
    <p>Via Garibaldi 88<br>20121 Milano (MI)<br>Italy</p>
    <p style="margin-top:6px;font-size:8.5pt;">P.IVA: IT02341890157</p>
  </div>
</div>

<div class="refs">
  <span><strong>Rif. Listino:</strong> Listino Prezzi Marzo 2026</span>
  <span><strong>Condizioni:</strong> Pagamento 30 gg d.f.m.</span>
  <span><strong>Valuta:</strong> EUR</span>
  <span><strong>Listino applicato:</strong> LP-2026-03</span>
</div>

<table>
  <thead>
    <tr>
      <th>Rif.</th>
      <th>Descrizione Articolo</th>
      <th class="td-num">Prezzo Listino €</th>
      <th class="td-num">Sconto %</th>
      <th class="td-num">Prezzo Netto €</th>
      <th>Note</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="td-code">A-001</td>
      <td>Tavolo pranzo 180cm</td>
      <td class="td-num">450,00</td>
      <td class="td-num"><strong>10%</strong></td>
      <td class="td-total"><strong>405,00</strong></td>
      <td>Sconto rimodulato</td>
    </tr>
    <tr>
      <td class="td-code">A-002</td>
      <td>Sedia ergonomica</td>
      <td class="td-num">—</td>
      <td class="td-num">0%</td>
      <td class="td-total">189,00</td>
      <td>Prezzo fisso</td>
    </tr>
    <tr>
      <td class="td-code">A-003</td>
      <td>Libreria modulare 5 ripiani</td>
      <td class="td-num">320,00</td>
      <td class="td-num"><strong>5%</strong></td>
      <td class="td-total">304,00</td>
      <td>Sconto aprile</td>
    </tr>
    <tr>
      <td class="td-code">B-001</td>
      <td>Lampada design</td>
      <td class="td-num">95,00</td>
      <td class="td-num">10%</td>
      <td class="td-total">85,50</td>
      <td></td>
    </tr>
    <tr>
      <td class="td-code">B-002</td>
      <td>Tappeto 200x300</td>
      <td class="td-num">180,00</td>
      <td class="td-num">0%</td>
      <td class="td-total">180,00</td>
      <td>Disponibile su ordine</td>
    </tr>
  </tbody>
</table>

<table class="totals">
  <tr><td>Subtotale</td><td class="td-num">1.163,50 €</td></tr>
  <tr><td>IVA 22%</td><td class="td-num">255,97 €</td></tr>
  <tr><td>Totale</td><td class="td-num">1.419,47 €</td></tr>
</table>

<div class="notes">
  <strong>Condizioni generali:</strong> Prezzi validi fino al 30/04/2026. Articolo A-001:
  sconto promozionale rimodulato dal 15% al 10% per il mese di aprile — il prezzo netto
  passa da €382,50 a €405,00. Articolo A-003: sconto aggiuntivo 5% per ordini mensili
  superiori a €1.000. Articolo B-002: disponibile su ordinazione (lead time 15 giorni).
</div>

<div class="footer">
  <div class="footer-info">
    Acme Furniture S.r.l. · Cap. Soc. €50.000 i.v.<br>
    Banca: Unicredit · IBAN: IT60 X054 2811 1010 0000 0123 456<br>
    Documento non costituisce fattura fiscale ai sensi del DPR 633/72
  </div>
  <div class="signature">
    <div class="signature-line"></div>
    <span>Direttore Commerciale</span>
  </div>
  <div class="stamp">ACME<br>FURNITURE<br>SRL</div>
</div>
"""
    return html_page("Fattura Proforma Acme Furniture — FP-2026-0118", body)


DISCREPANZE_COPPIA3 = """# Discrepanze deliberate — Coppia 3

**CSV (doc1):** `06-dirty-data.csv` — Listino Prezzi Marzo 2026, Acme Furniture S.r.l.
**Documento (doc2):** `fattura-acme.html` — Fattura Proforma FP-2026-0118

## Discrepanze attese dalla riconciliazione

| Tipo | Campo | Valore doc1 (CSV) | Valore doc2 (Fattura) | Severità |
|------|-------|-------------------|-----------------------|----------|
| `price_mismatch` | total_price | €382,50 (A-001) | €405,00 | error |
| `discount_mismatch` | discount | 15% (A-001) | 10% | warning |
| `discount_mismatch` | discount | 0% (A-003) | 5% | warning |
| `extra_in_doc2` | row | assente (B-002 fuori prod.) | B-002 Tappeto 200x300 | warning |

## Come testare

1. Aprire `fattura-acme.html` nel browser → Salva come PDF
2. Dalla UI: upload `06-dirty-data.csv` come Doc 1
3. Upload PDF/screenshot della fattura come Doc 2
4. Verificare in Riconciliazioni: 3-4 discrepanze

## Note sul CSV sorgente

Il CSV `06-dirty-data.csv` ha dati sporchi: righe vuote, sottotitoli (SOTTOTALE MOBILI),
totale in fondo. Il sistema dovrebbe filtrare queste righe e estrarre solo gli articoli.
Articolo B-002 è marcato FUORI PRODUZIONE nel CSV — nella fattura appare come disponibile.
"""


# ─────────────────────────────────────────────────────────────────────────────
# README principale
# ─────────────────────────────────────────────────────────────────────────────

README = """# Documenti OCR di test — WeWill Challenge

Tre coppie di documenti per testare il flusso OCR + riconciliazione.

## Struttura

```
ocr_test_docs/
├── coppia1-nordic-ddt/
│   ├── ddt-nordic-design.html      ← DDT per 03-header-offset.csv
│   └── discrepanze.md
├── coppia2-alpine-conferma/
│   ├── conferma-alpine.html        ← Conferma per 07-nested-packing.csv
│   └── discrepanze.md
└── coppia3-acme-fattura/
    ├── fattura-acme.html           ← Fattura per 06-dirty-data.csv
    └── discrepanze.md
```

## Flusso di test (per ogni coppia)

1. **Apri il file HTML** nel browser (Chrome/Safari)
2. **Stampa come PDF**: `Cmd+P` → Destinazione: "Salva come PDF" → A4
3. **Avvia il sistema**: `docker compose up` (dalla root del progetto)
4. **Crea un utente** se non esiste:
   ```bash
   docker compose run --rm backend python manage.py createsuperuser
   ```
5. **Vai alla UI**: http://localhost:3000 → Login
6. **Carica il CSV** nella zona "Doc 1 — File tabulare"
7. **Attendi elaborazione** (la riga passa da "In elaborazione" a "Elaborato")
8. **Carica il PDF** (o uno screenshot) nella zona "Doc 2 — Foto documento"
9. **Vai su Riconciliazioni** → seleziona la coppia appena creata
10. **Verifica le discrepanze** — vedi `discrepanze.md` per i dettagli attesi

## Per un test OCR più realistico

Invece del PDF diretto, apri il PDF su schermo intero e scatta una foto
con il cellulare (leggermente inclinata, non perfettamente frontale).
Questo testa l'OCR su una vera immagine fotografica, come da specifica della challenge.

## Riepilogo discrepanze per coppia

| Coppia | CSV sorgente | Documento | Discrepanze |
|--------|-------------|-----------|-------------|
| 1 — Nordic Design | `03-header-offset.csv` | DDT DDT-2026-0089 | qty_mismatch, missing, extra, date |
| 2 — Alpine Möbel | `07-nested-packing.csv` | Conferma CO-2026-0341 | qty_mismatch, price, description |
| 3 — Acme Furniture | `06-dirty-data.csv` | Fattura FP-2026-0118 | price, discount×2, extra |
"""


def main():
    print("Generazione documenti OCR di test...")

    # Coppia 1
    d = OUT / "coppia1-nordic-ddt"
    d.mkdir(parents=True, exist_ok=True)
    html_path = d / "ddt-nordic-design.html"
    write(html_path, coppia1_ddt())
    try_generate_pdf(html_path)
    write(d / "discrepanze.md", DISCREPANZE_COPPIA1)

    # Coppia 2
    d = OUT / "coppia2-alpine-conferma"
    d.mkdir(parents=True, exist_ok=True)
    html_path = d / "conferma-alpine.html"
    write(html_path, coppia2_conferma())
    try_generate_pdf(html_path)
    write(d / "discrepanze.md", DISCREPANZE_COPPIA2)

    # Coppia 3
    d = OUT / "coppia3-acme-fattura"
    d.mkdir(parents=True, exist_ok=True)
    html_path = d / "fattura-acme.html"
    write(html_path, coppia3_fattura())
    try_generate_pdf(html_path)
    write(d / "discrepanze.md", DISCREPANZE_COPPIA3)

    # README
    write(OUT / "README.md", README)

    print()
    print("Done! File generati in:", OUT)
    print()
    print("Prossimi passi:")
    print("  1. Aprire i file .html nel browser e salvarli come PDF (Cmd+P)")
    print("  2. docker compose up")
    print("  3. Upload CSV come Doc 1, upload PDF come Doc 2")
    print("  4. Verificare discrepanze in /reconciliations")
    print()
    print("Vedi ocr_test_docs/README.md per istruzioni complete.")


if __name__ == "__main__":
    main()
