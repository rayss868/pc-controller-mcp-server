---
name: pc-controller
description: Control a Windows PC via MCP tools — execute shell commands, read/write/edit files, capture screenshots, get system info, search files, manage processes, open items, control clipboard, manage terminal sessions, fetch URLs, preview files inline, and more. Use when the user asks to run commands, check system status, take screenshots, manage files, control processes, or interact with the Windows desktop.
---

# PC Controller

Control this Windows PC using the `pc-controller` MCP server (41 tools). Commands run via cmd (default), with PowerShell / Git Bash / WSL available on request.

## Command-First Principle

**`run_command` is the universal center.** Anything PowerShell/Git Bash/WSL can do, it can do — there is no task that requires a dedicated tool. Dedicated tools are conveniences: use one **only when it is clearly simpler** than writing the equivalent command.

Decision rule:
1. Is there a dedicated tool that solves this in one obvious call? → use the tool
2. Otherwise → use `run_command` (or `run_command_long` / `execute_code`)

### Streaming sessions (reuse ONE terminal, realtime)

For anything that needs **state across commands** — a dev server, watch/build loop, SSH,
a database CLI — do NOT spawn a new shell per command. Open ONE persistent terminal with
`session_id` and stream every later command through the same shell, realtime:

```
# STEP 1 — open the terminal (wait for the confirmation return)
pc-controller:terminal_open(session_id="dev", title="OpenAI", cwd="C:\\Users\\<username>\\Projects\\app")
# STEP 2 — stream commands into the open terminal
pc-controller:run_command(command="npm run dev", session_id="dev")
pc-controller:run_command(command="", session_id="dev", wait_ms=5000)   # block & fetch new output
pc-controller:interact_with_process(session_id="dev", input="", wait_ms=2000)
pc-controller:list_sessions()
pc-controller:terminal_stop(session_id="dev")
```

Rules:
- STEP 1: open the terminal with `terminal_open` and wait for its confirmation before
  sending anything. STEP 2: every `run_command` call with the SAME id streams into that
  open terminal — same shell, same cwd, same variables. The shell is NOT reopened per command.
- `run_command` with a `session_id` that is NOT open returns an error: open it first.
- Different `session_id` = a separate terminal, streamed side by side. Open as many as needed.
- `shell` / `cwd` / `title` are fixed when the terminal opens; afterwards navigate with `cd`.
- The terminal opens as a visible console window. Use `title` in `terminal_open` to customize its window title; if omitted, it defaults to `PC Controller - <session_id>`.
- Close a session with `terminal_stop` (kills the whole process tree).
- Idle auto-close: a session dies automatically after 10 minutes without ANY activity
  (no output AND no input). Any streamed output or sent input resets the timer.

### Use tools when simple

| Task | Use |
|------|-----|
| Read/edit small text file | `file_read` / `file_edit` |
| View image inline | `preview_file` |
| See the screen | `screen_capture` |
| Copy/paste clipboard text | `clipboard_get` / `clipboard_set` |
| Kill a known process | `process_kill` |
| Zip/unzip archive | `zip_create` / `zip_extract` |

### Fall back to run_command for everything else

Anything not covered above — document parsing, registry, services, network diagnostics, environment variables, scheduled tasks, WMI queries, multimedia metadata, etc. Examples:

```powershell
# Read DOCX text (Word COM)
$w = New-Object -ComObject Word.Application; $d = $w.Documents.Open("C:\path\file.docx"); $d.Content.Text; $d.Close(); $w.Quit()

# Read XLSX data (Excel COM)
$x = New-Object -ComObject Excel.Application; $wb = $x.Workbooks.Open("C:\path\file.xlsx"); $wb.Sheets.Item(1).UsedRange.Value2

# Read PDF text (requires pdftotext: scoop install poppler / choco install poppler)
pdftotext C:\path\file.pdf -

# Read PDF via Python (no extra CLI needed)
python -c "import pypdf,sys; print('\n'.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))" C:\path\file.pdf

# Environment variables, registry, services
Get-ChildItem Env:  |  Get-ItemProperty "HKLM:\SOFTWARE\..."  |  Get-Service
```

