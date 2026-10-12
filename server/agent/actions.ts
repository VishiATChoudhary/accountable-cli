// Validation, summaries, and execution for agent write proposals.
// Claude proposes; nothing here runs until the user confirms in the UI.
import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { ClientsRepo } from "../../src/db/repositories/clients.js";
import { InvoicesRepo } from "../../src/db/repositories/invoices.js";
import { ExpensesRepo } from "../../src/db/repositories/expenses.js";
import { TransactionsRepo } from "../../src/db/repositories/transactions.js";
import { UploadsRepo } from "../../src/db/repositories/uploads.js";
import { invoiceTotals, INVOICE_STATUSES } from "../../src/domain/invoice.js";
import { grossCents } from "../../src/domain/money.js";
import { parseCsv } from "../../src/importers/csv.js";
import { parseCamt } from "../../src/importers/camt.js";
import { AppError } from "../../src/output/errors.js";
import { formatEuro } from "../../shared/format.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const cents = z.number().int();
const clientFields = { name: z.string().min(1), address: z.string().optional(), country: z.string().optional(), vat_id: z.string().optional(), email: z.string().optional() };
const item = z.object({ description: z.string().min(1), quantity: z.number().int().positive(), unit_price_cents: cents, vat_bp: z.number().int().min(0).max(10000) });
const mapping = z.object({ date: z.string(), amount: z.string(), counterparty: z.string().optional(), reference: z.string().optional(), delimiter: z.string().max(1).optional() });

export const SCHEMAS = {
  "client.create": z.object(clientFields).strict(),
  "client.update": z.object({ id: z.string(), ...Object.fromEntries(Object.entries(clientFields).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) }).strict(),
  "invoice.create": z.object({ client_id: z.string().optional(), new_client: z.object(clientFields).strict().optional(), issue_date: date, due_date: date.optional(), delivery_date: date.optional(), notes: z.string().optional(), items: z.array(item).min(1) }).strict(),
  "invoice.status": z.object({ id: z.string(), status: z.enum(INVOICE_STATUSES) }).strict(),
  "expense.create": z.object({ date, net_cents: cents, vat_bp: z.number().int().min(0).max(10000), supplier: z.string().optional(), description: z.string().optional(), category: z.string().optional(), upload_id: z.string().optional() }).strict(),
  "tx.import": z.object({ upload_id: z.string(), format: z.enum(["csv", "camt"]), mapping: mapping.optional() }).strict(),
  "tx.classify": z.object({ id: z.string(), category: z.string().min(1) }).strict(),
  "tx.link": z.object({ id: z.string(), invoice_id: z.string().optional(), expense_id: z.string().optional() }).strict(),
} as const;

export type ActionKind = keyof typeof SCHEMAS;
export type Prepared = { ok: true; kind: ActionKind; payload: any; summary: string } | { ok: false; error: string };

function exists(db: Database.Database, table: string, id: string): boolean {
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(id);
}
const clientName = (db: Database.Database, id: string) => (db.prepare("SELECT name FROM clients WHERE id=?").get(id) as { name: string } | undefined)?.name;

