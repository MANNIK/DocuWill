'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Pill, { severityToPillVariant, statusToPillVariant } from '@/components/v2/Pill'
import Btn from '@/components/v2/Btn'
import Card from '@/components/v2/Card'
import EmptyState from '@/components/v2/EmptyState'
import { Check, X, AlertCircle, Filter, Eye, ChevronRight, Diff } from '@/components/v2/Icons'
import { getReconciliation, reviewReconciliation } from '@/lib/api'
import type { Reconciliation, Discrepancy } from '@/lib/api'

type SeverityFilter = 'all' | 'error' | 'warning' | 'info'

const discLabel: Record<string, string> = {
  quantity_mismatch: 'Quantità diversa', price_mismatch: 'Prezzo diverso',
  missing_in_doc2: 'Mancante nel doc2', extra_in_doc2: 'Extra nel doc2',
  unit_mismatch: 'Unità diversa', discount_mismatch: 'Sconto diverso',
  description_mismatch: 'Descrizione diversa', date_mismatch: 'Data diversa',
  total_mismatch: 'Totale non corrispondente', code_mismatch: 'Codice diverso',
}

const fieldLabel: Record<string, string> = {
  quantity: 'Quantità', unit_price: 'Prezzo unitario', unit: 'Unità',
  discount: 'Sconto', description: 'Descrizione', date: 'Data', total: 'Totale',
}

function hlClass(severity: string) {
  if (severity === 'error') return 'hl-err'
  if (severity === 'warning') return 'hl-warn'
  if (severity === 'info') return 'hl-info'
  return ''
}

function cellHl(severity: string) {
  if (severity === 'error') return 'hl-cell-err'
  if (severity === 'warning') return 'hl-cell-warn'
  if (severity === 'info') return 'hl-cell-info'
  return ''
}

