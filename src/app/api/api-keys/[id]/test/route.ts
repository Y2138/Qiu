import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/server-auth';
import { decrypt } from '@/lib/encryption';
import registry from '@/lib/llm/registry';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const { id } = await params;

    // 获取 API Key 记录
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { id, userId: user.id },
    });

    if (!apiKeyRecord) {
      return notFoundResponse('API Key 不存在');
    }

    // 解密 API Key
    const apiKey = decrypt(apiKeyRecord.encryptedKey);

    // 获取适配器
    const adapter = registry.getAdapter(apiKeyRecord.apiType);
    if (!adapter) {
      return errorResponse(`不支持的 API 类型: ${apiKeyRecord.apiType}`, 400);
    }

    // 测试 API Key
    try {
      const isValid = await adapter.testApiKey(apiKey, apiKeyRecord.baseUrl);

      if (isValid) {
        // 更新 API Key 状态
        await prisma.apiKey.update({
          where: { id },
          data: { isActive: true },
        });

        return successResponse({ valid: true }, 'API Key 有效');
      } else {
        return errorResponse('API Key 无效', 400);
      }
    } catch (error) {
      return errorResponse(`API Key 测试失败: ${(error as Error).message}`, 400);
    }
  } catch (error) {
    console.error('测试 API Key 错误:', error);
    return errorResponse('测试 API Key 失败', 500);
  }
}
