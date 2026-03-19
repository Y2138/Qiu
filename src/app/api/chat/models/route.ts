import { NextRequest } from 'next/server';
import { getCurrentUserServer } from '@/lib/server-auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';

// 默认模型配置
const DEFAULT_MODELS = [
  { provider: 'openai', model: 'gpt-4o', name: 'GPT-4o' },
  { provider: 'openai', model: 'gpt-4o-mini', name: 'GPT-4o Mini' },
  { provider: 'openai', model: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { provider: 'openai', model: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { provider: 'anthropic', model: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  { provider: 'anthropic', model: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
  { provider: 'anthropic', model: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUserServer();

    if (!user) {
      return unauthorizedResponse('未登录');
    }

    return successResponse(DEFAULT_MODELS);
  } catch (error) {
    console.error('获取模型列表错误:', error);
    return successResponse(DEFAULT_MODELS);
  }
}
