import { isAllowed } from "./freebies-ro-policy.js";

const args = process.argv.slice(2);
if (!isAllowed(args)) {
  process.stderr.write(JSON.stringify({ error: { code: "READ_ONLY", message: "freebies-ro only allows list/get commands. Propose writes with a freebies-action block." } }) + "\n");
  process.exit(1);
}
process.argv = [process.argv[0], process.argv[1], "--json", ...args];
await import("../src/cli.js");
