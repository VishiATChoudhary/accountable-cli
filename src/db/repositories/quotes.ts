import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";
import { nextNumber, InvoicesRepo, Invoice } from "./invoices.js";
import { InvoiceItemInput } from "../../domain/invoice.js";

const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
export interface Quote { id: string; number: string; client_id: string; issue_date: string; status: string; currency: string; notes?: string; converted_invoice_id?: string; created_at: string; }
export interface CreateQuoteInput { client_id: string; issue_date: string; notes?: string; items: InvoiceItemInput[]; }

export class QuotesRepo {
  constructor(private db: Database.Database) {}
  create(input: CreateQuoteInput): Quote {
    const client = this.db.prepare("SELECT id FROM clients WHERE id=?").get(input.client_id);
    if (!client) throw new AppError("NOT_FOUND", `client not found: ${input.client_id}`, 1, { id: input.client_id });
    if (!input.items || input.items.length === 0) throw new AppError("BAD_INPUT", "quote requires at least one item", 1);
    const year = input.issue_date.slice(0, 4);
    const create = this.db.transaction((): Quote => {
      const q: Quote = { id: newId(), number: nextNumber(this.db, "quote_number_sequence", `Q${year}`), client_id: input.client_id, issue_date: input.issue_date, status: "draft", currency: "EUR", notes: input.notes, created_at: new Date().toISOString() };
      this.db.prepare("INSERT INTO quotes (id,number,client_id,issue_date,status,currency,notes,created_at) VALUES (@id,@number,@client_id,@issue_date,@status,@currency,@notes,@created_at)").run({ notes: null, ...q });
      input.items.forEach((it, idx) => this.db.prepare("INSERT INTO quote_items (id,quote_id,description,quantity,unit_price_cents,vat_bp,position) VALUES (?,?,?,?,?,?,?)").run(newId(), q.id, it.description, it.quantity, it.unit_price_cents, it.vat_bp, idx));
      return q;
    });
    return create();
  }
  get(id: string): Quote & { items: InvoiceItemInput[] } {
    const q = this.db.prepare("SELECT * FROM quotes WHERE id=?").get(id) as Quote | undefined;
    if (!q) throw new AppError("NOT_FOUND", `quote not found: ${id}`, 1, { id });
    const items = this.db.prepare("SELECT description,quantity,unit_price_cents,vat_bp FROM quote_items WHERE quote_id=? ORDER BY position").all(id) as InvoiceItemInput[];
    return { ...q, items };
  }
  list(): Quote[] { return this.db.prepare("SELECT * FROM quotes ORDER BY number").all() as Quote[]; }
  setStatus(id: string, status: string): Quote {
    if (!QUOTE_STATUSES.includes(status as any)) throw new AppError("BAD_STATUS", `invalid status: ${status}`, 1);
    const r = this.db.prepare("UPDATE quotes SET status=? WHERE id=?").run(status, id);
    if (r.changes === 0) throw new AppError("NOT_FOUND", `quote not found: ${id}`, 1, { id });
    return this.get(id);
  }
  toInvoice(id: string): Invoice {
    const q = this.get(id);
    if (q.converted_invoice_id) throw new AppError("ALREADY_CONVERTED", `quote already converted to invoice: ${q.converted_invoice_id}`, 1, { id, invoice_id: q.converted_invoice_id });
    const convert = this.db.transaction((): Invoice => {
      const inv = new InvoicesRepo(this.db).create({ client_id: q.client_id, issue_date: new Date().toISOString().slice(0, 10), items: q.items });
      this.db.prepare("UPDATE quotes SET converted_invoice_id=?, status='accepted' WHERE id=?").run(inv.id, id);
      return inv;
    });
    return convert();
  }
}
