import React from 'react'

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  children: React.ReactNode
}

export default function Btn({ variant = 'default', size = 'md', children, className = '', ...props }: BtnProps) {
  const cls = ['q-btn', variant !== 'default' ? variant : '', size === 'sm' ? 'sm' : '', className].filter(Boolean).join(' ')
  return <button className={cls} {...props}>{children}</button>
}
