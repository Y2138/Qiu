import { get, post } from './api'
import type { AgentConfigResponse, ChatRequest, ChatResponse } from '@/types/chat'

export async function chatCompletion(data: ChatRequest): Promise<ChatResponse> {
  return post<ChatResponse>('/chat/completion', data)
}

export async function getModels(): Promise<
  Array<{ provider: string; model: string }>
> {
  return get('/chat/models')
}

export async function getProviders(): Promise<string[]> {
  return get('/chat/providers')
}

export async function getAgentConfig(): Promise<AgentConfigResponse> {
  return get('/chat/agent-config')
}
