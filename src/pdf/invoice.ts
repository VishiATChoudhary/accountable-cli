// Invoice PDF in the freebies look: white page, cobalt ink, EB Garamond,
// small-caps labels, ruled tables, and an engraved landscape at the foot of each page.
import PDFDocument from "pdfkit";
import * as fontkit from "fontkit";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import type { Invoice } from "../db/repositories/invoices.js";
import type { Client } from "../db/repositories/clients.js";
import type { Business } from "../db/repositories/business.js";
import { invoiceTotals, type InvoiceItemInput } from "../domain/invoice.js";
import { engraving } from "../../shared/engraving.js";
import { FONT_DIR, LABELS, lineNet, locale, paymentDetails, pickLang, pickTemplate, typesetter, vatByRate, type Face, type Lang, type PdfOptions, type Style } from "./common.js";
import { renderSans } from "./sans.js";

const INK = "#0B3986";
const PAPER = "#F4EBD8";      // cream, for text on cobalt bands
const PAGE = "#FFFFFF";       // white page: prints cleanly, no ink on the background
const W = 595.28, H = 841.89;
const M = 56;                  // side margin
const CW = W - 2 * M;          // content width
const BAND = 96;               // engraved band height
const BOX = 72;                // payment box above the band
const LIMIT = H - BAND - BOX - 34; // lowest y for content

const FILES: Record<Face, string> = { regular: "400-normal", italic: "400-italic", medium: "500-normal", semibold: "600-normal" };
const coverage = new Map<string, fontkit.Font>();
function hasGlyph(subset: "latin" | "latin-ext", face: Face, cp: number): boolean {
  const key = `${subset}-${FILES[face]}`;
  let f = coverage.get(key);
  if (!f) { f = fontkit.openSync(join(FONT_DIR, `eb-garamond-${key}.woff`)) as fontkit.Font; coverage.set(key, f); }
  return f.hasGlyphForCodePoint(cp);
}

export { paymentDetails, TEMPLATES, LANGS } from "./common.js";

/** Render an invoice PDF in the chosen template and language (defaults: engraved, German). */
export function renderInvoicePdf(
  invoice: Invoice & { items: InvoiceItemInput[] }, client: Client, outPath: string, business: Business = {}, opts: PdfOptions = {},
): Promise<string> {
  const template = pickTemplate(opts.template ?? business.invoice_template);
  const lang = pickLang(opts.lang ?? business.invoice_lang);
  return template === "engraved" ? renderEngraved(invoice, client, outPath, business, lang) : renderSans(template, invoice, client, outPath, business, lang);
}

