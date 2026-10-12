# accountable-cli

Open source CLI for [Accountable](https://www.accountable.de), the freelancer invoicing and tax-filing app (invoices, UStVA, EÜR, income tax).

Accountable has no public API. This project reverse engineers the web and mobile clients so freelancers can drive the same workflows from the terminal.

## Layout

- `rea/`: git submodule of [morluto/rea](https://github.com/morluto/rea), the agent-driven reverse engineering toolkit used to capture and analyze Accountable's client traffic.
- `docs/`: findings, API notes, design specs.

## Setup

```sh
git clone --recurse-submodules <this-repo>
cd accountable-cli
npx rea-agents setup
```

## Status

Scaffold only. See `docs/` for the design spec once written.
