'use client'

import { useRef, useCallback, useEffect, useState } from 'react'

interface UseSmartScrollOptions {
  threshold?: number
}

interface UseSmartScrollReturn {
  containerRef: React.RefObject<HTMLDivElement | null>
  shouldAutoScroll: boolean
  scrollToBottom: (force?: boolean) => void
  handleScroll: () => void
}

export function useSmartScroll(options: UseSmartScrollOptions = {}): UseSmartScrollReturn {
  const { threshold = 100 } = options

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const isUserScrollingRef = useRef(false)

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isNearBottom = scrollHeight - scrollTop - clientHeight < threshold

    if (isNearBottom) {
      isUserScrollingRef.current = false
      setShouldAutoScroll(true)
    } else {
      isUserScrollingRef.current = true
      setShouldAutoScroll(false)
    }
  }, [threshold])

  const scrollToBottom = useCallback((force = false) => {
    if (!containerRef.current) return

    if (force || shouldAutoScroll) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [shouldAutoScroll])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  return {
    containerRef,
    shouldAutoScroll,
    scrollToBottom,
    handleScroll,
  }
}
