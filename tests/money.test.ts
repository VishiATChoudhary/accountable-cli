import { describe, it, expect } from "vitest";
import { parseEuroToCents, formatCents, vatCents, grossCents } from "../src/domain/money.js";

describe("money", () => {
  it("parses german decimal comma and thousands separator", () => {
    expect(parseEuroToCents("1.234,56")).toBe(123456);
    expect(parseEuroToCents("-12,00")).toBe(-1200);
    expect(parseEuroToCents("0,01")).toBe(1);
  });
  it("formats cents", () => {
    expect(formatCents(123456)).toBe("1234,56");
    expect(formatCents(-1200)).toBe("-12,00");
  });
  it("rounds VAT half-up on odd cents", () => {
    expect(vatCents(1, 1900)).toBe(0);
    expect(vatCents(3, 1900)).toBe(1);
    expect(vatCents(10000, 1900)).toBe(1900);
    expect(grossCents(10000, 1900)).toBe(11900);
  });
});
