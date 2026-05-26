import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="q-empty">
      {icon && <div className="q-empty-icon">{icon}</div>}
      <div className="q-empty-title">{title}</div>
      {description && <div className="q-empty-desc">{description}</div>}
      {action}
    </div>
  )
}
