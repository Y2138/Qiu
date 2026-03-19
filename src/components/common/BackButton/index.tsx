'use client'

import Link from 'next/link'
import { useCallback, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { cn } from '@/utils/helpers'

interface BackButtonProps {
  href: string
  label?: string
  className?: string
  preferHistoryBack?: boolean
}

export function BackButton({
  href,
  label = '返回',
  className,
  preferHistoryBack = false,
}: BackButtonProps) {
  const router = useRouter()

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (!preferHistoryBack) return

      event.preventDefault()
      if (window.history.length > 1) {
        router.back()
        return
      }
      router.push(href)
    },
    [href, preferHistoryBack, router]
  )

  return (
    <Link href={href}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className={cn(
          'group mb-6 rounded-full border-border/80 bg-card/80 px-4 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-md focus-visible:ring-primary/40',
          className
        )}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        {label}
      </Button>
    </Link>
  )
}
