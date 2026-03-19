import { get, patch } from './api'
import type { AgentMemoryResponse } from '@/types/chat'
import type { UserSettingsPatch } from '@/types/settings'
import type { User as UserProfile } from '@/types/user'

interface UpdatePasswordPayload {
  currentPassword: string
  newPassword: string
}

export const userService = {
  getMe: () => get<UserProfile>('/users/me'),

  updateProfile: (name: string) =>
    patch<UserProfile>('/users/me', { name }),

  updateSettings: (settings: UserSettingsPatch) =>
    patch<UserProfile>('/users/me', { settings }),

  updatePassword: (payload: UpdatePasswordPayload) =>
    patch<null>('/users/me/password', payload),

  getAgentMemory: () =>
    get<AgentMemoryResponse>('/users/me/agent-memory'),

  updateAgentMemory: (
    payload:
      | { action: 'delete'; id: string }
      | { action: 'clear' }
      | { action: 'add'; kind: 'preference' | 'project_context'; content: string },
  ) =>
    patch<AgentMemoryResponse>('/users/me/agent-memory', payload),
}
