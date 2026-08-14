# PC Controller Tools - Detailed Reference

Complete parameter reference for all 18 tools in the pc-controller MCP server.

---

## 1. run_command

Execute shell commands with timeout control. Default shell is PowerShell; Git Bash and WSL are available via the `shell` parameter.

**Parameters:**
- `command` (string, required): Shell command to execute
- `cwd` (string, optional): Working directory (absolute path). Default: user home directory
- `timeout` (number, optional): Timeout in milliseconds. Default: 30000 (30s)
- `shell` (string, optional): `"powershell"` (default), `"gitbash"`, or `"wsl"`

**Returns:** Object with `stdout` and `stderr` strings

**Examples:**
```
pc-controller:run_command(command="dir C:\\Users")
pc-controller:run_command(command="npm install", cwd="D:\\Projects\\app")
pc-controller:run_command(command="git log --oneline -10", cwd="D:\\Projects\\app", timeout=10000)
pc-controller:run_command(command="Get-Process | Where-Object {$_.CPU -gt 100}")
pc-controller:run_command(command="ping -n 4 google.com")
pc-controller:run_command(command="ipconfig /all")
pc-controller:run_command(command="ls -la", shell="gitbash")
pc-controller:run_command(command="grep -r 'TODO' src", cwd="D:\\Projects\\app", shell="gitbash")
pc-controller:run_command(command="df -h && free -m", shell="wsl")
pc-controller:run_command(command="sudo apt update", shell="wsl")
```

**Notes:**
- Default shell is PowerShell.exe (native Windows — always available)
- `shell="gitbash"` uses `C:\Program Files\Git\bin\bash.exe` for Unix utilities (ls, grep, tar)
- `shell="wsl"` uses `System32\bash.exe` (WSL default distro, e.g. Ubuntu) for real Linux commands
- Returns both STDOUT and STDERR
- Increase timeout for slow commands
- Dangerous commands will execute — verify before running

---

## 2. run_command_long

Execute long-running shell commands with extended timeout.

**Parameters:**
- `command` (string, required): Shell command to execute
- `cwd` (string, optional): Working directory (absolute path). Default: user home directory
- `timeout` (number, optional): Timeout in milliseconds. Default: 120000 (2 min)

**Returns:** Object with `stdout` and `stderr` strings

**Examples:**
```
pc-controller:run_command_long(command="npm install", cwd="D:\\Projects\\app")
pc-controller:run_command_long(command="pip install tensorflow")
pc-controller:run_command_long(command="git clone https://github.com/user/repo.git", cwd="D:\\Projects")
pc-controller:run_command_long(command="cargo build --release", cwd="D:\\Rust\\project")
pc-controller:run_command_long(command="mvn clean install", cwd="D:\\Java\\app", timeout=300000)
```

**Notes:**
- Use for commands that take >30 seconds
- Larger output buffer than run_command
- Returns exit code, STDOUT, and STDERR

---

## 3. file_read

Read text file contents with encoding support.

**Parameters:**
- `path` (string, required): Absolute file path
- `encoding` (string, optional): File encoding. Default: "utf-8". Options: "utf-8", "ascii", "latin1", "utf16le"

**Returns:** Object with `content` string

**Examples:**
```
pc-controller:file_read(path="C:\\Users\\rayss\\Documents\\config.json")
pc-controller:file_read(path="D:\\Projects\\app\\src\\index.ts")
pc-controller:file_read(path="C:\\Windows\\System32\\drivers\\etc\\hosts")
pc-controller:file_read(path="D:\\logs\\app.log", encoding="latin1")
```

**Notes:**
- For text files only (not binary)
- Use absolute paths
- Returns full file content as string

---

## 4. file_write

Write text content to files with auto-directory creation.

**Parameters:**
- `path` (string, required): Absolute file path
- `content` (string, required): Text content to write

**Returns:** Object with `success` boolean and `path` string

