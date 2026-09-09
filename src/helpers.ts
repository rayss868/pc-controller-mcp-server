import { exec } from "child_process";
import { promisify } from "util";
import { config } from "./state.js";

export const execAsync = promisify(exec);

export function isCommandBlocked(command: string): string | null {
  const normalized = command.toLowerCase();
  for (const blocked of config.blockedCommands) {
    if (normalized.includes(blocked.toLowerCase())) {
      return blocked;
    }
  }
  return null;
}

export function buildShellCommand(command: string, shell: string): string {
  switch (shell) {
    case "gitbash":
      return `& 'C:\\Program Files\\Git\\bin\\bash.exe' -lc '${command.replace(/'/g, "''")}'`;
    case "wsl":
      return `& 'C:\\Windows\\System32\\bash.exe' -lc '${command.replace(/'/g, "''")}'`;
    default:
      return command;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
