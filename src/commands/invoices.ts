import { Command } from "commander";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadContext } from "../context.js";
import { InvoicesRepo } from "../db/repositories/invoices.js";
import { invoiceTotals } from "../domain/invoice.js";
import { emit } from "../output/render.js";
import { AppError, fail } from "../output/errors.js";

const ItemSchema = z.object({ description: z.string(), quantity: z.number().int(), unit_price_cents: z.number().int(), vat_bp: z.number().int() });
const CreateSchema = z.object({ client_id: z.string(), issue_date: z.string(), due_date: z.string().optional(), notes: z.string().optional(), items: z.array(ItemSchema).min(1) });

export function registerInvoices(program: Command): void {
  const g = program.command("invoices").description("manage invoices");
  g.command("create").requiredOption("--from <file>", "JSON file with invoice input")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        const parsed = CreateSchema.safeParse(JSON.parse(readFileSync(o.from, "utf8")));
        if (!parsed.success) throw new AppError("BAD_INPUT", "invalid invoice input", 1, parsed.error.format());
        const inv = new InvoicesRepo(ctx.db).create(parsed.data);
        emit({ ...inv, totals: invoiceTotals(parsed.data.items) }, ctx);
      } catch (e) { fail(e); }
    });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new InvoicesRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); const r = new InvoicesRepo(ctx.db); const inv = r.get(id); emit({ ...inv, totals: invoiceTotals(inv.items) }, ctx); } catch (e) { fail(e); } });
  g.command("status <id> <status>").action((id, status) => { try { const ctx = loadContext(program.opts()); emit(new InvoicesRepo(ctx.db).setStatus(id, status), ctx); } catch (e) { fail(e); } });
}
