import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/db/index.js";
import { ClientsRepo } from "../../src/db/repositories/clients.js";
import { ChatRepo } from "../../src/db/repositories/chat.js";
import { ActionsRepo } from "../../src/db/repositories/actions.js";
import { handleChatTurn, type RunTurn } from "../../server/agent/chat.js";

function fakeRunner(chunks: string[], captured: { prompt?: string; resume?: string | null }): RunTurn {
  return async ({ prompt, resumeId, onEvent }) => {
    captured.prompt = prompt; captured.resume = resumeId;
    onEvent({ type: "session", claudeSessionId: "claude-1" });
    for (const c of chunks) onEvent({ type: "delta", text: c });
    onEvent({ type: "done", isError: false });
    return { claudeSessionId: "claude-1", text: chunks.join(""), isError: false };
  };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "fb-"));
  const db = openDb(dir);
  const client = new ClientsRepo(db).add({ name: "ACME GmbH" });
  return { dir, db, client };
}

describe("handleChatTurn", () => {
  it("streams text, stores messages, and turns action blocks into pending proposals", async () => {
    const { dir, db, client } = setup();
    const block = "```freebies-action\n" + JSON.stringify({ kind: "invoice.create", payload: { client_id: client.id, issue_date: "2026-10-12", items: [{ description: "Work", quantity: 1000, unit_price_cents: 100000, vat_bp: 1900 }] } }) + "\n```";
    const events: any[] = [];
    const cap: any = {};
    const r = await handleChatTurn({ db, dataDir: dir, message: "Invoice ACME 1000", uploadIds: [], emit: (e) => events.push(e), runTurn: fakeRunner(["Here it is.\n\n", block], cap) });
    const proposals = events.filter((e) => e.type === "proposal");
    expect(proposals).toHaveLength(1);
    expect(proposals[0].action.status).toBe("pending");
    const msgs = new ChatRepo(db).messages(r.sessionId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].content).toBe("Here it is.");
    expect(new ChatRepo(db).getSession(r.sessionId).claude_session_id).toBe("claude-1");
    expect(events.at(-1).type).toBe("done");
  });

  it("reports invalid proposals as errors, not cards", async () => {
    const { dir, db } = setup();
    const events: any[] = [];
    await handleChatTurn({ db, dataDir: dir, message: "x", uploadIds: [], emit: (e) => events.push(e), runTurn: fakeRunner(["ok\n```freebies-action\n{\"kind\":\"client.create\",\"payload\":{}}\n```"], {}) });
    expect(events.filter((e) => e.type === "proposal")).toHaveLength(0);
    expect(events.filter((e) => e.type === "proposal_error")).toHaveLength(1);
  });

  it("resumes the claude session and prepends resolved actions to the next prompt", async () => {
    const { dir, db } = setup();
    const cap: any = {};
    const first = await handleChatTurn({ db, dataDir: dir, message: "add Beta", uploadIds: [], emit: () => {}, runTurn: fakeRunner(["```freebies-action\n{\"kind\":\"client.create\",\"payload\":{\"name\":\"Beta AG\"}}\n```"], {}) });
    const action = new ActionsRepo(db).forSession(first.sessionId)[0];
    new ActionsRepo(db).resolve(action.id, "confirmed", { id: "c9", name: "Beta AG" });
    await handleChatTurn({ db, dataDir: dir, sessionId: first.sessionId, message: "thanks", uploadIds: [], emit: () => {}, runTurn: fakeRunner(["np"], cap) });
    expect(cap.resume).toBe("claude-1");
    expect(cap.prompt).toContain("confirmed");
    expect(cap.prompt).toContain("New customer · Beta AG");
    expect(cap.prompt.trim().endsWith("thanks")).toBe(true);
  });
});
