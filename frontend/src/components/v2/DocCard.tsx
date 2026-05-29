'use client'
import { useState } from 'react'
import Card from './Card'
import { FileText, ChevronDown, ChevronRight } from './Icons'
import type { Document, Discrepancy } from '@/lib/api'

interface Props {
  doc: Document
  label: string
  discrepancies: Discrepancy[]
  side: 'doc1' | 'doc2'
}

function fmtAmount(v: string | null) {
  if (!v) return '—'
  const n = parseFloat(v)
  return isNaN(n) ? v : `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`
}

export default function DocCard({ doc, label, discrepancies, side }: Props) {
  const [rowsOpen, setRowsOpen] = useState(false)

  const discrepantFields = new Set(
    discrepancies.map(d => {
      if (d.field_name === 'supplier_name') return 'supplier'
      if (d.field_name === 'document_date') return 'date'
      if (d.field_name === 'total_amount') return 'total'
      return d.field_name
    })
  )

  function isMismatch(field: string) {
    return discrepantFields.has(field)
  }

  const metaRows = [
    ['supplier', 'Fornitore', doc.supplier_name || '—'],
    ['date', 'Data', doc.document_date || '—'],
    ['number', 'N. documento', doc.document_number || '—'],
    ['total', 'Totale', fmtAmount(doc.total_amount)],
    ['rows', 'Righe', String(doc.rows?.length ?? 0)],
  ] as const

  return (
    <Card className="q-doc-card">
      <div style={{ padding: '16px 16px 12px' }}>
        <div className="q-doc-card-header">
          <div className="q-doc-card-icon">
            <FileText size={18} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{doc.doc_type_display}</div>
            {doc.document_number && (
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 1 }}>{doc.document_number}</div>
            )}
          </div>
        </div>

        <div className="q-meta-grid" style={{ marginTop: 10 }}>
          {metaRows.map(([key, label, val]) => (
            <div key={key} className={`q-meta-row${isMismatch(key) ? ' mismatch' : ''}`}>
              <span className="q-meta-key">{label}</span>
              <span className="q-meta-val">{val}</span>
              {isMismatch(key) && <span style={{ marginLeft: 'auto', fontSize: 12 }}>⚠</span>}
            </div>
          ))}
        </div>

        <button className="q-rows-toggle" onClick={() => setRowsOpen(v => !v)} style={{ marginTop: 8 }}>
          {rowsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {rowsOpen ? 'Nascondi' : 'Mostra'} righe originali ({doc.rows?.length ?? 0})
        </button>
      </div>

      {rowsOpen && doc.rows && doc.rows.length > 0 && (
        <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)' }}>
          <table className="q-tbl" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Codice</th><th>Descrizione</th><th>Qty</th><th>Prezzo</th><th>Totale</th>
              </tr>
            </thead>
            <tbody>
              {doc.rows.map(row => (
                <tr key={row.id}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{row.item_code || '—'}</td>
                  <td>{row.description?.slice(0, 40) || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{row.quantity ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{row.unit_price ? `€${parseFloat(row.unit_price).toLocaleString('it-IT')}` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{row.total_price ? `€${parseFloat(row.total_price).toLocaleString('it-IT')}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
