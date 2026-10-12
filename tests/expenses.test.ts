import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { ExpensesRepo } from "../src/db/repositories/expenses.js";

describe("expenses", () => {
  it("adds expense and attaches receipt", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const db = openDb(dir);
    const repo = new ExpensesRepo(db);
    const e = repo.add({ date: "2026-03-01", supplier: "AWS", net_cents: 5000, vat_bp: 1900, category: "hosting" });
    const src = join(dir, "receipt.txt");
    writeFileSync(src, "receipt");
    const updated = repo.attach(e.id, src, dir);
    expect(updated.receipt_path).toBeTruthy();
    expect(existsSync(updated.receipt_path!)).toBe(true);
  });
});
