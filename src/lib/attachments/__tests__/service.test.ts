import test from 'node:test';
import assert from 'node:assert/strict';
import { readAttachmentContent, resolveChatAttachments } from '@/lib/attachments/service';

test('resolveChatAttachments loads current-session attachment metadata by id', async () => {
  const attachments = await resolveChatAttachments({
    prisma: {
      file: {
        findMany: async () => [
          {
            id: 'file_1',
            originalName: 'agenda.txt',
            fileType: 'text/plain',
            fileSize: 64,
          },
        ],
      },
    } as never,
    userId: 'u1',
    sessionId: 's1',
    requestedAttachments: [{ id: 'file_1' }],
  });

  assert.deepEqual(attachments, [
    {
      id: 'file_1',
      name: 'agenda.txt',
      mimeType: 'text/plain',
      size: 64,
    },
  ]);
});

test('readAttachmentContent returns cached extracted content when available', async () => {
  const result = await readAttachmentContent({
    prisma: {
      file: {
        findFirst: async () => ({
          id: 'file_1',
          originalName: 'agenda.txt',
          fileType: 'text/plain',
          fileSize: 64,
          storageKey: '2026/03/agenda.txt',
          extractedContent: '缓存内容',
        }),
      },
    } as never,
    userId: 'u1',
    sessionId: 's1',
    attachmentId: 'file_1',
    readStoredFile: async () => {
      throw new Error('should not read file');
    },
  });

  assert.equal(result.content, '缓存内容');
  assert.equal(result.cached, true);
});

test('readAttachmentContent reads text attachment and caches extracted content', async () => {
  const updates: Array<Record<string, unknown>> = [];

  const result = await readAttachmentContent({
    prisma: {
      file: {
        findFirst: async () => ({
          id: 'file_1',
          originalName: 'agenda.txt',
          fileType: 'text/plain',
          fileSize: 64,
          storageKey: '2026/03/agenda.txt',
          extractedContent: null,
        }),
        update: async (args: Record<string, unknown>) => {
          updates.push(args);
          return {};
        },
      },
    } as never,
    userId: 'u1',
    sessionId: 's1',
    attachmentId: 'file_1',
    readStoredFile: async () => Buffer.from('团建安排：早上破冰，中午野餐，下午徒步。', 'utf8'),
  });

  assert.equal(result.content, '团建安排：早上破冰，中午野餐，下午徒步。');
  assert.equal(result.cached, false);
  assert.equal(updates.length, 1);
});

test('readAttachmentContent parses pdf attachment and caches extracted content', async () => {
  const updates: Array<Record<string, unknown>> = [];

  const result = await readAttachmentContent({
    prisma: {
      file: {
        findFirst: async () => ({
          id: 'file_pdf',
          originalName: 'scan.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          storageKey: '2026/03/scan.pdf',
          extractedContent: null,
        }),
        update: async (args: Record<string, unknown>) => {
          updates.push(args);
          return {};
        },
      },
    } as never,
    userId: 'u1',
    sessionId: 's1',
    attachmentId: 'file_pdf',
    readStoredFile: async () => Buffer.from('pdf'),
    extractPdfText: async () => 'PDF 正文',
  });

  assert.equal(result.content, 'PDF 正文');
  assert.equal(updates.length, 1);
});

test('readAttachmentContent rejects attachment outside current session', async () => {
  await assert.rejects(
    () => readAttachmentContent({
      prisma: {
        file: {
          findFirst: async () => null,
        },
      } as never,
      userId: 'u1',
      sessionId: 's1',
      attachmentId: 'file_x',
    }),
    /附件不存在或无权访问/,
  );
});
