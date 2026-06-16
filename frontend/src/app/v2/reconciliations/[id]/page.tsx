'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Pill, { statusToPillVariant } from '@/components/v2/Pill'
import Btn from '@/components/v2/Btn'
import DocCard from '@/components/v2/DocCard'
import DiscrepancyRail from '@/components/v2/DiscrepancyRail'
import { Check, X, AlertCircle } from '@/components/v2/Icons'
import { getReconciliation, reviewReconciliation } from '@/lib/api'
import type { Reconciliation, Discrepancy, DocumentRow } from '@/lib/api'

function hlCell(discrepancies: Discrepancy[], fieldName: string, doc1RowId: number | null, doc2RowId: number | null) {
  const hit = discrepancies.find(d =>
    d.field_name === fieldName &&
    (d.doc1_row === doc1RowId || d.doc2_row === doc2RowId)
  )
  if (!hit) return {}
  const bg = hit.severity === 'error' ? 'var(--err-soft)' : hit.severity === 'warning' ? 'var(--warn-soft)' : 'var(--info-soft)'
  return { background: bg, fontWeight: 600 }
}

function DiffTable({ recon, discrepancies }: { recon: Reconciliation; discrepancies: Discrepancy[] }) {
  const [open, setOpen] = useState(true)
  const doc1Rows = recon.doc1.rows ?? []
  const doc2ByCode = new Map((recon.doc2.rows ?? []).map(r => [r.item_code, r]))
  const doc1Codes = new Set(doc1Rows.map(r => r.item_code))
  const extraDoc2 = (recon.doc2.rows ?? []).filter(r => !doc1Codes.has(r.item_code))

  const rows: { doc1: DocumentRow | null; doc2: DocumentRow | null }[] = [
    ...doc1Rows.map(r => ({ doc1: r, doc2: doc2ByCode.get(r.item_code) ?? null })),
    ...extraDoc2.map(r => ({ doc1: null, doc2: r })),
  ]

  const thStyle = { padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }
  const tdBase = { padding: '6px 10px', fontSize: 12, borderBottom: '1px solid var(--border)' }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'var(--bg-elev)', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--text)', textAlign: 'left' }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{open ? '▼' : '▶'}</span>
        Confronto righe ({rows.length})
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 400, color: 'var(--text-faint)' }}>
          {discrepancies.length > 0 ? `${discrepancies.length} discrepanz${discrepancies.length === 1 ? 'a' : 'e'} evidenziate` : 'Nessuna discrepanza'}
        </span>
      </button>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th colSpan={5} style={{ ...thStyle, background: 'var(--accent-soft)', color: 'var(--accent)', textAlign: 'center' }}>
                  Doc 1 — {recon.doc1.doc_type_display}
                </th>
                <th style={{ ...thStyle, width: 8, padding: 0, background: 'var(--border)' }}></th>
                <th colSpan={5} style={{ ...thStyle, background: 'rgba(var(--ok-rgb,120,200,120),0.08)', color: 'var(--text)', textAlign: 'center' }}>
                  Doc 2 — {recon.doc2.doc_type_display}
                </th>
              </tr>
              <tr style={{ background: 'var(--bg-sunken)' }}>
                {['Codice', 'Descrizione', 'Qty', 'Prezzo', 'Totale'].map(h => <th key={`l-${h}`} style={thStyle}>{h}</th>)}
                <th style={{ ...thStyle, width: 8, padding: 0 }}></th>
                {['Codice', 'Descrizione', 'Qty', 'Prezzo', 'Totale'].map(h => <th key={`r-${h}`} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const d1id = row.doc1?.id ?? null
                const d2id = row.doc2?.id ?? null
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg-sunken)' }}>
                    {row.doc1 ? <>
                      <td style={{ ...tdBase, fontFamily: 'var(--font-mono)', ...hlCell(discrepancies, 'item_code', d1id, d2id) }}>{row.doc1.item_code || '—'}</td>
                      <td style={{ ...tdBase, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.doc1.description || '—'}</td>
                      <td style={{ ...tdBase, ...hlCell(discrepancies, 'quantity', d1id, d2id) }}>{row.doc1.quantity ?? '—'}</td>
                      <td style={{ ...tdBase, ...hlCell(discrepancies, 'unit_price', d1id, d2id) }}>{row.doc1.unit_price ?? '—'}</td>
                      <td style={tdBase}>{row.doc1.total_price ?? '—'}</td>
                    </> : <td colSpan={5} style={{ ...tdBase, color: 'var(--text-faint)', fontStyle: 'italic' }}>— non presente nel doc1 —</td>}
                    <td style={{ width: 4, background: 'var(--border)', padding: 0 }}></td>
                    {row.doc2 ? <>
                      <td style={{ ...tdBase, fontFamily: 'var(--font-mono)', ...hlCell(discrepancies, 'item_code', d1id, d2id) }}>{row.doc2.item_code || '—'}</td>
                      <td style={{ ...tdBase, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.doc2.description || '—'}</td>
                      <td style={{ ...tdBase, ...hlCell(discrepancies, 'quantity', d1id, d2id) }}>{row.doc2.quantity ?? '—'}</td>
                      <td style={{ ...tdBase, ...hlCell(discrepancies, 'unit_price', d1id, d2id) }}>{row.doc2.unit_price ?? '—'}</td>
                      <td style={tdBase}>{row.doc2.total_price ?? '—'}</td>
                    </> : <td colSpan={5} style={{ ...tdBase, color: 'var(--err)', fontStyle: 'italic' }}>— mancante nel doc2 —</td>}
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={11} style={{ ...tdBase, textAlign: 'center', color: 'var(--text-faint)' }}>Nessuna riga da confrontare</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ReconciliationHeroPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [recon, setRecon] = useState<Reconciliation | null>(null)
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [notes, setNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getReconciliation(+id)
      .then(r => {
        setRecon(r)
        setDiscrepancies(r.discrepancy_list)
        setNotes(r.operator_notes)
      })
      .catch(() => setError('Impossibile caricare la riconciliazione.'))
  }, [id])

  const handleDiscrepancyUpdate = useCallback((discId: number, updated: Partial<Discrepancy>) => {
    setDiscrepancies(prev => prev.map(d => d.id === discId ? { ...d, ...updated } : d))
  }, [])

  async function handleReview(status: 'approved' | 'rejected' | 'corrected') {
    if (!recon) return
    setReviewing(true)
    setError(null)
    try {
      await reviewReconciliation(recon.id, status, notes)
      router.push('/v2/reconciliations')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la revisione.')
    } finally {
      setReviewing(false)
    }
  }

  async function handleSaveNotes() {
    if (!recon) return
    const validStatus: ('approved' | 'rejected' | 'corrected')[] = ['approved', 'rejected', 'corrected']
    if (!validStatus.includes(recon.status as 'approved')) return
    try {
      await reviewReconciliation(recon.id, recon.status as 'approved' | 'rejected' | 'corrected', notes)
    } catch { /* silent — notes are best-effort */ }
  }

  if (!recon) return (
    <div className="q-content">
      <div className="q-empty">
        <div className="q-empty-title">{error ?? 'Caricamento…'}</div>
      </div>
    </div>
  )

  const resolved = discrepancies.filter(d => d.resolution !== 'unresolved').length
  const total = discrepancies.length
  const allResolved = resolved === total && total > 0
  const scoreColor = recon.match_confidence >= 70 ? 'var(--ok)' : recon.match_confidence >= 40 ? 'var(--warn)' : 'var(--err)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Sticky header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Link href="/v2/reconciliations" style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>
              ← Riconciliazioni
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, color: 'var(--text)' }}>
              Riconciliazione #{recon.id}
            </h1>
            <Pill variant={statusToPillVariant(recon.status)}>{recon.status_display}</Pill>
            <span className="q-pill accent" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: scoreColor, fontWeight: 700 }}>{recon.match_confidence}</span>/100
            </span>
            {allResolved && (
              <span className="q-pill" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
                ✓ Tutte le discrepanze risolte
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <Btn variant="ghost" size="sm" onClick={() => handleReview('corrected')} disabled={reviewing}>Correggi</Btn>
          <Btn variant="danger" size="sm" onClick={() => handleReview('rejected')} disabled={reviewing}>
            <X size={13} /> Rifiuta
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => handleReview('approved')} disabled={reviewing}>
            <Check size={13} /> Approva
          </Btn>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: 'var(--err-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--err)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Body: 2-col grid + rail */}
      <div className="q-recon-v2" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left: doc cards + diff table — scorre indipendentemente.
            Il wrapper esterno (block + overflow-y:auto) è il scroll container.
            Il div interno (flex column) può crescere oltre i limiti del wrapper
            e far apparire la scrollbar, senza che flex-shrink schiacci il contenuto. */}
        <div style={{ overflowY: 'auto', minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <DocCard
                doc={recon.doc1}
                label="Documento 1"
                discrepancies={discrepancies}
                side="doc1"
              />
              <DocCard
                doc={recon.doc2}
                label="Documento 2"
                discrepancies={discrepancies}
                side="doc2"
              />
            </div>

            {/* Diff table */}
            {(recon.doc1.rows?.length || recon.doc2.rows?.length) ? (
              <DiffTable recon={recon} discrepancies={discrepancies} />
            ) : null}
          </div>
        </div>

        {/* Right: discrepancy rail */}
        <DiscrepancyRail
          discrepancies={discrepancies}
          operatorNotes={notes}
          onNotesChange={setNotes}
          onSaveNotes={handleSaveNotes}
          onDiscrepancyUpdate={handleDiscrepancyUpdate}
        />
      </div>
    </div>
  )
}
