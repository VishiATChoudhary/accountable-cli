import { vatCents } from "./money.js";

export interface InvoiceItemInput {
  description: string; quantity: number; unit_price_cents: number; vat_bp: number;
}

function lineNet(i: InvoiceItemInput): number {
  return Math.round((i.quantity * i.unit_price_cents) / 1000); // quantity in thousandths
}

export function invoiceTotals(items: InvoiceItemInput[]) {
  let netCents = 0, vat = 0;
  for (const i of items) {
    const net = lineNet(i);
    netCents += net;
    vat += vatCents(net, i.vat_bp);
  }
  return { netCents, vatCents: vat, grossCents: netCents + vat };
}

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
