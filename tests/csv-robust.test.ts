import { describe, it, expect } from "vitest";
import { parseCsv } from "../src/importers/csv.js";

describe("csv robustness", () => {
  it("handles quoted fields containing the delimiter", () => {
    const text = 'Datum;Verwendungszweck;Betrag\n2026-02-01;"Rechnung 1; Teilzahlung";-50,00\n';
    const rows = parseCsv(text, { date: "Datum", amount: "Betrag", reference: "Verwendungszweck", delimiter: ";" });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount_cents).toBe(-5000);
    expect(rows[0].reference).toBe("Rechnung 1; Teilzahlung");
  });
  it("handles doubled quotes as an escaped quote", () => {
    const text = 'Datum;Text;Betrag\n2026-02-01;"a ""b"" c";10,00\n';
    const rows = parseCsv(text, { date: "Datum", amount: "Betrag", reference: "Text", delimiter: ";" });
    expect(rows[0].reference).toBe('a "b" c');
  });
  it("rejects a short row missing the amount cell as user error", () => {
    const text = "Datum;Beguenstigter;Betrag\n2026-02-01;AWS\n";
    try { parseCsv(text, { date: "Datum", amount: "Betrag", delimiter: ";" }); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("BAD_INPUT"); }
  });
});
