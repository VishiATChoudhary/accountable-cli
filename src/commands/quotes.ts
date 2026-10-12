import { Command } from "commander";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadContext } from "../context.js";
import { QuotesRepo } from "../db/repositories/quotes.js";
import { emit } from "../output/render.js";
import { AppError, fail } from "../output/errors.js";

const ItemSchema = z.object({ description: z.string(), quantity: z.number().int(), unit_price_cents: z.number().int(), vat_bp: z.number().int() });
const CreateSchema = z.object({ client_id: z.string(), issue_date: z.string(), notes: z.string().optional(), items: z.array(ItemSchema).min(1) });

export function registerQuotes(program: Command): void {
  const g = program.command("quotes").description("manage quotes");
  g.command("create").requiredOption("--from <file>").action((o) => {
    try {
      const ctx = loadContext(program.opts());
      const parsed = CreateSchema.safeParse(JSON.parse(readFileSync(o.from, "utf8")));
      if (!parsed.success) throw new AppError("BAD_INPUT", "invalid quote input", 1, parsed.error.format());
      emit(new QuotesRepo(ctx.db).create(parsed.data), ctx);
    } catch (e) { fail(e); }
  });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).get(id), ctx); } catch (e) { fail(e); } });
  g.command("accept <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).setStatus(id, "accepted"), ctx); } catch (e) { fail(e); } });
  g.command("to-invoice <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).toInvoice(id), ctx); } catch (e) { fail(e); } });
}
