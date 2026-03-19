import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentRunViewModelFromMessage, loadCheckpointForResume } from '@/lib/agent/persistence'

test('buildAgentRunViewModelFromMessage prefers structured checkpoint metadata on assistant message', () => {
  const run = buildAgentRunViewModelFromMessage({
    id: 'm1',
    sessionId: 's1',
    role: 'assistant',
    content: 'done',
    createdAt: new Date(),
    metadata: {
      agent: {
        status: 'paused',
        checkpoint: {
          checkpointId: 'cp_structured',
          resumable: true,
          label: '继续处理',
        },
        parts: [
          {
            kind: 'agent_trace',
            status: 'paused',
            items: [],
            resumable: {
              checkpointId: 'cp_structured',
              resumable: true,
              label: '继续处理',
            },
          },
        ],
      },
    },
  } as never)

  assert.equal(run?.latestRunnableCheckpoint?.checkpointId, 'cp_structured')
  assert.equal(run?.status, 'paused')
})

test('loadCheckpointForResume only reads checkpoint table and does not fall back to message metadata', async () => {
  const result = await loadCheckpointForResume({
    agentRun: {
      create: async () => ({}),
      update: async () => ({}),
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
    },
    agentCheckpoint: {
      create: async () => ({}),
      findMany: async () => [],
      findUnique: async () => null,
    },
    agentMemoryEntry: {
      findMany: async () => [],
      createMany: async () => ({}),
      deleteMany: async () => ({}),
    },
    message: {
      findMany: async () => {
        throw new Error('message fallback should not be called')
      },
    },
    user: {
      findUnique: async () => null,
      update: async () => ({}),
    },
  } as never, 's1', 'cp_missing')

  assert.equal(result.checkpoint, undefined)
  assert.equal(result.error?.includes('未找到对应的 checkpoint'), true)
})
