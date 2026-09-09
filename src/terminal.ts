import { execFileSync, spawn } from "child_process";
import * as os from "os";
import * as crypto from "crypto";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import { fileURLToPath } from "url";
import { StringDecoder } from "node:string_decoder";
import { spawn as spawnPty, IPty } from "node-pty";
import {
  activeSessions,
  incrementSessionCounter,
  TerminalSession,
} from "./state.js";

const POLL_MS = 100;
const DEFAULT_QUIET_MS = 1500;
// Auto-kill a session that goes silent (no output AND no input) for this long.
const IDLE_KILL_MS =
  Number(process.env.PC_CONTROLLER_IDLE_KILL_MS) || 10 * 60 * 1000;
const idleTimers = new WeakMap<TerminalSession, NodeJS.Timeout>();
const monitorServers = new WeakMap<TerminalSession, net.Server>();
const monitorClients = new WeakMap<TerminalSession, Set<net.Socket>>();
const monitorTokens = new WeakMap<TerminalSession, string>();

export interface CommandResult {
  status: "completed" | "still-running" | "ended" | "tail";
  output: string;
}

function sanitizeTitle(title: string, fallback: string): string {
  const safe = title
    .replace(/[\u0000-\u001f\u007f&|<>^"'`;!%$]/g, "")
    .trim();
  return safe || fallback;
}

function spawnShell(shell: string, cwd: string): IPty {
  const options = {
    cwd,
    name: "xterm-color",
    cols: 160,
    rows: 48,
    useConpty: true,
    useConptyDll: true,
  };
  switch (shell) {
    case "cmd":
      return spawnPty("cmd.exe", ["/d"], options);
    case "gitbash":
      return spawnPty("C:\\Program Files\\Git\\bin\\bash.exe", [], options);
    case "wsl":
      return spawnPty("wsl.exe", [], options);
    default:
      return spawnPty("powershell.exe", ["-NoLogo", "-NoProfile"], options);
  }
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function monitorPaths(sessionId: string): { dir: string; log: string; launcher: string } {
  const safeId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = path.join(os.tmpdir(), "pc-controller-sessions", safeId);
  return {
    dir,
    log: path.join(dir, "session.log"),
    launcher: path.join(dir, "monitor.cmd"),
  };
}

function launchMonitor(
  title: string,
  cwd: string,
  clientPath: string,
  port: number,
  token: string,
  launcherPath: string
): number | undefined {
  fs.writeFileSync(
    launcherPath,
    [
      "@echo off",
      `title ${title}`,
      `"${process.execPath}" "${clientPath}" --port ${port} --token ${token} --title "${title}"`,
      "",
    ].join("\r\n"),
    "utf8"
  );
  const windowType = [
    "using System;",
    "using System.Runtime.InteropServices;",
    "public static class PcControllerWindow {",
    "[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();",
    "[DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);",
    "[DllImport(\"user32.dll\")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);",
    "[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "}",
  ].join(" ");
  const script = [
    `Add-Type -TypeDefinition ${psQuote(windowType)}`,
    "$previous = [PcControllerWindow]::GetForegroundWindow()",
    `$p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', ${psQuote(launcherPath)}) -WorkingDirectory ${psQuote(cwd)} -WindowStyle Minimized -PassThru`,
    "for ($i = 0; $i -lt 40 -and $p.MainWindowHandle -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 50; $p.Refresh() }",
    "$h = $p.MainWindowHandle",
    "if ($h -ne [IntPtr]::Zero) {",
    "[PcControllerWindow]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, 0, 0, 0x0053) | Out-Null",
    "[PcControllerWindow]::ShowWindowAsync($h, 4) | Out-Null",
    "}",
    "if ($previous -ne [IntPtr]::Zero) { [PcControllerWindow]::SetForegroundWindow($previous) | Out-Null }",
    "$p.Id",
  ].join("; ");
  try {
    const output = execFileSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-Command", script],
      { encoding: "utf8", windowsHide: true }
    );
    const pid = Number(output.trim().split(/\s+/).pop());
    return Number.isFinite(pid) ? pid : undefined;
  } catch {
    return undefined;
  }
}

function sendMonitorMessage(socket: net.Socket, message: unknown): void {
  if (!socket.destroyed) socket.write(`${JSON.stringify(message)}\n`);
}

function broadcastMonitor(session: TerminalSession, text: string): void {
  const clients = monitorClients.get(session);
  if (!clients || clients.size === 0) return;
  const message = `${JSON.stringify({ type: "data", data: text })}\n`;
  for (const socket of clients) {
    if (socket.destroyed) {
      clients.delete(socket);
    } else {
      socket.write(message);
    }
  }
}

function startMonitorServer(session: TerminalSession): {
  server: net.Server;
  token: string;
} {
  const token = crypto.randomBytes(18).toString("hex");
  const clients = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    let authenticated = false;
    let pending = "";
    let decoder = new StringDecoder("utf8");

    const removeClient = () => {
      clients.delete(socket);
    };
    socket.on("close", removeClient);
    socket.on("error", removeClient);
    socket.on("data", (chunk: Buffer) => {
      pending += decoder.write(chunk);
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
        if (!line) continue;
        let message: { type?: string; token?: string; data?: string };
        try {
          message = JSON.parse(line) as { type?: string; token?: string; data?: string };
        } catch {
          socket.destroy();
          return;
        }
        if (!authenticated) {
          if (message.type !== "auth" || message.token !== token) {
            socket.destroy();
            return;
          }
          authenticated = true;
          clients.add(socket);
          sendMonitorMessage(socket, { type: "data", data: session.raw });
          continue;
        }
        if (message.type === "input" && typeof message.data === "string") {
          session.pty.write(message.data);
          markSessionInput(session);
        }
      }
    });
  });
  monitorServers.set(session, server);
  monitorClients.set(session, clients);
  return { server, token };
}

