import { NextRequest } from 'next/server';
import { getCurrentUserServer } from '@/lib/server-auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';

// 支持的 providers
const PROVIDERS = ['openai', 'anthropic'];

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUserServer();

    if (!user) {
      return unauthorizedResponse('未登录');
    }

    return successResponse(PROVIDERS);
  } catch (error) {
    console.error('获取 providers 错误:', error);
    return successResponse(PROVIDERS);
  }
}
