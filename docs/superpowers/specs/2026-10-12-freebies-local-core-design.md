# freebies — Local Core Design

Date: 2026-10-12
Status: Draft for review

## Purpose

freebies is an open-source, local-first replacement for the paid freelancer
tax app Accountable, aimed at German sole traders and freelancers. The goal is
that a user runs their invoicing, expense tracking, and bookkeeping entirely on
their own machine, with no subscription and no third-party account.

This document specifies **Milestone 1: Local Core** only. Tax calculation
(UStVA, EÜR, income tax, trade tax) and ELSTER filing are later milestones with
their own specs.

### Who it is for

The author first (a German freelancer), then other German freelancers via open
source. Users are comfortable in a terminal.

### Success criteria for Milestone 1

A user can, entirely offline:

1. Create and manage clients.
2. Create invoices and quotes, and generate a PDF for each.
3. Record expenses with a receipt file attached.
4. Import a bank-account export, turn each line into a transaction, and
   classify transactions (match to an invoice or expense, or assign a
   category).
5. Do all of the above both by hand and by driving the CLI from Claude Code,
   because every command emits stable JSON.

Explicitly out of scope for Milestone 1: tax calculation, tax filing, ELSTER,
e-invoice XML (XRechnung/ZUGFeRD), multi-user, cloud sync, banking/payments.

## Design principles

- **Local-first.** All data lives on the user's machine. No network calls in
  the core. (A later optional classify step may call Claude; it is opt-in and
  the only exception.)
- **Claude-drivable.** The CLI is the product's adapter. Every command accepts
  `--json` and prints a single JSON document to stdout; errors print a JSON
  object to stderr and set a nonzero exit code. `--help` output is stable and
  parseable so an agent can discover commands.
- **Money is exact.** All monetary amounts are stored and computed as integer
  minor units (euro cents). No floating point for money, ever. VAT rates are
  stored as basis points (e.g. 19% = 1900).
- **Deterministic core.** Domain logic is pure and unit-tested. I/O (DB, files,
  PDF, stdout) sits at the edges.

## Architecture

TypeScript on Node 22, ES modules, built with `tsc`. Single published binary
`freebies`.

```
freebies/
  src/
    cli.ts              # entry; wires commander, global flags (--json, --pretty)
    commands/           # one file per command group
      clients.ts
      invoices.ts
      quotes.ts
      expenses.ts
      tx.ts             # bank import + classification
    domain/             # pure logic, no I/O
      money.ts          # cents arithmetic, formatting, VAT
      invoice.ts        # totals, numbering, status transitions
      classify.ts       # rule engine (pure); Claude hook lives in commands/tx
    db/
      index.ts          # better-sqlite3 handle, path resolution
      migrations/       # numbered .sql files, applied in order
      repositories/     # typed CRUD per table
    importers/
      csv.ts            # generic CSV with a column mapping
      camt.ts           # CAMT.053 ISO 20022 XML
    pdf/
      invoice.ts        # invoice/quote -> PDF
    output/
      render.ts         # json | pretty table rendering
      errors.ts         # typed errors -> JSON + exit codes
  tests/
  docs/
```

### Dependencies (minimal)

- `commander` — CLI parsing.
- `better-sqlite3` — synchronous embedded SQLite; simplest correct model for a
  local single-user CLI.
- `zod` — validate command input and parsed import rows.
- A PDF library (candidate: `pdfkit`); chosen at implementation time. PDF
  generation is isolated behind `pdf/invoice.ts` so the choice is swappable.
- `fast-xml-parser` — CAMT.053 parsing.

No ORM. Repositories wrap hand-written SQL against a small schema.

## Data model

SQLite database at `$XDG_DATA_HOME/freebies/freebies.db` (fallback
`~/.local/share/freebies/freebies.db`). Attached files (receipts, generated
PDFs) under `.../freebies/files/`. Path overridable with `FREEBIES_DATA_DIR`.

Tables (all amounts integer cents; all ids are text UUIDv4; timestamps ISO 8601
text):

- **clients** — id, name, address, country, vat_id, email, created_at.
- **invoices** — id, number, client_id, issue_date, due_date, status
  (`draft|sent|paid|void`), currency (default EUR), notes, created_at.
- **invoice_items** — id, invoice_id, description, quantity (integer, thousandths
  to allow fractional), unit_price_cents, vat_bp, position.
- **quotes** / **quote_items** — same shape as invoices; status
  (`draft|sent|accepted|declined|expired`). A quote can be converted to an
  invoice.
