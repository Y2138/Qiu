import test from 'node:test';
import assert from 'node:assert/strict';
import RegisterPage from '@/app/register/page';

test('register page redirects users away from the register screen', () => {
  assert.throws(
    () => RegisterPage(),
    (error: unknown) =>
      error instanceof Error
      && 'digest' in error
      && typeof (error as Error & { digest?: unknown }).digest === 'string'
      && (error as Error & { digest: string }).digest.startsWith('NEXT_REDIRECT'),
  );
});
