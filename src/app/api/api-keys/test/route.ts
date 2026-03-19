import { NextRequest } from 'next/server';
import {
  errorResponse,
  successResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from '@/lib/api';
import { getCurrentUserServer } from '@/lib/server-auth';
import registry from '@/lib/llm/registry';
import { testApiKeySchema } from '@/lib/validations';

interface CreateTestApiKeyHandlerOptions {
  getCurrentUserServer: typeof getCurrentUserServer;
  getAdapter: typeof registry.getAdapter;
}

export function createTestApiKeyHandler(
  {
    getCurrentUserServer: getCurrentUser,
    getAdapter,
  }: CreateTestApiKeyHandlerOptions = {
    getCurrentUserServer,
    getAdapter: registry.getAdapter.bind(registry),
  }
) {
  return async function POST(request: NextRequest) {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return unauthorizedResponse('未登录');
      }

      const body = await request.json();
      const result = testApiKeySchema.safeParse(body);

      if (!result.success) {
        return validationErrorResponse(result.error);
      }

      const { apiType, baseUrl, apiKey } = result.data;
      const adapter = getAdapter(apiType);

      if (!adapter) {
        return errorResponse(`不支持的 API 类型: ${apiType}`, 400);
      }

      try {
        const isValid = await adapter.testApiKey(apiKey, baseUrl);

        if (!isValid) {
          return errorResponse('API Key 无效', 400);
        }

        return successResponse({ valid: true }, 'API Key 有效');
      } catch (error) {
        return errorResponse(`API Key 测试失败: ${(error as Error).message}`, 400);
      }
    } catch (error) {
      console.error('测试 API Key 错误:', error);
      return errorResponse('测试 API Key 失败', 500);
    }
  };
}

export const POST = createTestApiKeyHandler();
