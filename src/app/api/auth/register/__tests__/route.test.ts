import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/register/route';

test('register api is disabled for all callers', async () => {
  const response = await POST(new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: 'new@example.com',
      password: 'Password123',
      nickname: 'new-user',
    }),
  }));
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
});
