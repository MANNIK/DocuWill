'use client'
/**
 * AuthGuard — protegge i contenuti delle pagine v2 dall'accesso non autenticato.
 *
 * Controlla la presenza di un access_token in localStorage. Se assente, redirige
 * a /login immediatamente (client-side). Il redirect definitivo avviene comunque
 * lato API (ogni chiamata con token mancante/scaduto riceve 401 → api.ts redirige),
 * ma AuthGuard evita il flash della UI vuota per utenti non loggati.
 *
 * Nota: localStorage è disponibile solo lato client. Questo componente deve essere
 * sempre `'use client'` e non può essere un server component.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  children: React.ReactNode
}

export default function AuthGuard({ children }: Props) {
  const router = useRouter()
  // null = non ancora controllato (SSR), true/false = esito check
  const [ready, setReady] = useState<boolean | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.replace('/login')
    } else {
      setReady(true)
    }
  }, [router])

  // Durante SSR o prima del check lato client, non renderiamo nulla per evitare
  // il flash dell'interfaccia (poi il redirect avverrà quasi istantaneamente).
  if (ready !== true) return null

  return <>{children}</>
}
