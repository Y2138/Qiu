import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken } from '@/lib/auth';
import { successResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api';
import { updateUserSchema } from '@/lib/validations';
import { Prisma } from '@prisma/client';
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

export async function PATCH(request: Request) {
  try {
    const token = await getAuthCookie();

    if (!token) {
      return unauthorizedResponse('未登录');
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return unauthorizedResponse('无效的认证令牌');
    }

    const body = await request.json();
    const validated = updateUserSchema.safeParse(body);

    if (!validated.success) {
      return validationErrorResponse(validated.error);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return unauthorizedResponse('用户不存在');
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (validated.data.name !== undefined) {
      updateData.name = validated.data.name;
    }
    if (validated.data.settings !== undefined) {
      const rawSettings =
        user.settings && typeof user.settings === 'object' && !Array.isArray(user.settings)
          ? (user.settings as Record<string, unknown>)
          : {};
      const mergedSettings = {
        ...rawSettings,
        ...mergeUserSettings(user.settings),
        ...validated.data.settings,
      };
      updateData.settings = mergedSettings as unknown as Prisma.InputJsonValue;
    }

    const updatedUser = await prisma.user.update({
      where: { id: payload.userId },
      data: updateData,
      select: { id: true, email: true, name: true, createdAt: true, updatedAt: true, settings: true },
    });

    return successResponse({
      ...updatedUser,
      settings: mergeUserSettings(updatedUser.settings),
    });
  } catch (error) {
    console.error('更新用户信息错误:', error);
    return unauthorizedResponse('认证失败');
  }
}

export async function DELETE() {
  try {
    const token = await getAuthCookie();

    if (!token) {
      return unauthorizedResponse('未登录');
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return unauthorizedResponse('无效的认证令牌');
    }

    // 删除用户 (Cascade 会自动删除关联的 apiKeys, sessions, messages, files)
    await prisma.user.delete({
      where: { id: payload.userId },
    });

    return successResponse(null, '账户注销成功');
  } catch (error) {
    console.error('注销账户错误:', error);
    return unauthorizedResponse('注销账户失败');
  }
}