function launchMonitorWhenReady(
  session: TerminalSession,
  cwd: string,
  clientPath: string,
  launcherPath: string
): void {
  const server = monitorServers.get(session);
  if (!server) return;
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return;
    const token = monitorTokens.get(session);
    if (!token) return;
    session.monitorPid = launchMonitor(
      session.title,
      cwd,
      clientPath,
      address.port,
      token,
      launcherPath
    );
  });
}

function stopMonitor(session: TerminalSession): void {
  const server = monitorServers.get(session);
  if (server) {
    server.close();
    monitorServers.delete(session);
  }
  const clients = monitorClients.get(session);
  if (clients) {
    for (const socket of clients) socket.destroy();
    clients.clear();
    monitorClients.delete(session);
  }
  if (session.monitorPid) {
    spawn("taskkill.exe", ["/PID", String(session.monitorPid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    session.monitorPid = undefined;
  }
  try {
    fs.rmSync(session.monitorDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; the session process is the source of truth.
  }
}


function appendMonitor(session: TerminalSession, text: string): void {
  if (!session.monitorEnabled) return;
  try {
    fs.appendFileSync(session.monitorLogPath, text, "utf8");
  } catch {
    session.monitorEnabled = false;
  }
}

// Reconfigure the shell so non-ASCII output (UTF-8) survives the pipe.
function preambleFor(shell: string): string {
  switch (shell) {
    case "cmd":
      return "chcp 65001 >nul";
    case "gitbash":
    case "wsl":
      return "export LC_ALL=C.UTF-8 LANG=C.UTF-8 2>/dev/null";
    default:
      return "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8";
  }
}

export function createSession(
  shell: string,
  cwd: string,
  id?: string,
  title?: string
): TerminalSession {
  const sessionId = id ?? `session-${incrementSessionCounter()}`;
  const cwdPath = cwd || os.homedir();
  const sessionTitle = sanitizeTitle(
    title || `PC Controller - ${sessionId}`,
    `PC Controller - ${sessionId}`
  );
  const monitor = monitorPaths(sessionId);
  fs.mkdirSync(monitor.dir, { recursive: true });
  fs.writeFileSync(
    monitor.log,
    `[PC Controller] Session ${sessionId} opened\r\n[Shell] ${shell}\r\n[CWD] ${cwdPath}\r\n\r\n`,
    "utf8"
  );
  const proc = spawnShell(shell, cwdPath);
  const session: TerminalSession = {
    id: sessionId,
    pty: proc,
    shell,
    title: sessionTitle,
    cwd: cwdPath,
    monitorDir: monitor.dir,
    monitorLogPath: monitor.log,
    monitorEnabled: true,
    output: [],
    raw: "",
    createdAt: new Date(),
    lastOutputAt: new Date(),
    lastInputAt: new Date(),
    exited: false,
  };
  const monitorConnection = startMonitorServer(session);
  monitorTokens.set(session, monitorConnection.token);
  launchMonitorWhenReady(
    session,
    cwdPath,
    path.join(path.dirname(fileURLToPath(import.meta.url)), "terminal-client.js"),
    monitor.launcher
  );
  const handleOutput = (data: string) => {
    const text = data;
    session.raw += text;
    session.output = session.raw.split(/\r?\n/);
    session.lastOutputAt = new Date();
    appendMonitor(session, text);
    broadcastMonitor(session, text);
    resetIdleTimer(session);
  };
  proc.onData(handleOutput);
  proc.onExit(() => {
    session.exited = true;
    const t = idleTimers.get(session);
    if (t) clearTimeout(t);
    idleTimers.delete(session);
    activeSessions.delete(sessionId);
    stopMonitor(session);
  });
  activeSessions.set(sessionId, session);
  proc.write(`${preambleFor(shell)}\r`);
  appendMonitor(session, `[Session] Ready\r\n`);
  resetIdleTimer(session);
  return session;
}

/** Record that input was sent to the session and reset the idle auto-kill timer. */
export function markSessionInput(
  session: TerminalSession,
  inputText?: string
): void {
  session.lastInputAt = new Date();
  if (inputText !== undefined) {
    appendMonitor(session, `\r\n> ${inputText}\r\n`);
  }
  resetIdleTimer(session);
}

function resetIdleTimer(session: TerminalSession): void {
  const old = idleTimers.get(session);
  if (old) clearTimeout(old);
  const t = setTimeout(() => {
    activeSessions.delete(session.id);
    stopMonitor(session);
    if (!session.exited) session.pty.kill();
  }, IDLE_KILL_MS);
  t.unref();
  idleTimers.set(session, t);
}

/** Stop a session: kill its whole process tree, remove it, cancel its idle timer. */
export async function stopSession(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  activeSessions.delete(sessionId);
  const t = idleTimers.get(session);
  if (t) clearTimeout(t);
  idleTimers.delete(session);
  stopMonitor(session);
  if (!session.exited) session.pty.kill();
}

export function getSession(sessionId: string): TerminalSession | undefined {
  return activeSessions.get(sessionId);
}

export function isSessionAlive(session: TerminalSession): boolean {
  return !session.exited;
}

export async function waitForSessionReady(
  session: TerminalSession,
  waitMs = 5000
): Promise<void> {
  const startedAt = Date.now();
  while (isSessionAlive(session) && Date.now() - startedAt < waitMs) {
    if (session.raw.length > 0) return;
    await sleep(POLL_MS);
  }
}

function markerLine(): string {
  return `__MCP_DONE_${crypto.randomBytes(6).toString("hex")}__`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send a command to a persistent session and stream its output back.
 *
 * Completion is detected by appending a unique echo marker line to the
 * command; the call returns as soon as the marker shows up in the output.
 * If the command never prints the marker (terminating error, interactive
 * prompt, still running), the call falls back to a quiet period after the
 * last output, and finally to `waitMs` as a hard cap.
 */
function writePtyLines(session: TerminalSession, text: string): void {
  session.pty.write(text.replace(/\r?\n/g, "\r") + "\r");
}

export async function sendCommandAndWait(
  session: TerminalSession,
  command: string,
  options: { waitMs?: number; quietMs?: number } = {}
): Promise<CommandResult> {
  const waitMs = options.waitMs ?? 30000;
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS;
  const startPos = session.raw.length;
  const trimmed = command.trim();

  if (trimmed !== "") {
    const marker = markerLine();
    // One write = one "paste": the command (even multi-line) followed by the
    // marker line. The shell executes each line sequentially.
    writePtyLines(session, `${command}\necho ${marker}`);
    markSessionInput(session, command);
    const sentLines = [
      ...command.split("\n").map((l) => l.trim()).filter((l) => l !== ""),
      marker,
    ];
    return waitForOutput(session, startPos, marker, sentLines, waitMs, quietMs);
  }

  // Empty command = "tail" mode: block for new output without sending anything.
  return tailOutput(session, { waitMs, quietMs });
}

/** Block until fresh output arrives in the session, a quiet period passes, or waitMs elapses. */
export async function tailOutput(
  session: TerminalSession,
  options: { waitMs?: number; quietMs?: number; sentLines?: string[] } = {}
): Promise<CommandResult> {
  const waitMs = options.waitMs ?? 30000;
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS;
  const startPos = session.raw.length;
  const startedAt = Date.now();
  let lastSeen = 0;
  let lastActivity = Date.now();
  let status: CommandResult["status"] = "tail";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const n = session.raw.length - startPos;
    if (n > lastSeen) {
      lastSeen = n;
      lastActivity = Date.now();
    }
    if (!isSessionAlive(session)) {
      status = "ended";
      break;
    }
    if (lastSeen > 0 && Date.now() - lastActivity > quietMs) break;
    if (Date.now() - startedAt > waitMs) break;
    await sleep(POLL_MS);
  }
  const raw = session.raw.slice(startPos);
  return {
    status,
    output: cleanDelta(raw, options.sentLines ?? [], session.shell),
  };
}

async function waitForOutput(
  session: TerminalSession,
  startPos: number,
  marker: string,
  sentLines: string[],
  waitMs: number,
  quietMs: number
): Promise<CommandResult> {
  const startedAt = Date.now();
  let lastSeen = 0;
  let lastActivity = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const newText = session.raw.slice(startPos);
    if (newText.includes(marker)) {
      return {
        status: "completed",
        output: cleanDelta(newText, sentLines, session.shell),
      };
    }
    if (!isSessionAlive(session)) {
      return { status: "ended", output: cleanDelta(newText, sentLines, session.shell) };
    }
    const n = newText.length;
    if (n > lastSeen) {
      lastSeen = n;
      lastActivity = Date.now();
    }
    if (lastSeen > 0 && Date.now() - lastActivity > quietMs) {
      // Marker never appeared but output stopped: interactive prompt or
      // terminating error. Return what we have; session stays alive.
      return { status: "still-running", output: cleanDelta(newText, sentLines, session.shell) };
    }
    if (Date.now() - startedAt > waitMs) {
      return { status: "still-running", output: cleanDelta(newText, sentLines, session.shell) };
    }
    await sleep(POLL_MS);
  }
}

/**
 * Strip terminal chrome from a raw output delta: the shell prompt, the echoed
 * copy of the lines we just typed, the completion marker echo, and the cmd.exe
 * banner. We know exactly what we sent, so echoes are dropped by content.
 */
function cleanDelta(text: string, sentLines: string[], shell: string): string {
  const promptPrefix = [/^PS [^>]*> ?/, /^[A-Za-z]:\\[^>]*> ?/];
  const purePrompt = [/^PS [^>]*>\s*$/, /^[A-Za-z]:\\[^>]*>\s*$/];
  const preamble = preambleFor(shell);
  const normalized = text
    .replace(/\u001b\][^\u0007]*?(?:\u0007|\u001b\\)/g, "\n")
    .replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/([A-Za-z]:\\[^>\n]*>)/g, "\n$1\n");
  const out: string[] = [];
  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || purePrompt.some((re) => re.test(trimmed))) continue;
    if (/^Microsoft Windows \[Version/.test(trimmed)) continue;
    if (/^\(c\) Microsoft Corporation/.test(trimmed)) continue;
    let body = trimmed;
    for (const re of promptPrefix) body = body.replace(re, "");
    for (const sentLine of sentLines) {
      body = body.split(sentLine).join("");
    }
    body = body.replace(/__MCP_DONE_[a-f0-9]+__/g, "");
    body = body.replace(/^echo\s*$/i, "");
    if (preamble !== "" && body === preamble) continue;
    if (body.trim() === "") continue;
    out.push(body.trim());
  }
  return out.join("\n").trimEnd();
}