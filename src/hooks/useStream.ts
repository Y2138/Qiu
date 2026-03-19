'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { createStreamService, type StreamService, type StreamCallbacks } from '@/services/stream'
import type { ChatRequest } from '@/types/chat'

interface UseStreamReturn {
  isStreaming: boolean
  startStream: (request: ChatRequest, callbacks: StreamCallbacks) => void
  stopStream: () => void
  error: Error | null
}

export function useStream(): UseStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const streamServiceRef = useRef<StreamService | null>(null)

  const startStream = useCallback((request: ChatRequest, callbacks: StreamCallbacks) => {
    setError(null)
    setIsStreaming(true)

    streamServiceRef.current = createStreamService({
      onMessage: callbacks.onMessage,
      onError: (err) => {
        setError(err)
        setIsStreaming(false)
        callbacks.onError?.(err)
      },
      onComplete: (usage) => {
        setIsStreaming(false)
        callbacks.onComplete?.(usage)
      },
    })

    streamServiceRef.current.connect(request)
  }, [])

  const stopStream = useCallback(() => {
    streamServiceRef.current?.disconnect()
    setIsStreaming(false)
  }, [])

  // 清理
  useEffect(() => {
    return () => {
      streamServiceRef.current?.disconnect()
    }
  }, [])

  return {
    isStreaming,
    startStream,
    stopStream,
    error,
  }
}
