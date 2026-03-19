import type {
  AgentCheckpointMetadata,
  AgentMessageMetadata,
  AgentTraceItem,
  AgentTracePart,
  AgentTraceStatus,
  AssistantMessagePart,
  StreamChunk,
} from '@/types/chat'

type RecordLike = Record<string, unknown>

const RUN_STATUS_COPY: Record<string, { tone: 'info' | 'warning' | 'success'; text: string }> = {
  started: { tone: 'info', text: '开始处理你的请求' },
  thinking: { tone: 'info', text: '正在理解需求' },
  tool_running: { tone: 'info', text: '正在调用工具处理' },
  finalizing: { tone: 'info', text: '正在整理最终回答' },
  paused: { tone: 'warning', text: '处理已暂停，可继续' },
  completed: { tone: 'success', text: '处理完成' },
  failed: { tone: 'warning', text: '处理未顺利完成' },
}

export function buildAssistantParts(input: {
  content?: string
  metadata?: unknown
}): AssistantMessagePart[] {
  const partsFromMetadata = normalizeAgentParts(getAgentRecord(input.metadata)?.parts)
  return ensureFinalPart(partsFromMetadata, input.content ?? '')
}

export function updateAssistantPartsFromStreamEvent(
  currentParts: AssistantMessagePart[],
  event: StreamChunk,
): AssistantMessagePart[] {
  const parts = cloneParts(currentParts)

  switch (event.type) {
    case 'agent.status':
      return applyAgentStatus(parts, event.payload)
    case 'agent.thinking':
      return appendTraceItem(parts, {
        type: 'thinking_summary',
        id: readString(event.payload?.id) ?? createId('thinking'),
        text: readString(event.payload?.text) ?? '正在继续处理',
        createdAt: Date.now(),
      })
    case 'agent.tool':
      return applyToolEvent(parts, event.payload)
    case 'agent.checkpoint':
      return attachCheckpoint(parts, {
        checkpointId: readString(event.payload?.checkpointId) ?? '',
        resumable: readBoolean(event.payload?.resumable) ?? true,
        label: readString(event.payload?.label) ?? '继续处理',
      })
    case 'message.delta':
      return upsertFinalPart(parts, readString(event.payload?.content) ?? '', true, true)
    case 'message.done':
      return upsertFinalPart(parts, readString(event.payload?.content) ?? '', false, false)
    case 'error':
      return appendRunStatus(setTraceStatus(parts, 'failed'), {
        tone: 'warning',
        text: readString(event.payload?.message) ?? '处理未顺利完成',
      })
    default:
      return parts
  }
}

export function getAgentCheckpointMeta(metadata: unknown): AgentCheckpointMetadata | undefined {
  const agent = getAgentRecord(metadata)
  return normalizeCheckpoint(agent?.checkpoint)
}

function normalizeAgentParts(value: unknown): AssistantMessagePart[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: AssistantMessagePart[] = []

  value.forEach((part) => {
    if (!isRecord(part) || typeof part.kind !== 'string') {
      return
    }

    if (part.kind === 'agent_trace') {
      const items = Array.isArray(part.items)
        ? part.items.filter(isTraceItem)
        : []
      result.push({
        kind: 'agent_trace',
        status: normalizeTraceStatus(part.status),
        items,
        resumable: normalizeCheckpoint(part.resumable),
      } satisfies AgentTracePart)
      return
    }

    if (part.kind === 'final_content') {
      result.push({
        kind: 'final_content',
        text: readString(part.text) ?? '',
        isStreaming: readBoolean(part.isStreaming),
      })
      return
    }
  })

  return result
}

function isTraceItem(value: unknown): value is AgentTraceItem {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false
  }

  if (value.type === 'thinking_summary') {
    return typeof value.id === 'string' && typeof value.text === 'string' && typeof value.createdAt === 'number'
  }

  if (value.type === 'tool_status') {
    return (
      typeof value.id === 'string'
      && typeof value.toolName === 'string'
      && (value.state === 'running' || value.state === 'success' || value.state === 'failed')
      && typeof value.createdAt === 'number'
    )
  }

  if (value.type === 'run_status') {
    return (
      typeof value.id === 'string'
      && (value.tone === 'info' || value.tone === 'warning' || value.tone === 'success')
      && typeof value.text === 'string'
      && typeof value.createdAt === 'number'
    )
  }

  return false
}

function getAgentRecord(metadata: unknown): AgentMessageMetadata | undefined {
  if (!isRecord(metadata) || !isRecord(metadata.agent)) {
    return undefined
  }
  return metadata.agent as unknown as AgentMessageMetadata
}

function applyAgentStatus(parts: AssistantMessagePart[], payload: unknown): AssistantMessagePart[] {
  const state = normalizeStreamState(readString((payload as RecordLike | undefined)?.state))
  const label = readString((payload as RecordLike | undefined)?.label) ?? RUN_STATUS_COPY[state].text
  const nextStatus = toTraceStatus(state)
  return appendRunStatus(setTraceStatus(parts, nextStatus), {
    tone: RUN_STATUS_COPY[state].tone,
    text: label,
  })
}

