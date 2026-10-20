// Sans-serif invoice templates: classic (blue panels), minimal (hairlines only) and bold
// (dark bands with an orange total). Helvetica for Western text, EB Garamond extended
// Latin for any glyph Helvetica's WinAnsi set lacks (Ł, ő, č, ...).
import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import type { Invoice } from "../db/repositories/invoices.js";
import type { Client } from "../db/repositories/clients.js";
import type { Business } from "../db/repositories/business.js";
import { invoiceTotals, type InvoiceItemInput } from "../domain/invoice.js";
import { FONT_DIR, LABELS, lineNet, locale, paymentDetails, typesetter, vatByRate, type Face, type Lang, type Style, type Template } from "./common.js";

const W = 595.28, H = 841.89;
const M = 42;
const CW = W - 2 * M;

const THEMES = {
  classic: { accent: "#1F6FC5", ink: "#222222", muted: "#222222", tint: "#F0F0F0", dark: "#1F6FC5", foot: 84 },
  minimal: { accent: "#111111", ink: "#111111", muted: "#7A7A7A", tint: "#F5F5F5", dark: "#111111", foot: 70 },
  bold: { accent: "#E4572E", ink: "#1B1F2A", muted: "#6B7080", tint: "#F4F1EC", dark: "#1B1F2A", foot: 96 },
};

const EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"].map((c) => c.codePointAt(0)!));
const winAnsi = (cp: number) => (cp >= 0x20 && cp < 0x7f) || (cp >= 0xa0 && cp <= 0xff) || EXTRA.has(cp);
const HELV: Record<Face, string> = { regular: "Helvetica", italic: "Helvetica-Oblique", medium: "Helvetica-Bold", semibold: "Helvetica-Bold" };

