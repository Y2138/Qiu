import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
} from '@/lib/api';
import { updateSessionSchema } from '@/lib/validations';
import { getCurrentUserServer } from '@/lib/server-auth';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const session = await prisma.session.findFirst({
      where: { id, userId: user.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return notFoundResponse('会话不存在');
    }

    return successResponse({
      ...session,
      messages: session.messages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        role: m.role,
        content: m.content,
        model: m.model,
        tokens: m.tokens,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('获取会话错误:', error);
    return errorResponse('获取会话失败', 500);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const session = await prisma.session.findFirst({
      where: { id, userId: user.id },
    });

    if (!session) {
      return notFoundResponse('会话不存在');
    }

    const body = await request.json();
    const result = updateSessionSchema.safeParse(body);

    if (!result.success) {
      return validationErrorResponse(result.error);
    }

    const updated = await prisma.session.update({
      where: { id },
      data: result.data,
    });

    return successResponse(updated, '会话更新成功');
  } catch (error) {
    console.error('更新会话错误:', error);
    return errorResponse('更新会话失败', 500);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const session = await prisma.session.findFirst({
      where: { id, userId: user.id },
    });

    if (!session) {
      return notFoundResponse('会话不存在');
    }

    await prisma.session.delete({
      where: { id },
    });

    return successResponse(null, '会话已删除');
  } catch (error) {
    console.error('删除会话错误:', error);
    return errorResponse('删除会话失败', 500);
  }
}
