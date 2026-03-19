import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentRound } from '@/lib/agent';
import { BaseLLMAdapter } from '@/lib/llm/adapters/base';
import type { LLMExchangeRecorder, LLMMessage, LLMRequestOptions, LLMResponse, LLMStreamChunk } from '@/lib/llm/adapters/base';

class InspectingAdapter extends BaseLLMAdapter {
  readonly apiType = 'fake';
  requests: LLMMessage[][] = [];

  async complete(messages: LLMMessage[], _options?: LLMRequestOptions): Promise<LLMResponse> {
    this.requests.push(messages.map((message) => ({ ...message })));
    return {
      id: 'resp_1',
      model: 'fake-model',
      content: 'done',
    };
  }

  async *streamComplete(_messages: LLMMessage[], _options?: LLMRequestOptions): AsyncGenerator<LLMStreamChunk> {
    yield { content: 'done', finishReason: 'stop' };
  }

  async testApiKey(): Promise<boolean> {
    return true;
  }
}

test('runAgentRound adds attachment catalog to the system prompt', async () => {
  const adapter = new InspectingAdapter();
  const exchangeRecorder: LLMExchangeRecorder = {
    captureLlmRequest() {},
    captureLlmResponse() {},
    captureLlmError() {},
  };

  await runAgentRound(adapter, [{ role: 'user', content: '总结附件' }], {
    userId: 'u1',
    sessionId: 's1',
    model: 'gpt-4o',
    apiKey: 'x',
    promptPresetIds: [],
    maxSteps: 4,
    exchangeRecorder,
    attachments: [
      {
        id: 'file_1',
        name: 'agenda.txt',
        mimeType: 'text/plain',
        size: 64,
      },
    ],
  });

  const firstRequest = adapter.requests[0];
  assert.ok(firstRequest);
  assert.equal(firstRequest[0]?.role, 'system');
  assert.match(firstRequest[0]?.content ?? '', /Available attachments in the current session:/);
  assert.match(firstRequest[0]?.content ?? '', /attachmentId=file_1; name=agenda\.txt/);
  assert.match(firstRequest[0]?.content ?? '', /Use the read_attachment tool/);
});
