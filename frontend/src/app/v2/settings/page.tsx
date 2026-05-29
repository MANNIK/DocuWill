'use client'
import { useState, useEffect } from 'react'
import Card from '@/components/v2/Card'
import Btn from '@/components/v2/Btn'
import { getSettings, updateSettings, clearCache, simulateWhatsapp } from '@/lib/api'
import type { AppSettings } from '@/lib/api'
import { Database, Check, AlertCircle, Whatsapp } from '@/components/v2/Icons'

const WEBHOOK_URL = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/webhook/whatsapp/`

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cacheResult, setCacheResult] = useState<string | null>(null)
  const [waModal, setWaModal] = useState(false)
  const [waForm, setWaForm] = useState({ from: '+39123456789', media_url: '', caption: '' })
  const [waResult, setWaResult] = useState<string | null>(null)

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {})
  }, [])

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    try {
      const updated = await updateSettings({
        whatsapp_provider: settings.whatsapp_provider,
        ocr_engine: settings.ocr_engine,
        match_threshold: settings.match_threshold,
        fuzzy_threshold: settings.fuzzy_threshold,
      })
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* noop */ } finally { setSaving(false) }
  }

  async function handleSimulateWa() {
    try {
      const res = await simulateWhatsapp(waForm)
      setWaResult(`Documento #${res.document_id} in elaborazione…`)
      setTimeout(() => { setWaResult(null); setWaModal(false) }, 3000)
    } catch (e) {
      setWaResult(e instanceof Error ? e.message : 'Errore')
    }
  }

  async function handleClearCache() {
    const res = await clearCache().catch(() => null)
    setCacheResult(res ? `${res.deleted} chiavi eliminate dalla cache.` : 'Errore pulizia cache.')
    setTimeout(() => setCacheResult(null), 3000)
  }

  if (!settings) return <div className="q-content"><div className="q-empty"><div className="q-empty-title">Caricamento…</div></div></div>

  return (
    <div className="q-content q-fade-in">
      <div>
        <h1 className="q-display">Impostazioni</h1>
        <p className="q-subtitle">Connettori, motore OCR e soglie di corrispondenza</p>
      </div>

      {/* WhatsApp */}
      <Card>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Connettore WhatsApp</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Sorgente messaggi in entrata per la coda OCR</div>
        </div>
        {/* Banner informativo */}
        <div style={{ margin: '14px 20px 0', padding: '10px 12px', background: 'var(--info-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--info)', fontSize: 12, display: 'flex', gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>In sviluppo solo la modalità Mock è attiva.</strong><br />
            Usa <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>POST {WEBHOOK_URL}</code> per simulare un messaggio in arrivo.<br />
            Per <strong>produzione</strong>: configura le variabili <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>TWILIO_ACCOUNT_SID</code> / <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: 3 }}>TWILIO_AUTH_TOKEN</code> nel backend, oppure integra Meta Cloud API con App ID e access token.
          </div>
        </div>
        <div className="q-settings-section" style={{ padding: '16px 20px' }}>
          {(['mock', 'twilio', 'meta'] as const).map(p => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="radio" name="provider" value={p} checked={settings.whatsapp_provider === p}
                onChange={() => setSettings({ ...settings, whatsapp_provider: p })}
                disabled={p !== 'mock'}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: p !== 'mock' ? 'var(--text-faint)' : 'var(--text)' }}>
                  {p === 'mock' ? 'Mock locale' : p === 'twilio' ? 'Twilio' : 'Meta API'}
                  {p !== 'mock' && <span className="q-pill" style={{ marginLeft: 8, fontSize: 10 }}>coming soon</span>}
                </div>
                {p === 'mock' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Webhook URL: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{WEBHOOK_URL}</span></div>}
              </div>
            </label>
          ))}
        </div>
        <div style={{ padding: '0 20px 16px' }}>
          <Btn variant="ghost" size="sm" onClick={() => setWaModal(true)}>
            <Whatsapp size={13} /> Simula messaggio WhatsApp
          </Btn>
        </div>
      </Card>

      {/* Modale simulazione WA */}
      {waModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,50,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setWaModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, width: 420, boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Simula messaggio WhatsApp</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="q-label">Da (numero)</label>
                <input className="q-input" value={waForm.from} onChange={e => setWaForm(f => ({ ...f, from: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="q-label">URL immagine (pubblico)</label>
                <input className="q-input" placeholder="https://..." value={waForm.media_url} onChange={e => setWaForm(f => ({ ...f, media_url: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="q-label">Caption (opzionale)</label>
                <input className="q-input" value={waForm.caption} onChange={e => setWaForm(f => ({ ...f, caption: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>
            {waResult && <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--ok-soft)', borderRadius: 'var(--radius-sm)', color: 'var(--ok)', fontSize: 12 }}>{waResult}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" size="sm" onClick={() => setWaModal(false)}>Annulla</Btn>
              <Btn variant="primary" size="sm" onClick={handleSimulateWa} disabled={!waForm.media_url}>Invia</Btn>
            </div>
          </div>
        </div>
      )}

      {/* OCR engine */}
      <Card>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Motore OCR</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Usato per estrarre dati da immagini e foto WhatsApp</div>
        </div>
        <div className="q-settings-section" style={{ padding: '16px 20px' }}>
          {(['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro', 'google-docai'] as const).map(e => (
            <label key={e} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: e === 'gpt-4o' ? 'pointer' : 'not-allowed' }}>
              <input type="radio" name="ocr_engine" value={e} checked={settings.ocr_engine === e}
                onChange={() => setSettings({ ...settings, ocr_engine: e })}
                disabled={e !== 'gpt-4o'}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div style={{ fontSize: 13, fontWeight: 500, color: e !== 'gpt-4o' ? 'var(--text-faint)' : 'var(--text)' }}>
                {e}
                {e !== 'gpt-4o' && <span className="q-pill" style={{ marginLeft: 8, fontSize: 10 }}>disabled</span>}
              </div>
            </label>
          ))}
        </div>
      </Card>

      {/* Soglie */}
      <Card>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Soglie</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Parametri per il matching e il fuzzy matching</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="q-label">Soglia match score: <strong>{settings.match_threshold}</strong>/100</label>
            <input type="range" min={10} max={80} value={settings.match_threshold}
              onChange={e => setSettings({ ...settings, match_threshold: +e.target.value })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
              <span>10 (permissivo)</span><span>80 (selettivo)</span>
            </div>
          </div>
          <div>
            <label className="q-label">Soglia fuzzy match: <strong>{settings.fuzzy_threshold.toFixed(2)}</strong></label>
            <input type="range" min={70} max={100} value={Math.round(settings.fuzzy_threshold * 100)}
              onChange={e => setSettings({ ...settings, fuzzy_threshold: +e.target.value / 100 })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
              <span>0.70 (tollerante)</span><span>1.00 (esatto)</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Cache */}
      <Card>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Cache column mapping</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Mapping GPT salvati in Redis DB 2 per fornitore (TTL 30 giorni)</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn variant="danger" size="sm" onClick={handleClearCache}>
            <Database size={13} /> Svuota cache fornitori
          </Btn>
          {cacheResult && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cacheResult}</span>}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saved ? <><Check size={13} /> Salvato</> : saving ? 'Salvataggio…' : 'Salva impostazioni'}
        </Btn>
      </div>
    </div>
  )
}
