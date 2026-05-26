'use client'
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Card from '@/components/v2/Card'
import Btn from '@/components/v2/Btn'
import { UploadCloud, Camera, Check, AlertCircle, Loader, Sparkle } from '@/components/v2/Icons'
import { uploadDocument, uploadImage, getDocument } from '@/lib/api'
import type { Document } from '@/lib/api'

type StepStatus = 'pending' | 'active' | 'done' | 'error'
interface Step { label: string; status: StepStatus; ms?: number }

const STEPS = [
  'Upload file al server',
  'Parser FastAPI avviato',
  'GPT-4o analizza struttura',
  'Estrazione righe',
  'Persistenza nel database',
  'Ricerca documento candidato',
  'Avvio riconciliazione',
]

function initSteps(): Step[] {
  return STEPS.map((label, i) => ({ label, status: i === 0 ? 'active' : 'pending' }))
}

export default function UploadPage() {
  const [imageMode, setImageMode] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [document, setDocument] = useState<Document | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconciliationId, setReconciliationId] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const startTimes = useRef<number[]>([])

  const advanceStep = useCallback((index: number, status: StepStatus) => {
    const now = Date.now()
    const ms = startTimes.current[index] ? now - startTimes.current[index] : undefined
    setSteps(prev => prev.map((s, i) => {
      if (i === index) return { ...s, status, ms }
      if (i === index + 1 && status === 'done') { startTimes.current[i] = Date.now(); return { ...s, status: 'active' } }
      return s
    }))
  }, [])

  const pollUntilDone = useCallback(async (docId: number, stepOffset: number) => {
    let attempts = 0
    while (attempts < 60) {
      await new Promise(r => setTimeout(r, 1500))
      const doc = await getDocument(docId).catch(() => null)
      if (!doc) break
      if (doc.status === 'processed') {
        advanceStep(stepOffset, 'done')
        advanceStep(stepOffset + 1, 'done')
        advanceStep(stepOffset + 2, 'done')
        setDocument(doc)
        // cerca riconciliazione: non abbiamo endpoint diretto ma il doc è processato
        return doc
      }
      if (doc.status === 'error') {
        advanceStep(stepOffset, 'error')
        setError(doc.error_message || 'Errore durante l\'elaborazione')
        return null
      }
      attempts++
    }
    return null
  }, [advanceStep])

  async function handleUpload(file: File) {
    setError(null)
    setDocument(null)
    setReconciliationId(null)
    const s = initSteps()
    startTimes.current = [Date.now(), ...new Array(6).fill(0)]
    setSteps(s)

    try {
      advanceStep(0, 'active')
      const doc = imageMode ? await uploadImage(file) : await uploadDocument(file)
      advanceStep(0, 'done')
      advanceStep(1, 'active')

      const result = await pollUntilDone(doc.id, 2)
      if (result) {
        advanceStep(5, 'done')
        advanceStep(6, 'done')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore upload')
      setSteps(prev => prev.map((s, i) => s.status === 'active' ? { ...s, status: 'error' } : s))
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const accept = imageMode ? '.jpg,.jpeg,.png,.webp' : '.csv,.xlsx,.xls'
  const hint = imageMode ? '.jpg, .png, .webp' : '.csv, .xlsx, .xls'

  const isProcessing = steps.length > 0 && steps.some(s => s.status === 'active')

  return (
    <div className="q-content q-fade-in">
      <div>
        <h1 className="q-display">Carica documento</h1>
        <p className="q-subtitle">Importa un file tabulare o una foto per avviare l'elaborazione</p>
      </div>

      {/* Toggle tipo */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[false, true].map(mode => (
          <button key={String(mode)} onClick={() => setImageMode(mode)}
            className={`q-chip ${!mode === !imageMode ? 'active' : ''}`}
            style={{ cursor: 'pointer' }}>
            {mode ? <Camera size={12} /> : <UploadCloud size={12} />}
            {mode ? 'Foto / OCR' : 'File tabulare'}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div
        className={`q-dropzone ${dragging ? 'dragover' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="q-dropzone-icon">
          {imageMode ? <Camera size={32} /> : <UploadCloud size={32} />}
        </div>
        <div className="q-dropzone-text">
          {isProcessing ? 'Elaborazione in corso…' : `Trascina qui il file o clicca per scegliere`}
        </div>
        <div className="q-dropzone-hint">{hint}</div>
        <input ref={fileRef} type="file" accept={accept} style={{ display: 'none' }} onChange={onFileChange} />
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--err-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--err)', fontSize: 13 }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Pipeline timeline */}
      {steps.length > 0 && (
        <Card>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Pipeline elaborazione</div>
          <div className="q-timeline" style={{ padding: '12px 20px' }}>
            {steps.map((step, i) => (
              <div key={i} className="q-timeline-step">
                <div className={`q-timeline-dot ${step.status === 'done' ? 'done' : step.status === 'active' ? 'active' : step.status === 'error' ? 'error' : ''}`}>
                  {step.status === 'done' ? <Check size={11} /> :
                   step.status === 'active' ? <Loader size={11} /> :
                   step.status === 'error' ? <AlertCircle size={11} /> :
                   <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{i + 1}</span>}
                </div>
                <div>
                  <div className="q-timeline-label" style={{ color: step.status === 'pending' ? 'var(--text-faint)' : step.status === 'error' ? 'var(--err)' : 'var(--text)' }}>
                    {step.label}
                    {step.status === 'active' && <Sparkle size={12} style={{ marginLeft: 6, color: 'var(--accent)', display: 'inline' }} />}
                  </div>
                  {step.ms && <div className="q-timeline-ms">{step.ms}ms</div>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Risultato */}
      {document && (
        <Card>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Documento estratto: {document.original_filename}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href={`/documents/${document.id}`}><Btn variant="ghost" size="sm">Dettaglio vecchia UI</Btn></Link>
              <Link href="/v2/reconciliations"><Btn variant="primary" size="sm">Vedi riconciliazioni →</Btn></Link>
            </div>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              ['Fornitore', document.supplier_name || '—'],
              ['Tipo', document.doc_type_display],
              ['N. Doc', document.document_number || '—'],
              ['Totale', document.total_amount ? `€${parseFloat(document.total_amount).toLocaleString('it-IT')}` : '—'],
              ['Righe', String(document.rows?.length ?? 0)],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
