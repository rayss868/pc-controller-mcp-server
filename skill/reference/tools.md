# PC Controller Tools - Detailed Reference

Complete parameter reference for all 37 tools in the pc-controller MCP server.

---

## Shell Execution

### 1. run_command

Execute shell commands with timeout control. Default shell is PowerShell; Git Bash and WSL are available via the `shell` parameter.

**Parameters:**
- `command` (string, required): Shell command to execute
- `cwd` (string, optional): Working directory (absolute path). Default: user home directory
- `timeout` (number, optional): Timeout in milliseconds. Default: 30000 (30s)
- `shell` (string, optional): `"powershell"` (default), `"gitbash"`, or `"wsl"`

**Returns:** STDOUT and STDERR strings

**Examples:**
```
pc-controller:run_command(command="dir C:\\Users")
pc-controller:run_command(command="npm install", cwd="C:\\Users\\<username>\\Projects\\app")
pc-controller:run_command(command="ls -la", shell="gitbash")
pc-controller:run_command(command="grep -r 'TODO' src", cwd="C:\\Users\\<username>\\Projects\\app", shell="gitbash")
pc-controller:run_command(command="df -h && free -m", shell="wsl")
```

**Notes:**
- `shell="gitbash"` uses `C:\Program Files\Git\bin\bash.exe` for Unix utilities
- `shell="wsl"` uses `System32\bash.exe` (WSL default distro) for real Linux commands
- Dangerous commands will execute — verify before running

---

### 2. run_command_long

Execute long-running shell commands with extended timeout.

**Parameters:**
- `command` (string, required): Shell command to execute
- `cwd` (string, optional): Working directory (absolute path). Default: user home directory
- `timeout` (number, optional): Timeout in milliseconds. Default: 120000 (2 min)

**Returns:** Exit code, STDOUT, and STDERR

**Examples:**
```
pc-controller:run_command_long(command="npm install", cwd="C:\\Users\\<username>\\Projects\\app")
pc-controller:run_command_long(command="git clone https://github.com/user/repo.git", cwd="C:\\Users\\<username>\\Projects")
pc-controller:run_command_long(command="cargo build --release", cwd="C:\\Users\\<username>\\Projects\\rust-project")
```

**Notes:**
- Use for commands that take >30 seconds
- Larger output buffer than run_command

---

### 3. execute_code

Execute code in-memory using Python, Node.js, or R without saving files.

**Parameters:**
- `language` (string, required): `"python"`, `"node"`, or `"r"`
- `code` (string, required): Source code to execute

**Returns:** stdout/stderr output

**Examples:**
```
pc-controller:execute_code(language="python", code="print(sum(range(1, 101)))")
pc-controller:execute_code(language="node", code="console.log(2 + 2)")
pc-controller:execute_code(language="python", code="import os; print(os.listdir('.'))")
```

**Notes:**
- Python and R must be installed on the system
- Node.js is always available (server runs on it)
- 60 second timeout

---

## File Operations

### 4. file_read

Read text file contents with encoding support and line-range selection.

**Parameters:**
- `path` (string, required): Absolute file path
- `encoding` (string, optional): File encoding. Default: "utf-8"
- `offset` (number, optional): Starting line (1-based). Negative values count from the end (e.g., -100 = last 100 lines)
- `limit` (number, optional): Maximum number of lines to read. Default: 2000

**Returns:** File content string

**Examples:**
```
pc-controller:file_read(path="C:\\Users\\<username>\\Documents\\config.json")
pc-controller:file_read(path="C:\\Users\\<username>\\logs\\app.log", offset=-100)  # last 100 lines
pc-controller:file_read(path="C:\\Users\\<username>\\Projects\\app\\src\\index.ts", offset=50, limit=100)  # lines 50-150
```

**Notes:**
- For text files only (not binary)
- Use absolute paths
- Negative offset reads from the end (tail behavior)

---

### 5. file_write

Write text content to files with auto-directory creation.

**Parameters:**
- `path` (string, required): Absolute file path
- `content` (string, required): Text content to write

**Returns:** Success confirmation with path

**Examples:**
```
pc-controller:file_write(path="C:\\Users\\<username>\\Desktop\\output.txt", content="Hello World")
pc-controller:file_write(path="C:\\Users\\<username>\\Documents\\config.json", content="{\"key\": \"value\"}")
```

