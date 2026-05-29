'use client'
import { useState } from 'react'
import type { Document } from '@/lib/api'

interface Props {
  document: Document
}

export default function ImagePreview({ document: doc }: Props) {
  const [lightbox, setLightbox] = useState(false)

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
  const rawSrc = doc.file || doc.file_url
  const src = rawSrc
    ? (rawSrc.startsWith('http') ? rawSrc : `${API_BASE}${rawSrc}`)
    : null

  if (!src) {
    return (
      <div style={{ padding: '16px', background: 'var(--bg-sunken)', borderRadius: 'var(--radius)', minHeight: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Documento ricevuto</div>
        {doc.rows && doc.rows.length > 0 ? (
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-faint)' }}>
                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 500 }}>Codice</th>
                <th style={{ textAlign: 'left', padding: '3px 6px', fontWeight: 500 }}>Descrizione</th>
                <th style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 500 }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {doc.rows.slice(0, 5).map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{r.item_code || '—'}</td>
                  <td style={{ padding: '3px 6px', color: 'var(--text)' }}>{r.description?.slice(0, 40) || '—'}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--text)' }}>{r.quantity ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: 'var(--text-faint)', fontSize: 12 }}>
            {doc.source === 'whatsapp' ? '📱 Ricevuto via WhatsApp' : '📷 Caricato localmente'} · Nessuna anteprima disponibile
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="q-img-preview">
        <img
          src={src}
          alt="Documento"
          onClick={() => setLightbox(true)}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      </div>
      {lightbox && (
        <div className="q-lightbox" onClick={() => setLightbox(false)}>
          <img src={src} alt="Documento" />
        </div>
      )}
    </>
  )
}
