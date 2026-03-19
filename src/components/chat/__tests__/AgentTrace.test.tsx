import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentTrace } from '@/components/chat/AgentTrace';
import type { AgentTracePart } from '@/types/chat';

test('AgentTrace renders running workflow with a simplified bordered panel', () => {
  const trace: AgentTracePart = {
    kind: 'agent_trace',
    status: 'running',
    items: [
      {
        type: 'thinking_summary',
        id: 'thinking_1',
        text: '正在分析任务并推进下一步',
        createdAt: Date.now(),
      },
      {
        type: 'tool_status',
        id: 'tool_1',
        toolName: 'mcp.web-search-prime.web_search_prime',
        state: 'success',
        summary: '已检索社区案例',
        latencyMs: 60,
        createdAt: Date.now(),
      },
    ],
  };

  const html = renderToStaticMarkup(<AgentTrace trace={trace} />);

  assert.match(html, /max-h-\[11rem\]/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /border border-foreground\/10/);
  assert.match(html, /text-\[13px\]/);
  assert.doesNotMatch(html, /shadow-sm/);
});

test('AgentTrace collapses to a compact row after completion', () => {
  const trace: AgentTracePart = {
    kind: 'agent_trace',
    status: 'completed',
    items: [
      {
        type: 'thinking_summary',
        id: 'thinking_1',
        text: '正在分析任务并推进下一步',
        createdAt: Date.now(),
      },
      {
        type: 'tool_status',
        id: 'tool_1',
        toolName: 'mcp.web-search-prime.web_search_prime',
        state: 'success',
        summary: '已检索社区案例',
        latencyMs: 60,
        createdAt: Date.now(),
      },
    ],
  };

  const html = renderToStaticMarkup(<AgentTrace trace={trace} />);

  assert.match(html, /max-h-\[3rem\]/);
  assert.match(html, /overflow-hidden/);
  assert.match(html, /展开查看更多/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /rounded-2xl bg-sky-500\/8/);
});
