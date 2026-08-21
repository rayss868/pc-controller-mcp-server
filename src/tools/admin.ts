import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { execAsync } from "../helpers.js";
import { config, usageStats, recentToolCalls } from "../state.js";

export function registerAdminTools(server: McpServer) {
  //  TOOL 32: Get Configuration
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "config_get",
    `Retrieve the complete runtime configuration of the PC Controller MCP server.
  Returns the current values for all configurable settings: blockedCommands (list of
  dangerous commands that are tracked), defaultShell (which shell is used for run_command:
  powershell, gitbash, or wsl), fileReadLineLimit (max lines returned by file_read,
  default 2000), and fileWriteLineLimit (max lines for file_write, default 2000).
  Use this tool before calling config_set to see what values are currently active, or
  to diagnose why a command might behave differently than expected (e.g., wrong shell).`,
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(config, null, 2),
          },
        ],
      };
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 33: Set Configuration Value
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "config_set",
    `Update a server configuration value at runtime. Changes take effect immediately
  for all subsequent tool calls — no restart required. Use config_get first to see
  the current settings before modifying them. Supported keys: "defaultShell" (change
  between powershell/gitbash/wsl), "blockedCommands" (set list of blocked command
  patterns as JSON array string), "fileReadLineLimit" (adjust max lines for file_read),
  "fileWriteLineLimit" (adjust max lines for file_write). For array values like
  blockedCommands, pass a JSON-serialized array string.`,
    {
      key: z
        .string()
        .describe(
          'Configuration key to update. Options:\n- "defaultShell" — shell for run_command (powershell/bash/wsl)\n- "blockedCommands" — array of blocked command strings\n- "fileReadLineLimit" — max lines for file_read\n- "fileWriteLineLimit" — max lines for file_write'
        ),
      value: z
        .string()
        .describe(
          'New value for the key. Examples:\n- defaultShell: "bash"\n- blockedCommands: \'["rm -rf", "format"]\' (JSON array string)\n- fileReadLineLimit: "5000"'
        ),
    },
    async ({ key, value }) => {
      if (!(key in config)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: Unknown key "${key}". Valid keys: ${Object.keys(config).join(", ")}`,
            },
          ],
          isError: true,
        };
      }
      try {
        if (key === "blockedCommands") {
          (config as any)[key] = JSON.parse(value);
        } else if (key === "fileReadLineLimit" || key === "fileWriteLineLimit") {
          (config as any)[key] = parseInt(value, 10);
        } else {
          (config as any)[key] = value;
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Config updated: ${key} = ${JSON.stringify((config as any)[key])}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text" as const, text: `ERROR: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 34: Get Usage Statistics
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "get_usage_stats",
    `Retrieve usage statistics for the current server session. Shows per-tool call
  counts, error counts, and last-used timestamps, sorted by total calls descending.
  Use this to audit which tools have been called during the session, identify tools
  with high error rates that may need investigation, or understand usage patterns.
  Statistics are reset when the server restarts. The response includes total call
  count, error count, and lastUsed timestamp for each tool that has been invoked.`,
    {},
    async () => {
      const stats = Object.entries(usageStats)
        .sort((a, b) => b[1].count - a[1].count)
        .map(
          ([tool, s]) =>
            `${tool}: ${s.count} calls, ${s.errors} errors, last: ${s.lastUsed.toISOString()}`
        );
      return {
        content: [
          {
            type: "text" as const,
            text:
              stats.length > 0
                ? `Usage Statistics:\n${stats.join("\n")}`
                : "No tool calls recorded yet.",
          },
        ],
      };
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 35: Get Recent Tool Calls
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "get_recent_tool_calls",
    `Retrieve the most recent tool calls with full details: tool name, serialized
  arguments, success/failure status, and execution duration in milliseconds.
  Returns results in reverse chronological order (newest first). Use this to
  debug failed tool calls (see what arguments caused the error), recover context
  after a conversation interruption, audit what tools were recently invoked, or
  measure tool performance. The default limit is 20 calls; pass a custom limit
  to retrieve more or fewer entries.`,
    {
      limit: z
        .number()
        .optional()
        .describe(
          'Number of recent calls to return (newest first). Default: 20.\nExamples:\n- omitted or 20 — last 20 calls\n- 5 — last 5 calls\n- 50 — last 50 calls'
        ),
    },
    async ({ limit }) => {
      const n = limit || 20;
      const calls = recentToolCalls.slice(-n).reverse();
      if (calls.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No tool calls recorded yet.",
            },
          ],
        };
      }
      const text = calls
        .map(
          (c) =>
            `[${c.timestamp.toISOString()}] ${c.tool} (${c.success ? "ok" : "FAIL"}, ${c.duration}ms) args=${JSON.stringify(c.args).substring(0, 200)}`
        )
        .join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 36: Read Content from URL
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "read_url",
    `Fetch content from a URL and return it as plain text. Supports HTTP and HTTPS
  URLs. Content is truncated at 50KB to keep responses manageable. Use this tool
  to read online documentation, fetch JSON API responses, download raw file contents
  (e.g., from GitHub raw URLs), inspect HTML pages, or access any web-accessible
  resource during development. For localhost URLs, the server running on this PC
  can be accessed directly. Set a longer timeout for slow-responding endpoints.`,
    {
      url: z
        .string()
        .describe(
          'URL to fetch. Must start with http:// or https://.\nExamples:\n- "https://api.github.com/repos/user/repo"\n- "https://raw.githubusercontent.com/user/repo/main/README.md"\n- "http://localhost:3000/api/data"'
        ),
      timeout: z
        .number()
        .optional()
        .describe(
          'Request timeout in seconds. Default: 30.\nExamples:\n- 10 — quick API call\n- 60 — slow/large page\n- omitted — 30 seconds'
        ),
    },
    async ({ url, timeout }) => {
      try {
        const ps = `Invoke-WebRequest -Uri '${url.replace(/'/g, "''")}' -UseBasicParsing -TimeoutSec ${timeout || 30} | Select-Object -ExpandProperty Content`;
        const { stdout } = await execAsync(
          `powershell.exe -Command "${ps}"`,
          { timeout: (timeout || 30) * 1000 + 5000, maxBuffer: 1024 * 1024 * 5 }
        );
        const content = stdout.trim();
        return {
          content: [
            {
              type: "text" as const,
              text: content.length > 50000
                ? content.substring(0, 50000) + "\n\n... (truncated at 50KB)"
                : content,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text" as const, text: `ERROR: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════

  //  TOOL 38: Read Skill Documentation
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "read_skill_docs",
    `Read the PC Controller skill documentation files. This tool provides access to the
complete AI skill reference — a structured guide describing all 38 available tools,
their parameters, usage examples, workflows, and safety rules. Use this tool when you
need to understand what capabilities the PC Controller MCP server offers, how to invoke
specific tools correctly, or what workflows are available for common tasks. The skill
documentation is the authoritative source for tool usage and is updated alongside code
changes. Returns the full content of the requested skill file as markdown text.`,
    {
      file: z
        .enum(["SKILL.md", "reference/tools.md", "all"])
        .describe(
          'Which skill documentation file to read:\n- "SKILL.md" — Main skill overview with tool summaries, workflow examples, and safety rules\n- "reference/tools.md" — Complete parameter reference for all 37 tools with detailed examples\n- "all" — Returns both files concatenated (full documentation)'
        ),
    },
    async ({ file }) => {
      try {
        // Find project root by looking for package.json
        let dir = process.cwd();
        let root = "";
        for (let i = 0; i < 5; i++) {
          try {
            await fs.access(path.join(dir, "package.json"));
            root = dir;
            break;
          } catch {
            dir = path.dirname(dir);
          }
        }
        if (!root) {
          // Fallback: try relative to the script location
          root = path.resolve(__dirname, "..", "..");
        }

        const skillDir = path.join(root, "skill");
        const files: string[] = [];
        const contents: string[] = [];

        if (file === "SKILL.md" || file === "all") {
          files.push("SKILL.md");
        }
        if (file === "reference/tools.md" || file === "all") {
          files.push("reference/tools.md");
        }

        for (const f of files) {
          const filePath = path.join(skillDir, f);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            contents.push(`=== ${f} ===\n${content}`);
          } catch {
            contents.push(`=== ${f} ===\nERROR: File not found at ${filePath}`);
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: contents.join("\n\n"),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            { type: "text" as const, text: `ERROR: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
}
