const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string> ?? {}) },
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')  // ferma l'esecuzione mentre il redirect avviene
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
  extracted_data: ExtractedData
  rows: DocumentRow[]
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
  const res = await apiFetch(`\${API}/api/documents/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore caricamento documenti')
  return res.json()
}

export async function getDocument(id: number): Promise<Document> {
  const res = await apiFetch(`\${API}/api/documents/${id}/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Documento non trovato')
  return res.json()
}

export async function uploadDocument(file: File): Promise<Document> {
  const body = new FormData()
  body.append('file', file)
  const res = await apiFetch(`\${API}/api/documents/upload/`, { method: 'POST', body })
  if (!res.ok) throw new Error('Upload fallito')
  return res.json()
}

export async function uploadImage(file: File): Promise<Document> {
  const body = new FormData()
  body.append('file', file)
  const res = await apiFetch(`\${API}/api/documents/upload-image/`, { method: 'POST', body })
  if (!res.ok) throw new Error('Upload immagine fallito')
  return res.json()
}

export async function resetDatabase(): Promise<{ deleted: number }> {
  const res = await apiFetch(`\${API}/api/dev/reset/`, { method: 'POST' })
  if (!res.ok) throw new Error('Reset fallito')
  return res.json()
}

export async function getReconciliations(): Promise<Reconciliation[]> {
  const res = await apiFetch(`\${API}/api/reconciliations/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Errore caricamento riconciliazioni')
  return res.json()
}

export async function getReconciliation(id: number): Promise<Reconciliation> {
  const res = await apiFetch(`\${API}/api/reconciliations/${id}/`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Riconciliazione non trovata')
  return res.json()
}

export async function reviewReconciliation(
  id: number,
  status: 'approved' | 'rejected' | 'corrected',
  operator_notes = '',
): Promise<Reconciliation> {
  const res = await apiFetch(`\${API}/api/reconciliations/${id}/review/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, operator_notes }),
  })
  if (!res.ok) throw new Error('Revisione fallita')
  return res.json()
}
