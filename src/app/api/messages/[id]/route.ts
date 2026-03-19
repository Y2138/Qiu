import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';
import { getCurrentUserServer } from '@/lib/server-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const { id } = await params;

    // 获取消息并验证归属
    const message = await prisma.message.findFirst({
      where: { id },
      include: { session: true },
    });

    if (!message) {
      return notFoundResponse('消息不存在');
    }

    // 验证消息属于当前用户
    if (message.session.userId !== user.id) {
      return errorResponse('无权删除此消息', 403);
    }

    // 删除消息
    await prisma.message.delete({
      where: { id },
    });

    return successResponse(null, '消息删除成功');
  } catch (error) {
    console.error('删除消息错误:', error);
    return errorResponse('删除消息失败', 500);
  }
}
