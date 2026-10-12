import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { StreamMapper, toolLabel } from "../../server/agent/stream.js";

const here = dirname(fileURLToPath(import.meta.url));
const lines = readFileSync(join(here, "../fixtures/agent/read-and-denied.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("StreamMapper (real recorded stream)", () => {
  const m = new StreamMapper();
  const events = lines.flatMap((o) => m.push(o));
  it("emits the claude session id first", () => {
    expect(events[0]).toEqual({ type: "session", claudeSessionId: "dcc66b06-32f1-4fd3-98f8-845b9f95a47c" });
  });
  it("accumulates streamed text", () => {
    expect(m.text).toContain("Probe GmbH");
    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(3);
  });
  it("reports tool activity with friendly labels and the denial", () => {
    expect(events.filter((e) => e.type === "tool").map((e: any) => e.label)).toEqual(["clients", "ls ~"]);
    expect(events.filter((e) => e.type === "denied")).toHaveLength(1);
  });
  it("ends with a non-error done", () => {
    expect(events.at(-1)).toMatchObject({ type: "done", isError: false });
  });
});

describe("toolLabel", () => {
  it("names freebies-ro lookups by resource", () => {
    expect(toolLabel("Bash", { command: "freebies-ro invoices list" })).toBe("invoices");
  });
  it("names file reads by basename", () => {
    expect(toolLabel("Read", { file_path: "/x/uploads/abc-receipt.pdf" })).toBe("abc-receipt.pdf");
  });
});
