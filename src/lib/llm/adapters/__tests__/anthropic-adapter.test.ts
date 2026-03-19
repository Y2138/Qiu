import test from 'node:test';
import assert from 'node:assert/strict';
import { AnthropicAdapter } from '@/lib/llm/adapters/anthropic';
import type { LLMMessage } from '@/lib/llm/adapters/base';

test('AnthropicAdapter merges all system layers into one prompt', async () => {
  const adapter = new AnthropicAdapter();
  const originalFetch = globalThis.fetch;
  let capturedBody = '';

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'resp_1',
        model: 'claude-test',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const messages: LLMMessage[] = [
    { role: 'system', content: 'Core Invariants: stay grounded' },
    { role: 'system', content: 'Attachment context layer:\n附件：团建方案.pdf' },
    { role: 'user', content: '总结文档重点' },
  ];

  try {
    await adapter.complete(messages, {
      apiKey: 'k',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-test',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(capturedBody.includes('Core Invariants: stay grounded'));
  assert.ok(capturedBody.includes('Attachment context layer:'));
  assert.ok(capturedBody.includes('附件：团建方案.pdf'));
});
