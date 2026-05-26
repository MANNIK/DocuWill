'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Home, Upload, Whatsapp, Diff, Suppliers, Settings, ChevronDown } from './Icons'
import { getDocuments, getReconciliations } from '@/lib/api'

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function getUsername(): string {
  if (typeof window === 'undefined') return ''
  try {
    const token = localStorage.getItem('access_token')
    if (!token) return ''
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.username ?? payload.sub ?? 'Operatore'
  } catch { return 'Operatore' }
}

const nav = [
  { section: 'lavoro' },
  { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/v2' },
  { id: 'upload', label: 'Carica documento', icon: Upload, href: '/v2/upload' },
  { id: 'inbox', label: 'Inbox WhatsApp', icon: Whatsapp, href: '/v2/inbox', countKey: 'inbox' },
  { id: 'reconcile', label: 'Riconciliazioni', icon: Diff, href: '/v2/reconciliations', countKey: 'recon', pulse: true },
  { section: 'configurazione' },
  { id: 'suppliers', label: 'Fornitori', icon: Suppliers, href: '/v2/suppliers' },
  { id: 'settings', label: 'Impostazioni', icon: Settings, href: '/v2/settings' },
] as const

export default function Sidebar() {
  const pathname = usePathname()
  const [username, setUsername] = useState('')
  const [counts, setCounts] = useState({ inbox: 0, recon: 0 })

  useEffect(() => {
    setUsername(getUsername())
    async function loadCounts() {
      try {
        const [docs, recons] = await Promise.all([getDocuments(), getReconciliations()])
        const inbox = docs.filter(d => d.source === 'whatsapp' || d.source === 'image').length
        const recon = recons.filter(r => r.status === 'pending').length
        setCounts({ inbox, recon })
      } catch { /* silenzioso */ }
    }
    loadCounts()
  }, [])

  function isActive(href: string) {
    if (href === '/v2') return pathname === '/v2'
    return pathname.startsWith(href)
  }

  return (
    <aside className="q-sidebar">
      <div className="q-logo">
        <div className="q-logo-mark">Q</div>
        <div>
          <div className="q-logo-name">Quoro <span>· beta</span></div>
          <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 1 }}>WeWill · riconciliazione</div>
        </div>
      </div>

      <nav className="q-nav">
        {nav.map((item, i) => {
          if ('section' in item) {
            return <div key={`s${i}`} className="section-label">{item.section}</div>
          }
          const Icon = item.icon
          const count = 'countKey' in item ? counts[item.countKey as keyof typeof counts] : 0
          return (
            <Link
              key={item.id}
              href={item.href}
              className={isActive(item.href) ? 'active' : ''}
            >
              <Icon className="nav-icon" />
              <span>{item.label}</span>
              {count > 0 && (
                <span className="nav-count">
                  {'pulse' in item && item.pulse && <span className="q-dot q-pulse" style={{ color: 'var(--accent)', marginRight: 4 }} />}
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="q-sidebar-footer">
        <div className="q-avatar">{username ? initials(username) : '?'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>{username || 'Operatore'}</div>
          <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ufficio acquisti</div>
        </div>
        <ChevronDown size={14} />
      </div>
    </aside>
  )
}
