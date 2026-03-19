import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntime } from '@/lib/agent/planner-executor';
import { BaseLLMAdapter } from '@/lib/llm/adapters/base';
import type {
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
} from '@/lib/llm/adapters/base';
import type { AgentRunContext, AgentCheckpoint, AgentToolRuntime } from '@/lib/agent/types';

class FakeAdapter extends BaseLLMAdapter {
  readonly apiType = 'fake';
  private rounds = 0;
  readonly requests: LLMMessage[][] = [];

  async complete(messages: LLMMessage[], _options?: LLMRequestOptions): Promise<LLMResponse> {
    this.rounds += 1;
    const hasToolResult = messages.some((m) => m.content.includes('tool_result_done'));
    if (!hasToolResult && this.rounds === 1) {
      return {
        id: 'r1',
        model: 'fake-model',
        content: '',
        toolCalls: [{ id: 'c1', name: 'echo_text', arguments: '{"text":"x"}' }],
      };
    }

    return {
      id: 'r2',
      model: 'fake-model',
      content: 'final answer',
    };
  }

  async completeWithTools(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    this.requests.push(messages.map((message) => ({ ...message })));
    const toolResults = options?.toolResults ?? [];
    const withResults = [
      ...messages,
      ...toolResults.map((r) => ({ role: 'user' as const, content: `tool_result_done:${r.output}` })),
    ];
    return this.complete(withResults, options);
  }

  async *streamComplete(_messages: LLMMessage[], _options?: LLMRequestOptions): AsyncGenerator<LLMStreamChunk> {
    yield { content: 'final ' };
    yield { content: 'answer', finishReason: 'stop' };
  }

  async testApiKey(): Promise<boolean> {
    return true;
  }
}

class StreamingFinalAdapter extends FakeAdapter {
  override async complete(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse> {
    const response = await super.complete(messages, options);

    if (!response.toolCalls?.length) {
      return {
        ...response,
        content: 'buffered final answer',
      };
    }

    return response;
  }

  override async *streamComplete(
    _messages: LLMMessage[],
    _options?: LLMRequestOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    yield { content: 'final ' };
    yield { content: 'answer', finishReason: 'stop' };
  }
}

class FakeToolRuntime implements AgentToolRuntime {
  getToolDefinitions() {
    return [{
      name: 'echo_text',
      description: 'echo',
      inputSchema: { type: 'object' },
    }];
  }

  getToolNames(): string[] {
    return ['echo_text'];
  }

  async executeToolCall(call: LLMToolCall) {
    return {
      toolCallId: call.id,
      name: call.name,
      output: 'ok',
      success: true,
      source: 'local' as const,
      latencyMs: 1,
    };
  }
}

class FailingToolRuntime implements AgentToolRuntime {
  getToolDefinitions() {
    return [{
      name: 'echo_text',
      description: 'echo',
      inputSchema: { type: 'object' },
    }];
  }

  getToolNames(): string[] {
    return ['echo_text'];
  }

  async executeToolCall(call: LLMToolCall) {
    return {
      toolCallId: call.id,
      name: call.name,
      output: 'tool failed',
      success: false,
      source: 'local' as const,
      errorType: 'execution' as const,
      latencyMs: 1,
    };
  }
}

function createContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    userId: 'u1',
    model: 'fake-model',
    startedAt: Date.now(),
    maxSteps: 4,
    allowMcp: false,
    memoryMode: 'session',
    selectedPromptPresets: [],
    allMessages: [{ role: 'user', content: 'hi' }],
    retryPolicy: { toolMaxRetry: 1 },
    ...overrides,
  };
}
const longMessage = (length: number) => 'x'.repeat(length);

test('AgentRuntime reaches final status with tool call path', async () => {
  const streamedEvents: string[] = [];
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
    onEvent: (event) => {
      streamedEvents.push(event.type);
    },
  });

  const result = await executor.run([{ role: 'user', content: 'hello' }], createContext());
  assert.equal(result.summary.status, 'completed');
  assert.equal(result.finalResponse.content, 'final answer');
  assert.equal(result.summary.goal, 'hello');
  assert.equal(result.events[0].type, 'agent.status');
  assert.equal(result.events.some((event) => event.type === 'agent.checkpoint'), false);
  assert.equal(result.events.some((event) => event.type === 'message.done'), true);
  assert.equal(result.checkpoint, undefined);
  assert.deepEqual(streamedEvents, result.events.map((event) => event.type));
  assert.ok(adapter.requests.length >= 1);
});

