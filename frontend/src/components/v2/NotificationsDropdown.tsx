'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationsData } from '@/lib/api'
import { Bell, AlertCircle, Diff } from '@/components/v2/Icons'

function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'adesso'
  if (diffMin < 60) return `${diffMin}m fa`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h fa`
  return d.toLocaleDateString('it-IT')
}

interface Props {
  open: boolean
  onClose: () => void
  data: NotificationsData | null
}

export default function NotificationsDropdown({ open, onClose, data }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose])

  if (!open) return null

  const items = data?.items ?? []

  return (
    <div ref={ref} className="q-notif-dropdown">
      <div className="q-notif-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Notifiche</span>
        {data && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>
            {data.pending_reconciliations} in attesa
          </span>
        )}
      </div>
      <div className="q-notif-list">
        {items.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
            Nessuna notifica
          </div>
        ) : items.map((n, i) => (
          <div
            key={i}
            className="q-notif-item"
            onClick={() => { onClose(); router.push(n.link) }}
          >
            {n.type === 'doc_error'
              ? <AlertCircle size={14} style={{ color: 'var(--err)', flexShrink: 0, marginTop: 2 }} />
              : <Diff size={14} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            }
            <div>
              <div className="q-notif-msg">{n.message}</div>
              <div className="q-notif-time">{fmtTime(n.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
