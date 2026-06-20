# CLAUDE.md — frontend/src/

## Scopo
Root del codice sorgente Next.js. Contiene `app/` (route segments App Router), `components/` (UI), `lib/api.ts` (HTTP client).

## Struttura
```
src/
├── app/
│   ├── layout.tsx          ← root HTML shell
│   ├── page.tsx            ← landing/redirect
│   ├── login/ · register/  ← auth (fuori da v2)
│   └── v2/                 ← UI attiva "Quoro" — tutto il nuovo lavoro va qui
├── components/
│   └── v2/                 ← tutti i componenti UI (attivi)
└── lib/
    ├── api.ts              ← client HTTP con JWT auto-refresh
    └── upload-context.tsx  ← Context per persistere gli upload job tra navigazioni
```

## Convenzioni critiche
- ⚠ `frontend/AGENTS.md` avverte: "This is NOT the Next.js you know" — APIs e convenzioni differiscono dal training data. Leggere `node_modules/next/dist/docs/` prima di scrivere codice
- Tutto il lavoro UI va in `app/v2/` e `components/v2/` (non esistono più componenti legacy fuori da `v2/`)
- Le route dinamiche usano `[id]` come segmento cartella con `page.tsx` dentro (es. `v2/documents/[id]`, `v2/reconciliations/[id]`)
- I `page.tsx` che usano hooks React o localStorage sono `'use client'`

## Dipendenze cross-folder
- `lib/api.ts` espone tipi che rispecchiano `backend/doc_manager/serializers.py` — tenere sincronizzati
- I path API in `api.ts` corrispondono agli URL in `backend/doc_manager/urls.py`