**Notes:**
- Creates parent directories if they don't exist
- Overwrites existing files completely
- Use `file_edit` for small changes instead

---

### 6. file_edit

Surgical search & replace — edit specific text without overwriting the entire file.

**Parameters:**
- `path` (string, required): Absolute file path
- `old_string` (string, required): Exact text to find
- `new_string` (string, required): Replacement text
- `replace_all` (boolean, optional): Replace all occurrences. Default: false

**Returns:** Confirmation with number of replacements

**Examples:**
```
pc-controller:file_edit(path="C:\\Users\\<username>\\config.json", old_string="port: 3000", new_string="port: 8080")
pc-controller:file_edit(path="C:\\Users\\<username>\\Projects\\app\\src\\app.ts", old_string="const DEBUG = false", new_string="const DEBUG = true")
```

**Notes:**
- `old_string` must match exactly (including whitespace)
- Fails if `old_string` is not found or matches multiple times (unless replace_all)
- Safer than file_write for small changes

---

### 7. file_move

Move or rename files and directories (auto-creates destination folders).

**Parameters:**
- `source` (string, required): Current path of file/directory
- `destination` (string, required): New path

**Returns:** Confirmation message

**Examples:**
```
pc-controller:file_move(source="C:\\Users\\<username>\\old.txt", destination="C:\\Users\\<username>\\archive\\old.txt")
pc-controller:file_move(source="C:\\Users\\<username>\\project", destination="D:\\backup\\project")
```

---

### 8. file_info

Get file metadata — size, created/modified dates, read-only status.

**Parameters:**
- `path` (string, required): Absolute file path

**Returns:** Size, creation date, modification date, read-only flag, type

**Examples:**
```
pc-controller:file_info(path="C:\\Users\\<username>\\Projects\\app\\package.json")
```

---

### 9. file_tail

Read last N lines or bytes of a file (Unix tail equivalent).

**Parameters:**
- `path` (string, required): Absolute file path
- `lines` (number, optional): Number of lines from the end. Default: 10
- `bytes` (number, optional): Number of bytes from the end (overrides lines)

**Returns:** Last N lines/bytes of the file

**Examples:**
```
pc-controller:file_tail(path="C:\\Users\\<username>\\logs\\app.log", lines=50)
pc-controller:file_tail(path="C:\\Users\\<username>\\logs\\app.log", bytes=1024)
```

---

### 10. file_search

Search files by glob pattern recursively.

**Parameters:**
- `pattern` (string, required): Glob pattern (*.txt, *.jpg, config*, etc.)
- `directory` (string, optional): Starting directory (absolute). Default: user home directory
- `max_results` (number, optional): Maximum results to return. Default: 50

**Returns:** Array of absolute file paths

**Examples:**
```
pc-controller:file_search(pattern="*.txt")
pc-controller:file_search(pattern="*.json", directory="C:\\Users\\<username>\\Projects")
pc-controller:file_search(pattern="*.log", directory="C:\\Users\\<username>\\logs", max_results=100)
```

---

### 11. content_search

Search text inside files recursively (grep-like, with line numbers).

**Parameters:**
- `pattern` (string, required): Text or regex pattern to search for
- `directory` (string, optional): Directory to search in. Default: user home directory
- `file_pattern` (string, optional): Glob to filter files (e.g., "*.ts"). Default: all files
- `max_results` (number, optional): Maximum matches. Default: 50

**Returns:** Matching lines with file paths and line numbers

**Examples:**
```
pc-controller:content_search(pattern="TODO", directory="C:\\Users\\<username>\\Projects\\src")
pc-controller:content_search(pattern="function login", directory="C:\\Users\\<username>\\Projects\\app", file_pattern="*.ts")
```

---

### 12. read_multiple_files

Read contents of multiple files simultaneously.

**Parameters:**
- `paths` (array of strings, required): List of absolute file paths

**Returns:** Content of each file, labeled by path

**Examples:**
```
pc-controller:read_multiple_files(paths=["C:\\Users\\<username>\\a.txt", "C:\\Users\\<username>\\b.txt", "C:\\Users\\<username>\\c.json"])
```

---

### 13. dir_list

List directory contents with optional recursion.

