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
    getReconciliations().then(setRecs).finally(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Riconciliazioni</h1>
        <p className="text-sm text-gray-500 mt-1">Confronti automatici tra documenti complementari</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : recs.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">
          Nessuna riconciliazione. Carica almeno due documenti complementari.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden ring-1 ring-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {['Documento 1', 'Documento 2', 'Confidenza', 'Discrepanze', 'Status', 'Data', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recs.map(rec => {
                const errors = rec.discrepancy_list.filter(d => d.severity === 'error').length
                const warnings = rec.discrepancy_list.filter(d => d.severity === 'warning').length
                return (
                  <tr key={rec.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-gray-800">{rec.doc1.doc_type_display}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{rec.doc1.supplier_name || rec.doc1.original_filename}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-gray-800">{rec.doc2.doc_type_display}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{rec.doc2.supplier_name || rec.doc2.original_filename}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${rec.match_confidence >= 70 ? 'bg-green-400' : rec.match_confidence >= 40 ? 'bg-blue-400' : 'bg-orange-400'}`}
                            style={{ width: `${rec.match_confidence}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-500 tabular-nums">{rec.match_confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {errors === 0 && warnings === 0 ? (
                        <span className="text-xs font-medium text-green-600">Nessuna</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {errors > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                              {errors}
                            </span>
                          )}
                          {warnings > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
                              {warnings}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={rec.status} label={rec.status_display} /></td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(rec.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <Link href={`/reconciliations/${rec.id}`} className="text-xs font-medium text-blue-500 hover:text-blue-700 whitespace-nowrap transition-colors">
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
