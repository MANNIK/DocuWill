'use client'
import { useState, useRef } from 'react'
import { UploadCloud, Camera } from '@/components/v2/Icons'
import UploadCard from '@/components/v2/UploadCard'
import { useUploadJobs } from '@/lib/upload-context'

export default function UploadPage() {
  const { jobs, addUpload, removeJob } = useUploadJobs()
  const [imageMode, setImageMode] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    Array.from(e.dataTransfer.files).forEach((file, i) => {
      setTimeout(() => addUpload(file, imageMode ? 'image' : 'document'), i * 80)
    })
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach((file, i) => {
      setTimeout(() => addUpload(file, imageMode ? 'image' : 'document'), i * 80)
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
              onRemove={() => removeJob(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
