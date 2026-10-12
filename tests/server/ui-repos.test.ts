import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/db/index.js";
import { ChatRepo } from "../../src/db/repositories/chat.js";
import { ActionsRepo } from "../../src/db/repositories/actions.js";
import { UploadsRepo } from "../../src/db/repositories/uploads.js";

const db = () => openDb(mkdtempSync(join(tmpdir(), "fb-")));

describe("chat repo", () => {
  it("creates a session, stores messages in order, records claude session id", () => {
    const r = new ChatRepo(db());
    const s = r.createSession();
    r.addMessage(s.id, "user", "hi");
    r.addMessage(s.id, "assistant", "hello");
    r.setClaudeSession(s.id, "c-123");
    expect(r.getSession(s.id).claude_session_id).toBe("c-123");
    expect(r.messages(s.id).map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(r.latestSession()?.id).toBe(s.id);
  });
});

describe("actions repo", () => {
  it("tracks pending -> confirmed and un-notified resolutions", () => {
    const d = db(); const s = new ChatRepo(d).createSession();
    const a = new ActionsRepo(d);
    const act = a.create({ session_id: s.id, kind: "client.create", payload: { name: "ACME" }, summary: "Customer · ACME" });
    expect(a.get(act.id).status).toBe("pending");
    a.resolve(act.id, "confirmed", { id: "c1" });
    expect(a.get(act.id).status).toBe("confirmed");
    expect(a.get(act.id).result).toEqual({ id: "c1" });
    expect(a.unnotified(s.id)).toHaveLength(1);
    a.markNotified(s.id);
    expect(a.unnotified(s.id)).toHaveLength(0);
  });
  it("refuses to resolve twice", () => {
    const d = db(); const s = new ChatRepo(d).createSession();
    const a = new ActionsRepo(d);
    const act = a.create({ session_id: s.id, kind: "client.create", payload: {}, summary: "x" });
    a.resolve(act.id, "rejected", null);
    try { a.resolve(act.id, "confirmed", null); expect.fail("should throw"); }
    catch (e: any) { expect(e.code).toBe("ALREADY_RESOLVED"); }
  });
});

describe("uploads repo", () => {
  it("records an upload and looks it up", () => {
    const r = new UploadsRepo(db());
    const u = r.add({ filename: "r.pdf", path: "/tmp/x/r.pdf", mime: "application/pdf", size: 10 });
    expect(r.get(u.id).filename).toBe("r.pdf");
  });
});
