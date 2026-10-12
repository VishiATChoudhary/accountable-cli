// Invoice PDF in the freebies look: white page, cobalt ink, EB Garamond,
// small-caps labels, ruled tables, and an engraved landscape at the foot of each page.
import PDFDocument from "pdfkit";
import * as fontkit from "fontkit";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Invoice } from "../db/repositories/invoices.js";
import type { Client } from "../db/repositories/clients.js";
import type { Business } from "../db/repositories/business.js";
import { invoiceTotals, type InvoiceItemInput } from "../domain/invoice.js";
import { vatCents } from "../domain/money.js";
import { formatEuro } from "../../shared/format.js";
import { engraving } from "../../shared/engraving.js";

const INK = "#0B3986";
const PAPER = "#F4EBD8";      // cream, for text on cobalt bands
const PAGE = "#FFFFFF";       // white page: prints cleanly, no ink on the background
const W = 595.28, H = 841.89;
const M = 56;                  // side margin
const CW = W - 2 * M;          // content width
const BAND = 118;              // engraved band height
const LIMIT = H - BAND - 64;   // lowest y for content

const FONT_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const up of ["../..", "..", "../../.."]) {
    const d = join(here, up, "assets", "fonts");
    try { fontkit.openSync(join(d, "eb-garamond-latin-400-normal.woff")); return d; } catch { /* try next */ }
  }
  throw new Error("freebies: EB Garamond font files not found in assets/fonts");
})();

type Face = "regular" | "italic" | "medium" | "semibold";
const FILES: Record<Face, string> = { regular: "400-normal", italic: "400-italic", medium: "500-normal", semibold: "600-normal" };
const coverage = new Map<string, fontkit.Font>();
function hasGlyph(subset: "latin" | "latin-ext", face: Face, cp: number): boolean {
  const key = `${subset}-${FILES[face]}`;
  let f = coverage.get(key);
  if (!f) { f = fontkit.openSync(join(FONT_DIR, `eb-garamond-${key}.woff`)) as fontkit.Font; coverage.set(key, f); }
  return f.hasGlyphForCodePoint(cp);
}

