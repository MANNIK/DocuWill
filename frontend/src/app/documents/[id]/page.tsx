'use client'
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getDocument } from '@/lib/api'
import type { Document, DocumentRow } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'

function fmt(v: string | null | undefined, prefix = '') {
  if (v === null || v === undefined || v === '') return '—'
  const n = parseFloat(v)
  if (isNaN(n)) return v
  return `${prefix}${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
      <span className="text-xs text-gray-800">{value}</span>
    </div>
  )
}

export default function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocument(Number(id))
      .then(setDoc)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <main className="max-w-7xl mx-auto px-4 py-8"><p className="text-sm text-gray-400">Caricamento...</p></main>
  }
  if (!doc) {
    return <main className="max-w-7xl mx-auto px-4 py-8"><p className="text-sm text-red-500">Documento non trovato.</p></main>
  }

  const hasNumericData = doc.rows.some(r => r.quantity || r.unit_price || r.total_price)

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 mb-2 block">
            ← Torna indietro
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{doc.doc_type_display}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{doc.original_filename}</p>
        </div>
        <div className="flex items-center gap-2 mt-6">
          <StatusBadge status={doc.source} label={doc.source_display} />
          <StatusBadge status={doc.status} label={doc.status_display} />
        </div>
      </div>

      {/* Metadati */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h2 className="text-sm font-medium text-gray-900 mb-3">Metadati estratti</h2>
        <div className="space-y-1.5">
          <MetaRow label="Fornitore" value={doc.supplier_name} />
          <MetaRow label="Numero documento" value={doc.document_number} />
          <MetaRow label="Data documento" value={doc.document_date ?? ''} />
          <MetaRow label="Totale" value={doc.total_amount ? fmt(doc.total_amount, '€') : ''} />
        </div>
        {doc.status === 'error' && doc.error_message && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            <span className="font-medium">Errore elaborazione: </span>{doc.error_message}
          </div>
        )}
      </div>

      {/* Righe estratte */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <h2 className="font-medium text-gray-900">Righe estratte</h2>
          <span className="text-xs text-gray-400">{doc.rows.length} righe</span>
        </div>

        {doc.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">
            {doc.status === 'pending' ? 'Elaborazione in corso…' : 'Nessuna riga estratta.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Codice</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Descrizione</th>
                  {hasNumericData && <>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Qtà</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">UM</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Prezzo unit.</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Totale</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Sconto</th>
                  </>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {doc.rows.map((row: DocumentRow) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums">{row.row_index + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.item_code || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate" title={row.description}>
                      {row.description || '—'}
                    </td>
                    {hasNumericData && <>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(row.quantity)}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{row.unit || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(row.unit_price, '€')}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">{fmt(row.total_price, '€')}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                        {row.discount ? `${fmt(row.discount)}%` : '—'}
                      </td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link alle riconciliazioni */}
      <div className="text-sm text-gray-500">
        Vuoi vedere le riconciliazioni?{' '}
        <Link href="/reconciliations" className="text-blue-600 hover:text-blue-800 font-medium">
          Vai alle riconciliazioni →
        </Link>
      </div>
    </main>
  )
}
