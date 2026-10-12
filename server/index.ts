import { serve } from "@hono/node-server";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createRunner } from "./agent/runner.js";
import { resolveDataDir } from "../src/db/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolveDataDir();
const port = Number(process.env.PORT ?? 4317);
const production = process.env.NODE_ENV === "production";

const app = createApp({
  dataDir,
  runTurn: createRunner({ dataDir, repoRoot, claudeBin: process.env.CLAUDE_BIN, model: process.env.FREEBIES_MODEL }),
  webDist: production ? join(repoRoot, "web", "dist") : undefined,
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, ({ port }) => {
  console.log(`freebies ${production ? "app" : "api"} on http://127.0.0.1:${port}  (data: ${dataDir})`);
});
