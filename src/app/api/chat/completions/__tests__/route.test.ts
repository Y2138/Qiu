import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createChatCompletionsHandler } from '@/app/api/chat/completions/route';
import type { AgentRunSummary } from '@/lib/agent/types';
import type { ChatLogRecord, ChatLogRepository } from '@/lib/chat-logs';

function buildRequest(payload: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/chat/completions', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
    },
  });
}

function createChatLogRepositoryCollector() {
  const entries: ChatLogRecord[] = [];
  return {
    entries,
    repository: {
      async save(entry: ChatLogRecord) {
        entries.push(entry);
        return entry;
      },
      async list() {
        return { items: [], nextCursor: null };
      },
      async deleteOlderThan() {
        return 0;
      },
    } satisfies ChatLogRepository,
  };
}

test('chat completions route returns ordered agent events and persists metadata summary', async () => {
  const messageCreates: Array<Record<string, unknown>> = [];
  const userUpdates: Array<Record<string, unknown>> = [];
  const agentRunCreates: Array<Record<string, unknown>> = [];
  const agentRunUpdates: Array<Record<string, unknown>> = [];
  const agentCheckpointCreates: Array<Record<string, unknown>> = [];
  const agentMemoryDeletes: Array<Record<string, unknown>> = [];
  const agentMemoryCreates: Array<Record<string, unknown>> = [];
  const agentRounds: Array<Record<string, unknown>> = [];

  const summary: AgentRunSummary = {
    runId: 'run_1',
    checkpointId: 'cp_1',
    goal: '请记住：我喜欢简洁风格',
    promptPresetIds: ['general-assistant'],
    tools: [{ name: 'echo_text', success: false, source: 'local', errorType: 'timeout', latencyMs: 30 }],
    status: 'failed',
    stepCount: 1,
    errors: ['timeout'],
    latencyMs: 41,
    userMemoryEntryCount: 1,
  };

  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
      agentRun: {
        create: async (args: Record<string, unknown>) => {
          agentRunCreates.push(args);
          return {};
        },
        update: async (args: Record<string, unknown>) => {
          agentRunUpdates.push(args);
          return {};
        },
        findMany: async () => [],
        findFirst: async () => null,
        findUnique: async () => null,
      },
      agentCheckpoint: {
        create: async (args: Record<string, unknown>) => {
          agentCheckpointCreates.push(args);
          return {};
        },
        findMany: async () => [],
        findUnique: async () => null,
      },
      agentMemoryEntry: {
        findMany: async () => [],
        deleteMany: async (args: Record<string, unknown>) => {
          agentMemoryDeletes.push(args);
          return {};
        },
        createMany: async (args: Record<string, unknown>) => {
          agentMemoryCreates.push(args);
          return {};
        },
      },
      message: {
        create: async (args: Record<string, unknown>) => {
          messageCreates.push(args);
          return {};
        },
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({
          settings: {
            theme: 'system',
            tone: 'gentle',
            responseDensity: 'detailed',
            workMode: 'direct',
          },
        }),
        update: async (args: Record<string, unknown>) => {
          userUpdates.push(args);
          return {};
        },
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async (_adapter, _messages, options) => {
      agentRounds.push(options as unknown as Record<string, unknown>);

      return {
        finalResponse: {
          id: 'resp_1',
          model: 'gpt-4o',
          content: 'done',
        },
        events: [
          { type: 'agent.status', payload: { runId: 'run_1', state: 'started', label: '开始处理你的请求' } },
          { type: 'agent.tool', payload: { id: 'call_1', toolName: 'echo_text', state: 'started' } },
          { type: 'agent.tool', payload: { id: 'call_1', toolName: 'echo_text', state: 'failed', summary: 'timeout' } },
          { type: 'agent.checkpoint', payload: { checkpointId: 'cp_1', status: 'paused', resumable: true, label: '继续处理' } },
          { type: 'message.done', payload: { content: 'done' } },
        ],
        summary,
        checkpoint: {
          checkpointId: 'cp_1',
          runId: 'run_1',
          createdAt: Date.now(),
          stepCount: 1,
          status: 'paused',
          goal: 'hello',
          messages: [{ role: 'user', content: '请记住：我喜欢简洁风格' }],
          steps: [{ id: 'step_1', order: 1, title: 'Execute', status: 'failed' }],
          observations: [],
          stopReason: 'tool_failure',
        },
        state: {} as never,
      };
    },
  });

  const request = buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '请记住：我喜欢简洁风格' }],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session+user',
      promptPresetIds: ['general-assistant'],
      maxSteps: 4,
      retryPolicy: {
        toolMaxRetry: 1,
      },
    },
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);

  const eventTypes = body.data.events.map((event: { type: string }) => event.type);
  assert.deepEqual(eventTypes, ['agent.status', 'agent.tool', 'agent.tool', 'agent.checkpoint', 'message.done']);

  const toolResult = body.data.events.find((event: { type: string; payload?: Record<string, unknown> }) => event.type === 'agent.tool' && event.payload?.state === 'failed');
  assert.equal(toolResult.payload?.summary, 'timeout');

  const assistantMessage = messageCreates.find((entry) => {
    const data = entry.data as { role?: string } | undefined;
    return data?.role === 'assistant';
  });

  const metadata = (assistantMessage?.data as {
    metadata?: {
      agent?: {
        runId?: string
        status?: string
        parts?: Array<{ kind: string }>
        checkpoint?: { checkpointId?: string }
        summary?: AgentRunSummary
      }
    }
  } | undefined)?.metadata;
  assert.equal(metadata?.agent?.status, 'failed');
  assert.equal(metadata?.agent?.runId, 'run_1');
  assert.equal((metadata?.agent?.summary as { userMemoryEntryCount?: number } | undefined)?.userMemoryEntryCount, 1);
  assert.ok(Array.isArray(metadata?.agent?.parts));
  assert.equal(metadata?.agent?.parts?.some((part) => part.kind === 'agent_trace'), true);
  assert.equal(metadata?.agent?.checkpoint?.checkpointId, 'cp_1');
  assert.equal(userUpdates.length, 1);
  assert.equal(agentRunCreates.length, 1);
  assert.equal(agentRunUpdates.length, 1);
  assert.equal(agentCheckpointCreates.length, 1);
  assert.equal(agentMemoryDeletes.length, 1);
  assert.equal(agentMemoryCreates.length, 1);
  assert.deepEqual(agentRounds[0]?.behaviorPreferences, {
    tone: 'gentle',
    responseDensity: 'detailed',
    workMode: 'direct',
    rolePromptMarkdown: undefined,
  });
});

