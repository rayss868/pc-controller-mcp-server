import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execAsync, formatBytes } from "../helpers.js";

async function openWithoutFocus(target: string): Promise<void> {
  const encodedTarget = Buffer.from(target, "utf8").toString("base64");
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct PcControllerShellExecuteInfo {
  public int cbSize;
  public uint fMask;
  public IntPtr hwnd;
  public string lpVerb;
  public string lpFile;
  public string lpParameters;
  public string lpDirectory;
  public int nShow;
  public IntPtr hInstApp;
  public IntPtr lpIDList;
  public string lpClass;
  public IntPtr hkeyClass;
  public uint dwHotKey;
  public IntPtr hIcon;
  public IntPtr hProcess;
}
public static class PcControllerShell {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool ShellExecuteEx(ref PcControllerShellExecuteInfo info);
}
'@
$target = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedTarget}'))
$info = New-Object PcControllerShellExecuteInfo
$info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
$info.fMask = 0x0200
$info.lpVerb = 'open'
$info.lpFile = $target
$info.nShow = 4
if (-not [PcControllerShell]::ShellExecuteEx([ref]$info)) {
  throw 'ShellExecuteEx failed for the requested target.'
}
`;
  await execAsync(script, {
    timeout: 15000,
    shell: "powershell.exe",
  });
}

export function registerSystemTools(server: McpServer) {
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
          "Absolute path to save the screenshot PNG file to disk. Example: D:\\screenshots\\capture.png. If omitted, the screenshot is still captured and returned as base64 image data but not saved to a specific file location."
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
          'Filter processes by name (partial match, case-insensitive). Examples: "chrome" (all Chrome processes), "node" (all Node.js), "code" (VS Code), "python" (all Python), "excel" (Microsoft Excel)'
        ),
      sort_by: z
        .enum(["name", "memory", "cpu"])
        .optional()
        .describe(
          'Sort results by:\n- "name": Alphabetical order (A→Z)\n- "memory": Highest memory usage first (default) — find RAM hogs\n- "cpu": Highest CPU time first — find CPU hogs'
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
          'Name of the process to kill (without .exe extension). Examples: "notepad", "chrome", "code", "excel", "spotify". This will kill ALL instances with that name.'
        ),
      pid: z
        .number()
        .optional()
        .describe(
          "Specific Process ID (PID) to terminate. Use the PID number from the process_list tool output. Safer than using name since it only kills one specific process. Example: pid=1234"
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
          'Path to file, folder, or URL to open.\n- File: "C:\\Documents\\report.pdf", "D:\\project\\README.md"\n- Folder: "C:\\Users\\rayss\\Desktop"\n- URL: "https://google.com", "https://github.com/user/repo"'
        ),
    },
    async ({ target }) => {
      try {
        await openWithoutFocus(target);
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
          'File or folder to compress. Can use wildcards.\n- Single folder: "D:\\Projects\\myapp"\n- Multiple files: "D:\\logs\\*.log"\n- Specific file: "D:\\documents\\report.pdf"'
        ),
      destination: z
        .string()
        .describe(
          'Output .zip file path. Parent directories are created automatically.\nExample: "D:\\backup\\myapp-2026-08-21.zip"'
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
  Use this tool to unzip archives. The destination folder is created automatically if it doesn't exist.
  Existing files in the destination will be overwritten.`,
    {
      archive: z
        .string()
        .describe(
          'Path to the .zip file to extract.\nExample: "D:\\downloads\\backup.zip", "D:\\backup\\myapp-2026-08-21.zip"'
        ),
      destination: z
        .string()
        .describe(
          'Output folder where files will be extracted. Created automatically if it doesn\'t exist.\nExample: "D:\\Projects\\myapp", "C:\\temp\\extracted"'
        ),
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
          'Window title or process name to focus (case-insensitive partial match).\nExamples:\n- "Notepad" — focus Notepad\n- "Code" — focus VS Code\n- "chrome" — focus Google Chrome\n- "Excel" — focus Microsoft Excel\n- "Terminal" — focus terminal window'
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
          'Literal text to type, escaped automatically.\nExamples:\n- "Hello world" — type text\n- "npm install express" — type command\n- "C:\\Users\\rayss" — type path\n- "12345" — type numbers'
        ),
      keys: z
        .string()
        .optional()
        .describe(
          'Raw SendKeys string for shortcuts/special keys (takes precedence over text).\nExamples:\n- "^s" — Ctrl+S (save)\n- "^c" — Ctrl+C (copy)\n- "^v" — Ctrl+V (paste)\n- "{ENTER}" — Enter key\n- "{TAB}" — Tab key\n- "{ESC}" — Escape key\n- "{DELETE}" — Delete key\n- "%{F4}" — Alt+F4 (close window)\n- "{UP}{DOWN}{LEFT}{RIGHT}" — Arrow keys\n- "{F5}" — F5 key\n- "^a" — Ctrl+A (select all)'
        ),
      delay_ms: z
        .number()
        .optional()
        .describe(
          "Delay between characters in milliseconds (only applies to 'text' mode). Default: 0 (instant). Use 50-100ms for slow, stable typing that applications can handle."
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
        .describe(
          'Notification title (bold text).\nExamples:\n- "Build Finished"\n- "Test Complete"\n- "Download Complete"\n- "Error Occurred"\n- "Update Available"'
        ),
      message: z
        .string()
        .describe(
          'Notification message body (detail text).\nExamples:\n- "npm run build completed successfully"\n- "All 42 tests passed"\n- "file.zip downloaded to D:\\downloads"\n- "Connection to database failed"'
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
  
  // ═══════════════════════════════════════════════════════════════════════
}
