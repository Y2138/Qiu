import { NextRequest } from 'next/server';
import { getCurrentUserServer } from '@/lib/server-auth';
import { successResponse, unauthorizedResponse, forbiddenResponse } from '@/lib/api';
import { mcpGateway } from '@/lib/agent/mcp/gateway';

interface MpcDiagnosticsRouteDeps {
  getCurrentUserServer: typeof getCurrentUserServer;
  getDiagnostics: () => ReturnType<typeof mcpGateway.getDiagnostics>;
}

const defaultDeps: MpcDiagnosticsRouteDeps = {
  getCurrentUserServer,
  getDiagnostics: () => mcpGateway.getDiagnostics(),
};

export function createMcpDiagnosticsHandler(deps: MpcDiagnosticsRouteDeps = defaultDeps) {
  return async function GET(request: NextRequest) {
    const user = await deps.getCurrentUserServer();
    if (!user) {
      return unauthorizedResponse('未登录');
    }

    const requiredToken = process.env.AGENT_DIAGNOSTICS_TOKEN;
    const providedToken = request.headers.get('x-agent-diagnostics-token');

    if (!requiredToken || providedToken !== requiredToken) {
      return forbiddenResponse('诊断接口仅允许服务端访问');
    }

    return successResponse({
      diagnostics: deps.getDiagnostics(),
    });
  };
}

export const GET = createMcpDiagnosticsHandler();
