import Database from "better-sqlite3";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveDataDir(override?: string): string {
  if (override) return override;
  if (process.env.FREEBIES_DATA_DIR) return process.env.FREEBIES_DATA_DIR;
  const xdg = process.env.XDG_DATA_HOME;
  return join(xdg ?? join(homedir(), ".local", "share"), "freebies");
}

export function openDb(dataDir: string): Database.Database {
  mkdirSync(join(dataDir, "files"), { recursive: true });
  const db = new Database(join(dataDir, "freebies.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const migDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
  const metaExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get();
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (metaExists && f === "001_init.sql") continue;
    db.exec(readFileSync(join(migDir, f), "utf8"));
  }
  return db;
}
