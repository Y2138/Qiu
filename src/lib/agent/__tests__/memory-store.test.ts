import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveUserMemoryEntries,
  mergeUserMemoryEntries,
  readUserMemoryEntries,
  writeUserMemoryEntries,
} from '@/lib/agent/memory-store';

test('deriveUserMemoryEntries extracts explicit preference and project memory', () => {
  const entries = deriveUserMemoryEntries([
    { role: 'user', content: '请记住：我喜欢简洁风格' },
    { role: 'user', content: '我的项目是 Next.js + Prisma + Postgres' },
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.scope, 'user');
  assert.ok(entries.some((entry) => entry.kind === 'preference'));
  assert.ok(entries.some((entry) => entry.kind === 'project_context'));
});

test('writeUserMemoryEntries preserves unrelated settings fields', () => {
  const settings = writeUserMemoryEntries(
    { theme: 'dark', customFlag: true },
    [{
      id: 'um_1',
      scope: 'user',
      kind: 'preference',
      content: 'Use Chinese',
      source: 'remember',
      updatedAt: 1,
    }],
  );

  assert.equal(settings.theme, 'dark');
  assert.equal(settings.customFlag, true);
  assert.equal(readUserMemoryEntries(settings).length, 1);
});

test('mergeUserMemoryEntries deduplicates by semantic content', () => {
  const merged = mergeUserMemoryEntries(
    [{
      id: 'old',
      scope: 'user',
      kind: 'preference',
      content: 'Use Chinese',
      source: 'old',
      updatedAt: 1,
    }],
    [{
      id: 'new',
      scope: 'user',
      kind: 'preference',
      content: 'Use Chinese',
      source: 'new',
      updatedAt: 2,
    }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.id, 'new');
});

test('deriveUserMemoryEntries ignores one-off tasks and sensitive data', () => {
  const entries = deriveUserMemoryEntries([
    { role: 'user', content: '请记住：明天下午 3 点提醒我提交报销单' },
    { role: 'user', content: '请记住：我的 API Key 是 sk-secret' },
    { role: 'user', content: '请记住：我喜欢简洁、直接的回答风格' },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.kind, 'preference');
  assert.equal(entries[0]?.content, '我喜欢简洁、直接的回答风格');
});
