#!/usr/bin/env node
// Test double for the claude CLI: records argv + stdin, replays a stream-json fixture.
import { readFileSync, writeFileSync } from "node:fs";
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  if (process.env.FAKE_CLAUDE_RECORD) writeFileSync(process.env.FAKE_CLAUDE_RECORD, JSON.stringify({ argv: process.argv.slice(2), stdin: input, path: process.env.PATH, dataDir: process.env.FREEBIES_DATA_DIR }));
  process.stdout.write(readFileSync(process.env.FAKE_CLAUDE_FIXTURE, "utf8"));
});
