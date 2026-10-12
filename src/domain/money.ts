import { AppError } from "../output/errors.js";

export function parseEuroToCents(s: string): number {
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new AppError("BAD_AMOUNT", `cannot parse amount: ${s}`, 1);
  }
  return Math.round(parseFloat(cleaned) * 100);
}

export function formatCents(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function vatCents(netCents: number, vatBp: number): number {
  return Math.round((netCents * vatBp) / 10000);
}

export function grossCents(netCents: number, vatBp: number): number {
  return netCents + vatCents(netCents, vatBp);
}
