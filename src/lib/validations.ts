import { z } from 'zod';

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string()
    .min(8, '密码至少 8 位')
    .max(32, '密码最多 32 位')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, '密码必须包含大小写字母和数字'),
  nickname: z.string()
    .min(2, '昵称至少 2 个字符')
    .max(50, '昵称最多 50 个字符')
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '密码不能为空'),
});

// Session schemas
export const createSessionSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200, '标题最多 200 个字符'),
  model: z.string().min(1, '模型不能为空'),
});

export const updateSessionSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200, '标题最多 200 个字符').optional(),
  model: z.string().min(1, '模型不能为空').optional(),
});

// Message schemas
export const createMessageSchema = z.object({
  sessionId: z.string().cuid('会话ID格式不正确'),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, '内容不能为空'),
  model: z.string().optional(),
});

// API Key schemas
export const createApiKeySchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称最多 100 个字符'),
  apiType: z.enum(['openai', 'anthropic']),
  baseUrl: z.string().url('API地址格式不正确'),
  apiKey: z.string().min(1, 'API Key不能为空'),
  models: z.array(z.string()).min(1, '至少选择一个模型'),
});

export const updateApiKeySchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100, '名称最多 100 个字符').optional(),
  apiType: z.enum(['openai', 'anthropic']).optional(),
  baseUrl: z.string().url('API地址格式不正确').optional(),
  apiKey: z.string().min(1, 'API Key不能为空').optional(),
  models: z.array(z.string()).min(1, '至少选择一个模型').optional(),
  isActive: z.boolean().optional(),
});

export const testApiKeySchema = z.object({
  apiType: z.enum(['openai', 'anthropic']),
  baseUrl: z.string().url('API地址格式不正确'),
  apiKey: z.string().min(1, 'API Key不能为空'),
});

// Chat schemas
export const chatCompletionSchema = z.object({
  sessionId: z.string().cuid('会话ID格式不正确').optional(),
  apiKeyId: z.string().cuid('API Key ID格式不正确').optional(),
  requestMode: z.enum(['default', 'regenerate']).optional().default('default'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).min(1, '至少需要一条消息'),
  attachments: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    size: z.number().int().nonnegative().optional(),
    extractedContent: z.string().optional(),
  })).optional().default([]),
  model: z.string().min(1, '模型不能为空'),
  stream: z.boolean().optional().default(true),
  agent: z.object({
    enabled: z.boolean().optional().default(false),
    promptPresetIds: z.array(z.string()).optional().default([]),
    allowMcp: z.boolean().optional().default(false),
    maxSteps: z.number().int().min(1).max(8).optional().default(4),
    resumeFromCheckpointId: z.string().min(1).optional(),
    memoryMode: z.enum(['off', 'session', 'session+user']).optional().default('session'),
    retryPolicy: z.object({
      toolMaxRetry: z.number().int().min(0).max(3).optional().default(1),
    }).optional(),
  }).strict().optional(),
}).strict();

export const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['zh-CN', 'en-US']),
  fontSize: z.number().int().min(12).max(20),
  sendOnEnter: z.boolean(),
  showTimestamp: z.boolean(),
  enableSound: z.boolean(),
  tone: z.enum(['gentle', 'professional', 'sharp', 'concise']),
  responseDensity: z.enum(['brief', 'balanced', 'detailed']),
  workMode: z.enum(['plan', 'direct']),
  autoMemoryEnabled: z.boolean(),
  allowMcp: z.boolean().optional(),
  agentRolePromptMarkdown: z.string().max(6000),
  enabledPromptPresetIds: z.array(z.string().trim().min(1).max(64)).max(12).optional(),
  customPromptPresets: z.array(
    z.object({
      id: z.string().trim().min(2).max(64).regex(/^[a-z0-9-]+$/, 'Skill ID 只能包含小写字母、数字和短横线'),
      enabled: z.boolean(),
      content: z.string().trim().min(1, 'SKILL.md 内容不能为空').max(12000, 'SKILL.md 内容过长'),
    }),
  ).max(12).optional(),
}).strict();

// User schemas
export const updateUserSchema = z.object({
  name: z.string().min(2, '名称至少 2 个字符').max(50, '名称最多 50 个字符').optional(),
  settings: userSettingsSchema.partial().optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, '当前密码不能为空'),
  newPassword: z.string()
    .min(8, '新密码至少 8 位')
    .max(32, '新密码最多 32 位')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, '新密码必须包含大小写字母和数字'),
});

export const agentMemoryPatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('delete'),
    id: z.string().min(1, '记忆条目 ID 不能为空'),
  }),
  z.object({
    action: z.literal('add'),
    kind: z.enum(['preference', 'project_context']),
    content: z.string().trim().min(1, '记忆内容不能为空').max(240, '记忆内容过长'),
  }),
  z.object({
    action: z.literal('clear'),
  }),
]);

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type TestApiKeyInput = z.infer<typeof testApiKeySchema>;
export type ChatCompletionInput = z.infer<typeof chatCompletionSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type AgentMemoryPatchInput = z.infer<typeof agentMemoryPatchSchema>;