test('chat completions stream emits only product events and done marker', async () => {
  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({
          settings: {},
        }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async () => ({
      finalResponse: {
        id: 'resp_stream',
        model: 'gpt-4o',
        content: 'stream done',
      },
      events: [
        { type: 'agent.status', payload: { runId: 'run_stream', state: 'started', label: '开始处理你的请求' } },
        { type: 'agent.thinking', payload: { id: 'think_1', text: '检查当前实现' } },
        { type: 'agent.tool', payload: { id: 'call_1', toolName: 'read_file', state: 'started' } },
        { type: 'agent.tool', payload: { id: 'call_1', toolName: 'read_file', state: 'success', latencyMs: 16 } },
        { type: 'agent.checkpoint', payload: { checkpointId: 'cp_stream', status: 'paused', resumable: true, label: '继续处理' } },
        { type: 'message.done', payload: { content: 'stream done' } },
      ],
      summary: {
        runId: 'run_stream',
        status: 'paused',
        goal: '检查当前实现',
        promptPresetIds: [],
        tools: [],
        stepCount: 1,
        errors: [],
        latencyMs: 12,
        checkpointId: 'cp_stream',
      },
      checkpoint: {
        checkpointId: 'cp_stream',
        runId: 'run_stream',
        createdAt: Date.now(),
        stepCount: 1,
        status: 'paused',
        goal: '检查当前实现',
        messages: [{ role: 'user', content: 'hello' }],
        steps: [],
        observations: [],
        stopReason: 'tool_failure',
      },
      state: {} as never,
    }),
  });

  const request = buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: 'hello' }],
    model: 'gpt-4o',
    stream: true,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: [],
      maxSteps: 4,
    },
  });

  const response = await handler(request);
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(text, /"type":"agent\.status"/);
  assert.match(text, /"type":"agent\.thinking"/);
  assert.match(text, /"type":"agent\.tool"/);
  assert.match(text, /"type":"agent\.checkpoint"/);
  assert.match(text, /"type":"message\.delta"/);
  assert.match(text, /"type":"message\.done"/);
  assert.doesNotMatch(text, /"type":"token"/);
  assert.doesNotMatch(text, /"type":"final"/);
  assert.match(text, /\[DONE\]/);
});

