"""
Normalizzazione nome fornitore per la chiave di cache Redis.
KEEP IN SYNC con backend/doc_manager/utils.py (_normalize_for_match).
Questa versione NON fa fuzzy matching (niente DB) — solo suffix strip deterministico.
"""
import re
import unicodedata

# KEEP IN SYNC con backend/doc_manager/utils.py
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


def _strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def normalize_for_cache(name: str) -> str:
    """
    Normalizza un nome fornitore per generare la chiave di cache Redis.
    Produce lo stesso output di canonical_supplier_name(name) senza fuzzy.
    """
    if not name:
        return ''
    s = _strip_accents(name).upper()
    s = re.sub(r'[^\w\s&]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
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
