import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolRegistry } from '@/lib/agent/tools/registry';
import type { AgentRunContext, AgentTool } from '@/lib/agent/types';

function createContext(): AgentRunContext {
  return {
    userId: 'u1',
    model: 'gpt-4o',
    startedAt: Date.now(),
    maxSteps: 4,
    allowMcp: false,
    memoryMode: 'session',
    selectedPromptPresets: [],
    allMessages: [],
    retryPolicy: { toolMaxRetry: 1 },
  };
}

test('ToolRegistry returns policy error for disallowed tool', async () => {
  const registry = new ToolRegistry();
  const tool: AgentTool = {
    name: 'demo_tool',
    description: 'demo',
    inputSchema: z.object({}),
    source: 'local',
    execute: async () => ({ success: true, output: 'ok' }),
  };
  registry.register(tool);

  const result = await registry.executeToolCall(
    { id: 't1', name: 'demo_tool', arguments: '{}' },
    createContext(),
    new Set(['other_tool']),
  );

  assert.equal(result.success, false);
  assert.equal(result.errorType, 'policy');
});

test('ToolRegistry retries and classifies timeout', async () => {
  const registry = new ToolRegistry({ maxToolExecutionMs: 10 });
  const tool: AgentTool = {
    name: 'slow_tool',
    description: 'slow',
    inputSchema: z.object({}),
    source: 'local',
    execute: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true, output: 'late' };
    },
  };
  registry.register(tool);

  const result = await registry.executeToolCall(
    { id: 't2', name: 'slow_tool', arguments: '{}' },
    createContext(),
  );

  assert.equal(result.success, false);
  assert.equal(result.errorType, 'timeout');
});

test('ToolRegistry preserves raw input schema for MCP-style tools', async () => {
  const registry = new ToolRegistry();
  const rawInputSchema = {
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
  };

  const tool: AgentTool = {
    name: 'mcp.web-search-prime.web_search_prime',
    description: 'search the web',
    inputSchema: z.record(z.string(), z.unknown()),
    rawInputSchema,
    source: 'mcp',
    execute: async () => ({ success: true, output: 'ok' }),
  };
  registry.register(tool);

  const [definition] = registry.getToolDefinitions();
  assert.deepEqual(definition.inputSchema, rawInputSchema);
});
