import test from 'node:test';
import assert from 'node:assert/strict';
import type { LLMMessage } from '@/lib/llm/adapters/base';
import { AgentContextManager } from '@/lib/agent/context-manager';
import type { AgentRunContext, AgentRunState } from '@/lib/agent/types';

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

function createState(messages: LLMMessage[]): AgentRunState {
  return {
    runId: 'run_test',
    status: 'idle',
    goal: 'Finish the current request',
    steps: [],
    workingMessages: messages,
    observations: [],
  };
}

const toolDefinitions = [{
  name: 'echo_text',
  description: 'echo',
  inputSchema: { type: 'object' },
}];

const longMessage = (length: number) => 'x'.repeat(length);

test('AgentContextManager prepares a bounded turn context without requiring plan steps', () => {
  const manager = new AgentContextManager();
  const messages: LLMMessage[] = [
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

  const prepared = manager.prepareTurn(createState(messages), createContext(), toolDefinitions);

  assert.equal(prepared.messages[0]?.content, 'primary-system');
  assert.equal(prepared.messages.at(-1)?.content, 'current-user-request');
  assert.ok(prepared.diagnostics.messageCount < messages.length);
  assert.ok(prepared.budget.reservedToolSchemaTokens >= 600);
});

test('AgentContextManager owns summary refresh and compaction side effects', () => {
  const manager = new AgentContextManager();
  const messages: LLMMessage[] = [
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
  ];
  const state = createState(messages);
  const context = createContext({
    allMessages: messages,
  });

  const preTurnEffects = manager.maintainState(state, context, toolDefinitions, 'pre_turn');
  const postToolEffects = manager.maintainState(state, context, toolDefinitions, 'post_tool');

  assert.ok(preTurnEffects.some((effect) => effect.type === 'agent.thinking'));
  assert.ok([...preTurnEffects, ...postToolEffects].some((effect) => effect.type === 'agent.thinking'));
  assert.ok(state.memorySummary);
  assert.ok(state.workingMessages.length < messages.length);
});
