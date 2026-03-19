'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'

const BLUR_DELAY_STYLE = { animationDelay: '2s' } as const

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: React.ReactNode
  footerText: string
  footerLinkLabel?: string
  footerLinkHref?: string
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footerText,
  footerLinkLabel,
  footerLinkHref,
}: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-primary/20 blur-3xl animate-pulse" />
        <div
          className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/20 blur-3xl animate-pulse"
          style={BLUR_DELAY_STYLE}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-4 transition-all duration-700 translate-y-0 opacity-100">
        <div className="mb-8 text-center">
          <div className="mb-6 flex items-center justify-center space-x-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-primary/30 blur-xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-primary shadow-xl">
                <Sparkles className="h-10 w-10 text-primary-foreground" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          </div>
          <p className="mt-3 text-lg text-muted-foreground">{subtitle}</p>
        </div>

        <div className="relative rounded-3xl border border-border bg-card/50 p-8 shadow-2xl backdrop-blur-xl">
          {children}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {footerText}
            {footerLinkLabel && footerLinkHref ? (
              <Link
                href={footerLinkHref}
                className="ml-1 font-medium text-primary transition-colors hover:text-primary/80"
              >
                {footerLinkLabel}
              </Link>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  )
}
