# freebies Local Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first German freelancer bookkeeping CLI that creates invoices/quotes, tracks expenses, and imports and classifies bank transactions, with every command emitting stable JSON so Claude Code can drive it.

**Architecture:** TypeScript on Node 22, ES modules. A pure domain layer (money, invoice totals, classification rules) sits above a `better-sqlite3` store accessed through typed repositories. `commander` parses commands; a shared output layer renders JSON (default) or pretty tables and maps typed errors to exit codes. Bank importers (CSV, CAMT.053) and PDF generation live behind their own module boundaries.

**Tech Stack:** TypeScript, Node 22, commander, better-sqlite3, zod, fast-xml-parser, pdfkit, vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-10-12-freebies-local-core-design.md`

## Global Constraints

- Node 22, TypeScript, ES modules (`"type": "module"` in package.json).
- All monetary amounts stored and computed as integer euro cents. Never float for money.
- VAT rates stored as basis points (19% = 1900).
- Every command accepts `--json` and prints one JSON document to stdout on success. `--json` is the default when stdout is not a TTY.
- Errors print `{ "error": { "code", "message", "details" } }` to stderr. Exit 0 success, 1 user error, 2 internal error.
- Data dir: `$FREEBIES_DATA_DIR` else `$XDG_DATA_HOME/freebies` else `~/.local/share/freebies`. DB at `<dataDir>/freebies.db`, files at `<dataDir>/files/`.
- Ids are UUIDv4 text. Timestamps ISO 8601 text (`new Date().toISOString()`).
- Test-driven: every task writes the failing test first.

## Review Focus

- **Fractional/odd-cent VAT rounding** — a net amount whose VAT does not divide evenly (e.g. 1 cent at 19%) must round half-up to a deterministic integer cent; covered in Task 2.
- **Empty or malformed bank CSV** — a file with no data rows, or a row missing the mapped amount column, must fail as a user error (exit 1), not crash; covered in Task 10.
- **German decimal commas and thousands separators in CSV amounts** — `1.234,56` must parse to `123456` cents; covered in Task 10.
- **Duplicate invoice numbers under the gapless counter** — two `invoices create` calls must yield consecutive, never-repeated numbers even if one later becomes void; covered in Task 5.
- **Classifying an already-classified or nonexistent transaction** — must return a clear user error, not silently no-op; covered in Task 12.

---

## Task 0: Project scaffold and build

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (append), `src/cli.ts`, `src/version.ts`
- Test: `tests/cli.smoke.test.ts`

**Interfaces:**
- Produces: a runnable `freebies` entry (`src/cli.ts`) built with commander; `tsx src/cli.ts` runs it in dev.

- [ ] **Step 1: Write the failing smoke test**

```ts
// tests/cli.smoke.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli.smoke.test.ts`
Expected: FAIL (no package.json / cli.ts).

- [ ] **Step 3: Create package.json**

```json
{
  "name": "freebies",
  "version": "0.1.0",
  "type": "module",
  "bin": { "freebies": "dist/cli.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "commander": "^12.0.0",
    "fast-xml-parser": "^4.4.0",
    "pdfkit": "^0.15.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/pdfkit": "^0.13.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 4: Create tsconfig.json and vitest.config.ts**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 5: Create src/version.ts and src/cli.ts**

```ts
// src/version.ts
export const VERSION = "0.1.0";
```

```ts
// src/cli.ts
import { Command } from "commander";
import { VERSION } from "./version.js";

const program = new Command();
program
  .name("freebies")
  .description("Local-first German freelancer bookkeeping")
  .option("--json", "emit JSON output")
  .option("--pretty", "emit human-readable output")
  .option("--data-dir <path>", "override data directory");

program
  .command("version", { isDefault: false })
  .action(() => console.log(JSON.stringify({ version: VERSION })));

// --version flag handling
if (process.argv.includes("--version")) {
  console.log(JSON.stringify({ version: VERSION }));
  process.exit(0);
}

program.parseAsync(process.argv);
```

- [ ] **Step 6: Install deps and run the test**

Run: `npm install && npx vitest run tests/cli.smoke.test.ts`
Expected: PASS.

- [ ] **Step 7: Append build artifacts to .gitignore and commit**

```bash
printf 'node_modules/\ndist/\n*.sqlite\n*.db\n' >> .gitignore
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src tests
git commit -m "feat: scaffold freebies CLI with commander and vitest"
```

---

## Task 1: Output and error layer

**Files:**
- Create: `src/output/errors.ts`, `src/output/render.ts`
- Test: `tests/output.test.ts`

**Interfaces:**
- Produces: `class AppError extends Error { code: string; exitCode: 1|2; details?: unknown }`; `fail(err): never` (prints JSON to stderr, exits); `emit(data, opts: { json: boolean }): void` (prints to stdout).

- [ ] **Step 1: Write failing test**

```ts
// tests/output.test.ts
import { describe, it, expect, vi } from "vitest";
import { AppError } from "../src/output/errors.js";
import { renderJson } from "../src/output/render.js";

