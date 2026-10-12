import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDataDir } from "./db/index.js";
import { packageRoot } from "./paths.js";
import { badge, dim, reset } from "./tui/ansi.js";

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

async function alreadyRunning(url: string): Promise<boolean> {
  try { return (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(600) })).ok; } catch { return false; }
}

export async function startApp(opts: { port: number; open: boolean; dataDir?: string }): Promise<void> {
  const url = `http://127.0.0.1:${opts.port}`;
  if (await alreadyRunning(url)) {
    console.log(`${badge("✺ freebies")} already running at ${url}`);
    if (opts.open) openBrowser(url);
    return;
  }
  const root = packageRoot();
  const webDist = join(root, "web", "dist");
  if (!existsSync(join(webDist, "index.html"))) {
    console.error("The web app isn't built yet. Run `npm run ui:build` in the freebies folder first.");
    process.exit(1);
  }
  const dataDir = resolveDataDir(opts.dataDir);
  const [{ serve }, { createApp }, { createRunner }] = await Promise.all([
    import("@hono/node-server"), import("../server/app.js"), import("../server/agent/runner.js"),
  ]);
  const app = createApp({ dataDir, webDist, runTurn: createRunner({ dataDir, repoRoot: root, claudeBin: process.env.CLAUDE_BIN, model: process.env.FREEBIES_MODEL }) });
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: opts.port }, () => {
    console.log(`\n  ${badge("✺ freebies")}  ${url}\n  ${dim}data in ${dataDir}\n  ctrl+c to stop${reset}\n`);
    if (opts.open) openBrowser(url);
  });
  server.on("error", (e: NodeJS.ErrnoException) => {
    console.error(e.code === "EADDRINUSE" ? `Port ${opts.port} is in use. Try \`freebies app --port 4318\`.` : e.message);
    process.exit(1);
  });
  await new Promise<void>((resolve) => process.on("SIGINT", () => { server.close(); resolve(); }));
}
