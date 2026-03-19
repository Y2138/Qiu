import { readFile } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken } from '@/lib/auth';
import { unauthorizedResponse, notFoundResponse } from '@/lib/api';

const UPLOAD_DIR = 'uploads';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const token = await getAuthCookie();

    if (!token) {
      return unauthorizedResponse('未登录');
    }

    const payload = verifyToken(token);
    if (!payload || !payload.userId) {
      return unauthorizedResponse('无效的认证令牌');
    }

    const file = await prisma.file.findFirst({
      where: { id, userId: payload.userId },
    });

    if (!file) {
      return notFoundResponse('文件不存在');
    }

    const filePath = join(UPLOAD_DIR, file.storageKey);
    const buffer = await readFile(filePath);

    return new Response(buffer, {
      headers: {
        'Content-Type': file.fileType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.originalName)}"`,
      },
    });
  } catch (error) {
    console.error('下载文件错误:', error);
    return notFoundResponse('文件不存在或已被删除');
  }
}
