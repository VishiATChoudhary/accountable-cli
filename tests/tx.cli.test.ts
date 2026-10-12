import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(dataDir: string, args: string[]) {
  return execFileSync("npx", ["tsx", "src/cli.ts", "--data-dir", dataDir, "--json", ...args], { encoding: "utf8" });
}

describe("tx cli", () => {
  it("imports a csv and lists transactions", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const csv = join(dir, "feb.csv");
    writeFileSync(csv, "Buchungstag;Betrag;Beguenstigter;Verwendungszweck\n2026-02-01;-50,00;AWS;Hosting\n");
    const mapFile = join(dir, "map.json");
    writeFileSync(mapFile, JSON.stringify({ date: "Buchungstag", amount: "Betrag", counterparty: "Beguenstigter", reference: "Verwendungszweck", delimiter: ";" }));
    const imp = JSON.parse(run(dir, ["tx", "import", "--file", csv, "--format", "csv", "--map", mapFile]));
    expect(imp.count).toBe(1);
    const list = JSON.parse(run(dir, ["tx", "list"]));
    expect(list).toHaveLength(1);
  });
  it("errors classifying a nonexistent transaction", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    run(dir, ["init"]);
    let code = 0;
    try { run(dir, ["tx", "classify", "does-not-exist", "--category", "x"]); } catch (e: any) { code = e.status; }
    expect(code).toBe(1);
  });
});
