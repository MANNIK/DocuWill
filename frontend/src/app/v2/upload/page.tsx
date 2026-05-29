'use client'
import { useState, useRef } from 'react'
import { UploadCloud, Camera } from '@/components/v2/Icons'
import UploadCard from '@/components/v2/UploadCard'
import type { UploadJob, Step, StepStatus } from '@/components/v2/UploadCard'
import { uploadDocument, uploadImage, getDocument } from '@/lib/api'

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
  return STEPS.map(label => ({ label, status: 'pending' as StepStatus }))
}

export default function UploadPage() {
  const [imageMode, setImageMode] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function handleUpload(file: File) {
    const jobId = crypto.randomUUID()
    const times: number[] = [Date.now(), ...new Array(STEPS.length - 1).fill(0)]

    const initialJob: UploadJob = {
      id: jobId,
      file,
      mode: imageMode ? 'image' : 'document',
      steps: initSteps(),
      document: null,
      reconciliationId: null,
      error: null,
    }
    setJobs(prev => [...prev, initialJob])

    // Aggiorna solo il job con ID jobId
    const patch = (p: Partial<UploadJob>) =>
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...p } : j))

    // Avanza uno step e imposta il successivo come active
    const advance = (index: number, status: StepStatus) => {
      const now = Date.now()
      const ms = times[index] ? now - times[index] : undefined
      if (status === 'done' && index + 1 < STEPS.length) {
        times[index + 1] = Date.now()
      }
      setJobs(prev => prev.map(j => {
        if (j.id !== jobId) return j
        return {
          ...j,
          steps: j.steps.map((s, i) => {
            if (i === index) return { ...s, status, ms }
            if (i === index + 1 && status === 'done' && s.status === 'pending') return { ...s, status: 'active' }
            return s
          }),
        }
      }))
    }

    try {
      advance(0, 'active')
      const doc = imageMode ? await uploadImage(file) : await uploadDocument(file)
      advance(0, 'done')

      // Poll finché il documento non è processed (Celery asincrono)
      let attempts = 0
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 1500))
        const current = await getDocument(doc.id).catch(() => null)
        if (!current) break
        if (current.status === 'processed') {
          advance(2, 'done')
          advance(3, 'done')
          advance(4, 'done')
          advance(5, 'done')
          advance(6, 'done')
          patch({ document: current })
          break
        }
        if (current.status === 'error') {
          advance(2, 'error')
          patch({ error: current.error_message || 'Errore durante l\'elaborazione' })
          break
        }
        attempts++
      }
      if (attempts >= 60) {
        patch({ error: 'Timeout: elaborazione non completata in 90 secondi' })
        advance(2, 'error')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore upload'
      patch({ error: msg })
      setJobs(prev => prev.map(j => j.id !== jobId ? j : {
        ...j,
        steps: j.steps.map(s => s.status === 'active' ? { ...s, status: 'error' as StepStatus } : s),
      }))
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    Array.from(e.dataTransfer.files).forEach((file, i) => {
      setTimeout(() => handleUpload(file), i * 80)
    })
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach((file, i) => {
      setTimeout(() => handleUpload(file), i * 80)
    })
    e.target.value = ''
  }

  const accept = imageMode ? '.jpg,.jpeg,.png,.webp' : '.csv,.xlsx,.xls'
  const hint = imageMode ? '.jpg, .png, .webp' : '.csv, .xlsx, .xls'
  const isProcessing = jobs.some(j => j.steps.some(s => s.status === 'active'))

  return (
    <div className="q-content q-fade-in">
      <div>
        <h1 className="q-display">Carica documento</h1>
        <p className="q-subtitle">Importa un file tabulare o una foto per avviare l'elaborazione</p>
      </div>

      {/* Toggle tipo */}
      <div style={{ display: 'flex', gap: 8 }}>
        {([false, true] as const).map(mode => (
          <button key={String(mode)} onClick={() => setImageMode(mode)}
            className={`q-chip ${mode === imageMode ? 'active' : ''}`}
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
          {isProcessing
            ? 'Elaborazione in corso — puoi aggiungere altri file'
            : 'Trascina qui i file o clicca per scegliere'}
        </div>
        <div className="q-dropzone-hint">{hint} — più file supportati</div>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
      </div>

      {/* Job cards */}
      {jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {jobs.map(job => (
            <UploadCard
              key={job.id}
              job={job}
              onRemove={() => setJobs(prev => prev.filter(j => j.id !== job.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
