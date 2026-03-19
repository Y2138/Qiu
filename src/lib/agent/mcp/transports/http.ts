export interface MCPHttpServerConfig {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface MCPJsonRpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPJsonRpcResponse<T> {
  result?: T;
  error?: {
    message?: string;
  };
}

export class MCPHttpClient {
  private sessionId?: string;

  constructor(private readonly config: MCPHttpServerConfig) {}

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: {
        name: 'qiuchat',
        version: '0.1.0',
      },
    });
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>> {
    const result = await this.request<{
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        input_schema?: Record<string, unknown>;
      }>;
    }>('tools/list');
    return Array.isArray(result.tools)
      ? result.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? tool.input_schema,
        }))
      : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request<{ content?: Array<{ text?: string; type?: string }> }>('tools/call', {
      name,
      arguments: args,
    });
    const content = Array.isArray(result.content) ? result.content : [];
    const texts = content
      .filter((item) => item?.type === 'text' || typeof item?.text === 'string')
      .map((item) => item.text ?? '')
      .filter(Boolean);
    return texts.join('\n').trim() || JSON.stringify(result);
  }

  async close(): Promise<void> {}

  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const body: MCPJsonRpcRequest = {
      jsonrpc: '2.0',
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs ?? 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...this.config.headers,
      };

      if (this.sessionId) {
        headers['mcp-session-id'] = this.sessionId;
      }

      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const responseText = (await response.text()).trim();
        const detail = responseText ? `: ${responseText.slice(0, 300)}` : '';
        throw new Error(`HTTP MCP request failed with status ${response.status}${detail}`);
      }

      const responseSessionId = response.headers.get('mcp-session-id');
      if (responseSessionId) {
        this.sessionId = responseSessionId;
      }

      const payload = await parseMcpResponse<T>(response);
      if (payload.error) {
        throw new Error(payload.error.message || `HTTP MCP ${method} failed`);
      }
      return payload.result as T;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`HTTP MCP ${method} timeout`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function parseMcpResponse<T>(response: Response): Promise<MCPJsonRpcResponse<T>> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    return parseSsePayload<T>(text);
  }

  return await response.json() as MCPJsonRpcResponse<T>;
}

function parseSsePayload<T>(raw: string): MCPJsonRpcResponse<T> {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw new Error('HTTP MCP returned empty SSE payload');
  }

  const frames = normalized
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter(Boolean);

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    const dataLines = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .filter(Boolean);

    if (dataLines.length === 0) {
      continue;
    }

    const payload = dataLines.join('\n').trim();
    if (!payload || payload === '[DONE]') {
      continue;
    }

    try {
      return JSON.parse(payload) as MCPJsonRpcResponse<T>;
    } catch {
      continue;
    }
  }

  throw new Error(`HTTP MCP returned non-JSON SSE payload: ${normalized.slice(0, 300)}`);
}