- **expenses** — id, date, supplier, description, net_cents, vat_bp, category,
  receipt_path, created_at.
- **transactions** — id, booking_date, value_date, amount_cents (signed;
  negative = outflow), currency, counterparty, reference, raw (original row as
  JSON), import_batch_id, status (`unclassified|classified|ignored`),
  created_at.
- **tx_links** — id, transaction_id, target_type (`invoice|expense`),
  target_id. Links a bank line to the invoice it pays or expense it covers.
- **import_batches** — id, source (`csv|camt`), filename, imported_at, row_count.
- **meta** — key/value, including `invoice_number_sequence` and schema version.

Invoice numbering: a configurable format (default `YYYY-NNNN`) backed by a
monotonic counter in `meta`, so numbers are gapless and never reused.

## Command surface (Milestone 1)

Global flags: `--json` (default on when stdout is not a TTY), `--pretty`,
`--data-dir`.

```
freebies init                         # create data dir + db, run migrations

freebies clients add|list|get|edit|rm

freebies invoices create              # flags or --from <json file>
freebies invoices list|get|edit
freebies invoices status <id> <status>
freebies invoices pdf <id> [--out path]

freebies quotes create|list|get|edit
freebies quotes accept <id>
freebies quotes to-invoice <id>

freebies expenses add|list|get|edit|rm
freebies expenses attach <id> <file>  # copy receipt into files/

freebies tx import --file <path> [--format csv|camt] [--map <mapping.json>]
freebies tx list [--status unclassified]
freebies tx classify <id> --category <c>
freebies tx link <tx-id> --invoice <id> | --expense <id>
freebies tx auto-classify [--rules <file>] [--use-claude]
```

### Bank import

- **Generic CSV** is the default path and works for any bank. The user supplies
  a column mapping (which columns are date, amount, counterparty, reference) via
  `--map mapping.json`, or interactively on first import of a given filename
  shape. Mappings are remembered per bank name in `meta`.
- **CAMT.053** (ISO 20022 XML) is supported directly since it is a standard many
  German banks export; no mapping needed.
- No named-bank presets in Milestone 1. The user did not specify a bank; generic
  CSV plus CAMT covers all of them. Presets can be added later as data, without
  code changes.

### Classification

- `classify` sets a category on one transaction by hand.
- `link` connects a transaction to the invoice it pays or the expense it covers.
- `auto-classify` runs a deterministic **rule engine**: ordered rules match on
  counterparty / reference / amount and set a category or link. Rules live in a
  JSON file the user controls.
- `auto-classify --use-claude` is opt-in. For transactions no rule matched,
  freebies prints their details as JSON; when run by Claude Code, Claude reads
  that JSON, decides categories, and calls `classify`/`link` back. freebies
  itself makes no network call. This is the only place the agent participates in
  the data flow, and it is never automatic.

## Error handling

All errors are typed and rendered by `output/errors.ts`:

- Exit 0: success.
- Exit 1: user error (bad input, not found, validation) — JSON on stderr with
  `{ "error": { "code", "message", "details" } }`.
- Exit 2: internal error.

Validation uses zod at the command boundary; a failed parse is a user error.

## Testing

Test-driven. Layers:

1. **Domain unit tests** (money, invoice totals, numbering, rule engine) — pure,
   exhaustive, including VAT rounding and signed-amount edge cases.
2. **Importer tests** — fixture CSV and CAMT.053 files in `tests/fixtures/`,
   asserting parsed transactions. Fixtures are synthetic, not real bank data.
3. **DB/repository tests** — against a temp SQLite file, migrations applied.
4. **CLI integration tests** — run commands against a temp `--data-dir`, assert
   JSON output and exit codes. This also guards the Claude-adapter contract.

PDF output is smoke-tested (file is produced, nonzero size, valid header), not
pixel-compared.

## Open questions

1. **PDF library** — `pdfkit` vs an HTML-to-PDF approach. Decide at
   implementation; isolated behind `pdf/invoice.ts`.
2. **Invoice localization** — German invoice legal fields (Leistungsdatum,
   Kleinunternehmer §19 note, sequential numbering) must be present. Exact
   template wording to confirm during invoicing implementation.
3. **Bank preset** — add a tested preset once the user names their bank.

## Later milestones (not specified here)

- M2: Tax calculation (UStVA, EÜR, income tax, trade tax) from this data.
- M3: e-invoice formats (XRechnung, ZUGFeRD, PEPPOL).
- M4: ELSTER filing via ERiC (native binding, vendor registration, certificate).
