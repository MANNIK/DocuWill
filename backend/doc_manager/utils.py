import ipaddress
import re
import socket
import unicodedata
from urllib.parse import urlparse

try:
    from rapidfuzz import fuzz, process as fuzz_process
    _HAS_RAPIDFUZZ = True
except ImportError:
    _HAS_RAPIDFUZZ = False


def is_safe_external_url(url: str) -> bool:
    """
    Protezione SSRF: accetta solo URL http/https il cui host risolve a indirizzi
    pubblici. Rifiuta loopback, reti private, link-local (incl. 169.254.169.254 —
    l'endpoint metadata di AWS/GCP) e altri range non instradabili.

    Usata prima di ogni `httpx.get(media_url)` (tasks.py) e nel webhook (views.py):
    impedisce che un media_url ostile faccia scaricare risorse interne o leggere
    i metadata cloud, e poi inviare tutto a GPT-4o Vision.
    """
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = parsed.hostname
    if not host:
        return False
    try:
        # Risolvi TUTTI gli indirizzi del host: se anche uno solo è privato, rifiuta.
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError):
        return False
    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True

# Suffissi societari ordinati per lunghezza DESC (longest-match-first)
# KEEP IN SYNC con ai_service/utils/supplier.py
_COMPANY_SUFFIXES = sorted([
    # Italiani
    's.r.l.s.', 's.r.l.', 's.p.a.', 's.a.s.', 's.n.c.', 's.s.',
    'srls', 'srl', 'spa', 'sas', 'snc',
    # Tedeschi
    'gmbh & co. kg', 'gmbh', 'kg', 'ag', 'ohg', 'gbr',
    # Francesi / Spagnoli
    'sarl', 's.a.r.l.', 's.l.', 'sl', 's.a.', 'sa',
    # Inglesi / Americani
    'limited', 'ltd.', 'ltd', 'incorporated', 'inc.', 'inc',
    'corporation', 'corp.', 'corp', 'llc', 'l.l.c.',
    'company', 'co.', 'co', 'pty', 'plc',
    # Scandinavi / Olandesi
    'ab', 'a/s', 'as', 'oy', 'oyj', 'bv', 'b.v.', 'nv', 'n.v.',
], key=len, reverse=True)

_FUZZY_THRESHOLD = 92  # rapidfuzz scala 0-100; 92 = conservativo, evita collisioni


def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def normalize_supplier(name: str) -> str:
    """Whitespace-only — mantiene il nome originale per display."""
    return ' '.join(name.strip().split()) if name else ''


def _normalize_for_match(name: str) -> str:
    """Upper, strip accenti + punteggiatura, rimuovi forme societarie (senza DB)."""
    if not name:
        return ''
    s = _strip_accents(name).upper()
    s = re.sub(r'[^\w\s&]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    # Rimuovi suffissi (ciclo perché possono essere annidati, es. "Foo GmbH & Co. KG")
    changed = True
    while changed:
        changed = False
        for suf in _COMPANY_SUFFIXES:
            suf_norm = re.sub(r'\s+', ' ', re.sub(r'[^\w\s&]', ' ', suf.upper())).strip()
            if s.endswith(' ' + suf_norm) or s == suf_norm:
                s = s[:len(s) - len(suf_norm)].strip()
                changed = True
                break
    return s


def canonical_supplier_name(raw: str, existing_canonicals: list | None = None) -> str:
    """
    Risolve il nome canonico per matching/grouping.

    Pipeline:
    1. normalize_for_match (upper, no punct, no accento, no suffisso)
    2. Se existing_canonicals fornita: fuzzy match (WRatio) con soglia 92
    3. Ritorna il canonical esistente in caso di hit, altrimenti il normalizzato

    Per la cache Redis (no DB access) chiamare senza existing_canonicals.
    """
    normalized = _normalize_for_match(raw)
    if not normalized:
        return ''
    if not existing_canonicals or not _HAS_RAPIDFUZZ:
        return normalized
    match = fuzz_process.extractOne(
        normalized,
        existing_canonicals,
        scorer=fuzz.WRatio,
        score_cutoff=_FUZZY_THRESHOLD,
    )
    return match[0] if match else normalized


def supplier_key(name: str) -> str:
    """Legacy — usata per cache key Redis. Uguale a canonical senza fuzzy."""
    return canonical_supplier_name(name)
