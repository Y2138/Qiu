'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useChatStore } from '@/stores/chatStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useModelStore } from '@/stores/modelStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { generateSessionTitle, getMessagesBySession } from '@/services/session'
import { createStreamService, type StreamService } from '@/services/stream'
import { updateAssistantPartsFromStreamEvent } from '@/lib/agent/message-parts'
import type {
  AgentRuntimeRequest,
  AssistantMessagePart,
  Message,
  MessageDto,
  ChatRequest,
  StreamChunk,
  FileAttachment,
} from '@/types/chat'

interface UseChatReturn {
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  error: string | null
  currentSessionId: string | null
  sendMessage: (content: string, files?: FileAttachment[], agentConfig?: AgentRuntimeRequest) => Promise<void>
  continueFromCheckpoint: (checkpointId: string, agentConfig?: AgentRuntimeRequest) => Promise<void>
  stopGeneration: () => void
  regenerate: (messageId: string, agentConfig?: AgentRuntimeRequest) => Promise<void>
  clearChat: () => void
  loadSessionMessages: (sessionId: string, signal?: AbortSignal) => Promise<void>
}

export function buildOutgoingMessageHistory(messages: Message[], nextUserContent: string): MessageDto[] {
  // The client keeps sending full in-session history; the server/runtime owns context trimming
  // so chat, resume, and future regeneration all share one source of truth.
  return [
    ...messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: nextUserContent },
  ]
}

export function buildRegenerateContext(messages: Message[], messageId: string): {
  history: MessageDto[]
  sourceUserMessage: Message
  truncatedMessages: Message[]
} | null {
  const targetIndex = messages.findIndex((message) => message.id === messageId)
  if (targetIndex === -1) return null

  const targetMessage = messages[targetIndex]
  const sourceUserIndex = targetMessage.role === 'user'
    ? targetIndex
    : (() => {
        for (let index = targetIndex - 1; index >= 0; index -= 1) {
          if (messages[index]?.role === 'user') {
            return index
          }
        }
        return -1
      })()

  if (sourceUserIndex === -1) return null

  const sourceUserMessage = messages[sourceUserIndex]

  return {
    history: buildOutgoingMessageHistory(messages.slice(0, sourceUserIndex), sourceUserMessage.content),
    sourceUserMessage,
    truncatedMessages: messages.slice(0, sourceUserIndex + 1),
  }
}