export default function ReconciliationHeroPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [recon, setRecon] = useState<Reconciliation | null>(null)
  const [filter, setFilter] = useState<SeverityFilter>('all')
  const [notes, setNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [tab, setTab] = useState<'diff' | 'doc1' | 'doc2'>('diff')
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({})

  useEffect(() => {
    if (!id) return
    getReconciliation(+id).then(r => { setRecon(r); setNotes(r.operator_notes) }).catch(() => {})
  }, [id])

  if (!recon) return (
    <div className="q-content"><EmptyState icon={<Diff size={32} />} title="Caricamento riconciliazione…" /></div>
  )

  const discs = recon.discrepancy_list
  const filtered = filter === 'all' ? discs : discs.filter(d => d.severity === filter)
  const errCount = discs.filter(d => d.severity === 'error').length
  const warnCount = discs.filter(d => d.severity === 'warning').length
  const infoCount = discs.filter(d => d.severity === 'info').length
  const resolvedCount = discs.filter(d => d.severity !== 'error').length

  const discsByRow1 = new Map<number | null, Discrepancy[]>()
  discs.forEach(d => {
    const key = d.doc1_row
    if (!discsByRow1.has(key)) discsByRow1.set(key, [])
    discsByRow1.get(key)!.push(d)
  })

  async function handleReview(status: 'approved' | 'rejected' | 'corrected') {
    setReviewing(true)
    try {
      await reviewReconciliation(recon!.id, status, notes)
      router.push('/v2/reconciliations')
    } catch { /* noop */ } finally { setReviewing(false) }
  }

  function scrollToRow(discId: number) {
    const el = rowRefs.current[discId]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Costruisce la diff table: merge righe doc1 e doc2 per item_code
  const doc1Rows = recon.doc1.rows ?? []
  const doc2ByCode = new Map(recon.doc2.rows?.map(r => [r.item_code, r]) ?? [])

  // Righe per la diff: tutte le righe di doc1, più le extra di doc2
  const doc2CodesInDoc1 = new Set(doc1Rows.map(r => r.item_code))
  const extraDoc2Rows = (recon.doc2.rows ?? []).filter(r => !doc2CodesInDoc1.has(r.item_code))

  const allDiffRows = [
    ...doc1Rows.map(r => ({ type: 'match' as const, doc1: r, doc2: doc2ByCode.get(r.item_code) ?? null })),
    ...extraDoc2Rows.map(r => ({ type: 'extra' as const, doc1: null, doc2: r })),
  ]

  const discsForRow = (doc1RowId: number | null, doc2RowId: number | null) =>
    discs.filter(d => d.doc1_row === doc1RowId || d.doc2_row === doc2RowId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Link href="/v2/reconciliations" style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>← Riconciliazioni</Link>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, color: 'var(--text)' }}>
            {recon.doc1.doc_type_display} vs. {recon.doc2.doc_type_display}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="q-pill accent">match auto · score {recon.match_confidence}/100</span>
            <Pill variant={statusToPillVariant(recon.status)}>{recon.status_display}</Pill>
            <span className="q-pill">risolte {resolvedCount}/{discs.length}</span>
            {recon.doc1.supplier_name && <span className="q-pill">{recon.doc1.supplier_name}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Note operatore…"
            className="q-textarea"
            style={{ width: 200, height: 56, fontSize: 12 }}
          />
          <Btn variant="ghost" size="sm" onClick={() => handleReview('corrected')} disabled={reviewing}>Correggi</Btn>
          <Btn variant="danger" size="sm" onClick={() => handleReview('rejected')} disabled={reviewing}>
            <X size={13} /> Rifiuta
          </Btn>
          <Btn variant="primary" onClick={() => handleReview('approved')} disabled={reviewing}>
            <Check size={13} /> Approva
          </Btn>
        </div>
      </div>

      {/* Tab + filter bar */}
      <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        {/* Source tabs */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-sunken)', padding: 3, borderRadius: 'var(--radius-sm)' }}>
          {([['diff', 'Riconciliazione'], ['doc1', `Doc 1`], ['doc2', `Doc 2`]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: tab === t ? 'var(--surface)' : 'transparent',
                color: tab === t ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: tab === t ? 'var(--shadow-sm)' : 'none',
              }}>{label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Severity chips */}
        <div className="q-chips">
          <button className={`q-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            <Filter size={11} /> Tutto ({discs.length})
          </button>
          {errCount > 0 && <button className={`q-chip err ${filter === 'error' ? 'active' : ''}`} onClick={() => setFilter('error')}>Errori ({errCount})</button>}
          {warnCount > 0 && <button className={`q-chip warn ${filter === 'warning' ? 'active' : ''}`} onClick={() => setFilter('warning')}>Warning ({warnCount})</button>}
          {infoCount > 0 && <button className={`q-chip info ${filter === 'info' ? 'active' : ''}`} onClick={() => setFilter('info')}>Info ({infoCount})</button>}
        </div>
      </div>

      {/* Metadata band */}
      <div style={{ padding: '10px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)', flexShrink: 0 }}>
        <div className="q-grid-2" style={{ gap: 0, maxWidth: 700 }}>
          {[
            ['Fornitore', recon.doc1.supplier_name, recon.doc2.supplier_name],
            ['N. Documento', recon.doc1.document_number, recon.doc2.document_number],
            ['Data', recon.doc1.document_date, recon.doc2.document_date],
            ['Totale', recon.doc1.total_amount ? `€${parseFloat(recon.doc1.total_amount).toLocaleString('it-IT')}` : null, recon.doc2.total_amount ? `€${parseFloat(recon.doc2.total_amount).toLocaleString('it-IT')}` : null],
          ].map(([label, v1, v2]) => {
            const mismatch = v1 && v2 && v1 !== v2
            return (
              <div key={label as string} style={{ display: 'flex', gap: 16, padding: '4px 0' }}>
                <div style={{ width: 90, fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>
                  <span className={mismatch ? 'hl-cell-warn' : ''}>{v1 || '—'}</span>
                  <span style={{ color: 'var(--text-faint)', margin: '0 6px' }}>↔</span>
                  <span className={mismatch ? 'hl-cell-warn' : ''}>{v2 || '—'}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Body */}
      <div className="q-recon-body">
        {/* Diff / Doc view */}
        <div className="q-recon-diff">
          {tab === 'diff' ? (
            <table className="q-diff" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th className="side-l q-side-banner l">Doc 1 — {recon.doc1.doc_type_display}</th>
                  <th className="q-diff-sep"></th>
                  <th className="side-r q-side-banner r">Doc 2 — {recon.doc2.doc_type_display}</th>
                </tr>
                <tr>
                  {['Codice', 'Descrizione', 'Qtà', 'P.Unit', 'Totale'].map(h => (
                    <th key={h} className="side-l">{h}</th>
                  ))}
                  <th className="q-diff-sep"></th>
                  {['Codice', 'Descrizione', 'Qtà', 'P.Unit', 'Totale'].map(h => (
                    <th key={h} className="side-r">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDiffRows.map((row, i) => {
                  const rowDiscs = row.doc1 ? discsForRow(row.doc1.id, row.doc2?.id ?? null) : discsForRow(null, row.doc2!.id)
                  const maxSev = rowDiscs.some(d => d.severity === 'error') ? 'error' : rowDiscs.some(d => d.severity === 'warning') ? 'warning' : rowDiscs.length > 0 ? 'info' : ''
                  const cls = hlClass(maxSev)
                  const firstDisc = rowDiscs[0]
                  return (
                    <tr key={i} className={cls} ref={el => { if (firstDisc) rowRefs.current[firstDisc.id] = el }}>
                      {/* Doc1 side */}
                      {row.doc1 ? <>
                        <td className="side-l q-mono" style={{ fontSize: 12 }}>{row.doc1.item_code || '—'}</td>
                        <td className="side-l" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{row.doc1.description || '—'}</td>
                        <td className="side-l">
                          {rowDiscs.some(d => d.field_name === 'quantity') ?
                            <span className={cellHl(maxSev)}>{row.doc1.quantity}</span> : row.doc1.quantity ?? '—'}
                        </td>
                        <td className="side-l">
                          {rowDiscs.some(d => d.field_name === 'unit_price') ?
                            <span className={cellHl(maxSev)}>{row.doc1.unit_price}</span> : row.doc1.unit_price ?? '—'}
                        </td>
                        <td className="side-l">{row.doc1.total_price ?? '—'}</td>
                      </> : <td className="side-l" colSpan={5} style={{ color: 'var(--text-faint)', fontStyle: 'italic', fontSize: 12 }}>— non presente nel doc1 —</td>}

                      <td className="q-diff-sep"></td>

                      {/* Doc2 side */}
                      {row.doc2 ? <>
                        <td className="side-r q-mono" style={{ fontSize: 12 }}>
                          {rowDiscs.some(d => d.discrepancy_type === 'code_mismatch') ?
                            <span className={cellHl(maxSev)}>{row.doc2.item_code}</span> : row.doc2.item_code || '—'}
                        </td>
                        <td className="side-r" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {rowDiscs.some(d => d.discrepancy_type === 'description_mismatch') ?
                            <span className={cellHl('info')}>{row.doc2.description}</span> : row.doc2.description || '—'}
                        </td>
                        <td className="side-r">
                          {rowDiscs.some(d => d.field_name === 'quantity') ?
                            <span className={cellHl(maxSev)}>{row.doc2.quantity}</span> : row.doc2.quantity ?? '—'}
                        </td>
                        <td className="side-r">
                          {rowDiscs.some(d => d.field_name === 'unit_price') ?
                            <span className={cellHl(maxSev)}>{row.doc2.unit_price}</span> : row.doc2.unit_price ?? '—'}
                        </td>
                        <td className="side-r">{row.doc2.total_price ?? '—'}</td>
                      </> : <td className="side-r" colSpan={5} style={{ color: 'var(--err)', fontStyle: 'italic', fontSize: 12 }}>— mancante nel doc2 —</td>}
                    </tr>
                  )
                })}
                {allDiffRows.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Nessuna riga da confrontare</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="q-tbl">
              <thead><tr><th>Codice</th><th>Descrizione</th><th>Qtà</th><th>P.Unit.</th><th>Totale</th><th>Sconto</th></tr></thead>
              <tbody>
                {(tab === 'doc1' ? recon.doc1.rows : recon.doc2.rows)?.map(r => (
                  <tr key={r.id}>
                    <td className="q-mono" style={{ fontSize: 12 }}>{r.item_code || '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.description || '—'}</td>
                    <td>{r.quantity ?? '—'}</td>
                    <td>{r.unit_price ?? '—'}</td>
                    <td>{r.total_price ?? '—'}</td>
                    <td>{r.discount ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Rail discrepanze */}
        <div className="q-recon-rail">
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Discrepanze ({filtered.length})
          </div>
          {filtered.length === 0 ? (
            <div className="q-empty" style={{ padding: 20 }}>
              <Check size={20} style={{ color: 'var(--ok)' }} />
              <div className="q-empty-title">Nessuna discrepanza</div>
            </div>
          ) : filtered.map(d => (
            <button key={d.id} onClick={() => scrollToRow(d.id)}
              className="q-card"
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', border: 'none', display: 'block', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Pill variant={severityToPillVariant(d.severity)}>{d.severity}</Pill>
                <Eye size={11} style={{ color: 'var(--text-faint)' }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
                {discLabel[d.discrepancy_type] ?? d.discrepancy_type}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {fieldLabel[d.field_name] ?? d.field_name}:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-sunken)', padding: '1px 5px', borderRadius: 3 }}>{d.value_doc1 || '—'}</span>
                <ChevronRight size={10} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: d.severity === 'error' ? 'var(--err-soft)' : d.severity === 'warning' ? 'var(--warn-soft)' : 'var(--info-soft)', padding: '1px 5px', borderRadius: 3, color: d.severity === 'error' ? 'var(--err)' : d.severity === 'warning' ? 'var(--warn)' : 'var(--info)' }}>{d.value_doc2 || '—'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
