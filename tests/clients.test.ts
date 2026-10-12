import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { ClientsRepo } from "../src/db/repositories/clients.js";

describe("clients repo", () => {
  it("adds and gets a client", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
    const repo = new ClientsRepo(db);
    const c = repo.add({ name: "ACME GmbH", vat_id: "DE123" });
    expect(c.id).toMatch(/[0-9a-f-]{36}/);
    expect(repo.get(c.id).name).toBe("ACME GmbH");
    expect(repo.list()).toHaveLength(1);
  });
  it("throws NOT_FOUND for missing id", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
    const repo = new ClientsRepo(db);
    try {
      repo.get("nope");
      expect.fail("expected get to throw");
    } catch (e: any) {
      expect(e.code).toBe("NOT_FOUND");
    }
  });
});
