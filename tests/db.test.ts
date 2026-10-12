import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";

describe("db", () => {
  it("creates all tables on open", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const db = openDb(dir);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    for (const t of ["clients","invoices","invoice_items","quotes","quote_items","expenses","transactions","tx_links","import_batches","meta"]) {
      expect(tables).toContain(t);
    }
  });
});
