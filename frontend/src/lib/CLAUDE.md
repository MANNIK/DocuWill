# CLAUDE.md — frontend/src/lib/

## Scopo
Utility frontend condivise: `api.ts` (client HTTP tipizzato) e `upload-context.tsx` (stato upload condiviso).

## File chiave
- `api.ts` — fetch wrapper con JWT Bearer token; auto-refresh su 401 via `/api/auth/token/refresh/`; redirect a `/login` su fallimento hard; espone tipi TypeScript (`Document`, `DocumentRow`, `Reconciliation`, `Discrepancy`, `Notification`, `DashboardStats`, ecc.) e funzioni fetch tipizzate
- `upload-context.tsx` — React Context che persiste gli `UploadJob[]` tra le navigazioni (un upload in corso non si perde cambiando pagina)

## Convenzioni
- **Non chiamare `fetch` direttamente dai componenti** — usare sempre le funzioni esportate da `api.ts`
- SSR-safe: le chiamate a `localStorage` sono guardate da `typeof window !== 'undefined'`
- I tipi TS devono rispecchiare i serializer DRF in `backend/doc_manager/serializers.py` — mantenerli sincronizzati
- I path API (es. `/api/documents/`) corrispondono agli URL in `backend/doc_manager/urls.py`
- `NEXT_PUBLIC_API_URL` (da `.env.frontend`) — default `http://localhost:8000`

## Dipendenze cross-folder (CRITICO)
- Quando si aggiunge un campo a `backend/doc_manager/serializers.py`, aggiungere il tipo corrispondente qui
- Quando si aggiunge un endpoint a `backend/doc_manager/urls.py`, aggiungere il fetcher tipizzato qui

## Comandi
```bash
# Verifica type-safety
npx tsc --noEmit
```
