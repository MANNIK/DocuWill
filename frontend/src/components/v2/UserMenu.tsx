'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User, LogOut, Settings } from '@/components/v2/Icons'
import { logout as apiLogout } from '@/lib/api'

function getUsername(): string {
  if (typeof window === 'undefined') return 'Operatore'
  const token = localStorage.getItem('access_token')
  if (!token) return 'Accedi'
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.username ?? payload.sub ?? 'Operatore'
  } catch {
    return 'Operatore'
  }
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

export default function UserMenu() {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('…')
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    setUsername(getUsername())
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function logout() {
    // apiLogout blacklista il refresh token lato server prima di rimuoverlo.
    // Anche in caso di errore di rete il token locale viene comunque rimosso.
    await apiLogout()
    router.push('/login')
  }

  const isLoggedIn = typeof window !== 'undefined' && !!localStorage.getItem('access_token')

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        className="q-sidebar-footer"
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer' }}
      >
        <div className="q-avatar">{initials(username)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Ufficio acquisti</div>
        </div>
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
          <polyline points="6 9 12 15 18 9" transform="scale(0.78) translate(0,0)" />
          <path d="M5 9l4 4 4-4" />
        </svg>
      </div>

      {open && (
        <div className="q-user-menu">
          {isLoggedIn ? (
            <>
              <Link href="/v2/profile" style={{ textDecoration: 'none' }}>
                <button className="q-user-menu-item" onClick={() => setOpen(false)}>
                  <User size={14} /> Profilo
                </button>
              </Link>
              <div className="q-user-menu-divider" />
              <button className="q-user-menu-item danger" onClick={logout}>
                <LogOut size={14} /> Esci
              </button>
            </>
          ) : (
            <Link href="/login" style={{ textDecoration: 'none' }}>
              <button className="q-user-menu-item" onClick={() => setOpen(false)}>
                <User size={14} /> Accedi
              </button>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
