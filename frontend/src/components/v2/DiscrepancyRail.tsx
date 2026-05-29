'use client'
import { useState } from 'react'
import Pill from './Pill'
import { updateDiscrepancy } from '@/lib/api'
import type { Discrepancy } from '@/lib/api'

interface Props {
  discrepancies: Discrepancy[]
  operatorNotes: string
  onNotesChange: (v: string) => void
  onSaveNotes: () => void
  onDiscrepancyUpdate: (id: number, updated: Partial<Discrepancy>) => void
}

type Filter = 'all' | 'error' | 'warning' | 'info'

const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2 }

function fmtTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}

export default function DiscrepancyRail({ discrepancies, operatorNotes, onNotesChange, onSaveNotes, onDiscrepancyUpdate }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<number | null>(discrepancies[0]?.id ?? null)
  const [customInput, setCustomInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [loading, setLoading] = useState(false)

  const filtered = discrepancies
    .filter(d => filter === 'all' || d.severity === filter)
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))

  const selected = discrepancies.find(d => d.id === selectedId) ?? filtered[0] ?? null

  const resolved = discrepancies.filter(d => d.resolution !== 'unresolved').length
  const total = discrepancies.length
  const allResolved = resolved === total && total > 0

  async function resolve(id: number, payload: { resolution?: string; resolved_value?: string; operator_note?: string }) {
    setLoading(true)
    try {
      await updateDiscrepancy(id, payload)
      onDiscrepancyUpdate(id, payload as Partial<Discrepancy>)
    } finally {
      setLoading(false)
    }
  }

  function handleAction(resolution: string, resolvedValue?: string) {
    if (!selected) return
    resolve(selected.id, { resolution, resolved_value: resolvedValue ?? '' })
    setShowCustom(false)
    setShowNote(false)
  }

  function handleCustomSubmit() {
    if (!selected || !customInput.trim()) return
    resolve(selected.id, { resolution: 'custom', resolved_value: customInput.trim() })
    setCustomInput('')
    setShowCustom(false)
  }

  function handleNoteSubmit() {
    if (!selected || !noteInput.trim()) return
    resolve(selected.id, { operator_note: noteInput.trim() })
    setNoteInput('')
    setShowNote(false)
  }

  return (
    <div className="q-rail-v2">
      {/* Header */}
      <div className="q-rail-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Discrepanze ({total})</span>
          <span className={`q-resolved-badge ${allResolved ? 'done' : 'pending'}`}>
            {allResolved ? '✓ Tutte risolte' : `${resolved}/${total} risolte`}
          </span>
        </div>
        <div className="q-chips">
          {(['all', 'error', 'warning', 'info'] as Filter[]).map(f => (
            <button key={f} className={`q-chip ${f !== 'all' ? f : ''} ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Tutti' : f === 'error' ? 'Errori' : f === 'warning' ? 'Warning' : 'Info'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista discrepanze */}
      <div className="q-rail-list">
        {filtered.map(d => (
          <button
            key={d.id}
            className={`q-disc-item ${d.id === selected?.id ? 'selected' : ''} ${d.resolution !== 'unresolved' ? 'resolved' : ''}`}
            onClick={() => { setSelectedId(d.id); setShowCustom(false); setShowNote(false) }}
          >
            <span style={{ flexShrink: 0, fontSize: 10 }}>
              <Pill variant={d.severity === 'error' ? 'err' : d.severity === 'warning' ? 'warn' : 'info'}>
                {d.severity === 'error' ? '!' : d.severity === 'warning' ? '⚠' : 'i'}
              </Pill>
            </span>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.discrepancy_type_display}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.field_name}
              </div>
            </div>
            {d.resolution !== 'unresolved' && (
              <span style={{ fontSize: 10, color: 'var(--ok)', flexShrink: 0 }}>✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Dettaglio discrepanza selezionata */}
      {selected && (
        <div className="q-disc-detail">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{selected.discrepancy_type_display}</div>
            {selected.resolution !== 'unresolved' ? (
              <span className="q-resolved-badge done">✓ {selected.resolution_display}</span>
            ) : (
              <span className="q-resolved-badge pending">Non risolta</span>
            )}
          </div>

          {/* Confronto valori */}
          <div className="q-disc-values">
            <div className={`q-disc-val ${selected.resolution === 'keep_doc1' ? 'chosen' : ''}`}>
              doc1: {selected.value_doc1 || '—'}
            </div>
            <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>→</span>
            <div className={`q-disc-val ${selected.resolution === 'keep_doc2' ? 'chosen' : ''}`}>
              doc2: {selected.value_doc2 || '—'}
            </div>
          </div>

          {/* Azioni */}
          <div className="q-disc-actions">
            <button
              className={`q-disc-action-btn ${selected.resolution === 'keep_doc1' ? 'active' : ''}`}
              onClick={() => handleAction('keep_doc1', selected.value_doc1)}
              disabled={loading}
            >Tieni doc1</button>
            <button
              className={`q-disc-action-btn ${selected.resolution === 'keep_doc2' ? 'active' : ''}`}
              onClick={() => handleAction('keep_doc2', selected.value_doc2)}
              disabled={loading}
            >Tieni doc2</button>
            <button
              className={`q-disc-action-btn ${selected.resolution === 'equivalent' ? 'active' : ''}`}
              onClick={() => handleAction('equivalent')}
              disabled={loading}
            >Marca equiv.</button>
            <button
              className={`q-disc-action-btn ${selected.resolution === 'ignored' ? 'active' : ''}`}
              onClick={() => handleAction('ignored')}
              disabled={loading}
            >Ignora riga</button>
            <button
              className={`q-disc-action-btn ${showCustom ? 'active' : ''}`}
              onClick={() => { setShowCustom(v => !v); setShowNote(false) }}
            >Valore custom…</button>
            <button
              className={`q-disc-action-btn`}
              onClick={() => { setShowNote(v => !v); setShowCustom(false) }}
            >+ Nota</button>
          </div>

          {showCustom && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="q-input"
                placeholder="Valore corretto…"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
                style={{ flex: 1, fontSize: 12 }}
                autoFocus
              />
              <button className="q-btn primary sm" onClick={handleCustomSubmit} disabled={!customInput.trim()}>OK</button>
            </div>
          )}

          {showNote && (
            <div style={{ display: 'flex', gap: 6 }}>
              <textarea
                className="q-textarea"
                placeholder="Nota operatore…"
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                rows={2}
                style={{ flex: 1, fontSize: 12 }}
                autoFocus
              />
              <button className="q-btn primary sm" onClick={handleNoteSubmit} disabled={!noteInput.trim()}>OK</button>
            </div>
          )}

          {selected.resolved_at && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              Risolta il {fmtTime(selected.resolved_at)}
            </div>
          )}

          {/* Suggerimento LLM */}
          {selected.llm_suggestion ? (
            <div className="q-llm-box">
              <div className="q-llm-label">💡 Suggerimento LLM</div>
              {selected.llm_suggestion}
            </div>
          ) : (
            <div className="q-llm-box" style={{ opacity: 0.5 }}>
              <div className="q-llm-label">💡 Suggerimento LLM</div>
              Nessun suggerimento disponibile
            </div>
          )}
        </div>
      )}

      {/* Note generali riconciliazione */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 6 }}>Note generali</div>
        <textarea
          className="q-textarea"
          placeholder="Note per questa riconciliazione…"
          value={operatorNotes}
          onChange={e => onNotesChange(e.target.value)}
          rows={3}
          style={{ fontSize: 12 }}
        />
        <button className="q-btn ghost sm" style={{ marginTop: 6 }} onClick={onSaveNotes}>Salva nota</button>
      </div>
    </div>
  )
}
