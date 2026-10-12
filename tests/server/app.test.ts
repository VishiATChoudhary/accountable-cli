import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app.js";
import type { RunTurn } from "../../server/agent/chat.js";

const runner = (text: string): RunTurn => async ({ onEvent }) => {
  onEvent({ type: "session", claudeSessionId: "c1" });
  onEvent({ type: "delta", text });
  return { claudeSessionId: "c1", text, isError: false };
};

function mk(text = "ok") {
  const dir = mkdtempSync(join(tmpdir(), "fb-"));
  return { dir, app: createApp({ dataDir: dir, runTurn: runner(text) }) };
}
const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function readSse(res: Response): Promise<any[]> {
  const text = await res.text();
  return text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
}

describe("api", () => {
  it("creates, edits, lists and protects customers", async () => {
    const { app } = mk();
    const c = await (await app.request("/api/clients", json({ name: "ACME GmbH", email: "a@b.de" }))).json();
    expect(c.name).toBe("ACME GmbH");
    const e = await (await app.request(`/api/clients/${c.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: "Berlin" }) })).json();
    expect(e.address).toBe("Berlin");
    expect((await (await app.request("/api/clients")).json())).toHaveLength(1);
    const bad = await app.request("/api/clients", json({}));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("BAD_INPUT");
    expect((await app.request("/api/clients/nope")).status).toBe(404);
  });

  it("lists invoices with client name and totals, and downloads the PDF", async () => {
    const { app } = mk();
    const c = await (await app.request("/api/clients", json({ name: "ACME GmbH" }))).json();
    const inv = await (await app.request("/api/invoices", json({ client_id: c.id, issue_date: "2026-10-12", items: [{ description: "Work", quantity: 1000, unit_price_cents: 100000, vat_bp: 1900 }] }))).json();
    const list = await (await app.request("/api/invoices")).json();
    expect(list[0]).toMatchObject({ number: inv.number, client_name: "ACME GmbH", gross_cents: 119000 });
    const pdf = await app.request(`/api/invoices/${inv.id}/pdf`);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("content-disposition")).toContain(`${inv.number}.pdf`);
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
  });

  it("accepts uploads and serves them back", async () => {
    const { app } = mk();
    const fd = new FormData();
    fd.append("file", new File(["Datum;Betrag\n2026-10-01;-5,00\n"], "../../evil name.csv", { type: "text/csv" }));
    const up = await (await app.request("/api/uploads", { method: "POST", body: fd })).json();
    expect(up.filename).toBe("evil name.csv");
    expect(up.path).not.toContain("..");
    const back = await app.request(`/api/uploads/${up.id}`);
    expect(await back.text()).toContain("Datum;Betrag");
  });

  it("streams a chat turn and confirms a proposal", async () => {
    const block = "Adding.\n```freebies-action\n{\"kind\":\"client.create\",\"payload\":{\"name\":\"Beta AG\"}}\n```";
    const { app } = mk(block);
    const res = await app.request("/api/chat", json({ message: "add Beta AG" }));
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await readSse(res);
    const proposal = events.find((e) => e.type === "proposal");
    expect(proposal.action.summary).toBe("New customer · Beta AG");
    const ok = await (await app.request(`/api/actions/${proposal.action.id}/confirm`, { method: "POST" })).json();
    expect(ok.status).toBe("confirmed");
    expect(ok.result.name).toBe("Beta AG");
    expect((await app.request(`/api/actions/${proposal.action.id}/confirm`, { method: "POST" })).status).toBe(409);
    const hist = await (await app.request(`/api/chat/sessions/${events[0].sessionId}`)).json();
    expect(hist.messages).toHaveLength(2);
    expect(hist.actions[0].status).toBe("confirmed");
  });

  it("rejects a proposal without executing it", async () => {
    const { app } = mk("```freebies-action\n{\"kind\":\"client.create\",\"payload\":{\"name\":\"Nope AG\"}}\n```");
    const events = await readSse(await app.request("/api/chat", json({ message: "x" })));
    const id = events.find((e) => e.type === "proposal").action.id;
    expect((await (await app.request(`/api/actions/${id}/reject`, { method: "POST" })).json()).status).toBe("rejected");
    expect(await (await app.request("/api/clients")).json()).toHaveLength(0);
  });

  it("stores the business identity", async () => {
    const { app } = mk();
    await app.request("/api/business", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Max Mustermann", kleinunternehmer: true }) });
    expect(await (await app.request("/api/business")).json()).toMatchObject({ name: "Max Mustermann", kleinunternehmer: true });
  });
});
