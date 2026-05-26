'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Card from '@/components/v2/Card'
import Pill, { statusToPillVariant } from '@/components/v2/Pill'
import EmptyState from '@/components/v2/EmptyState'
import { Diff, ArrowRight } from '@/components/v2/Icons'
import { getReconciliations } from '@/lib/api'
import type { Reconciliation } from '@/lib/api'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

const statusLabel: Record<string, string> = {
  pending: 'In attesa', approved: 'Approvata', rejected: 'Rifiutata', corrected: 'Corretta',
}

export default function ReconciliationsPage() {
  const [recons, setRecons] = useState<Reconciliation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getReconciliations().then(r => { setRecons(r); setLoading(false) }).catch(() => setLoading(false))
    const t = setInterval(() => getReconciliations().then(setRecons).catch(() => {}), 5000)
    return () => clearInterval(t)
  }, [])

  const errorCount = (r: Reconciliation) => r.discrepancy_list.filter(d => d.severity === 'error').length
  const warnCount = (r: Reconciliation) => r.discrepancy_list.filter(d => d.severity === 'warning').length

  return (
    <div className="q-content q-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="q-display">Riconciliazioni</h1>
          <p className="q-subtitle">{recons.length} riconciliazioni totali · {recons.filter(r => r.status === 'pending').length} in attesa</p>
        </div>
      </div>

      {loading ? (
        <div className="q-empty"><div className="q-empty-title">Caricamento…</div></div>
      ) : recons.length === 0 ? (
        <EmptyState icon={<Diff size={32} />} title="Nessuna riconciliazione" description="Carica due documenti correlati per avviare la riconciliazione automatica." action={<Link href="/v2/upload" className="q-btn primary sm">Carica documento</Link>} />
      ) : (
        <Card style={{ overflow: 'hidden' }}>
          <table className="q-tbl">
            <thead>
              <tr>
                <th>Doc 1</th><th>Doc 2</th><th>Fornitore</th>
                <th>Score</th><th>Discrepanze</th><th>Status</th><th>Data</th><th></th>
              </tr>
            </thead>
            <tbody>
              {recons.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{r.doc1.doc_type_display}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{r.doc1.document_number || '—'}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 12 }}>{r.doc2.doc_type_display}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{r.doc2.document_number || '—'}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.doc1.supplier_name || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--bg-sunken)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: r.match_confidence >= 70 ? 'var(--ok)' : r.match_confidence >= 40 ? 'var(--warn)' : 'var(--err)', width: `${r.match_confidence}%`, borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 24 }}>{r.match_confidence}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {errorCount(r) > 0 && <Pill variant="err">{errorCount(r)} err</Pill>}
                      {warnCount(r) > 0 && <Pill variant="warn">{warnCount(r)} warn</Pill>}
                      {errorCount(r) === 0 && warnCount(r) === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>}
                    </div>
                  </td>
                  <td><Pill variant={statusToPillVariant(r.status)}>{statusLabel[r.status] ?? r.status}</Pill></td>
                  <td style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td>
                    <Link href={`/v2/reconciliations/${r.id}`} style={{ textDecoration: 'none' }}>
                      <button className="q-btn ghost sm"><ArrowRight size={13} /></button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