**Examples:**
```
pc-controller:file_write(path="D:\\output.txt", content="Hello World")
pc-controller:file_write(path="C:\\Users\\rayss\\config.json", content="{\"key\": \"value\"}")
pc-controller:file_write(path="D:\\Projects\\app\\data.csv", content="name,age\nJohn,30\nJane,25")
```

**Notes:**
- Creates parent directories if they don't exist
- Overwrites existing files completely
- Use absolute paths
- UTF-8 encoding

---

## 5. dir_list

List directory contents with optional recursion.

**Parameters:**
- `path` (string, optional): Directory path (absolute). Default: user home directory
- `recursive` (boolean, optional): List subdirectories recursively. Default: false
- `max_depth` (number, optional): Maximum recursion depth. Default: 3

**Returns:** Object with `entries` array containing name, type, size, modified date

**Examples:**
```
pc-controller:dir_list()
pc-controller:dir_list(path="C:\\Users\\rayss\\Desktop")
pc-controller:dir_list(path="D:\\Projects", recursive=true)
pc-controller:dir_list(path="C:\\Program Files", recursive=true, max_depth=2)
```

**Notes:**
- Shows file/folder name, type, size, modified date
- Recursive mode limited to max_depth levels
- Skips permission errors in recursive mode

---

## 6. file_search

Search files by glob pattern recursively.

**Parameters:**
- `pattern` (string, required): Glob pattern (*.txt, *.jpg, config*, etc.)
- `directory` (string, optional): Starting directory (absolute). Default: user home directory
- `max_results` (number, optional): Maximum results to return. Default: 50

**Returns:** Object with `files` array of absolute paths

**Examples:**
```
pc-controller:file_search(pattern="*.txt")
pc-controller:file_search(pattern="*.json", directory="D:\\Projects")
pc-controller:file_search(pattern="config*", directory="C:\\Users\\rayss")
pc-controller:file_search(pattern="*.log", directory="D:\\logs", max_results=100)
pc-controller:file_search(pattern="report_*.xlsx", directory="C:\\Users\\rayss\\Documents")
```

**Notes:**
- Uses PowerShell Get-ChildItem (fast)
- Recursive search through all subdirectories
- Returns absolute file paths

---

## 7. screen_capture

Capture screenshot of primary monitor.

**Parameters:**
- `output_path` (string, optional): Save screenshot to this path (absolute)

**Returns:** Object with `image` (base64 PNG) and `path` (if saved)

**Examples:**
```
pc-controller:screen_capture()
pc-controller:screen_capture(output_path="C:\\Screenshots\\screen.png")
pc-controller:screen_capture(output_path="D:\\debug\\ui_state.png")
```

**Notes:**
- Returns base64-encoded PNG image
- AI can view the image directly
- Optionally saves to disk
- Full monitor resolution

---

## 8. sys_info

Get comprehensive system information.

**Parameters:** None

**Returns:** Object with hostname, OS, CPU, RAM, disk, network information

**Examples:**
```
pc-controller:sys_info()
```

**Notes:**
- No parameters needed
- Returns formatted system overview
- Includes CPU model, core count, clock speed
- Shows total/free/used RAM
- Lists disk space per drive
- Shows network interfaces with IPs

---

## 9. process_list

List running processes with filtering and sorting.

**Parameters:**
- `filter` (string, optional): Filter by process name (partial match, case-insensitive)
- `sort_by` (string, optional): Sort by "name", "memory", or "cpu". Default: "memory"

**Returns:** Object with `processes` array containing name, PID, memory (MB), CPU time (s)

**Examples:**
```
pc-controller:process_list()
pc-controller:process_list(filter="chrome")
pc-controller:process_list(filter="node", sort_by="memory")
pc-controller:process_list(sort_by="cpu")
pc-controller:process_list(filter="code", sort_by="name")
```

