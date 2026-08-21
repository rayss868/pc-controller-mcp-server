import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerShellTools } from "./tools/shell.js";
import { registerFilesTools } from "./tools/files.js";
import { registerSystemTools } from "./tools/system.js";
import { registerSessionsTools } from "./tools/sessions.js";
import { registerAdminTools } from "./tools/admin.js";

const server = new McpServer({
  name: "pc-controller",
  version: "2.0.0",
});

registerShellTools(server);
registerFilesTools(server);
registerSystemTools(server);
registerSessionsTools(server);
registerAdminTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
