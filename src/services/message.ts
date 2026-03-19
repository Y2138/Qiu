import { get, del } from './api'
import type { Message } from '@/types/chat'

export async function getMessage(id: string): Promise<Message> {
  return get<Message>(`/messages/${id}`)
}

export async function deleteMessage(id: string): Promise<void> {
  return del(`/messages/${id}`)
}
