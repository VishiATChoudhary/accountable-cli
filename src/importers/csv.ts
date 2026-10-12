import { parseEuroToCents } from "../domain/money.js";
import { AppError } from "../output/errors.js";
import type { ParsedTx } from "../db/repositories/transactions.js";

export interface CsvMapping { date: string; amount: string; counterparty?: string; reference?: string; delimiter?: string; }

export function parseCsv(text: string, mapping: CsvMapping): ParsedTx[] {
  const delim = mapping.delimiter ?? ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new AppError("BAD_INPUT", "csv has no data rows", 1);
  const header = lines[0].split(delim).map((h) => h.trim());
  const idx = (name: string) => { const i = header.indexOf(name); if (i < 0) throw new AppError("BAD_INPUT", `missing column: ${name}`, 1, { header }); return i; };
  const di = idx(mapping.date), ai = idx(mapping.amount);
  const ci = mapping.counterparty ? header.indexOf(mapping.counterparty) : -1;
  const ri = mapping.reference ? header.indexOf(mapping.reference) : -1;
  return lines.slice(1).map((line) => {
    const cols = line.split(delim);
    return { booking_date: cols[di].trim(), amount_cents: parseEuroToCents(cols[ai]), counterparty: ci >= 0 ? cols[ci]?.trim() : undefined, reference: ri >= 0 ? cols[ri]?.trim() : undefined, raw: Object.fromEntries(header.map((h, i) => [h, cols[i]])) };
  });
}
