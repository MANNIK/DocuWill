'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import '../v2/globals-v2.css'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/auth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        setError('Credenziali non valide.')
        return
      }
      const { access, refresh } = await res.json()
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
      router.push('/v2')
    } catch {
      setError('Errore di connessione.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 28 }}>
          <div className="q-logo-mark">Q</div>
          <span style={{ fontWeight: 600, letterSpacing: '-0.01em', fontSize: 16, color: 'var(--text)' }}>
            Quoro <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>/ WeWill</span>
          </span>
        </div>

        <div className="q-card" style={{ padding: 0 }}>
          <div style={{ padding: '20px 20px 0' }}>
            <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 2px', letterSpacing: '-0.01em' }}>Accedi</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Sistema di riconciliazione documenti</p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="q-label">Username</label>
              <input
                className="q-input"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="q-label">Password</label>
              <input
                className="q-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{ padding: '8px 10px', background: 'var(--err-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--err)', fontSize: 12 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="q-btn primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            >
              {loading ? 'Accesso in corso…' : 'Accedi'}
            </button>
          </form>

          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
            Non hai un account?{' '}
            <Link href="/register" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
              Registrati
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
