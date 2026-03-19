import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAssistantParts,
  getAgentCheckpointMeta,
  updateAssistantPartsFromStreamEvent,
} from '@/lib/agent/message-parts'
import type { AssistantMessagePart, StreamChunk } from '@/types/chat'

function getTracePart(parts: AssistantMessagePart[]) {
  return parts.find((part) => part.kind === 'agent_trace')
}

function getFinalPart(parts: AssistantMessagePart[]) {
  return parts.find((part) => part.kind === 'final_content')
}

test('buildAssistantParts prefers structured agent parts metadata', () => {
  const parts = buildAssistantParts({
    content: '最终回答',
    metadata: {
      agent: {
        status: 'paused',
        checkpoint: {
          checkpointId: 'cp_new',
          resumable: true,
          label: '继续处理',
        },
        parts: [
          {
            kind: 'agent_trace',
            status: 'paused',
            items: [
              {
                type: 'thinking_summary',
                id: 'thinking_1',
                text: '正在检查现有实现',
                createdAt: 1,
              },
            ],
            resumable: {
              checkpointId: 'cp_new',
              label: '继续处理',
            },
          },
          {
            kind: 'final_content',
            text: '最终回答',
          },
        ],
      },
    },
  })

  const trace = getTracePart(parts)
  const final = getFinalPart(parts)

  assert.ok(trace)
  assert.equal(trace?.status, 'paused')
  assert.equal(trace?.items[0]?.type, 'thinking_summary')
  assert.equal(final?.kind, 'final_content')
  assert.equal(final?.text, '最终回答')
})

test('buildAssistantParts does not read legacy event metadata', () => {
  const parts = buildAssistantParts({
    content: '整理后的结果',
    metadata: {
      agentEvents: [{ type: 'run_started', payload: { runId: 'run_1' } }],
    },
  })

  const trace = getTracePart(parts)
  const final = getFinalPart(parts)

  assert.equal(trace, undefined)
  assert.equal(final?.text, '整理后的结果')
})

test('updateAssistantPartsFromStreamEvent aggregates product events into trace and final parts', () => {
  const sequence: StreamChunk[] = [
    { type: 'agent.status', payload: { state: 'thinking', label: '正在理解需求' } },
    { type: 'agent.thinking', payload: { id: 'think_1', text: '先检查现有实现' } },
    { type: 'agent.tool', payload: { id: 'tool_1', toolName: 'read_file', state: 'started' } },
    { type: 'agent.tool', payload: { id: 'tool_1', toolName: 'read_file', state: 'success', summary: '已读取 3 个文件', latencyMs: 24 } },
    { type: 'agent.checkpoint', payload: { checkpointId: 'cp_2', resumable: true, label: '继续处理' } },
    { type: 'message.done', payload: { content: '已完成处理' } },
  ]

  const parts = sequence.reduce(
    (current, event) => updateAssistantPartsFromStreamEvent(current, event),
    [] as AssistantMessagePart[],
  )

  const trace = getTracePart(parts)
  const final = getFinalPart(parts)

  assert.ok(trace)
  assert.equal(trace?.status, 'paused')
  assert.equal(trace?.resumable?.checkpointId, 'cp_2')
  assert.ok(trace?.items.some((item) => item.type === 'thinking_summary' && item.text === '先检查现有实现'))
  assert.ok(
    trace?.items.some(
      (item) =>
        item.type === 'tool_status'
        && item.id === 'tool_1'
        && item.state === 'success'
        && item.summary === '已读取 3 个文件',
    ),
  )
  assert.equal(final?.text, '已完成处理')
})

test('getAgentCheckpointMeta only reads metadata.agent.checkpoint', () => {
  assert.deepEqual(
    getAgentCheckpointMeta({
      agent: {
        checkpoint: {
          checkpointId: 'cp_new',
          resumable: true,
          label: '继续处理',
        },
      },
      agentRuntime: {
        checkpointId: 'cp_old',
        status: 'paused',
      },
    }),
    {
      checkpointId: 'cp_new',
      resumable: true,
      label: '继续处理',
    },
  )

  assert.equal(getAgentCheckpointMeta({ agentRuntime: { checkpointId: 'cp_old', status: 'failed' } }), undefined)
})
