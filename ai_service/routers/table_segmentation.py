"""
table_segmentation.py — Rilevamento multi-tabella deterministico (senza GPT)
============================================================================

Posizione: ai_service/routers/table_segmentation.py

PROBLEMA RISOLTO
----------------
L'implementazione precedente mandava a GPT solo le prime 50 righe del file intero.
Se un file da 500 righe ha 3 tabelle (es. 0-150, 200-350, 400-500), GPT vedeva
solo l'inizio della prima e la coda dell'ultima → le tabelle intermedie erano
invisibili e non venivano mai estratte.

IDEA
----
Python NON deve capire il SIGNIFICATO delle colonne (quello resta a GPT), ma può
trovare i CONFINI fisici delle tabelle con segnali strutturali:
  1. Confine di sheet Excel (hard boundary, fornito dal chiamante)
  2. Righe vuote consecutive (separatore più comune)
  3. Cambio del numero di colonne "piene"
  4. Cambio della "firma" della riga (pattern testo/numero per colonna)
  5. Header che si ripete (riga uguale a un header già visto)

Poi si costruisce un PREVIEW che contiene le prime N (e le ultime M) righe di OGNI
segmento trovato — così GPT vede l'inizio E la coda di tutte le tabelle in UNA
SOLA chiamata, indipendentemente da dove si trovano nel file.

I confini ambigui (shift di firma/colonne senza riga vuota) vengono opzionalmente
confermati da GPT con una sola chiamata batch su 3-5 righe di contesto per ciascun
confine.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable


# ─────────────────────────────────────────────────────────────────────────────
# Tipi di cella e firma di riga
# ─────────────────────────────────────────────────────────────────────────────

class CellKind(str, Enum):
    EMPTY = "empty"
    NUMBER = "number"
    TEXT = "text"


_NUM_RE = re.compile(r"^[€$£\s]*-?[\d.,]+[\s%]*$")


def _cell_kind(value: Any) -> CellKind:
    s = str(value).strip()
    if not s:
        return CellKind.EMPTY
    # Numero "europeo" o "US": 1.234,56 / 1,234.56 / 97.09 / 50 / €15,00 / 10%
    if _NUM_RE.match(s) and any(ch.isdigit() for ch in s):
        return CellKind.TEXT if s.count("-") > 1 else CellKind.NUMBER
    return CellKind.TEXT


def _row_signature(row: list[Any]) -> tuple[CellKind, ...]:
    """Firma strutturale della riga: il tipo di ogni cella, celle vuote in coda escluse."""
    kinds = [_cell_kind(c) for c in row]
    # rimuovi le celle vuote in coda (le tabelle spesso hanno colonne extra vuote)
    while kinds and kinds[-1] == CellKind.EMPTY:
        kinds.pop()
    return tuple(kinds)


def _is_blank(row: list[Any]) -> bool:
    return not any(str(c).strip() for c in row)


def _filled_count(row: list[Any]) -> int:
    return sum(1 for c in row if str(c).strip())


def _normalize_cells(row: list[Any]) -> tuple[str, ...]:
    return tuple(str(c).strip().lower() for c in row)


# ─────────────────────────────────────────────────────────────────────────────
# Segmento di tabella
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class TableSegment:
    start: int                      # indice riga di inizio (incluso)
    end: int                        # indice riga di fine (escluso)
    reason: str                     # perché è stato creato un nuovo segmento
    confidence: str = "high"        # high | low  → low = candidato da confermare
    boundary_context: list[list[Any]] = field(default_factory=list)

    @property
    def length(self) -> int:
        return self.end - self.start


# ─────────────────────────────────────────────────────────────────────────────
# Rilevamento confini — cuore deterministico
# ─────────────────────────────────────────────────────────────────────────────

def detect_table_segments(
    rows: list[list[Any]],
    *,
    sheet_starts: list[int] | None = None,
    blank_run_for_split: int = 2,
    signature_similarity_threshold: float = 0.5,
    min_segment_rows: int = 1,
) -> list[TableSegment]:
    """
    Trova i segmenti di tabella in una lista piatta di righe.

    sheet_starts: indici globali (su `rows`) in cui inizia un nuovo sheet Excel.
        Ogni confine di sheet forza uno split "sicuro" (high): due sheet con header
        identico — caso altrimenti non distinguibile strutturalmente — restano
        comunque separati.
    blank_run_for_split: quante righe vuote consecutive forzano uno split "sicuro".
    signature_similarity_threshold: sotto questa similarità tra firme, lo shift
        è considerato un possibile nuovo header (confidence=low → confermabile da GPT).
    """
    segments: list[TableSegment] = []
    if not rows:
        return segments

    # confini di sheet (escluso 0, che è semplicemente l'inizio del file)
    sheet_boundary = {s for s in (sheet_starts or []) if s > 0}

    seg_start = None
    consecutive_blank = 0
    ref_signature: tuple[CellKind, ...] | None = None
    ref_filled: int | None = None
    seen_headers: set[tuple[str, ...]] = set()
    pending_reason = "start"

    def close_segment(end_idx: int, next_reason: str, confidence: str = "high"):
        nonlocal seg_start, ref_signature, ref_filled, pending_reason
        if seg_start is not None and end_idx > seg_start:
            seg = TableSegment(
                start=seg_start,
                end=end_idx,
                reason=pending_reason,
                confidence=confidence,
            )
            # contesto: ultime 2 righe del segmento + prime 3 del prossimo
            ctx_start = max(seg_start, end_idx - 2)
            seg.boundary_context = rows[ctx_start:min(len(rows), end_idx + 3)]
            segments.append(seg)
        seg_start = None
        ref_signature = None
        ref_filled = None
        pending_reason = next_reason

    for i, row in enumerate(rows):
        # 0) confine di sheet Excel → split sicuro a prescindere dal contenuto
        if i in sheet_boundary and seg_start is not None:
            close_segment(i, next_reason="sheet_boundary")
            consecutive_blank = 0

        if _is_blank(row):
            consecutive_blank += 1
            # split sicuro su N righe vuote consecutive
            if seg_start is not None and consecutive_blank >= blank_run_for_split:
                close_segment(i - consecutive_blank + 1, next_reason="blank_run")
            continue

        # riga non vuota
        sig = _row_signature(row)
        filled = _filled_count(row)
        norm = _normalize_cells(row)

        if seg_start is None:
            # apertura nuovo segmento
            seg_start = i
            ref_signature = sig
            ref_filled = filled
            # se questa riga è quasi tutta testo è probabilmente un header
            if all(k != CellKind.NUMBER for k in sig) and len(sig) >= 2:
                seen_headers.add(norm)
            consecutive_blank = 0
            continue

        # all'interno di un segmento aperto
        single_blank_gap = 0 < consecutive_blank < blank_run_for_split
        consecutive_blank = 0

        # 1) header ripetuto → split forte
        is_repeat_header = (
            norm in seen_headers
            and all(k != CellKind.NUMBER for k in sig)
            and len(sig) >= 2
        )
        if is_repeat_header:
            close_segment(i, next_reason="repeated_header")
            seg_start = i
            ref_signature = sig
            ref_filled = filled
            continue

        # 2) cambio brusco numero colonne piene
        if ref_filled is not None and ref_filled >= 2:
            ratio = filled / ref_filled if ref_filled else 1.0
            if ratio < 0.5 or ratio > 1.8:
                # shift strutturale: candidato da confermare
                close_segment(i, next_reason="column_count_shift", confidence="low")
                seg_start = i
                ref_signature = sig
                ref_filled = filled
                if all(k != CellKind.NUMBER for k in sig) and len(sig) >= 2:
                    seen_headers.add(norm)
                continue

        # 3) shift di firma (es. da riga-dati numeriche a riga-header testuale)
        if ref_signature is not None:
            sim = _signature_similarity(sig, ref_signature)
            looks_like_header = all(k != CellKind.NUMBER for k in sig) and len(sig) >= 2
            if sim < signature_similarity_threshold and looks_like_header:
                conf = "low" if single_blank_gap else "low"
                close_segment(i, next_reason="signature_shift", confidence=conf)
                seg_start = i
                ref_signature = sig
                ref_filled = filled
                seen_headers.add(norm)
                continue

        # riga di dati normale: aggiorna il riferimento "scorrevole"
        # (media mobile leggera sul numero di colonne piene per assorbire rumore)
        if ref_filled is not None:
            ref_filled = round((ref_filled * 2 + filled) / 3)

    # chiudi l'ultimo segmento aperto
    if seg_start is not None:
        close_segment(len(rows), next_reason="eof")

    # scarta segmenti troppo corti che non sono tabelle (es. footer isolato)
    segments = [s for s in segments if s.length >= min_segment_rows]
    return segments


def _signature_similarity(a: tuple[CellKind, ...], b: tuple[CellKind, ...]) -> float:
    """Similarità posizione-per-posizione tra due firme (0..1)."""
    if not a and not b:
        return 1.0
    n = max(len(a), len(b))
    if n == 0:
        return 1.0
    matches = sum(
        1 for i in range(n)
        if i < len(a) and i < len(b) and a[i] == b[i]
    )
    return matches / n


# ─────────────────────────────────────────────────────────────────────────────
# Conferma opzionale dei confini ambigui — UNA sola chiamata GPT batch
# ─────────────────────────────────────────────────────────────────────────────

def confirm_ambiguous_boundaries(
    segments: list[TableSegment],
    gpt_call: Callable[[str], str],
) -> list[TableSegment]:
    """
    Per i confini con confidence='low', chiede a GPT (UNA chiamata) se ciascun
    confine apre davvero una nuova tabella o è solo una riga diversa/vuota.

    gpt_call: funzione che riceve un prompt e ritorna il testo della risposta.
              (passa qui il tuo wrapper su client.chat.completions.create)

    Restituisce la lista di segmenti eventualmente RI-FUSI dove GPT dice "no".
    """
    low = [s for s in segments if s.confidence == "low"]
    if not low:
        return segments

    candidates = []
    for idx, seg in enumerate(segments):
        if seg.confidence != "low":
            continue
        ctx_lines = [
            " | ".join(str(c).strip() for c in row)
            for row in seg.boundary_context
        ]
        candidates.append({
            "boundary_id": idx,
            "reason": seg.reason,
            "context_rows": ctx_lines,
        })

    prompt = f"""Sei un parser di file tabellari. Per ciascun confine candidato qui sotto
