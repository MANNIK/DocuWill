'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { getReconciliation, reviewReconciliation } from '@/lib/api'
import type { Reconciliation, Document } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'

function fmt(amount: string | null) {
  if (!amount) return null
  return `€${parseFloat(amount).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function DocCard({ doc, label }: { doc: Document; label: string }) {
  return (
    <div className="bg-white shadow-sm rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
        <StatusBadge status={doc.status} label={doc.status_display} />
      </div>
      <p className="font-semibold text-gray-900">{doc.doc_type_display}</p>
      <p className="text-sm text-gray-600 mt-0.5">{doc.supplier_name || '—'}</p>
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        <span>#{doc.document_number || '—'}</span>
        <span>{doc.document_date || '—'}</span>
        <span>{doc.rows.length} righe</span>
      </div>
      {fmt(doc.total_amount) && (
        <p className="text-sm font-medium text-gray-800 mt-2">{fmt(doc.total_amount)}</p>
      )}
      <p className="text-xs text-gray-400 mt-1 font-mono truncate">{doc.original_filename}</p>
    </div>
  )
}

export default function ReconciliationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [rec, setRec] = useState<Reconciliation | null>(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    getReconciliation(Number(id))
      .then(data => {
        setRec(data)
        setNotes(data.operator_notes)
      })
      .finally(() => setLoading(false))
  }, [id])

  async function handleReview(status: 'approved' | 'rejected' | 'corrected') {
    if (!rec) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      setRec(await reviewReconciliation(rec.id, status, notes))
    } catch {
      setSubmitError('Operazione fallita. Riprova.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <main className="max-w-7xl mx-auto px-4 py-8"><p className="text-sm text-gray-400">Caricamento...</p></main>
  }
  if (!rec) {
    return <main className="max-w-7xl mx-auto px-4 py-8"><p className="text-sm text-red-500">Riconciliazione non trovata.</p></main>
  }

  const errors = rec.discrepancy_list.filter(d => d.severity === 'error')
  const warnings = rec.discrepancy_list.filter(d => d.severity === 'warning')
  const infos = rec.discrepancy_list.filter(d => d.severity === 'info')
  const ordered = [...errors, ...warnings, ...infos]
  const canReview = rec.status === 'pending'

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button onClick={() => router.back()} className="text-xs text-gray-400 hover:text-gray-600 mb-2 block">
            ← Torna indietro
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Riconciliazione #{rec.id}</h1>
        </div>
        <div className="flex items-center gap-3 mt-6">
          <span className="text-sm text-gray-500">
            Confidenza: <span className="font-semibold text-gray-800">{rec.match_confidence}%</span>
          </span>
          <StatusBadge status={rec.status} label={rec.status_display} />
        </div>
      </div>

      {/* Documenti affiancati */}
      <div className="grid grid-cols-2 gap-4">
        <DocCard doc={rec.doc1} label="Documento 1" />
        <DocCard doc={rec.doc2} label="Documento 2" />
      </div>

      {/* Discrepanze */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <h2 className="font-medium text-gray-900">Discrepanze</h2>
          {errors.length > 0 && (
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">{errors.length} errori</span>
          )}
          {warnings.length > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">{warnings.length} warning</span>
          )}
          {infos.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{infos.length} info</span>
          )}
          {ordered.length === 0 && (
            <span className="text-xs text-green-600 font-medium">Nessuna discrepanza — documenti allineati</span>
          )}
        </div>
        {ordered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Tipo', 'Campo', 'Valore Doc 1', 'Valore Doc 2', 'Severità'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ordered.map(d => (
                <tr
                  key={d.id}
                  className={
                    d.severity === 'error' ? 'bg-red-50/60' :
                    d.severity === 'warning' ? 'bg-orange-50/40' : ''
                  }
                >
                  <td className="px-4 py-2.5 text-gray-700">{d.discrepancy_type_display}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{d.field_name}</td>
                  <td className="px-4 py-2.5 text-gray-800">{d.value_doc1 || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-800">{d.value_doc2 || '—'}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={d.severity} label={d.severity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pannello revisione */}
      <div className="bg-white shadow-sm rounded-lg p-4">
        <h2 className="font-medium text-gray-900 mb-3">Revisione operatore</h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={!canReview}
          placeholder="Note opzionali per questa revisione..."
          rows={3}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-gray-50 disabled:text-gray-400"
        />
        {canReview ? (
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => handleReview('approved')}
              disabled={submitting}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Approva
            </button>
            <button
              onClick={() => handleReview('rejected')}
              disabled={submitting}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Rifiuta
            </button>
            <button
              onClick={() => handleReview('corrected')}
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Correggi e chiudi
            </button>
            {submitError && <p className="text-xs text-red-500 ml-2">{submitError}</p>}
          </div>
        ) : (
          <div className="mt-2">
            {rec.operator_notes && <p className="text-sm text-gray-500 italic">{rec.operator_notes}</p>}
            <p className="text-xs text-gray-400 mt-1">Revisione completata — stato: {rec.status_display}</p>
          </div>
        )}
      </div>
    </main>
  )
}
