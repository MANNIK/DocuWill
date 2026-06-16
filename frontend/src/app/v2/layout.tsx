import './globals-v2.css'
import Sidebar from '@/components/v2/Sidebar'
import Topbar from '@/components/v2/Topbar'
import { UploadProvider } from '@/lib/upload-context'

export const metadata = {
  title: 'Quoro — Riconciliazione documenti',
}

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <UploadProvider>
      <div className="q-app">
        <Sidebar />
        <main className="q-main">
          <Topbar />
          {children}
        </main>
      </div>
    </UploadProvider>
  )
}
