import { Command } from "commander";
import { VERSION } from "./version.js";
import { registerClients } from "./commands/clients.js";
import { registerInvoices } from "./commands/invoices.js";
import { registerQuotes } from "./commands/quotes.js";
import { registerExpenses } from "./commands/expenses.js";
import { registerTx } from "./commands/tx.js";
import { loadContext } from "./context.js";
import { emit } from "./output/render.js";
import { fail } from "./output/errors.js";

if (process.argv.includes("--version")) {
  console.log(JSON.stringify({ version: VERSION }));
  process.exit(0);
}

const program = new Command();
program
  .name("freebies")
  .description("Local-first German freelancer bookkeeping")
  .option("--json", "emit JSON output")
  .option("--pretty", "emit human-readable output")
  .option("--data-dir <path>", "override data directory");

program.command("init").description("create data dir and database")
  .action(() => { try { const ctx = loadContext(program.opts()); emit({ ok: true, dataDir: ctx.dataDir }, ctx); } catch (e) { fail(e); } });

registerClients(program);
registerInvoices(program);
registerQuotes(program);
registerExpenses(program);
registerTx(program);

program.parseAsync(process.argv);
