import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupChatLogs } from '@/lib/chat-logs';

test('cleanupChatLogs deletes only records older than the retention threshold', async () => {
  let deletedBefore: Date | undefined;

  const deletedCount = await cleanupChatLogs({
    repository: {
      async save() {
        throw new Error('not used');
      },
      async list() {
        return { items: [], nextCursor: null };
      },
      async deleteOlderThan(before: Date) {
        deletedBefore = before;
        return 7;
      },
    },
    retentionDays: 7,
    now: new Date('2026-03-19T12:00:00.000Z'),
  });

  assert.equal(deletedCount.deletedCount, 7);
  assert.equal(deletedBefore?.toISOString(), '2026-03-12T12:00:00.000Z');
});

test('cleanupChatLogs is stable across repeated executions', async () => {
  let callCount = 0;

  const repository = {
    async save() {
      throw new Error('not used');
    },
    async list() {
      return { items: [], nextCursor: null };
    },
    async deleteOlderThan() {
      callCount += 1;
      return callCount === 1 ? 3 : 0;
    },
  };

  const first = await cleanupChatLogs({
    repository,
    retentionDays: 7,
    now: new Date('2026-03-19T12:00:00.000Z'),
  });
  const second = await cleanupChatLogs({
    repository,
    retentionDays: 7,
    now: new Date('2026-03-19T12:00:00.000Z'),
  });

  assert.equal(first.deletedCount, 3);
  assert.equal(second.deletedCount, 0);
});
