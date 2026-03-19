import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken } from '@/lib/auth';
import { successResponse, unauthorizedResponse, validationErrorResponse, errorResponse } from '@/lib/api';
import { agentMemoryPatchSchema } from '@/lib/validations';
import {
  getUserAgentMemoryEntries,
  replaceUserAgentMemoryEntries,
} from '@/lib/agent/persistence';
import { createManualMemoryEntry, mergeUserMemoryEntries } from '@/lib/agent/memory-store';

export async function GET() {
  try {
    const user = await resolveUser();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    return successResponse({
      entries: await getUserAgentMemoryEntries(prisma, user.id),
    });
  } catch (error) {
    console.error('获取 Agent Memory 失败:', error);
    return errorResponse('获取 Agent Memory 失败，请稍后重试', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await resolveUser();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const body = await request.json();
    const validated = agentMemoryPatchSchema.safeParse(body);
    if (!validated.success) {
      return validationErrorResponse(validated.error);
    }

    const currentEntries = await getUserAgentMemoryEntries(prisma, user.id);
    const payload = validated.data;
    let nextEntries = currentEntries;

    if (payload.action === 'clear') {
      nextEntries = [];
    } else if ('id' in payload) {
      nextEntries = currentEntries.filter((entry) => entry.id !== payload.id);
    } else {
      const entry = createManualMemoryEntry(payload.kind, payload.content);
      if (!entry) {
        throw new Error('记忆内容不符合长期记忆规则，请改成稳定偏好或项目背景。');
      }

      nextEntries = mergeUserMemoryEntries(currentEntries, [entry]);
    }

    await replaceUserAgentMemoryEntries(prisma, user.id, nextEntries);

    return successResponse({
      entries: nextEntries,
    });
  } catch (error) {
    console.error('更新 Agent Memory 失败:', error);
    if (error instanceof Error && error.message) {
      return errorResponse(error.message, 400);
    }
    return errorResponse('更新 Agent Memory 失败，请稍后重试', 500);
  }
}

async function resolveUser() {
  const token = await getAuthCookie();
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload?.userId) return null;

  return await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
    },
  });
}
