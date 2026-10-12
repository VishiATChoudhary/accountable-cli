#!/usr/bin/env node
import { main } from "./main.js";

main(process.argv).catch((e) => {
  process.stderr.write(JSON.stringify({ error: { code: "INTERNAL", message: String(e?.message ?? e) } }) + "\n");
  process.exit(2);
});
