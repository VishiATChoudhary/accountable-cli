import { Command } from "commander";
import { readFileSync } from "node:fs";
import { loadContext } from "../context.js";
import { QuotesRepo } from "../db/repositories/quotes.js";
import { emit } from "../output/render.js";
import { fail } from "../output/errors.js";

export function registerQuotes(program: Command): void {
  const g = program.command("quotes").description("manage quotes");
  g.command("create").requiredOption("--from <file>").action((o) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).create(JSON.parse(readFileSync(o.from, "utf8"))), ctx); } catch (e) { fail(e); } });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).get(id), ctx); } catch (e) { fail(e); } });
  g.command("accept <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).setStatus(id, "accepted"), ctx); } catch (e) { fail(e); } });
  g.command("to-invoice <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).toInvoice(id), ctx); } catch (e) { fail(e); } });
}
