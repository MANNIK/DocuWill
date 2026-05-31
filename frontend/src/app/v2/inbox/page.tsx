'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/v2/Card'
import Pill, { statusToPillVariant } from '@/components/v2/Pill'
import EmptyState from '@/components/v2/EmptyState'
import Btn from '@/components/v2/Btn'
import ImagePreview from '@/components/v2/ImagePreview'
import { Whatsapp, Camera, Check, ArrowRight, X } from '@/components/v2/Icons'
import { getWhatsAppInbox, getDocument } from '@/lib/api'
import type { Document, DocumentRow } from '@/lib/api'

function initials(name: string) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtNum(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? String(v) : n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function inboxStatus(doc: Document) {
  if (doc.status === 'error') return 'error'
  if (doc.status === 'pending') return 'pending'
  return 'processed'
}

function RowsModal({ docId, onClose }: { docId: number; onClose: () => void }) {
  const [rows, setRows] = useState<DocumentRow[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getDocument(docId)
      .then(d => setRows(d.rows ?? []))
      .catch(() => setError(true))
  }, [docId])

  const handleBackdrop = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        background: 'var(--bg-elev)', borderRadius: 'var(--radius)', width: '100%',
        maxWidth: 900, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Righe estratte via OCR</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'flex', borderRadius: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          {error ? (
            <div style={{ padding: 24, color: 'var(--err)', fontSize: 13 }}>Errore nel caricamento delle righe.</div>
          ) : rows === null ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Caricamento…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Nessuna riga estratta per questo documento.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)', position: 'sticky', top: 0 }}>
                  {['#', 'Codice', 'Descrizione', 'Qtà', 'U.M.', 'Prezzo unit.', 'Totale', 'Sconto'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.row_index ?? i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{row.item_code || '—'}</td>
                    <td style={{ padding: '8px 12px', maxWidth: 260 }}>{row.description || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.quantity !== null && row.quantity !== undefined ? row.quantity : '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.unit || '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmtNum(row.unit_price)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>{fmtNum(row.total_price)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{row.discount ? `${row.discount}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InboxPage() {
  const [messages, setMessages] = useState<Document[]>([])
  const [selected, setSelected] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [rowsModalDocId, setRowsModalDocId] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    getWhatsAppInbox().then(m => { setMessages(m); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <>
      {rowsModalDocId !== null && (
        <RowsModal docId={rowsModalDocId} onClose={() => setRowsModalDocId(null)} />
      )}

      <div className="q-content tight q-fade-in" style={{ flexDirection: 'row', padding: 0 }}>
        {/* Master */}
        <div className="q-master" style={{ minWidth: 300, maxWidth: 340, background: 'var(--bg-elev)' }}>
          <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Whatsapp size={14} style={{ color: '#25d366' }} /> Inbox WhatsApp ({messages.length})
          </div>
          {loading ? (
            <div className="q-empty"><div className="q-empty-title">Caricamento…</div></div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<Whatsapp size={28} />}
              title="Inbox vuota"
              description="I messaggi WhatsApp e le immagini caricate appaiono qui."
            />
          ) : messages.map(m => (
            <button key={m.id} onClick={() => setSelected(m)}
              style={{
                width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none',
                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: selected?.id === m.id ? 'var(--accent-soft)' : 'transparent',
                color: selected?.id === m.id ? 'var(--accent-ink)' : 'var(--text)',
                transition: 'background 100ms',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 999, background: 'linear-gradient(135deg, #dcf8c6, #128c7e)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#075e54' }}>
                  {initials(m.supplier_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.supplier_name || m.original_filename || `Messaggio #${m.id}`}
                  </div>
                  <div style={{ fontSize: 11, color: selected?.id === m.id ? 'var(--accent-ink)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.source === 'whatsapp' ? '📱 WhatsApp' : '📷 Immagine caricata'} · {fmtDate(m.created_at)}
                  </div>
                </div>
                <Pill variant={statusToPillVariant(inboxStatus(m))} >{m.status_display}</Pill>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="q-detail" style={{ flex: 1 }}>
          {!selected ? (
            <EmptyState icon={<Camera size={32} />} title="Seleziona un messaggio" description="Fai click su un elemento per vedere il dettaglio e i dati OCR estratti." />
          ) : (
            <div className="q-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 className="q-display" style={{ fontSize: 20 }}>{selected.supplier_name || `Messaggio #${selected.id}`}</h2>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Pill variant={statusToPillVariant(inboxStatus(selected))}>{selected.status_display}</Pill>
                    <span className="q-pill">{selected.source_display}</span>
                    {selected.doc_type !== 'unknown' && <span className="q-pill accent">{selected.doc_type_display}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(selected.row_count ?? 0) > 0 && (
                    <Btn variant="ghost" size="sm" onClick={() => setRowsModalDocId(selected.id)}>
                      Righe OCR ({selected.row_count})
                    </Btn>
                  )}
                  <Btn variant="primary" size="sm" onClick={() => router.push('/v2/reconciliations')}><ArrowRight size={12} /> Riconciliazioni</Btn>
                </div>
              </div>

              {/* Foto documento */}
              <Card>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
                  Documento ricevuto
                </div>
                <div style={{ padding: 16 }}>
                  <ImagePreview document={selected} />
                </div>
              </Card>

              {/* Metadati OCR */}
              <Card>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Dati estratti via OCR</div>
                <div style={{ padding: '14px 16px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[
                    ['Fornitore', selected.supplier_name || '—'],
                    ['N. Documento', selected.document_number || '—'],
                    ['Data', selected.document_date || '—'],
                    ['Tipo', selected.doc_type_display],
                    ['Totale', selected.total_amount ? `€${parseFloat(selected.total_amount).toLocaleString('it-IT')}` : '—'],
                    ['Righe estratte', String(selected.row_count ?? selected.rows?.length ?? 0)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Status */}
              {selected.status === 'error' && selected.error_message && (
                <div style={{ padding: '12px 14px', background: 'var(--err-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--err)', fontSize: 13 }}>
                  Errore elaborazione: {selected.error_message}
                </div>
              )}
              {selected.status === 'processed' && (
                <div style={{ padding: '12px 14px', background: 'var(--ok-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--ok)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={14} /> Documento elaborato con successo. Controlla le riconciliazioni per vedere il matching.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
