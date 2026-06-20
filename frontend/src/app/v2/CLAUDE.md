# CLAUDE.md — frontend/src/app/v2/

## Scopo
L'UI attiva del prodotto — il design system "Quoro". Tutte le schermate operative dell'operatore vivono qui.

## Route tree
```
v2/
├── layout.tsx          ← inietta <Sidebar/> + <Topbar/> + <main className="q-main">
├── globals-v2.css      ← design tokens e classi q-* (variabili CSS, non Tailwind)
├── page.tsx            ← dashboard KPI
├── upload/page.tsx     ← upload multiplo con UploadCard per file
├── inbox/page.tsx      ← messaggi WhatsApp in arrivo
├── reconciliations/
│   ├── page.tsx        ← lista riconciliazioni
│   └── [id]/page.tsx   ← dettaglio: DocCard pair + DiscrepancyRail
├── documents/
│   └── [id]/page.tsx   ← dettaglio documento: metadati + righe estratte + ImagePreview
├── suppliers/page.tsx  ← lista fornitori con canonical grouping
├── settings/page.tsx   ← AppSettings
└── profile/page.tsx    ← profilo utente con JWT decode
```

## Convenzioni
- Classi CSS prefissate `q-` definite in `globals-v2.css` — non usare Tailwind in v2
- Copy in italiano
- Le pagine sono `'use client'` se usano `useState`, `useEffect`, `localStorage`
- Il layout v2 presuppone autenticazione JWT — le pagine non gestiscono il redirect al login (lo fa `lib/api.ts` su 401)
- `UploadJob[]` in `upload/page.tsx`: ogni upload è un job indipendente con `crypto.randomUUID()` come chiave

## Dipendenze cross-folder
- Tutte le pagine chiamano funzioni da `@/lib/api.ts`
- I componenti v2 vengono da `@/components/v2/`

## Comandi
```bash
# Dev server (host, non Docker)
npm run dev
```