describe("output", () => {
  it("AppError carries code and exit code", () => {
    const e = new AppError("NOT_FOUND", "missing", 1, { id: "x" });
    expect(e.code).toBe("NOT_FOUND");
    expect(e.exitCode).toBe(1);
    expect(e.details).toEqual({ id: "x" });
  });
  it("renderJson stringifies stably", () => {
    expect(renderJson({ b: 1, a: 2 })).toBe('{"b":1,"a":2}');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/output.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement errors.ts**

```ts
// src/output/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public exitCode: 1 | 2 = 1,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function fail(err: unknown): never {
  if (err instanceof AppError) {
    process.stderr.write(
      JSON.stringify({ error: { code: err.code, message: err.message, details: err.details } }) + "\n",
    );
    process.exit(err.exitCode);
  }
  process.stderr.write(
    JSON.stringify({ error: { code: "INTERNAL", message: String((err as Error)?.message ?? err) } }) + "\n",
  );
  process.exit(2);
}
```

- [ ] **Step 4: Implement render.ts**

```ts
// src/output/render.ts
export function renderJson(data: unknown): string {
  return JSON.stringify(data);
}

export function emit(data: unknown, opts: { json: boolean }): void {
  if (opts.json) {
    console.log(renderJson(data));
  } else {
    console.dir(data, { depth: null });
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/output.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/output tests/output.test.ts
git commit -m "feat: typed errors and output rendering"
```

---

## Task 2: Money domain

**Files:**
- Create: `src/domain/money.ts`
- Test: `tests/money.test.ts`

**Interfaces:**
- Produces: `parseEuroToCents(s: string): number`; `formatCents(c: number): string`; `vatCents(netCents: number, vatBp: number): number`; `grossCents(netCents: number, vatBp: number): number`.

- [ ] **Step 1: Write failing test (includes Review Focus: odd-cent rounding)**

```ts
// tests/money.test.ts
import { describe, it, expect } from "vitest";
import { parseEuroToCents, formatCents, vatCents, grossCents } from "../src/domain/money.js";

describe("money", () => {
  it("parses german decimal comma and thousands separator", () => {
    expect(parseEuroToCents("1.234,56")).toBe(123456);
    expect(parseEuroToCents("-12,00")).toBe(-1200);
    expect(parseEuroToCents("0,01")).toBe(1);
  });
  it("formats cents", () => {
    expect(formatCents(123456)).toBe("1234,56");
    expect(formatCents(-1200)).toBe("-12,00");
  });
  it("rounds VAT half-up on odd cents", () => {
    expect(vatCents(1, 1900)).toBe(0); // 0.19 cents -> 0
    expect(vatCents(3, 1900)).toBe(1); // 0.57 cents -> 1
    expect(vatCents(10000, 1900)).toBe(1900);
    expect(grossCents(10000, 1900)).toBe(11900);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/money.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement money.ts**

```ts
// src/domain/money.ts
import { AppError } from "../output/errors.js";

export function parseEuroToCents(s: string): number {
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new AppError("BAD_AMOUNT", `cannot parse amount: ${s}`, 1);
  }
  return Math.round(parseFloat(cleaned) * 100);
}

export function formatCents(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function vatCents(netCents: number, vatBp: number): number {
  return Math.round((netCents * vatBp) / 10000);
}

export function grossCents(netCents: number, vatBp: number): number {
  return netCents + vatCents(netCents, vatBp);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/money.ts tests/money.test.ts
git commit -m "feat: money domain with german parsing and VAT rounding"
```

---

## Task 3: Database layer and migrations

**Files:**
- Create: `src/db/index.ts`, `src/db/migrations/001_init.sql`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `resolveDataDir(override?: string): string`; `openDb(dataDir: string): Database` (runs migrations, returns `better-sqlite3` handle); schema per the spec's data model.

- [ ] **Step 1: Write failing test**

```ts
// tests/db.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";

describe("db", () => {
  it("creates all tables on open", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const db = openDb(dir);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
    for (const t of ["clients","invoices","invoice_items","quotes","quote_items","expenses","transactions","tx_links","import_batches","meta"]) {
      expect(tables).toContain(t);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write migration 001_init.sql**

```sql
-- src/db/migrations/001_init.sql
CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, country TEXT, vat_id TEXT, email TEXT, created_at TEXT NOT NULL);
CREATE TABLE invoices (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id TEXT NOT NULL, issue_date TEXT NOT NULL, due_date TEXT, status TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'EUR', notes TEXT, created_at TEXT NOT NULL);
CREATE TABLE invoice_items (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, description TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL, vat_bp INTEGER NOT NULL, position INTEGER NOT NULL);
CREATE TABLE quotes (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id TEXT NOT NULL, issue_date TEXT NOT NULL, status TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'EUR', notes TEXT, created_at TEXT NOT NULL);
CREATE TABLE quote_items (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, description TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price_cents INTEGER NOT NULL, vat_bp INTEGER NOT NULL, position INTEGER NOT NULL);
CREATE TABLE expenses (id TEXT PRIMARY KEY, date TEXT NOT NULL, supplier TEXT, description TEXT, net_cents INTEGER NOT NULL, vat_bp INTEGER NOT NULL, category TEXT, receipt_path TEXT, created_at TEXT NOT NULL);
CREATE TABLE transactions (id TEXT PRIMARY KEY, booking_date TEXT NOT NULL, value_date TEXT, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'EUR', counterparty TEXT, reference TEXT, raw TEXT, import_batch_id TEXT, status TEXT NOT NULL DEFAULT 'unclassified', category TEXT, created_at TEXT NOT NULL);
CREATE TABLE tx_links (id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL);
CREATE TABLE import_batches (id TEXT PRIMARY KEY, source TEXT NOT NULL, filename TEXT, imported_at TEXT NOT NULL, row_count INTEGER NOT NULL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta (key, value) VALUES ('schema_version', '1'), ('invoice_number_sequence', '0'), ('quote_number_sequence', '0');
```

- [ ] **Step 4: Implement db/index.ts**

```ts
// src/db/index.ts
import Database from "better-sqlite3";
import { readFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveDataDir(override?: string): string {
  if (override) return override;
  if (process.env.FREEBIES_DATA_DIR) return process.env.FREEBIES_DATA_DIR;
  const xdg = process.env.XDG_DATA_HOME;
  return join(xdg ?? join(homedir(), ".local", "share"), "freebies");
}

export function openDb(dataDir: string): Database.Database {
  mkdirSync(join(dataDir, "files"), { recursive: true });
  const db = new Database(join(dataDir, "freebies.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const migDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
  const applied = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").get();
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied && f === "001_init.sql") continue;
    db.exec(readFileSync(join(migDir, f), "utf8"));
  }
  return db;
}
```

Note: migrations are copied to `dist/db/migrations` by a build step. Add to package.json scripts: `"build": "tsc && cp -r src/db/migrations dist/db/migrations"`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS.

- [ ] **Step 6: Update build script and commit**

```bash
git add src/db package.json tests/db.test.ts
git commit -m "feat: sqlite db layer and initial schema"
```

---

## Task 4: ID helper, context, and clients repository + command

**Files:**
- Create: `src/db/id.ts`, `src/context.ts`, `src/db/repositories/clients.ts`, `src/commands/clients.ts`
- Modify: `src/cli.ts`
- Test: `tests/clients.test.ts`

**Interfaces:**
- Produces: `newId(): string`; `loadContext(opts): { db, dataDir, json }`; `ClientsRepo` with `add(input): Client`, `list(): Client[]`, `get(id): Client`, `edit(id, patch): Client`, `remove(id): void`; `Client` type.

- [ ] **Step 1: Write failing test**

```ts
// tests/clients.test.ts
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
    expect(() => repo.get("nope")).toThrowError(/NOT_FOUND/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/clients.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement id.ts and clients repo**

```ts
// src/db/id.ts
import { randomUUID } from "node:crypto";
export const newId = (): string => randomUUID();
```

```ts
// src/db/repositories/clients.ts
import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface Client {
  id: string; name: string; address?: string; country?: string;
  vat_id?: string; email?: string; created_at: string;
}

export class ClientsRepo {
  constructor(private db: Database.Database) {}
  add(input: Omit<Partial<Client>, "id" | "created_at"> & { name: string }): Client {
    const c: Client = { id: newId(), created_at: new Date().toISOString(), ...input };
    this.db.prepare(
      "INSERT INTO clients (id,name,address,country,vat_id,email,created_at) VALUES (@id,@name,@address,@country,@vat_id,@email,@created_at)",
    ).run({ address: null, country: null, vat_id: null, email: null, ...c });
    return c;
  }
  get(id: string): Client {
    const row = this.db.prepare("SELECT * FROM clients WHERE id=?").get(id) as Client | undefined;
    if (!row) throw new AppError("NOT_FOUND", `client not found: ${id}`, 1, { id });
    return row;
  }
  list(): Client[] {
    return this.db.prepare("SELECT * FROM clients ORDER BY created_at").all() as Client[];
  }
  edit(id: string, patch: Partial<Client>): Client {
    const cur = this.get(id);
    const next = { ...cur, ...patch };
    this.db.prepare("UPDATE clients SET name=@name,address=@address,country=@country,vat_id=@vat_id,email=@email WHERE id=@id").run(next);
    return next;
  }
  remove(id: string): void {
    const r = this.db.prepare("DELETE FROM clients WHERE id=?").run(id);
    if (r.changes === 0) throw new AppError("NOT_FOUND", `client not found: ${id}`, 1, { id });
  }
}
```

- [ ] **Step 4: Implement context.ts and clients command, wire into cli.ts**

```ts
// src/context.ts
import { openDb, resolveDataDir } from "./db/index.js";
export function loadContext(opts: { dataDir?: string; json?: boolean }) {
  const dataDir = resolveDataDir(opts.dataDir);
  return { dataDir, db: openDb(dataDir), json: opts.json ?? !process.stdout.isTTY };
}
```

```ts
// src/commands/clients.ts
import { Command } from "commander";
import { loadContext } from "../context.js";
import { ClientsRepo } from "../db/repositories/clients.js";
import { emit } from "../output/render.js";
import { fail } from "../output/errors.js";

export function registerClients(program: Command): void {
  const g = program.command("clients").description("manage clients");
  g.command("add").requiredOption("--name <name>").option("--vat-id <v>").option("--email <e>").option("--address <a>")
    .action(function (this: Command, o) {
      try {
        const ctx = loadContext(program.opts());
        emit(new ClientsRepo(ctx.db).add({ name: o.name, vat_id: o.vatId, email: o.email, address: o.address }), ctx);
      } catch (e) { fail(e); }
    });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new ClientsRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new ClientsRepo(ctx.db).get(id), ctx); } catch (e) { fail(e); } });
  g.command("rm <id>").action((id) => { try { const ctx = loadContext(program.opts()); new ClientsRepo(ctx.db).remove(id); emit({ ok: true }, ctx); } catch (e) { fail(e); } });
}
```

In `src/cli.ts`, import and call `registerClients(program)` before `parseAsync`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/clients.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests/clients.test.ts
git commit -m "feat: clients repository and command"
```

---

## Task 5: Invoices domain, repository, and commands

**Files:**
- Create: `src/domain/invoice.ts`, `src/db/repositories/invoices.ts`, `src/commands/invoices.ts`
- Modify: `src/cli.ts`
- Test: `tests/invoice.test.ts`

**Interfaces:**
- Consumes: `vatCents`, `grossCents` (Task 2); `ClientsRepo.get` (Task 4).
- Produces: `invoiceTotals(items): { netCents, vatCents, grossCents }`; `nextNumber(db, kind): string`; `InvoicesRepo` with `create(input): Invoice`, `list()`, `get(id)`, `setStatus(id, status)`; types `InvoiceItemInput`, `Invoice`.

- [ ] **Step 1: Write failing test (includes Review Focus: gapless numbering)**

```ts
// tests/invoice.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { ClientsRepo } from "../src/db/repositories/clients.js";
import { InvoicesRepo } from "../src/db/repositories/invoices.js";
import { invoiceTotals } from "../src/domain/invoice.js";

function ctx() {
  const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
  const client = new ClientsRepo(db).add({ name: "ACME" });
  return { db, client };
}

describe("invoices", () => {
  it("computes totals with mixed VAT", () => {
    const t = invoiceTotals([
      { description: "a", quantity: 2000, unit_price_cents: 10000, vat_bp: 1900 }, // qty in thousandths: 2.0
      { description: "b", quantity: 1000, unit_price_cents: 5000, vat_bp: 700 },
    ]);
    expect(t.netCents).toBe(25000);
    expect(t.vatCents).toBe(3800 + 350);
    expect(t.grossCents).toBe(25000 + 4150);
  });
  it("numbers invoices gaplessly even after void", () => {
    const { db, client } = ctx();
    const repo = new InvoicesRepo(db);
    const a = repo.create({ client_id: client.id, issue_date: "2026-01-01", items: [{ description: "x", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    repo.setStatus(a.id, "void");
    const b = repo.create({ client_id: client.id, issue_date: "2026-01-02", items: [{ description: "y", quantity: 1000, unit_price_cents: 100, vat_bp: 1900 }] });
    expect(a.number).toBe("2026-0001");
    expect(b.number).toBe("2026-0002");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/invoice.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement invoice domain**

```ts
// src/domain/invoice.ts
import { vatCents } from "./money.js";

export interface InvoiceItemInput {
  description: string; quantity: number; unit_price_cents: number; vat_bp: number;
}

function lineNet(i: InvoiceItemInput): number {
  return Math.round((i.quantity * i.unit_price_cents) / 1000); // quantity in thousandths
}

export function invoiceTotals(items: InvoiceItemInput[]) {
  let netCents = 0, vat = 0;
  for (const i of items) {
    const net = lineNet(i);
    netCents += net;
    vat += vatCents(net, i.vat_bp);
  }
  return { netCents, vatCents: vat, grossCents: netCents + vat };
}

export const INVOICE_STATUSES = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
```

- [ ] **Step 4: Implement invoices repo**

```ts
// src/db/repositories/invoices.ts
import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";
import { InvoiceItemInput, INVOICE_STATUSES, InvoiceStatus } from "../../domain/invoice.js";

export interface Invoice {
  id: string; number: string; client_id: string; issue_date: string;
  due_date?: string; status: InvoiceStatus; currency: string; notes?: string; created_at: string;
}
export interface CreateInvoiceInput {
  client_id: string; issue_date: string; due_date?: string; notes?: string; items: InvoiceItemInput[];
}

export function nextNumber(db: Database.Database, metaKey: string, year: string): string {
  const row = db.prepare("SELECT value FROM meta WHERE key=?").get(metaKey) as { value: string };
  const next = parseInt(row.value, 10) + 1;
  db.prepare("UPDATE meta SET value=? WHERE key=?").run(String(next), metaKey);
  return `${year}-${String(next).padStart(4, "0")}`;
}

export class InvoicesRepo {
  constructor(private db: Database.Database) {}
  create(input: CreateInvoiceInput): Invoice {
    const client = this.db.prepare("SELECT id FROM clients WHERE id=?").get(input.client_id);
    if (!client) throw new AppError("NOT_FOUND", `client not found: ${input.client_id}`, 1);
    const year = input.issue_date.slice(0, 4);
    const inv: Invoice = {
      id: newId(), number: nextNumber(this.db, "invoice_number_sequence", year),
      client_id: input.client_id, issue_date: input.issue_date, due_date: input.due_date,
      status: "draft", currency: "EUR", notes: input.notes, created_at: new Date().toISOString(),
    };
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO invoices (id,number,client_id,issue_date,due_date,status,currency,notes,created_at) VALUES (@id,@number,@client_id,@issue_date,@due_date,@status,@currency,@notes,@created_at)")
        .run({ due_date: null, notes: null, ...inv });
      input.items.forEach((it, idx) => {
        this.db.prepare("INSERT INTO invoice_items (id,invoice_id,description,quantity,unit_price_cents,vat_bp,position) VALUES (?,?,?,?,?,?,?)")
          .run(newId(), inv.id, it.description, it.quantity, it.unit_price_cents, it.vat_bp, idx);
      });
    });
    tx();
    return inv;
  }
  get(id: string): Invoice & { items: InvoiceItemInput[] } {
    const inv = this.db.prepare("SELECT * FROM invoices WHERE id=?").get(id) as Invoice | undefined;
    if (!inv) throw new AppError("NOT_FOUND", `invoice not found: ${id}`, 1, { id });
    const items = this.db.prepare("SELECT description,quantity,unit_price_cents,vat_bp FROM invoice_items WHERE invoice_id=? ORDER BY position").all(id) as InvoiceItemInput[];
    return { ...inv, items };
  }
  list(): Invoice[] { return this.db.prepare("SELECT * FROM invoices ORDER BY number").all() as Invoice[]; }
  setStatus(id: string, status: string): Invoice {
    if (!INVOICE_STATUSES.includes(status as InvoiceStatus)) throw new AppError("BAD_STATUS", `invalid status: ${status}`, 1);
    const r = this.db.prepare("UPDATE invoices SET status=? WHERE id=?").run(status, id);
    if (r.changes === 0) throw new AppError("NOT_FOUND", `invoice not found: ${id}`, 1, { id });
    return this.get(id);
  }
}
```

- [ ] **Step 5: Implement invoices command, wire into cli.ts**

```ts
// src/commands/invoices.ts
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadContext } from "../context.js";
import { InvoicesRepo } from "../db/repositories/invoices.js";
import { invoiceTotals } from "../domain/invoice.js";
import { emit } from "../output/render.js";
import { AppError, fail } from "../output/errors.js";

const ItemSchema = z.object({ description: z.string(), quantity: z.number().int(), unit_price_cents: z.number().int(), vat_bp: z.number().int() });
const CreateSchema = z.object({ client_id: z.string(), issue_date: z.string(), due_date: z.string().optional(), notes: z.string().optional(), items: z.array(ItemSchema).min(1) });

export function registerInvoices(program: Command): void {
  const g = program.command("invoices").description("manage invoices");
  g.command("create").requiredOption("--from <file>", "JSON file with invoice input")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        const parsed = CreateSchema.safeParse(JSON.parse(readFileSync(o.from, "utf8")));
        if (!parsed.success) throw new AppError("BAD_INPUT", "invalid invoice input", 1, parsed.error.format());
        const inv = new InvoicesRepo(ctx.db).create(parsed.data);
        emit({ ...inv, totals: invoiceTotals(parsed.data.items) }, ctx);
      } catch (e) { fail(e); }
    });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new InvoicesRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); const r = new InvoicesRepo(ctx.db); const inv = r.get(id); emit({ ...inv, totals: invoiceTotals(inv.items) }, ctx); } catch (e) { fail(e); } });
  g.command("status <id> <status>").action((id, status) => { try { const ctx = loadContext(program.opts()); emit(new InvoicesRepo(ctx.db).setStatus(id, status), ctx); } catch (e) { fail(e); } });
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/invoice.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests/invoice.test.ts
git commit -m "feat: invoices domain, repository, and commands"
```

---

## Task 6: Invoice PDF generation

**Files:**
- Create: `src/pdf/invoice.ts`
- Modify: `src/commands/invoices.ts` (add `pdf` subcommand)
- Test: `tests/pdf.test.ts`

**Interfaces:**
- Consumes: `InvoicesRepo.get`, `ClientsRepo.get`, `invoiceTotals`.
- Produces: `renderInvoicePdf(invoice, client, outPath): Promise<string>`.

- [ ] **Step 1: Write failing smoke test**

```ts
// tests/pdf.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderInvoicePdf } from "../src/pdf/invoice.js";

