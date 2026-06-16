'use client'
import { createContext, useContext, useState } from 'react'
import type { UploadJob, Step, StepStatus } from '@/components/v2/UploadCard'
import { uploadDocument, uploadImage, getDocument } from '@/lib/api'

const STEPS = [
  'Upload file al server',
  'Parser FastAPI avviato',
  'GPT-4o analizza struttura',
  'Estrazione righe',
  'Persistenza nel database',
  'Ricerca documento candidato',
  'Avvio riconciliazione',
]

interface UploadContextType {
  jobs: UploadJob[]
  addUpload: (file: File, mode: 'document' | 'image') => void
  removeJob: (id: string) => void
}

const UploadContext = createContext<UploadContextType>({
  jobs: [],
  addUpload: () => {},
  removeJob: () => {},
})

export function useUploadJobs() {
  return useContext(UploadContext)
}

function initSteps(): Step[] {
  return STEPS.map(label => ({ label, status: 'pending' as StepStatus }))
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([])

  function removeJob(id: string) {
    setJobs(prev => prev.filter(j => j.id !== id))
  }

  async function addUpload(file: File, mode: 'document' | 'image') {
    const jobId = crypto.randomUUID()
    const times: number[] = [Date.now(), ...new Array(STEPS.length - 1).fill(0)]

    setJobs(prev => [...prev, {
      id: jobId,
      file,
      mode,
      steps: initSteps(),
      document: null,
      reconciliationId: null,
      error: null,
    }])

    const patch = (p: Partial<UploadJob>) =>
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, ...p } : j))

    const advance = (index: number, status: StepStatus) => {
      const now = Date.now()
      const ms = times[index] ? now - times[index] : undefined
      if (status === 'done' && index + 1 < STEPS.length) {
        times[index + 1] = Date.now()
      }
      setJobs(prev => prev.map(j => {
        if (j.id !== jobId) return j
        return {
          ...j,
          steps: j.steps.map((s, i) => {
            if (i === index) return { ...s, status, ms }
            if (i === index + 1 && status === 'done' && s.status === 'pending') return { ...s, status: 'active' }
            return s
          }),
        }
      }))
    }

    try {
      advance(0, 'active')
      const doc = mode === 'image' ? await uploadImage(file) : await uploadDocument(file)
      advance(0, 'done')

      let attempts = 0
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 1500))
        const current = await getDocument(doc.id).catch(() => null)
        if (!current) break
        if (current.status === 'processed') {
          advance(2, 'done')
          advance(3, 'done')
          advance(4, 'done')
          advance(5, 'done')
          advance(6, 'done')
          patch({ document: current })
          break
        }
        if (current.status === 'error') {
          advance(2, 'error')
          patch({ error: current.error_message || 'Errore durante l\'elaborazione' })
          break
        }
        attempts++
      }
      if (attempts >= 60) {
        patch({ error: 'Timeout: elaborazione non completata in 90 secondi' })
        advance(2, 'error')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore upload'
      patch({ error: msg })
      setJobs(prev => prev.map(j => j.id !== jobId ? j : {
        ...j,
        steps: j.steps.map(s => s.status === 'active' ? { ...s, status: 'error' as StepStatus } : s),
      }))
    }
  }

  return (
    <UploadContext.Provider value={{ jobs, addUpload, removeJob }}>
      {children}
    </UploadContext.Provider>
  )
}
