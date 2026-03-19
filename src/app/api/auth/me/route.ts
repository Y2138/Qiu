import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { mergeUserSettings } from '@/types/settings';

export async function GET() {
  try {
    const token = await getAuthCookie();

    if (!token) {
      return unauthorizedResponse('未登录');
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return unauthorizedResponse('无效的认证令牌');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, createdAt: true, updatedAt: true, settings: true },
    });

    if (!user) {
      return unauthorizedResponse('用户不存在');
    }

    return successResponse({
      ...user,
      settings: mergeUserSettings(user.settings),
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    return unauthorizedResponse('认证失败');
  }
}