describe("pdf", () => {
  it("produces a non-empty pdf file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const out = join(dir, "inv.pdf");
    await renderInvoicePdf(
      { number: "2026-0001", issue_date: "2026-01-01", due_date: "2026-01-15", items: [{ description: "Work", quantity: 1000, unit_price_cents: 10000, vat_bp: 1900 }] } as any,
      { name: "ACME GmbH", address: "Berlin" } as any,
      out,
    );
    const buf = readFileSync(out);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/pdf.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement pdf/invoice.ts**

```ts
// src/pdf/invoice.ts
import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import type { Invoice } from "../db/repositories/invoices.js";
import type { Client } from "../db/repositories/clients.js";
import type { InvoiceItemInput } from "../domain/invoice.js";
import { invoiceTotals, } from "../domain/invoice.js";
import { formatCents } from "../domain/money.js";

export function renderInvoicePdf(
  invoice: Invoice & { items: InvoiceItemInput[] }, client: Client, outPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    doc.fontSize(20).text(`Rechnung ${invoice.number}`);
    doc.moveDown().fontSize(10).text(client.name);
    if (client.address) doc.text(client.address);
    doc.moveDown().text(`Rechnungsdatum: ${invoice.issue_date}`);
    if (invoice.due_date) doc.text(`Fällig: ${invoice.due_date}`);
    doc.moveDown();
    for (const it of invoice.items) {
      const net = Math.round((it.quantity * it.unit_price_cents) / 1000);
      doc.text(`${it.description}  ${formatCents(net)} EUR  (${it.vat_bp / 100}% USt)`);
    }
    const t = invoiceTotals(invoice.items);
    doc.moveDown().text(`Netto: ${formatCents(t.netCents)} EUR`);
    doc.text(`USt: ${formatCents(t.vatCents)} EUR`);
    doc.text(`Gesamt: ${formatCents(t.grossCents)} EUR`);
    doc.end();
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
  });
}
```

- [ ] **Step 4: Add pdf subcommand to invoices.ts**

```ts
// in registerInvoices, add:
g.command("pdf <id>").option("--out <path>")
  .action(async (id, o) => {
    try {
      const ctx = loadContext(program.opts());
      const inv = new InvoicesRepo(ctx.db).get(id);
      const client = new (await import("../db/repositories/clients.js")).ClientsRepo(ctx.db).get(inv.client_id);
      const out = o.out ?? `${ctx.dataDir}/files/${inv.number}.pdf`;
      const { renderInvoicePdf } = await import("../pdf/invoice.js");
      await renderInvoicePdf(inv, client, out);
      emit({ path: out }, ctx);
    } catch (e) { fail(e); }
  });
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/pdf.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests/pdf.test.ts
git commit -m "feat: invoice PDF generation"
```

---

## Task 7: Quotes (reuse invoice shape + convert)

**Files:**
- Create: `src/db/repositories/quotes.ts`, `src/commands/quotes.ts`
- Modify: `src/cli.ts`
- Test: `tests/quotes.test.ts`

**Interfaces:**
- Consumes: `nextNumber` (Task 5), `InvoicesRepo.create`.
- Produces: `QuotesRepo` with `create`, `list`, `get`, `setStatus`, `toInvoice(id): Invoice`.

- [ ] **Step 1: Write failing test**

```ts
// tests/quotes.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { ClientsRepo } from "../src/db/repositories/clients.js";
import { QuotesRepo } from "../src/db/repositories/quotes.js";

describe("quotes", () => {
  it("converts an accepted quote to an invoice", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
    const client = new ClientsRepo(db).add({ name: "ACME" });
    const qr = new QuotesRepo(db);
    const q = qr.create({ client_id: client.id, issue_date: "2026-02-01", items: [{ description: "Design", quantity: 1000, unit_price_cents: 50000, vat_bp: 1900 }] });
    const inv = qr.toInvoice(q.id);
    expect(inv.number).toMatch(/2026-\d{4}/);
    expect(inv.client_id).toBe(client.id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/quotes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement quotes repo**

```ts
// src/db/repositories/quotes.ts
import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";
import { nextNumber, InvoicesRepo, Invoice } from "./invoices.js";
import { InvoiceItemInput } from "../../domain/invoice.js";

const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
export interface Quote { id: string; number: string; client_id: string; issue_date: string; status: string; currency: string; notes?: string; created_at: string; }
export interface CreateQuoteInput { client_id: string; issue_date: string; notes?: string; items: InvoiceItemInput[]; }

export class QuotesRepo {
  constructor(private db: Database.Database) {}
  create(input: CreateQuoteInput): Quote {
    const year = input.issue_date.slice(0, 4);
    const q: Quote = { id: newId(), number: nextNumber(this.db, "quote_number_sequence", `Q${year}`), client_id: input.client_id, issue_date: input.issue_date, status: "draft", currency: "EUR", notes: input.notes, created_at: new Date().toISOString() };
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO quotes (id,number,client_id,issue_date,status,currency,notes,created_at) VALUES (@id,@number,@client_id,@issue_date,@status,@currency,@notes,@created_at)").run({ notes: null, ...q });
      input.items.forEach((it, idx) => this.db.prepare("INSERT INTO quote_items (id,quote_id,description,quantity,unit_price_cents,vat_bp,position) VALUES (?,?,?,?,?,?,?)").run(newId(), q.id, it.description, it.quantity, it.unit_price_cents, it.vat_bp, idx));
    });
    tx();
    return q;
  }
  get(id: string): Quote & { items: InvoiceItemInput[] } {
    const q = this.db.prepare("SELECT * FROM quotes WHERE id=?").get(id) as Quote | undefined;
    if (!q) throw new AppError("NOT_FOUND", `quote not found: ${id}`, 1, { id });
    const items = this.db.prepare("SELECT description,quantity,unit_price_cents,vat_bp FROM quote_items WHERE quote_id=? ORDER BY position").all(id) as InvoiceItemInput[];
    return { ...q, items };
  }
  list(): Quote[] { return this.db.prepare("SELECT * FROM quotes ORDER BY number").all() as Quote[]; }
  setStatus(id: string, status: string): Quote {
    if (!QUOTE_STATUSES.includes(status as any)) throw new AppError("BAD_STATUS", `invalid status: ${status}`, 1);
    const r = this.db.prepare("UPDATE quotes SET status=? WHERE id=?").run(status, id);
    if (r.changes === 0) throw new AppError("NOT_FOUND", `quote not found: ${id}`, 1, { id });
    return this.get(id);
  }
  toInvoice(id: string): Invoice {
    const q = this.get(id);
    return new InvoicesRepo(this.db).create({ client_id: q.client_id, issue_date: new Date().toISOString().slice(0, 10), items: q.items });
  }
}
```

- [ ] **Step 4: Implement quotes command, wire into cli.ts**

```ts
// src/commands/quotes.ts
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { loadContext } from "../context.js";
import { QuotesRepo } from "../db/repositories/quotes.js";
import { emit } from "../output/render.js";
import { fail } from "../output/errors.js";

export function registerQuotes(program: Command): void {
  const g = program.command("quotes").description("manage quotes");
  g.command("create").requiredOption("--from <file>").action((o) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).create(JSON.parse(readFileSync(o.from, "utf8"))), ctx); } catch (e) { fail(e); } });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).get(id), ctx); } catch (e) { fail(e); } });
  g.command("accept <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).setStatus(id, "accepted"), ctx); } catch (e) { fail(e); } });
  g.command("to-invoice <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new QuotesRepo(ctx.db).toInvoice(id), ctx); } catch (e) { fail(e); } });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/quotes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests/quotes.test.ts
git commit -m "feat: quotes with conversion to invoice"
```

---

## Task 8: Expenses

**Files:**
- Create: `src/db/repositories/expenses.ts`, `src/commands/expenses.ts`
- Modify: `src/cli.ts`
- Test: `tests/expenses.test.ts`

**Interfaces:**
- Produces: `ExpensesRepo` with `add`, `list`, `get`, `edit`, `remove`, `attach(id, srcPath, dataDir): Expense`.

- [ ] **Step 1: Write failing test**

```ts
// tests/expenses.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { openDb } from "../src/db/index.js";
import { ExpensesRepo } from "../src/db/repositories/expenses.js";

describe("expenses", () => {
  it("adds expense and attaches receipt", () => {
    const dir = mkdtempSync(join(tmpdir(), "fb-"));
    const db = openDb(dir);
    const repo = new ExpensesRepo(db);
    const e = repo.add({ date: "2026-03-01", supplier: "AWS", net_cents: 5000, vat_bp: 1900, category: "hosting" });
    const src = join(dir, "receipt.txt");
    writeFileSync(src, "receipt");
    const updated = repo.attach(e.id, src, dir);
    expect(updated.receipt_path).toBeTruthy();
    expect(existsSync(updated.receipt_path!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/expenses.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement expenses repo**

```ts
// src/db/repositories/expenses.ts
import type Database from "better-sqlite3";
import { copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface Expense { id: string; date: string; supplier?: string; description?: string; net_cents: number; vat_bp: number; category?: string; receipt_path?: string; created_at: string; }

export class ExpensesRepo {
  constructor(private db: Database.Database) {}
  add(input: Omit<Partial<Expense>, "id" | "created_at"> & { date: string; net_cents: number; vat_bp: number }): Expense {
    const e: Expense = { id: newId(), created_at: new Date().toISOString(), ...input };
    this.db.prepare("INSERT INTO expenses (id,date,supplier,description,net_cents,vat_bp,category,receipt_path,created_at) VALUES (@id,@date,@supplier,@description,@net_cents,@vat_bp,@category,@receipt_path,@created_at)")
      .run({ supplier: null, description: null, category: null, receipt_path: null, ...e });
    return e;
  }
  get(id: string): Expense {
    const row = this.db.prepare("SELECT * FROM expenses WHERE id=?").get(id) as Expense | undefined;
    if (!row) throw new AppError("NOT_FOUND", `expense not found: ${id}`, 1, { id });
    return row;
  }
  list(): Expense[] { return this.db.prepare("SELECT * FROM expenses ORDER BY date").all() as Expense[]; }
  edit(id: string, patch: Partial<Expense>): Expense {
    const next = { ...this.get(id), ...patch };
    this.db.prepare("UPDATE expenses SET date=@date,supplier=@supplier,description=@description,net_cents=@net_cents,vat_bp=@vat_bp,category=@category,receipt_path=@receipt_path WHERE id=@id").run(next);
    return next;
  }
  remove(id: string): void { const r = this.db.prepare("DELETE FROM expenses WHERE id=?").run(id); if (r.changes === 0) throw new AppError("NOT_FOUND", `expense not found: ${id}`, 1, { id }); }
  attach(id: string, srcPath: string, dataDir: string): Expense {
    const dest = join(dataDir, "files", `${id}-${basename(srcPath)}`);
    copyFileSync(srcPath, dest);
    return this.edit(id, { receipt_path: dest });
  }
}
```

- [ ] **Step 4: Implement expenses command, wire into cli.ts**

```ts
// src/commands/expenses.ts
import { Command } from "commander";
import { loadContext } from "../context.js";
import { ExpensesRepo } from "../db/repositories/expenses.js";
import { parseEuroToCents } from "../domain/money.js";
import { emit } from "../output/render.js";
import { fail } from "../output/errors.js";

export function registerExpenses(program: Command): void {
  const g = program.command("expenses").description("manage expenses");
  g.command("add").requiredOption("--date <d>").requiredOption("--net <amount>").option("--vat <bp>", "VAT basis points", "1900").option("--supplier <s>").option("--description <d>").option("--category <c>")
    .action((o) => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).add({ date: o.date, net_cents: parseEuroToCents(o.net), vat_bp: parseInt(o.vat, 10), supplier: o.supplier, description: o.description, category: o.category }), ctx); } catch (e) { fail(e); } });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).get(id), ctx); } catch (e) { fail(e); } });
  g.command("rm <id>").action((id) => { try { const ctx = loadContext(program.opts()); new ExpensesRepo(ctx.db).remove(id); emit({ ok: true }, ctx); } catch (e) { fail(e); } });
  g.command("attach <id> <file>").action((id, file) => { try { const ctx = loadContext(program.opts()); emit(new ExpensesRepo(ctx.db).attach(id, file, ctx.dataDir), ctx); } catch (e) { fail(e); } });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/expenses.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src tests/expenses.test.ts
git commit -m "feat: expenses with receipt attachment"
```

---

## Task 9: Transactions repository and import batches

**Files:**
- Create: `src/db/repositories/transactions.ts`
- Test: `tests/transactions.test.ts`

**Interfaces:**
- Produces: `TransactionsRepo` with `insertBatch(source, filename, rows): { batch_id, count }`, `list(filter?)`, `get(id)`, `setCategory(id, category)`, `setStatus(id, status)`, `link(txId, targetType, targetId)`; type `ParsedTx`.

- [ ] **Step 1: Write failing test**

```ts
// tests/transactions.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.js";
import { TransactionsRepo } from "../src/db/repositories/transactions.js";

describe("transactions", () => {
  it("inserts a batch and lists unclassified", () => {
    const db = openDb(mkdtempSync(join(tmpdir(), "fb-")));
    const repo = new TransactionsRepo(db);
    const r = repo.insertBatch("csv", "feb.csv", [
      { booking_date: "2026-02-01", amount_cents: -5000, counterparty: "AWS", reference: "invoice", raw: {} },
      { booking_date: "2026-02-02", amount_cents: 120000, counterparty: "ACME", reference: "2026-0001", raw: {} },
    ]);
    expect(r.count).toBe(2);
    expect(repo.list({ status: "unclassified" })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/transactions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement transactions repo**

```ts
// src/db/repositories/transactions.ts
import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface ParsedTx { booking_date: string; value_date?: string; amount_cents: number; currency?: string; counterparty?: string; reference?: string; raw?: unknown; }
export interface Transaction extends ParsedTx { id: string; status: string; category?: string; import_batch_id: string; created_at: string; }

export class TransactionsRepo {
  constructor(private db: Database.Database) {}
  insertBatch(source: string, filename: string, rows: ParsedTx[]): { batch_id: string; count: number } {
    const batch_id = newId();
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare("INSERT INTO import_batches (id,source,filename,imported_at,row_count) VALUES (?,?,?,?,?)").run(batch_id, source, filename, now, rows.length);
      for (const row of rows) {
        this.db.prepare("INSERT INTO transactions (id,booking_date,value_date,amount_cents,currency,counterparty,reference,raw,import_batch_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(newId(), row.booking_date, row.value_date ?? null, row.amount_cents, row.currency ?? "EUR", row.counterparty ?? null, row.reference ?? null, JSON.stringify(row.raw ?? {}), batch_id, "unclassified", now);
      }
    });
    tx();
    return { batch_id, count: rows.length };
  }
  list(filter?: { status?: string }): Transaction[] {
    if (filter?.status) return this.db.prepare("SELECT * FROM transactions WHERE status=? ORDER BY booking_date").all(filter.status) as Transaction[];
    return this.db.prepare("SELECT * FROM transactions ORDER BY booking_date").all() as Transaction[];
  }
  get(id: string): Transaction { const r = this.db.prepare("SELECT * FROM transactions WHERE id=?").get(id) as Transaction | undefined; if (!r) throw new AppError("NOT_FOUND", `transaction not found: ${id}`, 1, { id }); return r; }
  setCategory(id: string, category: string): Transaction {
    const t = this.get(id);
    if (t.status === "classified") throw new AppError("ALREADY_CLASSIFIED", `transaction already classified: ${id}`, 1, { id });
    this.db.prepare("UPDATE transactions SET category=?, status='classified' WHERE id=?").run(category, id);
    return this.get(id);
  }
  setStatus(id: string, status: string): Transaction { const r = this.db.prepare("UPDATE transactions SET status=? WHERE id=?").run(status, id); if (r.changes === 0) throw new AppError("NOT_FOUND", `transaction not found: ${id}`, 1, { id }); return this.get(id); }
  link(txId: string, targetType: "invoice" | "expense", targetId: string): Transaction {
    this.get(txId);
    this.db.prepare("INSERT INTO tx_links (id,transaction_id,target_type,target_id) VALUES (?,?,?,?)").run(newId(), txId, targetType, targetId);
    this.db.prepare("UPDATE transactions SET status='classified' WHERE id=?").run(txId);
    return this.get(txId);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/transactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/transactions.ts tests/transactions.test.ts
git commit -m "feat: transactions repository with batches and linking"
```

---

## Task 10: Bank importers (CSV and CAMT.053)

**Files:**
- Create: `src/importers/csv.ts`, `src/importers/camt.ts`
- Test: `tests/importers.test.ts`, `tests/fixtures/sample.csv`, `tests/fixtures/sample.camt.xml`

**Interfaces:**
- Consumes: `parseEuroToCents` (Task 2), `ParsedTx` (Task 9).
- Produces: `parseCsv(text, mapping): ParsedTx[]`; `parseCamt(xml): ParsedTx[]`; type `CsvMapping = { date: string; amount: string; counterparty?: string; reference?: string; delimiter?: string }`.

- [ ] **Step 1: Write failing test (includes Review Focus: german amounts, empty/malformed CSV)**

```ts
// tests/importers.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../src/importers/csv.js";
import { parseCamt } from "../src/importers/camt.js";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures", n), "utf8");

describe("importers", () => {
  it("parses german csv amounts and columns", () => {
    const rows = parseCsv(fx("sample.csv"), { date: "Buchungstag", amount: "Betrag", counterparty: "Beguenstigter", reference: "Verwendungszweck", delimiter: ";" });
    expect(rows).toHaveLength(2);
    expect(rows[0].amount_cents).toBe(-5000);
    expect(rows[1].amount_cents).toBe(123456);
  });
  it("rejects a csv missing the mapped amount column", () => {
    expect(() => parseCsv("Buchungstag;Beguenstigter\n2026-02-01;AWS", { date: "Buchungstag", amount: "Betrag", delimiter: ";" })).toThrowError(/BAD_INPUT|BAD_AMOUNT/);
  });
  it("rejects an empty csv", () => {
    expect(() => parseCsv("", { date: "Buchungstag", amount: "Betrag" })).toThrowError(/BAD_INPUT/);
  });
  it("parses camt.053 entries", () => {
    const rows = parseCamt(fx("sample.camt.xml"));
    expect(rows.length).toBeGreaterThan(0);
    expect(typeof rows[0].amount_cents).toBe("number");
  });
});
```

- [ ] **Step 2: Create fixtures**

```
# tests/fixtures/sample.csv
Buchungstag;Betrag;Beguenstigter;Verwendungszweck
2026-02-01;-50,00;AWS;Hosting Februar
2026-02-02;1.234,56;ACME GmbH;Rechnung 2026-0001
```

```xml
<!-- tests/fixtures/sample.camt.xml -->
<Document><BkToCstmrStmt><Stmt>
  <Ntry><Amt Ccy="EUR">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-02-01</Dt></BookgDt>
    <NtryDtls><TxDtls><RmtInf><Ustrd>Hosting</Ustrd></RmtInf><RltdPties><Cdtr><Nm>AWS</Nm></Cdtr></RltdPties></TxDtls></NtryDtls></Ntry>
  <Ntry><Amt Ccy="EUR">1234.56</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-02-02</Dt></BookgDt>
    <NtryDtls><TxDtls><RmtInf><Ustrd>Rechnung 2026-0001</Ustrd></RmtInf><RltdPties><Dbtr><Nm>ACME GmbH</Nm></Dbtr></RltdPties></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/importers.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement csv.ts**

```ts
// src/importers/csv.ts
import { parseEuroToCents } from "../domain/money.js";
import { AppError } from "../output/errors.js";
import type { ParsedTx } from "../db/repositories/transactions.js";

export interface CsvMapping { date: string; amount: string; counterparty?: string; reference?: string; delimiter?: string; }

export function parseCsv(text: string, mapping: CsvMapping): ParsedTx[] {
  const delim = mapping.delimiter ?? ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new AppError("BAD_INPUT", "csv has no data rows", 1);
  const header = lines[0].split(delim).map((h) => h.trim());
  const idx = (name: string) => { const i = header.indexOf(name); if (i < 0) throw new AppError("BAD_INPUT", `missing column: ${name}`, 1, { header }); return i; };
  const di = idx(mapping.date), ai = idx(mapping.amount);
  const ci = mapping.counterparty ? header.indexOf(mapping.counterparty) : -1;
  const ri = mapping.reference ? header.indexOf(mapping.reference) : -1;
  return lines.slice(1).map((line) => {
    const cols = line.split(delim);
    return { booking_date: cols[di].trim(), amount_cents: parseEuroToCents(cols[ai]), counterparty: ci >= 0 ? cols[ci]?.trim() : undefined, reference: ri >= 0 ? cols[ri]?.trim() : undefined, raw: Object.fromEntries(header.map((h, i) => [h, cols[i]])) };
  });
}
```

- [ ] **Step 5: Implement camt.ts**

```ts
// src/importers/camt.ts
import { XMLParser } from "fast-xml-parser";
import { parseEuroToCents } from "../domain/money.js";
import { AppError } from "../output/errors.js";
import type { ParsedTx } from "../db/repositories/transactions.js";

export function parseCamt(xml: string): ParsedTx[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const stmt = doc?.Document?.BkToCstmrStmt?.Stmt;
  if (!stmt) throw new AppError("BAD_INPUT", "not a CAMT.053 document", 1);
  const entries = Array.isArray(stmt.Ntry) ? stmt.Ntry : stmt.Ntry ? [stmt.Ntry] : [];
  return entries.map((e: any) => {
    const amtStr = String(e.Amt?.["#text"] ?? e.Amt).replace(".", ",");
    let cents = parseEuroToCents(amtStr);
    if (e.CdtDbtInd === "DBIT") cents = -cents;
    const td = e.NtryDtls?.TxDtls ?? {};
    const nm = td.RltdPties?.Cdtr?.Nm ?? td.RltdPties?.Dbtr?.Nm;
    return { booking_date: e.BookgDt?.Dt, amount_cents: cents, counterparty: nm, reference: td.RmtInf?.Ustrd, currency: e.Amt?.["@_Ccy"] ?? "EUR", raw: e };
  });
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run tests/importers.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/importers tests/importers.test.ts tests/fixtures
git commit -m "feat: CSV and CAMT.053 bank importers"
```

---

## Task 11: Classification rule engine

**Files:**
- Create: `src/domain/classify.ts`
- Test: `tests/classify.test.ts`

**Interfaces:**
- Consumes: `Transaction` (Task 9).
- Produces: `type Rule = { match: { counterparty?: string; reference?: string; amountMin?: number; amountMax?: number }; category: string }`; `classifyOne(tx, rules): string | null`.

- [ ] **Step 1: Write failing test**

```ts
// tests/classify.test.ts
import { describe, it, expect } from "vitest";
import { classifyOne, Rule } from "../src/domain/classify.js";

const rules: Rule[] = [
  { match: { counterparty: "AWS" }, category: "hosting" },
  { match: { reference: "Rechnung" }, category: "revenue" },
  { match: { amountMin: -1000, amountMax: -1 }, category: "small-expense" },
];

describe("classify", () => {
  it("matches by counterparty substring (case-insensitive)", () => {
    expect(classifyOne({ counterparty: "AWS EMEA", reference: "", amount_cents: -5000 } as any, rules)).toBe("hosting");
  });
  it("matches by reference", () => {
    expect(classifyOne({ counterparty: "ACME", reference: "Rechnung 2026-0001", amount_cents: 120000 } as any, rules)).toBe("revenue");
  });
  it("returns null when nothing matches", () => {
    expect(classifyOne({ counterparty: "X", reference: "Y", amount_cents: -99999 } as any, rules)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/classify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement classify.ts**

```ts
// src/domain/classify.ts
import type { Transaction } from "../db/repositories/transactions.js";

export interface Rule {
  match: { counterparty?: string; reference?: string; amountMin?: number; amountMax?: number };
  category: string;
}

export function classifyOne(tx: Pick<Transaction, "counterparty" | "reference" | "amount_cents">, rules: Rule[]): string | null {
  for (const r of rules) {
    const m = r.match;
    if (m.counterparty && !(tx.counterparty ?? "").toLowerCase().includes(m.counterparty.toLowerCase())) continue;
    if (m.reference && !(tx.reference ?? "").toLowerCase().includes(m.reference.toLowerCase())) continue;
    if (m.amountMin !== undefined && tx.amount_cents < m.amountMin) continue;
    if (m.amountMax !== undefined && tx.amount_cents > m.amountMax) continue;
    return r.category;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/classify.ts tests/classify.test.ts
git commit -m "feat: transaction classification rule engine"
```

---

## Task 12: tx command (import, list, classify, link, auto-classify) + CLI integration

**Files:**
- Create: `src/commands/tx.ts`
- Modify: `src/cli.ts`
- Test: `tests/tx.cli.test.ts`

**Interfaces:**
- Consumes: `parseCsv`, `parseCamt`, `TransactionsRepo`, `classifyOne`.
- Produces: the `tx` command group. `auto-classify` applies rules; with `--use-claude` it emits unmatched transactions as JSON for an agent to classify via follow-up `classify`/`link` calls (freebies makes no network call).

- [ ] **Step 1: Write failing CLI integration test (includes Review Focus: classifying nonexistent tx)**

```ts
// tests/tx.cli.test.ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/tx.cli.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement tx command**

```ts
// src/commands/tx.ts
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { loadContext } from "../context.js";
import { TransactionsRepo } from "../db/repositories/transactions.js";
import { parseCsv } from "../importers/csv.js";
import { parseCamt } from "../importers/camt.js";
import { classifyOne, Rule } from "../domain/classify.js";
import { emit } from "../output/render.js";
import { AppError, fail } from "../output/errors.js";
import { basename } from "node:path";

export function registerTx(program: Command): void {
  const g = program.command("tx").description("bank transactions");
  g.command("import").requiredOption("--file <path>").option("--format <fmt>", "csv|camt", "csv").option("--map <file>", "csv column mapping")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        const text = readFileSync(o.file, "utf8");
        let rows;
        if (o.format === "camt") rows = parseCamt(text);
        else { if (!o.map) throw new AppError("BAD_INPUT", "csv import requires --map", 1); rows = parseCsv(text, JSON.parse(readFileSync(o.map, "utf8"))); }
        emit(new TransactionsRepo(ctx.db).insertBatch(o.format, basename(o.file), rows), ctx);
      } catch (e) { fail(e); }
    });
  g.command("list").option("--status <s>").action((o) => { try { const ctx = loadContext(program.opts()); emit(new TransactionsRepo(ctx.db).list(o.status ? { status: o.status } : undefined), ctx); } catch (e) { fail(e); } });
  g.command("classify <id>").requiredOption("--category <c>").action((id, o) => { try { const ctx = loadContext(program.opts()); emit(new TransactionsRepo(ctx.db).setCategory(id, o.category), ctx); } catch (e) { fail(e); } });
  g.command("link <id>").option("--invoice <iid>").option("--expense <eid>").action((id, o) => { try { const ctx = loadContext(program.opts()); const repo = new TransactionsRepo(ctx.db); if (o.invoice) emit(repo.link(id, "invoice", o.invoice), ctx); else if (o.expense) emit(repo.link(id, "expense", o.expense), ctx); else throw new AppError("BAD_INPUT", "provide --invoice or --expense", 1); } catch (e) { fail(e); } });
  g.command("auto-classify").option("--rules <file>").option("--use-claude")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        const repo = new TransactionsRepo(ctx.db);
        const rules: Rule[] = o.rules ? JSON.parse(readFileSync(o.rules, "utf8")) : [];
        const unclassified = repo.list({ status: "unclassified" });
        const applied: string[] = [], unmatched: unknown[] = [];
        for (const t of unclassified) {
          const cat = classifyOne(t, rules);
          if (cat) { repo.setCategory(t.id, cat); applied.push(t.id); }
          else unmatched.push({ id: t.id, counterparty: t.counterparty, reference: t.reference, amount_cents: t.amount_cents });
        }
        emit({ applied: applied.length, unmatched: o.useClaude ? unmatched : unmatched.length }, ctx);
      } catch (e) { fail(e); }
    });
}
```

- [ ] **Step 4: Add `init` command and wire all commands in cli.ts**

```ts
// in src/cli.ts, after creating program and before parseAsync:
import { registerClients } from "./commands/clients.js";
import { registerInvoices } from "./commands/invoices.js";
import { registerQuotes } from "./commands/quotes.js";
import { registerExpenses } from "./commands/expenses.js";
import { registerTx } from "./commands/tx.js";
import { loadContext } from "./context.js";
import { emit } from "./output/render.js";
import { fail } from "./output/errors.js";

program.command("init").description("create data dir and database")
  .action(() => { try { const ctx = loadContext(program.opts()); emit({ ok: true, dataDir: ctx.dataDir }, ctx); } catch (e) { fail(e); } });

registerClients(program);
registerInvoices(program);
registerQuotes(program);
registerExpenses(program);
registerTx(program);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/tx.cli.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests/tx.cli.test.ts
git commit -m "feat: tx command group and CLI integration"
```

---

## Task 13: README usage and Claude-adapter notes

**Files:**
- Modify: `README.md`
- Create: `docs/claude-adapter.md`

- [ ] **Step 1: Document install, every command with a JSON example, and the exit-code contract in README.md.** Include a worked flow: `init`, `clients add`, `invoices create --from inv.json`, `invoices pdf`, `expenses add`, `tx import`, `tx auto-classify`.

- [ ] **Step 2: Write docs/claude-adapter.md** explaining that Claude drives freebies via Bash, always passing `--json`, reading stdout JSON, and checking exit codes; show the `auto-classify --use-claude` loop where Claude reads unmatched transactions and calls `classify`/`link`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/claude-adapter.md
git commit -m "docs: usage and Claude adapter contract"
```

---

## Self-Review

**Spec coverage:** clients (T4), invoices + numbering + status + PDF (T5, T6), quotes + convert (T7), expenses + receipts (T8), bank import CSV + CAMT (T9, T10), classification rules + Claude hook (T11, T12), local SQLite storage (T3), money as cents + VAT bp (T2), JSON/exit-code adapter contract (T1, enforced in T12 CLI tests). All Milestone 1 success criteria map to tasks. Tax calc, ELSTER, e-invoice XML correctly deferred to later milestones per spec.

**Placeholder scan:** No TBD/TODO. Every code step has real code; every run step has a command and expected result. README task describes concrete content rather than inlining the full prose, which is acceptable for a docs task.

**Type consistency:** `ParsedTx` defined in T9, consumed in T10/T12. `Rule` defined in T11, consumed in T12. `InvoiceItemInput` defined in T5, reused in T6/T7/T10-fixtures. `nextNumber(db, metaKey, year)` defined in T5, reused in T7. `loadContext`/`emit`/`fail`/`AppError` defined T1/T4, used throughout. `setCategory` guards already-classified; `link` and `classify` share the classified status.

**Review Focus:** all five lines have owning tasks with tests — odd-cent VAT (T2), empty/malformed CSV (T10), German decimal commas (T2/T10), gapless numbering after void (T5), classifying nonexistent/already-classified tx (T12/T9).
