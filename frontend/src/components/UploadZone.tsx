'use client'
import { useState, useRef, DragEvent } from 'react'
import { uploadDocument, uploadImage } from '@/lib/api'
import { IconUploadCloud, IconCamera } from './Icons'

interface Props {
  onUploaded: (docId: number) => void
  accept?: string
  hint?: string
  imageMode?: boolean
}

export default function UploadZone({
  onUploaded,
  accept = '.csv,.xlsx,.xls',
  hint = 'CSV o Excel — .csv, .xlsx, .xls',
  imageMode = false,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const doc = imageMode ? await uploadImage(file) : await uploadDocument(file)
      onUploaded(doc.id)
    } catch {
      setError('Upload fallito. Controlla il formato del file.')
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const Icon = imageMode ? IconCamera : IconUploadCloud

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-all select-none ${
        uploading
          ? 'border-blue-300 bg-blue-50/50 cursor-wait'
          : dragging
          ? 'border-blue-400 bg-blue-50/60 cursor-copy scale-[1.01]'
          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50 cursor-pointer'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      {uploading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-blue-600">
            {imageMode ? 'OCR in corso…' : 'Caricamento in corso…'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className={`p-3 rounded-xl ${dragging ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'} transition-colors`}>
            <Icon size={22} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">
              {imageMode ? 'Carica foto documento' : 'Carica file tabulare'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Trascina qui o clicca · {hint}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-3 flex items-center justify-center gap-1">
          {error}
        </p>
      )}
    </div>
  )
}