decidi se la riga di confine APRE UNA NUOVA TABELLA (intestazione di una tabella
distinta, dati di un altro fornitore, struttura diversa) oppure se è solo una riga
diversa/di riepilogo/vuota DENTRO la stessa tabella.

CONFINI CANDIDATI:
{json.dumps(candidates, ensure_ascii=False, indent=2)}

Rispondi SOLO con JSON:
{{"boundaries": [{{"boundary_id": <int>, "new_table": true|false}}]}}"""

    try:
        raw = gpt_call(prompt).strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        decisions = {
            d["boundary_id"]: d["new_table"]
            for d in json.loads(raw.strip()).get("boundaries", [])
        }
    except Exception:
        # in caso di errore GPT: teniamo i segmenti come sono (fail-safe)
        return segments

    # ri-fondi i segmenti dove GPT dice new_table=False
    merged: list[TableSegment] = []
    for idx, seg in enumerate(segments):
        if seg.confidence == "low" and decisions.get(idx) is False and merged:
            # estendi il segmento precedente fino alla fine di questo
            merged[-1].end = seg.end
        else:
            merged.append(seg)
    return merged


# ─────────────────────────────────────────────────────────────────────────────
# Preview "segment-aware" — sostituisce rows_to_text per file multi-tabella
# ─────────────────────────────────────────────────────────────────────────────

def _looks_like_header(row: list[Any]) -> bool:
    """
    Una riga 'sembra un header' se ha >= 2 celle piene e nessuna è puramente
    numerica. È il segnale che dentro un segmento (magari mal-segmentato) potrebbe
    nascondersi l'inizio di un'altra tabella.
    """
    sig = _row_signature(row)
    return len(sig) >= 2 and all(k != CellKind.NUMBER for k in sig)


def build_segmented_preview(
    rows: list[list[Any]],
    segments: list[TableSegment],
    *,
    rows_per_segment: int = 15,
    tail_per_segment: int = 5,
) -> str:
    """
    Costruisce un preview che mostra le prime `rows_per_segment` E le ultime
    `tail_per_segment` righe di OGNI segmento, con marcatori espliciti. Così GPT
    vede l'inizio E la coda di TUTTE le tabelle in una sola chiamata, anche quelle
    oltre la riga 50 del file.

    PERCHÉ ANCHE LA CODA (`tail_per_segment`)
    -----------------------------------------
    Molti file hanno righe di RIEPILOGO/Totale alla fine di una tabella (es. file
    courier export). Vanno mostrate a GPT affinché le escluda da data_row_indices,
    altrimenti finiscono erroneamente tra i dati. Mostrare solo l'inizio del
    segmento le nasconderebbe.

    REGOLA ANTI-BUG (segmentazione imperfetta)
    ------------------------------------------
    Se Python ha sbagliato e ha fuso più tabelle in un solo segmento, tagliare le
    righe in mezzo nasconderebbe l'header della 2a/3a tabella. Per evitarlo, oltre
    a head+tail, vengono SEMPRE incluse anche tutte le righe che 'sembrano header'
    (tutto testo, >=2 colonne) — non vengono mai omesse. Così GPT vede comunque
    l'inizio di ogni tabella nascosta dentro il segmento e può ri-spezzarlo.

    Gli indici riga riportati sono quelli GLOBALI del file: extract_rows li userà
    direttamente, senza disallineamenti.
    """
    lines: list[str] = []
    for s_idx, seg in enumerate(segments):
        lines.append(f"--- TABELLA {s_idx + 1} (righe {seg.start}-{seg.end - 1}) ---")

        # indici non vuoti del segmento, in ordine
        non_blank = [i for i in range(seg.start, seg.end) if not _is_blank(rows[i])]
        head = set(non_blank[:rows_per_segment])
        tail = set(non_blank[-tail_per_segment:]) if tail_per_segment else set()

        omitted = 0  # righe-dati saltate, da segnalare in blocco
        for i in non_blank:
            row = rows[i]
            is_header = _looks_like_header(row)

            # Mostra se: head, tail, oppure sembra un header (mai omesso)
            if i in head or i in tail or is_header:
                if omitted:
                    lines.append(f"... [{omitted} righe dati omesse] ...")
                    omitted = 0
                cells = [str(c).strip() for c in row]
                tag = "  [possibile header]" if (is_header and i not in head) else ""
                lines.append(f"Riga {i}: {' | '.join(cells)}{tag}")
            else:
                omitted += 1

        if omitted:
            lines.append(f"... [{omitted} righe dati omesse] ...")
    return "\n".join(lines)
