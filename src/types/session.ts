import type { Message } from './chat'

export interface Session {
  id: string
  userId: string
  title: string
  model: string
  createdAt: Date
  updatedAt: Date
  isPinned?: boolean
  agentStatus?: 'running' | 'paused' | 'failed' | 'completed'
  agentStatusText?: string
  hasRunnableCheckpoint?: boolean
  latestAgentRunAt?: Date
}

export interface SessionWithMessages extends Session {
  messages: Message[]
}

export interface SessionListResponse {
  items: Session[]
  total: number
  page: number
  limit: number
}

export interface CreateSessionRequest {
  title: string
  model: string
}

export interface UpdateSessionRequest {
  title?: string
  model?: string
}
