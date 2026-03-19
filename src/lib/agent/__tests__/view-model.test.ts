import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentRunViewModel, getConsumedCheckpointIds, getLatestRunnableCheckpoint, getSessionAgentPreview } from '@/lib/agent/view-model';
import type { Message } from '@/types/chat';

function createAssistantMessage(metadata: Record<string, unknown>): Message {
  return {
    id: crypto.randomUUID(),
    sessionId: 's1',
    role: 'assistant',
    content: 'done',
    createdAt: new Date(),
    metadata,
  };
}

test('buildAgentRunViewModel derives checkpoint and memory summary', () => {
  const message = createAssistantMessage({
    agent: {
      runId: 'run_1',
      status: 'paused',
      checkpoint: {
        checkpointId: 'cp_1',
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
              id: 'think_1',
              text: '正在输出方案',
              createdAt: Date.now(),
            },
          ],
          resumable: {
            checkpointId: 'cp_1',
            resumable: true,
            label: '继续处理',
          },
        },
      ],
      summary: {
        goal: '整理需求',
        userMemoryEntryCount: 2,
        memorySummary: {
          goal: '整理需求',
          currentTask: '输出方案',
          completedSteps: ['分析'],
          pendingSteps: ['输出方案'],
          keyObservations: ['工具返回成功'],
          constraints: ['不要猜测'],
          decisions: ['Completed step: 分析'],
          openQuestions: ['需要确认输出格式'],
          updatedAt: Date.now(),
          compactedAt: Date.now(),
        },
      },
    },
  });

  const run = buildAgentRunViewModel(message);
  assert.ok(run);
  assert.equal(run?.latestRunnableCheckpoint?.checkpointId, 'cp_1');
  assert.equal(run?.memory.userCount, 2);
  assert.equal(run?.memory.session?.goal, '整理需求');
  assert.equal(run?.memory.session?.currentTask, '输出方案');
  assert.equal(run?.recentEvents.length, 0);
  assert.equal(run?.source, 'metadata');
  assert.equal(run?.config.memoryMode, 'session');
});

test('buildAgentRunViewModel falls back to structured parts checkpoint before legacy events', () => {
  const message = createAssistantMessage({
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
  });

  const run = buildAgentRunViewModel(message);
  assert.equal(run?.latestRunnableCheckpoint?.checkpointId, 'cp_structured');
  assert.equal(run?.status, 'paused');
});

test('getLatestRunnableCheckpoint prefers newest resumable checkpoint', () => {
  const messages = [
    createAssistantMessage({
      agent: { runId: 'run_old', status: 'completed', goal: '旧任务' },
    }),
    createAssistantMessage({
      agent: {
        runId: 'run_new',
        status: 'failed',
        goal: '新任务',
        checkpoint: {
          checkpointId: 'cp_new',
          resumable: true,
          label: '继续处理',
        },
      },
    }),
  ];

  const checkpoint = getLatestRunnableCheckpoint(messages);
  assert.equal(checkpoint?.checkpointId, 'cp_new');
});

test('getLatestRunnableCheckpoint ignores checkpoints already resumed by later runs', () => {
  const messages = [
    createAssistantMessage({
      agent: {
        runId: 'run_old',
        status: 'paused',
        goal: '旧任务',
        checkpoint: {
          checkpointId: 'cp_resume_me',
          resumable: true,
          label: '继续处理',
        },
      },
    }),
    createAssistantMessage({
      agent: {
        runId: 'run_new',
        status: 'running',
        goal: '恢复后的任务',
        resumedFromCheckpointId: 'cp_resume_me',
      },
    }),
  ];

  const checkpoint = getLatestRunnableCheckpoint(messages);
  const consumedCheckpointIds = getConsumedCheckpointIds(messages);

  assert.equal(checkpoint, undefined);
  assert.equal(consumedCheckpointIds.has('cp_resume_me'), true);
});

test('getSessionAgentPreview exposes session badge state', () => {
  const messages = [
    createAssistantMessage({
      agent: {
        runId: 'run_preview',
        status: 'paused',
        goal: '待恢复任务',
        checkpoint: {
          checkpointId: 'cp_resume',
          resumable: true,
          label: '继续处理',
        },
      },
    }),
  ];

  const preview = getSessionAgentPreview(messages);
  assert.equal(preview.status, 'paused');
  assert.equal(preview.hasRunnableCheckpoint, true);
  assert.equal(preview.statusText, '已暂停，可继续');
});
