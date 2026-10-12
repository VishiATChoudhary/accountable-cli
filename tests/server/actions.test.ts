import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/db/index.js";
import { ClientsRepo } from "../../src/db/repositories/clients.js";
import { UploadsRepo } from "../../src/db/repositories/uploads.js";
import { TransactionsRepo } from "../../src/db/repositories/transactions.js";
import { ExpensesRepo } from "../../src/db/repositories/expenses.js";
import { prepareAction, executeAction } from "../../server/agent/actions.js";
import { formatEuro } from "../../shared/format.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fb-"));
  const db = openDb(dir);
  return { dir, db, client: new ClientsRepo(db).add({ name: "ACME GmbH" }) };
}

describe("formatEuro", () => {
  it("uses German grouping and decimals", () => {
    expect(formatEuro(119000).replace(/\s/g, " ")).toBe("1.190,00 €");
    expect(formatEuro(-5000).replace(/\s/g, " ")).toBe("\u221250,00 €");
  });
});

describe("prepareAction", () => {
  it("validates an invoice and summarizes with client name and gross", () => {
    const { db, client } = setup();
    const r = prepareAction(db, { kind: "invoice.create", payload: { client_id: client.id, issue_date: "2026-10-12", items: [{ description: "Work", quantity: 1000, unit_price_cents: 100000, vat_bp: 1900 }] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.summary.replace(/\s/g, " ")).toBe("Invoice · ACME GmbH · 1.190,00 €");
  });
  it("rejects an invoice for an unknown client", () => {
    const { db } = setup();
    const r = prepareAction(db, { kind: "invoice.create", payload: { client_id: "nope", issue_date: "2026-10-12", items: [{ description: "W", quantity: 1000, unit_price_cents: 1, vat_bp: 0 }] } });
    expect(r.ok).toBe(false);
  });
  it("rejects unknown kinds and malformed payloads", () => {
    const { db } = setup();
    expect(prepareAction(db, { kind: "db.drop", payload: {} }).ok).toBe(false);
    expect(prepareAction(db, { kind: "client.create", payload: {} }).ok).toBe(false);
  });
  it("requires a mapping for csv imports", () => {
    const { db, dir } = setup();
    const u = new UploadsRepo(db).add({ filename: "s.csv", path: join(dir, "s.csv"), mime: "text/csv", size: 1 });
    expect(prepareAction(db, { kind: "tx.import", payload: { upload_id: u.id, format: "csv" } }).ok).toBe(false);
  });
});

describe("executeAction", () => {
  it("creates a customer", () => {
    const { db, dir } = setup();
    const p = prepareAction(db, { kind: "client.create", payload: { name: "Beta AG", vat_id: "DE1" } });
    if (!p.ok) throw new Error(p.error);
    const res = executeAction(db, dir, p.kind, p.payload) as any;
    expect(new ClientsRepo(db).get(res.id).name).toBe("Beta AG");
  });
  it("creates an expense and attaches the uploaded receipt", () => {
    const { db, dir } = setup();
    const f = join(dir, "receipt.pdf"); writeFileSync(f, "%PDF-1.4 test");
    const u = new UploadsRepo(db).add({ filename: "receipt.pdf", path: f, mime: "application/pdf", size: 13 });
    const p = prepareAction(db, { kind: "expense.create", payload: { date: "2026-10-01", supplier: "AWS", net_cents: 5000, vat_bp: 1900, category: "hosting", upload_id: u.id } });
    if (!p.ok) throw new Error(p.error);
    const res = executeAction(db, dir, p.kind, p.payload) as any;
    expect(new ExpensesRepo(db).get(res.id).receipt_path).toContain("receipt.pdf");
  });
  it("imports an uploaded csv with the proposed mapping", () => {
    const { db, dir } = setup();
    const f = join(dir, "s.csv"); writeFileSync(f, "Buchungstag;Betrag;Name;Zweck\n2026-10-01;-50,00;AWS;Hosting\n");
    const u = new UploadsRepo(db).add({ filename: "s.csv", path: f, mime: "text/csv", size: 10 });
    const p = prepareAction(db, { kind: "tx.import", payload: { upload_id: u.id, format: "csv", mapping: { date: "Buchungstag", amount: "Betrag", counterparty: "Name", reference: "Zweck", delimiter: ";" } } });
    if (!p.ok) throw new Error(p.error);
    const res = executeAction(db, dir, p.kind, p.payload) as any;
    expect(res.count).toBe(1);
    expect(new TransactionsRepo(db).list()[0].amount_cents).toBe(-5000);
  });
});

describe("invoice with inline new customer", () => {
  it("summarizes as new and creates customer + invoice together on confirm", () => {
    const { db, dir } = setup();
    const p = prepareAction(db, { kind: "invoice.create", payload: { new_client: { name: "Gamma UG" }, issue_date: "2026-10-12", items: [{ description: "Design", quantity: 2000, unit_price_cents: 5000, vat_bp: 1900 }] } });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.summary.replace(/\s/g, " ")).toBe("Invoice · Gamma UG (new) · 119,00 €");
    const res = executeAction(db, dir, p.kind, p.payload) as any;
    expect(res.number).toMatch(/^2026-\d{4}$/);
    expect(new ClientsRepo(db).list().map((c) => c.name)).toContain("Gamma UG");
  });
  it("rejects both or neither of client_id and new_client", () => {
    const { db, client } = setup();
    const items = [{ description: "W", quantity: 1000, unit_price_cents: 1, vat_bp: 0 }];
    expect(prepareAction(db, { kind: "invoice.create", payload: { issue_date: "2026-10-12", items } }).ok).toBe(false);
    expect(prepareAction(db, { kind: "invoice.create", payload: { client_id: client.id, new_client: { name: "X" }, issue_date: "2026-10-12", items } }).ok).toBe(false);
  });
});