test('chat completions stream does not duplicate final content when runtime already emits message deltas', async () => {
  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({
          settings: {},
        }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async (_adapter, _messages, options) => {
      options.onEvent?.({ type: 'agent.status', payload: { runId: 'run_live', state: 'started', label: '开始处理你的请求' } });
      options.onEvent?.({ type: 'message.delta', payload: { content: 'live ' } });
      options.onEvent?.({ type: 'message.delta', payload: { content: 'answer' } });
      options.onEvent?.({ type: 'agent.status', payload: { runId: 'run_live', state: 'completed', label: '处理完成' } });
      options.onEvent?.({ type: 'message.done', payload: { content: 'live answer' } });

      return {
        finalResponse: {
          id: 'resp_live',
          model: 'gpt-4o',
          content: 'live answer',
        },
        events: [
          { type: 'agent.status', payload: { runId: 'run_live', state: 'started', label: '开始处理你的请求' } },
          { type: 'message.delta', payload: { content: 'live ' } },
          { type: 'message.delta', payload: { content: 'answer' } },
          { type: 'agent.status', payload: { runId: 'run_live', state: 'completed', label: '处理完成' } },
          { type: 'message.done', payload: { content: 'live answer' } },
        ],
        summary: {
          runId: 'run_live',
          status: 'completed',
          goal: 'hello',
          promptPresetIds: [],
          tools: [],
          stepCount: 1,
          errors: [],
          latencyMs: 12,
        },
        checkpoint: undefined,
        state: {} as never,
      };
    },
  });

  const request = buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: 'hello' }],
    model: 'gpt-4o',
    stream: true,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: [],
      maxSteps: 4,
    },
  });

  const response = await handler(request);
  const text = await response.text();
  const messageDeltaMatches = text.match(/"type":"message\.delta"/g) ?? [];

  assert.equal(response.status, 200);
  assert.equal(messageDeltaMatches.length, 2);
  assert.match(text, /"content":"live "/);
  assert.match(text, /"content":"answer"/);
});

test('chat completions route degrades gracefully when agent persistence tables are missing', async () => {
  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
      agentRun: {
        create: async () => {
          throw new Error('The table `public.AgentRun` does not exist in the current database.');
        },
        update: async () => {
          throw new Error('The table `public.AgentRun` does not exist in the current database.');
        },
        findMany: async () => [],
        findFirst: async () => null,
        findUnique: async () => null,
      },
      agentCheckpoint: {
        create: async () => {
          throw new Error('The table `public.AgentCheckpoint` does not exist in the current database.');
        },
        findMany: async () => [],
        findUnique: async () => null,
      },
      agentMemoryEntry: {
        findMany: async () => {
          throw new Error('The table `public.AgentMemoryEntry` does not exist in the current database.');
        },
        deleteMany: async () => {
          throw new Error('The table `public.AgentMemoryEntry` does not exist in the current database.');
        },
        createMany: async () => {
          throw new Error('The table `public.AgentMemoryEntry` does not exist in the current database.');
        },
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({
          settings: {
            agentMemory: {
              entries: [
                {
                  id: 'um_1',
                  scope: 'user',
                  kind: 'preference',
                  content: '请用简洁风格',
                  source: 'manual-settings',
                  updatedAt: Date.now(),
                },
              ],
            },
          },
        }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async () => ({
      finalResponse: {
        id: 'resp_2',
        model: 'gpt-4o',
        content: 'fallback-ok',
      },
      events: [],
      summary: {
        runId: 'run_missing_tables',
        checkpointId: 'cp_missing_tables',
        goal: '记住我的偏好',
        promptPresetIds: ['general-assistant'],
        tools: [],
        status: 'completed',
        stepCount: 0,
        errors: [],
        latencyMs: 10,
        userMemoryEntryCount: 1,
      },
      checkpoint: undefined,
      state: {} as never,
    }),
  });

  const request = buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '记住：请用简洁风格' }],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session+user',
      promptPresetIds: ['general-assistant'],
      maxSteps: 4,
    },
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.content, 'fallback-ok');
});

