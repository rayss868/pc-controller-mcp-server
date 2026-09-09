import * as net from "node:net";
import { StringDecoder } from "node:string_decoder";

const args = process.argv.slice(2);
const valueFor = (name: string): string => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
};

const port = Number(valueFor("--port"));
const token = valueFor("--token");
const title = valueFor("--title") || "PC Controller";

if (!Number.isInteger(port) || port < 1 || !token) {
  process.stderr.write("Invalid terminal monitor arguments.\n");
  process.exit(1);
}

process.title = title;
if (process.platform === "win32") {
  process.stdout.write(`\x1b]0;${title}\x07`);
}

const socket = net.createConnection({ host: "127.0.0.1", port });
socket.setNoDelay(true);
socket.on("connect", () => {
  socket.write(`${JSON.stringify({ type: "auth", token })}\n`);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
});

let pending = "";
const decoder = new StringDecoder("utf8");
socket.on("data", (chunk: Buffer) => {
  pending += decoder.write(chunk);
  let newline = pending.indexOf("\n");
  while (newline >= 0) {
    const line = pending.slice(0, newline);
    pending = pending.slice(newline + 1);
    newline = pending.indexOf("\n");
    if (!line) continue;
    let message: { type?: string; data?: string };
    try {
      message = JSON.parse(line) as { type?: string; data?: string };
    } catch {
      continue;
    }
    if (message.type === "data" && typeof message.data === "string") {
      process.stdout.write(message.data);
    }
  }
});

const sendInput = (data: Buffer | string) => {
  const value = typeof data === "string" ? data : data.toString("utf8");
  if (!socket.destroyed) socket.write(`${JSON.stringify({ type: "input", data: value })}\n`);
};

process.stdin.on("data", sendInput);

const close = () => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  socket.destroy();
};

socket.on("close", () => {
  close();
  process.exit(0);
});
process.on("SIGINT", close);
process.on("SIGTERM", close);
process.on("exit", () => {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
});
