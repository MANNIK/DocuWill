'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getReconciliations } from '@/lib/api'
import type { Reconciliation } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

export default function ReconciliationsPage() {
  const [recs, setRecs] = useState<Reconciliation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getReconciliations()
      .then(setRecs)
      .finally(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Riconciliazioni</h1>
        <p className="text-sm text-gray-500 mt-1">Confronti automatici tra documenti complementari.</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Caricamento...</p>
      ) : recs.length === 0 ? (
        <p className="text-sm text-gray-400">Nessuna riconciliazione. Carica almeno due documenti complementari.</p>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Documento 1', 'Documento 2', 'Confidenza', 'Discrepanze', 'Status', 'Data', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recs.map(rec => {
                const errors = rec.discrepancy_list.filter(d => d.severity === 'error').length
                const warnings = rec.discrepancy_list.filter(d => d.severity === 'warning').length
                return (
                  <tr key={rec.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{rec.doc1.doc_type_display}</p>
                      <p className="text-xs text-gray-400">{rec.doc1.supplier_name || rec.doc1.original_filename}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{rec.doc2.doc_type_display}</p>
                      <p className="text-xs text-gray-400">{rec.doc2.supplier_name || rec.doc2.original_filename}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${rec.match_confidence}%` }} />
                        </div>
                        <span className="text-xs text-gray-600 tabular-nums">{rec.match_confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {errors === 0 && warnings === 0 ? (
                        <span className="text-xs text-green-600 font-medium">Nessuna</span>
                      ) : (
                        <div className="flex gap-2">
                          {errors > 0 && <span className="text-xs text-red-600 font-medium">{errors} err</span>}
                          {warnings > 0 && <span className="text-xs text-orange-600">{warnings} warn</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={rec.status} label={rec.status_display} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(rec.created_at)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/reconciliations/${rec.id}`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                      >
                        Dettaglio →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
