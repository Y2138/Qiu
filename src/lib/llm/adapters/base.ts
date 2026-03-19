export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCallId?: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMToolResult {
  toolCallId: string;
  name: string;
  output: string;
}

export interface LLMRequestOptions {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string | string[];
  tools?: LLMToolDefinition[];
  toolChoice?: 'auto' | 'none';
  toolResults?: LLMToolResult[];
  exchangeRecorder?: LLMExchangeRecorder;
}

export interface LLMExchangeRequestPayload {
  provider: string;
  baseUrl?: string;
  model: string;
  messages: unknown[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string | string[];
  tools?: unknown[];
  toolChoice?: string;
}

export interface LLMExchangeResponsePayload {
  providerResponseId: string;
  content: string;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  toolCalls?: unknown[];
}

export interface LLMExchangeErrorPayload {
  stage: string;
  message: string;
}

export interface LLMExchangeRecorder {
  captureLlmRequest(payload: LLMExchangeRequestPayload): void;
  captureLlmResponse(payload: LLMExchangeResponsePayload): void;
  captureLlmError(payload: LLMExchangeErrorPayload): void;
}

export interface LLMResponse {
  id: string;
  content: string;
  model: string;
  toolCalls?: LLMToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export interface LLMStreamChunk {
  id?: string;
  content?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export abstract class BaseLLMAdapter {
  abstract readonly apiType: string;

  abstract complete(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse>;

  async completeWithTools(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): Promise<LLMResponse> {
    return this.complete(messages, options);
  }

  async *streamCompleteWithTools(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMStreamChunk> {
    yield* this.streamComplete(messages, options);
  }

  abstract streamComplete(
    messages: LLMMessage[],
    options?: LLMRequestOptions,
  ): AsyncGenerator<LLMStreamChunk>;

  abstract testApiKey(apiKey: string, baseUrl?: string): Promise<boolean>;
}
