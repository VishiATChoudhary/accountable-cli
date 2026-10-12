import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { ClientsRepo } from "../src/db/repositories/clients.js";
import { QuotesRepo } from "../src/db/repositories/quotes.js";

describe("quotes", () => {
  it("converts an accepted quote to an invoice", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
    const client = new ClientsRepo(db).add({ name: "ACME" });
    const qr = new QuotesRepo(db);
    const q = qr.create({ client_id: client.id, issue_date: "2026-02-01", items: [{ description: "Design", quantity: 1000, unit_price_cents: 50000, vat_bp: 1900 }] });
    const inv = qr.toInvoice(q.id);
    expect(inv.number).toMatch(/2026-\d{4}/);
    expect(inv.client_id).toBe(client.id);
  });
});