test('AgentRuntime streams final answer chunks before completed status', async () => {
  const streamedEvents: string[] = [];
  const adapter = new StreamingFinalAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
    onEvent: (event) => {
      streamedEvents.push(event.type);
    },
  });

  const result = await executor.run([{ role: 'user', content: 'hello' }], createContext());
  const completedIndex = result.events.findIndex(
    (event) => event.type === 'agent.status' && event.payload.state === 'completed',
  );
  const firstDeltaIndex = result.events.findIndex((event) => event.type === 'message.delta');

  assert.equal(result.finalResponse.content, 'final answer');
  assert.ok(firstDeltaIndex >= 0);
  assert.ok(completedIndex > firstDeltaIndex);
  assert.deepEqual(
    result.events.filter((event) => event.type === 'message.delta').map((event) => event.payload.content),
    ['final ', 'answer'],
  );
  assert.ok(streamedEvents.includes('message.delta'));
});

test('AgentRuntime pauses and creates a checkpoint when tool execution fails', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FailingToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const result = await executor.run([{ role: 'user', content: 'hello' }], createContext());

  assert.equal(result.summary.status, 'paused');
  assert.equal(result.checkpoint?.status, 'paused');
  assert.ok(result.events.some((event) => event.type === 'agent.checkpoint'));
  assert.ok(result.events.some((event) => event.type === 'agent.status' && event.payload.state === 'paused'));
});

test('AgentRuntime builds a bounded turn window before session summary exists', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const initialMessages: LLMMessage[] = [
    { role: 'system', content: 'primary-system' },
    { role: 'user', content: 'user-1' },
    { role: 'assistant', content: 'assistant-1' },
    { role: 'user', content: 'user-2' },
    { role: 'assistant', content: 'assistant-2' },
    { role: 'user', content: 'user-3' },
    { role: 'assistant', content: 'assistant-3' },
    { role: 'user', content: 'user-4' },
    { role: 'assistant', content: 'assistant-4' },
    { role: 'user', content: 'current-user-request' },
  ];

  await executor.run(initialMessages, createContext());

  const firstRequest = adapter.requests[0];
  assert.ok(firstRequest.length < initialMessages.length);
  assert.equal(firstRequest[0]?.role, 'system');
  assert.equal(firstRequest[0]?.content, 'primary-system');
  assert.equal(firstRequest.at(-1)?.content, 'current-user-request');
  assert.ok(!firstRequest.some((message) => message.content === 'user-1'));
  assert.ok(firstRequest.some((message) => message.content === 'assistant-4'));
});

test('AgentRuntime carries a bounded recent tool observation layer into the next turn', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  await executor.run(
    [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: 'current-user-request' },
    ],
    createContext(),
  );

  const secondRequest = adapter.requests[1];
  assert.ok(secondRequest);
  const observationMessage = secondRequest.find(
    (message) => message.role === 'system' && message.content.includes('Recent tool observations:'),
  );

  assert.ok(observationMessage);
  assert.match(observationMessage.content, /echo_text: ok/);
});

test('AgentRuntime creates and incrementally updates rolling summary fields', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const goal = longMessage(7000);
  const result = await executor.run(
    [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: goal },
    ],
    createContext({
      allMessages: [{ role: 'user', content: goal }],
    }),
  );

  assert.ok(result.state.memorySummary);
  assert.ok(result.state.memorySummary?.goal);
  assert.ok(goal.startsWith(result.state.memorySummary!.goal));
  assert.equal(result.state.memorySummary?.currentTask, 'Finalize response');
  assert.ok(result.state.memorySummary?.completedSteps.includes('Finalize response'));
  assert.ok(result.state.memorySummary?.decisions.some((item) => item.includes('Completed step')));
  assert.ok(result.state.memorySummary?.keyObservations.some((item) => item.includes('echo_text: ok')));
  assert.equal(typeof result.state.memorySummary?.updatedAt, 'number');
  assert.ok(result.events.some((event) => event.type === 'agent.thinking'));
});

