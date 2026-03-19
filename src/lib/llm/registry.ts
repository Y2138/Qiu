import { BaseLLMAdapter } from './adapters/base';
import { OpenAIAdapter } from './adapters/openai';
import { AnthropicAdapter } from './adapters/anthropic';

export class AdapterRegistry {
  private adapters: Map<string, BaseLLMAdapter> = new Map();

  constructor() {
    this.register(new OpenAIAdapter());
    this.register(new AnthropicAdapter());
  }

  register(adapter: BaseLLMAdapter) {
    this.adapters.set(adapter.apiType, adapter);
  }

  getAdapter(apiType: string): BaseLLMAdapter | undefined {
    return this.adapters.get(apiType);
  }

  getAllAdapters(): BaseLLMAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAllApiTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

const registry = new AdapterRegistry();
export default registry;
