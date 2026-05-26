'use client'
import { usePathname } from 'next/navigation'
import { Home, Search, Bell } from './Icons'

const breadcrumbMap: Record<string, [string, string]> = {
  '/v2': ['Lavoro', 'Dashboard'],
  '/v2/upload': ['Lavoro', 'Nuovo documento'],
  '/v2/inbox': ['Lavoro', 'Inbox WhatsApp'],
  '/v2/reconciliations': ['Lavoro', 'Riconciliazioni'],
  '/v2/suppliers': ['Configurazione', 'Fornitori'],
  '/v2/settings': ['Configurazione', 'Impostazioni'],
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

  return (
    <div className="q-topbar">
      <div className="q-breadcrumbs">
        <Home size={13} />
        {section && <><span>{section}</span><span className="sep">/</span></>}
        <strong>{page}</strong>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="q-btn ghost sm">
          <Search size={14} /> Cerca <span className="q-kbd">⌘K</span>
        </button>
        <button className="q-btn ghost sm" style={{ position: 'relative' }}>
          <Bell size={14} />
          <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, background: 'var(--accent)', borderRadius: 999 }} />
        </button>
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <span className="q-pill ok"><span className="q-dot" style={{ color: 'var(--ok)' }} /> tutto OK</span>
      </div>
    </div>
  )
}
