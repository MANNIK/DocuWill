'use client'
import { useState, useEffect } from 'react'
import Card from '@/components/v2/Card'
import Pill from '@/components/v2/Pill'
import EmptyState from '@/components/v2/EmptyState'
import { Suppliers as SuppliersIcon, Database, Tag } from '@/components/v2/Icons'
import { getSuppliers, getSupplier } from '@/lib/api'
import type { Supplier, SupplierDetail } from '@/lib/api'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSuppliers().then(s => { setSuppliers(s); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function selectSupplier(name: string) {
    setSelected(name)
    setDetail(null)
    setLoadingDetail(true)
    try { setDetail(await getSupplier(name)) }
    catch { /* noop */ } finally { setLoadingDetail(false) }
  }

  const docTypeLabels: Record<string, string> = {
    order: 'Ordine', invoice: 'Fattura', ddt: 'DDT', packing_list: 'Packing List',
    price_list: 'Tariffario', shipment: 'Spedizione', confirmation: 'Conferma',
    summary: 'Riepilogo', inventory: 'Inventario', unknown: 'Sconosciuto',
  }

  const colMapLabels: Record<string, string> = {
    item_code: 'Codice articolo', description: 'Descrizione', quantity: 'Quantità',
    unit: 'Unità', unit_price: 'Prezzo unitario', total_price: 'Totale', discount: 'Sconto', ignore: '—',
  }

  return (
    <div className="q-content tight q-fade-in" style={{ flexDirection: 'row', padding: 0 }}>
      {/* Master list */}
      <div className="q-master" style={{ minWidth: 280, maxWidth: 320, background: 'var(--bg-elev)', borderRight: '1px solid var(--border)' }}>
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Fornitori ({suppliers.length})
        </div>
        {loading ? (
          <div className="q-empty"><div className="q-empty-title">Caricamento…</div></div>
        ) : suppliers.length === 0 ? (
          <EmptyState icon={<SuppliersIcon size={28} />} title="Nessun fornitore" description="I fornitori appaiono dopo il primo upload." />
        ) : suppliers.map(s => (
          <button key={s.name} onClick={() => selectSupplier(s.name)}
            style={{
              width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none',
              borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 100ms',
              background: selected === s.name ? 'var(--accent-soft)' : 'transparent',
              color: selected === s.name ? 'var(--accent-ink)' : 'var(--text)',
            }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: selected === s.name ? 'var(--accent-ink)' : 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 10 }}>
              <span>{s.doc_count} doc</span>
              <span>match {s.match_rate}%</span>
              <span>{fmtDate(s.last_upload)}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Detail */}
      <div className="q-detail" style={{ flex: 1 }}>
        {!selected ? (
          <EmptyState icon={<SuppliersIcon size={32} />} title="Seleziona un fornitore" description="Fai click su un fornitore per vedere le statistiche e la cache mapping." />
        ) : loadingDetail ? (
          <div className="q-empty"><div className="q-empty-title">Caricamento…</div></div>
        ) : detail ? (<>
          <div>
            <h2 className="q-display">{detail.name}</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <span className="q-pill accent">{detail.doc_count} documenti</span>
              <Pill variant={detail.match_rate >= 80 ? 'ok' : detail.match_rate >= 50 ? 'warn' : 'err'}>
                Match rate {detail.match_rate}%
              </Pill>
            </div>
          </div>

          {/* Docs by type */}
          <Card>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Documenti per tipo</div>
            <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(detail.docs_by_type).map(([type, count]) => (
                <span key={type} className="q-pill">
                  <Tag size={11} /> {docTypeLabels[type] ?? type}: <strong>{count}</strong>
                </span>
              ))}
              {Object.keys(detail.docs_by_type).length === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nessun dato</span>}
            </div>
          </Card>

          {/* Cache mappings */}
          <Card>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Database size={14} style={{ color: 'var(--text-faint)' }} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Cache column mapping</span>
              <span className="q-pill" style={{ marginLeft: 'auto' }}>{detail.cached_mappings.length} chiavi</span>
            </div>
            {detail.cached_mappings.length === 0 ? (
              <div className="q-empty" style={{ padding: 24 }}>
                <div className="q-empty-title">Nessuna cache trovata</div>
                <div className="q-empty-desc">Il mapping viene memorizzato al primo upload. Ricarica un CSV di questo fornitore.</div>
              </div>
            ) : (
              <div style={{ overflow: 'auto' }}>
                <table className="q-tbl">
                  <thead>
                    <tr><th>Fingerprint</th><th>Tipo doc</th><th>Colonne mappate</th><th>TTL</th></tr>
                  </thead>
                  <tbody>
                    {detail.cached_mappings.map(m => (
                      <tr key={m.headers_fingerprint}>
                        <td><span className="q-mono" style={{ fontSize: 11 }}>{m.headers_fingerprint}</span></td>
                        <td><span className="q-pill">{m.doc_type}</span></td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {Object.entries(m.mapping).filter(([, v]) => v !== 'ignore').map(([col, field]) => (
                              <span key={col} className="q-pill accent" style={{ fontSize: 11 }}>
                                {col} → {colMapLabels[field] ?? field}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.ttl_days}gg</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>) : (
          <EmptyState title="Errore caricamento" description="Impossibile caricare i dati del fornitore." />
        )}
      </div>
    </div>
  )
}
