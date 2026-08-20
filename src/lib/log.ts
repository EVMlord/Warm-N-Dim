import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

const logsDir = path.join(app.getPath("userData"), "logs");
const logFile = path.join(logsDir, "main.log");

export function getLogsDir(): string {
  return logsDir;
}

export function logMain(...args: unknown[]): void {
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const line =
      new Date().toISOString() +
      " " +
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ") +
      "\n";
    fs.appendFileSync(logFile, line);
  } catch {
    // logging must never throw
  }
  console.log(...args);
}
