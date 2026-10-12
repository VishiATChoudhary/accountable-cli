import { Command } from "commander";
import { VERSION } from "./version.js";

// --version flag: emit JSON and exit before commander parses.
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

export { program };

program.parseAsync(process.argv);
