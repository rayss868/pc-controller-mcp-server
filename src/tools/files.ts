import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execAsync, formatBytes } from "../helpers.js";

export function registerFilesTools(server: McpServer) {
  //  TOOL 2: Read File Contents
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "file_read",
    `Read and return the text contents of a file on this Windows PC.
  Supports all text-based files: .txt, .json, .js, .ts, .py, .md, .csv, .xml, .yaml,
  .html, .css, .log, .env, .ini, .bat, .ps1, .toml, and other text files.
  Supports optional line ranges (offset/limit) and negative offsets (read from end of file).
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
      offset: z
        .number()
        .optional()
        .describe(
          "Line offset to start reading from (0-based). Positive = start from beginning. Negative = start from end of file. Example: -10 = last 10 lines."
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of lines to return. Default: all lines. Example: limit=100 returns lines 1-100 (or offset to offset+100)."
        ),
    },
    async ({ path: filePath, encoding, offset, limit }) => {
      try {
        const content = await fs.readFile(filePath, {
          encoding: (encoding as BufferEncoding) || "utf-8",
        });
  
        if (offset === undefined && limit === undefined) {
          return {
            content: [{ type: "text" as const, text: content }],
          };
        }
  
        const lines = content.split("\n");
        let start = offset || 0;
        if (start < 0) {
          start = Math.max(0, lines.length + start);
        }
        const end = limit ? Math.min(lines.length, start + limit) : lines.length;
        const slice = lines.slice(start, end).join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `Lines ${start + 1}-${end} of ${lines.length}:\n${slice}`,
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
          "The full text content to write into the file. Can be JSON, source code, configuration, or any text. For surgical edits, use file_edit tool instead."
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
  type (folder or file), file size, and last modified date.
  Supports recursive mode with configurable depth limit.
  Use this to explore folder structures, locate files, check file sizes,
  or inspect directory contents. If no path is provided, lists the user's home directory.`,
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
          "If true, also list contents of sub-folders recursively. Default: false. Use depth parameter to limit how deep to go."
        ),
      depth: z
        .number()
        .optional()
        .describe("Maximum depth for recursive listing. Default: 3. Example: depth=1 lists immediate children only, depth=5 goes 5 levels deep."),
    },
    async ({ path: dirPath, recursive, depth }) => {
      try {
        const targetPath = dirPath || os.homedir();
  
        async function listDir(dir: string, currentDepth: number): Promise<string[]> {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const lines: string[] = [];
          const maxDepth = depth || 3;
  
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const stat = await fs.stat(fullPath);
            const indent = "  ".repeat(currentDepth);
            const type = entry.isDirectory() ? "[DIR]" : "[FILE]";
            const size = entry.isFile()
              ? ` (${formatBytes(stat.size)})`
              : "";
            const modified = stat.mtime.toISOString().split("T")[0];
            lines.push(
              `${indent}${type} ${entry.name}${size} [${modified}]`
            );
  
            if (recursive && entry.isDirectory() && currentDepth < maxDepth) {
              try {
                const subLines = await listDir(fullPath, currentDepth + 1);
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
          'File search pattern (glob pattern). Examples: "*.txt" (all text files), "*.png" (all PNG images), "config*" (files starting with config), "*.log" (all log files), "report_*.xlsx" (Excel reports with prefix)'
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
          "Maximum number of results to return. Default: 50. Increase for broader searches (e.g., 500), decrease for faster results."
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
  
  //  TOOL 19: Surgical File Edit (Search & Replace)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "file_edit",
    `Surgically edit a file by searching for exact text and replacing it. Unlike file_write
  (which overwrites the whole file), this only touches the matched parts. Built for
  agent-style editing:
  - Returns a compact git-style unified diff of the change (with a little context), so you
    can verify the result without re-reading the whole file or waiting on a large payload.
  - dry_run=true previews the diff WITHOUT writing, so a failed match is caught before any
    change is committed (avoids retry loops over a bridge/tunnel).
  - If old_text is NOT found exactly, it returns a helpful "not found" error listing
    nearby lines to help you adjust the search.
  Use this for code edits, config changes, renaming variables, or any targeted
  modification. For many small edits in sequence, prefer file_edit_batch to do them in
  one round-trip.`,
    {
      path: z
        .string()
        .describe(
          "Absolute path to the file to edit.\nExample: D:\\Projects\\app\\src\\index.ts"
        ),
      old_text: z
        .string()
        .describe(
          "Exact text to find and replace. Must match exactly including whitespace and indentation. If it does not match, the tool reports nearby lines to help you fix the search."
        ),
      new_text: z
        .string()
        .describe(
          "Text to replace the old_text with. Can be empty string to delete the old_text."
        ),
      replace_all: z
        .boolean()
        .optional()
        .describe(
          "If true, replace ALL occurrences of old_text. If false (default), replace only the first occurrence. Use replace_all=true to rename variables across a file."
        ),
      dry_run: z
        .boolean()
        .optional()
        .describe(
          "If true, compute and return the diff without writing to disk. Use this first to preview a change before committing it. Default: false."
        ),
    },
    async ({ path: filePath, old_text, new_text, replace_all, dry_run }) => {
      try {
        let content = await fs.readFile(filePath, "utf-8");
        if (!content.includes(old_text)) {
          return {
            content: [
              {
                type: "text" as const,
                text: buildNotFoundMessage(filePath, content, old_text),
              },
            ],
            isError: true,
          };
        }

        let count: number;
        const firstIdx = content.indexOf(old_text);
        let newContent = content;
        if (replace_all) {
          const parts = content.split(old_text);
          count = parts.length - 1;
          newContent = parts.join(new_text);
        } else {
          const idx = content.indexOf(old_text);
          newContent =
            content.substring(0, idx) + new_text + content.substring(idx + old_text.length);
          count = 1;
        }

        const diff = buildEditDiff(content, firstIdx, old_text, new_text);

        const executed = dry_run ? false : true;
        if (!dry_run) {
          await fs.writeFile(filePath, newContent, "utf-8");
        }

        const changed = count > 0;
        return {
          content: [
            {
              type: "text" as const,
              text:
                `${dry_run ? "DRY RUN (not written)" : `Replaced ${count} occurrence(s) in ${filePath}`}\n` +
                `\`\`\`diff\n${diff}\n\`\`\``,
            },
          ],
          structuredContent: {
            path: filePath,
            executed,
            dryRun: dry_run ?? false,
            replaced: changed ? count : 0,
            diff,
          },
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
  
  //  TOOL 20: Move / Rename File or Directory
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "file_move",
    `Move or rename a file or directory on this Windows PC. If source and destination are on
  the same drive, the item is moved. If across drives, it is copied then deleted. Destination
  parent directories are created automatically. Use this to reorganize files, rename items,
  or move folders between drives.`,
    {
      source: z
        .string()
        .describe(
          "Current absolute path of the file or folder.\nExamples:\n- D:\\old\\file.txt\n- C:\\Users\\rayss\\Desktop\\project"
        ),
      destination: z
        .string()
        .describe(
          "Target absolute path (new location or new name).\nExamples:\n- D:\\new\\file.txt (move)\n- D:\\archive\\file_backup.txt (rename + move)\n- C:\\Users\\rayss\\Documents\\project (move folder)"
        ),
    },
    async ({ source, destination }) => {
      try {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.rename(source, destination);
        return {
          content: [
            {
              type: "text" as const,
              text: `Moved: ${source} -> ${destination}`,
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
  
  //  TOOL 21: Get File/Directory Metadata
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "file_info",
    `Get detailed metadata about a file or directory: size, created date, modified date,
  accessed date, whether it's a file or directory, and read-only status. Use this to check
  if a file exists before reading, check file sizes, or verify modification times.`,
    {
      path: z
        .string()
        .describe(
          "Absolute path to the file or directory.\nExamples:\n- D:\\Projects\\app\\package.json\n- C:\\Users\\rayss\\Documents\n- D:\\backup\\archive.zip"
        ),
    },
    async ({ path: filePath }) => {
      try {
        const stat = await fs.stat(filePath);
        const info = [
          `Type:       ${stat.isDirectory() ? "Directory" : "File"}`,
          `Size:       ${formatBytes(stat.size)}`,
          `Created:    ${stat.birthtime.toISOString()}`,
          `Modified:   ${stat.mtime.toISOString()}`,
          `Accessed:   ${stat.atime.toISOString()}`,
          `Read-only:  ${stat.mode}`,
          `Path:       ${filePath}`,
        ].join("\n");
  
        return {
          content: [{ type: "text" as const, text: info }],
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
  
  //  TOOL 22: Tail / Read from End of File
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "file_tail",
    `Read the last N lines or last N bytes of a file. Equivalent to Unix 'tail' command.
  Use this to check the end of log files, view recent entries in data files, or inspect
  the tail of large files without reading the entire content.`,
    {
      path: z
        .string()
        .describe(
          "Absolute path to the file.\nExamples:\n- D:\\logs\\app.log\n- C:\\Windows\\Logs\\DISM\\dism.log"
        ),
      lines: z
        .number()
        .optional()
        .describe(
          "Number of lines to read from the end. Default: 50.\nExamples: 10 (last 10 lines), 100 (last 100 lines), 500 (last 500 lines)"
        ),
      bytes: z
        .number()
        .optional()
        .describe(
          "Number of bytes to read from the end. Overrides 'lines' if set.\nExamples: 1024 (last 1KB), 4096 (last 4KB), 1048576 (last 1MB)"
        ),
    },
    async ({ path: filePath, lines, bytes }) => {
      try {
        const stat = await fs.stat(filePath);
  
        if (bytes) {
          const buffer = Buffer.alloc(Math.min(bytes, stat.size));
          const fd = await fs.open(filePath, "r");
          await fd.read(buffer, 0, buffer.length, stat.size - buffer.length);
          await fd.close();
          return {
            content: [
              { type: "text" as const, text: buffer.toString("utf-8") },
            ],
          };
        }
  
        const lineCount = lines || 50;
        const content = await fs.readFile(filePath, "utf-8");
        const allLines = content.split("\n");
        const tail = allLines.slice(-lineCount).join("\n");
  
        return {
          content: [
            {
              type: "text" as const,
              text: `--- Last ${Math.min(lineCount, allLines.length)} lines of ${filePath} ---\n${tail}`,
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
  
  //  TOOL 23: Search Inside File Contents (Grep)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "content_search",
    `Search for text inside files using pattern matching (like Unix grep). Search is recursive
  through all sub-folders. Returns matching lines with file paths and line numbers. Use this
  to find where a variable is used, locate error messages in logs, find configuration keys,
  or trace code references across a project.`,
    {
      pattern: z
        .string()
        .describe(
          'Text or regex pattern to search for.\nExamples:\n- "TODO" — find TODO comments\n- "function\\(" — find function declarations\n- "import.*react" — find React imports\n- "error|Error|ERROR" — find error mentions\n- "localhost:3000" — find port references'
        ),
      directory: z
        .string()
        .optional()
        .describe(
          "Directory to search in. Default: current working directory.\nExamples: D:\\Projects\\app\\src, C:\\Users\\rayss\\Documents"
        ),
      glob: z
        .string()
        .optional()
        .describe(
          "File filter glob.\nExamples:\n- '*.ts' — TypeScript files only\n- '*.log' — log files\n- '*.json' — JSON files\n- '*.{js,ts}' — JS and TS files\n- 'Dockerfile' — specific filename"
        ),
      max_results: z
        .number()
        .optional()
        .describe("Maximum results to return. Default: 50. Increase for broader searches."),
      case_insensitive: z
        .boolean()
        .optional()
        .describe("Case-insensitive search. Default: false. Set to true to ignore case."),
    },
    async ({ pattern, directory, glob, max_results, case_insensitive }) => {
      try {
        const searchDir = directory || os.homedir();
        const max = max_results || 50;
        const flags = case_insensitive ? "-i" : "";
        const filter = glob ? `-Include '${glob}'` : "";
  
        const ps = `Get-ChildItem -Path '${searchDir}' -Recurse -File ${filter} -ErrorAction SilentlyContinue | Select-String -Pattern '${pattern.replace(/'/g, "''")}' ${flags ? `-CaseSensitive:$false` : ""} | Select-Object -First ${max} | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }`;
        const { stdout } = await execAsync(
          `powershell.exe -Command "${ps}"`,
          { timeout: 30000, maxBuffer: 1024 * 1024 * 5 }
        );
  
        const results = stdout.trim();
        if (!results) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No matches found for "${pattern}" in ${searchDir}`,
              },
            ],
          };
        }
  
        const matchCount = results.split("\n").length;
        return {
          content: [
            {
              type: "text" as const,
              text: `${matchCount} match(es) for "${pattern}":\n\n${results}`,
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
  
  //  TOOL 24: Read Multiple Files
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "read_multiple_files",
    `Read contents of multiple files simultaneously. Returns each file's content
  labeled with its path. Useful for comparing files, loading configs, or reading
  related source files at once. Failed reads are reported but don't stop other files.`,
    {
      files: z
        .array(z.string())
        .describe(
          'Array of absolute file paths to read.\nExample: ["D:\\project\\package.json", "D:\\project\\tsconfig.json", "D:\\project\\.env"]'
        ),
    },
    async ({ files }) => {
      const results: string[] = [];
      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, "utf-8");
          results.push(`=== ${filePath} ===\n${content}`);
        } catch (error: any) {
          results.push(`=== ${filePath} ===\nERROR: ${error.message}`);
        }
      }
      return {
        content: [{ type: "text" as const, text: results.join("\n\n") }],
      };
    }
  );
  
  // ═══════════════════════════════════════════════════════════════════════
  
  //  TOOL 25: Create Directory
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "create_directory",
    `Create a new directory on this Windows PC, including any necessary parent
  directories (equivalent to Unix 'mkdir -p'). Does nothing if the directory
  already exists. Use this to set up project folder structures, ensure output
  directories exist before writing files, or organize files into new folders.
  Parent directories are created automatically — you only need to specify the
  full target path.`,
    {
      path: z
        .string()
        .describe(
          'Absolute path of the directory to create.\nExamples:\n- D:\\Projects\\new-app\\src\\components\n- C:\\Users\\rayss\\Documents\\backup\\2026\n- D:\\temp\\build\\output'
        ),
    },
    async ({ path: dirPath }) => {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        return {
          content: [
            {
              type: "text" as const,
              text: `Directory created: ${dirPath}`,
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
  
  //  TOOL 26: Copy File or Directory
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "copy_file",
    `Copy a file or directory to a new location on this Windows PC. Parent
  directories at the destination are created automatically if they don't exist.
  For directories, the copy is performed recursively (all contents included).
  Use this to duplicate files, create backups before editing, copy project
  templates to new locations, or duplicate configuration files. The original
  source is not modified or deleted.`,
    {
      source: z
        .string()
        .describe(
          'Absolute path of the file or directory to copy.\nExamples:\n- D:\\project\\src\\index.ts\n- D:\\config\\settings.json\n- D:\\backup\\old-project'
        ),
      destination: z
        .string()
        .describe(
          'Absolute path for the copy. Parent directories are created automatically.\nExamples:\n- D:\\backup\\index_backup.ts\n- D:\\archive\\settings_v2.json\n- D:\\backup\\new-project'
        ),
    },
    async ({ source, destination }) => {
      try {
        const stat = await fs.stat(source);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        if (stat.isDirectory()) {
          const { stdout } = await execAsync(
            `powershell.exe -Command "Copy-Item -Path '${source.replace(/'/g, "''")}' -Destination '${destination.replace(/'/g, "''")}' -Recurse -Force"`,
            { timeout: 120000 }
          );
        } else {
          await fs.copyFile(source, destination);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Copied: ${source} -> ${destination}`,
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
  
  //  TOOL 27: Delete File or Directory
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "delete_file",
    `Permanently delete a file or directory from this Windows PC. WARNING: Deleted
  files bypass the Recycle Bin and cannot be recovered — there is no undo.
  For directories, use the recursive flag to delete non-empty folders and all
  their contents. Use this to remove temporary files, clean up build artifacts,
  delete outdated data, or free up disk space. Always verify the path before
  calling this tool. Consider using file_move to move items to an archive
  folder instead if you might need them later.`,
    {
      path: z
        .string()
        .describe(
          'Absolute path of the file or folder to delete.\nExamples:\n- D:\\temp\\cache.json\n- C:\\temp\\build-output\n- D:\\old-logs\\app.log'
        ),
      recursive: z
        .boolean()
        .optional()
        .describe(
          "If true, delete directories and their contents recursively. Default: false.\nRequired when deleting non-empty directories."
        ),
    },
    async ({ path: targetPath, recursive }) => {
      try {
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
          await fs.rm(targetPath, { recursive: recursive || false, force: recursive || false });
        } else {
          await fs.unlink(targetPath);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Deleted: ${targetPath}`,
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
  
  //  TOOL 37: Preview File (Inline Image + Markdown + Syntax Highlight)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "preview_file",
    `Preview file contents with rich formatting. Images (PNG, JPG, GIF, BMP, ICO,
  SVG, WEBP) are returned as base64 for inline display by the AI. Markdown files
  show word/line counts and headings. Code files display with syntax metadata.
  Other files show raw content with size info.`,
    {
      path: z
        .string()
        .describe(
          'Absolute path to the file to preview.\nExamples:\n- "C:\\\\Users\\\\me\\\\photo.png" — returns base64 image\n- "D:\\\\project\\\\README.md" — returns markdown with stats\n- "D:\\\\project\\\\src\\\\index.ts" — returns code with metadata'
        ),
    },
    async ({ path: filePath }) => {
      try {
        const ext = path.extname(filePath).toLowerCase();
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp"];
        const mdExts = [".md", ".markdown", ".mdx"];
        const codeExts = [
          ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".cpp", ".c", ".h",
          ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".scala",
          ".html", ".css", ".scss", ".less", ".json", ".yaml", ".yml", ".toml",
          ".xml", ".sql", ".sh", ".bash", ".ps1", ".bat", ".cmd",
        ];
  
        if (imageExts.includes(ext)) {
          const buffer = await fs.readFile(filePath);
          const mimeType = ext === ".jpg" ? "image/jpeg" : ext === ".svg" ? "image/svg+xml" : `image/${ext.slice(1)}`;
          const base64 = buffer.toString("base64");
          const stat = await fs.stat(filePath);
          return {
            content: [
              {
                type: "image" as const,
                data: base64,
                mimeType: mimeType,
              },
              {
                type: "text" as const,
                text: `${path.basename(filePath)} (${formatBytes(stat.size)}, ${ext.slice(1).toUpperCase()})`,
              },
            ],
          };
        }
  
        if (mdExts.includes(ext)) {
          const content = await fs.readFile(filePath, "utf-8");
          const lines = content.split("\n");
          const headings = lines.filter((l) => l.startsWith("#"));
          const wordCount = content.split(/\s+/).length;
          return {
            content: [
              {
                type: "text" as const,
                text: `=== Markdown Preview: ${path.basename(filePath)} ===\nWords: ${wordCount} | Lines: ${lines.length} | Headings: ${headings.length}\n\n${content}`,
              },
            ],
          };
        }
  
        if (codeExts.includes(ext)) {
          const content = await fs.readFile(filePath, "utf-8");
          const lines = content.split("\n");
          const stat = await fs.stat(filePath);
          return {
            content: [
              {
                type: "text" as const,
                text: `=== ${ext.slice(1).toUpperCase()} File: ${path.basename(filePath)} ===\nSize: ${formatBytes(stat.size)} | Lines: ${lines.length} | Language: ${ext.slice(1)}\n\n\`\`\`${ext.slice(1)}\n${content}\n\`\`\``,
              },
            ],
          };
        }
  
        const content = await fs.readFile(filePath, "utf-8");
        const stat = await fs.stat(filePath);
        return {
          content: [
            {
              type: "text" as const,
              text: `=== ${path.basename(filePath)} ===\nSize: ${formatBytes(stat.size)}\n\n${content}`,
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

  //  TOOL 39: Batch Edit File (multiple precise edits in one round-trip)
  // ═══════════════════════════════════════════════════════════════════════
  server.tool(
    "file_edit_batch",
    `Apply multiple surgical edits to a single file in one round-trip, in order.
  Each edit searches for exact old_text and replaces it with new_text. This is the
  agent-friendly way to make several small changes to a code/config file without
  issuing one file_edit call per change and without re-reading the file between edits.
  Edits are applied sequentially to the same file, so each old_text must match the text
  as it exists AFTER the previous edits. The response reports each edit's git-style diff
  for verification. dry_run=true previews all diffs WITHOUT writing, catching any failed
  match before anything is committed (anti-retry over a bridge/tunnel). If any edit fails
  to find its old_text, the remaining edits are still attempted (non-atomic) and the
  failures are listed in the response.`,
    {
      path: z
        .string()
        .describe(
          "Absolute path to the file to edit.\nExample: D:\\Projects\\app\\src\\index.ts"
        ),
      edits: z
        .array(
          z.object({
            old_text: z
              .string()
              .describe(
                "Exact text to find and replace in the file's CURRENT state (after prior edits in this batch)."
              ),
            new_text: z
              .string()
              .describe(
                "Text to replace the old_text with. Empty string deletes the old_text."
              ),
            replace_all: z
              .boolean()
              .optional()
              .describe(
                "If true, replace ALL occurrences of old_text. If false (default), replace only the first occurrence."
              ),
          })
        )
        .describe("List of edits to apply, in order."),
      dry_run: z
        .boolean()
        .optional()
        .describe(
          "If true, compute and return all diffs without writing to disk. Use this first to preview a batch before committing. Default: false."
        ),
    },
    async ({ path: filePath, edits, dry_run }) => {
      const results: string[] = [];
      const editResults: Array<{
        index: number;
        status: string;
        replaced: number;
        diff?: string;
      }> = [];
      let content: string;
      try {
        content = await fs.readFile(filePath, "utf-8");
      } catch (error: any) {
        return {
          content: [{ type: "text" as const, text: `ERROR reading ${filePath}: ${error.message}` }],
          isError: true,
        };
      }

      let hasError = false;
      for (let i = 0; i < edits.length; i++) {
        const { old_text, new_text, replace_all } = edits[i];
        if (!content.includes(old_text)) {
          hasError = true;
          results.push(
            `Edit ${i + 1} FAILED: old_text not found.\n` +
              buildNotFoundMessage(filePath, content, old_text)
          );
          editResults.push({ index: i + 1, status: "failed", replaced: 0 });
          continue;
        }
        const firstIdx = content.indexOf(old_text);
        let count: number;
        const prevContent = content;
        if (replace_all) {
          const parts = content.split(old_text);
          count = parts.length - 1;
          content = parts.join(new_text);
        } else {
          const idx = content.indexOf(old_text);
          content = content.substring(0, idx) + new_text + content.substring(idx + old_text.length);
          count = 1;
        }
        const diff = buildEditDiff(prevContent, firstIdx, old_text, new_text);
        results.push(
          `Edit ${i + 1} OK: replaced ${count} occurrence(s).\n\`\`\`diff\n${diff}\n\`\`\``
        );
        editResults.push({ index: i + 1, status: "ok", replaced: count, diff });
      }

      const executed = dry_run ? false : true;
      if (!dry_run) {
        try {
          await fs.writeFile(filePath, content, "utf-8");
        } catch (error: any) {
          return {
            content: [{ type: "text" as const, text: `ERROR writing ${filePath}: ${error.message}` }],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Applied ${edits.length} edit(s) to ${filePath} (${dry_run ? "DRY RUN, not written" : "written"})\n\n` +
              results.join("\n\n"),
          },
        ],
        structuredContent: {
          path: filePath,
          executed,
          dryRun: dry_run ?? false,
          edits: editResults,
        },
        isError: hasError || undefined,
      };
    }
  );
}

/**
 * Render a small window of the file's lines around a character offset with line
 * numbers, so the AI can verify the result of an edit without re-reading the file.
 */
function buildEditContext(newText: string, insertOffset: number, fullContent: string): string {
  const lines = fullContent.split("\n");
  const end = fullContent.indexOf(newText, insertOffset);
  const anchorStart = insertOffset;
  const anchorEnd = end >= 0 ? end + newText.length : insertOffset + newText.length;

  let startLine = 0;
  let startCol = 0;
  let endLine = 0;
  let endCol = 0;
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineLen = lines[i].length + 1; // +1 for the newline
    if (pos <= anchorStart && anchorStart < pos + lineLen) {
      startLine = i;
      startCol = anchorStart - pos;
    }
    if (pos <= anchorEnd && anchorEnd <= pos + lineLen) {
      endLine = i;
      endCol = anchorEnd - pos;
    }
    pos += lineLen;
  }

  const ctxStart = Math.max(0, startLine - 2);
  const ctxEnd = Math.min(lines.length - 1, endLine + 2);
  const rangeWidth = String(ctxEnd + 1).length;
  const out: string[] = [];
  for (let i = ctxStart; i <= ctxEnd; i++) {
    const marker = i >= startLine && i <= endLine ? ">" : " ";
    out.push(`${marker}${String(i + 1).padStart(rangeWidth)}| ${lines[i]}`);
  }
  return out.join("\n");
}

/**
 * When old_text is not found, help the AI correct itself by showing the lines most
 * likely to contain the intended match plus a clear hint.
 */
function buildNotFoundMessage(filePath: string, content: string, oldText: string): string {
  const lines = content.split("\n");
  const hintLine = findClosestLine(content, oldText);
  const ctxStart = Math.max(0, hintLine - 2);
  const ctxEnd = Math.min(lines.length - 1, hintLine + 2);
  const rangeWidth = String(ctxEnd + 1).length;
  const out: string[] = [];
  for (let i = ctxStart; i <= ctxEnd; i++) {
    out.push(`${String(i + 1).padStart(rangeWidth)}| ${lines[i]}`);
  }
  return (
    `old_text not found exactly in ${filePath}.\n` +
    `TightTip: use file_read to copy the exact line (including indentation/whitespace).\n` +
    `Closest lines (around line ${hintLine + 1}):\n${out.join("\n")}`
  );
}

/**
 * Naively pick the line most likely to contain oldText by scoring character overlap.
 */
function findClosestLine(content: string, oldText: string): number {
  const lines = content.split("\n");
  const search = oldText.toLowerCase();
  let bestLine = 0;
  let bestScore = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    let score = 0;
    for (let j = 0; j < search.length; j++) {
      const ch = search[j];
      if (ch === " " || ch === "\t") continue;
      if (line.indexOf(ch) >= 0) score += 1;
    }
    const run = longestCommonRun(line, search);
    score += run * run;
    if (score > bestScore) {
      bestScore = score;
      bestLine = i;
    }
  }
  return bestLine;
}

/**
 * Length of the longest contiguous character run shared by two strings (case-insensitive).
 * Used to rank candidate lines.
 */
function longestCommonRun(a: string, b: string): number {
  let best = 0;
  for (let start = 0; start < a.length; start++) {
    let k = 0;
    while (start + k < a.length && k < b.length && a[start + k] === b[k]) {
      k++;
    }
    if (k > best) best = k;
  }
  return best;
}

/**
 * Build a compact git-style unified diff (hunk headers + +/- lines) between two file
 * contents. This is the lightweight way to show an AI exactly what changed without
 * echoing the whole file back over the MCP transport (which is what slows editing
 * down through a tunnel/bridge).
 */
/**
 * Build a git-style unified diff for a single known surgical edit. Because the edit is
 * an exact old_text -> new_text replacement at a known offset, we can emit one correct
 * hunk directly (removed lines old_text, added lines new_text) wrapped with a small
 * amount of context. This keeps the payload tiny over a bridge/tunnel and is far more
 * reliable than a general-purpose diff engine for this use case.
 */
function buildEditDiff(
  oldContent: string,
  offset: number,
  oldText: string,
  newText: string,
  maxContext = 3
): string {
  const before = oldContent.slice(0, offset);
  const after = oldContent.slice(offset + oldText.length);

  const oldLines = oldContent.replace(/\r\n/g, "\n").split("\n");
  const beforeCount = countNewlines(before);
  const removedLines = oldText.split("\n");
  const addedLines = newText.split("\n");

  const hunkStartOld = beforeCount + 1;
  // New content line numbers: start = lines before edit + 1
  const hunkStartNew = beforeCount + 1;

  // Compute how many old/new lines the hunk spans.
  // For old: lines before + removed lines + (up to maxContext) lines after.
  const afterLines = after.split("\n");
  const contextBefore = oldLines.slice(Math.max(0, beforeCount - maxContext), beforeCount);
  const contextAfter = afterLines.slice(0, maxContext);

  const oldHunkLines = [...contextBefore, ...removedLines, ...contextAfter];
  const newHunkLines = [...contextBefore, ...addedLines, ...contextAfter];
  const oldCount = oldHunkLines.length;
  const newCount = newHunkLines.length;

  // 1-based hunk start lines (adjusted for the contextBefore pulled in).
  const aStart = Math.max(1, hunkStartOld - contextBefore.length);
  const bStart = Math.max(1, hunkStartNew - contextBefore.length);

  const out: string[] = [];
  out.push(`@@ -${aStart},${oldCount} +${bStart},${newCount} @@`);
  for (const line of contextBefore) out.push(" " + (line === "" ? "" : line));
  for (const line of removedLines) out.push("-" + line);
  for (const line of addedLines) out.push("+" + line);
  for (const line of contextAfter) out.push(" " + line);
  return out.join("\n");
}

function countNewlines(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n") count++;
  }
  return count;
}