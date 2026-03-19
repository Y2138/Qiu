import assert from 'node:assert/strict';
import test from 'node:test';
import { createFileUploadHandler } from '@/app/api/files/upload/route';

test('file upload route returns 400 when sessionId does not exist for the current user', async () => {
  let createCalled = false;

  const handler = createFileUploadHandler({
    getAuthCookie: async () => 'token',
    verifyToken: () => ({ userId: 'user_1', email: 'user@example.com' }),
    prisma: {
      session: {
        findFirst: async () => null,
      },
      file: {
        create: async () => {
          createCalled = true;
          throw new Error('should not create file record');
        },
      },
    } as never,
    mkdir: async () => undefined,
    writeFile: async () => undefined,
    createStoragePath: async () => '/tmp/uploads/2026/03',
    generateFileName: () => 'test-file.txt',
  });

  const formData = new FormData();
  formData.append('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
  formData.append('sessionId', 'cksession1234567890123456');

  const response = await handler(
    new Request('http://localhost/api/files/upload', {
      method: 'POST',
      body: formData,
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.message, '会话不存在或无权限');
  assert.equal(createCalled, false);
});
