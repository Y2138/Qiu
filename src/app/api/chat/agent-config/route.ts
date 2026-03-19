import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserServer } from '@/lib/server-auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';
import { PromptPresetRegistry } from '@/lib/agent/presets/registry';
import { getBuiltinTools } from '@/lib/agent/tools/builtins';
import { mcpGateway } from '@/lib/agent/mcp/gateway';

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const userProfile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { settings: true },
    });
    const promptPresetRegistry = new PromptPresetRegistry({ userSettings: userProfile?.settings });
    const promptPresets = promptPresetRegistry.getAll().map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      riskLevel: preset.riskLevel,
      source: preset.source ?? 'builtin',
    }));
    const localTools = getBuiltinTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: tool.source,
      transport: tool.transport,
      riskLevel: tool.riskLevel,
    }));

    const mcpTools = await mcpGateway.getToolsFromEnv().catch(() => []);
    const mcpToolList = mcpTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: tool.source,
      transport: tool.transport,
      riskLevel: tool.riskLevel,
    }));

    return successResponse({
      promptPresets,
      tools: [...localTools, ...mcpToolList],
    });
  } catch (error) {
    console.error('获取 Agent 配置失败:', error);
    return successResponse({
      promptPresets: [],
      tools: [],
    });
  }
}
