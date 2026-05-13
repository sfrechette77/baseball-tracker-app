'use client'

import { ReactNode } from 'react'

type Props = {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  variant?: 'default' | 'error'
}

export function EmptyState({ icon, title, description, action, variant = 'default' }: Props) {
  const isError = variant === 'error'
  return (
    <div className={`rounded-2xl border p-8 text-center ${
      isError
        ? 'border-red-500/30 bg-red-500/5'
        : 'border-white/10 bg-white/5'
    }`}>
      {icon && (
        <div className={`mx-auto mb-3 text-4xl ${isError ? 'opacity-80' : 'opacity-60'}`}>
          {icon}
        </div>
      )}
      <p className={`font-bold ${isError ? 'text-red-300' : 'text-white'}`}>{title}</p>
      {description && (
        <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
