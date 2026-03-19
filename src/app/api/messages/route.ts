import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return errorResponse('sessionId 参数不能为空', 400);
    }

    // 验证会话属于当前用户
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id },
    });

    if (!session) {
      return notFoundResponse('会话不存在');
    }

    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return successResponse({
      items: messages,
      total: messages.length,
    });
  } catch (error) {
    console.error('获取消息列表错误:', error);
    return errorResponse('获取消息列表失败', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const body = await request.json();
    const { sessionId, role, content, model } = body;

    if (!sessionId || !role || !content) {
      return errorResponse('缺少必填参数', 400);
    }

    // 验证会话属于当前用户
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: user.id },
    });

    if (!session) {
      return notFoundResponse('会话不存在');
    }

    const message = await prisma.message.create({
      data: {
        sessionId,
        role,
        content,
        model,
      },
    });

    // 更新会话的更新时间
    await prisma.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return successResponse(message, '消息创建成功');
  } catch (error) {
    console.error('创建消息错误:', error);
    return errorResponse('创建消息失败', 500);
  }
}
