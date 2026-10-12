import { Command } from "commander";
import { VERSION } from "./version.js";
import { registerClients } from "./commands/clients.js";
import { registerInvoices } from "./commands/invoices.js";
import { registerQuotes } from "./commands/quotes.js";
import { registerExpenses } from "./commands/expenses.js";
import { registerTx } from "./commands/tx.js";
import { registerBusiness } from "./commands/business.js";
import { loadContext } from "./context.js";
import { emit } from "./output/render.js";
import { fail } from "./output/errors.js";

const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

export async function main(argv: string[]): Promise<void> {
  const args = argv.slice(2);
  if (args.includes("--version")) {
    console.log(args.includes("--json") || !process.stdout.isTTY ? JSON.stringify({ version: VERSION }) : `freebies ${VERSION}`);
    return;
  }
  // Bare `freebies` in a terminal opens the onboarding / home screen.
  if (args.length === 0 && interactive()) {
    const { runTui } = await import("./tui/index.js");
    return runTui({ mode: "auto" });
  }

  const program = new Command();
  program
    .name("freebies")
    .description("Local-first bookkeeping for German freelancers")
    .option("--json", "emit JSON output")
    .option("--pretty", "emit human-readable output")
    .option("--data-dir <path>", "override data directory");

  program.command("init").description("create data dir and database")
    .action(() => { try { const ctx = loadContext(program.opts()); emit({ ok: true, dataDir: ctx.dataDir }, ctx); } catch (e) { fail(e); } });

  program.command("setup").description("set up your business details (interactive)")
    .action(async () => {
      if (!interactive()) fail(new (await import("./output/errors.js")).AppError("NOT_A_TERMINAL", "setup needs an interactive terminal; use `freebies business set` instead", 1));
      const { runTui } = await import("./tui/index.js");
      await runTui({ mode: "onboarding", dataDir: program.opts().dataDir });
    });

  program.command("app").description("open the freebies web app")
    .option("--port <port>", "port to listen on", "4317")
    .option("--no-open", "don't open the browser")
    .action(async (o) => {
      const { startApp } = await import("./app.js");
      await startApp({ port: Number(o.port), open: o.open, dataDir: program.opts().dataDir });
    });

  registerClients(program);
  registerInvoices(program);
  registerQuotes(program);
  registerExpenses(program);
  registerTx(program);
  registerBusiness(program);

  await program.parseAsync(argv);
}