test('chat completions route rejects attachments when agent mode is disabled', async () => {
  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
  });

  const response = await handler(buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '请总结这个附件' }],
    attachments: [{ id: 'file_1' }],
    model: 'gpt-4o',
    stream: false,
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /附件读取仅支持 Agent 模式/);
});

test('chat completions route passes attachment references to agent without injecting attachment content', async () => {
  const agentRounds: Array<{ messages: Array<{ role: string; content: string }> }> = [];
  const agentOptions: Array<Record<string, unknown>> = [];

  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
      file: {
        findMany: async () => [
          {
            id: 'file_1',
            originalName: 'report.txt',
            fileType: 'text/plain',
            fileSize: 2048,
          },
          {
            id: 'file_2',
            originalName: 'scan.pdf',
            fileType: 'application/pdf',
            fileSize: 1024,
          },
        ],
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async (_adapter, messages, options) => {
      agentRounds.push({
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
      });
      agentOptions.push(options as unknown as Record<string, unknown>);

      return {
        finalResponse: {
          id: 'resp_attachment',
          model: 'gpt-4o',
          content: 'done',
        },
        events: [],
        summary: {
          runId: 'run_attachment',
          checkpointId: 'cp_attachment',
          goal: '请总结附件重点',
          promptPresetIds: ['general-assistant'],
          tools: [],
          status: 'completed',
          stepCount: 0,
          errors: [],
          latencyMs: 10,
        },
        checkpoint: undefined,
        state: {} as never,
      };
    },
  });

  const response = await handler(buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '请详细分析这个附件，并给我结论' }],
    attachments: [{ id: 'file_1' }, { id: 'file_2' }],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: ['general-assistant'],
      maxSteps: 4,
    },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(agentRounds.length, 1);
  assert.equal(agentRounds[0].messages.some((message) => message.content.includes('Attachment context layer:')), false);
  assert.equal(agentRounds[0].messages.some((message) => message.content.includes('第一段内容')), false);
  assert.deepEqual(agentOptions[0]?.attachments, [
    { id: 'file_1', name: 'report.txt', mimeType: 'text/plain', size: 2048 },
    { id: 'file_2', name: 'scan.pdf', mimeType: 'application/pdf', size: 1024 },
  ]);
});

test('chat completions route resolves attachment metadata from file records without exposing cached content', async () => {
  const agentOptions: Array<Record<string, unknown>> = [];

  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
      file: {
        findMany: async () => [
          {
            id: 'file_db_1',
            originalName: '产品方案.pdf',
            fileType: 'application/pdf',
            fileSize: 2048,
          },
        ],
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async (_adapter, _messages, options) => {
      agentOptions.push(options as unknown as Record<string, unknown>);

      return {
        finalResponse: {
          id: 'resp_attachment_backfill',
          model: 'gpt-4o',
          content: 'done',
        },
        events: [],
        summary: {
          runId: 'run_attachment_backfill',
          checkpointId: 'cp_attachment_backfill',
          goal: '请总结附件',
          promptPresetIds: ['general-assistant'],
          tools: [],
          status: 'completed',
          stepCount: 0,
          errors: [],
          latencyMs: 10,
        },
        checkpoint: undefined,
        state: {} as never,
      };
    },
  });

  const request = buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '总结附件' }],
    attachments: [
      {
        id: 'file_db_1',
        name: '产品方案.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      },
    ],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: ['general-assistant'],
      maxSteps: 4,
    },
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(agentOptions[0]?.attachments, [
    {
      id: 'file_db_1',
      name: '产品方案.pdf',
      mimeType: 'application/pdf',
      size: 2048,
    },
  ]);
});