export function renderSans(
  template: Exclude<Template, "engraved">, invoice: Invoice & { items: InvoiceItemInput[] }, client: Client, outPath: string, business: Business, lang: Lang,
): Promise<string> {
  const T = THEMES[template], L = LABELS[lang], f = locale(lang);
  const LIMIT = H - (template === "bold" ? 0 : M) - T.foot - 24; // lowest y for content
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, info: { Title: `${L.invoice} ${invoice.number}`, Author: business.name ?? "", Creator: "freebies" } });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    doc.registerFont("ext", join(FONT_DIR, "eb-garamond-latin-ext-400-normal.woff"));
    doc.registerFont("ext-bold", join(FONT_DIR, "eb-garamond-latin-ext-600-normal.woff"));
    const { put, wrap, lh } = typesetter(doc, (face, cp) => (winAnsi(cp) ? HELV[face] : face === "regular" || face === "italic" ? "ext" : "ext-bold"), T.ink);
    const rule = (x1: number, y: number, x2: number, color = T.ink, width = 0.5, opacity = 0.25) =>
      doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(width).strokeColor(color).strokeOpacity(opacity).stroke().restore();
    const fill = (x: number, y: number, w: number, h: number, color: string, r = 0) =>
      doc.save().roundedRect(x, y, w, h, r).fill(color).restore();
    const lines = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).flatMap((x) => (x as string).split(/\r?\n/)).filter(Boolean);

    let y = M;
    const dates: [string, string][] = [
      [L.issued, f.date(invoice.issue_date)],
      [L.delivered, f.date(invoice.delivery_date || invoice.issue_date)],
      ...(invoice.due_date ? [[L.due, f.date(invoice.due_date)] as [string, string]] : []),
    ];
    const title = `${L.invoice} ${invoice.number}`;

    // ---- header ----
    if (template === "classic") {
      put(title.toUpperCase(), M, y, { size: 10.5, color: T.accent });
      if (business.name) put(business.name, M, y - 2, { size: 15, face: "medium", color: T.accent }, "center", CW);
      let yr = y;
      for (const [k, v] of dates) { put(k, M, yr, { size: 10.5 }, "right", CW); put(v, M, yr + 16, { size: 10.5, color: T.accent }, "right", CW); yr += 36; }
      y = yr + 4;
    } else if (template === "minimal") {
      put(business.name || L.invoice, M, y, { size: 18, face: "medium" });
      put(L.invoice, M, y - 4, { size: 26 }, "right", CW);
      put(invoice.number, M, y + 26, { size: 10.5, color: T.muted }, "right", CW);
      y += 58;
      rule(M, y, W - M, T.ink, 0.8, 1);
      y += 14;
      const cw = CW / 4;
      dates.forEach(([k, v], i) => { put(k, M + i * cw, y, { size: 8, caps: true, color: T.muted }); put(v, M + i * cw, y + 14, { size: 10.5 }); });
      y += 48;
    } else {
      fill(0, 0, W, 128, T.dark);
      put(business.name || L.invoice, M, 40, { size: 20, face: "medium", color: "#FFFFFF" });
      const sub = lines(business.owner !== business.name && business.owner, business.email);
      sub.forEach((s, i) => put(s, M, 68 + i * 14, { size: 9.5, color: "#FFFFFF", opacity: 0.7 }));
      put(L.invoice, M, 38, { size: 28, face: "medium", caps: true, tracking: 3, color: T.accent }, "right", CW);
      put(invoice.number, M, 72, { size: 12, color: "#FFFFFF" }, "right", CW);
      y = 128 + 26;
      const cw = CW / 4;
      dates.forEach(([k, v], i) => { put(k, M + i * cw, y, { size: 8, caps: true, face: "medium", color: T.accent }); put(v, M + i * cw, y + 14, { size: 11 }); });
      y += 50;
    }

    // ---- parties ----
    type Line = { text: string; s: Style; gap?: number };
    const colW = CW / 2 - 32;
    const nameStyle: Style = template === "classic" ? { size: 11, face: "medium", color: T.accent } : { size: 12, face: "medium" };
    const headStyle: Style = template === "classic" ? { size: 10.5 } : { size: 8, caps: true, face: template === "bold" ? "medium" : "regular", color: template === "bold" ? T.accent : T.muted };
    const party = (head: string, name: string, rest: (string | false | null | undefined)[], extra: (string | false | null | undefined)[]): Line[] => [
      { text: head, s: headStyle },
      { text: name, s: nameStyle, gap: 5 },
      ...lines(...rest).flatMap((l, i) => wrap(l, colW, { size: 10.5 }).map((w, j) => ({ text: w, s: { size: 10.5 }, gap: i === 0 && j === 0 ? 4 : 0 }))),
      ...lines(...extra).map((e, i) => ({ text: e, s: { size: 10 }, gap: i ? 0 : 6 })),
    ];
    const to = party(L.to, client.name, [client.address, f.country(client.country)], [client.vat_id && `${L.vatId}: ${client.vat_id}`]);
    const from = party(L.from, business.name || "", [business.owner !== business.name && business.owner, business.address],
      [business.tax_number && `${L.taxNumber}: ${business.tax_number}`, business.vat_id && `${L.vatId}: ${business.vat_id}`]);
    const height = (ls: Line[]) => ls.reduce((h, l) => h + lh(l.s) + (l.gap ?? 0), 0);
    const pad = template === "classic" ? 18 : 0;
    const boxH = Math.max(height(to), business.name ? height(from) : 0) + 2 * pad;
    if (template === "classic") fill(M, y, CW, boxH, T.tint, 10);
    const draw = (ls: Line[], x: number) => {
      if (template === "bold") doc.save().rect(x - 12, y + pad, 2, boxH - 2 * pad).fill(T.accent).restore();
      let yy = y + pad; for (const l of ls) { yy += l.gap ?? 0; put(l.text, x, yy, l.s); yy += lh(l.s); }
    };
    draw(to, M + (template === "bold" ? 12 : pad));
    if (business.name) draw(from, M + CW / 2 + (template === "bold" ? 12 : pad));
    y += boxH + 28;

    // ---- items table ----
    const right = template !== "classic";
    const cols = template === "classic"
      ? [
        { label: L.desc, x: M + 8, w: 190, align: "left" as const },
        { label: lang === "en" ? "Price (excl. VAT)" : "Preis (netto)", x: M + 210, w: 100, align: "left" as const },
        { label: lang === "en" ? "VAT rate" : "USt.-Satz", x: M + 318, w: 60, align: "left" as const },
        { label: L.qty, x: M + 384, w: 50, align: "left" as const },
        { label: L.sum, x: M + 434, w: CW - 442, align: "right" as const },
      ]
      : [
        { label: L.desc, x: M + (template === "bold" ? 10 : 0), w: 220, align: "left" as const },
        { label: L.qty, x: M + 236, w: 50, align: "right" as const },
        { label: L.unit, x: M + 292, w: 80, align: "right" as const },
        { label: L.vat, x: M + 378, w: 44, align: "right" as const },
        { label: L.sum, x: M + 428, w: CW - (template === "bold" ? 438 : 428), align: "right" as const },
      ];
    const [cDesc, cA, cB, cC, cSum] = cols;
    const tableHead = () => {
      if (template === "minimal") {
        for (const c of cols) put(c.label, c.x, y, { size: 8, caps: true, color: T.muted }, c.align, c.w);
        y += 16; rule(M, y, W - M, T.ink, 0.8, 1);
      } else {
        fill(M, y, CW, 24, template === "classic" ? T.accent : T.dark, template === "classic" ? 6 : 0);
        for (const c of cols) put(c.label, c.x, y + 7.5, { size: 9.5, face: "medium", color: "#FFFFFF" }, c.align, c.w);
        y += 24;
      }
    };
    const newPage = () => {
      doc.addPage(); y = M;
      put(`${title}, ${L.continued}`, M, y, { size: 10.5, color: T.muted });
      y += 28;
    };
    tableHead();
    invoice.items.forEach((it, i) => {
      const [head, ...more] = it.description.split(/\r?\n/);
      const HS: Style = template === "classic" ? { size: 10.5, color: T.accent } : { size: 10.5, face: "medium" };
      const DS: Style = { size: 10, color: template === "classic" ? T.ink : T.muted };
      const desc = [...wrap(head, cDesc.w, HS).map((text) => ({ text, s: HS })), ...more.flatMap((m) => wrap(m, cDesc.w, DS).map((text) => ({ text, s: DS })))];
      const rowH = Math.max(28, desc.reduce((h, l) => h + lh(l.s), 0) + 16);
      if (y + rowH > LIMIT) { newPage(); tableHead(); }
      if (template === "bold" && i % 2 === 1) fill(M, y, CW, rowH, T.tint);
      let dy = y + 9;
      for (const l of desc) { put(l.text, cDesc.x, dy, l.s); dy += lh(l.s); }
      const cells = template === "classic"
        ? [f.money(it.unit_price_cents), f.pct(it.vat_bp), f.qty(it.quantity)]
        : [f.qty(it.quantity), f.money(it.unit_price_cents), f.pct(it.vat_bp)];
      [cA, cB, cC].forEach((c, k) => put(cells[k], c.x, y + 9, { size: 10.5, ...(right && k === 2 && { color: T.muted }) }, c.align, c.w));
      put(f.money(lineNet(it)), cSum.x, y + 9, { size: 10.5 }, "right", cSum.w);
      y += rowH;
      if (template === "minimal") rule(M, y, W - M);
    });

    // ---- totals ----
    const t = invoiceTotals(invoice.items);
    const vatRows = vatByRate(invoice.items);
    const sub: [string, string][] = vatRows.length
      ? [[L.net, f.money(t.netCents)], ...vatRows.map(([bp, c]) => [`${L.vat} ${f.pct(bp)}`, f.money(c)] as [string, string])]
      : template === "classic" ? [] : [[L.net, f.money(t.netCents)], [L.vat, f.money(0)]];
    if (y + 24 + 22 * sub.length + 50 > LIMIT) newPage(); else y += 20;
    const tx = M + CW * 0.55, tw = W - M - tx;
    for (const [k, v] of sub) {
      put(k, tx, y, { size: 10, color: T.muted });
      put(v, tx, y, { size: 10.5 }, "right", tw - (template === "bold" ? 10 : 0));
      y += 20;
    }
    if (template === "classic") {
      put(L.amountDue, tx, y + 4, { size: 11, face: "medium", color: T.accent }, "right", tw - 120);
      put(f.money(t.grossCents), tx, y + 4, { size: 11, face: "medium" }, "right", tw);
      y += 40;
    } else if (template === "minimal") {
      y += 2; rule(tx, y, W - M, T.ink, 1.2, 1); y += 10;
      put(L.total, tx, y + 3, { size: 11, face: "medium" });
      put(f.money(t.grossCents), tx, y, { size: 15, face: "medium" }, "right", tw);
      y += 46;
    } else {
      y += 4;
      fill(tx, y, tw, 38, T.accent);
      put(L.amountDue, tx + 10, y + 14, { size: 10, caps: true, face: "medium", color: "#FFFFFF" });
      put(f.money(t.grossCents), tx, y + 11, { size: 16, face: "medium", color: "#FFFFFF" }, "right", tw - 10);
      y += 38 + 30;
    }

    // ---- notes, legal line, payment ----
    const paras: { text: string; s: Style }[] = [];
    if (invoice.notes) paras.push({ text: invoice.notes, s: { size: 10.5 } });
    if (business.kleinunternehmer) paras.push({ text: L.kleinunternehmer, s: { size: 10.5, color: template === "classic" ? T.ink : T.muted } });
    if (template !== "classic") {
      const due = f.date(invoice.due_date);
      paras.push({ text: business.iban ? L.payTo(f.money(t.grossCents), due, invoice.number) : L.payBy(due, invoice.number), s: { size: 10.5 } });
      paras.push({ text: L.thanks, s: { size: 10.5, face: template === "bold" ? "medium" : "regular" } });
    }
    for (const p of paras) {
      const ls = wrap(p.text, CW * 0.8, p.s);
      if (y + ls.length * lh(p.s) > LIMIT) newPage();
      for (const l of ls) { put(l, M, y, p.s); y += lh(p.s); }
      y += 8;
    }

    // ---- footer: bank details, email, page count ----
    const pay = paymentDetails(business, invoice, lang);
    const left = pay.length
      ? pay.map(([k, v]) => `${k}: ${v}`)
      : lines(business.name, business.tax_number && `${L.taxNumber}: ${business.tax_number}`);
    const footer = (page: number, total: number) => {
      const light = template === "bold";
      const y0 = light ? H - T.foot : H - M - T.foot;
      const inset = template === "classic" ? 22 : 0;
      if (template === "classic") fill(M, y0, CW, T.foot, "#F7F7F7", 10);
      else if (template === "minimal") rule(M, y0, W - M, T.ink, 0.5, 0.4);
      else fill(0, y0, W, T.foot, T.dark);
      const s: Style = { size: 9.5, color: light ? "#FFFFFF" : T.ink, opacity: light ? 0.85 : 1 };
      const ly = template === "minimal" ? y0 + 12 : y0 + (T.foot - left.length * 13.5) / 2 + 1;
      left.forEach((l, i) => put(l, M + inset, ly + i * 13.5, s));
      const ry = template === "minimal" ? y0 + 12 : y0 + T.foot / 2 - 13;
      if (business.email) put(business.email, M, ry, { ...s, color: light ? T.accent : T.ink, opacity: 1 }, "right", CW - inset);
      put(`${L.page} ${page}/${total}`, M, ry + 18, { ...s, size: 9, opacity: 0.7 }, "right", CW - inset);
    };
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) { doc.switchToPage(range.start + i); footer(i + 1, range.count); }

    doc.end();
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
  });
}
