import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRunner } from "../../server/agent/runner.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, "../fixtures/agent");

describe("claude runner", () => {
  it("spawns claude isolated and maps its stream", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const record = join(dir, "rec.json");
    process.env.FAKE_CLAUDE_FIXTURE = join(fx, "read-and-denied.jsonl");
    process.env.FAKE_CLAUDE_RECORD = record;
    const run = createRunner({ claudeBin: join(fx, "fake-claude.mjs"), dataDir: dir, repoRoot: join(here, "../..") });
    const events: any[] = [];
    const r = await run({ prompt: "hello", resumeId: "prev-1", onEvent: (e) => events.push(e) });
    expect(r.claudeSessionId).toBe("dcc66b06-32f1-4fd3-98f8-845b9f95a47c");
    expect(r.text).toContain("Probe GmbH");
    expect(r.isError).toBe(false);
    const rec = JSON.parse(readFileSync(record, "utf8"));
    expect(rec.stdin).toBe("hello");
    expect(rec.dataDir).toBe(dir);
    expect(rec.path.split(":")[0]).toMatch(/\/bin$/);
    const a = rec.argv.join(" ");
    for (const flag of ["-p", "--output-format stream-json", "--setting-sources project", "--strict-mcp-config", "--permission-mode default", "--resume prev-1", "--tools Bash,Read,Glob"]) expect(a).toContain(flag);
    expect(rec.argv).toContain("Bash(freebies-ro:*)");
    expect(a).not.toContain("dangerously");
  });
});