test('chat completions route resolves attachment metadata from file records when request only sends ids', async () => {
  const agentOptions: Array<Record<string, unknown>> = [];

  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
      file: {
        findMany: async () => [
          {
            id: 'file_storage_1',
            originalName: 'agenda.txt',
            fileType: 'text/plain',
            fileSize: 64,
          },
        ],
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async (_adapter, _messages, options) => {
      agentOptions.push(options as unknown as Record<string, unknown>);

      return {
        finalResponse: {
          id: 'resp_attachment_storage_fallback',
          model: 'gpt-4o',
          content: 'done',
        },
        events: [],
        summary: {
          runId: 'run_attachment_storage_fallback',
          checkpointId: 'cp_attachment_storage_fallback',
          goal: '请总结附件',
          promptPresetIds: ['general-assistant'],
          tools: [],
          status: 'completed',
          stepCount: 0,
          errors: [],
          latencyMs: 10,
        },
        checkpoint: undefined,
        state: {} as never,
      };
    },
  });

  const response = await handler(buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '总结附件' }],
    attachments: [{ id: 'file_storage_1' }],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: ['general-assistant'],
      maxSteps: 4,
    },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(agentOptions[0]?.attachments, [
    {
      id: 'file_storage_1',
      name: 'agenda.txt',
      mimeType: 'text/plain',
      size: 64,
    },
  ]);
});

test('chat completions route keeps frontend full history intact and leaves context trimming to runtime', async () => {
  const agentRounds: Array<{ messages: Array<{ role: string; content: string }> }> = [];

  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async (_adapter, messages) => {
      agentRounds.push({
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
      });

      return {
        finalResponse: {
          id: 'resp_history',
          model: 'gpt-4o',
          content: 'done',
        },
        events: [],
        summary: {
          runId: 'run_history',
          checkpointId: 'cp_history',
          goal: '继续当前会话',
          promptPresetIds: ['general-assistant'],
          tools: [],
          status: 'completed',
          stepCount: 0,
          errors: [],
          latencyMs: 10,
        },
        checkpoint: undefined,
        state: {} as never,
      };
    },
  });

  const request = buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [
      { role: 'user', content: '第一轮用户消息' },
      { role: 'assistant', content: '第一轮助手回复' },
      { role: 'user', content: '第二轮用户消息' },
    ],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: ['general-assistant'],
      maxSteps: 4,
    },
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(agentRounds.length, 1);
  assert.deepEqual(
    agentRounds[0].messages.map((message) => `${message.role}:${message.content}`),
    [
      'user:第一轮用户消息',
      'assistant:第一轮助手回复',
      'user:第二轮用户消息',
    ],
  );
});

test('chat completions route skips persisting duplicate user message when requestMode is regenerate', async () => {
  const messageCreates: Array<Record<string, unknown>> = [];

  const handler = createChatCompletionsHandler({
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async (args: Record<string, unknown>) => {
          messageCreates.push(args);
          return {};
        },
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({
        complete: async () => ({
          id: 'resp_regenerate',
          model: 'gpt-4o',
          content: '新的回答',
        }),
      }) as never,
    } as never,
    runAgentRound: async () => ({
      finalResponse: {
        id: 'resp_regenerate',
        model: 'gpt-4o',
        content: '新的回答',
      },
      events: [],
      summary: {
        runId: 'run_regenerate',
        checkpointId: 'cp_regenerate',
        goal: '重新生成当前回答',
        promptPresetIds: ['general-assistant'],
        tools: [],
        status: 'completed',
        stepCount: 0,
        errors: [],
        latencyMs: 10,
      },
      checkpoint: undefined,
      state: {} as never,
    }),
  });

  const request = buildRequest({
    requestMode: 'regenerate',
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [
      { role: 'user', content: '请重新回答上一题' },
    ],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: ['general-assistant'],
      maxSteps: 4,
    },
  });

  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(messageCreates.length, 1);
  assert.equal((messageCreates[0].data as { role?: string }).role, 'assistant');
});

