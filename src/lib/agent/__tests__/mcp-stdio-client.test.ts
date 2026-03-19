import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandConfig } from '@/lib/agent/mcp/stdio-client';

test('parseCommandConfig keeps explicit args untouched', () => {
  const parsed = parseCommandConfig({
    command: 'npx',
    args: ['@playwright/mcp@latest', '--browser', 'chromium'],
  });

  assert.equal(parsed.command, 'npx');
  assert.deepEqual(parsed.args, ['@playwright/mcp@latest', '--browser', 'chromium']);
});

test('parseCommandConfig splits inline command strings for MCP launchers', () => {
  const parsed = parseCommandConfig({
    command: 'npx @playwright/mcp@latest --browser chromium',
  });

  assert.equal(parsed.command, 'npx');
  assert.deepEqual(parsed.args, ['@playwright/mcp@latest', '--browser', 'chromium']);
});

test('parseCommandConfig preserves quoted arguments', () => {
  const parsed = parseCommandConfig({
    command: 'node -e "console.log(\'playwright mcp\')"',
  });

  assert.equal(parsed.command, 'node');
  assert.deepEqual(parsed.args, ['-e', "console.log('playwright mcp')"]);
});

test('parseCommandConfig rejects malformed command strings', () => {
  assert.throws(
    () =>
      parseCommandConfig({
        command: 'npx "@playwright/mcp@latest --browser chromium',
      }),
    /unmatched quote/,
  );
});