**Notes:**
- Shows top 30 processes
- Filter is partial match (e.g., "chr" matches "chrome")
- Sort by memory to find RAM hogs
- Sort by CPU to find CPU-intensive processes
- Use before process_kill to identify target

---

## 10. process_kill

Force-terminate running processes.

**Parameters:**
- `name` (string, optional): Process name without .exe (kills ALL instances)
- `pid` (number, optional): Specific Process ID (kills one process)

**Returns:** Object with `success` boolean and `message` string

**Examples:**
```
pc-controller:process_kill(name="notepad")
pc-controller:process_kill(pid=1234)
pc-controller:process_kill(name="chrome")
```

**Notes:**
- WARNING: Cannot be undone, unsaved data lost
- Use `name` to kill all instances of a process
- Use `pid` to kill specific process (safer)
- Always use process_list first to identify target
- Force-kills without confirmation

---

## 11. open_path

Open files, folders, or URLs with default applications.

**Parameters:**
- `target` (string, required): File path, folder path, or URL

**Returns:** Object with `success` boolean and `message` string

**Examples:**
```
pc-controller:open_path(target="C:\\Documents\\report.pdf")
pc-controller:open_path(target="C:\\Users\\rayss\\Desktop")
pc-controller:open_path(target="https://google.com")
pc-controller:open_path(target="D:\\Projects\\app\\index.html")
pc-controller:open_path(target="C:\\Program Files\\MyApp\\app.exe")
```

**Notes:**
- Files: Opens with registered application
- Folders: Opens in Windows Explorer
- URLs: Opens in default browser
- Uses Windows Start-Process

---

## 12. clipboard_get

Read the current text content of the system clipboard.

**Parameters:** None

**Returns:** Object with `content` string (or "(clipboard is empty)" when nothing is copied)

**Examples:**
```
pc-controller:clipboard_get()
```

**Notes:**
- Returns the last copied item
- Useful to grab data copied from other applications
- Works on any text content (files, URLs, selected text)

---

## 13. clipboard_set

Copy text to the system clipboard.

**Parameters:**
- `text` (string, required): Text to copy to the clipboard

**Returns:** Object with confirmation message and character count

**Examples:**
```
pc-controller:clipboard_set(text="Hello World")
pc-controller:clipboard_set(text="Project version: 1.2.3")
pc-controller:clipboard_set(text="npm install --save lodash")
```

**Notes:**
- Copies text to clipboard
- User can then paste (Ctrl+V) in any app
- Useful for transferring data between apps

---

## 14. zip_create

Create a ZIP archive from files or folders using PowerShell Compress-Archive.

**Parameters:**
- `source` (string, required): File/folder to compress. Can use wildcards (e.g. `D:\logs\*.log`)
- `destination` (string, required): Output .zip file path (should end in .zip)

**Returns:** Confirmation message with the created archive path

**Examples:**
```
pc-controller:zip_create(source="D:\\Projects\\myapp", destination="D:\\backup\\myapp.zip")
pc-controller:zip_create(source="D:\\logs\\*.log", destination="D:\\backup\\logs.zip")
```

**Notes:**
- Creates the .zip with `-Force` (overwrites existing destination)
- Returns an error if the source does not exist
- Supports wildcards in source

---

## 15. zip_extract

Extract a ZIP archive to a destination folder using PowerShell Expand-Archive.

**Parameters:**
- `archive` (string, required): Path to the .zip file to extract
- `destination` (string, required): Output folder (created automatically if missing)

**Returns:** Confirmation message with the extraction path

**Examples:**
```
pc-controller:zip_extract(archive="D:\\downloads\\backup.zip", destination="D:\\Projects\\myapp")
```

**Notes:**
- Destination folder is created automatically
- Overwrites existing files in the destination

---

## 16. window_focus

Bring a window to the foreground by matching its title or process name (case-insensitive).

**Parameters:**
- `title` (string, required): Window title or process name to focus

