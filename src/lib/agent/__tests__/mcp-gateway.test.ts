import test from 'node:test';
import assert from 'node:assert/strict';
import { MCPGateway } from '@/lib/agent/mcp/gateway';
import { MCPStdioClient } from '@/lib/agent/mcp/stdio-client';

const originalConnect = MCPStdioClient.prototype.connect;
const originalListTools = MCPStdioClient.prototype.listTools;
const originalCallTool = MCPStdioClient.prototype.callTool;
const originalClose = MCPStdioClient.prototype.close;

function restoreClientPrototype() {
  MCPStdioClient.prototype.connect = originalConnect;
  MCPStdioClient.prototype.listTools = originalListTools;
  MCPStdioClient.prototype.callTool = originalCallTool;
  MCPStdioClient.prototype.close = originalClose;
}

test.afterEach(() => {
  delete process.env.MCP_SERVERS_JSON;
  restoreClientPrototype();
});

test('MCP gateway marks server degraded when connect fails', async () => {
  MCPStdioClient.prototype.connect = async () => {
    throw new Error('connect failed');
  };

  process.env.MCP_SERVERS_JSON = JSON.stringify({
    broken: {
      command: 'fake-server',
    },
  });

  const gateway = new MCPGateway();
  const tools = await gateway.getToolsFromEnv();

  assert.equal(tools.length, 0);

  const diagnostics = gateway.getDiagnostics();
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].serverName, 'broken');
  assert.equal(diagnostics[0].state, 'degraded');
  assert.match(diagnostics[0].lastError ?? '', /connect failed/);
});

test('MCP gateway records diagnostics when listTools fails', async () => {
  MCPStdioClient.prototype.connect = async () => {};
  MCPStdioClient.prototype.listTools = async () => {
    throw new Error('list tools failed');
  };
  MCPStdioClient.prototype.close = async () => {};

  process.env.MCP_SERVERS_JSON = JSON.stringify({
    flaky: {
      command: 'fake-server',
    },
  });

  const gateway = new MCPGateway();
  const tools = await gateway.getToolsFromEnv();

  assert.equal(tools.length, 0);

  const diagnostics = gateway.getDiagnostics();
  assert.equal(diagnostics[0].state, 'degraded');
  assert.match(diagnostics[0].lastError ?? '', /list tools failed/);
  assert.notEqual(diagnostics[0].metrics.connectLatencyMs, null);
  assert.notEqual(diagnostics[0].metrics.listToolsLatencyMs, null);

  await gateway.closeAll();
});

test('MCP gateway updates timeout and failure metrics for tool calls', async () => {
  MCPStdioClient.prototype.connect = async () => {};
  MCPStdioClient.prototype.listTools = async () => [{ name: 'echo' }];

  let callCount = 0;
  MCPStdioClient.prototype.callTool = async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new Error('request timeout while calling tool');
    }
    throw new Error('tool crashed');
  };
  MCPStdioClient.prototype.close = async () => {};

  process.env.MCP_SERVERS_JSON = JSON.stringify({
    unstable: {
      command: 'fake-server',
    },
  });

  const gateway = new MCPGateway();
  const tools = await gateway.getToolsFromEnv();
  assert.equal(tools.length, 1);

  const first = await tools[0].execute({}, {} as never);
  assert.equal(first.success, false);
  assert.equal(first.errorType, 'timeout');

  const second = await tools[0].execute({}, {} as never);
  assert.equal(second.success, false);
  assert.equal(second.errorType, 'execution');

  const diagnostics = gateway.getDiagnostics()[0];
  assert.equal(diagnostics.state, 'degraded');
  assert.match(diagnostics.lastError ?? '', /tool crashed/);
  assert.equal(diagnostics.metrics.callCount, 2);
  assert.equal(diagnostics.metrics.callFailureCount, 2);
  assert.equal(diagnostics.metrics.timeoutCount, 1);
  assert.notEqual(diagnostics.metrics.lastCallLatencyMs, null);

  await gateway.closeAll();
});

test('MCP gateway preserves tool input schema from MCP descriptors', async () => {
  MCPStdioClient.prototype.connect = async () => {};
  MCPStdioClient.prototype.listTools = async () => [{
    name: 'web_search_prime',
    description: 'search the web',
    inputSchema: {
      type: 'object',
      properties: {
        search_query: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              q: { type: 'string' },
            },
            required: ['q'],
          },
        },
      },
      required: ['search_query'],
    },
  }];
  MCPStdioClient.prototype.close = async () => {};

  process.env.MCP_SERVERS_JSON = JSON.stringify({
    webSearchPrime: {
      command: 'fake-server',
    },
  });

  const gateway = new MCPGateway();
  const [tool] = await gateway.getToolsFromEnv();

  assert.deepEqual(tool.rawInputSchema, {
    type: 'object',
    properties: {
      search_query: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            q: { type: 'string' },
          },
          required: ['q'],
        },
      },
    },
    required: ['search_query'],
  });

  await gateway.closeAll();
});
