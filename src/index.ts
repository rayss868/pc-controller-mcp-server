import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerShellTools } from "./tools/shell.js";
import { registerFilesTools } from "./tools/files.js";
import { registerSystemTools } from "./tools/system.js";
import { registerSessionsTools } from "./tools/sessions.js";
import { registerAdminTools } from "./tools/admin.js";
import { recordToolCall } from "./state.js";

const server = new McpServer({
  name: "pc-controller",
  version: "2.7.0",
});

// Wrap server.tool so every registered tool call is recorded for
// get_usage_stats / get_recent_tool_calls without touching each handler.
const tool = server.tool.bind(server) as any;
(server as any).tool = (...args: any[]) => {
  const toolName = args[0] as string;
  const handlerIndex = args.length - 1;
  if (typeof args[handlerIndex] === "function") {
    const handler = args[handlerIndex];
    args[handlerIndex] = async (...hArgs: any[]) => {
      const start = Date.now();
      let success = false;
      let result: any;
      try {
        result = await handler(...hArgs);
        success = !(result && result.isError === true);
        return result;
      } finally {
        recordToolCall(toolName, hArgs[0], success, Date.now() - start);
      }
    };
  }
  return tool(...args) as any;
};

registerShellTools(server);
registerFilesTools(server);
registerSystemTools(server);
registerSessionsTools(server);
registerAdminTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
