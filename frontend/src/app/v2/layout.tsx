import './globals-v2.css'
import Sidebar from '@/components/v2/Sidebar'
import Topbar from '@/components/v2/Topbar'

export const metadata = {
  title: 'Quoro — Riconciliazione documenti',
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="q-app">
      <Sidebar />
      <main className="q-main">
        <Topbar />
        {children}
      </main>
    </div>
  )
}
