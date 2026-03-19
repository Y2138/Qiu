import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserServer } from '@/lib/server-auth';
import { decrypt } from '@/lib/encryption';
import registry from '@/lib/llm/registry';
import { successResponse, unauthorizedResponse, errorResponse, notFoundResponse } from '@/lib/api';

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    // 获取会话
    const session = await prisma.session.findFirst({
      where: { id, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          where: { role: 'user' },
          take: 5,
        },
      },
    });

    if (!session) {
      return notFoundResponse('会话不存在');
    }

    // 如果已经有标题且用户没有请求强制更新，则不重新生成
    const body = await request.json() || {};
    const forceUpdate = body.force === true;

    if (!forceUpdate && session.title && session.title !== '新对话') {
      return successResponse({ title: session.title }, '标题已存在');
    }

    // 获取用户消息内容
    const userMessages = session.messages.map((m) => m.content);
    if (userMessages.length === 0) {
      return errorResponse('没有用户消息可供生成标题', 400);
    }

    // 获取用户的活跃 API Key
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: user.id, isActive: true },
    });

    if (apiKeys.length === 0) {
      // 如果没有 API Key，使用默认标题
      const defaultTitle = generateDefaultTitle(userMessages[0]);
      await prisma.session.update({
        where: { id },
        data: { title: defaultTitle },
      });
      return successResponse({ title: defaultTitle }, '使用默认标题');
    }

    const apiKeyRecord = apiKeys[0];
    const apiKey = decrypt(apiKeyRecord.encryptedKey);
    const adapter = registry.getAdapter(apiKeyRecord.apiType);

    if (!adapter) {
      // 如果没有适配器，使用默认标题
      const defaultTitle = generateDefaultTitle(userMessages[0]);
      await prisma.session.update({
        where: { id },
        data: { title: defaultTitle },
      });
      return successResponse({ title: defaultTitle }, '使用默认标题');
    }

    // 使用 LLM 生成标题
    const systemPrompt = `你是一个对话标题生成助手。根据用户的消息内容，生成一个简洁、准确的标题（不超过50个字符）。直接返回标题，不要有任何前缀或解释。`;

    const userPrompt = `根据以下对话生成标题：\n${userMessages.join('\n')}`;

    try {
      const response = await adapter.complete(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          model: apiKeyRecord.models[0] || 'gpt-3.5-turbo',
          apiKey,
          baseUrl: apiKeyRecord.baseUrl,
        }
      );

      let title = response.content?.trim() || '';

      // 清理标题
      title = title.replace(/^["']|["']$/g, '').trim();
      if (title.length > 50) {
        title = title.substring(0, 47) + '...';
      }

      if (!title) {
        title = generateDefaultTitle(userMessages[0]);
      }

      // 更新会话标题
      await prisma.session.update({
        where: { id },
        data: { title },
      });

      return successResponse({ title }, '标题生成成功');
    } catch (llmError) {
      console.error('LLM 调用失败:', llmError);
      // LLM 失败时使用默认标题
      const defaultTitle = generateDefaultTitle(userMessages[0]);
      await prisma.session.update({
        where: { id },
        data: { title: defaultTitle },
      });
      return successResponse({ title: defaultTitle }, '使用默认标题');
    }
  } catch (error) {
    console.error('生成标题错误:', error);
    return errorResponse('生成标题失败', 500);
  }
}

// 生成默认标题
function generateDefaultTitle(firstMessage: string): string {
  // 提取第一条消息的前30个字符作为标题
  const cleaned = firstMessage.replace(/[#*`\n]/g, ' ').trim();
  if (cleaned.length <= 30) {
    return cleaned || '新对话';
  }
  return cleaned.substring(0, 27) + '...';
}
