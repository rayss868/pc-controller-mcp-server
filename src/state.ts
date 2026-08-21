import { spawn } from "child_process";

export const activeSessions = new Map<
  string,
  { process: ReturnType<typeof spawn>; output: string[]; createdAt: Date }
>();
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
export const config = {
  blockedCommands: [
    "rm -rf /",
    "format",
    "rd /s /q",
    "del /f /s /q C:\\*",
  ],
  defaultShell: "powershell",
  fileReadLineLimit: 2000,
  fileWriteLineLimit: 2000,
};
