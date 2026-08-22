---
name: pc-controller
description: Control a Windows PC via MCP tools — execute shell commands, read/write/edit files, capture screenshots, get system info, search files, manage processes, open items, control clipboard, manage terminal sessions, fetch URLs, preview files inline, and more. Use when the user asks to run commands, check system status, take screenshots, manage files, control processes, or interact with the Windows desktop.
---

# PC Controller

Control this Windows PC using the `pc-controller` MCP server (38 tools). All tools run via PowerShell on Windows 10/11.

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
| `pc-controller:file_edit` | Surgical search & replace — edit specific text without overwriting entire file |
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
pc-controller:file_edit(path="C:\\Users\\<username>\\config.json", old_string="port: 3000", new_string="port: 8080")
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

| Tool | Purpose |
|------|---------|
| `pc-controller:list_sessions` | List active terminal sessions |
| `pc-controller:read_process_output` | Read output from sessions with offset/length pagination |
| `pc-controller:interact_with_process` | Send input to running interactive processes |

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

### Code editing workflow
1. `file_read` → read the file
2. `content_search` → find the code to change
3. `file_edit` → surgically replace text
4. `file_read` → verify the change

## Safety Rules

- **Verify before destructive actions** — always check paths and process names
- **Use `process_list` before `process_kill`** — confirm the right process
- **Backup before `file_write`** on important files — it overwrites completely
- **Use `file_edit` instead of `file_write`** for small changes — safer, preserves formatting
- **Increase timeout** for slow commands instead of letting them fail
- **All paths must be absolute** — never use relative paths

## Detailed Reference

For full parameter details and advanced examples, see [reference/tools.md](reference/tools.md).
