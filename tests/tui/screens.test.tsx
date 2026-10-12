import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/db/index.js";
import { BusinessRepo } from "../../src/db/repositories/business.js";
import { ClientsRepo } from "../../src/db/repositories/clients.js";
import { InvoicesRepo } from "../../src/db/repositories/invoices.js";
import { TransactionsRepo } from "../../src/db/repositories/transactions.js";
import { Onboarding } from "../../src/tui/Onboarding.js";
import { Home } from "../../src/tui/Home.js";

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const plain = (s = "") => s.replace(/\x1b\[[0-9;]*m/g, "");
const ENTER = "\r", DOWN = "\u001b[B", BACKSPACE = "\u007f";
const agentOk = async () => ({ ok: true as const, version: "2.1.296" });

async function type(stdin: { write: (s: string) => void }, text: string) { stdin.write(text); await tick(); }

describe("onboarding", () => {
  it("walks welcome, details, agent check and saves the business", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const db = openDb(dir);
    let finished: string | null = null;
    const { stdin, lastFrame } = render(<Onboarding db={db} dataDir={dir} checkAgent={agentOk} onFinish={(c) => { finished = c; }} animate={false} />);
    await tick();
    expect(plain(lastFrame())).toContain("Bookkeeping for German freelancers");
    await type(stdin, ENTER);                       // welcome -> details
    expect(plain(lastFrame())).toContain("Name");
    await type(stdin, "Max Mustermann"); await type(stdin, ENTER);
    await type(stdin, "Hauptstraße 1, 10115 Berlin"); await type(stdin, ENTER);
    await type(stdin, "12/345/67890"); await type(stdin, ENTER);   // tax number
    await type(stdin, ENTER);                                        // vat id (skip)
    await type(stdin, "max@example.de"); await type(stdin, ENTER);
    await type(stdin, "DE89 3704 0044 0532 0130 00"); await type(stdin, ENTER);
    await type(stdin, "y"); await type(stdin, ENTER);                // kleinunternehmer yes, continue
    await tick(80);
    expect(plain(lastFrame())).toContain("2.1.296");                 // agent check screen
    await type(stdin, ENTER);                                        // -> done
    expect(plain(lastFrame())).toMatch(/set, Max/);
    await type(stdin, DOWN); await type(stdin, ENTER);               // choose Finish
    expect(finished).toBe("finish");
    expect(new BusinessRepo(db).get()).toMatchObject({ name: "Max Mustermann", tax_number: "12/345/67890", iban: "DE89 3704 0044 0532 0130 00", kleinunternehmer: true });
  });

  it("blocks continuing with an empty name and with a malformed IBAN", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const { stdin, lastFrame } = render(<Onboarding db={openDb(dir)} dataDir={dir} checkAgent={agentOk} onFinish={() => {}} animate={false} />);
    await tick(); await type(stdin, ENTER);
    await type(stdin, ENTER);                                        // empty name
    expect(plain(lastFrame())).toMatch(/need a name/i);
    await type(stdin, "Max"); await type(stdin, ENTER);
    for (let i = 0; i < 4; i++) await type(stdin, ENTER);            // address..email
    await type(stdin, "NOT-AN-IBAN"); await type(stdin, ENTER);
    expect(plain(lastFrame())).toMatch(/IBAN/);
    expect(plain(lastFrame())).toMatch(/doesn't look like/i);
    for (let i = 0; i < 11; i++) await type(stdin, BACKSPACE);
    await type(stdin, ENTER);                                        // empty IBAN is fine
    expect(plain(lastFrame())).toMatch(/Kleinunternehmer/);
  });
});

describe("home", () => {
  it("shows open invoices, unsorted transactions and the business name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const db = openDb(dir);
    new BusinessRepo(db).set({ name: "Vishi Choudhary" });
    const c = new ClientsRepo(db).add({ name: "Nordlicht Studio GmbH" });
    new InvoicesRepo(db).create({ client_id: c.id, issue_date: "2026-10-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100000, vat_bp: 1900 }] });
    new TransactionsRepo(db).insertBatch("csv", "f", [{ booking_date: "2026-10-02", amount_cents: -500, counterparty: "AWS", raw: {} }]);
    const { lastFrame } = render(<Home db={db} dataDir={dir} onAction={() => {}} animate={false} />);
    await tick();
    const f = plain(lastFrame());
    expect(f).toContain("Vishi Choudhary");
    expect(f).toContain("1.190,00");
    expect(f).toContain("Nordlicht Studio GmbH");
    expect(f).toMatch(/unsorted[\s\S]*1/i);
  });
});

describe("onboarding with chunked input", () => {
  it("handles several fields and Enters arriving in one chunk, like a paste or a slow terminal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const db = openDb(dir);
    const { stdin, lastFrame } = render(<Onboarding db={db} dataDir={dir} checkAgent={agentOk} onFinish={() => {}} animate={false} />);
    await tick();
    stdin.write("\rErika Mustermann\rMusterweg 5, 50667 Köln\r21/815/08150\r\rerika@example.de\r\rn\r");
    await tick(120);
    expect(plain(lastFrame())).toContain("2.1.296");
    expect(new BusinessRepo(db).get()).toMatchObject({ name: "Erika Mustermann", address: "Musterweg 5, 50667 Köln", tax_number: "21/815/08150", email: "erika@example.de", kleinunternehmer: false });
  });
});
