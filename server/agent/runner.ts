// Spawns an isolated `claude -p` process for one chat turn.
// Isolation: project settings only (no user hooks/plugins/defaultMode), no MCP
// servers, only Bash/Read/Glob, writes impossible (Bash limited to freebies-ro).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { StreamMapper } from "./stream.js";
import { systemPrompt } from "./prompt.js";
import type { RunTurn } from "./chat.js";

export function claudeArgs(opts: { uploadsDir: string; resumeId: string | null; today: string; model?: string }): string[] {
  const args = [
    "-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose",
    "--setting-sources", "project", "--strict-mcp-config",
    "--tools", "Bash,Read,Glob",
    "--allowedTools", "Bash(freebies-ro:*)", "Read", "Glob",
    "--permission-mode", "default",
    "--add-dir", opts.uploadsDir,
    "--append-system-prompt", systemPrompt(opts.today),
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.resumeId) args.push("--resume", opts.resumeId);
  return args;
}

export function createRunner(cfg: { claudeBin?: string; dataDir: string; repoRoot: string; model?: string }): RunTurn {
  const uploadsDir = join(cfg.dataDir, "uploads");
  mkdirSync(uploadsDir, { recursive: true });

  const once = (prompt: string, resumeId: string | null, onEvent: Parameters<RunTurn>[0]["onEvent"], signal?: AbortSignal) =>
    new Promise<Awaited<ReturnType<RunTurn>> & { stderr: string }>((resolve) => {
      const today = new Date().toISOString().slice(0, 10);
      const child = spawn(cfg.claudeBin ?? "claude", claudeArgs({ uploadsDir, resumeId, today, model: cfg.model }), {
        cwd: cfg.repoRoot,
        env: { ...process.env, PATH: `${join(cfg.repoRoot, "bin")}:${process.env.PATH ?? ""}`, FREEBIES_DATA_DIR: cfg.dataDir },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const mapper = new StreamMapper();
      let stderr = "";
      let isError = false;
      let error: string | undefined;
      child.stderr.on("data", (d) => (stderr += d));
      createInterface({ input: child.stdout }).on("line", (line) => {
        if (!line.trim()) return;
        let obj: any;
        try { obj = JSON.parse(line); } catch { return; }
        for (const e of mapper.push(obj)) {
          if (e.type === "done") { isError = e.isError; error = e.error; }
          onEvent(e);
        }
      });
      const onAbort = () => child.kill("SIGTERM");
      signal?.addEventListener("abort", onAbort, { once: true });
      child.on("error", (err) => { isError = true; error = err.message; });
      child.on("close", (code) => {
        signal?.removeEventListener("abort", onAbort);
        if (!mapper.finished) {
          isError = true;
          error = signal?.aborted ? "stopped" : (stderr.trim().split("\n").at(-1) || `claude exited with code ${code}`);
          onEvent({ type: "done", isError: true, error });
        }
        resolve({ claudeSessionId: mapper.claudeSessionId, text: mapper.text, isError, error, stderr });
      });
      child.stdin.end(prompt);
    });

  return async ({ prompt, resumeId, onEvent, signal }) => {
    let r = await once(prompt, resumeId, onEvent, signal);
    // A deleted or expired Claude session: start a fresh one instead of failing.
    if (r.isError && resumeId && !r.text && /no conversation found|session/i.test(r.stderr + (r.error ?? ""))) {
      r = await once(prompt, null, onEvent, signal);
    }
    const { stderr: _s, ...rest } = r;
    return rest;
  };
}
