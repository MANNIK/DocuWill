'use client'
import { useState, useEffect, useCallback } from 'react'
import { getDocuments, getDocument } from '@/lib/api'
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

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Documenti</h1>
        <p className="text-sm text-gray-500 mt-1">Carica CSV o Excel per avviare la riconciliazione automatica.</p>
      </div>

      <div className="mb-8">
        <UploadZone onUploaded={handleUploaded} />
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Caricamento...</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-gray-400">Nessun documento caricato.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['File', 'Tipo', 'Fornitore', 'Numero doc', 'Totale', 'Status', 'Caricato'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 max-w-40 truncate" title={doc.original_filename}>
                    {doc.original_filename || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{doc.doc_type_display}</td>
                  <td className="px-4 py-3 text-gray-700">{doc.supplier_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{doc.document_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{fmt(doc.total_amount)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
