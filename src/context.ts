import { openDb, resolveDataDir } from "./db/index.js";

export interface Ctx { dataDir: string; db: import("better-sqlite3").Database; json: boolean; }

export function loadContext(opts: { dataDir?: string; json?: boolean; pretty?: boolean }): Ctx {
  const dataDir = resolveDataDir(opts.dataDir);
  const json = opts.pretty ? false : (opts.json ?? !process.stdout.isTTY);
  return { dataDir, db: openDb(dataDir), json };
}
