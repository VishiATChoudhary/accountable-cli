import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderInvoicePdf } from "../src/pdf/invoice.js";
import { engraving } from "../shared/engraving.js";

const item = (n: number) => ({ description: `Work package ${n}`, quantity: 1000, unit_price_cents: 10000, vat_bp: 1900 });
const invoice = (items: any[]) => ({ id: "x", number: "2026-0001", client_id: "c", issue_date: "2026-10-12", due_date: "2026-10-26", status: "draft", currency: "EUR", created_at: "", items } as any);
const business = { name: "Vishi Choudhary", address: "Torstraße 12, 10119 Berlin", tax_number: "34/567/89012", vat_id: "DE312345678", iban: "DE89 3704 0044 0532 0130 00", email: "hi@vishi.de" };

async function render(items: any[], clientName = "ACME GmbH", biz: any = business) {
  const out = join(mkdtempSync(join(tmpdir(), "fb-")), "inv.pdf");
  await renderInvoicePdf(invoice(items), { name: clientName, address: "Berlin" } as any, out, biz);
  return readFileSync(out);
}
const pages = (buf: Buffer) => (buf.toString("latin1").match(/\/Type \/Page[^s]/g) ?? []).length;
const fonts = (buf: Buffer) => new Set(buf.toString("latin1").match(/\/BaseFont \/[A-Z]+\+EBGaramond-[A-Za-z]+/g) ?? []);

describe("invoice pdf", () => {
  it("is a one-page PDF set in EB Garamond", async () => {
    const buf = await render([item(1)]);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(buf)).toBe(1);
    expect([...fonts(buf)].some((f) => f.endsWith("EBGaramond-Regular"))).toBe(true);
  });
  it("breaks long invoices across pages", async () => {
    expect(pages(await render(Array.from({ length: 60 }, (_, i) => item(i + 1))))).toBeGreaterThan(1);
  });
  it("falls back to the extended-Latin font for names outside the Western subset", async () => {
    const buf = await render([item(1)], "Łukasz Dvořák s.r.o.");
    // Both subsets share a PostScript name; two embeddings of one face means the fallback kicked in.
    const byFace = new Map<string, number>();
    for (const f of fonts(buf)) { const face = f.split("+")[1]; byFace.set(face, (byFace.get(face) ?? 0) + 1); }
    expect(Math.max(...byFace.values())).toBeGreaterThanOrEqual(2);
  });
  it("renders without any business details set", async () => {
    expect(pages(await render([item(1)], "ACME", {}))).toBe(1);
  });
});

describe("engraving geometry", () => {
  it("is deterministic per seed and non-empty", () => {
    const a = engraving({ width: 400, height: 120, seed: 3 });
    const b = engraving({ width: 400, height: 120, seed: 3 });
    expect(a).toEqual(b);
    expect(a.layers.length).toBe(4);
    expect(a.layers[0].hatch.length).toBeGreaterThan(10);
  });
});
