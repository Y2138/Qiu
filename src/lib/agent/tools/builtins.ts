import { z } from 'zod';
import type { AgentTool } from '@/lib/agent/types';

const getCurrentTimeInput = z.object({
  timezone: z.string().optional(),
});

const echoInput = z.object({
  text: z.string().min(1).max(5000),
});

const readAttachmentInput = z.object({
  attachmentId: z.string().min(1),
});

const READ_ATTACHMENT_CHAR_LIMIT = 8000;

export const getCurrentTimeTool: AgentTool = {
  name: 'get_current_time',
  description: 'Get the current date/time string in a specific timezone.',
  inputSchema: getCurrentTimeInput,
  source: 'builtin',
  transport: 'local',
  riskLevel: 'low',
  enabled: true,
  async execute(input) {
    const parsed = getCurrentTimeInput.parse(input);
    const now = new Date();
    const timezone = parsed.timezone || 'Asia/Shanghai';

    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    return {
      success: true,
      output: JSON.stringify({
        timezone,
        now: formatter.format(now),
        iso: now.toISOString(),
      }),
    };
  },
};

export const echoTool: AgentTool = {
  name: 'echo_text',
  description: 'Echo text back for workflow/debugging.',
  inputSchema: echoInput,
  source: 'builtin',
  transport: 'local',
  riskLevel: 'low',
  enabled: true,
  async execute(input) {
    const parsed = echoInput.parse(input);
    return {
      success: true,
      output: parsed.text,
    };
  },
};

export const readAttachmentTool: AgentTool = {
  name: 'read_attachment',
  description: 'Read the content of an uploaded attachment in the current session using its attachmentId.',
  inputSchema: readAttachmentInput,
  source: 'builtin',
  transport: 'local',
  riskLevel: 'low',
  enabled: true,
  async execute(input, ctx) {
    const parsed = readAttachmentInput.parse(input);

    if (!ctx.readAttachment) {
      return {
        success: false,
        output: '当前运行上下文未提供附件读取能力。',
        errorType: 'execution',
      };
    }

    const result = await ctx.readAttachment(parsed.attachmentId);
    const truncated = result.content.length > READ_ATTACHMENT_CHAR_LIMIT;
    const content = truncated
      ? result.content.slice(0, READ_ATTACHMENT_CHAR_LIMIT)
      : result.content;

    return {
      success: true,
      output: JSON.stringify({
        attachmentId: result.attachmentId,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
        cached: result.cached,
        truncated,
        content,
      }),
    };
  },
};

export function getBuiltinTools(): AgentTool[] {
  return [getCurrentTimeTool, echoTool, readAttachmentTool];
}
