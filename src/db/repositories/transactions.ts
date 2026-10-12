import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface ParsedTx { booking_date: string; value_date?: string; amount_cents: number; currency?: string; counterparty?: string; reference?: string; raw?: unknown; }
export interface Transaction extends ParsedTx { id: string; status: string; category?: string; import_batch_id: string; created_at: string; }

export class TransactionsRepo {
  constructor(private db: Database.Database) {}
  insertBatch(source: string, filename: string, rows: ParsedTx[]): { batch_id: string; count: number } {
    const batch_id = newId();
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO import_batches (id,source,filename,imported_at,row_count) VALUES (?,?,?,?,?)").run(batch_id, source, filename, now, rows.length);
      for (const row of rows) {
        this.db.prepare("INSERT INTO transactions (id,booking_date,value_date,amount_cents,currency,counterparty,reference,raw,import_batch_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(newId(), row.booking_date, row.value_date ?? null, row.amount_cents, row.currency ?? "EUR", row.counterparty ?? null, row.reference ?? null, JSON.stringify(row.raw ?? {}), batch_id, "unclassified", now);
      }
    });
    tx();
    return { batch_id, count: rows.length };
  }
  list(filter?: { status?: string }): Transaction[] {
    if (filter?.status) return this.db.prepare("SELECT * FROM transactions WHERE status=? ORDER BY booking_date").all(filter.status) as Transaction[];
    return this.db.prepare("SELECT * FROM transactions ORDER BY booking_date").all() as Transaction[];
  }
  get(id: string): Transaction { const r = this.db.prepare("SELECT * FROM transactions WHERE id=?").get(id) as Transaction | undefined; if (!r) throw new AppError("NOT_FOUND", `transaction not found: ${id}`, 1, { id }); return r; }
  setCategory(id: string, category: string): Transaction {
    const t = this.get(id);
    if (t.status === "classified") throw new AppError("ALREADY_CLASSIFIED", `transaction already classified: ${id}`, 1, { id });
    this.db.prepare("UPDATE transactions SET category=?, status='classified' WHERE id=?").run(category, id);
    return this.get(id);
  }
  setStatus(id: string, status: string): Transaction { const r = this.db.prepare("UPDATE transactions SET status=? WHERE id=?").run(status, id); if (r.changes === 0) throw new AppError("NOT_FOUND", `transaction not found: ${id}`, 1, { id }); return this.get(id); }
  link(txId: string, targetType: "invoice" | "expense", targetId: string): Transaction {
    this.get(txId);
    this.db.prepare("INSERT INTO tx_links (id,transaction_id,target_type,target_id) VALUES (?,?,?,?)").run(newId(), txId, targetType, targetId);
    this.db.prepare("UPDATE transactions SET status='classified' WHERE id=?").run(txId);
    return this.get(txId);
  }
}