**Parameters:**
- `path` (string, optional): Directory path (absolute). Default: user home directory
- `recursive` (boolean, optional): List subdirectories recursively. Default: false
- `depth` (number, optional): Maximum recursion depth. Default: 3

**Returns:** Entries with name, type, size, modified date

**Examples:**
```
pc-controller:dir_list()
pc-controller:dir_list(path="C:\\Users\\<username>\\Desktop")
pc-controller:dir_list(path="C:\\Users\\<username>\\Projects", recursive=true, depth=2)
```

---

### 14. create_directory

Create directories recursively (mkdir -p equivalent).

**Parameters:**
- `path` (string, required): Directory path to create

**Returns:** Confirmation message

**Examples:**
```
pc-controller:create_directory(path="C:\\Users\\<username>\\Projects\\new-app\\src\\components")
```

---

### 15. copy_file

Copy files or directories to a new location.

**Parameters:**
- `source` (string, required): File/directory to copy
- `destination` (string, required): Target path

**Returns:** Confirmation message

**Examples:**
```
pc-controller:copy_file(source="C:\\Users\\<username>\\config.json", destination="C:\\Users\\<username>\\Desktop\\config.json")
pc-controller:copy_file(source="C:\\Users\\<username>\\project", destination="D:\\backup\\project")
```

---

### 16. delete_file

Delete files or directories permanently.

**Parameters:**
- `path` (string, required): File/directory to delete
- `recursive` (boolean, optional): Delete directory contents recursively. Default: false

**Returns:** Confirmation message

**Examples:**
```
pc-controller:delete_file(path="C:\\Users\\<username>\\temp\\old-file.txt")
pc-controller:delete_file(path="C:\\Users\\<username>\\temp\\old-folder", recursive=true)
```

**Notes:**
- WARNING: Permanent deletion, no recycle bin
- Use `recursive=true` for directories

---

### 17. preview_file

Preview file contents with rich formatting. Images returned as base64 for inline display.

**Parameters:**
- `path` (string, required): Absolute path to the file to preview

**Returns:** Base64 image (for images), markdown stats (for .md), code with metadata (for code files)

**Examples:**
```
pc-controller:preview_file(path="C:\\Users\\<username>\\Pictures\\photo.png")  # inline base64 image
pc-controller:preview_file(path="C:\\Users\\<username>\\Projects\\app\\README.md")  # markdown with stats
pc-controller:preview_file(path="C:\\Users\\<username>\\Projects\\app\\src\\index.ts")  # code with metadata
```

**Notes:**
- Supported images: PNG, JPG, JPEG, GIF, BMP, ICO, SVG, WEBP
- AI can view returned images directly

---

## Screen & System

### 18. screen_capture

Capture screenshot of primary monitor.

**Parameters:**
- `output_path` (string, optional): Save screenshot to this path (absolute)

**Returns:** Base64 PNG image (and path if saved)

**Examples:**
```
pc-controller:screen_capture()
pc-controller:screen_capture(output_path="C:\\Users\\<username>\\Pictures\\screen.png")
```

---

### 19. sys_info

Get comprehensive system information.

**Parameters:** None

**Returns:** Hostname, OS, CPU, RAM, disk space, network IPs

**Examples:**
```
pc-controller:sys_info()
```

---

### 20. process_list

List running processes with filtering and sorting.

**Parameters:**
- `filter` (string, optional): Filter by process name (partial match, case-insensitive)
- `sort_by` (string, optional): Sort by "name", "memory", or "cpu". Default: "memory"

**Returns:** Top 30 processes with name, PID, memory (MB), CPU time

**Examples:**
```
pc-controller:process_list()
pc-controller:process_list(filter="chrome")
pc-controller:process_list(sort_by="cpu")
```

---

### 21. process_kill

Force-terminate running processes.

**Parameters:**
- `name` (string, optional): Process name without .exe (kills ALL instances)
- `pid` (number, optional): Specific Process ID (kills one process)

**Returns:** Success confirmation

**Examples:**
```
pc-controller:process_kill(name="notepad")
pc-controller:process_kill(pid=1234)
```

**Notes:**
- WARNING: Cannot be undone, unsaved data lost
- Always use process_list first to identify target

---

## Utilities

### 22. open_path

Open files, folders, or URLs with default applications.

