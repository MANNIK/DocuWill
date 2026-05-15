'use client'
import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { getReconciliation, reviewReconciliation } from '@/lib/api'
import type { Reconciliation, Document } from '@/lib/api'
import StatusBadge from '@/components/StatusBadge'
import { IconChevronLeft, IconCheck, IconX } from '@/components/Icons'

function fmt(amount: string | null) {
  if (!amount) return null
  return `€${parseFloat(amount).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function DocCard({ doc, label }: { doc: Document; label: string }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</span>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={doc.source} label={doc.source_display} />
          <StatusBadge status={doc.status} label={doc.status_display} />
        </div>
      </div>
      <p className="font-semibold text-gray-900 text-base">{doc.doc_type_display}</p>
      {doc.supplier_name && <p className="text-sm text-gray-500 mt-0.5">{doc.supplier_name}</p>}
      <div className="flex flex-wrap gap-3 mt-3">
        {doc.document_number && (
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md">#{doc.document_number}</span>
        )}
        {doc.document_date && (
          <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md">{doc.document_date}</span>
        )}
        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-md">{doc.rows.length} righe</span>
      </div>
      {fmt(doc.total_amount) && (
        <p className="text-sm font-semibold text-gray-800 mt-3">{fmt(doc.total_amount)}</p>
      )}
      <p className="text-xs text-gray-400 mt-2 font-mono truncate">{doc.original_filename}</p>
    </div>
  )
}

const severityRow: Record<string, string> = {
  error: 'bg-red-50/70 border-l-2 border-red-400',
  warning: 'bg-orange-50/50 border-l-2 border-orange-300',
  info: 'border-l-2 border-gray-200',
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
      .then(data => { setRec(data); setNotes(data.operator_notes) })
      .finally(() => setLoading(false))
  }, [id])

  async function handleReview(status: 'approved' | 'rejected' | 'corrected') {
    if (!rec) return
    setSubmitting(true)
    setSubmitError(null)
    try { setRec(await reviewReconciliation(rec.id, status, notes)) }
    catch { setSubmitError('Operazione fallita. Riprova.') }
    finally { setSubmitting(false) }
  }

  if (loading) return (
    <main className="max-w-7xl mx-auto px-6 py-8 flex items-center justify-center">
      <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </main>
  )
  if (!rec) return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <p className="text-sm text-red-500">Riconciliazione non trovata.</p>
    </main>
  )

  const errors = rec.discrepancy_list.filter(d => d.severity === 'error')
  const warnings = rec.discrepancy_list.filter(d => d.severity === 'warning')
  const infos = rec.discrepancy_list.filter(d => d.severity === 'info')
  const ordered = [...errors, ...warnings, ...infos]
  const canReview = rec.status === 'pending'

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3 transition-colors"
          >
            <IconChevronLeft size={14} />
            Torna indietro
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Riconciliazione #{rec.id}</h1>
        </div>
        <div className="flex items-center gap-3 mt-6">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${rec.match_confidence >= 70 ? 'bg-green-400' : rec.match_confidence >= 40 ? 'bg-blue-400' : 'bg-orange-400'}`}
                style={{ width: `${rec.match_confidence}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-500">{rec.match_confidence}%</span>
          </div>
          <StatusBadge status={rec.status} label={rec.status_display} />
        </div>
      </div>

      {/* Documenti affiancati */}
      <div className="grid grid-cols-2 gap-4">
        <DocCard doc={rec.doc1} label="Documento 1" />
        <DocCard doc={rec.doc2} label="Documento 2" />
      </div>

      {/* Discrepanze */}
      <div className="bg-white rounded-xl ring-1 ring-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <h2 className="font-semibold text-gray-900">Discrepanze</h2>
          {errors.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />{errors.length} errori
            </span>
          )}
          {warnings.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />{warnings.length} warning
            </span>
          )}
          {infos.length > 0 && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{infos.length} info</span>
          )}
          {ordered.length === 0 && (
            <span className="text-xs text-green-600 font-medium">Nessuna discrepanza — documenti allineati</span>
          )}
        </div>
        {ordered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60">
              <tr>
                {['Tipo', 'Campo', 'Valore Doc 1', 'Valore Doc 2', 'Severità'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ordered.map(d => (
                <tr key={d.id} className={severityRow[d.severity] ?? ''}>
                  <td className="px-5 py-3 text-gray-700 font-medium">{d.discrepancy_type_display}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-400">{d.field_name}</td>
                  <td className="px-5 py-3 text-gray-800">{d.value_doc1 || '—'}</td>
                  <td className="px-5 py-3 text-gray-800">{d.value_doc2 || '—'}</td>
                  <td className="px-5 py-3"><StatusBadge status={d.severity} label={d.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pannello revisione */}
      <div className="bg-white rounded-xl ring-1 ring-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Revisione operatore</h2>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          disabled={!canReview}
          placeholder="Note opzionali per questa revisione..."
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-400 transition"
        />
        {canReview ? (
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => handleReview('approved')}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <IconCheck size={14} /> Approva
            </button>
            <button
              onClick={() => handleReview('rejected')}
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <IconX size={14} /> Rifiuta
            </button>
            <button
              onClick={() => handleReview('corrected')}
              disabled={submitting}
              className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Correggi e chiudi
            </button>
            {submitError && <p className="text-xs text-red-500 ml-2">{submitError}</p>}
          </div>
        ) : (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            {rec.operator_notes && <p className="text-sm text-gray-600">{rec.operator_notes}</p>}
            <p className="text-xs text-gray-400 mt-1">Revisione completata · {rec.status_display}</p>
          </div>
        )}
      </div>
    </main>
  )
}
