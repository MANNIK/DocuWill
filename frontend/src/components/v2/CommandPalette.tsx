'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { searchAll } from '@/lib/api'
import type { Document } from '@/lib/api'
import { FileText, Diff, Search } from '@/components/v2/Icons'

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback((q: string) => {
    clearTimeout(debounceRef.current)
    if (q.length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try { setResults(await searchAll(q)) } catch { setResults([]) }
      finally { setLoading(false) }
    }, 200)
  }, [])

  useEffect(() => { search(query) }, [query, search])

  function navigate(doc: Document) {
    onClose()
    router.push(`/documents/${doc.id}`)
  }

  if (!open) return null

  return (
    <div className="q-palette-overlay" onClick={onClose}>
      <div className="q-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="q-palette-input"
          placeholder="Cerca per fornitore, numero documento, file…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
        <div className="q-palette-results">
          {loading && (
            <div className="q-palette-empty">Ricerca in corso…</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="q-palette-empty">Nessun risultato per "{query}"</div>
          )}
          {!loading && results.length === 0 && query.length < 2 && (
            <div className="q-palette-empty" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Search size={20} style={{ margin: '0 auto', opacity: 0.3 }} />
              <span>Inizia a digitare per cercare documenti</span>
            </div>
          )}
          {results.map(doc => (
            <button key={doc.id} className="q-palette-item" onClick={() => navigate(doc)}>
              <FileText size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.supplier_name || doc.original_filename || `Documento #${doc.id}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', gap: 8 }}>
                  <span>{doc.doc_type_display}</span>
                  {doc.document_number && <span>· {doc.document_number}</span>}
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{doc.status_display}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
