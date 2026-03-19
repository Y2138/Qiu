import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuiltinTools } from '@/lib/agent/tools/builtins';
import type { AgentRunContext } from '@/lib/agent/types';

function createContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    userId: 'u1',
    sessionId: 's1',
    model: 'gpt-4o',
    startedAt: Date.now(),
    maxSteps: 4,
    allowMcp: false,
    memoryMode: 'session',
    selectedPromptPresets: [],
    allMessages: [],
    retryPolicy: { toolMaxRetry: 1 },
    ...overrides,
  };
}

test('read_attachment tool returns truncated attachment content', async () => {
  const tool = getBuiltinTools().find((item) => item.name === 'read_attachment');
  assert.ok(tool);

  const result = await tool.execute(
    { attachmentId: 'file_1' },
    createContext({
      readAttachment: async () => ({
        attachmentId: 'file_1',
        fileName: 'agenda.txt',
        mimeType: 'text/plain',
        size: 64,
        content: 'x'.repeat(9000),
        cached: false,
      }),
    }),
  );

  assert.equal(result.success, true);
  const payload = JSON.parse(result.output) as Record<string, unknown>;
  assert.equal(payload.attachmentId, 'file_1');
  assert.equal(payload.truncated, true);
  assert.equal(typeof payload.content, 'string');
});

test('read_attachment tool reports unavailable reader clearly', async () => {
  const tool = getBuiltinTools().find((item) => item.name === 'read_attachment');
  assert.ok(tool);

  const result = await tool.execute(
    { attachmentId: 'file_1' },
    createContext(),
  );

  assert.equal(result.success, false);
  assert.match(result.output, /当前运行上下文未提供附件读取能力/);
});
