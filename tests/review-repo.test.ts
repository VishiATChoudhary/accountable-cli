import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { ClientsRepo } from "../src/db/repositories/clients.js";
import { InvoicesRepo } from "../src/db/repositories/invoices.js";
import { QuotesRepo } from "../src/db/repositories/quotes.js";
import { TransactionsRepo } from "../src/db/repositories/transactions.js";

function db() { return openDb(mkdtempSync(join(tmpdir(), "fb-"))); }

describe("review fixes (repo)", () => {
  it("#2 does not consume an invoice number when the insert fails", () => {
    const d = db(); const client = new ClientsRepo(d).add({ name: "ACME" });
    const repo = new InvoicesRepo(d);
    // invalid: item with undefined fields forces the insert transaction to throw
    try { repo.create({ client_id: client.id, issue_date: "2026-01-01", items: [{} as any] }); } catch { /* expected */ }
    const ok = repo.create({ client_id: client.id, issue_date: "2026-01-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    expect(ok.number).toBe("2026-0001");
  });
  it("#3 QuotesRepo.create rejects a bogus client_id", () => {
    const d = db(); const repo = new QuotesRepo(d);
    try { repo.create({ client_id: "nope", issue_date: "2026-02-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] }); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("NOT_FOUND"); }
  });
  it("#11 quote cannot be converted twice", () => {
    const d = db(); const client = new ClientsRepo(d).add({ name: "ACME" });
    const repo = new QuotesRepo(d);
    const q = repo.create({ client_id: client.id, issue_date: "2026-02-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    repo.toInvoice(q.id);
    try { repo.toInvoice(q.id); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("ALREADY_CONVERTED"); }
  });
  it("#4 tx link requires an existing target and guards double classify", () => {
    const d = db(); const client = new ClientsRepo(d).add({ name: "ACME" });
    const inv = new InvoicesRepo(d).create({ client_id: client.id, issue_date: "2026-01-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    const tr = new TransactionsRepo(d);
    tr.insertBatch("csv", "f", [{ booking_date: "2026-01-01", amount_cents: 100, counterparty: "ACME", reference: "r", raw: {} }]);
    const tx = tr.list()[0];
    try { tr.link(tx.id, "invoice", "does-not-exist"); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("NOT_FOUND"); }
    tr.link(tx.id, "invoice", inv.id);
    try { tr.link(tx.id, "invoice", inv.id); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("ALREADY_CLASSIFIED"); }
  });
  it("#6 client cannot be removed while invoices reference it", () => {
    const d = db(); const client = new ClientsRepo(d).add({ name: "ACME" });
    new InvoicesRepo(d).create({ client_id: client.id, issue_date: "2026-01-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    try { new ClientsRepo(d).remove(client.id); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("IN_USE"); }
  });
});
