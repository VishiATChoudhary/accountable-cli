import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { ClientsRepo } from "../src/db/repositories/clients.js";
import { InvoicesRepo } from "../src/db/repositories/invoices.js";
import { invoiceTotals } from "../src/domain/invoice.js";

function ctx() {
  const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
  const client = new ClientsRepo(db).add({ name: "ACME" });
  return { db, client };
}

describe("invoices", () => {
  it("computes totals with mixed VAT", () => {
    const t = invoiceTotals([
      { description: "a", quantity: 2000, unit_price_cents: 10000, vat_bp: 1900 },
      { description: "b", quantity: 1000, unit_price_cents: 5000, vat_bp: 700 },
    ]);
    expect(t.netCents).toBe(25000);
    expect(t.vatCents).toBe(3800 + 350);
    expect(t.grossCents).toBe(25000 + 4150);
  });
  it("numbers invoices gaplessly even after void", () => {
    const { db, client } = ctx();
    const repo = new InvoicesRepo(db);
    const a = repo.create({ client_id: client.id, issue_date: "2026-01-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    repo.setStatus(a.id, "void");
    const b = repo.create({ client_id: client.id, issue_date: "2026-01-02", items: [{ description: "y", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    expect(a.number).toBe("2026-0001");
    expect(b.number).toBe("2026-0002");
  });
});
