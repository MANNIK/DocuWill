'use client'
import { useState, useRef, DragEvent } from 'react'
import { uploadDocument, uploadImage } from '@/lib/api'

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

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        uploading
          ? 'border-blue-300 bg-blue-50 cursor-wait'
          : dragging
          ? 'border-blue-500 bg-blue-50 cursor-copy'
          : 'border-gray-300 hover:border-gray-400 bg-white cursor-pointer'
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
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-blue-600">
            {imageMode ? 'OCR in corso…' : 'Caricamento in corso…'}
          </p>
        </div>
      ) : (
        <>
          <div className="text-2xl mb-2">{imageMode ? '📷' : '📄'}</div>
          <p className="text-sm font-medium text-gray-700">
            {imageMode ? 'Trascina la foto del documento' : 'Trascina un file tabulare'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{hint}</p>
        </>
      )}

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </div>
  )
}
