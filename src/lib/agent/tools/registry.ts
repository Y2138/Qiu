import type { z } from 'zod';
import type { LLMToolCall, LLMToolDefinition, LLMToolResult } from '@/lib/llm/adapters/base';
import type {
  AgentRunContext,
  AgentToolErrorType,
  AgentToolRuntime,
  ToolRuntimeDefinition,
  ToolSource,
} from '@/lib/agent/types';

export interface ToolRegistryOptions {
  maxToolExecutionMs?: number;
}

export class ToolRegistry implements AgentToolRuntime {
  private readonly tools = new Map<string, ToolRuntimeDefinition>();
  private readonly maxToolExecutionMs: number;

  constructor(options?: ToolRegistryOptions) {
    this.maxToolExecutionMs = options?.maxToolExecutionMs ?? 15_000;
  }

  register(tool: ToolRuntimeDefinition) {
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getToolDefinitions(): LLMToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((tool) => tool.enabled !== false)
      .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.rawInputSchema ?? this.zodToJsonSchema(tool.inputSchema),
      }));
  }

  getToolNames(): string[] {
    return Array.from(this.tools.values())
      .filter((tool) => tool.enabled !== false)
      .map((tool) => tool.name);
  }

  getRegisteredTools(): ToolRuntimeDefinition[] {
    return Array.from(this.tools.values());
  }

  async executeToolCall(
    call: LLMToolCall,
    ctx: AgentRunContext,
    allowedTools?: Set<string>,
  ): Promise<LLMToolResult & {
    success: boolean;
    source: ToolSource;
    errorType?: AgentToolErrorType;
    latencyMs?: number;
  }> {
    const startedAt = Date.now();
    if (allowedTools && !allowedTools.has(call.name)) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Tool ${call.name} is not allowed by current skill policy.`,
        success: false,
        source: 'internal',
        errorType: 'policy',
        latencyMs: Date.now() - startedAt,
      };
    }

    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Tool ${call.name} is not registered.`,
        success: false,
        source: 'internal',
        errorType: 'policy',
        latencyMs: Date.now() - startedAt,
      };
    }

    let input: unknown = {};
    try {
      input = call.arguments ? JSON.parse(call.arguments) : {};
    } catch {
      return {
        toolCallId: call.id,
        name: call.name,
        output: 'Invalid tool arguments JSON.',
        success: false,
        source: tool.source,
        errorType: 'validation',
        latencyMs: Date.now() - startedAt,
      };
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        toolCallId: call.id,
        name: call.name,
        output: `Input validation failed: ${parsed.error.message}`,
        success: false,
        source: tool.source,
        errorType: 'validation',
        latencyMs: Date.now() - startedAt,
      };
    }

    const maxRetry = Math.max(0, ctx.retryPolicy.toolMaxRetry);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetry; attempt += 1) {
      try {
        const result = await this.withTimeout(
          () => tool.execute(parsed.data, ctx),
          this.maxToolExecutionMs,
          `Tool ${call.name} timed out`,
        );

        return {
          toolCallId: call.id,
          name: call.name,
          output: result.output,
          success: result.success,
          source: tool.source,
          errorType: result.errorType,
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        lastError = error as Error;
      }
    }

    const errorType = this.classifyExecutionError(lastError);
    return {
      toolCallId: call.id,
      name: call.name,
      output: lastError?.message || 'Tool execution failed',
      success: false,
      source: tool.source,
      errorType,
      latencyMs: Date.now() - startedAt,
    };
  }

  private zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
    // Minimal schema for provider compatibility in MVP.
    // Detailed JSON schema conversion can be added later.
    void schema;

    return {
      type: 'object',
      additionalProperties: true,
    };
  }

  private async withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      fn()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private classifyExecutionError(error: Error | null): AgentToolErrorType {
    if (!error) return 'execution';
    if (error.message.toLowerCase().includes('timed out')) {
      return 'timeout';
    }
    return 'execution';
  }
}
