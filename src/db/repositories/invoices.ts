import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";
import { InvoiceItemInput, INVOICE_STATUSES, InvoiceStatus } from "../../domain/invoice.js";

export interface Invoice {
  id: string; number: string; client_id: string; issue_date: string;
  due_date?: string; status: InvoiceStatus; currency: string; notes?: string; created_at: string;
}
export interface CreateInvoiceInput {
  client_id: string; issue_date: string; due_date?: string; notes?: string; items: InvoiceItemInput[];
}

export function nextNumber(db: Database.Database, metaKey: string, prefix: string): string {
  const row = db.prepare("SELECT value FROM meta WHERE key=?").get(metaKey) as { value: string };
  const next = parseInt(row.value, 10) + 1;
  db.prepare("UPDATE meta SET value=? WHERE key=?").run(String(next), metaKey);
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

export class InvoicesRepo {
  constructor(private db: Database.Database) {}
  create(input: CreateInvoiceInput): Invoice {
    const client = this.db.prepare("SELECT id FROM clients WHERE id=?").get(input.client_id);
    if (!client) throw new AppError("NOT_FOUND", `client not found: ${input.client_id}`, 1);
    const biz = this.db.prepare("SELECT value FROM meta WHERE key='business'").get() as { value: string } | undefined;
    if (biz && JSON.parse(biz.value).kleinunternehmer && input.items.some((i) => i.vat_bp > 0)) {
      throw new AppError("KLEINUNTERNEHMER_VAT", "As a Kleinunternehmer (§ 19 UStG) you can't charge VAT. Set every item's VAT to 0.", 1);
    }
    const year = input.issue_date.slice(0, 4);
    const create = this.db.transaction((): Invoice => {
      const inv: Invoice = {
        id: newId(), number: nextNumber(this.db, "invoice_number_sequence", year),
        client_id: input.client_id, issue_date: input.issue_date, due_date: input.due_date,
        status: "draft", currency: "EUR", notes: input.notes, created_at: new Date().toISOString(),
      };
      this.db.prepare("INSERT INTO invoices (id,number,client_id,issue_date,due_date,status,currency,notes,created_at) VALUES (@id,@number,@client_id,@issue_date,@due_date,@status,@currency,@notes,@created_at)")
        .run({ due_date: null, notes: null, ...inv });
      input.items.forEach((it, idx) => {
        this.db.prepare("INSERT INTO invoice_items (id,invoice_id,description,quantity,unit_price_cents,vat_bp,position) VALUES (?,?,?,?,?,?,?)")
          .run(newId(), inv.id, it.description, it.quantity, it.unit_price_cents, it.vat_bp, idx);
      });
      return inv;
    });
    return create();
  }
  get(id: string): Invoice & { items: InvoiceItemInput[] } {
    const inv = this.db.prepare("SELECT * FROM invoices WHERE id=?").get(id) as Invoice | undefined;
    if (!inv) throw new AppError("NOT_FOUND", `invoice not found: ${id}`, 1, { id });
    const items = this.db.prepare("SELECT description,quantity,unit_price_cents,vat_bp FROM invoice_items WHERE invoice_id=? ORDER BY position").all(id) as InvoiceItemInput[];
    return { ...inv, items };
  }
  list(): Invoice[] { return this.db.prepare("SELECT * FROM invoices ORDER BY number").all() as Invoice[]; }
  edit(id: string, patch: { due_date?: string; notes?: string; issue_date?: string }): Invoice & { items: InvoiceItemInput[] } {
    const cur = this.get(id);
    const next = { due_date: patch.due_date ?? cur.due_date ?? null, notes: patch.notes ?? cur.notes ?? null, issue_date: patch.issue_date ?? cur.issue_date, id };
    this.db.prepare("UPDATE invoices SET due_date=@due_date, notes=@notes, issue_date=@issue_date WHERE id=@id").run(next);
    return this.get(id);
  }
  setStatus(id: string, status: string): Invoice {
    if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) throw new AppError("BAD_STATUS", `invalid status: ${status}`, 1);
    const r = this.db.prepare("UPDATE invoices SET status=? WHERE id=?").run(status, id);
    if (r.changes === 0) throw new AppError("NOT_FOUND", `invoice not found: ${id}`, 1, { id });
    return this.get(id);
  }
}
