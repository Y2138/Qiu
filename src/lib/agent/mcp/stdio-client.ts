import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

export interface MCPToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPStdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ParsedCommand {
  command: string;
  args: string[];
}

export function parseCommandConfig(config: MCPStdioServerConfig): ParsedCommand {
  if (config.args && config.args.length > 0) {
    return {
      command: config.command,
      args: config.args,
    };
  }

  const tokens = splitCommandString(config.command);
  if (tokens.length === 0) {
    throw new Error('MCP command is empty');
  }

  const [command, ...args] = tokens;
  return { command, args };
}

function splitCommandString(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of value) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += '\\';
  }

  if (quote) {
    throw new Error('MCP command has an unmatched quote');
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export class MCPStdioClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private buffer = '';
  private stderrBuffer = '';

  constructor(private readonly config: MCPStdioServerConfig) {}

  async connect(): Promise<void> {
    if (this.process) return;

    const launch = parseCommandConfig(this.config);

    this.process = spawn(launch.command, launch.args, {
      env: {
        ...process.env,
        ...(this.config.env ?? {}),
      },
      stdio: 'pipe',
    });

    this.process.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      this.consumeBuffer();
    });

    this.process.stderr.on('data', (chunk: Buffer) => {
      // Preserve recent stderr so startup failures are diagnosable.
      this.stderrBuffer = `${this.stderrBuffer}${chunk.toString('utf8')}`.slice(-4000);
    });

    this.process.on('error', (error) => {
      const message = this.formatProcessError(error.message);
      this.rejectAllPending(new Error(message));
      this.process = null;
    });

    this.process.on('exit', () => {
      this.rejectAllPending(new Error(this.formatProcessError('MCP server process exited')));
      this.process = null;
    });

    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'qiuchat',
        version: '0.1.0',
      },
    });

    await this.notify('notifications/initialized', {});
  }

  async listTools(): Promise<MCPToolDescriptor[]> {
    const response = await this.request('tools/list', {});
    const tools = (response as { tools?: Array<Record<string, unknown>> }).tools ?? [];

    return tools.map((tool) => ({
      name: String(tool.name ?? ''),
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? {
        type: 'object',
        additionalProperties: true,
      },
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const response = await this.request('tools/call', {
      name,
      arguments: args,
    });

    const content = (response as { content?: Array<Record<string, unknown>> }).content;
    if (Array.isArray(content)) {
      const text = content
        .map((item) => {
          if (typeof item.text === 'string') return item.text;
          return JSON.stringify(item);
        })
        .join('\n');
      return text || JSON.stringify(response);
    }

    return JSON.stringify(response);
  }

  async close(): Promise<void> {
    if (!this.process) return;
    this.process.kill('SIGTERM');
    this.process = null;
    this.rejectAllPending(new Error('MCP client closed'));
  }

  private async request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.process) {
      throw new Error('MCP client is not connected');
    }

    const id = ++this.requestId;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const json = JSON.stringify(payload);
    const frame = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;

    const timeout = setTimeout(() => {
      const request = this.pending.get(id);
      if (request) {
        this.pending.delete(id);
        request.reject(new Error(`MCP request timeout: ${method}`));
      }
    }, 15_000);

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    this.process.stdin.write(frame);
    return await promise;
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.process) {
      throw new Error('MCP client is not connected');
    }

    const payload = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const json = JSON.stringify(payload);
    const frame = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
    this.process.stdin.write(frame);
  }

  private consumeBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const header = this.buffer.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;

      const body = this.buffer.slice(bodyStart, bodyEnd);
      this.buffer = this.buffer.slice(bodyEnd);

      try {
        const message = JSON.parse(body) as JsonRpcResponse;
        this.handleResponse(message);
      } catch {
        // Ignore malformed payload.
      }
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    if (!response.id) return;

    const pending = this.pending.get(response.id);
    if (!pending) return;

    this.pending.delete(response.id);
    clearTimeout(pending.timeout);

    if (response.error) {
      pending.reject(new Error(response.error.message || 'MCP request failed'));
      return;
    }

    pending.resolve(response.result);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private formatProcessError(message: string): string {
    const stderr = this.stderrBuffer.trim();
    if (!stderr) return message;
    return `${message}: ${stderr}`;
  }
}
