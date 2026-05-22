'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { IconFileText, IconGitMerge } from './Icons'

const links = [
  { href: '/', label: 'Documenti', icon: IconFileText },
  { href: '/reconciliations', label: 'Riconciliazioni', icon: IconGitMerge },
]

export default function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  function handleLogout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    router.push('/login')
  }

  return (
    <nav className="border-b border-gray-100 bg-white sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 flex items-center h-14 gap-10">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold tracking-tight">W</span>
          </div>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">WeWill</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1 flex-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  active
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Esci
        </button>
      </div>
    </nav>
  )
}
