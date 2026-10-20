import * as fontkit from "fontkit";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Invoice } from "../db/repositories/invoices.js";
import type { Business } from "../db/repositories/business.js";
import type { InvoiceItemInput } from "../domain/invoice.js";
import { vatCents } from "../domain/money.js";
import { formatEuro } from "../../shared/format.js";

export const TEMPLATES = ["engraved", "classic", "minimal", "bold"] as const;
export type Template = (typeof TEMPLATES)[number];
export const LANGS = ["de", "en"] as const;
export type Lang = (typeof LANGS)[number];
export interface PdfOptions { template?: string; lang?: string }

export function pickTemplate(t?: string | null): Template {
  if (!t) return "engraved";
  if (!(TEMPLATES as readonly string[]).includes(t)) throw new Error(`unknown template "${t}", pick one of: ${TEMPLATES.join(", ")}`);
  return t as Template;
}
export function pickLang(l?: string | null): Lang {
  if (!l) return "de";
  if (!(LANGS as readonly string[]).includes(l)) throw new Error(`unknown language "${l}", pick one of: ${LANGS.join(", ")}`);
  return l as Lang;
}

export const LABELS = {
  de: {
    invoice: "Rechnung", issued: "Rechnungsdatum", delivered: "Leistungsdatum", due: "Fällig am",
    to: "Rechnung an", from: "Von", desc: "Beschreibung", qty: "Menge", unit: "Einzelpreis", vat: "USt.", sum: "Betrag",
    net: "Nettobetrag", total: "Gesamtbetrag", amountDue: "Zu zahlen", taxNumber: "Steuernummer", vatId: "USt-IdNr.",
    holder: "Kontoinhaber", bic: "BIC", reference: "Verwendungszweck", page: "Seite", continued: "Fortsetzung",
    kleinunternehmer: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).",
    payTo: (amount: string, due: string, nr: string) => `Bitte überweisen Sie ${amount}${due && ` bis zum ${due}`} auf das unten genannte Konto, mit der Rechnungsnummer ${nr} als Verwendungszweck.`,
    payBy: (due: string, nr: string) => `Zahlbar ${due ? `bis zum ${due}` : "sofort"} unter Angabe der Rechnungsnummer ${nr}.`,
    thanks: "Vielen Dank für die Zusammenarbeit.",
  },
  en: {
    invoice: "Invoice", issued: "Issued", delivered: "Delivery date", due: "Due date",
    to: "To", from: "From", desc: "Description", qty: "Quantity", unit: "Unit price", vat: "VAT", sum: "Total",
    net: "Net amount", total: "Total", amountDue: "Amount due", taxNumber: "Tax number", vatId: "VAT ID",
    holder: "Account holder", bic: "SWIFT", reference: "Bank reference", page: "Page", continued: "continued",
    kleinunternehmer: "VAT-exempt small business owner according to § 19 UStG.",
    payTo: (amount: string, due: string, nr: string) => `Please transfer ${amount}${due && ` by ${due}`} to the account below, quoting invoice number ${nr} as the reference.`,
    payBy: (due: string, nr: string) => `Payable ${due ? `by ${due}` : "immediately"}, quoting invoice number ${nr}.`,
    thanks: "Thank you for your business.",
  },
} satisfies Record<Lang, Record<string, unknown>>;
export type Labels = (typeof LABELS)["de"];

const EUR_EN = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const regions = { de: new Intl.DisplayNames(["de"], { type: "region" }), en: new Intl.DisplayNames(["en"], { type: "region" }) };

