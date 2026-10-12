import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { TransactionsRepo } from "../src/db/repositories/transactions.js";

describe("transactions", () => {
  it("inserts a batch and lists unclassified", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
    const repo = new TransactionsRepo(db);
    const r = repo.insertBatch("csv", "feb.csv", [
      { booking_date: "2026-02-01", amount_cents: -5000, counterparty: "AWS", reference: "invoice", raw: {} },
      { booking_date: "2026-02-02", amount_cents: 120000, counterparty: "ACME", reference: "2026-0001", raw: {} },
    ]);
    expect(r.count).toBe(2);
    expect(repo.list({ status: "unclassified" })).toHaveLength(2);
  });
  it("refuses to re-classify an already classified transaction", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
    const repo = new TransactionsRepo(db);
    repo.insertBatch("csv", "f.csv", [{ booking_date: "2026-02-01", amount_cents: -100, counterparty: "X", reference: "y", raw: {} }]);
    const id = repo.list()[0].id;
    repo.setCategory(id, "hosting");
    try { repo.setCategory(id, "other"); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("ALREADY_CLASSIFIED"); }
  });
});
