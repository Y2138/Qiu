'use client'

import { useCallback, useMemo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSessionStore } from '@/stores/sessionStore'
import { useUIStore } from '@/stores/uiStore'
import {
  getSessions,
  createSession as createSessionApi,
  updateSession as updateSessionApi,
  deleteSession as deleteSessionApi,
} from '@/services/session'
import type { Session } from '@/types/session'

// 模块级标记，避免多实例 useSession 时重复请求会话列表
let sessionListInitialized = false
// 模块级标记：仅在首次可用会话列表时执行“默认选中最近会话”
let initialSessionSelectionApplied = false

function getTimestamp(value: Date): number {
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? Number.MIN_SAFE_INTEGER : timestamp
}

function getLatestSessionId(sessionList: Session[]): string | null {
  if (sessionList.length === 0) return null

  let latestSession = sessionList[0]
  let latestTimestamp = getTimestamp(sessionList[0].updatedAt)

  for (let index = 1; index < sessionList.length; index += 1) {
    const currentTimestamp = getTimestamp(sessionList[index].updatedAt)
    if (currentTimestamp > latestTimestamp) {
      latestSession = sessionList[index]
      latestTimestamp = currentTimestamp
    }
  }

  return latestSession.id
}

interface UseSessionReturn {
  sessions: Session[]
  activeSessionId: string | null
  searchQuery: string
  filteredSessions: Session[]
  isLoading: boolean
  error: string | null
  setActiveSession: (id: string | null) => void
  createSession: (title?: string, model?: string) => Promise<Session>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  searchSessions: (query: string) => void
  togglePin: (id: string) => void
  refreshSessions: () => Promise<void>
}

export function useSession(): UseSessionReturn {
  const {
    sessions,
    activeSessionId,
    isLoading,
    error,
    setSessions,
    setActiveSession,
    createSession: addSession,
    deleteSession: removeSession,
    updateSession,
    togglePinSession,
    setLoading,
    setError,
  } = useSessionStore(
    useShallow((s) => ({
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      isLoading: s.isLoading,
      error: s.error,
      setSessions: s.setSessions,
      setActiveSession: s.setActiveSession,
      createSession: s.createSession,
      deleteSession: s.deleteSession,
      updateSession: s.updateSession,
      togglePinSession: s.togglePinSession,
      setLoading: s.setLoading,
      setError: s.setError,
    }))
  )
  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)

  const isRefreshingRef = useRef(false)

  const filteredSessions = useMemo(() => {
    if (!sessions) return []
    if (!searchQuery) return sessions
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [sessions, searchQuery])

  const refreshSessions = useCallback(async () => {
    // 防止并发重复请求
    if (isRefreshingRef.current) return

    isRefreshingRef.current = true
    try {
      setLoading(true)
      setError(null)
      const response = await getSessions(1, 100)
      const sessions = response.items || []
      setSessions(sessions)

      if (sessions.length === 0) {
        setActiveSession(null)
        initialSessionSelectionApplied = false
        return
      }

      const latestSessionId = getLatestSessionId(sessions)
      if (!latestSessionId) {
        setActiveSession(null)
        return
      }

      const currentActiveSessionId = useSessionStore.getState().activeSessionId
      const hasValidActiveSession = sessions.some(
        (session) => session.id === currentActiveSessionId
      )

      // 首次加载会话列表时，仅在当前没有有效选中项时才回退到最近会话
      if (!initialSessionSelectionApplied) {
        if (!hasValidActiveSession) {
          setActiveSession(latestSessionId)
        }
        initialSessionSelectionApplied = true
        return
      }

      // active 已失效时，回退到最近会话
      if (!hasValidActiveSession) {
        setActiveSession(latestSessionId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取会话列表失败')
    } finally {
      setLoading(false)
      isRefreshingRef.current = false
    }
  }, [setSessions, setLoading, setError, setActiveSession])

  useEffect(() => {
    if (sessionListInitialized) return
    if (sessions?.length === 0 && !isRefreshingRef.current) {
      sessionListInitialized = true
      refreshSessions()
    }
  }, [sessions?.length, refreshSessions])

  const createSession = useCallback(
    async (title: string = '新对话', model: string = 'gpt-4o') => {
      try {
        setLoading(true)
        setError(null)
        const newSession = await createSessionApi({ title, model })
        addSession(newSession)
        setActiveSession(newSession.id)
        return newSession
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '创建会话失败'
        setError(errorMsg)
        throw new Error(errorMsg)
      } finally {
        setLoading(false)
      }
    },
    [addSession, setActiveSession, setLoading, setError]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        setLoading(true)
        setError(null)
        const deletedIsActive = useSessionStore.getState().activeSessionId === id
        await deleteSessionApi(id)
        removeSession(id)
        if (deletedIsActive) {
          const latestSessionId = getLatestSessionId(useSessionStore.getState().sessions)
          setActiveSession(latestSessionId)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '删除会话失败'
        setError(errorMsg)
        throw new Error(errorMsg)
      } finally {
        setLoading(false)
      }
    },
    [removeSession, setActiveSession, setLoading, setError]
  )

  const renameSession = useCallback(
    async (id: string, title: string) => {
      try {
        setLoading(true)
        setError(null)
        const updatedSession = await updateSessionApi(id, { title })
        updateSession(id, { title: updatedSession.title, updatedAt: updatedSession.updatedAt })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '重命名会话失败'
        setError(errorMsg)
        throw new Error(errorMsg)
      } finally {
        setLoading(false)
      }
    },
    [updateSession, setLoading, setError]
  )

  const searchSessions = useCallback(
    (query: string) => {
      setSearchQuery(query)
    },
    [setSearchQuery]
  )

  const togglePin = useCallback(
    (id: string) => {
      togglePinSession(id)
    },
    [togglePinSession]
  )

  return {
    sessions,
    activeSessionId,
    searchQuery,
    filteredSessions,
    isLoading,
    error,
    setActiveSession,
    createSession,
    deleteSession,
    renameSession,
    searchSessions,
    togglePin,
    refreshSessions,
  }
}
