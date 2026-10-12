import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderInvoicePdf } from "../src/pdf/invoice.js";

describe("pdf", () => {
  it("produces a non-empty pdf file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const out = join(dir, "inv.pdf");
    await renderInvoicePdf(
      { number: "2026-0001", issue_date: "2026-01-01", due_date: "2026-01-15", items: [{ description: "Work", quantity: 1000, unit_price_cents: 10000, vat_bp: 1900 }] } as any,
      { name: "ACME GmbH", address: "Berlin" } as any,
      out,
    );
    const buf = readFileSync(out);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
