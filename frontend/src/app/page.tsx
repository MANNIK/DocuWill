'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getDocuments, getDocument, resetDatabase } from '@/lib/api'
import type { Document } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import UploadZone from '@/components/UploadZone'

function fmt(amount: string | null) {
  if (!amount) return '—'
  return `€${parseFloat(amount).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

export default function Dashboard() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [pollingIds, setPollingIds] = useState<Set<number>>(new Set())

  const reload = useCallback(async () => {
    try {
      setDocs(await getDocuments())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (pollingIds.size === 0) return
    const timer = setInterval(async () => {
      const results = await Promise.all([...pollingIds].map(id => getDocument(id).catch(() => null)))
      const stillPending = new Set<number>()
      let changed = false
      results.forEach(doc => {
        if (!doc) return
        if (doc.status === 'pending') stillPending.add(doc.id)
        else changed = true
      })
      setPollingIds(stillPending)
      if (changed) reload()
    }, 2000)
    return () => clearInterval(timer)
  }, [pollingIds, reload])

  function handleUploaded(docId: number) {
    setPollingIds(prev => new Set([...prev, docId]))
    reload()
  }

  async function handleReset() {
    if (!confirm('Eliminare tutti i documenti e le riconciliazioni?')) return
    await resetDatabase()
    setPollingIds(new Set())
    reload()
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Documenti</h1>
          <p className="text-sm text-gray-500 mt-1">Carica documenti per avviare la riconciliazione automatica.</p>
        </div>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
        >
          Pulisci tutto
        </button>
      </div>

      {/* Zone di upload affiancate */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Doc 1 — File tabulare</p>
          <UploadZone
            accept=".csv,.xlsx,.xls"
            hint="CSV o Excel — .csv, .xlsx, .xls"
            onUploaded={handleUploaded}
          />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Doc 2 — Foto documento (simulazione WhatsApp)</p>
          <UploadZone
            accept=".jpg,.jpeg,.png,.webp"
            hint="Foto del documento cartaceo — .jpg, .png, .webp"
            onUploaded={handleUploaded}
            imageMode
          />
        </div>
      </div>

      {/* Tabella documenti */}
      {loading ? (
        <p className="text-sm text-gray-400">Caricamento...</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-400">Nessun documento caricato.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['File', 'Tipo', 'Fornitore', 'Numero doc', 'Totale', 'Fonte', 'Status', 'Caricato', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-36 truncate" title={doc.original_filename}>
                    {doc.original_filename || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{doc.doc_type_display}</td>
                  <td className="px-4 py-3 text-gray-700">{doc.supplier_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{doc.document_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{fmt(doc.total_amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.source} label={doc.source_display} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} label={doc.status_display} />
                      {pollingIds.has(doc.id) && (
                        <span className="text-xs text-gray-400 animate-pulse">elaborando…</span>
                      )}
                    </div>
                    {doc.status === 'error' && doc.error_message && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-48 truncate" title={doc.error_message}>
                        {doc.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                    >
                      Dettaglio →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
