---
name: pc-controller
description: Control a Windows PC via MCP tools — execute shell commands, read/write files, capture screenshots, get system info, search files, manage processes, open items, and control clipboard. Use when the user asks to run commands, check system status, take screenshots, manage files, control processes, or interact with the Windows desktop.
---

# PC Controller

Control this Windows PC using the `pc-controller` MCP server. All tools run via PowerShell on Windows 10/11.

## Tool Reference

### Shell Execution

**Quick commands** — `pc-controller:run_command`
- Default timeout: 30s, shell: PowerShell.exe
- Returns STDOUT + STDERR
- Use for: git, npm, pip, network diagnostics, registry queries, any CLI tool

**Long-running commands** — `pc-controller:run_command_long`
- Default timeout: 120s (2 min), larger buffer
- Use for: npm install, pip install, git clone, builds, test suites

```
pc-controller:run_command(command="git status", cwd="D:\\Projects\\myapp")
pc-controller:run_command_long(command="npm install", cwd="D:\\Projects\\myapp")
```

### File Operations

| Tool | Purpose |
|------|---------|
| `pc-controller:file_read` | Read file contents (text files, UTF-8 default) |
| `pc-controller:file_write` | Write/create file (auto-creates parent dirs, overwrites) |
| `pc-controller:dir_list` | List directory (supports recursive up to 3 levels) |
| `pc-controller:file_search` | Search files by glob pattern recursively |

**Always use absolute paths** (e.g., `C:\Users\rayss\Documents\config.json`).

```
pc-controller:file_read(path="D:\\config.json")
pc-controller:file_write(path="D:\\output.txt", content="result data")
pc-controller:dir_list(path="C:\\Users\\rayss\\Desktop", recursive=true)
pc-controller:file_search(pattern="*.log", directory="D:\\logs", max_results=100)
```

### Screen Capture

**`pc-controller:screen_capture`** — Takes PNG screenshot of primary monitor, returns base64 image.
- Optionally save to disk with `output_path`
- AI can view the image directly from the base64 response

```
pc-controller:screen_capture()
pc-controller:screen_capture(output_path="C:\\debug\\screen.png")
```

### System Info

**`pc-controller:sys_info`** — Returns hostname, OS, CPU, RAM, disk space, network IPs.
- No parameters needed

```
pc-controller:sys_info()
```

### Process Management

| Tool | Purpose |
|------|---------|
| `pc-controller:process_list` | List running processes (filter by name, sort by memory/cpu) |
| `pc-controller:process_kill` | Force-kill process by name or PID |

**Always list first, then kill.** Use PID for precision.

```
pc-controller:process_list(filter="chrome", sort_by="memory")
pc-controller:process_kill(pid=1234)
```

### Utilities

| Tool | Purpose |
|------|---------|
| `pc-controller:open_path` | Open file/folder/URL with default app |
| `pc-controller:clipboard_get` | Read current text content of system clipboard |
| `pc-controller:clipboard_set` | Copy text to system clipboard |
| `pc-controller:zip_create` | Compress files/folders into a .zip archive |
| `pc-controller:zip_extract` | Extract a .zip archive to a folder |
| `pc-controller:window_focus` | Bring a window to the foreground (by title/process) |
| `pc-controller:key_type` | Type text or send keys to the focused window |
| `pc-controller:notify` | Show a Windows notification balloon |

```
pc-controller:open_path(target="https://github.com")
pc-controller:clipboard_get()
pc-controller:clipboard_set(text="copied text")
pc-controller:zip_create(source="D:\\Projects\\myapp", destination="D:\\backup\\myapp.zip")
pc-controller:zip_extract(archive="D:\\backup\\myapp.zip", destination="D:\\Projects\\myapp")
pc-controller:window_focus(title="Notepad")
pc-controller:key_type(text="Hello world")
pc-controller:notify(title="Done", message="Backup completed")
```

**Shell selection** — `run_command` supports a `shell` parameter:
- `shell="powershell"` (default) — native Windows
- `shell="gitbash"` — Unix utilities (ls, grep, tar)
- `shell="wsl"` — real Linux via WSL (apt, bash scripts)

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

## Safety Rules

- **Verify before destructive actions** — always check paths and process names
- **Use `process_list` before `process_kill`** — confirm the right process
- **Backup before `file_write`** on important files — it overwrites completely
- **Increase timeout** for slow commands instead of letting them fail
- **All paths must be absolute** — never use relative paths

## Detailed Reference

For full parameter details and advanced examples, see [reference/tools.md](reference/tools.md).
