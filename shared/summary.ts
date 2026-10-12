// Turns an action summary like "Categorize · Finanzamt Berlin −1.200,00 € · taxes"
// into display parts, so cards lay out structure instead of printing separators.
const LABEL: Record<string, string> = {
  "client.create": "new customer", "client.update": "customer", "invoice.create": "invoice", "invoice.status": "invoice",
  "expense.create": "expense", "tx.import": "bank import", "tx.classify": "category", "tx.link": "match",
};
const MONEY = /^(.*?)\s*([−-]?\d{1,3}(?:\.\d{3})*,\d{2}\s?€)$/;

export function parseSummary(kind: string, summary: string): { label: string; title: string; amount: string; note: string } {
  const parts = summary.split(" · ");
  const label = LABEL[kind] ?? kind;
  if (parts.length === 1) return { label, title: parts[0], amount: "", note: "" };
  let title = parts[1];
  let amount = "";
  let note = parts.slice(2).join(" ");
  if (MONEY.test(note)) { amount = note; note = ""; }
  const m = title.match(MONEY);
  if (!amount && m && m[1]) { title = m[1]; amount = m[2]; }
  return { label, title, amount, note };
}
