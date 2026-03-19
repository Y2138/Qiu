import { get, post, patch, del } from './api'
import type {
  Session,
  SessionWithMessages,
  SessionListResponse,
  CreateSessionRequest,
  UpdateSessionRequest,
} from '@/types/session'
import type { MessageListResponse } from '@/types/chat'

export async function getMessagesBySession(
  sessionId: string,
  signal?: AbortSignal
): Promise<MessageListResponse> {
  return get<MessageListResponse>(`/messages?sessionId=${sessionId}`, { signal })
}

export async function getSessions(
  page: number = 1,
  limit: number = 50
): Promise<SessionListResponse> {
  return get<SessionListResponse>(`/sessions?page=${page}&limit=${limit}`)
}

export async function getSession(id: string): Promise<SessionWithMessages> {
  return get<SessionWithMessages>(`/sessions/${id}`)
}

export async function createSession(
  data: CreateSessionRequest
): Promise<Session> {
  return post<Session>('/sessions', data)
}

export async function updateSession(
  id: string,
  data: UpdateSessionRequest
): Promise<Session> {
  return patch<Session>(`/sessions/${id}`, data)
}

export async function generateSessionTitle(
  id: string,
  options?: { force?: boolean }
): Promise<{ title: string }> {
  return post<{ title: string }>(`/sessions/${id}/title`, {
    force: options?.force ?? false,
  })
}

export async function deleteSession(id: string): Promise<void> {
  return del(`/sessions/${id}`)
}
