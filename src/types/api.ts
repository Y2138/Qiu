export interface ApiResponse<T> {
  success: boolean
  data: T
  error?: ApiError
  statusCode?: number
  timestamp?: string
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface SSEMessage {
  type: 'chunk' | 'done' | 'error'
  content?: string
  messageId?: string
  error?: string
}
