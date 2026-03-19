'use client'

import { cn } from '@/utils/helpers'

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Loading({ size = 'md', className }: LoadingProps) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-2 border-current border-t-transparent',
          {
            'h-4 w-4': size === 'sm',
            'h-8 w-8': size === 'md',
            'h-12 w-12': size === 'lg',
          }
        )}
      />
    </div>
  )
}

interface FullScreenLoadingProps {
  message?: string
}

export function FullScreenLoading({ message = '加载中...' }: FullScreenLoadingProps) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loading size="lg" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