export function useChat(): UseChatReturn {
  const {
    messages,
    isLoading,
    isStreaming,
    error,
    addMessage,
    updateMessage,
    setMessages,
    setLoading,
    setStreaming,
    setError,
    clearMessages,
    setCurrentSessionId,
    currentSessionId,
  } = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      isLoading: s.isLoading,
      isStreaming: s.isStreaming,
      error: s.error,
      addMessage: s.addMessage,
      updateMessage: s.updateMessage,
      setMessages: s.setMessages,
      setLoading: s.setLoading,
      setStreaming: s.setStreaming,
      setError: s.setError,
      clearMessages: s.clearMessages,
      setCurrentSessionId: s.setCurrentSessionId,
      currentSessionId: s.currentSessionId,
    }))
  )

  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const updateSession = useSessionStore((s) => s.updateSession)
  const enableSound = useSettingsStore((s) => s.enableSound)
  const { currentModel, getActiveApiKey } = useModelStore(
    useShallow((s) => ({
      currentModel: s.currentModel,
      getActiveApiKey: s.getActiveApiKey,
    }))
  )

  const streamServiceRef = useRef<StreamService | null>(null)
  const loadingSessionRef = useRef<string | null>(null)
  const loadingRequestIdRef = useRef(0)
  const activeLoadControllerRef = useRef<AbortController | null>(null)
  const titleGenerationSessionsRef = useRef(new Set<string>())

  const loadSessionMessages = useCallback(
    async (sessionId: string, signal?: AbortSignal) => {
      if (!sessionId) return
      if (sessionId === currentSessionId) return
      if (loadingSessionRef.current === sessionId) {
        return
      }

      const requestId = loadingRequestIdRef.current + 1
      loadingRequestIdRef.current = requestId
      loadingSessionRef.current = sessionId

      try {
        setLoading(true)
        setError(null)
        clearMessages()
        const data = await getMessagesBySession(sessionId, signal)
        if (signal?.aborted) return
        if (
          loadingSessionRef.current === sessionId &&
          requestId === loadingRequestIdRef.current
        ) {
          const processedMessages = (data.items || []).map((msg) => {
            const attachmentMetadata = (msg.metadata as {
              attachments?: Array<{ id: string; name: string; mimeType?: string; size: number }>
            } | undefined)?.attachments

            return {
              ...msg,
              createdAt: new Date(msg.createdAt),
              updatedAt: msg.updatedAt ? new Date(msg.updatedAt) : undefined,
              files: Array.isArray(attachmentMetadata)
                ? attachmentMetadata.map((attachment) => ({
                    id: attachment.id,
                    name: attachment.name,
                    type: 'document',
                    mimeType: attachment.mimeType,
                    size: attachment.size,
                    status: 'uploaded' as const,
                  }))
                : msg.files,
            }
          })
          setCurrentSessionId(sessionId)
          setMessages(processedMessages)
        }
      } catch (err) {
        if (signal?.aborted) return
        if (
          loadingSessionRef.current === sessionId &&
          requestId === loadingRequestIdRef.current
        ) {
          setError(err instanceof Error ? err.message : '加载消息失败')
        }
      } finally {
        if (
          loadingSessionRef.current === sessionId &&
          requestId === loadingRequestIdRef.current
        ) {
          setLoading(false)
          loadingSessionRef.current = null
        }
      }
    },
    [currentSessionId, setMessages, setCurrentSessionId, setLoading, setError, clearMessages]
  )

  useEffect(() => {
    if (!activeSessionId) {
      activeLoadControllerRef.current?.abort()
      loadingSessionRef.current = null
      loadingRequestIdRef.current += 1
      clearMessages()
      setCurrentSessionId(null)
      setLoading(false)
      setError(null)
      return
    }

    if (activeSessionId === currentSessionId) return

    activeLoadControllerRef.current?.abort()
    const controller = new AbortController()
    activeLoadControllerRef.current = controller
    loadSessionMessages(activeSessionId, controller.signal)

    return () => {
      controller.abort()
      if (activeLoadControllerRef.current === controller) {
        activeLoadControllerRef.current = null
      }
    }
  }, [
    activeSessionId,
    currentSessionId,
    loadSessionMessages,
    clearMessages,
    setCurrentSessionId,
    setLoading,
    setError,
  ])

  const playNotification = useCallback(() => {
    if (!enableSound || typeof window === 'undefined') return

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!AudioCtx) return

      const audioContext = new AudioCtx()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      gainNode.gain.setValueAtTime(0.001, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2)

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.start()
      oscillator.stop(audioContext.currentTime + 0.2)
      void audioContext.close()
    } catch {
      // 忽略浏览器音频限制错误
    }
  }, [enableSound])

  const maybeGenerateTitle = useCallback(
    async (sessionId: string) => {
      const session = useSessionStore.getState().sessions.find((item) => item.id === sessionId)
      if (!session) return
      if (session.title.trim() !== '新对话') return
      if (titleGenerationSessionsRef.current.has(sessionId)) return

      titleGenerationSessionsRef.current.add(sessionId)

      try {
        const result = await generateSessionTitle(sessionId)
        if (result.title?.trim()) {
          updateSession(sessionId, {
            title: result.title.trim(),
            updatedAt: new Date(),
          })
        }
      } catch (error) {
        console.error('生成会话标题失败:', error)
      } finally {
        titleGenerationSessionsRef.current.delete(sessionId)
      }
    },
    [updateSession],
  )

  const sendChatRequest = useCallback(
    async (params: {
      content: string
      files?: FileAttachment[]
      agentConfig?: AgentRuntimeRequest
      messageHistory?: MessageDto[]
      requestMode?: 'default' | 'regenerate'
      optimisticUserMessage?: Message
      optimisticMessages?: Message[]
    }) => {
      const {
        content,
        files,
        agentConfig,
        messageHistory,
        requestMode = 'default',
        optimisticUserMessage,
        optimisticMessages,
      } = params

      if (!activeSessionId) {
        setError('请先创建或选择一个会话')
        return
      }
      const activeApiKey = getActiveApiKey()
      if (!activeApiKey) {
        setError('请先配置 API Key')
        return
      }
      if (!currentModel) {
        setError('请先选择模型')
        return
      }

      setLoading(true)
      setError(null)
      const shouldGenerateTitle =
        useSessionStore.getState().sessions.find((session) => session.id === activeSessionId)?.title.trim() === '新对话'

      if (optimisticMessages) {
        setMessages(optimisticMessages)
      }

      if (optimisticUserMessage) {
        addMessage(optimisticUserMessage)
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: activeSessionId,
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        isStreaming: true,
      }

      addMessage(assistantMessage)

      try {
        setStreaming(true)

        const chatRequest: ChatRequest = {
          requestMode,
          messages: messageHistory ?? buildOutgoingMessageHistory(messages, content),
          attachments: files?.map((file) => ({
            id: file.id,
          })),
          model: currentModel.id,
          apiKeyId: activeApiKey.id,
          sessionId: activeSessionId,
          agent: agentConfig,
        }

        let assistantParts: AssistantMessagePart[] = []
        let latestMetadata: Record<string, unknown> = {}
        let accumulatedContent = ''

        streamServiceRef.current = createStreamService({
          onMessage: (chunk: string) => {
            accumulatedContent += chunk
            updateMessage(assistantMessage.id, {
              content: accumulatedContent,
            })
          },
          onEvent: (event: StreamChunk) => {
            if (!event.type) return

            assistantParts = updateAssistantPartsFromStreamEvent(assistantParts, event)
            const tracePart = assistantParts.find((part) => part.kind === 'agent_trace')
            const checkpoint = tracePart?.resumable
              ? {
                  checkpointId: tracePart.resumable.checkpointId,
                  resumable: tracePart.resumable.resumable,
                  label: tracePart.resumable.label,
                }
              : undefined
            const payload = event.payload as Record<string, unknown> | undefined
            const existingAgent = (
              typeof latestMetadata.agent === 'object' && latestMetadata.agent
                ? latestMetadata.agent as Record<string, unknown>
                : {}
            )
            const nextAgent: Record<string, unknown> = {
              ...existingAgent,
              parts: assistantParts,
              status: tracePart?.status ?? existingAgent.status,
              checkpoint,
            }

            if (event.type === 'agent.status') {
              if (typeof payload?.runId === 'string') {
                nextAgent.runId = payload.runId
              }
              if (typeof payload?.state === 'string') {
                nextAgent.status = payload.state
              }
              if (typeof payload?.resumedFromCheckpointId === 'string') {
                nextAgent.resumedFromCheckpointId = payload.resumedFromCheckpointId
              }
            }

            latestMetadata = {
              ...latestMetadata,
              attachmentContext: files?.length
                ? {
                    files: files.map((file) => ({
                      id: file.id,
                      name: file.name,
                      status:
                        event.type === 'message.done'
                          ? 'processed'
                          : event.type === 'agent.tool' && payload?.state === 'started'
                            ? 'reading'
                            : 'uploaded',
                    })),
                  }
                : latestMetadata.attachmentContext,
              agent: nextAgent,
            }
            updateMessage(assistantMessage.id, {
              metadata: latestMetadata,
            })
          },
          onError: (err: Error) => {
            updateMessage(assistantMessage.id, {
              error: err.message,
              isStreaming: false,
            })
            setError(err.message)
          },
          onComplete: (usage) => {
            latestMetadata = files?.length
              ? {
                  ...latestMetadata,
                  attachmentContext: {
                    files: files.map((file) => ({
                      id: file.id,
                      name: file.name,
                      status: 'processed',
                    })),
                  },
                }
              : latestMetadata
            updateMessage(assistantMessage.id, {
              isStreaming: false,
              tokens: usage?.totalTokens ?? undefined,
              metadata: Object.keys(latestMetadata).length > 0 ? latestMetadata : undefined,
            })
            setStreaming(false)
            playNotification()
            if (shouldGenerateTitle) {
              void maybeGenerateTitle(activeSessionId)
            }
          },
        })

        streamServiceRef.current.connect(chatRequest)
      } catch (err) {
        updateMessage(assistantMessage.id, {
          error: err instanceof Error ? err.message : '发送消息失败',
          isStreaming: false,
        })
        setError(err instanceof Error ? err.message : '发送消息失败')
      } finally {
        setLoading(false)
      }
    },
    [
      activeSessionId,
      addMessage,
      currentModel,
      getActiveApiKey,
      maybeGenerateTitle,
      messages,
      playNotification,
      setError,
      setLoading,
      setMessages,
      setStreaming,
      updateMessage,
    ],
  )

  const sendMessage = useCallback(
    async (content: string, files?: FileAttachment[], agentConfig?: AgentRuntimeRequest) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: activeSessionId ?? '',
        role: 'user',
        content,
        createdAt: new Date(),
        ...(files && files.length > 0
          ? {
              files,
            }
          : {}),
      }
      await sendChatRequest({
        content,
        files,
        agentConfig,
        optimisticUserMessage: userMessage,
      })
    },
    [activeSessionId, sendChatRequest]
  )

  const continueFromCheckpoint = useCallback(
    async (checkpointId: string, agentConfig?: AgentRuntimeRequest) => {
      await sendMessage('继续上一轮任务', undefined, {
        ...agentConfig,
        enabled: true,
        resumeFromCheckpointId: checkpointId,
      })
    },
    [sendMessage],
  )

  const stopGeneration = useCallback(() => {
    streamServiceRef.current?.disconnect()
    setStreaming(false)
    messages.forEach((msg) => {
      if (msg.isStreaming) {
        updateMessage(msg.id, { isStreaming: false })
      }
    })
  }, [setStreaming, messages, updateMessage])

  const regenerate = useCallback(async (messageId: string, agentConfig?: AgentRuntimeRequest) => {
    const sessionMessages = messages.filter((message) => message.sessionId === currentSessionId)
    const regeneration = buildRegenerateContext(sessionMessages, messageId)
    if (!regeneration) {
      setError('无法重新生成：未找到对应的消息上下文')
      return
    }

    await sendChatRequest({
      content: regeneration.sourceUserMessage.content,
      files: regeneration.sourceUserMessage.files,
      agentConfig,
      messageHistory: regeneration.history,
      requestMode: 'regenerate',
      optimisticMessages: regeneration.truncatedMessages,
    })
  }, [currentSessionId, messages, sendChatRequest, setError])

  const clearChat = useCallback(() => {
    activeLoadControllerRef.current?.abort()
    loadingSessionRef.current = null
    loadingRequestIdRef.current += 1
    clearMessages()
    setError(null)
    setCurrentSessionId(null)
  }, [clearMessages, setError, setCurrentSessionId])

  return {
    messages,
    isLoading,
    isStreaming,
    error,
    currentSessionId,
    sendMessage,
    continueFromCheckpoint,
    stopGeneration,
    regenerate,
    clearChat,
    loadSessionMessages,
  }
}
