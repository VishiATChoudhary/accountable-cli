import { describe, it, expect } from "vitest";
import { classifyOne, Rule } from "../src/domain/classify.js";

const rules: Rule[] = [
  { match: { counterparty: "AWS" }, category: "hosting" },
  { match: { reference: "Rechnung" }, category: "revenue" },
  { match: { amountMin: -1000, amountMax: -1 }, category: "small-expense" },
];

describe("classify", () => {
  it("matches by counterparty substring (case-insensitive)", () => {
    expect(classifyOne({ counterparty: "AWS EMEA", reference: "", amount_cents: -5000 } as any, rules)).toBe("hosting");
  });
  it("matches by reference", () => {
    expect(classifyOne({ counterparty: "ACME", reference: "Rechnung 2026-0001", amount_cents: 120000 } as any, rules)).toBe("revenue");
  });
  it("returns null when nothing matches", () => {
    expect(classifyOne({ counterparty: "X", reference: "Y", amount_cents: -99999 } as any, rules)).toBeNull();
  });
});