test('chat completions route writes one database log record for non-agent responses and does not write request metadata into messages', async () => {
  const messageCreates: Array<Record<string, unknown>> = [];
  const { entries, repository } = createChatLogRepositoryCollector();

  const handler = createChatCompletionsHandler({
    chatLogRepository: repository,
    createRequestId: () => 'req_test_success',
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async (args: Record<string, unknown>) => {
          messageCreates.push(args);
          return {};
        },
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({
        complete: async (_messages: unknown, options?: { exchangeRecorder?: { captureLlmRequest: Function; captureLlmResponse: Function } }) => {
          options?.exchangeRecorder?.captureLlmRequest({
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            messages: [{ role: 'user', content: '请总结一下这段话' }],
          });
          options?.exchangeRecorder?.captureLlmResponse({
            providerResponseId: 'resp_success',
            content: '好的，已处理',
            finishReason: 'stop',
            usage: {
              promptTokens: 12,
              completionTokens: 8,
              totalTokens: 20,
            },
          });
          return {
            id: 'resp_success',
            model: 'gpt-4o',
            content: '好的，已处理',
            usage: {
              promptTokens: 12,
              completionTokens: 8,
              totalTokens: 20,
            },
            finishReason: 'stop',
          };
        },
      }) as never,
    } as never,
  });

  const response = await handler(buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '请总结一下这段话' }],
    model: 'gpt-4o',
    stream: false,
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'req_test_success');
  assert.equal(body.success, true);
  assert.equal(entries.length, 1);

  const assistantMessage = messageCreates.find((entry) => (entry.data as { role?: string }).role === 'assistant');
  const assistantMetadata = (assistantMessage?.data as { metadata?: Record<string, unknown>; tokens?: number } | undefined);
  assert.equal(assistantMetadata?.metadata, undefined);
  assert.equal(assistantMetadata?.tokens, 20);

  const userMessage = messageCreates.find((entry) => (entry.data as { role?: string }).role === 'user');
  const userMetadata = (userMessage?.data as { metadata?: Record<string, unknown> } | undefined);
  assert.deepEqual(userMetadata?.metadata, {
    attachments: [],
  });

  const [entry] = entries;
  assert.equal(entry.requestId, 'req_test_success');
  assert.equal(entry.status, 'success');
  assert.equal(entry.provider, 'openai');
  assert.equal(entry.model, 'gpt-4o');
  assert.equal(entry.llmRequest?.provider, 'openai');
  assert.equal(entry.llmRequest?.model, 'gpt-4o');
  assert.equal(entry.llmResponse?.providerResponseId, 'resp_success');
  assert.equal(entry.llmResponse?.content, '好的，已处理');
  assert.equal(entry.error, null);
});

test('chat completions route writes failed database log records for stream failures and keeps partial frontend response', async () => {
  const { entries, repository } = createChatLogRepositoryCollector();

  const handler = createChatCompletionsHandler({
    chatLogRepository: repository,
    createRequestId: () => 'req_test_stream_error',
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({
        streamComplete: async function* (_messages: unknown, options?: { exchangeRecorder?: { captureLlmRequest: Function; captureLlmError: Function } }) {
          options?.exchangeRecorder?.captureLlmRequest({
            provider: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
            messages: [{ role: 'user', content: '请流式回答' }],
          });
          yield { content: 'partial answer' };
          options?.exchangeRecorder?.captureLlmError({
            stage: 'streamComplete',
            message: 'provider stream exploded',
          });
          throw new Error('provider stream exploded');
        },
      }) as never,
    } as never,
  });

  const response = await handler(buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '请流式回答' }],
    model: 'gpt-4o',
    stream: true,
  }));

  const bodyText = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-request-id'), 'req_test_stream_error');
  assert.match(bodyText, /"type":"error"/);
  assert.match(bodyText, /provider stream exploded/);
  assert.match(bodyText, /\[DONE\]/);
  assert.equal(entries.length, 1);

  const [failureLog] = entries;
  assert.equal(failureLog.requestId, 'req_test_stream_error');
  assert.equal(failureLog.status, 'failed');
  assert.equal(failureLog.error?.stage, 'streamComplete');
  assert.match(failureLog.error?.message ?? '', /provider stream exploded/);
  assert.equal(failureLog.llmResponse, null);
});

