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

// Un documento è "standard" se la maggioranza delle righe ha item_code.
// I tariffari hanno unit_price ma non item_code → non-standard → tabella dinamica.
function isStandardDoc(rows: DocumentRow[]): boolean {
  if (!rows.length) return true
  const withCode = rows.filter(r => r.item_code).length
  return withCode / rows.length > 0.5
}

// Raccoglie tutte le chiavi uniche di raw_data di tutte le righe
function getRawDataColumns(rows: DocumentRow[]): string[] {
  const keys = new Set<string>()
  rows.forEach(r => Object.keys(r.raw_data ?? {}).forEach(k => keys.add(k)))
  return Array.from(keys)
}

// Tabella a colonne fisse per documenti standard (ordini, fatture, DDT)
function StandardTable({ rows }: { rows: DocumentRow[] }) {
  const hasNumeric = rows.some(r => r.quantity || r.unit_price || r.total_price)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">#</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Codice</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Descrizione</th>
            {hasNumeric && <>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Qtà</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">UM</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Prezzo unit.</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Totale</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Sconto</th>
            </>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums">{row.row_index + 1}</td>
              <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.item_code || '—'}</td>
              <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate" title={row.description}>{row.description || '—'}</td>
              {hasNumeric && <>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(row.quantity)}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{row.unit || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmt(row.unit_price, '€')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">{fmt(row.total_price, '€')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{row.discount ? `${fmt(row.discount)}%` : '—'}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Tabella dinamica per documenti non-standard (tariffari, zone, supplementi…)
// Le colonne vengono dai nomi reali dell'header CSV salvati in raw_data
function DynamicTable({ rows }: { rows: DocumentRow[] }) {
  const columns = getRawDataColumns(rows)
  if (!columns.length) return <p className="px-4 py-6 text-sm text-gray-400">Nessun dato grezzo disponibile.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">#</th>
            {columns.map(col => (
              <th key={col} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums">{row.row_index + 1}</td>
              {columns.map(col => (
                <td key={col} className="px-4 py-2.5 text-gray-700 tabular-nums whitespace-nowrap">
                  {row.raw_data?.[col] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [doc, setDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocument(Number(id)).then(setDoc).finally(() => setLoading(false))
  }, [id])

  if (loading) return <main className="max-w-7xl mx-auto px-4 py-8"><p className="text-sm text-gray-400">Caricamento...</p></main>
  if (!doc) return <main className="max-w-7xl mx-auto px-4 py-8"><p className="text-sm text-red-500">Documento non trovato.</p></main>

  const standard = isStandardDoc(doc.rows)

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 mb-2 block">← Torna indietro</button>
          <h1 className="text-xl font-semibold text-gray-900">{doc.doc_type_display}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{doc.original_filename}</p>
        </div>
        <div className="flex items-center gap-2 mt-6">
          <StatusBadge status={doc.source} label={doc.source_display} />
          <StatusBadge status={doc.status} label={doc.status_display} />
        </div>
      </div>

      {/* Metadati */}
      <div className="bg-white shadow-sm rounded-lg p-4">
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
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <h2 className="font-medium text-gray-900">Righe estratte</h2>
          <span className="text-xs text-gray-400">{doc.rows.length} righe</span>
          {!standard && (
            <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
              tabella adattiva — colonne dai dati originali
            </span>
          )}
        </div>
        {doc.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">
            {doc.status === 'pending' ? 'Elaborazione in corso…' : 'Nessuna riga estratta.'}
          </p>
        ) : standard ? (
          <StandardTable rows={doc.rows} />
        ) : (
          <DynamicTable rows={doc.rows} />
        )}
      </div>

      {/* Dati avanzati */}
      <details className="group bg-white shadow-sm rounded-lg overflow-hidden">
        <summary className="px-4 py-3 cursor-pointer flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 select-none">
          <span>Dati avanzati</span>
          <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">

          {/* Confidenza classificazione */}
          {doc.extracted_data?.doc_type_confidence !== undefined && (
            <div className="pt-3">
              <p className="text-xs text-gray-500 mb-1">Confidenza classificazione</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${doc.extracted_data.doc_type_confidence}%` }} />
                </div>
                <span className="text-xs text-gray-600 tabular-nums w-8">{doc.extracted_data.doc_type_confidence}%</span>
              </div>
            </div>
          )}

          {/* Dati logistici aggregati */}
          {doc.extracted_data?.file_summary && Object.keys(doc.extracted_data.file_summary).length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Dati logistici aggregati del file</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(doc.extracted_data.file_summary).map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded px-3 py-2">
                    <p className="text-xs text-gray-400">{k}</p>
                    <p className="text-sm font-medium text-gray-800 tabular-nums">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Campi originali CSV — mostrati solo per doc standard (quelli non-standard
              li mostrano già nella tabella adattiva principale) */}
          {standard && getRawDataColumns(doc.rows).length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Tutti i campi originali del CSV</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-400">#</th>
                      {getRawDataColumns(doc.rows).map(col => (
                        <th key={col} className="text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {doc.rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{row.row_index + 1}</td>
                        {getRawDataColumns(doc.rows).map(col => (
                          <td key={col} className="px-3 py-2 text-gray-700 whitespace-nowrap tabular-nums">
                            {row.raw_data?.[col] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </details>

      <div className="text-sm text-gray-500">
        <Link href="/reconciliations" className="text-blue-600 hover:text-blue-800 font-medium">← Vai alle riconciliazioni</Link>
      </div>
    </main>
  )
}
