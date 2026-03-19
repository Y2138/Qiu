import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '@/lib/prisma';
import { extractTextFromPdfBuffer } from '@/lib/pdf.server';

export interface RequestedAttachmentInput {
  id: string;
}

export interface AttachmentReference {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface AttachmentContentResult {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  content: string;
  cached: boolean;
}

interface FileRecord {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  storageKey?: string | null;
  extractedContent?: string | null;
}

interface ResolveChatAttachmentsInput {
  prisma: typeof prisma;
  userId: string;
  sessionId: string;
  requestedAttachments: RequestedAttachmentInput[];
}

interface ReadAttachmentContentInput {
  prisma: typeof prisma;
  userId: string;
  sessionId: string;
  attachmentId: string;
  readStoredFile?: (storageKey: string) => Promise<Buffer>;
  extractPdfText?: (buffer: Buffer) => Promise<string | null>;
}

export async function resolveChatAttachments(input: ResolveChatAttachmentsInput): Promise<AttachmentReference[]> {
  if (!input.requestedAttachments.length) return [];

  const fileIds = [...new Set(input.requestedAttachments.map((attachment) => attachment.id))];
  const records = await input.prisma.file.findMany({
    where: {
      userId: input.userId,
      sessionId: input.sessionId,
      id: { in: fileIds },
    },
    select: {
      id: true,
      originalName: true,
      fileType: true,
      fileSize: true,
    },
  });

  if (records.length !== fileIds.length) {
    throw new Error('部分附件不存在或无权访问');
  }

  const recordsById = new Map(records.map((record) => [record.id, record]));
  return fileIds.map((fileId) => {
    const record = recordsById.get(fileId);
    if (!record) {
      throw new Error('部分附件不存在或无权访问');
    }

    return {
      id: record.id,
      name: record.originalName,
      mimeType: record.fileType,
      size: record.fileSize,
    };
  });
}

export async function readAttachmentContent(input: ReadAttachmentContentInput): Promise<AttachmentContentResult> {
  const record = await input.prisma.file.findFirst({
    where: {
      id: input.attachmentId,
      userId: input.userId,
      sessionId: input.sessionId,
    },
    select: {
      id: true,
      originalName: true,
      fileType: true,
      fileSize: true,
      storageKey: true,
      extractedContent: true,
    },
  }) as FileRecord | null;

  if (!record) {
    throw new Error('附件不存在或无权访问');
  }

  const cachedContent = record.extractedContent?.trim();
  if (cachedContent) {
    return {
      attachmentId: record.id,
      fileName: record.originalName,
      mimeType: record.fileType,
      size: record.fileSize,
      content: cachedContent,
      cached: true,
    };
  }

  if (!record.storageKey) {
    throw new Error('附件缺少存储路径');
  }

  const readStoredFile = input.readStoredFile ?? defaultReadStoredFile;
  const fileBuffer = await readStoredFile(record.storageKey);
  const extractedContent = await extractAttachmentText(record.fileType, fileBuffer, input.extractPdfText);

  if (!extractedContent) {
    throw new Error('暂时无法提取该附件内容');
  }

  await input.prisma.file.update({
    where: { id: record.id },
    data: {
      extractedContent,
    },
  });

  return {
    attachmentId: record.id,
    fileName: record.originalName,
    mimeType: record.fileType,
    size: record.fileSize,
    content: extractedContent,
    cached: false,
  };
}

async function defaultReadStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(join(process.cwd(), 'uploads', storageKey));
}

async function extractAttachmentText(
  mimeType: string,
  buffer: Buffer,
  extractPdfText: ((buffer: Buffer) => Promise<string | null>) | undefined,
): Promise<string | null> {
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
    const text = buffer.toString('utf-8').trim();
    return text || null;
  }

  if (mimeType === 'application/pdf') {
    return (extractPdfText ?? extractTextFromPdfBuffer)(buffer);
  }

  return null;
}
