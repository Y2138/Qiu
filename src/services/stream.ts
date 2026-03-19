import type { ChatRequest, StreamChunk } from '@/types/chat'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api'

export interface StreamCallbacks {
  onMessage: (chunk: string) => void
  onEvent?: (event: StreamChunk) => void
  onError: (error: Error) => void
  onComplete: (usage?: { promptTokens: number; completionTokens: number; totalTokens: number }) => void
}

export interface StreamService {
  connect: (request: ChatRequest) => void
  disconnect: () => void
}

export function createStreamService(callbacks: StreamCallbacks): StreamService {
  let abortController: AbortController | null = null
  let completed = false
  let finalUsage:
    | { promptTokens: number; completionTokens: number; totalTokens: number }
    | undefined

  const connect = async (request: ChatRequest) => {
    abortController = new AbortController()
    completed = false
    finalUsage = undefined

    try {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // 包含 cookie 认证
        body: JSON.stringify(request),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const raw = line.slice(6)
              if (raw === '[DONE]') {
                if (!completed) {
                  completed = true
                  callbacks.onComplete(finalUsage)
                }
                continue
              }

              const data: StreamChunk = JSON.parse(raw)
              callbacks.onEvent?.(data)

              if (data.type === 'message.delta' && typeof data.payload?.content === 'string') {
                callbacks.onMessage(data.payload.content)
              }
              if (data.type === 'message.done') {
                finalUsage = data.usage || (data.payload?.usage as {
                  promptTokens: number
                  completionTokens: number
                  totalTokens: number
                } | undefined)
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        try {
          const raw = buffer.trim().slice(6)
          if (raw === '[DONE]') {
            if (!completed) {
              completed = true
              callbacks.onComplete(finalUsage)
            }
          } else {
            const data: StreamChunk = JSON.parse(raw)
            callbacks.onEvent?.(data)
            if (data.type === 'message.delta' && typeof data.payload?.content === 'string') {
              callbacks.onMessage(data.payload.content)
            }
            if (data.type === 'message.done') {
              finalUsage = data.usage || (data.payload?.usage as {
                promptTokens: number
                completionTokens: number
                totalTokens: number
              } | undefined)
            }
          }
        } catch {
          // 忽略解析错误
        }
      }

      if (!completed) {
        completed = true
        callbacks.onComplete(finalUsage)
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        callbacks.onError(error as Error)
      }
    }
  }

  const disconnect = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  return { connect, disconnect }
}
