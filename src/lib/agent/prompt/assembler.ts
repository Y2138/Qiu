import type { AgentAttachmentReference, PromptPreset } from '@/lib/agent/types';
import type { AgentBehaviorPreferences } from '@/types/settings';
import { buildPreferenceLines } from '@/lib/agent/presets/registry';

export function composeCoreInvariantPrompt(maxSteps: number): string[] {
  return [
    'Core invariants:',
    'You are Qiu, a personal AI assistant.',
    'Follow an explicit plan -> act -> observe loop with bounded steps.',
    `Do not exceed ${maxSteps} tool steps.`,
    'If a tool fails, explain the failure clearly and stop guessing.',
    'Respect tool permissions and keep execution grounded in available evidence.',
  ];
}

export function composeTaskPolicyPrompt(): string[] {
  return [
    'Task policy:',
    '- Keep answers concise and actionable.',
    '- Call tools only when they can reduce uncertainty.',
    '- Respect the allowed tools boundary strictly.',
    '- If evidence is insufficient, explicitly say what is missing.',
    '- Prefer checkpoint-safe progress over speculative answers.',
  ];
}

export function composePreferenceLayerPrompt(preferences?: AgentBehaviorPreferences): string[] {
  if (!preferences) return [];
  const preferenceLines = buildPreferenceLines(preferences);
  const rolePrompt = preferences.rolePromptMarkdown?.trim();

  return [
    'Preference layer:',
    ...preferenceLines,
    ...(rolePrompt ? ['Role configuration (markdown):', rolePrompt] : []),
  ];
}

export function composePresetHintPrompt(promptPresets: PromptPreset[]): string[] {
  if (promptPresets.length === 0) return [];
  return [
    'Preset hints:',
    ...promptPresets.map((preset) => `- [${preset.id}] ${preset.promptFragment}`),
  ];
}

export function composeAttachmentPrompt(attachments?: AgentAttachmentReference[]): string[] {
  if (!attachments?.length) return [];

  return [
    'Available attachments in the current session:',
    ...attachments.map((attachment) =>
      `- attachmentId=${attachment.id}; name=${attachment.name}; mimeType=${attachment.mimeType}; size=${attachment.size}`,
    ),
    'Use the read_attachment tool with an attachmentId when you need to inspect file content.',
    'Do not assume attachment contents without calling the tool.',
  ];
}

export function assembleSystemPrompt(input: {
  maxSteps: number;
  promptPresets: PromptPreset[];
  preferences?: AgentBehaviorPreferences;
  attachments?: AgentAttachmentReference[];
}): string {
  return [
    ...composeCoreInvariantPrompt(input.maxSteps),
    ...composeTaskPolicyPrompt(),
    ...composePreferenceLayerPrompt(input.preferences),
    ...composeAttachmentPrompt(input.attachments),
    ...composePresetHintPrompt(input.promptPresets),
  ].join('\n');
}