export function prepareAction(db: Database.Database, raw: unknown): Prepared {
  const kind = (raw as any)?.kind;
  if (!(kind in SCHEMAS)) return { ok: false, error: `unknown action kind: ${String(kind)}` };
  const parsed = SCHEMAS[kind as ActionKind].safeParse((raw as any).payload);
  if (!parsed.success) return { ok: false, error: `${kind}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "payload"} ${i.message}`).join("; ")}` };
  const p: any = parsed.data;
  const fail = (error: string): Prepared => ({ ok: false, error });

  switch (kind as ActionKind) {
    case "client.create":
      return { ok: true, kind, payload: p, summary: `New customer · ${p.name}` };
    case "client.update": {
      const name = clientName(db, p.id);
      if (!name) return fail(`client not found: ${p.id}`);
      return { ok: true, kind, payload: p, summary: `Update customer · ${p.name ?? name}` };
    }
    case "invoice.create": {
      if (!!p.client_id === !!p.new_client) return fail("invoice.create: give exactly one of client_id or new_client");
      const biz = db.prepare("SELECT value FROM meta WHERE key='business'").get() as { value: string } | undefined;
      if (biz && JSON.parse(biz.value).kleinunternehmer && p.items.some((i: any) => i.vat_bp > 0)) return fail("invoice.create: the business is a Kleinunternehmer (§ 19 UStG), so every item needs vat_bp 0");
      let label: string;
      if (p.client_id) {
        const name = clientName(db, p.client_id);
        if (!name) return fail(`client not found: ${p.client_id}`);
        label = name;
      } else label = `${p.new_client.name} (new)`;
      return { ok: true, kind, payload: p, summary: `Invoice · ${label} · ${formatEuro(invoiceTotals(p.items).grossCents)}` };
    }
    case "invoice.status": {
      const inv = db.prepare("SELECT number FROM invoices WHERE id=?").get(p.id) as { number: string } | undefined;
      if (!inv) return fail(`invoice not found: ${p.id}`);
      return { ok: true, kind, payload: p, summary: `Mark ${inv.number} ${p.status}` };
    }
    case "expense.create":
      if (p.upload_id && !exists(db, "uploads", p.upload_id)) return fail(`upload not found: ${p.upload_id}`);
      return { ok: true, kind, payload: p, summary: `Expense · ${p.supplier ?? p.description ?? "unnamed"} · ${formatEuro(grossCents(p.net_cents, p.vat_bp))}` };
    case "tx.import": {
      if (!exists(db, "uploads", p.upload_id)) return fail(`upload not found: ${p.upload_id}`);
      if (p.format === "csv" && !p.mapping) return fail("tx.import: csv requires a mapping");
      const u = new UploadsRepo(db).get(p.upload_id);
      return { ok: true, kind, payload: p, summary: `Import · ${u.filename}` };
    }
    case "tx.classify":
    case "tx.link": {
      const t = db.prepare("SELECT counterparty, amount_cents FROM transactions WHERE id=?").get(p.id) as { counterparty: string | null; amount_cents: number } | undefined;
      if (!t) return fail(`transaction not found: ${p.id}`);
      const who = `${t.counterparty ?? "unknown"} ${formatEuro(t.amount_cents)}`;
      if (kind === "tx.classify") return { ok: true, kind, payload: p, summary: `Categorize · ${who} · ${p.category}` };
      if (!!p.invoice_id === !!p.expense_id) return fail("tx.link: give exactly one of invoice_id or expense_id");
      if (p.invoice_id && !exists(db, "invoices", p.invoice_id)) return fail(`invoice not found: ${p.invoice_id}`);
      if (p.expense_id && !exists(db, "expenses", p.expense_id)) return fail(`expense not found: ${p.expense_id}`);
      return { ok: true, kind, payload: p, summary: `Match · ${who}` };
    }
  }
}

export function executeAction(db: Database.Database, dataDir: string, kind: ActionKind, p: any): unknown {
  switch (kind) {
    case "client.create": {
      const c = new ClientsRepo(db).add(p);
      return { id: c.id, name: c.name };
    }
    case "client.update": {
      const { id, ...patch } = p;
      const c = new ClientsRepo(db).edit(id, patch);
      return { id: c.id, name: c.name };
    }
    case "invoice.create": {
      const { new_client, ...fields } = p;
      const run = db.transaction(() => {
        const client_id = new_client ? new ClientsRepo(db).add(new_client).id : fields.client_id;
        return new InvoicesRepo(db).create({ ...fields, client_id });
      });
      const inv = run();
      return { id: inv.id, number: inv.number, client_id: inv.client_id, gross_cents: invoiceTotals(p.items).grossCents };
    }
    case "invoice.status": {
      const inv = new InvoicesRepo(db).setStatus(p.id, p.status);
      return { id: inv.id, number: inv.number, status: inv.status };
    }
    case "expense.create": {
      const { upload_id, ...fields } = p;
      const repo = new ExpensesRepo(db);
      let e = repo.add(fields);
      if (upload_id) e = repo.attach(e.id, new UploadsRepo(db).get(upload_id).path, dataDir);
      return { id: e.id, gross_cents: grossCents(e.net_cents, e.vat_bp) };
    }
    case "tx.import": {
      const u = new UploadsRepo(db).get(p.upload_id);
      const text = readFileSync(u.path, "utf8");
      const rows = p.format === "camt" ? parseCamt(text) : parseCsv(text, p.mapping);
      return new TransactionsRepo(db).insertBatch(p.format, u.filename, rows);
    }
    case "tx.classify": {
      const t = new TransactionsRepo(db).setCategory(p.id, p.category);
      return { id: t.id, category: t.category };
    }
    case "tx.link": {
      const repo = new TransactionsRepo(db);
      const t = p.invoice_id ? repo.link(p.id, "invoice", p.invoice_id) : repo.link(p.id, "expense", p.expense_id);
      return { id: t.id };
    }
  }
  throw new AppError("BAD_INPUT", `cannot execute ${kind}`, 1);
}
