'use client'
import { useState, useRef, DragEvent } from 'react'
import { uploadDocument } from '@/lib/api'

interface Props {
  onUploaded: (docId: number) => void
}

export default function UploadZone({ onUploaded }: Props) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const doc = await uploadDocument(file)
      onUploaded(doc.id)
    } catch {
      setError('Upload fallito. Controlla che il file sia un CSV o Excel valido.')
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
      className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
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
        accept=".csv,.xlsx,.xls"
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
          <p className="text-sm text-blue-600">Caricamento in corso...</p>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-700">
            Trascina un file CSV o Excel
          </p>
          <p className="text-xs text-gray-400 mt-1">oppure clicca per selezionare — .csv, .xlsx, .xls</p>
        </>
      )}

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
    </div>
  )
}
