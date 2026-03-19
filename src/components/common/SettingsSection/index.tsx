'use client'

import type { ReactNode } from 'react'

interface SettingsSectionProps {
  id?: string
  className?: string
  icon: ReactNode
  title: string
  children: ReactNode
}

export function SettingsSection({ id, className, icon, title, children }: SettingsSectionProps) {
  return (
    <section id={id} className={`rounded-2xl border border-border bg-card p-6 shadow-md ${className ?? ''}`}>
      <div className="mb-6 flex items-center gap-2 border-b border-border pb-3 text-lg font-semibold">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        {title}
      </div>
      {children}
    </section>
  )
}