When in doubt, just run the command.

## Tool Reference

### Shell Execution

| Tool | Purpose |
|------|---------|
| `pc-controller:run_command` | Execute shell command (PowerShell/Git Bash/WSL, 30s timeout) |
| `pc-controller:run_command_long` | Long-running command (2 min timeout, larger buffer) |
| `pc-controller:execute_code` | Run Python/Node.js/R code in memory without saving files |

```
pc-controller:run_command(command="git status", cwd="C:\\Users\\<username>\\Projects\\myapp")
pc-controller:run_command(command="ls -la", shell="gitbash")
pc-controller:run_command(command="sudo apt update", shell="wsl")
pc-controller:run_command_long(command="npm install", cwd="C:\\Users\\<username>\\Projects\\myapp")
pc-controller:execute_code(language="python", code="print(sum(range(1, 101)))")
```

### File Operations

| Tool | Purpose |
|------|---------|
| `pc-controller:file_read` | Read file contents (supports offset/limit for line ranges, negative offset for tail) |
| `pc-controller:file_write` | Write/create file (auto-creates parent dirs, overwrites) |
| `pc-controller:file_edit` | Surgical search & replace — edit specific text without overwriting the file (returns compact git-style diff; supports `dry_run` preview) |
| `pc-controller:file_edit_batch` | Apply multiple surgical edits to one file in a single round-trip (per-edit diff; supports `dry_run` preview) |
| `pc-controller:file_move` | Move or rename files/directories (auto-creates destination folders) |
| `pc-controller:file_info` | Get file metadata — size, created/modified dates, read-only status |
| `pc-controller:file_tail` | Read last N lines or bytes of a file (Unix tail equivalent) |
| `pc-controller:file_search` | Search files by glob pattern recursively |
| `pc-controller:content_search` | Search text inside files recursively (grep-like, with line numbers) |
| `pc-controller:read_multiple_files` | Read contents of multiple files simultaneously |
| `pc-controller:dir_list` | List directory contents (supports recursive with configurable depth) |
| `pc-controller:create_directory` | Create directories recursively (mkdir -p equivalent) |
| `pc-controller:copy_file` | Copy files or directories to a new location |
| `pc-controller:delete_file` | Delete files or directories permanently |
| `pc-controller:preview_file` | Preview files with inline images (base64), markdown stats, and code metadata |

**Always use absolute paths** (e.g., `C:\Users\<username>\Documents\config.json`).

```
pc-controller:file_read(path="C:\\Users\\<username>\\config.json")
pc-controller:file_read(path="C:\\Users\\<username>\\logs\\app.log", offset=-100)  # last 100 lines
pc-controller:file_edit(path="C:\\Users\\<username>\\config.json", old_text="port: 3000", new_text="port: 8080")
pc-controller:file_move(source="C:\\Users\\<username>\\old.txt", destination="C:\\Users\\<username>\\archive\\old.txt")
pc-controller:content_search(pattern="TODO", directory="C:\\Users\\<username>\\Projects\\src")
pc-controller:preview_file(path="C:\\Users\\<username>\\Pictures\\photo.png")  # returns base64 image
pc-controller:dir_list(path="C:\\Users\\<username>\\Desktop", recursive=true)
pc-controller:file_search(pattern="*.log", directory="C:\\Users\\<username>\\logs", max_results=100)
```

### Screen Capture

**`pc-controller:screen_capture`** — Takes PNG screenshot of primary monitor, returns base64 image.
- Optionally save to disk with `output_path`
- AI can view the image directly from the base64 response

```
pc-controller:screen_capture()
pc-controller:screen_capture(output_path="C:\\Users\\<username>\\Pictures\\screen.png")
```

### System Info