test('AgentRuntime preserves resumed rolling summary and refreshes it after completion', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const resumedCheckpoint: AgentCheckpoint = {
    checkpointId: 'cp_resume',
    runId: 'run_resume',
    createdAt: Date.now(),
    stepCount: 1,
    status: 'paused',
    goal: 'Resume the previous task',
    messages: [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: 'Resume the previous task' },
    ],
    steps: [],
    observations: [],
    memorySummary: {
      goal: 'Resume the previous task',
      currentTask: 'Collect evidence',
      completedSteps: ['Analyze user intent'],
      pendingSteps: ['Collect evidence'],
      keyObservations: ['Existing observation'],
      constraints: ['Respect allowed tools'],
      decisions: ['Completed step: Analyze user intent'],
      openQuestions: ['Need latest evidence'],
      updatedAt: Date.now() - 1000,
      compactedAt: Date.now() - 1000,
    },
    stopReason: 'tool_failure',
  };

  const result = await executor.run(
    resumedCheckpoint.messages,
    createContext({
      resumedCheckpoint,
    }),
  );

  assert.equal(result.state.memorySummary?.goal, 'Resume the previous task');
  assert.ok(result.state.memorySummary?.openQuestions.includes('Need latest evidence'));
  assert.ok(result.state.memorySummary?.decisions.some((item) => item.includes('Used echo_text')));
  assert.equal(result.state.resumedFromCheckpointId, 'cp_resume');
});

test('AgentRuntime resume loop does not consume new step budget from legacy checkpoint steps', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const resumedCheckpoint: AgentCheckpoint = {
    checkpointId: 'cp_legacy_steps',
    runId: 'run_legacy_steps',
    createdAt: Date.now(),
    stepCount: 5,
    status: 'paused',
    goal: 'Resume even if legacy steps exist',
    messages: [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: 'Resume even if legacy steps exist' },
    ],
    steps: [
      { id: 'step_1', order: 1, title: 'Legacy step 1', status: 'completed' },
      { id: 'step_2', order: 2, title: 'Legacy step 2', status: 'completed' },
      { id: 'step_3', order: 3, title: 'Legacy step 3', status: 'completed' },
      { id: 'step_4', order: 4, title: 'Legacy step 4', status: 'completed' },
      { id: 'step_5', order: 5, title: 'Legacy step 5', status: 'failed' },
    ],
    observations: [],
    stopReason: 'tool_failure',
  };

  const result = await executor.run(
    resumedCheckpoint.messages,
    createContext({
      maxSteps: 2,
      resumedCheckpoint,
    }),
  );

  assert.equal(result.summary.status, 'completed');
  assert.equal(result.finalResponse.content, 'final answer');
  assert.equal(result.state.resumedFromCheckpointId, 'cp_legacy_steps');
  assert.ok(adapter.requests.length >= 2);
});

test('AgentRuntime triggers rolling summary when history exceeds the threshold', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const result = await executor.run(
    [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: longMessage(7000) },
    ],
    createContext({
      allMessages: [{ role: 'user', content: longMessage(7000) }],
    }),
  );

  assert.ok(result.state.memorySummary);
});

test('AgentRuntime compacts context after rolling summary exists and history remains long', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const initialMessages: LLMMessage[] = [
    { role: 'system', content: 'primary-system' },
    { role: 'user', content: longMessage(1200) },
    { role: 'assistant', content: longMessage(1200) },
    { role: 'user', content: longMessage(1200) },
    { role: 'assistant', content: longMessage(1200) },
    { role: 'user', content: longMessage(1200) },
    { role: 'assistant', content: longMessage(1200) },
    { role: 'user', content: longMessage(1200) },
    { role: 'assistant', content: longMessage(1200) },
    { role: 'user', content: longMessage(1200) },
    { role: 'assistant', content: longMessage(1200) },
    { role: 'user', content: longMessage(1200) },
  ];

  const result = await executor.run(
    initialMessages,
    createContext({
      allMessages: initialMessages,
    }),
  );

  assert.ok(result.events.some((event) => event.type === 'agent.thinking'));
  const latestCheckpointMessages = result.checkpoint?.messages ?? [];
  assert.ok(latestCheckpointMessages.length < initialMessages.length + 2);
});

