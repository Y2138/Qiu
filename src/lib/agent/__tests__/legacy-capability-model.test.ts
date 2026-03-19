import test from 'node:test';
import assert from 'node:assert/strict';
import { chatCompletionSchema, userSettingsSchema } from '@/lib/validations';

const baseChatRequest = {
  sessionId: 'c123456789012345678901234',
  apiKeyId: 'c123456789012345678901234',
  requestMode: 'default' as const,
  messages: [{ role: 'user', content: '请帮我保持简洁' }],
  model: 'gpt-4o',
  stream: true,
  agent: {
    enabled: true,
    promptPresetIds: ['general-assistant'],
    allowMcp: false,
    maxSteps: 4,
    memoryMode: 'session' as const,
  },
};

const baseUserSettings = {
  theme: 'system' as const,
  language: 'en-US' as const,
  fontSize: 14,
  sendOnEnter: true,
  showTimestamp: true,
  enableSound: false,
  tone: 'gentle' as const,
  responseDensity: 'balanced' as const,
  workMode: 'plan' as const,
  autoMemoryEnabled: true,
  allowMcp: true,
  agentRolePromptMarkdown: '',
  enabledPromptPresetIds: ['general-assistant'],
  customPromptPresets: [],
};

test('chatCompletionSchema rejects legacy agent fields', () => {
  const payload = {
    ...baseChatRequest,
    agent: {
      ...baseChatRequest.agent,
      skillIds: ['summary-skill'],
    },
  };

  const result = chatCompletionSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test('userSettingsSchema rejects legacy skill fields', () => {
  const payload = {
    ...baseUserSettings,
    enabledSkillIds: ['summary-skill'],
    customSkills: [
      {
        id: 'custom-skill',
        enabled: true,
        content: 'legacy skill content',
      },
    ],
  };

  const result = userSettingsSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test('chatCompletionSchema accepts minimal runtime config', () => {
  const result = chatCompletionSchema.safeParse(baseChatRequest);
  assert.equal(
    result.success,
    true,
    result.success ? undefined : JSON.stringify(result.error.format()),
  );
});
