'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Documenti' },
  { href: '/reconciliations', label: 'Riconciliazioni' },
]

export default function NavBar() {
  const pathname = usePathname()
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-8">
        <span className="font-semibold text-gray-900 tracking-tight">WeWill</span>
        <div className="flex gap-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname === link.href
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
