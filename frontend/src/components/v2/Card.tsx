import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function Card({ children, className = '', style }: CardProps) {
  return <div className={`q-card ${className}`} style={style}>{children}</div>
}
