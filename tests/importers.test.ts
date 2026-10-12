import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/importers/csv.js";
import { parseCamt } from "../src/importers/camt.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => readFileSync(join(here, "fixtures", n), "utf8");

describe("importers", () => {
  it("parses german csv amounts and columns", () => {
    const rows = parseCsv(fx("sample.csv"), { date: "Buchungstag", amount: "Betrag", counterparty: "Beguenstigter", reference: "Verwendungszweck", delimiter: ";" });
    expect(rows).toHaveLength(2);
    expect(rows[0].amount_cents).toBe(-5000);
    expect(rows[1].amount_cents).toBe(123456);
  });
  it("rejects a csv missing the mapped amount column", () => {
    try { parseCsv("Buchungstag;Beguenstigter\n2026-02-01;AWS", { date: "Buchungstag", amount: "Betrag", delimiter: ";" }); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toMatch(/BAD_INPUT|BAD_AMOUNT/); }
  });
  it("rejects an empty csv", () => {
    try { parseCsv("", { date: "Buchungstag", amount: "Betrag" }); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("BAD_INPUT"); }
  });
  it("parses camt.053 entries", () => {
    const rows = parseCamt(fx("sample.camt.xml"));
    expect(rows.length).toBe(2);
    expect(rows[0].amount_cents).toBe(-5000);
    expect(rows[1].amount_cents).toBe(123456);
  });
});
