import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createTestApiKeyHandler } from '@/app/api/api-keys/test/route';

test('api key test route returns 401 when user is not logged in', async () => {
  const handler = createTestApiKeyHandler({
    getCurrentUserServer: async () => null,
    getAdapter: () => undefined,
  });

  const response = await handler(new NextRequest('http://localhost/api/api-keys/test', {
    method: 'POST',
    body: JSON.stringify({
      apiType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-demo',
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test('api key test route validates request body', async () => {
  const handler = createTestApiKeyHandler({
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    getAdapter: () => undefined,
  });

  const response = await handler(new NextRequest('http://localhost/api/api-keys/test', {
    method: 'POST',
    body: JSON.stringify({
      apiType: 'openai',
      apiKey: 'sk-demo',
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.success, false);
});

test('api key test route returns success when adapter validation passes', async () => {
  const handler = createTestApiKeyHandler({
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    getAdapter: () => ({
      testApiKey: async (apiKey: string, baseUrl?: string) => {
        assert.equal(apiKey, 'sk-demo');
        assert.equal(baseUrl, 'https://api.openai.com/v1');
        return true;
      },
    }) as never,
  });

  const response = await handler(new NextRequest('http://localhost/api/api-keys/test', {
    method: 'POST',
    body: JSON.stringify({
      apiType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-demo',
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data, { valid: true });
});
