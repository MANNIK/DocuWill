const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) return null
  try {
    const res = await fetch(`${API}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
    if (!res.ok) return null
    const data = await res.json()
    localStorage.setItem('access_token', data.access)
    return data.access
  } catch {
    return null
  }
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string> ?? {}) },
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    const newToken = await refreshAccessToken()
    if (newToken) {
      const retry = await fetch(url, {
        ...options,
        headers: { 'Authorization': `Bearer ${newToken}`, ...(options.headers as Record<string, string> ?? {}) },
      })
      if (retry.status !== 401) return retry
    }
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  return res
}

export interface DocumentRow {
  id: number
  row_index: number
  item_code: string
  description: string
  quantity: string | null
  unit: string
  unit_price: string | null
  total_price: string | null
  discount: string | null
  raw_data: Record<string, string>
}

export interface ExtractedData {
  filename?: string
  section_name?: string
  total_rows?: number
  doc_type_confidence?: number
  structure_notes?: string
  file_summary?: Record<string, number>
  [key: string]: unknown
}

export interface Document {
  id: number
  source: string
  source_display: string
  doc_type: string
  doc_type_display: string
  status: 'pending' | 'processed' | 'error'
  status_display: string
  original_filename: string
  supplier_name: string
  document_date: string | null
  document_number: string
  total_amount: string | null
  error_message: string
  file_url: string | null
  file: string | null
  extracted_data: ExtractedData
  rows: DocumentRow[]
  row_count?: number
  created_at: string
  updated_at: string
}

export interface Discrepancy {
  id: number
  discrepancy_type: string
  discrepancy_type_display: string
  field_name: string
  value_doc1: string
  value_doc2: string
  severity: 'info' | 'warning' | 'error'
  doc1_row: number | null
  doc2_row: number | null
  resolution: 'unresolved' | 'keep_doc1' | 'keep_doc2' | 'equivalent' | 'custom' | 'ignored'
  resolution_display: string
  resolved_value: string
  operator_note: string
  llm_suggestion: string
  resolved_at: string | null
}

export interface Reconciliation {
  id: number
  doc1: Document
  doc2: Document
  status: 'pending' | 'approved' | 'rejected' | 'corrected'
  status_display: string
  match_confidence: number
  discrepancy_list: Discrepancy[]
  operator_notes: string
  created_at: string
  updated_at: string
}

export async function getDocuments(): Promise<Document[]> {
  const res = await apiFetch(`${API}/api/documents/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore caricamento documenti')
  return res.json()
}

export async function getDocument(id: number): Promise<Document> {
  const res = await apiFetch(`${API}/api/documents/${id}/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Documento non trovato')
  return res.json()
}

export async function uploadDocument(file: File): Promise<Document> {
  const body = new FormData()
  body.append('file', file)
  const res = await apiFetch(`${API}/api/documents/upload/`, { method: 'POST', body })
  if (!res.ok) throw new Error('Upload fallito')
  return res.json()
}

export async function uploadImage(file: File): Promise<Document> {
  const body = new FormData()
  body.append('file', file)
  const res = await apiFetch(`${API}/api/documents/upload-image/`, { method: 'POST', body })
  if (!res.ok) throw new Error('Upload immagine fallito')
  return res.json()
}

export async function resetDatabase(): Promise<{ deleted: number }> {
  const res = await apiFetch(`${API}/api/dev/reset/`, { method: 'POST' })
  if (!res.ok) throw new Error('Reset fallito')
  return res.json()
}

export async function getReconciliations(): Promise<Reconciliation[]> {
  const res = await apiFetch(`${API}/api/reconciliations/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore caricamento riconciliazioni')
  return res.json()
}

export async function getReconciliation(id: number): Promise<Reconciliation> {
  const res = await apiFetch(`${API}/api/reconciliations/${id}/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Riconciliazione non trovata')
  return res.json()
}

export async function reviewReconciliation(
  id: number,
  status: 'approved' | 'rejected' | 'corrected',
  operator_notes = '',
): Promise<Reconciliation> {
  const res = await apiFetch(`${API}/api/reconciliations/${id}/review/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, operator_notes }),
  })
  if (!res.ok) throw new Error('Revisione fallita')
  return res.json()
}

