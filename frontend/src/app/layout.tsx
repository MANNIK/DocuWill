import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import NavBar from '@/components/NavBar'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })

export const metadata: Metadata = {
  title: 'WeWill — Riconciliazione documenti',
  description: 'Gestione e riconciliazione automatica di ordini, fatture e DDT',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-gray-900">
        <NavBar />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  )
}
