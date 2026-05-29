# CLAUDE.md — frontend/src/components/v2/

## Scopo
Componenti React v2 — primitivi UI e widget feature usati esclusivamente da `app/v2/*`.

## File chiave
- `Sidebar.tsx`, `Topbar.tsx` — chrome dell'app, iniettati da `app/v2/layout.tsx`
- `UploadCard.tsx` — card per singolo upload job (header + progress bar + steps + error banner + doc metadata)
- `DocCard.tsx` — card documento con metadati; usato in coppie nel dettaglio riconciliazione
- `DiscrepancyRail.tsx` — lista discrepanze con severity color coding
- `CommandPalette.tsx` — palette comandi rapidi (Cmd+K)
- `NotificationsDropdown.tsx` — badge notifiche + dropdown
- `UserMenu.tsx` — dropdown utente con profilo/logout
- `ImagePreview.tsx` — preview immagine documento WhatsApp
- `Icons.tsx` — **tutte** le icone come SVG inline; NON aggiungere librerie icone esterne
- `Btn.tsx`, `Card.tsx`, `Pill.tsx`, `EmptyState.tsx`, `KpiCard.tsx` — primitivi riusabili

## Convenzioni
- I componenti che usano `localStorage`, `useState`, `useEffect` devono iniziare con `'use client'`
- Icone SVG solo da `Icons.tsx` — interfaccia `interface IconProps { size?: number; className?: string; style?: CSSProperties }`
- Non importare da `components/*.tsx` legacy (sibling folder) — sono per `(main)/`
- CSS via classi `q-*` da `globals-v2.css`, non inline style per variabili di design

## Dipendenze cross-folder
- I tipi di dati (Document, Reconciliation, Discrepancy, ecc.) vengono da `@/lib/api.ts`
