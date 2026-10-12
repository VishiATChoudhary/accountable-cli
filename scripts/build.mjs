// Bundles the CLI (with server and TUI) and the agent's read-only wrapper into dist/.
// Dependencies stay external; they install from npm alongside the package.
import { build } from "esbuild";
import { cpSync, rmSync, chmodSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
await build({
  entryPoints: { cli: "src/cli.ts", "freebies-ro": "bin/freebies-ro.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  jsx: "automatic",
  logLevel: "warning",
});
cpSync("src/db/migrations", "dist/migrations", { recursive: true });
chmodSync("dist/cli.js", 0o755);
console.log("built dist/cli.js, dist/freebies-ro.js");
