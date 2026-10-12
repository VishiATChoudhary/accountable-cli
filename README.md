# freebies

Open-source, local-first bookkeeping for German freelancers. A CLI replacement for the paid Accountable app: create invoices and quotes, track expenses, and import and classify bank transactions, all on your own machine with no account and no subscription.

Tax calculation (UStVA, EÜR, income tax) and ELSTER filing are planned later milestones. See `docs/superpowers/specs/`.

## Why

Accountable's subscription mainly buys tax calculation and filing to the Finanzamt. Filing runs over ELSTER, which is free government infrastructure. freebies rebuilds the surrounding software so you keep your data and pay nothing.

## Install

```sh
git clone --recurse-submodules https://github.com/VishiATChoudhary/freebies.git
cd freebies
npm install
npm run build        # outputs dist/, installs the `freebies` bin
```

During development, run without building via `npm run dev -- <args>` or `npx tsx src/cli.ts <args>`.

## Data location

Everything is stored locally under `$XDG_DATA_HOME/freebies` (default `~/.local/share/freebies`): a SQLite database and a `files/` directory for receipts and generated PDFs. Override with `--data-dir <path>` or `FREEBIES_DATA_DIR`.

Money is stored as integer euro cents. VAT rates are basis points (19% = `1900`).

## Commands

Every command accepts `--json` (default when output is not a terminal) and prints one JSON document to stdout. Errors print `{"error":{"code","message","details"}}` to stderr. Exit codes: `0` success, `1` user error, `2` internal.

```sh
freebies init                                   # create data dir + database

freebies clients add --name "ACME GmbH" --vat-id DE123
freebies clients list | get <id> | rm <id>

freebies invoices create --from invoice.json    # see shape below
freebies invoices list | get <id>
freebies invoices status <id> paid              # draft|sent|paid|void
freebies invoices pdf <id> [--out path.pdf]

freebies quotes create --from quote.json
freebies quotes list | get <id> | accept <id>
freebies quotes to-invoice <id>

freebies expenses add --date 2026-03-01 --net 50,00 --vat 1900 --supplier AWS --category hosting
freebies expenses list | get <id> | rm <id>
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
