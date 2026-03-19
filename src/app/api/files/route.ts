import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { Prisma } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const token = await getAuthCookie();

    if (!token) {
      return unauthorizedResponse('未登录');
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return unauthorizedResponse('无效的认证令牌');
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const skip = (page - 1) * limit;

    const where: Prisma.FileWhereInput = { userId: payload.userId };
    if (sessionId) {
      where.sessionId = sessionId;
    }

    const [files, total] = await Promise.all([
      prisma.file.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.file.count({ where }),
    ]);

    return successResponse({
      items: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        originalName: f.originalName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        createdAt: f.createdAt,
      })),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('获取文件列表错误:', error);
    return unauthorizedResponse('认证失败');
  }
}
