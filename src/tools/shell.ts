import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spawn } from "child_process";
import * as os from "os";
import { execAsync, buildShellCommand, isCommandBlocked } from "../helpers.js";
import { getSession, sendCommandAndWait } from "../terminal.js";

export function registerShellTools(server: McpServer) {
  //  TOOL 1: Execute Shell Command
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "run_command",
    `Execute a shell command on this Windows PC and return its output.
  This is the UNIVERSAL tool of this server: anything PowerShell, Git Bash, or WSL can do can be
  done here — document parsing (Word/Excel COM automation, pdftotext), registry queries, Windows
  services, network diagnostics, environment variables, scheduled tasks, WMI, and any CLI program.
  There is no task that strictly requires another tool; dedicated tools (file_read, screen_capture,
  clipboard_get, etc.) are conveniences — use them ONLY when clearly simpler than the equivalent
  command, otherwise run a command.
  Common uses: package installation (npm, pip), compilation, git operations, build scripts,
  file management via CLI, network diagnostics (ping, tracert, ipconfig).
  Default shell is cmd (classic Command Prompt) with a timeout of 30 seconds. Returns both STDOUT and STDERR.
  The 'shell' parameter switches to PowerShell (Get-Process, COM automation), Git Bash, or WSL
  for Unix-style commands (ls, grep, bash scripts) when needed.
  Examples:
  - "Get-Process | Sort-Object CPU -Descending | Select-Object -First 5"
  - "$w = New-Object -ComObject Word.Application; $d = $w.Documents.Open('C:\\docs\\file.docx'); $d.Content.Text; $d.Close(); $w.Quit()"  # read DOCX text
  - "python -c \\"import pypdf,sys; print('\\\\n'.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))\\" C:\\docs\\file.pdf"  # read PDF text

  STREAMING MODE (session_id): Two steps. STEP 1 — open a persistent terminal with the
  terminal_open tool (e.g. terminal_open(session_id="dev")). STEP 2 — pass that same
  session_id here to stream commands into the already-open terminal in real time: every
  call with the SAME session_id runs inside that same shell — state (cwd, environment,
  variables) is kept between calls, and the shell is NOT reopened for each command. Each
  session_id is an independent terminal, so you can run several streams side by side.
  Output is streamed back as it is produced; the call returns when the command finishes,
  or after a quiet period / wait_ms if it keeps running (e.g. a dev server — the session
  stays alive). The session must already be open (terminal_open); otherwise this errors.
  - Send an EMPTY command with wait_ms to simply wait for and fetch new output from a
    still-running process.
  - List sessions with list_sessions; close one with terminal_stop.
  WARNING: Dangerous commands will still execute — make sure the command is correct before running.`,
    {
      command: z
        .string()
        .describe(
          'The shell command to execute. Examples: "dir C:\\Users", "Get-Process", "npm install", "git status", "ipconfig /all", "ls -la", "Get-Service | Where-Object {$_.Status -eq \'Running\'}", "sfc /scannow"'
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory where the command runs. Use absolute path. Default: user home directory (C:\\Users\\<username>). Example: C:\\Users\\rayss\\Projects\\my-app"
        ),
      timeout: z
        .number()
        .optional()
        .describe(
          "Execution timeout in milliseconds. Default: 30000 (30 seconds). Increase for long-running commands: npm install (60000), builds (120000), large git operations (180000)."
        ),
      shell: z
        .enum(["powershell", "cmd", "gitbash", "wsl"])
        .optional()
        .describe(
          'Shell to run the command in:\n- "cmd" (default): classic Windows Command Prompt — fast and simple\n- "powershell": Native Windows PowerShell, best for Windows automation (Get-Process, Get-Service, registry, COM)\n- "gitbash": Git Bash (C:\\Program Files\\Git\\bin\\bash.exe), use for Unix utilities (ls, grep, find, cat, sed, awk)\n- "wsl": Windows Subsystem for Linux, use for real Linux commands (apt, systemctl, docker on WSL, bash scripts)'
        ),
      session_id: z
        .string()
        .optional()
        .describe(
          'STREAMING MODE. Pass a session id (any string, e.g. "dev-server") to run the command inside a PERSISTENT terminal session instead of spawning a new shell. The first call with this id opens the session; all later calls with the same id reuse it — same shell, same cwd, same environment. Use a different id to open an additional terminal side by side. Output streams back in real time. Default (absent): one-shot execution.'
        ),
      wait_ms: z
        .number()
        .optional()
        .describe(
          "STREAMING MODE ONLY. How long to wait for output before returning, in milliseconds. Default 30000. If the command finishes earlier it returns immediately. Pass an empty command with a wait_ms (e.g. 3000) to just block and fetch new output from a still-running process."
        ),
    },
    async ({ command, cwd, timeout, shell = "cmd", session_id, wait_ms }) => {
      const blocked = isCommandBlocked(command);
      if (blocked) {
        return {
          content: [
            {
              type: "text" as const,
              text: `BLOCKED: command contains a blocked pattern "${
                blocked
              }" and was not executed. See config_get for the blocked commands list.`,
            },
          ],
          isError: true,
        };
      }
      if (session_id) {
        const session = getSession(session_id);
        if (!session) {
          return {
            content: [
              {
                type: "text" as const,
                text: `ERROR: Session "${session_id}" is not open. Open it first with terminal_open(session_id="${session_id}", shell="${shell}", cwd="${cwd || "default"}"), then re-run this command.`,
              },
            ],
            isError: true,
          };
        }
        try {
          const result = await sendCommandAndWait(session, command, {
            waitMs: wait_ms ?? 30000,
          });
          const header = `[Session ${session.id} · ${session.shell} · ${session.cwd}]${
            command.trim() ? ` > ${command.trim()}` : " (waiting for output)"
          }`;
          const statusNote =
            result.status === "still-running"
              ? "\nSTATUS: command may still be running — session stays alive. Call again (empty command + wait_ms) or use read_process_output for more.\n"
              : result.status === "ended"
                ? "\nSTATUS: session has ended.\n"
                : result.status === "tail"
                  ? "\n(no new output in the wait window)\n"
                  : "\n";
          return {
            content: [
              {
                type: "text" as const,
                text: `${header}\n${statusNote}${result.output || "(no output)"}`,
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `ERROR: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      }
      try {
        // cmd is the default host (raw command); everything else is wrapped and
        // executed through the PowerShell host, which can invoke bash/wsl/cmd.
        const isCmdHost = shell === "cmd";
        const result = await execAsync(
          isCmdHost ? command : buildShellCommand(command, shell),
          {
            cwd: cwd || os.homedir(),
            timeout: timeout || 30000,
            shell: isCmdHost ? "cmd.exe" : "powershell.exe",
            maxBuffer: 1024 * 1024 * 10, // 10MB
          }
        );
  
        return {
          content: [
            {
              type: "text" as const,
              text: `STDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr || "(empty)"}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ERROR: ${error.message}\n\nSTDOUT:\n${error.stdout || ""}\n\nSTDERR:\n${error.stderr || ""}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 13: Run Long-Running Command (Streaming)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "run_command_long",
    `Execute a long-running shell command on this Windows PC and return all output after
  completion. Unlike run_command, this tool has a default timeout of 2 minutes (120 seconds)
  and is designed for commands that take a long time: npm install, pip install, compiling
  large projects, downloading big files, building projects, git clone large repositories,
  running test suites, or backup processes. Command runs through PowerShell.exe with a larger
  output buffer. Returns STDOUT, STDERR, and exit code.`,
    {
      command: z
        .string()
        .describe(
          'The shell command to execute (for long-running operations). Examples: "npm install", "pip install tensorflow", "git clone https://github.com/...", "cargo build --release", "dotnet build", "mvn clean install"'
        ),
      cwd: z
        .string()
        .optional()
        .describe(
          "Working directory where the command runs. Use absolute path. Default: user home directory. Example: D:\\Projects\\my-app"
        ),
      timeout: z
        .number()
        .optional()
        .describe(
          "Execution timeout in milliseconds. Default: 120000 (2 minutes). Increase for very long-running commands: 180000 (3min) for large builds, 300000 (5min) for heavy compilation."
        ),
    },
    async ({ command, cwd, timeout }) => {
      const blocked = isCommandBlocked(command);
      if (blocked) {
        return {
          content: [
            {
              type: "text" as const,
              text: `BLOCKED: command contains a blocked pattern "${
                blocked
              }" and was not executed. See config_get for the blocked commands list.`,
            },
          ],
          isError: true,
        };
      }
      return new Promise((resolve) => {
        const child = spawn("powershell.exe", ["-Command", command], {
          cwd: cwd || os.homedir(),
          timeout: timeout || 120000,
          shell: false,
        });
  
        let output = "";
        let errorOutput = "";
  
        child.stdout.on("data", (data: Buffer) => {
          output += data.toString();
        });
  
        child.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });
  
        child.on("close", (code: number | null) => {
          resolve({
            content: [
              {
                type: "text" as const,
                text: `Exit code: ${code}\n\nSTDOUT:\n${output}\n\nSTDERR:\n${errorOutput || "(empty)"}`,
              },
            ],
          });
        });
  
        child.on("error", (err: Error) => {
          resolve({
            content: [
              {
                type: "text" as const,
                text: `ERROR: ${err.message}`,
              },
            ],
            isError: true,
          });
        });
      });
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 28: Execute Code In Memory (Python/Node.js/R)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "execute_code",
    `Execute code in-memory using Python, Node.js, or R without saving files.
  The code runs as a one-shot script and returns stdout/stderr. Use this for
  data analysis, quick calculations, prototyping, or testing snippets. Python
  and R must be installed on the system.`,
    {
      language: z
        .enum(["python", "node", "r"])
        .describe(
          'Programming language to execute:\n- "python": Uses python -c (requires Python installed)\n- "node": Uses node -e (requires Node.js installed)\n- "r": Uses Rscript -e (requires R installed)'
        ),
      code: z
        .string()
        .describe(
          'Source code to execute (single expression or multi-line).\nPython examples:\n- "print(sum(range(1, 101)))" — sum 1-100\n- "import json; print(json.dumps({\'a\': 1}))" — print JSON\n- "import os; print(os.listdir(\'.\'))" — list directory\n\nNode.js examples:\n- "console.log(2 + 2)" — simple math\n- "console.log(JSON.stringify(process.env, null, 2))" — print env\n- "const fs = require(\'fs\'); console.log(fs.readdirSync(\'.\'))" — list files'
        ),
    },
    async ({ language, code }) => {
      const cmds: Record<string, string> = {
        python: `python -c "${code.replace(/"/g, '\\"')}"`,
        node: `node -e "${code.replace(/"/g, '\\"')}"`,
        r: `Rscript -e "${code.replace(/"/g, '\\"')}"`,
      };
      try {
        const { stdout, stderr } = await execAsync(cmds[language], {
          timeout: 60000,
          maxBuffer: 1024 * 1024 * 10,
        });
        const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: output || "(no output)",
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
}
