import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadContext } from "../context.js";
import { TransactionsRepo } from "../db/repositories/transactions.js";
import { parseCsv } from "../importers/csv.js";
import { parseCamt } from "../importers/camt.js";
import { classifyOne, Rule } from "../domain/classify.js";
import { emit } from "../output/render.js";
import { AppError, fail } from "../output/errors.js";

export function registerTx(program: Command): void {
  const g = program.command("tx").description("bank transactions");
  g.command("import").requiredOption("--file <path>").option("--format <fmt>", "csv|camt", "csv").option("--map <file>", "csv column mapping")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        const text = readFileSync(o.file, "utf8");
        let rows;
        if (o.format === "camt") rows = parseCamt(text);
        else { if (!o.map) throw new AppError("BAD_INPUT", "csv import requires --map", 1); rows = parseCsv(text, JSON.parse(readFileSync(o.map, "utf8"))); }
        emit(new TransactionsRepo(ctx.db).insertBatch(o.format, basename(o.file), rows), ctx);
      } catch (e) { fail(e); }
    });
  g.command("list").option("--status <s>").action((o) => { try { const ctx = loadContext(program.opts()); emit(new TransactionsRepo(ctx.db).list(o.status ? { status: o.status } : undefined), ctx); } catch (e) { fail(e); } });
  g.command("classify <id>").requiredOption("--category <c>").action((id, o) => { try { const ctx = loadContext(program.opts()); emit(new TransactionsRepo(ctx.db).setCategory(id, o.category), ctx); } catch (e) { fail(e); } });
  g.command("link <id>").option("--invoice <iid>").option("--expense <eid>").action((id, o) => { try { const ctx = loadContext(program.opts()); const repo = new TransactionsRepo(ctx.db); if (o.invoice) emit(repo.link(id, "invoice", o.invoice), ctx); else if (o.expense) emit(repo.link(id, "expense", o.expense), ctx); else throw new AppError("BAD_INPUT", "provide --invoice or --expense", 1); } catch (e) { fail(e); } });
  g.command("auto-classify").option("--rules <file>").option("--use-claude")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        const repo = new TransactionsRepo(ctx.db);
        const rules: Rule[] = o.rules ? JSON.parse(readFileSync(o.rules, "utf8")) : [];
        const unclassified = repo.list({ status: "unclassified" });
        const applied: string[] = [], unmatched: unknown[] = [];
        for (const t of unclassified) {
          const cat = classifyOne(t, rules);
          if (cat) { repo.setCategory(t.id, cat); applied.push(t.id); }
          else unmatched.push({ id: t.id, counterparty: t.counterparty, reference: t.reference, amount_cents: t.amount_cents });
        }
        emit({ applied: applied.length, unmatched: o.useClaude ? unmatched : unmatched.length }, ctx);
      } catch (e) { fail(e); }
    });
}
