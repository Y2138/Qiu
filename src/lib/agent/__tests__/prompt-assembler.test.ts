import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptPresetRegistry } from '@/lib/agent/presets/registry';
import { assembleSystemPrompt } from '@/lib/agent/prompt/assembler';

test('PromptPresetRegistry falls back to general-assistant', () => {
  const registry = new PromptPresetRegistry();
  const selected = registry.getMany(['not-exist']);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'general-assistant');
});

test('assembleSystemPrompt includes strategy and enabled prompt presets', () => {
  const registry = new PromptPresetRegistry();
  const selected = registry.getMany(['research-lite']);
  const prompt = assembleSystemPrompt({
    maxSteps: 4,
    promptPresets: selected,
  });

  assert.match(prompt, /Task policy:/);
  assert.match(prompt, /Preset hints:/);
  assert.match(prompt, /research-lite/);
});

test('assembleSystemPrompt includes user behavior preferences', () => {
  const registry = new PromptPresetRegistry();
  const selected = registry.getMany(['general-assistant']);
  const prompt = assembleSystemPrompt({
    maxSteps: 4,
    promptPresets: selected,
    preferences: {
      tone: 'gentle',
      responseDensity: 'detailed',
      workMode: 'plan',
    },
  });

  assert.match(prompt, /Preference layer:/);
  assert.match(prompt, /warm, supportive tone/i);
  assert.match(prompt, /Provide fuller explanations/i);
  assert.match(prompt, /outlining a short plan/i);
});

test('assembleSystemPrompt keeps core invariants ahead of task policy and preference hints', () => {
  const registry = new PromptPresetRegistry();
  const selected = registry.getMany(['research-lite']);
  const prompt = assembleSystemPrompt({
    maxSteps: 4,
    promptPresets: selected,
    preferences: {
      tone: 'gentle',
      responseDensity: 'detailed',
      workMode: 'plan',
    },
  });

  const coreIndex = prompt.indexOf('Core invariants:');
  const taskPolicyIndex = prompt.indexOf('Task policy:');
  const preferenceIndex = prompt.indexOf('Preference layer:');
  const presetIndex = prompt.indexOf('Preset hints:');

  assert.notEqual(coreIndex, -1);
  assert.notEqual(taskPolicyIndex, -1);
  assert.notEqual(preferenceIndex, -1);
  assert.notEqual(presetIndex, -1);
  assert.ok(coreIndex < taskPolicyIndex);
  assert.ok(taskPolicyIndex < preferenceIndex);
  assert.ok(preferenceIndex < presetIndex);
});
