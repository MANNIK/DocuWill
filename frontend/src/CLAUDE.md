# CLAUDE.md — frontend/src/

## Scopo
Root del codice sorgente Next.js. Contiene `app/` (route segments App Router), `components/` (UI), `lib/api.ts` (HTTP client).

## Struttura
```
src/
├── app/
│   ├── layout.tsx          ← root HTML shell
│   ├── (main)/             ← route group legacy (documents/[id], login, register, ecc.)
│   └── v2/                 ← UI attiva "Quoro" — tutto il nuovo lavoro va qui
├── components/
│   ├── v2/                 ← componenti v2 (attivi)
│   └── *.tsx               ← componenti legacy (solo per (main)/*)
└── lib/
    └── api.ts              ← client HTTP con JWT auto-refresh
```

## Convenzioni critiche
- ⚠ `frontend/AGENTS.md` avverte: "This is NOT the Next.js you know" — APIs e convenzioni differiscono dal training data. Leggere `node_modules/next/dist/docs/` prima di scrivere codice
- Tutto il nuovo lavoro va in `app/v2/` e `components/v2/`
- Non estendere i componenti `components/*.tsx` (legacy)
- Le route dinamiche usano `[id]` come segmento cartella con `page.tsx` dentro
- I `page.tsx` che usano hooks React o localStorage sono `'use client'`

## Dipendenze cross-folder
- `lib/api.ts` espone tipi che rispecchiano `backend/doc_manager/serializers.py` — tenere sincronizzati
- I path API in `api.ts` corrispondono agli URL in `backend/doc_manager/urls.py`
