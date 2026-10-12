import { openDb, resolveDataDir } from "./db/index.js";

export interface Ctx { dataDir: string; db: import("better-sqlite3").Database; json: boolean; }

export function loadContext(opts: { dataDir?: string; json?: boolean }): Ctx {
  const dataDir = resolveDataDir(opts.dataDir);
  return { dataDir, db: openDb(dataDir), json: opts.json ?? !process.stdout.isTTY };
}