test('AgentRuntime keeps attachment summary as a separate budgeted layer', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const attachmentLayer = `Attachment context layer:\n${'附件内容'.repeat(4000)}`;

  const result = await executor.run(
    [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: '请总结附件重点' },
      { role: 'system', content: attachmentLayer },
    ],
    createContext({
      model: 'gpt-4o-mini',
    }),
  );

  const firstRequest = adapter.requests[0];
  const attachmentMessage = firstRequest.find(
    (message) => message.role === 'system' && message.content.startsWith('Attachment context layer:'),
  );

  assert.ok(attachmentMessage);
  assert.ok(attachmentMessage.content.length < attachmentLayer.length);
  assert.ok(result.summary.contextBudget);
  assert.ok(result.summary.contextDiagnostics?.attachmentSummaryEnabled);
  assert.ok(result.summary.contextDiagnostics?.trimmed);
});

test('AgentRuntime reserves tool schema budget and reports context diagnostics', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const result = await executor.run(
    [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: longMessage(7000) },
    ],
    createContext({
      model: 'gpt-4o',
      allMessages: [{ role: 'user', content: longMessage(7000) }],
    }),
  );

  assert.ok(result.summary.contextBudget);
  assert.ok((result.summary.contextBudget?.reservedToolSchemaTokens ?? 0) >= 600);
  assert.ok(result.summary.contextDiagnostics);
  assert.ok((result.summary.contextDiagnostics?.estimatedAvailableTokens ?? 0) > 0);
  assert.equal(
    result.summary.contextDiagnostics?.estimatedToolSchemaTokens,
    result.summary.contextBudget?.reservedToolSchemaTokens,
  );
});

test('AgentRuntime preserves diagnostics when resuming from checkpoint', async () => {
  const adapter = new FakeAdapter();
  const executor = new AgentRuntime(adapter, new FakeToolRuntime(), {
    model: 'fake-model',
    apiKey: 'x',
  });

  const resumedCheckpoint: AgentCheckpoint = {
    checkpointId: 'cp_resume_budget',
    runId: 'run_resume_budget',
    createdAt: Date.now(),
    stepCount: 1,
    status: 'paused',
    goal: 'Resume with bounded context',
    messages: [
      { role: 'system', content: 'primary-system' },
      { role: 'user', content: 'old-user-1' },
      { role: 'assistant', content: 'old-assistant-1' },
      { role: 'user', content: '继续上一轮任务' },
      { role: 'system', content: `Attachment context layer:\n${'参考材料'.repeat(200)}` },
    ],
    steps: [],
    observations: [],
    memorySummary: {
      goal: 'Resume with bounded context',
      currentTask: 'Continue work',
      completedSteps: ['Analyze user intent'],
      pendingSteps: ['Continue work'],
      keyObservations: ['Captured previous state'],
      constraints: ['Respect allowed tools'],
      decisions: ['Completed step: Analyze user intent'],
      openQuestions: [],
      updatedAt: Date.now() - 1000,
      compactedAt: Date.now() - 1000,
    },
    stopReason: 'tool_failure',
  };

  const result = await executor.run(
    resumedCheckpoint.messages,
    createContext({
      model: 'gpt-4o-mini',
      resumedCheckpoint,
    }),
  );

  assert.equal(result.state.resumedFromCheckpointId, 'cp_resume_budget');
  assert.ok(result.summary.contextDiagnostics?.memorySummaryEnabled);
  assert.ok(result.summary.contextDiagnostics?.attachmentSummaryEnabled);
  assert.ok((result.summary.contextDiagnostics?.messageCount ?? 0) >= 3);
});
