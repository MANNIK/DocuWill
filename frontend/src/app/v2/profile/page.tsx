'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/v2/Card'
import Btn from '@/components/v2/Btn'
import { getMe, updateMe } from '@/lib/api'
import type { UserProfile } from '@/lib/api'

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    getMe().then(p => { setProfile(p); setEmail(p.email) }).catch(() => router.push('/login'))
  }, [router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const payload: { email?: string; password?: string } = {}
      if (email !== profile?.email) payload.email = email
      if (newPassword) payload.password = newPassword
      if (Object.keys(payload).length === 0) { setSaving(false); return }
      const updated = await updateMe(payload)
      setProfile(updated)
      setNewPassword('')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return (
    <div className="q-content">
      <div className="q-empty"><div className="q-empty-title">Caricamento…</div></div>
    </div>
  )

  return (
    <div className="q-content q-fade-in" style={{ maxWidth: 520 }}>
      <div>
        <h1 className="q-display">Profilo</h1>
        <p className="q-subtitle">Modifica le tue credenziali di accesso</p>
      </div>

      <Card>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ padding: '20px 20px 0' }}>
            <label className="q-label">Username</label>
            <input className="q-input" value={profile.username} disabled style={{ opacity: 0.5, cursor: 'not-allowed', width: '100%' }} />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Il nome utente non può essere modificato</div>
          </div>

          <div style={{ padding: '16px 20px 0' }}>
            <label className="q-label">Email</label>
            <input
              className="q-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@esempio.com"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ padding: '16px 20px 0' }}>
            <label className="q-label">Nuova password</label>
            <input
              className="q-input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Lascia vuoto per non cambiare"
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Min. 6 caratteri</div>
          </div>

          {error && (
            <div style={{ margin: '12px 20px 0', padding: '10px 12px', background: 'var(--err-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--err)', fontSize: 13 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ margin: '12px 20px 0', padding: '10px 12px', background: 'var(--ok-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--ok)', fontSize: 13 }}>
              Profilo aggiornato con successo.
            </div>
          )}

          <div style={{ padding: '16px 20px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" size="sm" type="button" onClick={() => router.back()}>Annulla</Btn>
            <Btn variant="primary" size="sm" type="submit" disabled={saving}>
              {saving ? 'Salvataggio…' : 'Salva modifiche'}
            </Btn>
          </div>
        </form>
      </Card>

      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        Account creato il {new Date(profile.date_joined).toLocaleDateString('it-IT')}
      </div>
    </div>
  )
}
