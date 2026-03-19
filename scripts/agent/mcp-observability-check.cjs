/* eslint-disable @typescript-eslint/no-require-imports */
const { MCPGateway } = require('../../src/lib/agent/mcp/gateway');
const { MCPStdioClient } = require('../../src/lib/agent/mcp/stdio-client');

const originalConnect = MCPStdioClient.prototype.connect;
const originalListTools = MCPStdioClient.prototype.listTools;
const originalCallTool = MCPStdioClient.prototype.callTool;
const originalClose = MCPStdioClient.prototype.close;

function restore() {
  MCPStdioClient.prototype.connect = originalConnect;
  MCPStdioClient.prototype.listTools = originalListTools;
  MCPStdioClient.prototype.callTool = originalCallTool;
  MCPStdioClient.prototype.close = originalClose;
  delete process.env.MCP_SERVERS_JSON;
}

async function runScenario(name, setup, verify) {
  restore();
  await setup();

  const gateway = new MCPGateway();
  const tools = await gateway.getToolsFromEnv();
  await verify(gateway, tools);
  await gateway.closeAll().catch(() => {});

  console.log(`PASS: ${name}`);
}

async function main() {
  try {
    await runScenario(
      'success call',
      async () => {
        process.env.MCP_SERVERS_JSON = JSON.stringify({ demo: { command: 'fake' } });
        MCPStdioClient.prototype.connect = async () => {};
        MCPStdioClient.prototype.listTools = async () => [{ name: 'echo' }];
        MCPStdioClient.prototype.callTool = async () => 'ok';
        MCPStdioClient.prototype.close = async () => {};
      },
      async (manager, tools) => {
        if (tools.length !== 1) throw new Error('expected one tool');
        const result = await tools[0].execute({}, {});
        if (!result.success) throw new Error('expected success');

        const state = manager.getDiagnostics()[0];
        if (state.state !== 'ready') throw new Error('expected ready state');
      },
    );

    await runScenario(
      'parameter-like execution error',
      async () => {
        process.env.MCP_SERVERS_JSON = JSON.stringify({ demo: { command: 'fake' } });
        MCPStdioClient.prototype.connect = async () => {};
        MCPStdioClient.prototype.listTools = async () => [{ name: 'echo' }];
        MCPStdioClient.prototype.callTool = async () => {
          throw new Error('invalid input parameter');
        };
        MCPStdioClient.prototype.close = async () => {};
      },
      async (manager, tools) => {
        const result = await tools[0].execute({}, {});
        if (result.success) throw new Error('expected failure');

        const state = manager.getDiagnostics()[0];
        if (state.metrics.callFailureCount < 1) throw new Error('expected failure count');
      },
    );

    await runScenario(
      'timeout',
      async () => {
        process.env.MCP_SERVERS_JSON = JSON.stringify({ demo: { command: 'fake' } });
        MCPStdioClient.prototype.connect = async () => {};
        MCPStdioClient.prototype.listTools = async () => [{ name: 'echo' }];
        MCPStdioClient.prototype.callTool = async () => {
          throw new Error('request timeout while calling tool');
        };
        MCPStdioClient.prototype.close = async () => {};
      },
      async (manager, tools) => {
        const result = await tools[0].execute({}, {});
        if (result.errorType !== 'timeout') throw new Error('expected timeout classification');

        const state = manager.getDiagnostics()[0];
        if (state.metrics.timeoutCount < 1) throw new Error('expected timeout count');
      },
    );

    await runScenario(
      'server disconnect during bootstrap',
      async () => {
        process.env.MCP_SERVERS_JSON = JSON.stringify({ demo: { command: 'fake' } });
        MCPStdioClient.prototype.connect = async () => {
          throw new Error('process exited unexpectedly');
        };
      },
      async (manager, tools) => {
        if (tools.length !== 0) throw new Error('expected no tools');
        const state = manager.getDiagnostics()[0];
        if (state.state !== 'degraded') throw new Error('expected degraded state');
      },
    );

    console.log('\nChecklist complete.');
  } catch (error) {
    console.error('FAILED:', error.message || error);
    process.exitCode = 1;
  } finally {
    restore();
  }
}

main();
