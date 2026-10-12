import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

function run(args: string[]): string {
  return execFileSync("npx", ["tsx", "src/cli.ts", ...args], { encoding: "utf8" });
}

describe("cli", () => {
  it("prints version as json", () => {
    const out = JSON.parse(run(["--version", "--json"]));
    expect(out.version).toMatch(/\d+\.\d+\.\d+/);
  });
});
