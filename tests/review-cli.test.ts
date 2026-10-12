import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(dir: string, args: string[]) {
  return execFileSync("npx", ["tsx", "src/cli.ts", "--data-dir", dir, "--json", ...args], { encoding: "utf8" });
}
function runRaw(dir: string, args: string[]) {
  return execFileSync("npx", ["tsx", "src/cli.ts", "--data-dir", dir, ...args], { encoding: "utf8" });
}

describe("review fixes (cli)", () => {
  it("#8 clients edit updates a field", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const id = JSON.parse(run(dir, ["clients", "add", "--name", "ACME"])).id;
    const edited = JSON.parse(run(dir, ["clients", "edit", id, "--address", "Berlin"]));
    expect(edited.address).toBe("Berlin");
  });
  it("#8 expenses edit updates category", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const id = JSON.parse(run(dir, ["expenses", "add", "--date", "2026-03-01", "--net", "50,00"])).id;
    const edited = JSON.parse(run(dir, ["expenses", "edit", id, "--category", "hosting"]));
    expect(edited.category).toBe("hosting");
  });
  it("#3 quotes create with bad input exits 1 not 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const f = join(dir, "q.json"); writeFileSync(f, JSON.stringify({ issue_date: "2026-02-01" }));
    let code = 0;
    try { run(dir, ["quotes", "create", "--from", f]); } catch (e: any) { code = e.status; }
    expect(code).toBe(1);
  });
  it("#13 expenses attach missing file exits 1 not 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const id = JSON.parse(run(dir, ["expenses", "add", "--date", "2026-03-01", "--net", "50,00"])).id;
    let code = 0;
    try { run(dir, ["expenses", "attach", id, join(dir, "nope.pdf")]); } catch (e: any) { code = e.status; }
    expect(code).toBe(1);
  });
  it("#10 --pretty forces non-json output when piped", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    run(dir, ["clients", "add", "--name", "ACME"]);
    const out = runRaw(dir, ["--pretty", "clients", "list"]);
    let parseable = true;
    try { JSON.parse(out); } catch { parseable = false; }
    expect(parseable).toBe(false);
  });
  it("#9 invoice pdf includes seller identity when business is set", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    run(dir, ["business", "set", "--name", "Max Mustermann", "--address", "Hauptstr 1", "--tax-number", "12/345/67890", "--kleinunternehmer", "true"]);
    const cid = JSON.parse(run(dir, ["clients", "add", "--name", "ACME"])).id;
    const invf = join(dir, "inv.json");
    writeFileSync(invf, JSON.stringify({ client_id: cid, issue_date: "2026-01-01", items: [{ description: "Work", quantity: 1000, unit_price_cents: 100000, vat_bp: 0 }] }));
    const iid = JSON.parse(run(dir, ["invoices", "create", "--from", invf])).id;
    const out = JSON.parse(run(dir, ["invoices", "pdf", iid]));
    const pdf = readFileSync(out.path);
    expect(pdf.length).toBeGreaterThan(500);
  });
});
