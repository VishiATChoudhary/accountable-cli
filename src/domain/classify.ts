import type { Transaction } from "../db/repositories/transactions.js";

export interface Rule {
  match: { counterparty?: string; reference?: string; amountMin?: number; amountMax?: number };
  category: string;
}

export function classifyOne(tx: Pick<Transaction, "counterparty" | "reference" | "amount_cents">, rules: Rule[]): string | null {
  for (const r of rules) {
    const m = r.match;
    if (m.counterparty && !(tx.counterparty ?? "").toLowerCase().includes(m.counterparty.toLowerCase())) continue;
    if (m.reference && !(tx.reference ?? "").toLowerCase().includes(m.reference.toLowerCase())) continue;
    if (m.amountMin !== undefined && tx.amount_cents < m.amountMin) continue;
    if (m.amountMax !== undefined && tx.amount_cents > m.amountMax) continue;
    return r.category;
  }
  return null;
}
