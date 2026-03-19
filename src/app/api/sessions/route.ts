import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api';
import { createSessionSchema } from '@/lib/validations';
import { getCurrentUserServer } from '@/lib/server-auth';
import {
  buildAgentRunViewModelFromMessage,
  getSessionAgentPreviewFromRuns,
} from '@/lib/agent/persistence';

async function getSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        where: {
          role: 'assistant',
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
        select: {
          id: true,
          metadata: true,
          createdAt: true,
        },
      },
    },
  });
}
type SessionRecord = Awaited<ReturnType<typeof getSessions>>[number];

function mapSessionListItem(session: SessionRecord) {
  const fallbackRun = session.messages[0]?.metadata
    ? buildAgentRunViewModelFromMessage({
        ...session.messages[0],
        sessionId: session.id,
        content: '',
        role: 'assistant',
      } as never)
    : undefined;
  const preview = getSessionAgentPreviewFromRuns(fallbackRun ? [fallbackRun] : []);

  return {
    id: session.id,
    userId: session.userId,
    title: session.title,
    model: session.model,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    agentStatus: preview.status,
    hasRunnableCheckpoint: preview.hasRunnableCheckpoint,
    agentStatusText: preview.statusText,
    latestAgentRunAt: preview.latestAgentRunAt ? new Date(preview.latestAgentRunAt) : undefined,
  };
}

export async function GET() {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const sessions = await getSessions(user.id);
    const items = sessions.map(mapSessionListItem);

    return successResponse({
      items,
      total: items.length,
      page: 1,
      limit: 100,
    });
  } catch (error) {
    console.error('获取会话列表错误:', error);
    return errorResponse('获取会话列表失败', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const body = await request.json();
    const result = createSessionSchema.safeParse(body);

    if (!result.success) {
      return validationErrorResponse(result.error);
    }

    const { title, model } = result.data;

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        title,
        model: model || 'gpt-3.5-turbo',
      },
    });

    return successResponse(session, '会话创建成功');
  } catch (error) {
    console.error('创建会话错误:', error);
    return errorResponse('创建会话失败', 500);
  }
}