test('chat completions route does not persist chat logs for rejected requests', async () => {
  const { entries, repository } = createChatLogRepositoryCollector();

  const handler = createChatCompletionsHandler({
    chatLogRepository: repository,
    createRequestId: () => 'req_test_rejected',
    prisma: {
      apiKey: {
        findFirst: async () => null,
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: false }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => null as never,
    } as never,
  });

  const response = await handler(buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '请流式回答' }],
    attachments: [
      {
        id: 'file_1',
        name: 'notes.txt',
        mimeType: 'text/plain',
        size: 64,
        extractedContent: 'should not be logged',
      },
    ],
    model: 'gpt-4o',
    stream: true,
  }));

  assert.equal(response.status, 429);
  assert.equal(entries.length, 0);
});

test('chat completions route records only the final llm exchange for agent responses', async () => {
  const { entries, repository } = createChatLogRepositoryCollector();

  const handler = createChatCompletionsHandler({
    chatLogRepository: repository,
    createRequestId: () => 'req_test_agent_final_only',
    prisma: {
      apiKey: {
        findFirst: async () => ({
          id: 'k1',
          apiType: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          encryptedKey: 'enc',
        }),
        update: async () => ({}),
      },
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
        deleteMany: async () => ({}),
        createMany: async () => ({}),
      },
      message: {
        create: async () => ({}),
        findMany: async () => [],
      },
      session: {
        update: async () => ({}),
      },
      user: {
        findUnique: async () => ({ settings: {} }),
        update: async () => ({}),
      },
    } as never,
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    rateLimit: async () => ({ success: true }) as never,
    decrypt: () => 'plain-api-key',
    registry: {
      getAdapter: () => ({}) as never,
    } as never,
    runAgentRound: async (_adapter, _messages, options) => {
      options.exchangeRecorder?.captureLlmRequest({
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: '请通过工具后给最终答案' }],
        toolChoice: 'none',
      });
      options.exchangeRecorder?.captureLlmResponse({
        providerResponseId: 'planning_resp',
        content: 'final answer',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 4,
          totalTokens: 14,
        },
      });
      return {
        finalResponse: {
          id: 'planning_resp',
          model: 'gpt-4o',
          content: 'final answer',
          finishReason: 'stop',
          usage: {
            promptTokens: 10,
            completionTokens: 4,
            totalTokens: 14,
          },
        },
        events: [
          { type: 'agent.status', payload: { runId: 'run_1', state: 'started', label: '开始处理你的请求' } },
          { type: 'message.done', payload: { content: 'final answer' } },
        ],
        summary: {
          runId: 'run_1',
          status: 'completed',
          stepCount: 1,
          tools: [],
          errors: [],
          latencyMs: 10,
          promptPresetIds: ['general-assistant'],
          availableTools: [],
          userMemoryEntryCount: 0,
        },
        checkpoint: undefined,
        state: {} as never,
      };
    },
  });

  const response = await handler(buildRequest({
    sessionId: 'c123456789012345678901234',
    apiKeyId: 'c223456789012345678901234',
    messages: [{ role: 'user', content: '请通过工具后给最终答案' }],
    model: 'gpt-4o',
    stream: false,
    agent: {
      enabled: true,
      allowMcp: false,
      memoryMode: 'session',
      promptPresetIds: ['general-assistant'],
      maxSteps: 2,
    },
  }));

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(entries.length, 1);

  const [entry] = entries;
  assert.equal(entry.requestId, 'req_test_agent_final_only');
  assert.equal(entry.status, 'success');
  assert.equal(entry.llmResponse?.content, 'final answer');
  assert.equal(entry.llmResponse?.providerResponseId, 'planning_resp');
  assert.deepEqual(entry.llmResponse?.toolCalls, undefined);
});