**Parameters:**
- `target` (string, required): File path, folder path, or URL

**Returns:** Success confirmation

**Examples:**
```
pc-controller:open_path(target="C:\\Documents\\report.pdf")
pc-controller:open_path(target="https://google.com")
pc-controller:open_path(target="C:\\Users\\<username>\\Desktop")
```

---

### 23. clipboard_get

Read the current text content of the system clipboard.

**Parameters:** None

**Returns:** Clipboard text content

**Examples:**
```
pc-controller:clipboard_get()
```

---

### 24. clipboard_set

Copy text to the system clipboard.

**Parameters:**
- `text` (string, required): Text to copy to the clipboard

**Returns:** Confirmation with character count

**Examples:**
```
pc-controller:clipboard_set(text="Hello World")
pc-controller:clipboard_set(text="npm install --save lodash")
```

---

### 25. zip_create

Create a ZIP archive from files or folders.

**Parameters:**
- `source` (string, required): File/folder to compress (supports wildcards)
- `destination` (string, required): Output .zip file path

**Returns:** Confirmation with archive path

**Examples:**
```
pc-controller:zip_create(source="C:\\Users\\<username>\\Projects\\app", destination="C:\\Users\\<username>\\Desktop\\myapp.zip")
pc-controller:zip_create(source="C:\\Users\\<username>\\logs\\*.log", destination="C:\\Users\\<username>\\Desktop\\logs.zip")
```

---

### 26. zip_extract

Extract a ZIP archive to a destination folder.

**Parameters:**
- `archive` (string, required): Path to the .zip file
- `destination` (string, required): Output folder (created automatically)

**Returns:** Confirmation with extraction path

**Examples:**
```
pc-controller:zip_extract(archive="C:\\Users\\<username>\\Downloads\\backup.zip", destination="C:\\Users\\<username>\\Projects\\app")
```

---

### 27. window_focus

Bring a window to the foreground by matching its title or process name.

**Parameters:**
- `title` (string, required): Window title or process name to focus

**Returns:** Success message or error if not found

**Examples:**
```
pc-controller:window_focus(title="Notepad")
pc-controller:window_focus(title="Visual Studio Code")
```

---

### 28. key_type

Type text or send keystrokes to the currently focused window.

**Parameters:**
- `text` (string, optional): Literal text to type (special characters auto-escaped)
- `keys` (string, optional): Raw SendKeys string for shortcuts (takes precedence over text)
- `delay_ms` (number, optional): Delay between characters in ms. Default: 0

**Returns:** Confirmation of typed characters/sent keys

**Examples:**
```
pc-controller:key_type(text="Hello world")
pc-controller:key_type(keys="^s")            # Ctrl+S (save)
pc-controller:key_type(keys="{ENTER}")        # Enter key
pc-controller:key_type(keys="%{F4}")          # Alt+F4
```

**SendKeys reference:**
- `^c` = Ctrl+C, `^v` = Ctrl+V, `^a` = Ctrl+A, `^s` = Ctrl+S
- `{ENTER}`, `{TAB}`, `{ESC}`, `{BACKSPACE}`, `{DEL}`, `{UP}`, `{DOWN}`
- `{F1}`–`{F12}`, `%{F4}` = Alt+F4

---

### 29. notify

Show a Windows notification balloon.

**Parameters:**
- `title` (string, required): Notification title
- `message` (string, required): Notification message body

**Returns:** Confirmation message

**Examples:**
```
pc-controller:notify(title="Build Finished", message="npm run build completed successfully")
```

---

## Terminal Sessions

### 30. list_sessions

List all active terminal sessions managed by this server.

**Parameters:** None

**Returns:** Session IDs, creation times, output line counts, alive status

**Examples:**
```
pc-controller:list_sessions()
```

---

### 31. read_process_output

Read buffered output from a long-running session with pagination.

**Parameters:**
- `session_id` (string, required): Session ID from list_sessions
- `offset` (number, optional): Starting line index. Default: 0
- `length` (number, optional): Number of lines to read. Default: 100

**Returns:** Output lines from the session

**Examples:**
```
pc-controller:read_process_output(session_id="session-1")
pc-controller:read_process_output(session_id="session-1", offset=50, length=20)
```

---

### 32. interact_with_process

