# Driving freebies from Claude Code

freebies is a plain CLI. Claude Code drives it through Bash. The contract that makes this reliable:

- Pass `--json` on every call. Output is a single JSON document on stdout.
- Check the exit code: `0` success, `1` user error, `2` internal error.
- On error, stderr holds `{"error":{"code","message","details"}}`. Branch on `code`, not on message text.
- Pass `--data-dir` to keep a run isolated (useful for tests and demos).

## Example: classify a bank export

1. Import the statement:

   ```sh
   freebies --json tx import --file export.csv --format csv --map mapping.json
   ```

2. Apply deterministic rules first, asking for the leftovers:

   ```sh
   freebies --json tx auto-classify --rules rules.json --use-claude
   ```

   With `--use-claude`, the `unmatched` field is the full list of transactions no rule matched, each with `id`, `counterparty`, `reference`, and `amount_cents`.

3. Claude reads that JSON, decides a category or a link for each, and calls back:

   ```sh
   freebies --json tx classify <id> --category <category>
   freebies --json tx link <id> --invoice <invoice-id>
   ```

freebies itself makes no network call. The agent participates only by reading the unmatched list and issuing follow-up `classify`/`link` commands. This is the one place the agent touches the data flow, and it is never automatic.
