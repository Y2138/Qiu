import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createMcpDiagnosticsHandler } from '@/app/api/chat/mcp/diagnostics/route';

test.afterEach(() => {
  delete process.env.AGENT_DIAGNOSTICS_TOKEN;
});

test('diagnostics route returns 401 when user is not logged in', async () => {
  process.env.AGENT_DIAGNOSTICS_TOKEN = 'secret';

  const handler = createMcpDiagnosticsHandler({
    getCurrentUserServer: async () => null,
    getDiagnostics: () => [],
  });

  const request = new NextRequest('http://localhost/api/chat/mcp/diagnostics');
  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test('diagnostics route returns 403 when token is missing or invalid', async () => {
  process.env.AGENT_DIAGNOSTICS_TOKEN = 'secret';

  const handler = createMcpDiagnosticsHandler({
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    getDiagnostics: () => [],
  });

  const request = new NextRequest('http://localhost/api/chat/mcp/diagnostics', {
    headers: {
      'x-agent-diagnostics-token': 'wrong',
    },
  });
  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});

test('diagnostics route returns data when token is valid', async () => {
  process.env.AGENT_DIAGNOSTICS_TOKEN = 'secret';

  const diagnostics = [{
    serverName: 'demo',
    state: 'ready' as const,
    transport: 'stdio' as const,
    metrics: {
      connectLatencyMs: 12,
      listToolsLatencyMs: 8,
      callCount: 1,
      callFailureCount: 0,
      timeoutCount: 0,
      lastCallLatencyMs: 4,
    },
  }];

  const handler = createMcpDiagnosticsHandler({
    getCurrentUserServer: async () => ({ id: 'u1' }) as never,
    getDiagnostics: () => diagnostics,
  });

  const request = new NextRequest('http://localhost/api/chat/mcp/diagnostics', {
    headers: {
      'x-agent-diagnostics-token': 'secret',
    },
  });
  const response = await handler(request);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data.diagnostics, diagnostics);
});
