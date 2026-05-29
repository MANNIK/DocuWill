'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Home, Search, Bell } from './Icons'
import CommandPalette from './CommandPalette'
import NotificationsDropdown from './NotificationsDropdown'
import { getNotifications } from '@/lib/api'
import type { NotificationsData } from '@/lib/api'

const breadcrumbMap: Record<string, [string, string]> = {
  '/v2': ['Lavoro', 'Dashboard'],
  '/v2/upload': ['Lavoro', 'Nuovo documento'],
  '/v2/inbox': ['Lavoro', 'Inbox WhatsApp'],
  '/v2/reconciliations': ['Lavoro', 'Riconciliazioni'],
  '/v2/suppliers': ['Configurazione', 'Fornitori'],
  '/v2/settings': ['Configurazione', 'Impostazioni'],
  '/v2/profile': ['Account', 'Profilo'],
}

function getCrumbs(pathname: string): [string, string] {
  if (breadcrumbMap[pathname]) return breadcrumbMap[pathname]
  if (pathname.startsWith('/v2/reconciliations/')) return ['Lavoro', 'Dettaglio riconciliazione']
  if (pathname.startsWith('/v2/suppliers/')) return ['Configurazione', 'Dettaglio fornitore']
  return ['', pathname.replace('/v2/', '').replace('/', ' / ')]
}

export default function Topbar() {
  const pathname = usePathname()
  const [section, page] = getCrumbs(pathname)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifData, setNotifData] = useState<NotificationsData | null>(null)

  const loadNotifications = useCallback(() => {
    getNotifications().then(setNotifData).catch(() => {})
  }, [])

  useEffect(() => {
    loadNotifications()
    const t = setInterval(loadNotifications, 10000)
    return () => clearInterval(t)
  }, [loadNotifications])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(v => !v)
      }
      if (e.key === 'Escape') { setPaletteOpen(false); setNotifOpen(false) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const hasErrors = (notifData?.errors_last_24h ?? 0) > 0
  const hasPending = (notifData?.items.length ?? 0) > 0

  return (
    <>
      <div className="q-topbar">
        <div className="q-breadcrumbs">
          <Home size={13} />
          {section && <><span>{section}</span><span className="sep">/</span></>}
          <strong>{page}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="q-btn ghost sm" onClick={() => setPaletteOpen(true)}>
            <Search size={14} /> Cerca <span className="q-kbd">⌘K</span>
          </button>
          <div style={{ position: 'relative' }}>
            <button className="q-btn ghost sm" onClick={() => setNotifOpen(v => !v)} style={{ position: 'relative' }}>
              <Bell size={14} />
              {hasPending && (
                <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, background: 'var(--err)', borderRadius: 999 }} />
              )}
            </button>
            <NotificationsDropdown open={notifOpen} onClose={() => setNotifOpen(false)} data={notifData} />
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <span className={`q-pill ${hasErrors ? 'warn' : 'ok'}`}>
            <span className="q-dot" style={{ color: hasErrors ? 'var(--warn)' : 'var(--ok)' }} />
            {hasErrors ? 'errori' : 'tutto OK'}
          </span>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
