import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import type { Invoice } from "../db/repositories/invoices.js";
import type { Client } from "../db/repositories/clients.js";
import type { InvoiceItemInput } from "../domain/invoice.js";
import { invoiceTotals } from "../domain/invoice.js";
import { formatCents } from "../domain/money.js";

export function renderInvoicePdf(
  invoice: Invoice & { items: InvoiceItemInput[] }, client: Client, outPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    doc.fontSize(20).text(`Rechnung ${invoice.number}`);
    doc.moveDown().fontSize(10).text(client.name);
    if (client.address) doc.text(client.address);
    doc.moveDown().text(`Rechnungsdatum: ${invoice.issue_date}`);
    if (invoice.due_date) doc.text(`Faellig: ${invoice.due_date}`);
    doc.moveDown();
    for (const it of invoice.items) {
      const net = Math.round((it.quantity * it.unit_price_cents) / 1000);
      doc.text(`${it.description}  ${formatCents(net)} EUR  (${it.vat_bp / 100}% USt)`);
    }
    const t = invoiceTotals(invoice.items);
    doc.moveDown().text(`Netto: ${formatCents(t.netCents)} EUR`);
    doc.text(`USt: ${formatCents(t.vatCents)} EUR`);
    doc.text(`Gesamt: ${formatCents(t.grossCents)} EUR`);
    doc.end();
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
  });
}
