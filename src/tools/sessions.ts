import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as os from "os";
import { activeSessions } from "../state.js";
import {
  createSession,
  isSessionAlive,
  tailOutput,
  markSessionInput,
  stopSession,
  waitForSessionReady,
} from "../terminal.js";

export function registerSessionsTools(server: McpServer) {
  //  TOOL 29: List Active Terminal Sessions
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "list_sessions",
    `List all active terminal sessions managed by this server. Each session is a
  persistent shell (created by run_command with a session_id) or a long-running
  process that is still alive. Shows session ID, shell type, working directory,
  creation time, output line count, and alive status. Use this to discover
  available sessions before reading their output with read_process_output or
  sending input with interact_with_process. Sessions automatically track
  stdout/stderr output and are removed when the process exits.`,
    {},
    async () => {
      const sessions = Array.from(activeSessions.entries()).map(([id, s]) => ({
        id,
        shell: s.shell,
        title: s.title,
        cwd: s.cwd,
        createdAt: s.createdAt.toISOString(),
        outputLines: s.output.length,
        alive: isSessionAlive(s),
      }));
      if (sessions.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No active sessions. Open one with terminal_open(session_id=\"...\"), then send commands with run_command(session_id=\"...\").",
            },
          ],
        };
      }
      const text = sessions
        .map(
          (s) =>
            `Session ${s.id}: shell=${s.shell}, title=${s.title}, cwd=${s.cwd}, created=${s.createdAt}, lines=${s.outputLines}, alive=${s.alive}`
        )
        .join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  //  TOOL 41: Open Terminal Session (step 1 of streaming)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "terminal_open",
    `Open a VISIBLE persistent streaming terminal session (step 1 of the streaming flow).
  Step 1: call this tool to open a visible terminal window — it returns a confirmation that the
  session is ready. Step 2: send commands into it with run_command(session_id=...). The shell
  stays alive between calls (same process, same cwd, same variables) and output is streamed back
  in real time. The terminal window title can be customized with title. Each session_id is an
  independent visible terminal, so several streams run side by side. Default shell is cmd;
  choose powershell / gitbash / wsl when needed. The shell and cwd are fixed when the terminal
  opens — navigate later with 'cd' inside the session. Sessions auto-close after 10 minutes
  without any output or input; close one early with terminal_stop; list them with list_sessions.`,
    {
      session_id: z
        .string()
        .describe(
          'Any id to identify this terminal, e.g. "dev", "build", "db". A different id opens a separate terminal.'
        ),
      shell: z
        .enum(["powershell", "cmd", "gitbash", "wsl"])
        .optional()
        .describe(
          'Shell for this terminal. Default: "cmd".\n- "cmd" (default): classic Windows Command Prompt\n- "powershell": PowerShell for Windows automation (Get-Process, COM)\n- "gitbash": Git Bash for Unix utilities (ls, grep, find)\n- "wsl": Windows Subsystem for Linux'
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory when the terminal opens (absolute path). Default: user home directory."
        ),
      title: z
        .string()
        .optional()
        .describe(
          'Visible console window title. Example: "OpenAI". Default: "PC Controller - <session_id>".'
        ),
    },
    async ({ session_id, shell = "cmd", cwd, title }) => {
      const existing = activeSessions.get(session_id);
      if (existing && isSessionAlive(existing)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Session ${session_id} is already open (shell=${existing.shell}, title=${existing.title}, cwd=${existing.cwd}). Send commands with run_command(session_id="${session_id}").`,
            },
          ],
        };
      }
      const session = createSession(shell, cwd || os.homedir(), session_id, title);
      await waitForSessionReady(session);
      return {
        content: [
          {
            type: "text" as const,
            text: `Session ${session.id} OPENED: shell=${session.shell}, title=${session.title}, cwd=${session.cwd}. Ready — send commands with run_command(command=..., session_id="${session.id}").`,
          },
        ],
      };
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
  find the session ID, then send input. The input is sent as a line followed by
  a newline character. If wait_ms is given, the call blocks for fresh output
  (e.g. the response to your input) and returns it — real-time interaction
  without a separate read_process_output round trip.`,
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
      wait_ms: z
        .number()
        .optional()
        .describe(
          "Optional. Milliseconds to wait for fresh output after sending the input (default 0 = send only, no wait). Use e.g. 2000-5000 to capture the response in the same call."
        ),
    },
    async ({ session_id, input, wait_ms }) => {
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
      if (!isSessionAlive(session)) {
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
      session.pty.write(input.replace(/\r?\n/g, "\r") + "\r");
      markSessionInput(session, input);
      if (!wait_ms) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Input sent to session ${session_id}. Use read_process_output to see response.`,
            },
          ],
        };
      }
      const result = await tailOutput(session, {
        waitMs: wait_ms,
        sentLines: [input],
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Input sent to session ${session_id}. Response:\n${result.output || "(no new output)"}`,
          },
        ],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════

  //  TOOL 40: Stop Terminal Session
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "terminal_stop",
    `Stop a persistent terminal session and kill its process tree (including child
  processes like a running dev server). The session is removed and can no longer
  be used; a later run_command with the same session_id opens a fresh session.
  Use list_sessions to see which sessions are active.`,
    {
      session_id: z
        .string()
        .describe(
          'Session ID to stop. Example: "session-1"'
        ),
    },
    async ({ session_id }) => {
      if (!activeSessions.has(session_id)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Session ${session_id} not found. Use list_sessions to see active sessions.`,
            },
          ],
        };
      }
      await stopSession(session_id);
      return {
        content: [
          {
            type: "text" as const,
            text: `Session ${session_id} stopped and removed.`,
          },
        ],
      };
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
}
