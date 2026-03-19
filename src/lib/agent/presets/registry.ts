import type { PromptPreset } from '@/lib/agent/types';
import {
  mergeUserSettings,
  type AgentBehaviorPreferences,
  type UserDefinedPromptPreset,
} from '@/types/settings';
import localSkillsRaw from '@/lib/agent/skills/local-skills.json';

const builtinPromptPresets: PromptPreset[] = [
  {
    id: 'general-assistant',
    name: 'General Assistant',
    description: 'General-purpose assistant for day-to-day conversations.',
    riskLevel: 'low',
    source: 'builtin',
    intent: 'General assistant for broad QA and productivity tasks.',
    promptFragment:
      'You are a reliable AI assistant. Think step-by-step briefly, use tools when needed, and provide concise final answers.',
  },
  {
    id: 'research-lite',
    name: 'Research Lite',
    description: 'Fact-oriented answers with explicit uncertainty handling.',
    riskLevel: 'medium',
    source: 'builtin',
    intent: 'Research-oriented responses with source-aware reasoning.',
    promptFragment:
      'Prioritize factual answers, identify unknowns clearly, and use available tools for verification when possible.',
  },
  {
    id: 'code-helper-lite',
    name: 'Code Helper Lite',
    description: 'Engineering-oriented assistant for implementation tasks.',
    riskLevel: 'medium',
    source: 'builtin',
    intent: 'Code-focused troubleshooting and implementation guidance.',
    promptFragment:
      'Focus on actionable engineering guidance, mention assumptions, and keep outputs implementation-ready.',
  },
];

function normalizeLocalPromptPresets(input: unknown): PromptPreset[] {
  if (!Array.isArray(input)) return [];

  const items: PromptPreset[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const preset = raw as Partial<PromptPreset> & { displayName?: string };
    const name = typeof preset.name === 'string' ? preset.name : preset.displayName;
    if (!preset.id || !name || !preset.description || !preset.intent || !preset.promptFragment) {
      continue;
    }

    items.push({
      id: preset.id,
      name,
      description: preset.description,
      riskLevel: preset.riskLevel ?? 'medium',
      source: preset.source ?? 'local',
      intent: preset.intent,
      promptFragment: preset.promptFragment,
    });
  }

  return items;
}

function normalizeUserPromptPresets(input: UserDefinedPromptPreset[]): PromptPreset[] {
  return input
    .filter((preset) => preset.enabled)
    .map(parsePromptPresetMarkdown)
    .filter((preset): preset is PromptPreset => Boolean(preset));
}

export class PromptPresetRegistry {
  private readonly byId = new Map<string, PromptPreset>();

  constructor(options?: { userSettings?: unknown }) {
    for (const preset of builtinPromptPresets) {
      this.register(preset);
    }

    for (const preset of normalizeLocalPromptPresets(localSkillsRaw)) {
      this.register(preset);
    }

    const settings = mergeUserSettings(options?.userSettings);
    for (const preset of normalizeUserPromptPresets(settings.customPromptPresets)) {
      this.register(preset);
    }
  }

  getById(id: string): PromptPreset | undefined {
    return this.byId.get(id);
  }

  getMany(ids?: string[]): PromptPreset[] {
    if (!ids || ids.length === 0) {
      const fallback = this.byId.get('general-assistant');
      return fallback ? [fallback] : [];
    }

    const result: PromptPreset[] = [];
    for (const id of ids) {
      const preset = this.getById(id);
      if (preset) {
        result.push(preset);
      }
    }

    if (result.length === 0) {
      const fallback = this.byId.get('general-assistant');
      return fallback ? [fallback] : [];
    }

    return result;
  }

  getAll(): PromptPreset[] {
    return Array.from(this.byId.values());
  }

  private register(preset: PromptPreset) {
    this.byId.set(preset.id, preset);
  }
}

export function buildPreferenceLines(preferences: AgentBehaviorPreferences): string[] {
  const toneMap: Record<AgentBehaviorPreferences['tone'], string> = {
    gentle: 'Use a warm, supportive tone.',
    professional: 'Use a clear, professional tone.',
    sharp: 'Use a direct, assertive tone without being rude.',
    concise: 'Use a crisp, low-friction tone.',
  };
  const densityMap: Record<AgentBehaviorPreferences['responseDensity'], string> = {
    brief: 'Prefer short answers with only the necessary detail.',
    balanced: 'Keep answers concise first, then add helpful detail when needed.',
    detailed: 'Provide fuller explanations, concrete reasoning, and clear next steps.',
  };
  const workModeMap: Record<AgentBehaviorPreferences['workMode'], string> = {
    plan: 'Default to outlining a short plan before execution when the task has multiple steps.',
    direct: 'Default to executing directly unless planning is necessary for safety or clarity.',
  };

  return [
    `- Tone: ${toneMap[preferences.tone]}`,
    `- Response density: ${densityMap[preferences.responseDensity]}`,
    `- Working style: ${workModeMap[preferences.workMode]}`,
  ];
}

function parsePromptPresetMarkdown(preset: UserDefinedPromptPreset): PromptPreset | undefined {
  const content = preset.content.trim();
  if (!content) return undefined;

  const lines = content.split('\n').map((line) => line.trimEnd());
  const heading = lines.find((line) => /^#\s+/.test(line));
  const name = heading?.replace(/^#\s+/, '').trim() || preset.id;
  const description = extractDescription(lines);
  const promptFragment = extractPromptFragment(content);

  if (!promptFragment) {
    return undefined;
  }

  return {
    id: preset.id,
    name,
    description: description || 'User-defined prompt preset loaded from settings.',
    riskLevel: 'medium',
    source: 'custom',
    intent: `User-defined prompt preset: ${name}`,
    promptFragment,
  };
}

function extractDescription(lines: string[]): string {
  for (const line of lines) {
    if (!line || /^#/.test(line) || /^\s*[-*]/.test(line)) continue;
    return line;
  }
  return '';
}

function extractPromptFragment(content: string): string {
  const instructionsMatch = content.match(/##\s+Instructions\s*([\s\S]*)/i);
  if (instructionsMatch?.[1]?.trim()) {
    return instructionsMatch[1].trim();
  }
  return content.trim().slice(0, 4000);
}
