import { describe, it, expect } from "vitest";
import { parseSummary } from "../../shared/summary.js";

describe("parseSummary", () => {
  it("splits label, subject and amount", () => {
    expect(parseSummary("invoice.create", "Invoice · Kollektiv Acht UG · 1.356,60 €")).toEqual({ label: "invoice", title: "Kollektiv Acht UG", amount: "1.356,60 €", note: "" });
  });
  it("pulls a trailing amount out of a transaction subject and keeps the category as a note", () => {
    expect(parseSummary("tx.classify", "Categorize · Finanzamt Berlin −1.200,00 € · taxes")).toEqual({ label: "category", title: "Finanzamt Berlin", amount: "−1.200,00 €", note: "taxes" });
    expect(parseSummary("tx.link", "Match · Telekom Deutschland -50,00 €")).toEqual({ label: "match", title: "Telekom Deutschland", amount: "-50,00 €", note: "" });
  });
  it("handles single-part summaries", () => {
    expect(parseSummary("invoice.status", "Mark 2026-0003 paid")).toEqual({ label: "invoice", title: "Mark 2026-0003 paid", amount: "", note: "" });
  });
});
