# freebies

Open-source, local-first bookkeeping for German freelancers. A CLI replacement for the paid Accountable app: create invoices and quotes, track expenses, and import and classify bank transactions, all on your own machine with no account and no subscription.

Tax calculation (UStVA, EÜR, income tax) and ELSTER filing are planned later milestones. See `docs/superpowers/specs/`.

## Why

Accountable's subscription mainly buys tax calculation and filing to the Finanzamt. Filing runs over ELSTER, which is free government infrastructure. freebies rebuilds the surrounding software so you keep your data and pay nothing.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/VishiATChoudhary/freebies/main/install.sh | sh
```

or, with Node.js 22 or newer:

```sh
npm install -g https://github.com/VishiATChoudhary/freebies/releases/latest/download/freebies.tgz
```

Then run `freebies`. The first launch walks you through setting up the details that go on your invoices. After that, `freebies` opens a home screen with your open invoices and unsorted bank transactions, and `freebies app` opens the web app.

The agent needs [Claude Code](https://claude.com/claude-code) installed and logged in. Everything else works without it.

### From source

```sh
git clone --recurse-submodules https://github.com/VishiATChoudhary/freebies.git
cd freebies
npm install
npm run build        # bundles the CLI into dist/ and the web app into web/dist/
node dist/cli.js     # or: npx tsx src/cli.ts
```

## App

A local web app sits on the same data as the CLI.

```sh
npm run ui:dev     # development: http://127.0.0.1:5173 (API on 4317)
npm run ui         # build once and serve everything on http://127.0.0.1:4317
```

- **Agent.** Chat with Claude about your books. Drop a receipt (PDF or photo) or a bank statement (CSV or CAMT.053) into the chat. Claude reads it and proposes the change.
- **Nothing is written without you.** Every create or change appears as a card with Confirm and Cancel. Several changes at once collapse into one list with "Confirm all".
- **Tabs.** Invoices (open, change status, download PDF), Customers (add, edit), Expenses (receipt preview), Bank (transactions, one-click sorting), Settings (your details for invoices).

The agent runs the `claude` CLI you are already logged into. It is isolated: project settings only, no MCP servers, only Bash, Read and Glob, and Bash is limited to the read-only `bin/freebies-ro`. The server only listens on 127.0.0.1.

`scripts/seed-demo.sh /tmp/fb-demo` fills a throwaway folder with sample data. Run the app against it with `FREEBIES_DATA_DIR=/tmp/fb-demo npm run ui:dev`.

## Data location

Everything is stored locally under `$XDG_DATA_HOME/freebies` (default `~/.local/share/freebies`): a SQLite database and a `files/` directory for receipts and generated PDFs. Override with `--data-dir <path>` or `FREEBIES_DATA_DIR`.

Money is stored as integer euro cents. VAT rates are basis points (19% = `1900`).

## Commands

Every command accepts `--json` (default when output is not a terminal) and prints one JSON document to stdout. Errors print `{"error":{"code","message","details"}}` to stderr. Exit codes: `0` success, `1` user error, `2` internal.

```sh
freebies init                                   # create data dir + database

freebies business set --name "Max Mustermann" --address "Hauptstr 1, Berlin" --tax-number 12/345/67890 --kleinunternehmer true
freebies business get                           # your own identity, printed on invoices

freebies clients add --name "ACME GmbH" --vat-id DE123
freebies clients list | get <id> | edit <id> --address "Berlin" | rm <id>

freebies invoices create --from invoice.json    # see shape below
freebies invoices list | get <id>
freebies invoices edit <id> --notes "..." --due-date 2026-02-01
freebies invoices status <id> paid              # draft|sent|paid|void
freebies invoices pdf <id> [--out path.pdf]

freebies quotes create --from quote.json
freebies quotes list | get <id> | accept <id>
freebies quotes to-invoice <id>

freebies expenses add --date 2026-03-01 --net 50,00 --vat 1900 --supplier AWS --category hosting
freebies expenses list | get <id> | edit <id> --category hosting | rm <id>
freebies expenses attach <id> receipt.pdf

freebies tx import --file export.csv --format csv --map mapping.json
freebies tx import --file statement.xml --format camt
freebies tx list [--status unclassified]
freebies tx classify <id> --category hosting
freebies tx link <id> --invoice <iid> | --expense <eid>
freebies tx auto-classify --rules rules.json [--use-claude]
```

### invoice.json

```json
{
  "client_id": "<client id>",
  "issue_date": "2026-01-01",
  "due_date": "2026-01-15",
  "items": [
    { "description": "Consulting", "quantity": 1000, "unit_price_cents": 100000, "vat_bp": 1900 }
  ]
}
```

`quantity` is in thousandths, so `1000` means 1.0 units. `quote.json` has the same shape without `due_date`.

### Bank import mapping

CSV from any bank works with a column mapping:

```json
{ "date": "Buchungstag", "amount": "Betrag", "counterparty": "Beguenstigter", "reference": "Verwendungszweck", "delimiter": ";" }
```

German amounts like `1.234,56` are parsed correctly. CAMT.053 XML needs no mapping.

### Classification rules

```json
[
  { "match": { "counterparty": "AWS" }, "category": "hosting" },
  { "match": { "reference": "Rechnung" }, "category": "revenue" },
  { "match": { "amountMin": -1000, "amountMax": -1 }, "category": "small-expense" }
]
```

Rules run in order; the first match wins. See `docs/claude-adapter.md` for driving freebies from Claude Code.

## Layout

- `src/` CLI source (domain, db, commands, importers, pdf, output)
- `rea/` git submodule ([morluto/rea](https://github.com/morluto/rea)), used for reverse-engineering reference
- `docs/` specs, plans, and recon notes

## License

MIT.
