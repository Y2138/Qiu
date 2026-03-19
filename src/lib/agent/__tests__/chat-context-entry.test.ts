import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutgoingMessageHistory,
  buildRegenerateContext,
} from '@/hooks/useChat';
import type { Message } from '@/types/chat';

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    sessionId: overrides.sessionId ?? 'session-1',
    role: overrides.role ?? 'user',
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt,
    metadata: overrides.metadata,
    files: overrides.files,
    model: overrides.model,
    tokens: overrides.tokens,
    isStreaming: overrides.isStreaming,
    error: overrides.error,
  };
}

test('buildOutgoingMessageHistory appends the next user request after full session history', () => {
  const history = buildOutgoingMessageHistory(
    [
      createMessage({ id: 'u1', role: 'user', content: '第一轮问题' }),
      createMessage({ id: 'a1', role: 'assistant', content: '第一轮回答' }),
    ],
    '第二轮问题',
  );

  assert.deepEqual(history, [
    { role: 'user', content: '第一轮问题' },
    { role: 'assistant', content: '第一轮回答' },
    { role: 'user', content: '第二轮问题' },
  ]);
});

test('buildOutgoingMessageHistory can be reused for continue-from-checkpoint requests', () => {
  const history = buildOutgoingMessageHistory(
    [
      createMessage({ id: 'u1', role: 'user', content: '请先分析这个问题' }),
      createMessage({ id: 'a1', role: 'assistant', content: '我先拆步骤。' }),
    ],
    '继续上一轮任务',
  );

  assert.equal(history.at(-1)?.role, 'user');
  assert.equal(history.at(-1)?.content, '继续上一轮任务');
  assert.equal(history.length, 3);
});

test('buildRegenerateContext rebuilds request history from the matched assistant reply back to its source user turn', () => {
  const messages = [
    createMessage({ id: 'u1', role: 'user', content: '第一轮问题' }),
    createMessage({ id: 'a1', role: 'assistant', content: '第一轮回答' }),
    createMessage({ id: 'u2', role: 'user', content: '第二轮问题', files: [{ id: 'f1', name: 'doc.txt', type: 'document', size: 1 }] }),
    createMessage({ id: 'a2', role: 'assistant', content: '第二轮旧回答' }),
    createMessage({ id: 'u3', role: 'user', content: '第三轮问题' }),
  ];

  const result = buildRegenerateContext(messages, 'a2');

  assert.ok(result);
  assert.equal(result?.sourceUserMessage.id, 'u2');
  assert.deepEqual(result?.history, [
    { role: 'user', content: '第一轮问题' },
    { role: 'assistant', content: '第一轮回答' },
    { role: 'user', content: '第二轮问题' },
  ]);
  assert.deepEqual(
    result?.truncatedMessages.map((message) => message.id),
    ['u1', 'a1', 'u2'],
  );
});

test('buildRegenerateContext accepts a user message id and keeps the same source turn', () => {
  const messages = [
    createMessage({ id: 'u1', role: 'user', content: '原始问题' }),
    createMessage({ id: 'a1', role: 'assistant', content: '旧回答' }),
  ];

  const result = buildRegenerateContext(messages, 'u1');

  assert.ok(result);
  assert.equal(result?.sourceUserMessage.id, 'u1');
  assert.deepEqual(result?.history, [{ role: 'user', content: '原始问题' }]);
});

test('buildRegenerateContext returns null when there is no recoverable user turn', () => {
  const result = buildRegenerateContext(
    [createMessage({ id: 'a1', role: 'assistant', content: '孤立回答' })],
    'a1',
  );

  assert.equal(result, null);
});
