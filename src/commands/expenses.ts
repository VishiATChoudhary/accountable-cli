import { Command } from "commander";
import { loadContext } from "../context.js";
import { ExpensesRepo } from "../db/repositories/expenses.js";
import { parseEuroToCents } from "../domain/money.js";
import { emit } from "../output/render.js";
import { fail } from "../output/errors.js";

export function registerExpenses(program: Command): void {
  const g = program.command("expenses").description("manage expenses");
  g.command("add").requiredOption("--date <d>").requiredOption("--net <amount>").option("--vat <bp>", "VAT basis points", "1900").option("--supplier <s>").option("--description <d>").option("--category <c>")
    .action((o) => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).add({ date: o.date, net_cents: parseEuroToCents(o.net), vat_bp: parseInt(o.vat, 10), supplier: o.supplier, description: o.description, category: o.category }), ctx); } catch (e) { fail(e); } });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).get(id), ctx); } catch (e) { fail(e); } });
  g.command("rm <id>").action((id) => { try { const ctx = loadContext(program.opts()); new ExpensesRepo(ctx.db).remove(id); emit({ ok: true }, ctx); } catch (e) { fail(e); } });
  g.command("attach <id> <file>").action((id, file) => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).attach(id, file, ctx.dataDir), ctx); } catch (e) { fail(e); } });
}
