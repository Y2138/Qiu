import { z } from 'zod';
import type { ToolRuntimeDefinition } from '@/lib/agent/types';
import { MCPStdioClient, type MCPStdioServerConfig } from './stdio-client';
import { MCPHttpClient, type MCPHttpServerConfig } from './transports/http';

export interface MCPServerConfig extends Partial<MCPStdioServerConfig>, Partial<MCPHttpServerConfig> {
  enabled?: boolean;
  transport?: 'stdio' | 'http';
}

export interface MCPServerDiagnostics {
  serverName: string;
  state: 'connecting' | 'ready' | 'degraded' | 'disconnected';
  transport: 'stdio' | 'http';
  lastError?: string;
  metrics: {
    connectLatencyMs: number | null;
    listToolsLatencyMs: number | null;
    callCount: number;
    callFailureCount: number;
    timeoutCount: number;
    lastCallLatencyMs: number | null;
  };
}

interface MCPTransportClient {
  connect(): Promise<void>;
  listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
}

interface MCPRuntimeState {
  state: MCPServerDiagnostics['state'];
  transport: MCPServerDiagnostics['transport'];
  lastError?: string;
  metrics: MCPServerDiagnostics['metrics'];
}

class MCPHttpTransportClient implements MCPTransportClient {
  constructor(private readonly client: MCPHttpClient) {}

  async connect(): Promise<void> {
    await this.client.initialize();
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>> {
    return await this.client.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    return await this.client.callTool(name, args);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

class MCPStdioTransportClient implements MCPTransportClient {
  constructor(private readonly client: MCPStdioClient) {}

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>> {
    return await this.client.listTools();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    return await this.client.callTool(name, args);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export class MCPGateway {
  private readonly clients = new Map<string, MCPTransportClient>();
  private readonly diagnostics = new Map<string, MCPRuntimeState>();

  async getToolsFromEnv(): Promise<ToolRuntimeDefinition[]> {
    const raw = process.env.MCP_SERVERS_JSON;
    if (!raw) return [];

    let configMap: Record<string, MCPServerConfig>;
    try {
      configMap = JSON.parse(raw) as Record<string, MCPServerConfig>;
    } catch {
      return [];
    }

    const tools: ToolRuntimeDefinition[] = [];

    for (const [serverName, config] of Object.entries(configMap)) {
      if (config.enabled === false) continue;
      const transport = config.transport ?? (config.url ? 'http' : 'stdio');

      if (transport === 'stdio' && !config.command) continue;
      if (transport === 'http' && !config.url) continue;

      const state = this.ensureState(serverName, transport);
      state.state = 'connecting';

      const connectStart = Date.now();
      const client = await this.getOrCreateClient(serverName, config, transport).catch((error) => {
        state.state = 'degraded';
        state.lastError = (error as Error).message;
        return null;
      });

      if (!client) {
        continue;
      }

      state.metrics.connectLatencyMs = Date.now() - connectStart;

      const listStart = Date.now();
      const descriptors = await client.listTools().catch((error) => {
        state.state = 'degraded';
        state.lastError = (error as Error).message;
        return [];
      });
      state.metrics.listToolsLatencyMs = Date.now() - listStart;

      if (descriptors.length > 0) {
        state.state = 'ready';
      }

      for (const descriptor of descriptors) {
        const toolName = `mcp.${serverName}.${descriptor.name}`;
        tools.push({
          name: toolName,
          description: descriptor.description || `MCP tool ${descriptor.name} from ${serverName}`,
          inputSchema: z.record(z.string(), z.unknown()),
          rawInputSchema: descriptor.inputSchema,
          source: 'mcp',
          transport,
          riskLevel: 'medium',
          enabled: true,
          execute: async (input) => {
            const args = (input as Record<string, unknown>) ?? {};
            const callStart = Date.now();
            state.metrics.callCount += 1;

            try {
              const output = await client.callTool(descriptor.name, args);
              state.state = 'ready';
              state.metrics.lastCallLatencyMs = Date.now() - callStart;
              return {
                success: true,
                output,
              };
            } catch (error) {
              const message = (error as Error).message || 'MCP tool call failed';
              state.state = 'degraded';
              state.lastError = message;
              state.metrics.callFailureCount += 1;
              if (message.toLowerCase().includes('timeout')) {
                state.metrics.timeoutCount += 1;
              }
              state.metrics.lastCallLatencyMs = Date.now() - callStart;

              return {
                success: false,
                output: message,
                errorType: message.toLowerCase().includes('timeout') ? 'timeout' : 'execution',
              };
            }
          },
        });
      }
    }

    return tools;
  }

  getDiagnostics(): MCPServerDiagnostics[] {
    return Array.from(this.diagnostics.entries()).map(([serverName, state]) => ({
      serverName,
      state: state.state,
      transport: state.transport,
      lastError: state.lastError,
      metrics: state.metrics,
    }));
  }

  async closeAll(): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const [name, client] of this.clients.entries()) {
      tasks.push(
        client.close().finally(() => {
          const state = this.diagnostics.get(name);
          if (state) {
            state.state = 'disconnected';
          }
        }),
      );
    }
    this.clients.clear();
    await Promise.all(tasks);
  }

  private ensureState(serverName: string, transport: MCPServerDiagnostics['transport']): MCPRuntimeState {
    const existed = this.diagnostics.get(serverName);
    if (existed) return existed;

    const initial: MCPRuntimeState = {
      state: 'disconnected',
      transport,
      metrics: {
        connectLatencyMs: null,
        listToolsLatencyMs: null,
        callCount: 0,
        callFailureCount: 0,
        timeoutCount: 0,
        lastCallLatencyMs: null,
      },
    };
    this.diagnostics.set(serverName, initial);
    return initial;
  }

  private async getOrCreateClient(
    name: string,
    config: MCPServerConfig,
    transport: MCPServerDiagnostics['transport'],
  ): Promise<MCPTransportClient> {
    const existed = this.clients.get(name);
    if (existed) return existed;

    const state = this.ensureState(name, transport);
    state.state = 'connecting';

    const client = transport === 'http'
      ? new MCPHttpTransportClient(new MCPHttpClient({
          url: config.url!,
          headers: config.headers,
          timeoutMs: config.timeoutMs,
        }))
      : new MCPStdioTransportClient(new MCPStdioClient({
          command: config.command!,
          args: config.args,
          env: config.env,
        }));

    await client.connect();
    this.clients.set(name, client);
    state.state = 'ready';
    return client;
  }
}

export const mcpGateway = new MCPGateway();
