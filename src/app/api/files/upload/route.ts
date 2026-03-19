import { writeFile, mkdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getAuthCookie, verifyToken } from '@/lib/auth';
import { successResponse, unauthorizedResponse, badRequestResponse } from '@/lib/api';

const UPLOAD_DIR = 'uploads';

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  pdf: ['application/pdf'],
  text: ['text/plain', 'text/markdown'],
};

function getFileType(mimetype: string): string | null {
  for (const [type, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimes.includes(mimetype)) {
      return type;
    }
  }
  return null;
}

function normalizeMimeType(file: File): string {
  if (file.type) return file.type;
  if (file.name.toLowerCase().endsWith('.md')) return 'text/markdown';
  if (file.name.toLowerCase().endsWith('.txt')) return 'text/plain';
  if (file.name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  return file.type;
}

async function getStoragePath(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return join(process.cwd(), UPLOAD_DIR, year, month);
}

type UploadRouteDeps = {
  getAuthCookie: typeof getAuthCookie;
  verifyToken: typeof verifyToken;
  prisma: typeof prisma;
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  createStoragePath: typeof getStoragePath;
  generateFileName: (originalName: string) => string;
};

const defaultDeps: UploadRouteDeps = {
  getAuthCookie,
  verifyToken,
  prisma,
  mkdir,
  writeFile,
  createStoragePath: getStoragePath,
  generateFileName: (originalName) => `${randomUUID()}${extname(originalName)}`,
};

export function createFileUploadHandler(deps: UploadRouteDeps = defaultDeps) {
  return async function POST(request: Request) {
    try {
      const token = await deps.getAuthCookie();

      if (!token) {
        return unauthorizedResponse('未登录');
      }

      const payload = deps.verifyToken(token);
      if (!payload || !payload.userId) {
        return unauthorizedResponse('无效的认证令牌');
      }

      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const rawSessionId = formData.get('sessionId');
      const sessionId = typeof rawSessionId === 'string' && rawSessionId.trim()
        ? rawSessionId.trim()
        : null;

      if (!file) {
        return badRequestResponse('请选择要上传的文件');
      }

      const mimeType = normalizeMimeType(file);
      const fileType = getFileType(mimeType);
      if (!fileType) {
        return badRequestResponse(`不支持的文件类型: ${file.type}`);
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (buffer.length > 50 * 1024 * 1024) {
        return badRequestResponse('文件大小不能超过 50MB');
      }

      let resolvedSessionId: string | null = null;
      if (sessionId) {
        const session = await deps.prisma.session.findFirst({
          where: {
            id: sessionId,
            userId: payload.userId,
          },
          select: {
            id: true,
          },
        });

        if (!session) {
          return badRequestResponse('会话不存在或无权限');
        }

        resolvedSessionId = session.id;
      }

      const storagePath = await deps.createStoragePath();
      const fileName = deps.generateFileName(file.name);
      const filePath = join(storagePath, fileName);
      const storageKey = relative(UPLOAD_DIR, filePath);

      await deps.mkdir(storagePath, { recursive: true });
      await deps.writeFile(filePath, buffer);

      const fileRecord = await deps.prisma.file.create({
        data: {
          userId: payload.userId,
          sessionId: resolvedSessionId,
          fileName,
          originalName: file.name,
          fileType: mimeType,
          fileSize: buffer.length,
          storageKey,
        },
      });

      return successResponse({
        id: fileRecord.id,
        fileName: fileRecord.fileName,
        originalName: fileRecord.originalName,
        fileType: fileRecord.fileType,
        fileSize: fileRecord.fileSize,
        createdAt: fileRecord.createdAt,
      });
    } catch (error) {
      console.error('文件上传错误:', error);
      return badRequestResponse('文件上传失败');
    }
  };
}

export const POST = createFileUploadHandler();