**Returns:** Success message, or error if no matching window is found

**Examples:**
```
pc-controller:window_focus(title="Notepad")
pc-controller:window_focus(title="Visual Studio Code")
pc-controller:window_focus(title="chrome")
```

**Notes:**
- Matches any open window whose title contains the given text (case-insensitive)
- Call before `key_type` to make sure the target window is active
- Returns an error when no matching window is found

---

## 17. key_type

Type text or send keystrokes to the currently focused window using PowerShell SendKeys.

**Parameters:**
- `text` (string, optional): Literal text to type — special characters are escaped automatically
- `keys` (string, optional): Raw SendKeys string for shortcuts/special keys (takes precedence over `text`)
- `delay_ms` (number, optional): Delay between characters in milliseconds (text mode only). Default: 0

**Returns:** Confirmation of typed characters / sent keys

**Examples:**
```
pc-controller:key_type(text="Hello world")
pc-controller:key_type(text="npm install", delay_ms=50)
pc-controller:key_type(keys="^s")            # Ctrl+S (save)
pc-controller:key_type(keys="{ENTER}")        # Enter key
pc-controller:key_type(keys="%{F4}")          # Alt+F4 (close window)
```

**SendKeys reference for `keys`:**
- `^c` = Ctrl+C, `^v` = Ctrl+V, `^a` = Ctrl+A, `^s` = Ctrl+S
- `{ENTER}`, `{TAB}`, `{ESC}`, `{BACKSPACE}`, `{DEL}`, `{UP}`, `{DOWN}`, `{LEFT}`, `{RIGHT}`
- `{F1}`–`{F12}`, `%{F4}` = Alt+F4, `+{TAB}` = Shift+Tab

**Notes:**
- Call `window_focus` first to activate the target window
- `text` is escaped so literal characters like `+ ^ % ~ ( ) { }` are typed as-is
- `keys` sends raw SendKeys syntax and is NOT escaped — use it for shortcuts

---

## 18. notify

Show a Windows notification balloon with the given title and message.

**Parameters:**
- `title` (string, required): Notification title
- `message` (string, required): Notification message body

**Returns:** Confirmation message

**Examples:**
```
pc-controller:notify(title="Build Finished", message="npm run build completed successfully")
pc-controller:notify(title="Download Ready", message="Your file is ready to install")
```

**Notes:**
- Notification stays visible for ~6 seconds
- Uses a Windows Forms NotifyIcon balloon (no extra dependencies)
- Good for alerting the user when a long task completes

---

## Error Handling

All tools return error information when something goes wrong:

**Error response format:**
```json
{
  "error": true,
  "message": "Error description",
  "details": "Additional error details"
}
```

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
4. **Increase timeout for slow commands** — don't let them fail
5. **Backup before file_write** on important files — it overwrites
6. **Use PID for process_kill** when possible — more precise than name
7. **Check return values** — all tools return success/error info
8. **Filter process_list** — don't list all processes when looking for specific app
9. **Limit file_search results** — use max_results to avoid overwhelming output
10. **Test commands with run_command** before using run_command_long

---

## PowerShell Tips

Since all shell commands run via PowerShell:

**Useful commands:**
- `Get-Command` — list available commands
- `Get-Help <command>` — get command help
- `|` — pipe commands together
- `Where-Object` — filter objects
- `Select-Object` — select properties
- `Format-Table` — format output as table
- `Get-Content` — read file contents
- `Set-Content` — write to file
- `Copy-Item` — copy files
- `Move-Item` — move files
- `Remove-Item` — delete files

**Examples:**
```powershell
Get-Process | Where-Object {$_.Memory -gt 100MB} | Select-Object Name, Id, Memory
Get-ChildItem -Recurse -Filter "*.log" | Select-Object FullName, Length
Get-Volume | Select-Object DriveLetter, SizeRemaining, Size
Test-NetConnection google.com -Port 443
```
