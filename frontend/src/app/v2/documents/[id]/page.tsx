'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/v2/Card'
import Pill, { statusToPillVariant } from '@/components/v2/Pill'
import ImagePreview from '@/components/v2/ImagePreview'
import { getDocument } from '@/lib/api'
import type { Document } from '@/lib/api'

function fmtAmount(v: string | null) {
  if (!v) return '—'
  const n = parseFloat(v)
  return isNaN(n) ? v : `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setDoc(await getDocument(+id))
    } catch {
      setError('Documento non trovato.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="q-content">
      <div className="q-empty"><div className="q-empty-title">Caricamento documento…</div></div>
    </div>
  )

  if (error || !doc) return (
    <div className="q-content">
      <Link href="/v2" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>← Dashboard</Link>
      <div className="q-empty" style={{ marginTop: 24 }}>
        <div className="q-empty-title">{error ?? 'Documento non trovato'}</div>
      </div>
    </div>
  )

  const isImage = doc.source === 'image' || doc.source === 'whatsapp'
  const hasImage = !!(doc.file || doc.file_url)

  const meta: [string, string][] = [
    ['Tipo', doc.doc_type_display],
    ['Fornitore', doc.supplier_name || '—'],
    ['N. documento', doc.document_number || '—'],
    ['Data documento', fmtDate(doc.document_date)],
    ['Totale', fmtAmount(doc.total_amount)],
    ['Origine', doc.source_display],
    ['File', doc.original_filename || '—'],
    ['Caricato il', fmtDate(doc.created_at)],
  ]

  return (
    <div className="q-content q-fade-in">
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Link href="/v2" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>← Dashboard</Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            {doc.doc_type_display}{doc.document_number ? ` · ${doc.document_number}` : ''}
          </h2>
          {doc.supplier_name && (
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{doc.supplier_name}</p>
          )}
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Pill variant={statusToPillVariant(doc.status)}>{doc.status_display}</Pill>
        </span>
      </div>

      {/* Banner errore */}
      {doc.status === 'error' && doc.error_message && (
        <div style={{ padding: '10px 14px', background: 'var(--err-soft)', color: 'var(--err)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          {doc.error_message}
        </div>
      )}

      <div className="q-grid-2" style={{ alignItems: 'start' }}>
        {/* Metadati */}
        <Card>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Dettagli documento</div>
          <div style={{ padding: '8px 0' }}>
            {meta.map(([label, val]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 16px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 100, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-all' }}>{val}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Anteprima immagine (solo doc OCR/WhatsApp) */}
        {isImage && (
          <Card>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
              {doc.source === 'whatsapp' ? 'Messaggio WhatsApp' : 'Immagine documento'}
            </div>
            <div style={{ padding: 16 }}>
              {hasImage
                ? <ImagePreview document={doc} />
                : <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nessuna anteprima disponibile</div>
              }
            </div>
          </Card>
        )}
      </div>

      {/* Tabella righe */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
          Righe estratte ({doc.rows?.length ?? 0})
        </div>
        {doc.rows && doc.rows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="q-tbl">
              <thead>
                <tr>
                  <th>Codice</th>
                  <th>Descrizione</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>Unità</th>
                  <th style={{ textAlign: 'right' }}>Prezzo unit.</th>
                  <th style={{ textAlign: 'right' }}>Totale</th>
                  <th style={{ textAlign: 'right' }}>Sconto</th>
                </tr>
              </thead>
              <tbody>
                {doc.rows.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.item_code || '—'}</td>
                    <td>{row.description || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{row.quantity ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{row.unit || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{row.unit_price ? `€${parseFloat(row.unit_price).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{row.total_price ? `€${parseFloat(row.total_price).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{row.discount ? `${parseFloat(row.discount).toLocaleString('it-IT')}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="q-empty" style={{ padding: 28 }}>
            <div className="q-empty-title">Nessuna riga estratta</div>
            <div className="q-empty-sub">
              {doc.status === 'pending' ? 'Elaborazione in corso…' : 'Il documento non contiene righe dati.'}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
