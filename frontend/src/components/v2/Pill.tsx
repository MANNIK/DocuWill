import React from 'react'

type Variant = 'default' | 'accent' | 'ok' | 'warn' | 'err' | 'info'

interface PillProps {
  variant?: Variant
  children: React.ReactNode
  dot?: boolean
  pulse?: boolean
}

export default function Pill({ variant = 'default', children, dot, pulse }: PillProps) {
  return (
    <span className={`q-pill ${variant !== 'default' ? variant : ''}`}>
      {dot && <span className={`q-dot ${pulse ? 'q-pulse' : ''}`} />}
      {children}
    </span>
  )
}

export function severityToPillVariant(severity: string): Variant {
  if (severity === 'error') return 'err'
  if (severity === 'warning') return 'warn'
  if (severity === 'info') return 'info'
  return 'default'
}

export function statusToPillVariant(status: string): Variant {
  if (status === 'approved') return 'ok'
  if (status === 'rejected') return 'err'
  if (status === 'corrected') return 'info'
  if (status === 'pending') return 'warn'
  if (status === 'processed') return 'ok'
  if (status === 'error') return 'err'
  return 'default'
}
