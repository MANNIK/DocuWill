'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import KpiCard from '@/components/v2/KpiCard'
import Card from '@/components/v2/Card'
import Pill, { statusToPillVariant } from '@/components/v2/Pill'
import { getDashboardStats } from '@/lib/api'
import type { DashboardStats, Document } from '@/lib/api'

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}min`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}


const discTypeLabel: Record<string, string> = {
  quantity_mismatch: 'Quantità', price_mismatch: 'Prezzo', missing_in_doc2: 'Mancante doc2',
  extra_in_doc2: 'Extra doc2', unit_mismatch: 'Unità', discount_mismatch: 'Sconto',
  description_mismatch: 'Descrizione', date_mismatch: 'Data', total_mismatch: 'Totale',
  code_mismatch: 'Codice',
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const load = useCallback(async () => {
    try { setStats(await getDashboardStats()) } catch { /* 401 → redirect */ }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  if (!stats) return (
    <div className="q-content">
      <div className="q-empty"><div className="q-empty-title">Caricamento dashboard…</div></div>
    </div>
  )

  const maxIngestion = Math.max(1, ...stats.ingestion_7d.map(d => d.count))
  const maxDisc = Math.max(1, ...stats.discrepancy_histogram.map(d => d.count))

  return (
    <div className="q-content q-fade-in">
      {/* Header */}
      <div>
        <h1 className="q-display">Buongiorno</h1>
        <p className="q-subtitle">Ecco lo stato della coda di riconciliazione</p>
      </div>

      {/* KPI row */}
      <div className="q-grid-4">
        <KpiCard label="In attesa" value={stats.pending}
          sub={stats.pending === 0 ? 'Coda vuota' : 'documenti da processare'}
          valueStyle={stats.pending > 0 ? { color: 'var(--warn)' } : undefined} />
        <KpiCard label="Processati oggi" value={stats.processed_today} sub="documenti" />
        <KpiCard label="Match rate" value={`${stats.match_rate}%`}
          sub="riconciliazioni approvate"
          valueStyle={{ color: stats.match_rate >= 80 ? 'var(--ok)' : stats.match_rate >= 50 ? 'var(--warn)' : 'var(--err)' }} />
        <KpiCard label="Tempo medio" value={fmtMs(stats.avg_processing_ms)} sub="per documento" />
      </div>

      {/* Coda e grafici */}
      <div className="q-grid-2" style={{ alignItems: 'start' }}>
        {/* Coda riconciliazione */}
        <Card>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Coda riconciliazione</span>
            <Link href="/v2/reconciliations" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>Vedi tutte →</Link>
          </div>
          {stats.queue.length === 0 ? (
            <div className="q-empty" style={{ padding: 28 }}>
              <div className="q-empty-title">Coda vuota</div>
            </div>
          ) : (
            <table className="q-tbl">
              <thead><tr><th>Fornitore</th><th>Score</th><th>Status</th></tr></thead>
              <tbody>
                {stats.queue.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/v2/reconciliations/${r.id}`}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.doc1.supplier_name || r.doc1.original_filename}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{r.doc1.doc_type_display} ↔ {r.doc2.doc_type_display}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--bg-sunken)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'var(--accent)', width: `${r.match_confidence}%`, borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{r.match_confidence}</span>
                      </div>
                    </td>
                    <td><Pill variant={statusToPillVariant(r.status)}>{r.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Grafici */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Ingestion ultimi 7 giorni</div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 60 }}>
                {stats.ingestion_7d.map(d => (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: '100%', background: 'var(--accent-soft)', borderRadius: 4, position: 'relative', height: `${Math.max(4, (d.count / maxIngestion) * 50)}px` }}>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--accent)', borderRadius: 4, height: `${Math.max(4, (d.count / maxIngestion) * 50)}px` }} />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{fmtDate(d.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Tipologie discrepanze</div>
            <div style={{ padding: '16px 20px' }} className="q-bar-chart">
              {stats.discrepancy_histogram.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nessuna discrepanza registrata</div>
              ) : stats.discrepancy_histogram.slice(0, 6).map(d => (
                <div key={d.discrepancy_type} className="q-bar-row">
                  <div className="q-bar-label">{discTypeLabel[d.discrepancy_type] ?? d.discrepancy_type}</div>
                  <div className="q-bar-track"><div className="q-bar-fill" style={{ width: `${(d.count / maxDisc) * 100}%` }} /></div>
                  <div className="q-bar-value">{d.count}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Documenti recenti — full-width inside the grid */}
        {stats.recent_documents && stats.recent_documents.length > 0 && (
          <Card style={{ overflow: 'hidden', gridColumn: '1 / -1' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Documenti recenti</div>
            <table className="q-tbl">
              <thead>
                <tr>
                  <th>Tipo</th><th>Fornitore</th><th>Status</th><th>Data</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_documents.map((d: Document) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }}
                    onClick={() => window.location.href = (d.source === 'whatsapp' || d.source === 'image') ? '/v2/inbox' : '/v2/reconciliations'}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{d.doc_type_display}</td>
                    <td style={{ fontWeight: 500, fontSize: 12 }}>{d.supplier_name || '—'}</td>
                    <td><Pill variant={d.status === 'processed' ? 'ok' : d.status === 'error' ? 'err' : 'warn'}>{d.status_display}</Pill></td>
                    <td style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{fmtDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}
