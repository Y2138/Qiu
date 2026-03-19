import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { comparePassword, generateToken, setAuthCookie } from '@/lib/auth';
import { successResponse, errorResponse, unauthorizedResponse, validationErrorResponse } from '@/lib/api';
import { loginSchema } from '@/lib/validations';
import { rateLimit } from '@/lib/rate-limit';
import { mergeUserSettings } from '@/types/settings';

export async function POST(request: NextRequest) {
  try {
    // 速率限制检查
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const rateLimitResult = await rateLimit(clientIp, '/api/auth/login');

    if (!rateLimitResult.success) {
      return errorResponse('请求过于频繁，请稍后再试', 429);
    }
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return validationErrorResponse(result.error);
    }

    const { email, password } = result.data;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return unauthorizedResponse('邮箱或密码错误');
    }

    // 验证密码
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      return unauthorizedResponse('邮箱或密码错误');
    }

    // 生成 token 并设置 cookie
    const token = generateToken({ userId: user.id, email: user.email });
    await setAuthCookie(token);

    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        settings: mergeUserSettings(user.settings),
      },
    }, '登录成功');
  } catch (error) {
    console.error('登录错误:', error);
    return errorResponse('登录失败，请稍后重试', 500);
  }
}
