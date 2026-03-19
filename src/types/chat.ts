export type MessageRole = 'user' | 'assistant' | 'system'

export type AgentEventType =
  | 'agent.status'
  | 'agent.thinking'
  | 'agent.tool'
  | 'agent.checkpoint'
  | 'message.delta'
  | 'message.done'
  | 'error'

export type AgentTraceStatus = 'running' | 'paused' | 'failed' | 'completed'

export type AgentStreamState =
  | 'started'
  | 'thinking'
  | 'tool_running'
  | 'finalizing'
  | 'paused'
  | 'completed'
  | 'failed'

export type AgentToolStreamState = 'started' | 'success' | 'failed'

export type AgentToolErrorType =
  | 'validation'
  | 'timeout'
  | 'execution'
  | 'policy'

export interface AgentCheckpointMetadata {
  checkpointId: string
  resumable: boolean
  label: string
}

export interface ThinkingSummaryItem {
  type: 'thinking_summary'
  id: string
  text: string
  createdAt: number
}

export interface ToolStatusItem {
  type: 'tool_status'
  id: string
  toolName: string
  state: 'running' | 'success' | 'failed'
  summary?: string
  latencyMs?: number
  createdAt: number
}

export interface RunStatusItem {
  type: 'run_status'
  id: string
  tone: 'info' | 'warning' | 'success'
  text: string
  createdAt: number
}

export type AgentTraceItem =
  | ThinkingSummaryItem
  | ToolStatusItem
  | RunStatusItem

export interface AgentTracePart {
  kind: 'agent_trace'
  status: AgentTraceStatus
  items: AgentTraceItem[]
  resumable?: AgentCheckpointMetadata
}

export interface FinalContentPart {
  kind: 'final_content'
  text: string
  isStreaming?: boolean
}

export type AssistantMessagePart = AgentTracePart | FinalContentPart

export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: string
  model?: string
  tokens?: number
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt?: Date
  files?: FileAttachment[]
  isStreaming?: boolean
  error?: string
}

export interface AgentMemorySummaryView {
  goal: string
  currentTask: string
  completedSteps: string[]
  pendingSteps: string[]
  keyObservations: string[]
  constraints: string[]
  decisions: string[]
  openQuestions: string[]
  updatedAt: number
  compactedAt: number
}

export interface AgentUserMemoryEntry {
  id: string
  scope: 'user'
  kind: 'preference' | 'project_context'
  content: string
  source: string
  updatedAt: number
}

export interface AgentMessageMetadata {
  runId: string
  status: string
  parts: AssistantMessagePart[]
  checkpoint?: AgentCheckpointMetadata
  resumedFromCheckpointId?: string
  summary?: Record<string, unknown>
}

export interface AgentRunResolvedConfig {
  promptPresetIds: string[]
  memoryMode: 'off' | 'session' | 'session+user'
  allowMcp: boolean
  maxSteps: number
}

export interface AgentCheckpointViewModel {
  checkpointId: string
  status: string
  goal?: string
  stopReason?: string
  resumable: boolean
  createdAt?: number
  contextSummary?: {
    messagesCount?: number
    observationCount?: number
    memoryCompactedAt?: number
  }
  inheritedConfig?: AgentRunResolvedConfig
}

export interface AgentMemoryViewModel {
  session?: AgentMemorySummaryView
  userCount: number
}

export interface AgentRunViewModel {
  runId: string
  messageId?: string
  status: string
  goal?: string
  checkpointId?: string
  resumedFromCheckpointId?: string
  latestRunnableCheckpoint?: AgentCheckpointViewModel
  checkpoints: AgentCheckpointViewModel[]
  recentEvents: StreamChunk[]
  memory: AgentMemoryViewModel
  config: AgentRunResolvedConfig
  source: 'api' | 'metadata'
  latestCheckpointCreatedAt?: number
  updatedAt?: number
  stopReason?: string
  summary?: Record<string, unknown>
}

export interface FileAttachment {
  id: string
  name: string
  type: string
  size: number
  url?: string
  base64?: string
  mimeType?: string
  status?: 'uploading' | 'uploaded' | 'failed'
  error?: string
}

export interface MessageDto {
  role: MessageRole
  content: string
}

export interface AgentRuntimeRequest {
  enabled?: boolean
  promptPresetIds?: string[]
  allowMcp?: boolean
  maxSteps?: number
  resumeFromCheckpointId?: string
  memoryMode?: 'off' | 'session' | 'session+user'
  retryPolicy?: {
    toolMaxRetry?: number
  }
}

export interface ChatRequest {
  messages: MessageDto[]
  requestMode?: 'default' | 'regenerate'
  attachments?: Array<{
    id: string
    name?: string
    mimeType?: string
    size?: number
    extractedContent?: string
  }>
  model: string
  apiKeyId: string
  temperature?: number
  maxTokens?: number
  sessionId?: string
  agent?: AgentRuntimeRequest
}

export interface ChatResponse {
  id: string
  content: string
  model: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  finishReason: string
}

export interface StreamChunk {
  type?: AgentEventType
  payload?: Record<string, unknown>
  content?: string
  finishReason?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface PromptPresetOption {
  id: string
  name: string
  description: string
  riskLevel: 'low' | 'medium' | 'high'
  source?: 'builtin' | 'local' | 'custom'
}

export interface AgentToolOption {
  name: string
  description: string
  source: 'builtin' | 'internal' | 'third-party' | 'mcp' | 'local'
  transport?: 'local' | 'stdio' | 'http' | 'sse' | 'ws'
  riskLevel?: 'low' | 'medium' | 'high'
}

export interface AgentConfigResponse {
  promptPresets: PromptPresetOption[]
  tools: AgentToolOption[]
}

export interface AgentMemoryResponse {
  entries: AgentUserMemoryEntry[]
}

export interface MessageListResponse {
  items: Message[]
  total: number
}
