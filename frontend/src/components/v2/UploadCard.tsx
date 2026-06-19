'use client'
import Link from 'next/link'
import { Check, AlertCircle, Loader, Sparkle, X } from '@/components/v2/Icons'
import type { Document } from '@/lib/api'

export type StepStatus = 'pending' | 'active' | 'done' | 'error'
export interface Step { label: string; status: StepStatus; ms?: number }

export interface UploadJob {
  id: string
  file: { name: string }
  mode: 'document' | 'image'
  steps: Step[]
  document: Document | null
  reconciliationId: number | null
  error: string | null
}

interface Props {
  job: UploadJob
  onRemove: () => void
}

export default function UploadCard({ job, onRemove }: Props) {
  const doneCount = job.steps.filter(s => s.status === 'done').length
  const pct = Math.round((doneCount / job.steps.length) * 100)
  const isRunning = job.steps.some(s => s.status === 'active')
  const isError = !!job.error
  const isDone = job.document !== null

  const statusClass = isError ? 'error' : isDone ? 'success' : ''

  const visibleSteps = job.steps.filter(s => s.status !== 'pending')

  return (
    <div className={`q-upload-card ${statusClass}`}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 500, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
          {job.file.name}
        </span>
        {isError && (
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'var(--err-soft)', color: 'var(--err)', fontWeight: 600, flexShrink: 0 }}>
            Errore
          </span>
        )}
        {isDone && (
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'var(--ok-soft)', color: 'var(--ok)', fontWeight: 600, flexShrink: 0 }}>
            Completato
          </span>
        )}
        {isRunning && (
          <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
            In corso
          </span>
        )}
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
          title="Rimuovi"
        >
          <X size={13} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="q-upload-progress">
        <div
          className="q-upload-progress-fill"
          style={{
            width: `${pct}%`,
            background: isError ? 'var(--err)' : isDone ? 'var(--ok)' : undefined,
          }}
        />
      </div>

      {/* Steps (only active/done/error) */}
      {visibleSteps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visibleSteps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{
                width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: step.status === 'done' ? 'var(--ok-soft)' : step.status === 'active' ? 'var(--accent-soft)' : 'var(--err-soft)',
                color: step.status === 'done' ? 'var(--ok)' : step.status === 'active' ? 'var(--accent)' : 'var(--err)',
              }}>
                {step.status === 'done' ? <Check size={9} /> :
                 step.status === 'active' ? <Loader size={9} /> :
                 <AlertCircle size={9} />}
              </span>
              <span style={{ color: step.status === 'error' ? 'var(--err)' : 'var(--text)', flex: 1 }}>
                {step.label}
                {step.status === 'active' && (
                  <Sparkle size={10} style={{ marginLeft: 4, color: 'var(--accent)', display: 'inline' }} />
                )}
              </span>
              {step.ms !== undefined && (
                <span style={{ color: 'var(--text-faint)', fontSize: 11, flexShrink: 0 }}>{step.ms}ms</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error banner */}
      {job.error && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          padding: '8px 10px', background: 'var(--err-soft)',
          borderRadius: 'var(--radius-sm)', color: 'var(--err)', fontSize: 12, marginTop: 6,
        }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          {job.error}
        </div>
      )}

      {/* Footer: links when done */}
      {job.document && (
        <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {[
            ['Fornitore', job.document.supplier_name || '—'],
            ['Tipo', job.document.doc_type_display],
            ['N. Doc', job.document.document_number || '—'],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <Link href="/v2/reconciliations" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
              Vedi riconciliazioni →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
