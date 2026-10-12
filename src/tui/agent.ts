import { execFile } from "node:child_process";

export type AgentStatus = { ok: true; version: string } | { ok: false };

/** Is the Claude Code CLI installed? The in-app agent runs through it. */
export function checkAgent(): Promise<AgentStatus> {
  return new Promise((resolve) => {
    execFile(process.env.CLAUDE_BIN ?? "claude", ["--version"], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ ok: false });
      resolve({ ok: true, version: (stdout.match(/\d+\.\d+\.\d+/) ?? [stdout.trim()])[0] });
    });
  });
}
