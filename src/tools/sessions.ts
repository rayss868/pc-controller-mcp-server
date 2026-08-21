import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { activeSessions } from "../state.js";

export function registerSessionsTools(server: McpServer) {
  //  TOOL 29: List Active Terminal Sessions
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "list_sessions",
    `List all active terminal sessions managed by this server. Shows session ID,
  creation time, and output line count. Use this to find sessions for interact_with_process.
  Sessions are created by run_command_long and remain active until the process exits.`,
    {},
    async () => {
      const sessions = Array.from(activeSessions.entries()).map(([id, s]) => ({
        id,
        createdAt: s.createdAt.toISOString(),
        outputLines: s.output.length,
        alive: !s.process.killed,
      }));
      if (sessions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No active sessions. Use run_command_long to start a background session.",
            },
          ],
        };
      }
      const text = sessions
        .map(
          (s) =>
            `Session ${s.id}: created=${s.createdAt}, lines=${s.outputLines}, alive=${s.alive}`
        )
        .join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 30: Read Process Output (with Pagination)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "read_process_output",
    `Read buffered output from a long-running session with offset and length
  pagination. Use this to inspect output without flooding the context window.
  Useful for reading build logs, checking command output, or monitoring process status.`,
    {
      session_id: z
        .string()
        .describe(
          'Session ID from list_sessions. Example: "session-1", "session-2"'
        ),
      offset: z
        .number()
        .optional()
        .describe(
          "Start reading from this line (0-based). Default: 0.\nUse offset to skip previous output and read only new lines."
        ),
      length: z
        .number()
        .optional()
        .describe(
          "Maximum lines to return. Default: 100.\nUse smaller values (10-20) for quick checks, larger (500+) for detailed output."
        ),
    },
    async ({ session_id, offset, length }) => {
      const session = activeSessions.get(session_id);
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: Session ${session_id} not found. Use list_sessions to see active sessions.`,
            },
          ],
          isError: true,
        };
      }
      const start = offset || 0;
      const len = length || 100;
      const lines = session.output.slice(start, start + len);
      const total = session.output.length;
      return {
        content: [
          {
            type: "text" as const,
            text: `Lines ${start}-${Math.min(start + len, total)} of ${total}:\n\n${lines.join("\n")}`,
          },
        ],
      };
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 31: Interact With Running Process
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "interact_with_process",
    `Send input to a running interactive process (SSH sessions, database CLIs,
  development servers). Use list_sessions to find session IDs. After sending input,
  use read_process_output to see the response.`,
    {
      session_id: z
        .string()
        .describe(
          'Session ID from list_sessions. Example: "session-1"'
        ),
      input: z
        .string()
        .describe(
          'Input to send to the process.\nExamples:\n- "ls -la" — send command to SSH session\n- "SELECT * FROM users;" — send SQL query\n- "y" — confirm a prompt\n- "npm start" — start a dev server'
        ),
    },
    async ({ session_id, input }) => {
      const session = activeSessions.get(session_id);
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: Session ${session_id} not found.`,
            },
          ],
          isError: true,
        };
      }
      if (session.process.killed) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: Session ${session_id} is no longer running.`,
            },
          ],
          isError: true,
        };
      }
      session.process.stdin?.write(input + "\n");
      return {
        content: [
          {
            type: "text" as const,
            text: `Input sent to session ${session_id}. Use read_process_output to see response.`,
          },
        ],
      };
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
}
