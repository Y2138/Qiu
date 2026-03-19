import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api';
import { createApiKeySchema, updateApiKeySchema } from '@/lib/validations';
import { getCurrentUserServer } from '@/lib/server-auth';
import { encrypt } from '@/lib/encryption';

export async function GET() {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    // 不返回加密的 key
    const result = apiKeys.map((key) => ({
      id: key.id,
      name: key.name,
      apiType: key.apiType,
      baseUrl: key.baseUrl,
      models: key.models,
      isActive: key.isActive,
      testResult: key.testResult,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));

    return successResponse({ items: result, total: result.length });
  } catch (error) {
    console.error('获取 API Keys 错误:', error);
    return errorResponse('获取 API Keys 失败', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const body = await request.json();
    const result = createApiKeySchema.safeParse(body);

    if (!result.success) {
      return validationErrorResponse(result.error);
    }

    const { name, apiType, baseUrl, apiKey, models } = result.data;

    const encryptedKey = encrypt(apiKey);

    const apiKeyRecord = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name,
        apiType,
        baseUrl,
        encryptedKey,
        models,
      },
    });

    return successResponse(
      {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        apiType: apiKeyRecord.apiType,
        baseUrl: apiKeyRecord.baseUrl,
        models: apiKeyRecord.models,
        isActive: apiKeyRecord.isActive,
        createdAt: apiKeyRecord.createdAt,
        updatedAt: apiKeyRecord.updatedAt,
      },
      'API Key 创建成功'
    );
  } catch (error) {
    console.error('创建 API Key 错误:', error);
    return errorResponse('创建 API Key 失败', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return errorResponse('API Key ID 不能为空', 400);
    }

    // 验证 API Key 属于当前用户
    const existingKey = await prisma.apiKey.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingKey) {
      return errorResponse('API Key 不存在', 404);
    }

    // 解析验证
    const result = updateApiKeySchema.safeParse(updateData);
    if (!result.success) {
      return validationErrorResponse(result.error);
    }

    const { name, apiType, baseUrl, apiKey, models, isActive } = result.data;

    // 构建更新数据
    const updatePayload: {
      name?: string;
      apiType?: string;
      baseUrl?: string;
      encryptedKey?: string;
      models?: string[];
      isActive?: boolean;
    } = {};

    if (name !== undefined) updatePayload.name = name;
    if (apiType !== undefined) updatePayload.apiType = apiType;
    if (baseUrl !== undefined) updatePayload.baseUrl = baseUrl;
    if (apiKey !== undefined) updatePayload.encryptedKey = encrypt(apiKey);
    if (models !== undefined) updatePayload.models = models;
    if (isActive !== undefined) updatePayload.isActive = isActive;

    const updatedKey = await prisma.apiKey.update({
      where: { id },
      data: updatePayload,
    });

    return successResponse(
      {
        id: updatedKey.id,
        name: updatedKey.name,
        apiType: updatedKey.apiType,
        baseUrl: updatedKey.baseUrl,
        models: updatedKey.models,
        isActive: updatedKey.isActive,
        createdAt: updatedKey.createdAt,
        updatedAt: updatedKey.updatedAt,
      },
      'API Key 更新成功'
    );
  } catch (error) {
    console.error('更新 API Key 错误:', error);
    return errorResponse('更新 API Key 失败', 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return errorResponse('API Key ID 不能为空', 400);
    }

    // 验证 API Key 属于当前用户
    const existingKey = await prisma.apiKey.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingKey) {
      return errorResponse('API Key 不存在', 404);
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    return successResponse(null, 'API Key 删除成功');
  } catch (error) {
    console.error('删除 API Key 错误:', error);
    return errorResponse('删除 API Key 失败', 500);
  }
}