| Tool | Purpose |
|------|---------|
| `pc-controller:sys_info` | Comprehensive system info (hostname, OS, CPU, RAM, disk, network) |
| `pc-controller:process_list` | List running processes (filter by name, sort by memory/cpu) |
| `pc-controller:process_kill` | Force-kill process by name or PID |

```
pc-controller:sys_info()
pc-controller:process_list(filter="chrome", sort_by="memory")
pc-controller:process_kill(pid=1234)
```

### Clipboard & UI

| Tool | Purpose |
|------|---------|
| `pc-controller:clipboard_get` | Read current text content of system clipboard |
| `pc-controller:clipboard_set` | Copy text to system clipboard |
| `pc-controller:open_path` | Open file/folder/URL with default app |
| `pc-controller:window_focus` | Bring a window to the foreground (by title/process) |
| `pc-controller:key_type` | Type text or send keys to the focused window |
| `pc-controller:notify` | Show a Windows notification balloon |

### Archive

| Tool | Purpose |
|------|---------|
| `pc-controller:zip_create` | Compress files/folders into a .zip archive |
| `pc-controller:zip_extract` | Extract a .zip archive to a folder |

### Terminal Sessions

Sessions are **persistent streaming terminals** opened by `run_command` with a `session_id`
(see above) — or long-running processes. Each has its own shell and stays alive between calls.

| Tool | Purpose |
|------|---------|
| `pc-controller:list_sessions` | List active streaming terminal sessions |
| `pc-controller:read_process_output` | Read output from sessions with offset/length pagination |
| `pc-controller:interact_with_process` | Send input to a running session (`wait_ms` to capture the response in the same call) |
| `pc-controller:terminal_stop` | Stop a session and kill its process tree |

### Configuration & Monitoring

| Tool | Purpose |
|------|---------|
| `pc-controller:config_get` | Get server configuration |
| `pc-controller:config_set` | Update configuration values at runtime |
| `pc-controller:get_usage_stats` | Get tool usage statistics for current session |
| `pc-controller:get_recent_tool_calls` | Get recent tool call history with duration/status |
| `pc-controller:read_skill_docs` | Read skill documentation (tool reference, workflows, examples) |

### Network

| Tool | Purpose |
|------|---------|
| `pc-controller:read_url` | Fetch content from URLs (HTML, JSON, raw text) |

## Common Workflows

### Debug a problem
1. `screen_capture` → see current screen
2. `process_list` → check if app is running
3. `file_read` → inspect log files
4. `run_command` → run diagnostics

### Setup a project
1. `run_command_long` → git clone
2. `run_command_long` → npm install / pip install
3. `file_read` → check README
4. `run_command` → run build
5. `open_path` → open folder in Explorer

### System health check
1. `sys_info` → overview
2. `process_list(sort_by="memory")` → find RAM hogs
3. `process_list(sort_by="cpu")` → find CPU hogs
4. `run_command` → check disk, network

### Code editing workflow (agent-style)
`file_edit` and `file_edit_batch` return a compact **git-style unified diff** of each
change, so you verify the edit without a full re-read or a large payload. Both support
`dry_run` to preview changes before writing. Use this loop:
1. `file_read` (or `content_search`) → locate the exact text to change
2. `file_edit` (or `file_edit_batch`) with `dry_run=true` → preview the diff, catch any
   failed match before committing (anti-retry over a bridge/tunnel)
3. Run the same call **without** `dry_run` to commit the change(s)
4. Re-read only if you need more surrounding context than the returned diff

## Safety Rules

- **Verify before destructive actions** — always check paths and process names
- **Use `process_list` before `process_kill`** — confirm the right process
- **Backup before `file_write`** on important files — it overwrites completely
- **Use `file_edit` instead of `file_write`** for small changes — safer, preserves formatting
- **Increase timeout** for slow commands instead of letting them fail
- **All paths must be absolute** — never use relative paths

## Detailed Reference

For full parameter details and advanced examples, see [reference/tools.md](reference/tools.md).
