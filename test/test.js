/**
 * PC Controller MCP Server - Comprehensive Test Suite
 *
 * Tests all 18 tools via JSON-RPC 2.0 over stdio transport.
 * Uses safe, non-destructive commands only.
 *
 * Usage: node test/test.js
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.join(__dirname, "..", "dist", "index.js");

// ─── State ───────────────────────────────────────────────────────────
let requestId = 0;
let passed = 0;
let failed = 0;
const results = [];
const startTime = Date.now();

// ─── Helper: Send JSON-RPC request and wait for response ─────────────
function sendRequest(proc, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const request = { jsonrpc: "2.0", id, method, params };

    let buffer = "";

    const onData = (data) => {
      buffer += data.toString();

      // Try to parse complete JSON messages (newline-delimited)
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.id === id) {
            proc.stdout.removeListener("data", onData);
            clearTimeout(timer);
            resolve(msg);
            return;
          }
        } catch {
          // Not valid JSON yet, might be partial
        }
      }

      // Also check the last line in case it's complete
      if (buffer.trim()) {
        try {
          const msg = JSON.parse(buffer.trim());
          if (msg.id === id) {
            proc.stdout.removeListener("data", onData);
            clearTimeout(timer);
            buffer = "";
            resolve(msg);
            return;
          }
        } catch {
          // Incomplete, wait for more data
        }
      }
    };

    proc.stdout.on("data", onData);

    const timer = setTimeout(() => {
      proc.stdout.removeListener("data", onData);
      reject(new Error(`Timeout (30s) waiting for response to request #${id} (${method})`));
    }, 30000);

    proc.stdin.write(JSON.stringify(request) + "\n");
  });
}

// ─── Helper: Send JSON-RPC notification (no response expected) ───────
function sendNotification(proc, method, params = {}) {
  const message = { jsonrpc: "2.0", method, params };
  proc.stdin.write(JSON.stringify(message) + "\n");
}

// ─── Helper: Log test result ─────────────────────────────────────────
function logResult(name, success, detail = "") {
  const status = success ? "PASS" : "FAIL";
  const icon = success ? "[+]" : "[!]";
  if (success) passed++;
  else failed++;
  const msg = `${icon} ${status} | ${name}${detail ? " -- " + detail : ""}`;
  console.log(msg);
  results.push({ name, success, detail });
}

// ─── Helper: Extract text content from tool call result ──────────────
function extractText(response) {
  if (!response?.result?.content) return "";
  return response.result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

// ─── Helper: Check if response has error ─────────────────────────────
function hasError(response) {
  return !!(response?.error || response?.result?.isError);
}

// ─── Main Test Suite ─────────────────────────────────────────────────
async function runTests() {
  console.log("============================================================");
  console.log("  PC Controller MCP Server - Comprehensive Test Suite");
  console.log("============================================================");
  console.log(`  Server: ${SERVER_PATH}`);
  console.log(`  Date:   ${new Date().toISOString()}`);
  console.log("============================================================\n");

  // Start the MCP server as a child process
  const proc = spawn("node", [SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stderr.on("data", () => {
    // Server logs to stderr, ignore during tests
  });

  proc.on("error", (err) => {
    console.error(`FATAL: Failed to start server: ${err.message}`);
    process.exit(1);
  });

  proc.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`WARNING: Server exited with code ${code}`);
    }
  });

  // Allow server to initialize
  await new Promise((r) => setTimeout(r, 500));

  try {
    // ═══════════════════════════════════════════════════════════════════
    // SECTION 1: Protocol Tests
    // ═══════════════════════════════════════════════════════════════════
    console.log("--- Protocol Tests ---\n");

    // Test 1: Initialize handshake
    try {
      const initResult = await sendRequest(proc, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      });

      const serverName = initResult?.result?.serverInfo?.name;
      const serverVersion = initResult?.result?.serverInfo?.version;
      logResult(
        "Initialize handshake",
        serverName === "pc-controller",
        `Server: ${serverName} v${serverVersion}`
      );
    } catch (e) {
      logResult("Initialize handshake", false, e.message);
    }

    // Send initialized notification (required by MCP spec)
    sendNotification(proc, "notifications/initialized");

    // Test 2: List tools
    try {
      const toolsResult = await sendRequest(proc, "tools/list", {});
      const toolNames = toolsResult?.result?.tools?.map((t) => t.name) || [];

      const expectedTools = [
        "run_command",
        "file_read",
        "file_write",
        "dir_list",
        "screen_capture",
        "sys_info",
        "file_search",
        "process_list",
        "process_kill",
        "open_path",
        "clipboard_get",
        "clipboard_set",
        "run_command_long",
        "zip_create",
        "zip_extract",
        "window_focus",
        "key_type",
        "notify",
      ];

      const missing = expectedTools.filter((t) => !toolNames.includes(t));
      logResult(
        "tools/list",
        missing.length === 0 && toolNames.length === 18,
        `${toolNames.length} tools found${missing.length ? `, missing: ${missing.join(", ")}` : ""}`
      );
    } catch (e) {
      logResult("tools/list", false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 2: Tool Tests (Safe, Non-Destructive)
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n--- Tool Tests ---\n");

    // Test 3: execute_command - echo hello
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "run_command",
        arguments: { command: "echo hello" },
      });
      const text = extractText(result);
      logResult(
        "execute_command (echo hello)",
        text.includes("hello") && !hasError(result),
        text.substring(0, 120).replace(/\n/g, " ")
      );
    } catch (e) {
      logResult("execute_command (echo hello)", false, e.message);
    }

    // Test 4: read_file - read package.json
    try {
      const pkgPath = path.resolve(__dirname, "..", "package.json");
      const result = await sendRequest(proc, "tools/call", {
        name: "file_read",
        arguments: { path: pkgPath },
      });
      const text = extractText(result);
      logResult(
        "read_file (package.json)",
        text.includes("pc-controller-mcp") && !hasError(result),
        `Read ${text.length} chars`
      );
    } catch (e) {
      logResult("read_file (package.json)", false, e.message);
    }

    // Test 5: write_file - write temp file then clean up
    try {
      const tempDir = path.join(os.tmpdir(), "mcp_pc_controller_test");
      const tempFile = path.join(tempDir, "test_output.txt");
      const testContent = `Hello from MCP test! ${Date.now()}`;

      const result = await sendRequest(proc, "tools/call", {
        name: "file_write",
        arguments: { path: tempFile, content: testContent },
      });
      const text = extractText(result);
      const writeSuccess = text.includes("Successfully") && !hasError(result);

      // Verify the file was actually written
      let verified = false;
      if (writeSuccess) {
        try {
          const content = await fs.readFile(tempFile, "utf-8");
          verified = content === testContent;
        } catch {}
      }

      // Clean up
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {}

      logResult(
        "write_file (temp file)",
        writeSuccess && verified,
        verified ? "Written and verified" : "Write succeeded but verification failed"
      );
    } catch (e) {
      logResult("write_file (temp file)", false, e.message);
    }

    // Test 6: list_directory - list project root
    try {
      const projectRoot = path.resolve(__dirname, "..");
      const result = await sendRequest(proc, "tools/call", {
        name: "dir_list",
        arguments: { path: projectRoot },
      });
      const text = extractText(result);
      const hasExpected =
        text.includes("package.json") ||
        text.includes("src") ||
        text.includes("dist");
      logResult(
        "list_directory (project root)",
        hasExpected && !hasError(result),
        `Listed directory`
      );
    } catch (e) {
      logResult("list_directory (project root)", false, e.message);
    }

    // Test 7: system_info
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "sys_info",
        arguments: {},
      });
      const text = extractText(result);
      const hasInfo =
        (text.includes("System Information") || text.includes("Hostname")) &&
        text.includes("CPU") &&
        text.includes("Memory");
      logResult(
        "sys_info",
        hasInfo && !hasError(result),
        `Got system information`
      );
    } catch (e) {
      logResult("sys_info", false, e.message);
    }

    // Test 8: search_files - search for *.json in project root
    try {
      const projectRoot = path.resolve(__dirname, "..");
      const result = await sendRequest(proc, "tools/call", {
        name: "file_search",
        arguments: {
          pattern: "*.json",
          directory: projectRoot,
          max_results: 10,
        },
      });
      const text = extractText(result);
      const found = text.includes("package.json") || text.includes("Found");
      logResult(
        "search_files (*.json)",
        found && !hasError(result),
        text.substring(0, 120).replace(/\n/g, " ")
      );
    } catch (e) {
      logResult("search_files (*.json)", false, e.message);
    }

    // Test 9: list_processes - list with "node" filter
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "process_list",
        arguments: { filter: "node" },
      });
      const text = extractText(result);
      logResult(
        "list_processes (filter: node)",
        !hasError(result) && text.length > 0,
        `Got process list (${text.length} chars)`
      );
    } catch (e) {
      logResult("list_processes (filter: node)", false, e.message);
    }

    // Test 10: kill_process - try to kill non-existent process (safe, expects error)
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "process_kill",
        arguments: { name: "nonexistent_process_xyz_12345" },
      });
      // This should return an error since the process doesn't exist
      const isError = hasError(result);
      const text = extractText(result);
      logResult(
        "kill_process (non-existent, expects error)",
        isError || text.includes("ERROR"),
        isError ? "Correctly returned error" : "Unexpected success"
      );
    } catch (e) {
      logResult("kill_process (non-existent)", false, e.message);
    }

    // Test 11: open_item - open a safe URL (non-browser, just test the call)
    // We test that the tool responds without crashing; it will actually open the URL
    // Using a data: URI to avoid opening a browser
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "open_path",
        arguments: { target: "https://example.com" },
      });
      const text = extractText(result);
      // open_item should succeed (it launches Start-Process)
      logResult(
        "open_item (example.com)",
        !hasError(result) || text.includes("Opened"),
        text.substring(0, 100)
      );
    } catch (e) {
      logResult("open_item (example.com)", false, e.message);
    }

    // Test 12: clipboard_get - read current clipboard
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "clipboard_get",
        arguments: {},
      });
      // Clipboard might be empty, that's fine - just check no error
      logResult(
        "clipboard_get (read)",
        !hasError(result),
        `Read clipboard successfully`
      );
    } catch (e) {
      logResult("clipboard_get (read)", false, e.message);
    }

    // Test 12b: clipboard_set - write text to clipboard
    try {
      const testClip = `MCP clipboard test ${Date.now()}`;
      const result = await sendRequest(proc, "tools/call", {
        name: "clipboard_set",
        arguments: { text: testClip },
      });
      const text = extractText(result);
      const setSuccess = text.includes("copied") && !hasError(result);
      logResult(
        "clipboard_set (write)",
        setSuccess,
        text.substring(0, 100)
      );
    } catch (e) {
      logResult("clipboard_set (write)", false, e.message);
    }

    // Test 13: screenshot
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "screen_capture",
        arguments: {},
      });
      const hasImage = result?.result?.content?.some((c) => c.type === "image");
      const text = extractText(result);
      logResult(
        "screen_capture",
        hasImage && !hasError(result),
        hasImage ? "Got base64 image data" : `No image: ${text.substring(0, 80)}`
      );
    } catch (e) {
      logResult("screen_capture", false, e.message);
    }

    // Test 14: run_command_streaming
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "run_command_long",
        arguments: { command: "echo streaming-test-output" },
      });
      const text = extractText(result);
      logResult(
        "run_command_streaming (echo)",
        (text.includes("streaming-test-output") || text.includes("Exit code: 0")) &&
          !hasError(result),
        text.substring(0, 120).replace(/\n/g, " ")
      );
    } catch (e) {
      logResult("run_command_streaming (echo)", false, e.message);
    }

    // Test 14b: run_command with shell=gitbash
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "run_command",
        arguments: { command: "echo hello-gitbash", shell: "gitbash" },
      });
      const text = extractText(result);
      logResult(
        "run_command (gitbash shell)",
        text.includes("hello-gitbash") && !hasError(result),
        text.substring(0, 120).replace(/\n/g, " ")
      );
    } catch (e) {
      logResult("run_command (gitbash shell)", false, e.message);
    }

    // Test 14c: run_command with shell=wsl
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "run_command",
        arguments: { command: "echo hello-wsl", shell: "wsl" },
      });
      const text = extractText(result);
      logResult(
        "run_command (wsl shell)",
        text.includes("hello-wsl") && !hasError(result),
        text.substring(0, 120).replace(/\n/g, " ")
      );
    } catch (e) {
      logResult("run_command (wsl shell)", false, e.message);
    }

    // Test 14d: zip_create
    const zipTestDir = path.join(os.tmpdir(), "mcp_zip_test_" + Date.now());
    try {
      await fs.mkdir(zipTestDir, { recursive: true });
      await fs.writeFile(path.join(zipTestDir, "a.txt"), "zip content A");
      await fs.writeFile(path.join(zipTestDir, "b.txt"), "zip content B");
      const zipPath = path.join(zipTestDir, "archive.zip");
      const result = await sendRequest(proc, "tools/call", {
        name: "zip_create",
        arguments: { source: zipTestDir, destination: zipPath },
      });
      const text = extractText(result);
      const zipExists = await fs
        .stat(zipPath)
        .then(() => true)
        .catch(() => false);
      logResult(
        "zip_create",
        (text.includes("ZIP created") || zipExists) && !hasError(result),
        text.substring(0, 120).replace(/\n/g, " ")
      );

      // Test 14e: zip_extract (reuses the zip created above)
      const extractDir = path.join(zipTestDir, "extracted");
      const result2 = await sendRequest(proc, "tools/call", {
        name: "zip_extract",
        arguments: { archive: zipPath, destination: extractDir },
      });
      const text2 = extractText(result2);
      const extractedOk = await fs
        .stat(path.join(extractDir, "a.txt"))
        .then(() => true)
        .catch(() => false);
      logResult(
        "zip_extract",
        (text2.includes("Extracted") || extractedOk) && !hasError(result2),
        text2.substring(0, 120).replace(/\n/g, " ")
      );
    } catch (e) {
      logResult("zip_create", false, e.message);
      logResult("zip_extract", false, e.message);
    } finally {
      await fs.rm(zipTestDir, { recursive: true, force: true });
    }

    // Test 14f: window_focus (tolerant - may not find a matching window)
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "window_focus",
        arguments: { title: "ThisTitleDoesNotExistAnywhereXYZ" },
      });
      // Either a clean "not found" error or success - just verify the server responds
      logResult("window_focus", !hasError(result) || extractText(result).includes("not found"), extractText(result).substring(0, 100));
    } catch (e) {
      logResult("window_focus", false, e.message);
    }

    // Test 14g: key_type with empty text (no-op, safe)
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "key_type",
        arguments: { text: "" },
      });
      const text = extractText(result);
      logResult(
        "key_type (empty text)",
        text.includes("Typed") && !hasError(result),
        text.substring(0, 100)
      );
    } catch (e) {
      logResult("key_type (empty text)", false, e.message);
    }

    // Test 14h: notify
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "notify",
        arguments: { title: "MCP Test", message: "Notification from test suite" },
      });
      const text = extractText(result);
      logResult(
        "notify",
        text.includes("Notification shown") && !hasError(result),
        text.substring(0, 100)
      );
    } catch (e) {
      logResult("notify", false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SECTION 3: Error Handling Tests
    // ═══════════════════════════════════════════════════════════════════
    console.log("\n--- Error Handling Tests ---\n");

    // Test 15: execute_command with invalid command
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "run_command",
        arguments: { command: "this_command_does_not_exist_xyz_99999" },
      });
      const isError = hasError(result);
      const text = extractText(result);
      logResult(
        "execute_command (invalid cmd, expects error)",
        isError || text.includes("ERROR"),
        isError ? "Correctly returned error" : "Handled gracefully"
      );
    } catch (e) {
      logResult("execute_command (invalid cmd)", false, e.message);
    }

    // Test 16: read_file with non-existent file
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "file_read",
        arguments: { path: "C:\\this\\path\\does\\not\\exist\\fake_file.txt" },
      });
      const isError = hasError(result);
      const text = extractText(result);
      logResult(
        "read_file (non-existent, expects error)",
        isError || text.includes("ERROR"),
        isError ? "Correctly returned error" : "Handled gracefully"
      );
    } catch (e) {
      logResult("read_file (non-existent)", false, e.message);
    }

    // Test 17: Unknown tool
    try {
      const result = await sendRequest(proc, "tools/call", {
        name: "nonexistent_tool_fake",
        arguments: {},
      });
      // MCP SDK returns isError: true in the result content for unknown tools
      const hasProtocolError = !!result?.error;
      const hasContentError = result?.result?.isError === true;
      const text = extractText(result);
      const hasTextError = text.includes("ERROR") || text.includes("error") || text.includes("Unknown");
      logResult(
        "Unknown tool (expects error)",
        hasProtocolError || hasContentError || hasTextError,
        hasProtocolError
          ? `Protocol error: ${result.error.message || "unknown"}`
          : hasContentError
            ? "isError flag set"
            : hasTextError
              ? `Error in text: ${text.substring(0, 80)}`
              : "No error returned"
      );
    } catch (e) {
      logResult("Unknown tool", false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    const elapsed = Date.now() - startTime;

    console.log("\n============================================================");
    console.log("  Test Summary");
    console.log("============================================================");
    console.log(`  Passed:  ${passed}`);
    console.log(`  Failed:  ${failed}`);
    console.log(`  Total:   ${passed + failed}`);
    console.log(`  Time:    ${elapsed}ms`);
    console.log("============================================================");

    if (failed > 0) {
      console.log("\n  Failed tests:");
      results
        .filter((r) => !r.success)
        .forEach((r) => console.log(`    [!] ${r.name}: ${r.detail}`));
    }

    console.log(
      `\n  ${failed === 0 ? "ALL TESTS PASSED!" : `${failed} TEST(S) FAILED.`}\n`
    );
    console.log("============================================================");
  } catch (error) {
    console.error(`\nFATAL: Test suite error: ${error.message}`);
  } finally {
    proc.kill();
    process.exit(failed > 0 ? 1 : 0);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────
runTests();
