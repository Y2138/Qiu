import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken, comparePassword, hashPassword } from '@/lib/auth';
import { successResponse, unauthorizedResponse, badRequestResponse, validationErrorResponse } from '@/lib/api';
import { updatePasswordSchema } from '@/lib/validations';

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
    const validated = updatePasswordSchema.safeParse(body);

    if (!validated.success) {
      return validationErrorResponse(validated.error);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return unauthorizedResponse('用户不存在');
    }

    // 验证当前密码
    const isPasswordValid = await comparePassword(validated.data.currentPassword, user.password);
    if (!isPasswordValid) {
      return badRequestResponse('当前密码错误');
    }

    // 加密并更新新密码
    const hashedNewPassword = await hashPassword(validated.data.newPassword);
    await prisma.user.update({
      where: { id: payload.userId },
      data: { password: hashedNewPassword },
    });

    return successResponse(null, '密码修改成功');
  } catch (error) {
    console.error('修改密码错误:', error);
    return badRequestResponse('修改密码失败');
  }
}
