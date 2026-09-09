import type { IPty } from "node-pty";

export interface TerminalSession {
  id: string;
  pty: IPty;
  shell: string;
  title: string;
  cwd: string;
  monitorDir: string;
  monitorLogPath: string;
  monitorPid?: number;
  monitorEnabled: boolean;
  output: string[]; // all output as lines (stdout+stderr merged), for paginated reads
  raw: string; // full raw output text, for streaming deltas
  createdAt: Date;
  lastOutputAt: Date;
  lastInputAt: Date;
  exited: boolean;
}
export const activeSessions = new Map<string, TerminalSession>();
export let sessionCounter = 0;
export function incrementSessionCounter() {
  return ++sessionCounter;
}
export const usageStats: Record<
  string,
  { count: number; lastUsed: Date; errors: number }
> = {};
export const recentToolCalls: Array<{
  tool: string;
  args: any;
  timestamp: Date;
  success: boolean;
  duration: number;
}> = [];

export function recordToolCall(
  toolName: string,
  args: any,
  success: boolean,
  duration: number
) {
  const stat = usageStats[toolName] ?? {
    count: 0,
    lastUsed: new Date(),
    errors: 0,
  };
  stat.count += 1;
  stat.lastUsed = new Date();
  if (!success) stat.errors += 1;
  usageStats[toolName] = stat;
  recentToolCalls.push({
    tool: toolName,
    args,
    timestamp: new Date(),
    success,
    duration,
  });
}
export const config = {
  blockedCommands: [
    "rm -rf /",
    "format",
    "rd /s /q",
    "del /f /s /q C:\\*",
  ],
  defaultShell: "cmd",
  fileReadLineLimit: 2000,
  fileWriteLineLimit: 2000,
};
