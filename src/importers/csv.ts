import { parseEuroToCents } from "../domain/money.js";
import { AppError } from "../output/errors.js";
import type { ParsedTx } from "../db/repositories/transactions.js";

export interface CsvMapping { date: string; amount: string; counterparty?: string; reference?: string; delimiter?: string; }

// RFC-4180-style field split: supports quoted fields, delimiters inside quotes,
// and doubled quotes as an escaped quote.
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(field); field = "";
    } else field += ch;
  }
  out.push(field);
  return out;
}

export function parseCsv(text: string, mapping: CsvMapping): ParsedTx[] {
  const delim = mapping.delimiter ?? ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new AppError("BAD_INPUT", "csv has no data rows", 1);
  const header = splitLine(lines[0], delim).map((h) => h.trim());
  const idx = (name: string) => { const i = header.indexOf(name); if (i < 0) throw new AppError("BAD_INPUT", `missing column: ${name}`, 1, { header }); return i; };
  const di = idx(mapping.date), ai = idx(mapping.amount);
  const ci = mapping.counterparty ? header.indexOf(mapping.counterparty) : -1;
  const ri = mapping.reference ? header.indexOf(mapping.reference) : -1;
  return lines.slice(1).map((line, rowNum) => {
    const cols = splitLine(line, delim);
    if (cols[di] === undefined || cols[ai] === undefined) {
      throw new AppError("BAD_INPUT", `row ${rowNum + 2} has too few columns`, 1, { line });
    }
    return { booking_date: cols[di].trim(), amount_cents: parseEuroToCents(cols[ai]), counterparty: ci >= 0 ? cols[ci]?.trim() : undefined, reference: ri >= 0 ? cols[ri]?.trim() : undefined, raw: Object.fromEntries(header.map((h, i) => [h, cols[i]])) };
  });
}
