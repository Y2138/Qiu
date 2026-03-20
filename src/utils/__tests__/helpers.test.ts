import test from 'node:test';
import assert from 'node:assert/strict';
import { generateId } from '@/utils/helpers';

test('generateId falls back when crypto.randomUUID is unavailable', () => {
  const originalCrypto = globalThis.crypto;

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {},
  });

  try {
    const id = generateId();
    assert.equal(typeof id, 'string');
    assert.ok(id.length >= 16);
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  }
});

test('generateId uses crypto.randomUUID when available', () => {
  const originalCrypto = globalThis.crypto;

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => 'fixed-id',
    },
  });

  try {
    assert.equal(generateId(), 'fixed-id');
  } finally {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  }
});