const dateDe = (iso?: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const qtyDe = (q: number) => (q / 1000).toLocaleString("de-DE", { maximumFractionDigits: 3 });
const lineNet = (i: InvoiceItemInput) => Math.round((i.quantity * i.unit_price_cents) / 1000);

interface Style { face?: Face; size?: number; opacity?: number; color?: string; caps?: boolean; tracking?: number }

export function renderInvoicePdf(
  invoice: Invoice & { items: InvoiceItemInput[] }, client: Client, outPath: string, business: Business = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: { Title: `Rechnung ${invoice.number}`, Author: business.name ?? "", Creator: "freebies" } });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    const keys: string[] = [];
    for (const sub of ["latin", "latin-ext"] as const) for (const face of Object.keys(FILES) as Face[]) {
      keys.push(`${sub}-${face}`);
      doc.registerFont(`${sub}-${face}`, join(FONT_DIR, `eb-garamond-${sub}-${FILES[face]}.woff`));
    }
    // PDFKit reuses an already-loaded font when another file has the same PostScript
    // name, and both EB Garamond subsets share names. Load each subset under its own
    // key with the name index cleared, so the extended-Latin glyphs really get embedded.
    const families = (doc as unknown as { _fontFamilies: Record<string, unknown> })._fontFamilies;
    for (const k of keys) {
      for (const name of Object.keys(families)) if (!keys.includes(name)) delete families[name];
      doc.font(k);
    }

    // ---- text engine: per-glyph font runs (Western subset, else extended Latin) ----
    const runs = (text: string, face: Face) => {
      const out: { font: string; text: string }[] = [];
      for (const ch of text) {
        const cp = ch.codePointAt(0)!;
        const sub = hasGlyph("latin", face, cp) || !hasGlyph("latin-ext", face, cp) ? "latin" : "latin-ext";
        const font = `${sub}-${face}`;
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
    const put = (text: string, x: number, y: number, s: Style = {}, align: "left" | "right" | "center" = "left", width = 0) => {
      const p = prep(text, s);
      const w = measure(text, s);
      let cx = align === "right" ? x + width - w : align === "center" ? x + (width - w) / 2 : x;
      doc.fillColor(s.color ?? INK).fillOpacity(s.opacity ?? 1);
      for (const r of runs(p.text, p.face)) {
        doc.font(r.font).fontSize(p.size).text(r.text, cx, y, { lineBreak: false, characterSpacing: p.tracking, features: ["lnum", "tnum", "kern", "liga"] });
        cx += doc.widthOfString(r.text, { characterSpacing: p.tracking });
      }
      doc.fillOpacity(1);
    };
    const wrap = (text: string, width: number, s: Style = {}) => {
      const lines: string[] = [];
      for (const para of text.split(/\r?\n/)) {
        let line = "";
        // Break only on ordinary spaces; non-breaking spaces keep "1.234,00 €" and IBANs whole.
        for (const word of para.split(/[ \t]+/).filter(Boolean)) {
          const next = line ? `${line} ${word}` : word;
          if (!line || measure(next, s) <= width) line = next; else { lines.push(line); line = word; }
        }
        lines.push(line);
      }
      return lines;
    };
    const lh = (s: Style) => (s.size ?? 10) * 1.38;
    const rule = (x1: number, y: number, x2: number, opacity = 0.22, width = 0.6) =>
      doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor(INK).strokeOpacity(opacity).stroke().restore();

    // ---- page furniture ----
    const art = engraving({ width: W, height: BAND, seed: 4, tufts: 70, layers: 4, peak: 1.1 });
    const background = () => doc.save().rect(0, 0, W, H).fill(PAGE).restore();
    const band = () => {
      doc.save().translate(0, H - BAND);
      for (const l of art.layers) {
        doc.path(l.fill).fill(PAGE);
        doc.save().path(l.fill).clip();
        doc.lineWidth(l.w).strokeColor(INK).strokeOpacity(l.o).lineCap("round");
        for (const d of l.hatch) doc.path(d).stroke();
        doc.strokeOpacity(l.o * 0.7);
        for (const d of l.shade) doc.path(d).stroke();
        doc.restore();
        doc.path(l.ridge).lineWidth(l.w + 0.5).strokeColor(INK).strokeOpacity(1).lineJoin("round").stroke();
      }
      doc.lineWidth(0.75).strokeOpacity(1);
      for (const d of art.grass) doc.path(d).stroke();
      doc.restore();
    };
    const footer = (page: number, total: number) => {
      const bits = [business.name, business.tax_number && `St.-Nr. ${business.tax_number}`, business.vat_id && `USt-IdNr. ${business.vat_id}`, business.email, business.iban && `IBAN ${business.iban}`].filter(Boolean) as string[];
      const y = H - BAND - 30;
      rule(M, y - 10, W - M, 0.18);
      if (bits.length) put(bits.join("    /    "), M, y, { size: 8, opacity: 0.7 }, "center", CW);
      if (total > 1) put(`${page} / ${total}`, M, y + 13, { size: 7.5, opacity: 0.5 }, "center", CW);
    };

    let y = M;
    const newPage = () => {
      doc.addPage(); background(); y = M;
      put(`Rechnung ${invoice.number}, Fortsetzung`, M, y, { face: "italic", size: 11, opacity: 0.7 });
      y += 30;
    };
    background();

    // ---- header: seller (left), document title (right) ----
    const sellerName = business.name || "Rechnung";
    put(sellerName, M, y - 4, { face: "italic", size: 25 });
    put("Rechnung", M, y + 2, { caps: true, size: 11, face: "medium" }, "right", CW);
    rule(W - M - 22, y + 18, W - M, 1, 0.8);
    y += 34;
    if (business.address) { put(business.address.split(/\r?\n/).join(", "), M, y, { size: 9.5, opacity: 0.68 }); y += 13; }
    y += 18;

    // ---- parties (left) + details table (right) ----
    const colR = M + CW * 0.56, colRW = W - M - colR;
    let yl = y;
    put("Rechnung an", M, yl, { caps: true, size: 9.5, opacity: 0.6 }); yl += 16;
    put(client.name, M, yl, { size: 13, face: "medium" }); yl += 18;
    for (const line of (client.address ?? "").split(/\r?\n/).filter(Boolean)) for (const l of wrap(line, colR - M - 24, { size: 10 })) { put(l, M, yl, { size: 10 }); yl += 14; }
    if (client.country) { put(client.country, M, yl, { size: 10 }); yl += 14; }
    if (client.vat_id) { put(`USt-IdNr. ${client.vat_id}`, M, yl, { size: 9.5, opacity: 0.68 }); yl += 14; }

    let yr = y;
    const details: [string, string][] = [
      ["Rechnungsnummer", invoice.number],
      ["Rechnungsdatum", dateDe(invoice.issue_date)],
      ["Leistungsdatum", dateDe(invoice.issue_date)],
      ...(invoice.due_date ? [["Fällig am", dateDe(invoice.due_date)] as [string, string]] : []),
    ];
    rule(colR, yr - 5, W - M, 0.5, 0.7);
    for (const [k, v] of details) {
      put(k, colR, yr + 3, { caps: true, size: 9, opacity: 0.62 });
      put(v, colR, yr + 2, { size: 10.5 }, "right", colRW);
      yr += 20;
      rule(colR, yr - 5, W - M, 0.18);
    }
    y = Math.max(yl, yr) + 26;

    // ---- line items table ----
    const cols = [
      { key: "desc", label: "Beschreibung", x: M + 10, w: 220, align: "left" as const },
      { key: "qty", label: "Menge", x: M + 236, w: 46, align: "right" as const },
      { key: "unit", label: "Einzelpreis", x: M + 286, w: 70, align: "right" as const },
      { key: "vat", label: "USt.", x: M + 360, w: 36, align: "right" as const },
      { key: "sum", label: "Betrag", x: M + 400, w: CW - 410, align: "right" as const },
    ];
    const tableHead = () => {
      doc.save().roundedRect(M, y, CW, 22, 2).fill(INK).restore();
      for (const c of cols) put(c.label, c.x, y + 7, { caps: true, size: 9, color: PAPER, face: "medium" }, c.align, c.w);
      y += 22;
    };
    tableHead();
    invoice.items.forEach((it, i) => {
      const descLines = wrap(it.description, cols[0].w, { size: 10.5 });
      const rowH = Math.max(26, descLines.length * lh({ size: 10.5 }) + 12);
      if (y + rowH > LIMIT) { newPage(); tableHead(); }
      if (i % 2 === 1) doc.save().rect(M, y, CW, rowH).fillColor(INK).fillOpacity(0.035).fill().restore();
      descLines.forEach((l, k) => put(l, cols[0].x, y + 7 + k * lh({ size: 10.5 }), { size: 10.5 }));
      put(qtyDe(it.quantity), cols[1].x, y + 7, { size: 10.5 }, "right", cols[1].w);
      put(formatEuro(it.unit_price_cents), cols[2].x, y + 7, { size: 10.5 }, "right", cols[2].w);
      put(`${(it.vat_bp / 100).toLocaleString("de-DE")} %`, cols[3].x, y + 7, { size: 10.5, opacity: 0.7 }, "right", cols[3].w);
      put(formatEuro(lineNet(it)), cols[4].x, y + 7, { size: 10.5 }, "right", cols[4].w);
      y += rowH;
      rule(M, y, W - M, 0.18);
    });

    // ---- totals table (right) ----
    const t = invoiceTotals(invoice.items);
    const byRate = new Map<number, number>();
    for (const it of invoice.items) byRate.set(it.vat_bp, (byRate.get(it.vat_bp) ?? 0) + vatCents(lineNet(it), it.vat_bp));
    const vatRows = [...byRate.entries()].filter(([bp]) => bp > 0).sort((a, b) => b[0] - a[0]);
    const totalsH = 24 + 20 * (1 + vatRows.length) + 40;
    if (y + 18 + totalsH > LIMIT) newPage(); else y += 18;
    const tx = M + CW * 0.52, tw = W - M - tx;
    const trow = (label: string, value: string, s: Style = {}) => {
      put(label, tx + 10, y + 4, { caps: true, size: 9, opacity: 0.62 });
      put(value, tx, y + 3, { size: 10.5, ...s }, "right", tw - 10);
      y += 20;
    };
    trow("Nettobetrag", formatEuro(t.netCents));
    for (const [bp, cents] of vatRows) trow(`USt. ${(bp / 100).toLocaleString("de-DE")} %`, formatEuro(cents));
    if (!vatRows.length) trow("USt.", formatEuro(0), { opacity: 0.7 });
    y += 4;
    doc.save().roundedRect(tx, y, tw, 34, 2).fill(INK).restore();
    put("Gesamtbetrag", tx + 10, y + 13, { caps: true, size: 10, color: PAPER, face: "medium" });
    put(formatEuro(t.grossCents), tx, y + 8, { size: 16, color: PAPER, face: "medium" }, "right", tw - 10);
    y += 34 + 30;

    // ---- notes, legal lines, payment ----
    const paras: { text: string; s: Style }[] = [];
    if (invoice.notes) paras.push({ text: invoice.notes, s: { size: 10.5 } });
    if (business.kleinunternehmer) paras.push({ text: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).", s: { size: 10, face: "italic", opacity: 0.8 } });
    const due = invoice.due_date ? ` bis zum ${dateDe(invoice.due_date)}` : "";
    paras.push({
      text: business.iban
        ? `Bitte überweisen Sie ${formatEuro(t.grossCents)}${due} auf das Konto ${business.iban.replace(/ /g, "\u00a0")}${business.name ? ` (${business.name})` : ""} unter Angabe der Rechnungsnummer ${invoice.number}.`
        : `Zahlbar${due || " sofort"} unter Angabe der Rechnungsnummer ${invoice.number}.`,
      s: { size: 10.5 },
    });
    paras.push({ text: "Vielen Dank für die Zusammenarbeit.", s: { size: 11, face: "italic" } });
    for (const p of paras) {
      const lines = wrap(p.text, CW * 0.8, p.s);
      if (y + lines.length * lh(p.s) > LIMIT) newPage();
      for (const l of lines) { put(l, M, y, p.s); y += lh(p.s); }
      y += 8;
    }

    // ---- stamp band + footer on every page ----
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) { doc.switchToPage(range.start + i); band(); footer(i + 1, range.count); }

    doc.end();
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
  });
}
