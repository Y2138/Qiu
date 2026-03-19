import { unlink } from 'fs/promises';
import { join } from 'path';
import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken } from '@/lib/auth';
import { successResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

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

    return successResponse({
      id: file.id,
      fileName: file.fileName,
      originalName: file.originalName,
      fileType: file.fileType,
      fileSize: file.fileSize,
      extractedContent: file.extractedContent,
      createdAt: file.createdAt,
    });
  } catch (error) {
    console.error('获取文件详情错误:', error);
    return unauthorizedResponse('认证失败');
  }
}

export async function DELETE(request: Request, { params }: Params) {
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
    try {
      await unlink(filePath);
    } catch (error) {
      console.warn('物理文件删除失败:', error);
    }

    await prisma.file.delete({
      where: { id },
    });

    return successResponse({ message: '文件删除成功' });
  } catch (error) {
    console.error('删除文件错误:', error);
    return unauthorizedResponse('认证失败');
  }
}