// ─── Tipi e fetcher per UI v2 ────────────────────────────────────────────────

export interface Supplier {
  name: string
  doc_count: number
  last_upload: string
  match_rate: number
}

export interface CachedMapping {
  headers_fingerprint: string
  mapping: Record<string, string>
  doc_type: string
  ttl_days: number
}

export interface SupplierDetail extends Supplier {
  docs_by_type: Record<string, number>
  cached_mappings: CachedMapping[]
}

export interface AppSettings {
  whatsapp_provider: string
  ocr_engine: string
  match_threshold: number
  fuzzy_threshold: number
  updated_at: string
}

export interface DashboardStats {
  pending: number
  processed_today: number
  match_rate: number
  avg_processing_ms: number
  queue: Reconciliation[]
  ingestion_7d: { date: string; count: number }[]
  discrepancy_histogram: { discrepancy_type: string; count: number }[]
  recent_documents: Document[]
}

export interface Notification {
  type: 'recon_pending' | 'doc_error' | 'doc_processed'
  message: string
  link: string
  created_at: string
}

export interface NotificationsData {
  pending_reconciliations: number
  pending_documents: number
  errors_last_24h: number
  items: Notification[]
}

export interface UserProfile {
  id: number
  username: string
  email: string
  date_joined: string
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await apiFetch(`${API}/api/dashboard/stats/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore statistiche')
  return res.json()
}

export async function getWhatsAppInbox(): Promise<Document[]> {
  const res = await apiFetch(`${API}/api/whatsapp/inbox/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore inbox')
  return res.json()
}

export async function getSuppliers(): Promise<Supplier[]> {
  const res = await apiFetch(`${API}/api/suppliers/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore fornitori')
  return res.json()
}

export async function getSupplier(name: string): Promise<SupplierDetail> {
  const res = await apiFetch(`${API}/api/suppliers/${encodeURIComponent(name)}/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Fornitore non trovato')
  return res.json()
}

export async function getSettings(): Promise<AppSettings> {
  const res = await apiFetch(`${API}/api/settings/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore impostazioni')
  return res.json()
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const res = await apiFetch(`${API}/api/settings/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Errore salvataggio impostazioni')
  return res.json()
}

export async function clearCache(): Promise<{ deleted: number }> {
  const res = await apiFetch(`${API}/api/settings/cache/`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Errore pulizia cache')
  return res.json()
}

export async function updateDiscrepancy(
  id: number,
  payload: { resolution?: string; resolved_value?: string; operator_note?: string },
): Promise<{ resolution: string; resolved_value: string; operator_note: string }> {
  const res = await apiFetch(`${API}/api/discrepancies/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Errore aggiornamento discrepanza')
  return res.json()
}

export async function getNotifications(): Promise<NotificationsData> {
  const res = await apiFetch(`${API}/api/notifications/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore notifiche')
  return res.json()
}

export async function searchAll(q: string): Promise<Document[]> {
  const res = await apiFetch(`${API}/api/search/?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore ricerca')
  return res.json()
}

export async function getMe(): Promise<UserProfile> {
  const res = await apiFetch(`${API}/api/auth/me/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore profilo')
  return res.json()
}

export async function updateMe(payload: { email?: string; password?: string }): Promise<UserProfile> {
  const res = await apiFetch(`${API}/api/auth/me/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Errore aggiornamento profilo')
  return res.json()
}

export async function simulateWhatsapp(payload: {
  from: string
  media_url: string
  caption?: string
}): Promise<{ status: string; document_id: number }> {
  const res = await apiFetch(`${API}/api/webhook/whatsapp/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Errore simulazione WhatsApp')
  return res.json()
}
