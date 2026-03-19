import type { LLMMessage } from '@/lib/llm/adapters/base';
import type { AgentUserMemoryEntry } from '@/lib/agent/types';

interface UserSettingsWithMemory {
  agentMemory?: {
    entries?: AgentUserMemoryEntry[];
  };
}

const MAX_USER_MEMORY_ENTRIES = 10;

export function readUserMemoryEntries(settings: unknown): AgentUserMemoryEntry[] {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return [];
  }

  const raw = (settings as UserSettingsWithMemory).agentMemory?.entries;
  if (!Array.isArray(raw)) return [];

  return raw.filter(isValidUserMemoryEntry);
}

export function writeUserMemoryEntries(
  settings: unknown,
  entries: AgentUserMemoryEntry[],
): Record<string, unknown> {
  const base = isRecord(settings) ? { ...settings } : {};
  const existingAgentMemory = isRecord(base.agentMemory) ? base.agentMemory : {};

  return {
    ...base,
    agentMemory: {
      ...existingAgentMemory,
      entries: entries.slice(0, MAX_USER_MEMORY_ENTRIES),
    },
  };
}

export function deriveUserMemoryEntries(messages: LLMMessage[]): AgentUserMemoryEntry[] {
  const entries: AgentUserMemoryEntry[] = [];

  for (const message of messages) {
    if (message.role !== 'user') continue;
    const content = message.content.trim();

    const rememberPayload = extractRememberPayload(content);
    if (rememberPayload) {
      entries.push({
        id: createMemoryId(rememberPayload),
        scope: 'user',
        kind: 'preference',
        content: rememberPayload,
        source: content.slice(0, 200),
        updatedAt: Date.now(),
      });
    }

    const projectPayload = extractProjectPayload(content);
    if (projectPayload) {
      entries.push({
        id: createMemoryId(projectPayload),
        scope: 'user',
        kind: 'project_context',
        content: projectPayload,
        source: content.slice(0, 200),
        updatedAt: Date.now(),
      });
    }
  }

  return dedupeUserMemoryEntries(entries).slice(0, MAX_USER_MEMORY_ENTRIES);
}

export function createManualMemoryEntry(
  kind: AgentUserMemoryEntry['kind'],
  content: string,
): AgentUserMemoryEntry | undefined {
  const sanitized = sanitizeManualMemoryContent(content);
  if (!sanitized) {
    return undefined;
  }

  return {
    id: createMemoryId(`${kind}:${sanitized}`),
    scope: 'user',
    kind,
    content: sanitized,
    source: 'manual-settings',
    updatedAt: Date.now(),
  };
}

export function mergeUserMemoryEntries(
  existing: AgentUserMemoryEntry[],
  incoming: AgentUserMemoryEntry[],
): AgentUserMemoryEntry[] {
  const merged = new Map<string, AgentUserMemoryEntry>();

  for (const item of [...existing, ...incoming]) {
    const key = `${item.kind}:${item.content.toLowerCase()}`;
    const previous = merged.get(key);
    if (!previous || previous.updatedAt < item.updatedAt) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_USER_MEMORY_ENTRIES);
}

function extractRememberPayload(content: string): string | null {
  const patterns = [
    /(?:请)?记住[:：]?\s*(.+)$/i,
    /remember(?: that)?[:：]?\s*(.+)$/i,
    /我的偏好是[:：]?\s*(.+)$/i,
    /i prefer[:：]?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return sanitizeMemoryContent(match[1], 'preference', content);
    }
  }

  return null;
}

function extractProjectPayload(content: string): string | null {
  const patterns = [
    /我的项目(?:是|叫|目前是)?[:：]?\s*(.+)$/i,
    /当前项目(?:是|叫)?[:：]?\s*(.+)$/i,
    /this project(?: is| uses)?[:：]?\s*(.+)$/i,
    /our project(?: is| uses)?[:：]?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return sanitizeMemoryContent(match[1], 'project_context', content);
    }
  }

  return null;
}

function sanitizeMemoryContent(
  value: string,
  kind: AgentUserMemoryEntry['kind'],
  source: string,
): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (containsSensitiveContent(normalized) || containsSensitiveContent(source)) {
    return null;
  }
  if (looksLikeEphemeralTask(normalized) || looksLikeEphemeralTask(source)) {
    return null;
  }
  if (kind === 'preference' && !looksLikeStablePreference(normalized)) {
    return null;
  }
  return normalized.length <= 240 ? normalized : normalized.slice(0, 240);
}

function sanitizeManualMemoryContent(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (containsSensitiveContent(normalized)) {
    return null;
  }

  return normalized.length <= 240 ? normalized : normalized.slice(0, 240);
}

function dedupeUserMemoryEntries(entries: AgentUserMemoryEntry[]): AgentUserMemoryEntry[] {
  return mergeUserMemoryEntries([], entries);
}

function createMemoryId(content: string): string {
  return `um_${Buffer.from(content).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
}

function containsSensitiveContent(value: string): boolean {
  return /(password|passwd|secret|token|api[_\s-]?key|credential|private key|身份证|社保|银行卡|信用卡|密码|密钥|令牌|验证码)/i.test(value);
}

function looksLikeEphemeralTask(value: string): boolean {
  return /(今天|明天|后天|本周|下周|稍后|待会|今晚|下午|上午|\d{1,2}[:点]\d{0,2}|deadline|due|tomorrow|today|next week|meeting|会议|提醒|待办|todo|这次|本次|当前任务|临时|一次性)/i.test(value);
}

function looksLikeStablePreference(value: string): boolean {
  return /(喜欢|偏好|习惯|通常|请用|尽量|称呼我|叫我|风格|语气|简洁|详细|专业|英文|中文|prefer|usually|always|tone|style|call me|respond in)/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidUserMemoryEntry(value: unknown): value is AgentUserMemoryEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.scope === 'user' &&
    (value.kind === 'preference' || value.kind === 'project_context') &&
    typeof value.content === 'string' &&
    typeof value.source === 'string' &&
    typeof value.updatedAt === 'number'
  );
}
