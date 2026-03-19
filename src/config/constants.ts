export const APP_CONFIG = {
  name: 'QiuChat',
  version: '1.0.0',
  description: 'AI 对话平台',
  author: 'QiuChat Team',
} as const

export const CHAT_CONFIG = {
  maxMessagesPerSession: 1000,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  streamingTimeout: 60000, // 60s
  reconnectAttempts: 3,
  reconnectDelay: 1000, // 1s
} as const

export const UI_CONFIG = {
  sidebarWidth: 280,
  sidebarCollapsedWidth: 64,
  messageMaxWidth: 768,
  codeBlockMaxHeight: 500,
  toastDuration: 5000,
} as const

export const PAGINATION_CONFIG = {
  defaultPageSize: 20,
  maxPageSize: 100,
} as const
