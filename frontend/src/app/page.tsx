'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getDocuments, getDocument, resetDatabase } from '@/lib/api'
import type { Document } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import UploadZone from '@/components/UploadZone'
import { IconTrash } from '@/components/Icons'

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
    try { setDocs(await getDocuments()) }
    finally { setLoading(false) }
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
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Documenti</h1>
          <p className="text-sm text-gray-500 mt-1">Carica documenti per avviare la riconciliazione automatica</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg transition-colors"
        >
          <IconTrash size={13} />
          Pulisci tutto
        </button>
      </div>

      {/* Upload zones */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Doc 1 — File tabulare</p>
          <UploadZone accept=".csv,.xlsx,.xls" hint=".csv, .xlsx, .xls" onUploaded={handleUploaded} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Doc 2 — Foto documento</p>
          <UploadZone accept=".jpg,.jpeg,.png,.webp" hint=".jpg, .png, .webp" onUploaded={handleUploaded} imageMode />
        </div>
      </div>

      {/* Documents table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          Nessun documento caricato
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden ring-1 ring-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['File', 'Tipo', 'Fornitore', 'N. Doc', 'Totale', 'Fonte', 'Status', 'Caricato', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs text-gray-500 max-w-36 truncate" title={doc.original_filename}>
                    {doc.original_filename || '—'}
                  </td>
                  <td className="px-4 py-3.5 text-gray-700 font-medium">{doc.doc_type_display}</td>
                  <td className="px-4 py-3.5 text-gray-600">{doc.supplier_name || '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400">{doc.document_number || '—'}</td>
                  <td className="px-4 py-3.5 text-gray-700 tabular-nums">{fmt(doc.total_amount)}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={doc.source} label={doc.source_display} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={doc.status} label={doc.status_display} />
                      {pollingIds.has(doc.id) && (
                        <span className="text-xs text-blue-400 animate-pulse">elaborando…</span>
                      )}
                    </div>
                    {doc.status === 'error' && doc.error_message && (
                      <p className="text-xs text-red-400 mt-0.5 max-w-48 truncate" title={doc.error_message}>
                        {doc.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(doc.created_at)}</td>
                  <td className="px-4 py-3.5">
                    <Link href={`/documents/${doc.id}`} className="text-xs font-medium text-blue-500 hover:text-blue-700 whitespace-nowrap transition-colors">
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
