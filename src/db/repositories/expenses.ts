import type Database from "better-sqlite3";
import { copyFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface Expense { id: string; date: string; supplier?: string; description?: string; net_cents: number; vat_bp: number; category?: string; receipt_path?: string; created_at: string; }

export class ExpensesRepo {
  constructor(private db: Database.Database) {}
  add(input: Omit<Partial<Expense>, "id" | "created_at"> & { date: string; net_cents: number; vat_bp: number }): Expense {
    const e: Expense = { id: newId(), created_at: new Date().toISOString(), ...input };
    this.db.prepare("INSERT INTO expenses (id,date,supplier,description,net_cents,vat_bp,category,receipt_path,created_at) VALUES (@id,@date,@supplier,@description,@net_cents,@vat_bp,@category,@receipt_path,@created_at)")
      .run({ supplier: null, description: null, category: null, receipt_path: null, ...e });
    return e;
  }
  get(id: string): Expense {
    const row = this.db.prepare("SELECT * FROM expenses WHERE id=?").get(id) as Expense | undefined;
    if (!row) throw new AppError("NOT_FOUND", `expense not found: ${id}`, 1, { id });
    return row;
  }
  list(): Expense[] { return this.db.prepare("SELECT * FROM expenses ORDER BY date").all() as Expense[]; }
  edit(id: string, patch: Partial<Expense>): Expense {
    const next = { ...this.get(id), ...patch };
    this.db.prepare("UPDATE expenses SET date=@date,supplier=@supplier,description=@description,net_cents=@net_cents,vat_bp=@vat_bp,category=@category,receipt_path=@receipt_path WHERE id=@id").run(next);
    return next;
  }
  remove(id: string): void { const r = this.db.prepare("DELETE FROM expenses WHERE id=?").run(id); if (r.changes === 0) throw new AppError("NOT_FOUND", `expense not found: ${id}`, 1, { id }); }
  attach(id: string, srcPath: string, dataDir: string): Expense {
    if (!existsSync(srcPath)) throw new AppError("BAD_INPUT", `receipt file not found: ${srcPath}`, 1, { path: srcPath });
    const dest = join(dataDir, "files", `${id}-${basename(srcPath)}`);
    copyFileSync(srcPath, dest);
    return this.edit(id, { receipt_path: dest });
  }
}
