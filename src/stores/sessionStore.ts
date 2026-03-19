import { create } from 'zustand'
import type { Session } from '@/types/session'

interface SessionState {
  sessions: Session[]
  activeSessionId: string | null
  searchQuery: string
  isLoading: boolean
  error: string | null

  setSessions: (sessions: Session[]) => void
  addSession: (session: Session) => void
  createSession: (session: Session) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  deleteSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  setSearchQuery: (query: string) => void
  togglePinSession: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  searchQuery: '',
  isLoading: false,
  error: null,

  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((state) => ({ sessions: [session, ...state.sessions] })),
  createSession: (session) => set((state) => ({
    sessions: [session, ...state.sessions],
    activeSessionId: session.id,
  })),
  updateSession: (id, updates) => set((state) => ({
    sessions: state.sessions.map((s) => s.id === id ? { ...s, ...updates } : s)
  })),
  deleteSession: (id) => set((state) => ({
    sessions: state.sessions.filter((s) => s.id !== id),
    activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
  })),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  togglePinSession: (id) => set((state) => ({
    sessions: state.sessions.map((s) => s.id === id ? { ...s, isPinned: !s.isPinned } : s)
  })),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))