function applyToolEvent(parts: AssistantMessagePart[], payload: unknown): AssistantMessagePart[] {
  const record = isRecord(payload) ? payload : {}
  const trace = ensureTracePart(parts)
  const id = readString(record.id) ?? createId('tool')
  const toolName = readString(record.toolName) ?? '工具'
  const state = normalizeToolState(readString(record.state))
  const summary = readString(record.summary)
  const latencyMs = readNumber(record.latencyMs)
  const existingIndex = trace.items.findIndex((item) => item.type === 'tool_status' && item.id === id)
  const nextItem = {
    type: 'tool_status' as const,
    id,
    toolName,
    state,
    summary,
    latencyMs,
    createdAt: existingIndex >= 0 ? trace.items[existingIndex]!.createdAt : Date.now(),
  }

  if (existingIndex >= 0) {
    trace.items.splice(existingIndex, 1, nextItem)
  } else {
    trace.items.push(nextItem)
  }

  trace.status = state === 'failed' ? 'failed' : trace.status
  return withTracePart(parts, trace)
}

function appendTraceItem(parts: AssistantMessagePart[], item: AgentTraceItem): AssistantMessagePart[] {
  const trace = ensureTracePart(parts)
  trace.items.push(item)
  return withTracePart(parts, trace)
}

function appendRunStatus(
  parts: AssistantMessagePart[],
  input: { tone: 'info' | 'warning' | 'success'; text: string },
): AssistantMessagePart[] {
  return appendTraceItem(parts, {
    type: 'run_status',
    id: createId('status'),
    tone: input.tone,
    text: input.text,
    createdAt: Date.now(),
  })
}

function attachCheckpoint(parts: AssistantMessagePart[], checkpoint: AgentCheckpointMetadata): AssistantMessagePart[] {
  if (!checkpoint.checkpointId) {
    return parts
  }

  const trace = ensureTracePart(parts)
  trace.status = checkpoint.resumable ? 'paused' : trace.status
  trace.resumable = checkpoint
  return withTracePart(parts, trace)
}

function upsertFinalPart(
  parts: AssistantMessagePart[],
  text: string,
  append = false,
  isStreaming = false,
): AssistantMessagePart[] {
  const next = cloneParts(parts)
  const current = next.find((part) => part.kind === 'final_content')
  if (current) {
    current.text = append ? `${current.text}${text}` : text || current.text
    current.isStreaming = isStreaming
    return next
  }

  next.push({
    kind: 'final_content',
    text,
    isStreaming,
  })
  return next
}

function ensureFinalPart(parts: AssistantMessagePart[], content: string): AssistantMessagePart[] {
  const next = cloneParts(parts)
  const final = next.find((part) => part.kind === 'final_content')
  if (final) {
    if (!final.text && content) {
      final.text = content
    }
    return next
  }

  if (content) {
    next.push({
      kind: 'final_content',
      text: content,
    })
  }
  return next
}

function ensureTracePart(parts: AssistantMessagePart[]): AgentTracePart {
  const existing = parts.find((part) => part.kind === 'agent_trace')
  if (existing) {
    return {
      ...existing,
      items: [...existing.items],
      resumable: existing.resumable ? { ...existing.resumable } : undefined,
    }
  }

  return {
    kind: 'agent_trace',
    status: 'running',
    items: [],
  }
}

function withTracePart(parts: AssistantMessagePart[], trace: AgentTracePart): AssistantMessagePart[] {
  const next = cloneParts(parts).filter((part) => part.kind !== 'agent_trace')
  return [trace, ...next]
}

function setTraceStatus(parts: AssistantMessagePart[], status: AgentTraceStatus): AssistantMessagePart[] {
  const trace = ensureTracePart(parts)
  trace.status = status
  return withTracePart(parts, trace)
}

function cloneParts(parts: AssistantMessagePart[]): AssistantMessagePart[] {
  return parts.map((part) => {
    if (part.kind === 'agent_trace') {
      return {
        ...part,
        items: [...part.items],
        resumable: part.resumable ? { ...part.resumable } : undefined,
      }
    }

    return { ...part }
  })
}

function normalizeCheckpoint(value: unknown): AgentCheckpointMetadata | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const checkpointId = readString(value.checkpointId)
  if (!checkpointId) {
    return undefined
  }

  return {
    checkpointId,
    resumable: readBoolean(value.resumable) ?? true,
    label: readString(value.label) ?? '继续处理',
  }
}

function normalizeTraceStatus(value: unknown): AgentTraceStatus {
  return value === 'paused' || value === 'failed' || value === 'completed'
    ? value
    : 'running'
}

function normalizeStreamState(value: string | undefined): keyof typeof RUN_STATUS_COPY {
  return value === 'started'
    || value === 'thinking'
    || value === 'tool_running'
    || value === 'finalizing'
    || value === 'paused'
    || value === 'completed'
    || value === 'failed'
    ? value
    : 'thinking'
}

function normalizeToolState(value: string | undefined): 'running' | 'success' | 'failed' {
  return value === 'success' || value === 'failed' ? value : 'running'
}

function toTraceStatus(state: keyof typeof RUN_STATUS_COPY): AgentTraceStatus {
  if (state === 'paused') return 'paused'
  if (state === 'failed') return 'failed'
  if (state === 'completed') return 'completed'
  return 'running'
}

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

function isRecord(value: unknown): value is RecordLike {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}