/** Number, date and country formatting for one invoice language. */
export function locale(lang: Lang) {
  const de = lang === "de";
  return {
    money: (cents: number) => (de ? formatEuro(cents) : EUR_EN.format(cents / 100).replace(/^-/, "−")),
    date: (iso?: string | null) => {
      if (!iso) return "";
      const d = new Date(iso + "T00:00:00");
      return de ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : `${d.getDate()} ${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
    },
    qty: (q: number) => (q / 1000).toLocaleString(de ? "de-DE" : "en-GB", { maximumFractionDigits: 3 }),
    pct: (bp: number) => `${(bp / 100).toLocaleString(de ? "de-DE" : "en-GB")}${de ? " %" : "%"}`,
    country: (c?: string | null) => (c && /^[A-Za-z]{2}$/.test(c) ? regions[lang].of(c.toUpperCase()) ?? c : c ?? undefined),
  };
}

export const lineNet = (i: InvoiceItemInput) => Math.round((i.quantity * i.unit_price_cents) / 1000);

/** VAT per rate, highest first, zero rates left out. */
export function vatByRate(items: InvoiceItemInput[]): [number, number][] {
  const byRate = new Map<number, number>();
  for (const it of items) byRate.set(it.vat_bp, (byRate.get(it.vat_bp) ?? 0) + vatCents(lineNet(it), it.vat_bp));
  return [...byRate.entries()].filter(([bp]) => bp > 0).sort((a, b) => b[0] - a[0]);
}

/** Bank lines for the payment box. Empty without an IBAN, so no half-filled box is printed. */
export function paymentDetails(business: Business, invoice: Pick<Invoice, "number">, lang: Lang = "de"): [string, string][] {
  if (!business.iban) return [];
  const L = LABELS[lang];
  const holder = business.account_holder || business.owner || business.name;
  return [
    ...(holder ? [[L.holder, holder] as [string, string]] : []),
    ["IBAN", business.iban],
    ...(business.bic ? [[L.bic, business.bic] as [string, string]] : []),
    [L.reference, invoice.number],
  ];
}

export const FONT_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const up of ["../..", "..", "../../.."]) {
    const d = join(here, up, "assets", "fonts");
    try { fontkit.openSync(join(d, "eb-garamond-latin-400-normal.woff")); return d; } catch { /* try next */ }
  }
  throw new Error("freebies: EB Garamond font files not found in assets/fonts");
})();

export type Face = "regular" | "italic" | "medium" | "semibold";
export interface Style { face?: Face; size?: number; opacity?: number; color?: string; caps?: boolean; tracking?: number }
type Align = "left" | "right" | "center";

/**
 * Text helpers over one PDFKit document. `fontFor` names the registered font for each character,
 * so a template can fall back to another font for glyphs its main face lacks.
 */
export function typesetter(doc: PDFKit.PDFDocument, fontFor: (face: Face, cp: number) => string, ink: string, features?: PDFKit.Mixins.OpenTypeFeatures[]) {
  const runs = (text: string, face: Face) => {
    const out: { font: string; text: string }[] = [];
    for (const ch of text) {
      const font = fontFor(face, ch.codePointAt(0)!);
      if (out.length && out.at(-1)!.font === font) out.at(-1)!.text += ch; else out.push({ font, text: ch });
    }
    return out;
  };
  const prep = (text: string, s: Style) => {
    const size = (s.size ?? 10) * (s.caps ? 0.8 : 1);
    return { text: s.caps ? text.toUpperCase() : text, size, tracking: s.tracking ?? (s.caps ? size * 0.12 : 0), face: s.face ?? "regular" };
  };
  const measure = (text: string, s: Style = {}) => {
    const p = prep(text, s);
    return runs(p.text, p.face).reduce((w, r) => w + doc.font(r.font).fontSize(p.size).widthOfString(r.text, { characterSpacing: p.tracking }), 0);
  };
  const put = (text: string, x: number, y: number, s: Style = {}, align: Align = "left", width = 0) => {
    const p = prep(text, s);
    const w = measure(text, s);
    let cx = align === "right" ? x + width - w : align === "center" ? x + (width - w) / 2 : x;
    doc.fillColor(s.color ?? ink).fillOpacity(s.opacity ?? 1);
    for (const r of runs(p.text, p.face)) {
      doc.font(r.font).fontSize(p.size).text(r.text, cx, y, { lineBreak: false, characterSpacing: p.tracking, ...(features && { features }) });
      cx += doc.widthOfString(r.text, { characterSpacing: p.tracking });
    }
    doc.fillOpacity(1);
  };
  const wrap = (text: string, width: number, s: Style = {}) => {
    const lines: string[] = [];
    for (const para of text.split(/\r?\n/)) {
      let line = "";
      for (const word of para.split(/[ \t]+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (!line || measure(next, s) <= width) line = next; else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  };
  const lh = (s: Style) => (s.size ?? 10) * 1.38;
  return { put, measure, wrap, lh };
}
