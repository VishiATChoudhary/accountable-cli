import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { paymentDetails, renderInvoicePdf } from "../src/pdf/invoice.js";
import { bic } from "../src/tui/validate.js";

const run = (dir: string, args: string[]) =>
  JSON.parse(execFileSync("npx", ["tsx", "src/cli.ts", "--data-dir", dir, "--json", ...args], { encoding: "utf8" }));

describe("invoice payment details", () => {
  const inv = { number: "2026-0001" } as any;
  it("lists account holder, IBAN, BIC and the invoice number as bank reference", () => {
    expect(paymentDetails({ name: "BabaServices", owner: "Vishisht Choudhary", iban: "DE55 1203 0000 1072 3936 04", bic: "BYLADEM1001" }, inv)).toEqual([
      ["Kontoinhaber", "Vishisht Choudhary"],
      ["IBAN", "DE55 1203 0000 1072 3936 04"],
      ["BIC", "BYLADEM1001"],
      ["Verwendungszweck", "2026-0001"],
    ]);
  });
  it("prefers an explicit account holder and falls back to the business name", () => {
    expect(paymentDetails({ name: "Studio", owner: "A", account_holder: "B", iban: "DE89370400440532013000" }, inv)[0]).toEqual(["Kontoinhaber", "B"]);
    expect(paymentDetails({ name: "Studio", iban: "DE89370400440532013000" }, inv)[0]).toEqual(["Kontoinhaber", "Studio"]);
  });
  it("is empty without an IBAN, so no half-filled bank box is printed", () => {
    expect(paymentDetails({ name: "Studio", bic: "BYLADEM1001" }, inv)).toEqual([]);
  });
});

describe("bic check", () => {
  it("accepts 8 and 11 character BICs, with spaces", () => {
    expect(bic("BYLA DE M1001")).toBeNull();
    expect(bic("DEUTDEFF")).toBeNull();
    expect(bic("")).toBeNull();
  });
  it("rejects malformed BICs", () => {
    expect(bic("BYLA")).toMatch(/BIC/);
    expect(bic("12345678")).toMatch(/BIC/);
  });
});

describe("business and invoice fields (cli)", () => {
  it("stores owner, account holder and BIC", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const b = run(dir, ["business", "set", "--name", "BabaServices", "--owner", "Vishisht Choudhary", "--account-holder", "V. Choudhary", "--bic", "BYLADEM1001"]);
    expect(b).toMatchObject({ name: "BabaServices", owner: "Vishisht Choudhary", account_holder: "V. Choudhary", bic: "BYLADEM1001" });
  });
  it("stores a delivery date on create and edit", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const client = run(dir, ["clients", "add", "--name", "Invertix GmbH"]).id;
    const f = join(dir, "inv.json");
    writeFileSync(f, JSON.stringify({ client_id: client, issue_date: "2026-07-03", delivery_date: "2026-06-30", items: [{ description: "Software Engineering", quantity: 1000, unit_price_cents: 290000, vat_bp: 0 }] }));
    const inv = run(dir, ["invoices", "create", "--from", f]);
    expect(run(dir, ["invoices", "get", inv.id]).delivery_date).toBe("2026-06-30");
    expect(run(dir, ["invoices", "edit", inv.id, "--delivery-date", "2026-07-01"]).delivery_date).toBe("2026-07-01");
  });
});

describe("invoice pdf template", () => {
  it("renders detail lines under an item and the bank box on one page", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "fb-")), "inv.pdf");
    const invoice = { id: "x", number: "2026-0001", client_id: "c", issue_date: "2026-07-03", delivery_date: "2026-07-03", due_date: "2026-07-10", status: "draft", currency: "EUR", created_at: "",
      items: [{ description: "Software Engineering\n- Agent building\n- Database refactoring\n- GCP migration guide", quantity: 1000, unit_price_cents: 290000, vat_bp: 0 }] } as any;
    await renderInvoicePdf(invoice, { name: "Invertix GmbH", address: "Conollystraße 3\n80809 München", country: "DE" } as any, out,
      { name: "BabaServices", owner: "Vishisht Choudhary", address: "Leutkircher Straße 3\n80939 München", tax_number: "144/180/72319", email: "v@example.com", iban: "DE55 1203 0000 1072 3936 04", bic: "BYLADEM1001", kleinunternehmer: true });
    const buf = readFileSync(out);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((buf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length).toBe(1);
  });
});
