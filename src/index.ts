/**
 * PC Controller MCP Server
 *
 * Universal MCP server for controlling a Windows PC.
 * Features: shell execution, file operations, screenshot, system info,
 * process management, clipboard, and more.
 * Transport: stdio (universal — supports Claude Desktop, Cursor, etc.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// ─── Create MCP Server ───────────────────────────────────────────────
const server = new McpServer({
  name: "pc-controller",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════════════════
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
        'The shell command to execute. Examples: "dir C:\\Users", "Get-Process", "npm install", "git status", "ipconfig /all", "ls -la"'
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        "Working directory where the command runs. Use absolute path. Default: user home directory (C:\\Users\\<username>)"
      ),
    timeout: z
      .number()
      .optional()
      .describe(
        "Execution timeout in milliseconds. Default: 30000 (30 seconds). Increase for long-running commands like npm install or builds."
      ),
    shell: z
      .enum(["powershell", "gitbash", "wsl"])
      .optional()
      .describe(
        'Shell to run the command in. "powershell" (default) is native Windows. "gitbash" uses Git Bash (C:\\Program Files\\Git\\bin\\bash.exe) for Unix utilities. "wsl" uses WSL (System32\\bash.exe → default distro, e.g. Ubuntu) for real Linux commands. Use PowerShell unless the command is Unix-specific.'
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
//  TOOL 2: Read File Contents
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "file_read",
  `Read and return the full text contents of a file on this Windows PC.
Supports all text-based files: .txt, .json, .js, .ts, .py, .md, .csv, .xml, .yaml,
.html, .css, .log, .env, .ini, .bat, .ps1, .toml, and other text files.
Use this to view configuration files, read source code, inspect log files,
or extract data from files. Files are read in text mode with UTF-8 encoding by default.
For binary files (images, videos, etc.), use a different approach.
Path must be absolute (e.g., C:\\Users\\rayss\\Documents\\config.json).`,
  {
    path: z
      .string()
      .describe(
        "Absolute path to the file to read. Example: C:\\Users\\rayss\\Documents\\config.json"
      ),
    encoding: z
      .string()
      .optional()
      .describe(
        'File encoding. Default: "utf-8". Other options: "ascii", "latin1", "utf16le". Use "latin1" for files with Windows special characters.'
      ),
  },
  async ({ path: filePath, encoding }) => {
    try {
      const content = await fs.readFile(filePath, {
        encoding: (encoding as BufferEncoding) || "utf-8",
      });
      return {
        content: [{ type: "text" as const, text: content }],
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
//  TOOL 3: Write File Contents
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "file_write",
  `Write text content to a file on this Windows PC. If the file does not exist, it will be
created automatically along with any missing parent directories (auto-create directory).
If the file already exists, its entire content will be overwritten (full replacement).
Use this to create new configuration files, save processed data output, write source code,
generate scripts, or update files by rewriting their full content. Path must be absolute.
Content is written in UTF-8 encoding.`,
  {
    path: z
      .string()
      .describe(
        "Absolute path to the target file. Example: D:\\Projects\\app\\config.json. Parent directories will be created automatically if they don't exist."
      ),
    content: z
      .string()
      .describe(
        "The full text content to write into the file. Can be JSON, source code, configuration, or any text."
      ),
  },
  async ({ path: filePath, content }) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully wrote ${content.length} characters to ${filePath}`,
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
//  TOOL 4: List Directory Contents
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "dir_list",
  `List the contents of a folder/directory on this Windows PC. Shows file/folder names,
type (📁 folder or 📄 file), file size (in KB/MB/GB), and last modified date.
Supports recursive mode to display contents of sub-folders up to 3 levels deep.
Use this to explore folder structures, locate files, check file sizes,
or inspect directory contents. If no path is provided, lists the user's home
directory (C:\\Users\\<username>).`,
  {
    path: z
      .string()
      .optional()
      .describe(
        "Absolute path to the folder to list. Default: user home directory. Example: C:\\Users\\rayss\\Desktop"
      ),
    recursive: z
      .boolean()
      .optional()
      .describe(
        "If true, also list contents of sub-folders recursively (max 3 levels deep). Default: false (only the specified folder)."
      ),
  },
  async ({ path: dirPath, recursive }) => {
    try {
      const targetPath = dirPath || os.homedir();

      async function listDir(dir: string, depth: number): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const lines: string[] = [];

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const stat = await fs.stat(fullPath);
          const indent = "  ".repeat(depth);
          const type = entry.isDirectory() ? "📁" : "📄";
          const size = entry.isFile()
            ? ` (${formatBytes(stat.size)})`
            : "";
          const modified = stat.mtime.toISOString().split("T")[0];
          lines.push(
            `${indent}${type} ${entry.name}${size} [${modified}]`
          );

          if (recursive && entry.isDirectory() && depth < 3) {
            try {
              const subLines = await listDir(fullPath, depth + 1);
              lines.push(...subLines);
            } catch {
              // skip permission errors
            }
          }
        }
        return lines;
      }

      const lines = await listDir(targetPath, 0);
      return {
        content: [
          {
            type: "text" as const,
            text:
              lines.length > 0
                ? lines.join("\n")
                : "(empty directory)",
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
//  TOOL 5: Capture Screen Screenshot
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "screen_capture",
  `Capture a screenshot (screen grab) of the primary monitor on this Windows PC. Returns the
screenshot image in PNG format as base64 data that the AI can directly view and analyze.
Use cases: see what's currently displayed on screen, debug UI issues in applications,
verify visual changes, create visual documentation, or monitor what's showing on the display.
Screenshot is captured using .NET System.Drawing from the primary monitor at full resolution.
Optionally save the screenshot to a specific file path on disk.`,
  {
    output_path: z
      .string()
      .optional()
      .describe(
        "Absolute path to save the screenshot PNG file to disk. If omitted, the screenshot is still captured and returned as base64 image data but not saved to a specific file location."
      ),
  },
  async ({ output_path }) => {
    try {
      const timestamp = Date.now();
      const tempPath = path.join(
        os.tmpdir(),
        `screenshot_${timestamp}.png`
      );

      // PowerShell screenshot using .NET
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
$bitmap.Save('${tempPath.replace(/\\/g, "\\\\")}')
$graphics.Dispose()
$bitmap.Dispose()
Write-Output '${tempPath}'
`;

      const { stdout } = await execAsync(
        `powershell.exe -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, "; ")}"`,
        { timeout: 15000 }
      );

      const savedPath = stdout.trim() || tempPath;

      // If user wants to save to specific path, copy it
      if (output_path) {
        await fs.mkdir(path.dirname(output_path), { recursive: true });
        await fs.copyFile(savedPath, output_path);
      }

      // Read image as base64
      const imageBuffer = await fs.readFile(savedPath);
      const base64 = imageBuffer.toString("base64");

      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType: "image/png",
          },
          {
            type: "text" as const,
            text: `Screenshot captured successfully. Temp file: ${savedPath}${output_path ? ` | Saved to: ${output_path}` : ""}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `ERROR taking screenshot: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════
//  TOOL 6: Get System Information
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "sys_info",
  `Retrieve detailed and comprehensive system information about this Windows PC. Includes:
hostname/computer name, OS version and architecture, uptime (how long the PC has been running),
CPU model and core count, CPU clock speed, total RAM and free/used RAM (in human-readable format),
disk/storage information (drive letters, used space, free space per partition), and network
information (IP address per interface). Useful for diagnostics, resource monitoring, checking
PC specifications, or troubleshooting system issues.`,
  {},
  async () => {
    try {
      const cpus = os.cpus();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const networks = os.networkInterfaces();

      let diskInfo = "";
      try {
        const { stdout } = await execAsync(
          'powershell.exe -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free, Root | Format-Table -AutoSize"',
          { timeout: 10000 }
        );
        diskInfo = stdout;
      } catch {
        diskInfo = "Could not retrieve disk info";
      }

      const networkList = Object.entries(networks)
        .map(([name, addrs]) => {
          const ipv4 = addrs?.find((a: any) => a.family === "IPv4");
          return ipv4 ? `${name}: ${ipv4.address}` : null;
        })
        .filter(Boolean)
        .join(", ");

      const info = `
🖥️  System Information
━━━━━━━━━━━━━━━━━━━━
Hostname:     ${os.hostname()}
OS:           ${os.type()} ${os.release()} (${os.platform()})
Architecture: ${os.arch()}
Uptime:       ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m

🧠 CPU
━━━━━━━━━━━━━━━━━━━━
Model:  ${cpus[0]?.model || "Unknown"}
Cores:  ${cpus.length}
Speed:  ${cpus[0]?.speed || 0} MHz

💾 Memory
━━━━━━━━━━━━━━━━━━━━
Total:  ${formatBytes(totalMem)}
Free:   ${formatBytes(freeMem)}
Used:   ${formatBytes(totalMem - freeMem)} (${Math.round(((totalMem - freeMem) / totalMem) * 100)}%)

💿 Disk
━━━━━━━━━━━━━━━━━━━━
${diskInfo}

🌐 Network
━━━━━━━━━━━━━━━━━━━━
${networkList || "No active interfaces"}
`.trim();

      return {
        content: [{ type: "text" as const, text: info }],
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
//  TOOL 7: Search Files by Pattern
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "file_search",
  `Search for files on this Windows PC by name pattern (glob/wildcard). Search is performed
recursively through all sub-folders. Supports wildcards like *.txt, *.jpg, *.json,
config*, report_*.xlsx, and other patterns. Use this to find misplaced files, locate all
files with a specific extension, discover configuration files, or audit files in a directory.
Uses PowerShell Get-ChildItem for fast search performance. Results show the absolute path
of each matching file found.`,
  {
    pattern: z
      .string()
      .describe(
        'File search pattern (glob pattern). Examples: "*.txt" (all text files), "*.png" (all PNG images), "config*" (files starting with config), "*.log" (all log files)'
      ),
    directory: z
      .string()
      .optional()
      .describe(
        "Starting folder for the recursive search. Default: user home directory. Example: C:\\Users\\rayss\\Documents"
      ),
    max_results: z
      .number()
      .optional()
      .describe(
        "Maximum number of results to return. Default: 50. Increase if you need more results, decrease to speed up the search."
      ),
  },
  async ({ pattern, directory, max_results }) => {
    try {
      const searchDir = directory || os.homedir();
      const maxResults = max_results || 50;

      const { stdout } = await execAsync(
        `powershell.exe -Command "Get-ChildItem -Path '${searchDir}' -Filter '${pattern}' -Recurse -ErrorAction SilentlyContinue | Select-Object -First ${maxResults} -ExpandProperty FullName"`,
        { timeout: 30000, maxBuffer: 1024 * 1024 * 5 }
      );

      const files = stdout.trim().split("\n").filter(Boolean);

      if (files.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No files matching "${pattern}" found in ${searchDir}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${files.length} file(s) matching "${pattern}":\n\n${files.join("\n")}`,
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
//  TOOL 8: List Running Processes
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "process_list",
  `Display a list of processes/applications currently running on this Windows PC. Shows
process name, Process ID (PID), memory usage (in MB), and CPU time (in seconds).
Can be filtered by process name (partial match) to find specific processes.
Can be sorted by name, memory usage (find RAM hogs), or CPU usage (find CPU hogs).
Shows the top 30 processes. Useful for monitoring, debugging, finding resource-consuming
processes, or identifying processes before killing them.`,
  {
    filter: z
      .string()
      .optional()
      .describe(
        'Filter processes by name (partial match, case-insensitive). Examples: "chrome" (show all Chrome processes), "node" (all Node.js processes), "code" (VS Code)'
      ),
    sort_by: z
      .enum(["name", "memory", "cpu"])
      .optional()
      .describe(
        'Sort results by: "name" (alphabetical), "memory" (highest memory first — default), "cpu" (highest CPU time first)'
      ),
  },
  async ({ filter, sort_by }) => {
    try {
      const sortField =
        sort_by === "cpu"
          ? "CPU"
          : sort_by === "name"
            ? "Name"
            : "WorkingSet64";
      const sortOrder = sort_by === "name" ? "Ascending" : "Descending";

      let cmd = `Get-Process | Sort-Object ${sortField} -${sortOrder}`;
      if (filter) {
        cmd = `Get-Process -Name "*${filter}*" -ErrorAction SilentlyContinue | Sort-Object ${sortField} -${sortOrder}`;
      }
      cmd += ` | Select-Object -First 30 Name, Id, @{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N='CPU_s';E={[math]::Round($_.CPU,1)}} | Format-Table -AutoSize`;

      const { stdout } = await execAsync(
        `powershell.exe -Command "${cmd}"`,
        { timeout: 15000 }
      );

      return {
        content: [
          {
            type: "text" as const,
            text: stdout || "No processes found",
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
//  TOOL 9: Kill/Terminate Process
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "process_kill",
  `Force-terminate a running process on this Windows PC. Can target by process name
(kills ALL instances with that name) or by Process ID/PID (kills a specific process).
The process is force-killed without confirmation. Use this to stop hung/frozen applications,
close unwanted programs, or free up blocked resources. WARNING: Use with caution —
killed processes cannot be recovered and any unsaved data will be lost.`,
  {
    name: z
      .string()
      .optional()
      .describe(
        'Name of the process to kill (without .exe extension). Examples: "notepad", "chrome", "code". This will kill ALL instances with that name.'
      ),
    pid: z
      .number()
      .optional()
      .describe(
        "Specific Process ID (PID) to terminate. Use the PID number from the process_list tool output. Safer than using name since it only kills one specific process."
      ),
  },
  async ({ name, pid }) => {
    try {
      if (!name && !pid) {
        return {
          content: [
            {
              type: "text" as const,
              text: "ERROR: Provide either 'name' or 'pid'",
            },
          ],
          isError: true,
        };
      }

      let cmd: string;
      if (pid) {
        cmd = `Stop-Process -Id ${pid} -Force`;
      } else {
        cmd = `Stop-Process -Name "${name}" -Force -ErrorAction SilentlyContinue`;
      }

      await execAsync(`powershell.exe -Command "${cmd}"`, {
        timeout: 10000,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully killed process ${pid ? `PID ${pid}` : `"${name}"`}`,
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
//  TOOL 10: Open File/Folder/URL
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "open_path",
  `Open a file, folder, or URL using the default application on this Windows PC.
For files: opens with the registered application (e.g., .pdf in PDF reader, .jpg in image
viewer, .docx in Word). For folders: opens in Windows Explorer. For URLs: opens in the
default web browser. Use this to open documents, launch applications via file shortcuts,
browse folders in Explorer, or open websites in the browser. Uses Windows Start-Process
under the hood.`,
  {
    target: z
      .string()
      .describe(
        'Path to file, folder, or URL to open. File example: "C:\\Documents\\report.pdf". Folder example: "C:\\Users\\rayss\\Desktop". URL example: "https://google.com"'
      ),
  },
  async ({ target }) => {
    try {
      await execAsync(
        `powershell.exe -Command "Start-Process '${target.replace(/'/g, "''")}'"`,
        { timeout: 10000 }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Opened: ${target}`,
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
//  TOOL 11: Get Clipboard Contents
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "clipboard_get",
  `Read the current text content of the Windows system clipboard (the last copied item).
The clipboard is the temporary storage area for copy/paste operations. With this tool,
the AI can read what's currently in the clipboard — useful to grab data copied from
other applications or verify what was last copied. Returns "(clipboard is empty)" when
nothing is copied.`,
  {},
  async () => {
    try {
      const { stdout } = await execAsync(
        'powershell.exe -Command "Get-Clipboard"',
        { timeout: 5000 }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: stdout || "(clipboard is empty)",
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
//  TOOL 12: Set Clipboard Contents
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "clipboard_set",
  `Copy text to the Windows system clipboard so the user can immediately paste it (Ctrl+V)
in any application. The clipboard is the temporary storage area for copy/paste operations.
Use cases: copy command output to the clipboard, transfer text between applications, or
automate copy-paste workflows. Requires the 'text' parameter with the content to copy.`,
  {
    text: z
      .string()
      .describe("The text to copy to the clipboard. Example: 'npm install --save'"),
  },
  async ({ text }) => {
    try {
      await execAsync(
        `powershell.exe -Command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`,
        { timeout: 5000 }
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Text copied to clipboard (${text.length} characters)`,
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
        'The shell command to execute (for long-running operations). Examples: "npm install", "pip install tensorflow", "git clone https://github.com/...", "cargo build --release"'
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        "Working directory where the command runs. Use absolute path. Default: user home directory."
      ),
    timeout: z
      .number()
      .optional()
      .describe(
        "Execution timeout in milliseconds. Default: 120000 (2 minutes). Increase for very long-running commands."
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
//  TOOL 14: Create ZIP Archive
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "zip_create",
  `Create a ZIP archive from files or folders using PowerShell Compress-Archive.
Use this tool to compress files/folders into a .zip file for backup, sharing, or archiving.
Supports wildcards in source (e.g. "D:\\logs\\*.log"). The destination path should end in .zip.`,
  {
    source: z
      .string()
      .describe(
        'File or folder to compress. Can use wildcards. Example: "D:\\Projects\\myapp" or "D:\\logs\\*.log"'
      ),
    destination: z
      .string()
      .describe(
        'Output .zip file path. Example: "D:\\backup\\myapp-2026-08-14.zip"'
      ),
  },
  async ({ source, destination }) => {
    try {
      const ps = `Compress-Archive -Path '${source.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`;
      const { stdout, stderr } = await execAsync(ps, {
        timeout: 120000,
        shell: "powershell.exe",
        maxBuffer: 1024 * 1024 * 10,
      });
      if (stderr.trim()) {
        return {
          content: [{ type: "text" as const, text: `ERROR: ${stderr.trim()}` }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: `ZIP created: ${destination}` },
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
//  TOOL 15: Extract ZIP Archive
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "zip_extract",
  `Extract a ZIP archive to a destination folder using PowerShell Expand-Archive.
Use this tool to unzip archives. The destination folder is created automatically if it doesn't exist.`,
  {
    archive: z
      .string()
      .describe(
        'Path to the .zip file to extract. Example: "D:\\downloads\\backup.zip"'
      ),
    destination: z
      .string()
      .describe('Output folder. Example: "D:\\Projects\\myapp"'),
  },
  async ({ archive, destination }) => {
    try {
      const ps = `Expand-Archive -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`;
      const { stdout, stderr } = await execAsync(ps, {
        timeout: 120000,
        shell: "powershell.exe",
        maxBuffer: 1024 * 1024 * 10,
      });
      if (stderr.trim()) {
        return {
          content: [{ type: "text" as const, text: `ERROR: ${stderr.trim()}` }],
          isError: true,
        };
      }
      return {
        content: [
          { type: "text" as const, text: `Extracted to: ${destination}` },
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
//  TOOL 16: Focus Window
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "window_focus",
  `Bring a window to the foreground by matching its title or process name (case-insensitive).
Use this tool to switch focus to a specific application window before sending keys or interacting
with it. Example: "Notepad", "Visual Studio Code", "chrome" — matches any open window whose title
contains the text. Returns an error if no matching window is found.`,
  {
    title: z
      .string()
      .describe(
        'Window title or process name to focus. Example: "Notepad" or "Code" or "chrome"'
      ),
  },
  async ({ title }) => {
    try {
      const ps = `$ws = New-Object -ComObject WScript.Shell; if ($ws.AppActivate('${title.replace(/'/g, "''")}')) { 'OK' } else { 'NOT_FOUND' }`;
      const { stdout, stderr } = await execAsync(ps, {
        timeout: 10000,
        shell: "powershell.exe",
      });
      if (stderr.trim()) {
        return {
          content: [{ type: "text" as const, text: `ERROR: ${stderr.trim()}` }],
          isError: true,
        };
      }
      const ok = stdout.includes("OK");
      return {
        content: [
          {
            type: "text" as const,
            text: ok
              ? `Window focused: ${title}`
              : `Window not found: ${title}`,
          },
        ],
        isError: !ok,
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
//  TOOL 17: Type Text / Send Keys
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "key_type",
  `Type text or send keystrokes to the currently focused window using PowerShell SendKeys.
Call window_focus first to make sure the target window is active. For literal text, pass 'text'
(special characters are escaped automatically). For shortcuts and special keys, pass 'keys' as a
raw SendKeys string: ^c (Ctrl+C), ^v (Ctrl+V), {ENTER}, {TAB}, {ESC}, {BACKSPACE}, {DEL}, {UP},
{DOWN}, {LEFT}, {RIGHT}, {F1}..{F12}, %{F4} (Alt+F4). Example: keys="^s" saves the focused file.`,
  {
    text: z
      .string()
      .optional()
      .describe(
        'Literal text to type, escaped automatically. Example: "Hello world" or "npm install"'
      ),
    keys: z
      .string()
      .optional()
      .describe(
        'Raw SendKeys string for shortcuts/special keys. Example: "^s" (Ctrl+S), "{ENTER}", "%%{F4}" (Alt+F4). Takes precedence over text.'
      ),
    delay_ms: z
      .number()
      .optional()
      .describe(
        "Delay between characters in milliseconds (only applies to 'text'). Default: 0. Use 50-100 for slow, stable typing."
      ),
  },
  async ({ text, keys, delay_ms = 0 }) => {
    try {
      const payload = keys !== undefined ? keys : text || "";
      if (keys === undefined) {
        // Escape SendKeys special characters so literal text is typed as-is
        const escaped = payload.replace(/([+^%~(){}])/g, "{$1}");
        let ps: string;
        if (delay_ms > 0) {
          ps = `$ws = New-Object -ComObject WScript.Shell; foreach ($ch in '${escaped.replace(/'/g, "''")}'.ToCharArray()) { $ws.SendKeys($ch.ToString()); Start-Sleep -Milliseconds ${Math.min(delay_ms, 1000)} }`;
        } else {
          ps = `$ws = New-Object -ComObject WScript.Shell; $ws.SendKeys('${escaped.replace(/'/g, "''")}')`;
        }
        await execAsync(ps, { timeout: 15000, shell: "powershell.exe" });
        return {
          content: [
            { type: "text" as const, text: `Typed ${payload.length} characters` },
          ],
        };
      }
      await execAsync(
        `$ws = New-Object -ComObject WScript.Shell; $ws.SendKeys('${payload.replace(/'/g, "''")}')`,
        { timeout: 15000, shell: "powershell.exe" }
      );
      return {
        content: [
          { type: "text" as const, text: `Keys sent: ${payload}` },
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
//  TOOL 18: Show Windows Notification
// ═══════════════════════════════════════════════════════════════════════
server.tool(
  "notify",
  `Show a Windows notification balloon with the given title and message.
Use this tool to notify the user when a long task finishes, when something needs their attention,
or to display information without opening a window. The notification stays visible for ~6 seconds.`,
  {
    title: z
      .string()
      .describe('Notification title. Example: "Build Finished"'),
    message: z
      .string()
      .describe(
        'Notification message body. Example: "npm run build completed successfully"'
      ),
  },
  async ({ title, message }) => {
    try {
      const ps = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$n = New-Object System.Windows.Forms.NotifyIcon",
        "$n.Icon = [System.Drawing.SystemIcons]::Information",
        `$n.BalloonTipTitle = '${title.replace(/'/g, "''")}'`,
        `$n.BalloonTipText = '${message.replace(/'/g, "''")}'`,
        "$n.Visible = $true",
        "$n.ShowBalloonTip(5000)",
        "Start-Sleep -Seconds 6",
        "$n.Dispose()",
      ].join("; ");
      await execAsync(ps, { timeout: 15000, shell: "powershell.exe" });
      return {
        content: [
          { type: "text" as const, text: `Notification shown: ${title}` },
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

// ─── Helper Functions ────────────────────────────────────────────────
function buildShellCommand(command: string, shell: string): string {
  switch (shell) {
    case "gitbash":
      return `& 'C:\\Program Files\\Git\\bin\\bash.exe' -lc '${command.replace(/'/g, "''")}'`;
    case "wsl":
      return `& 'C:\\Windows\\System32\\bash.exe' -lc '${command.replace(/'/g, "''")}'`;
    default:
      return command;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ─── Start Server ────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PC Controller MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
