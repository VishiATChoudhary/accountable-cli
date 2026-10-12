import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import type { Invoice } from "../db/repositories/invoices.js";
import type { Client } from "../db/repositories/clients.js";
import type { Business } from "../db/repositories/business.js";
import type { InvoiceItemInput } from "../domain/invoice.js";
import { invoiceTotals } from "../domain/invoice.js";
import { formatCents } from "../domain/money.js";

export function renderInvoicePdf(
  invoice: Invoice & { items: InvoiceItemInput[] }, client: Client, outPath: string, business: Business = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);

    // Seller identity (header)
    if (business.name) {
      doc.fontSize(9);
      const parts = [business.name, business.address, business.tax_number ? `Steuernummer: ${business.tax_number}` : null, business.vat_id ? `USt-IdNr: ${business.vat_id}` : null].filter(Boolean);
      doc.text(parts.join("  |  "));
      doc.moveDown();
    }

    doc.fontSize(20).text(`Rechnung ${invoice.number}`);
    doc.moveDown().fontSize(10).text(client.name);
    if (client.address) doc.text(client.address);
    if (client.vat_id) doc.text(`USt-IdNr: ${client.vat_id}`);
    doc.moveDown();
    doc.text(`Rechnungsdatum: ${invoice.issue_date}`);
    doc.text(`Leistungsdatum: ${invoice.issue_date}`);
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

    if (business.kleinunternehmer) {
      doc.moveDown().fontSize(9).text("Gemaess § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).");
    }

    doc.end();
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
  });
}