Send input to a running interactive process (SSH, database CLIs, dev servers).

**Parameters:**
- `session_id` (string, required): Session ID from list_sessions
- `input` (string, required): Input to send to the process

**Returns:** Confirmation message

**Examples:**
```
pc-controller:interact_with_process(session_id="session-1", input="ls -la")
pc-controller:interact_with_process(session_id="session-1", input="SELECT * FROM users;")
pc-controller:interact_with_process(session_id="session-1", input="y")
```

---

## Configuration & Monitoring

### 33. config_get

Get the complete server configuration.

**Parameters:** None

**Returns:** JSON with blockedCommands, defaultShell, fileReadLineLimit, fileWriteLineLimit

**Examples:**
```
pc-controller:config_get()
```

---

### 34. config_set

Set a configuration value at runtime. Changes take effect immediately.

**Parameters:**
- `key` (string, required): Config key: "defaultShell", "blockedCommands", "fileReadLineLimit", "fileWriteLineLimit"
- `value` (string, required): New value (JSON array string for arrays)

**Returns:** Confirmation with updated value

**Examples:**
```
pc-controller:config_set(key="defaultShell", value="bash")
pc-controller:config_set(key="blockedCommands", value='["rm -rf", "format"]')
pc-controller:config_set(key="fileReadLineLimit", value="5000")
```

---

### 35. get_usage_stats

Get usage statistics for the current server session.

**Parameters:** None

**Returns:** Per-tool call counts, error rates, last-used timestamps

**Examples:**
```
pc-controller:get_usage_stats()
```

---

### 36. get_recent_tool_calls

Get the most recent tool calls with full details.

**Parameters:**
- `limit` (number, optional): Number of recent calls to return. Default: 20

**Returns:** Tool name, arguments, success/failure, duration in ms

**Examples:**
```
pc-controller:get_recent_tool_calls()
pc-controller:get_recent_tool_calls(limit=5)
```

---

## Network

### 37. read_url

Fetch content from a URL and return it as text.

**Parameters:**
- `url` (string, required): URL to fetch (must start with http:// or https://)
- `timeout` (number, optional): Request timeout in seconds. Default: 30

**Returns:** Page/API content as text (truncated at 50KB)

**Examples:**
```
pc-controller:read_url(url="https://api.github.com/repos/user/repo")
pc-controller:read_url(url="https://raw.githubusercontent.com/user/repo/main/README.md")
pc-controller:read_url(url="http://localhost:3000/api/data")
```

---

## Documentation

### 38. read_skill_docs

Read the PC Controller skill documentation files. Provides access to the complete AI skill reference — a structured guide describing all 38 available tools, their parameters, usage examples, workflows, and safety rules. Use this tool when you need to understand what capabilities the PC Controller MCP server offers, how to invoke specific tools correctly, or what workflows are available for common tasks. The skill documentation is the authoritative source for tool usage and is updated alongside code changes.

**Parameters:**
- `file` (string, required): Which documentation file to read: `"SKILL.md"` (overview with workflows), `"reference/tools.md"` (full parameter reference), or `"all"` (both files concatenated)

**Returns:** Full markdown content of the requested skill file(s)

**Examples:**
```
pc-controller:read_skill_docs(file="SKILL.md")         # tool overview and workflows
pc-controller:read_skill_docs(file="reference/tools.md")  # full parameter reference
pc-controller:read_skill_docs(file="all")              # everything
```

---

## Error Handling

All tools return error information when something goes wrong:

**Common errors:**
- File not found: Check absolute path
- Access denied: Check permissions or run as Administrator
- Timeout: Increase timeout parameter
- Process not found: Verify with process_list first
- Invalid command: Check PowerShell syntax

---

## Best Practices

1. **Always use absolute paths** — never relative paths
2. **Verify before destructive actions** — check paths, process names
3. **Use process_list before process_kill** — confirm the right target
4. **Use file_edit instead of file_write** for small changes — safer
5. **Increase timeout for slow commands** — don't let them fail
6. **Backup before file_write** on important files — it overwrites
7. **Use PID for process_kill** when possible — more precise than name
8. **Limit file_search results** — use max_results to avoid overwhelming output
9. **Test commands with run_command** before using run_command_long
10. **Use read_process_output with pagination** — avoid flooding context
