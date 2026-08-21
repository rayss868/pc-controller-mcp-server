import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { activeSessions } from "../state.js";

export function registerSessionsTools(server: McpServer) {
  //  TOOL 29: List Active Terminal Sessions
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "list_sessions",
    `List all active terminal sessions managed by this server. Each session represents
  a long-running process (created by run_command_long or run_command) that is still
  alive. Shows session ID, creation time, output line count, and alive status.
  Use this to discover available sessions before reading their output with
  read_process_output or sending input with interact_with_process. Sessions
  automatically track stdout/stderr output and are removed when the process exits.`,
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
    `Read buffered output from a long-running terminal session with pagination.
  Supports offset and length parameters to read specific ranges of output lines.
  Use this to inspect build logs, check command output, or monitor process status
  without flooding the context window with too much data. First call list_sessions
  to find the session ID, then use offset=0 to read from the beginning, or set
  a higher offset to skip past output you've already seen.`,
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
    `Send input/commands to a running interactive terminal session. Use this to
  interact with SSH sessions (send commands to remote servers), database CLIs
  (run SQL queries in PostgreSQL, MySQL, etc.), development servers (send test
  requests), or any process that reads from stdin. First call list_sessions to
  find the session ID, then send input. After sending, use read_process_output
  to see the response. The input is sent as a line followed by a newline character.`,
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
