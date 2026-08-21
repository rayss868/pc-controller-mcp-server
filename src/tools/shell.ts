import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spawn } from "child_process";
import * as os from "os";
import { execAsync, buildShellCommand } from "../helpers.js";

export function registerShellTools(server: McpServer) {
  //  TOOL 1: Execute Shell Command
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "run_command",
    `Execute a shell command on this Windows PC and return its output.
  Use this tool to run any CLI command: package installation (npm, pip, cargo), code compilation,
  file management via CLI, registry queries, network diagnostics (ping, tracert, ipconfig),
  git operations, build scripts, or anything that can run in a terminal. Default shell is PowerShell
  with a timeout of 30 seconds. Returns both STDOUT and STDERR. The 'shell' parameter switches to
  Git Bash or WSL for Unix-style commands (ls, grep, bash scripts).
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
        .enum(["powershell", "gitbash", "wsl"])
        .optional()
        .describe(
          'Shell to run the command in:\n- "powershell" (default): Native Windows PowerShell, best for Windows commands (Get-Process, Get-Service, registry, etc.)\n- "gitbash": Git Bash (C:\\Program Files\\Git\\bin\\bash.exe), use for Unix utilities (ls, grep, find, cat, sed, awk)\n- "wsl": Windows Subsystem for Linux, use for real Linux commands (apt, systemctl, docker on WSL, bash scripts)'
        ),
    },
    async ({ command, cwd, timeout, shell = "powershell" }) => {
      try {
        const result = await execAsync(buildShellCommand(command, shell), {
          cwd: cwd || os.homedir(),
          timeout: timeout || 30000,
          shell: "powershell.exe",
          maxBuffer: 1024 * 1024 * 10, // 10MB
        });
  
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