function renderEngraved(
  invoice: Invoice & { items: InvoiceItemInput[] }, client: Client, outPath: string, business: Business, lang: Lang,
): Promise<string> {
  const L = LABELS[lang], f = locale(lang);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: { Title: `${L.invoice} ${invoice.number}`, Author: business.name ?? "", Creator: "freebies" } });
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
    const { put, wrap, lh } = typesetter(doc, (face, cp) => `${hasGlyph("latin", face, cp) || !hasGlyph("latin-ext", face, cp) ? "latin" : "latin-ext"}-${face}`, INK, ["lnum", "tnum", "kern", "liga"]);
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
      const y0 = H - BAND - BOX - 12;
      doc.save().roundedRect(M, y0, CW, BOX, 6).fillColor(INK).fillOpacity(0.045).fill().restore();
      const pay = paymentDetails(business, invoice, lang);
      const left = pay.length
        ? pay.map(([k, v]) => `${k}: ${k === "IBAN" ? v.replace(/ /g, " ") : v}`)
        : [business.name, business.tax_number && `${L.taxNumber} ${business.tax_number}`].filter(Boolean) as string[];
      const ly = y0 + (BOX - left.length * 13.5) / 2 + 1;
      left.forEach((l, i) => put(l, M + 16, ly + i * 13.5, { size: 9.5, face: "medium" }));
      if (business.email) put(business.email, M, y0 + BOX / 2 - 12, { size: 9.5, face: "medium" }, "right", CW - 16);
      put(`${L.page} ${page}/${total}`, M, y0 + BOX / 2 + 4, { size: 9, opacity: 0.6 }, "right", CW - 16);
    };

    let y = M;
    const newPage = () => {
      doc.addPage(); background(); y = M;
      put(`${L.invoice} ${invoice.number}, ${L.continued}`, M, y, { face: "italic", size: 11, opacity: 0.7 });
      y += 30;
    };
    background();

    // ---- header: seller and invoice number (left), dates table (right) ----
    put(business.name || L.invoice, M, y - 4, { face: "italic", size: 25 });
    put(`${L.invoice} ${invoice.number}`, M, y + 30, { caps: true, size: 11, face: "medium" });
    const colRW = 190, colR = W - M - colRW;
    let yr = y;
    const details: [string, string][] = [
      [L.issued, f.date(invoice.issue_date)],
      [L.delivered, f.date(invoice.delivery_date || invoice.issue_date)],
      ...(invoice.due_date ? [[L.due, f.date(invoice.due_date)] as [string, string]] : []),
    ];
    rule(colR, yr - 5, W - M, 0.5, 0.7);
    for (const [k, v] of details) {
      put(k, colR, yr + 3, { caps: true, size: 9, opacity: 0.62 });
      put(v, colR, yr + 2, { size: 10.5 }, "right", colRW);
      yr += 20;
      rule(colR, yr - 5, W - M, 0.18);
    }
    y = Math.max(y + 48, yr) + 22;

    // ---- parties: tinted box, recipient (left) and sender (right) ----
    type Line = { text: string; s: Style; gap?: number };
    const colW = CW / 2 - 28;
    const block = (head: string, name: string, rest: (string | false | undefined)[], extra: (string | false | undefined)[]): Line[] => {
      const out: Line[] = [{ text: head, s: { caps: true, size: 9.5, opacity: 0.6 } }, { text: name, s: { size: 14, face: "medium" }, gap: 4 }];
      for (const r of rest.filter(Boolean) as string[]) for (const l of r.split(/\r?\n/).filter(Boolean)) for (const w of wrap(l, colW, { size: 10 })) out.push({ text: w, s: { size: 10 } });
      extra.filter(Boolean).forEach((e, i) => out.push({ text: e as string, s: { size: 9.5, opacity: 0.72 }, gap: i ? 0 : 6 }));
      return out;
    };
    const to = block(L.to, client.name, [client.address, f.country(client.country)], [client.vat_id && `${L.vatId} ${client.vat_id}`]);
    const from = block(L.from, business.name || "", [business.owner, business.address],
      [business.tax_number && `${L.taxNumber} ${business.tax_number}`, business.vat_id && `${L.vatId} ${business.vat_id}`]);
    const height = (ls: Line[]) => ls.reduce((h, l) => h + lh(l.s) + (l.gap ?? 0), 0);
    const boxH = Math.max(height(to), business.name ? height(from) : 0) + 30;
    doc.save().roundedRect(M, y, CW, boxH, 6).fillColor(INK).fillOpacity(0.045).fill().restore();
    const draw = (ls: Line[], x: number) => { let yy = y + 16; for (const l of ls) { yy += l.gap ?? 0; put(l.text, x, yy, l.s); yy += lh(l.s); } };
    draw(to, M + 16);
    if (business.name) draw(from, M + CW / 2 + 12);
    y += boxH + 26;

    // ---- line items table ----
    const cols = [
      { key: "desc", label: L.desc, x: M + 10, w: 220, align: "left" as const },
      { key: "qty", label: L.qty, x: M + 236, w: 46, align: "right" as const },
      { key: "unit", label: L.unit, x: M + 286, w: 70, align: "right" as const },
      { key: "vat", label: L.vat, x: M + 360, w: 36, align: "right" as const },
      { key: "sum", label: L.sum, x: M + 400, w: CW - 410, align: "right" as const },
    ];
    const tableHead = () => {
      doc.save().roundedRect(M, y, CW, 22, 2).fill(INK).restore();
      for (const c of cols) put(c.label, c.x, y + 7, { caps: true, size: 9, color: PAPER, face: "medium" }, c.align, c.w);
      y += 22;
    };
    tableHead();
    invoice.items.forEach((it, i) => {
      const [title, ...more] = it.description.split(/\r?\n/);
      const T: Style = { size: 10.5, face: "medium" }, D: Style = { size: 9.5, opacity: 0.78 };
      const descLines = [...wrap(title, cols[0].w, T).map((text) => ({ text, s: T })), ...more.flatMap((m) => wrap(m, cols[0].w, D).map((text) => ({ text, s: D })))];
      const rowH = Math.max(26, descLines.reduce((h, l) => h + lh(l.s), 0) + 12);
      if (y + rowH > LIMIT) { newPage(); tableHead(); }
      if (i % 2 === 1) doc.save().rect(M, y, CW, rowH).fillColor(INK).fillOpacity(0.035).fill().restore();
      let dy = y + 7;
      for (const l of descLines) { put(l.text, cols[0].x, dy, l.s); dy += lh(l.s); }
      put(f.qty(it.quantity), cols[1].x, y + 7, { size: 10.5 }, "right", cols[1].w);
      put(f.money(it.unit_price_cents), cols[2].x, y + 7, { size: 10.5 }, "right", cols[2].w);
      put(f.pct(it.vat_bp), cols[3].x, y + 7, { size: 10.5, opacity: 0.7 }, "right", cols[3].w);
      put(f.money(lineNet(it)), cols[4].x, y + 7, { size: 10.5 }, "right", cols[4].w);
      y += rowH;
      rule(M, y, W - M, 0.18);
    });

    // ---- totals table (right) ----
    const t = invoiceTotals(invoice.items);
    const vatRows = vatByRate(invoice.items);
    const totalsH = 24 + 20 * (1 + vatRows.length) + 40;
    if (y + 18 + totalsH > LIMIT) newPage(); else y += 18;
    const tx = M + CW * 0.52, tw = W - M - tx;
    const trow = (label: string, value: string, s: Style = {}) => {
      put(label, tx + 10, y + 4, { caps: true, size: 9, opacity: 0.62 });
      put(value, tx, y + 3, { size: 10.5, ...s }, "right", tw - 10);
      y += 20;
    };
    trow(L.net, f.money(t.netCents));
    for (const [bp, cents] of vatRows) trow(`${L.vat} ${f.pct(bp)}`, f.money(cents));
    if (!vatRows.length) trow(L.vat, f.money(0), { opacity: 0.7 });
    y += 4;
    doc.save().roundedRect(tx, y, tw, 34, 2).fill(INK).restore();
    put(L.total, tx + 10, y + 13, { caps: true, size: 10, color: PAPER, face: "medium" });
    put(f.money(t.grossCents), tx, y + 8, { size: 16, color: PAPER, face: "medium" }, "right", tw - 10);
    y += 34 + 30;

    // ---- notes, legal lines, payment ----
    const paras: { text: string; s: Style }[] = [];
    if (invoice.notes) paras.push({ text: invoice.notes, s: { size: 10.5 } });
    if (business.kleinunternehmer) paras.push({ text: L.kleinunternehmer, s: { size: 10, face: "italic", opacity: 0.8 } });
    const due = f.date(invoice.due_date);
    paras.push({
      text: business.iban ? L.payTo(f.money(t.grossCents), due, invoice.number) : L.payBy(due, invoice.number),
      s: { size: 10.5 },
    });
    paras.push({ text: L.thanks, s: { size: 11, face: "italic" } });
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
