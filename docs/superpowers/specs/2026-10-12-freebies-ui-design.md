# freebies UI: Design

Date: 2026-10-12. Status: approved in chat (user asked to open the dev server).

## Goal
A local web app over the freebies data: a Claude-powered agent as the home screen, plus tabs for invoices, customers, expenses, bank transactions, and business settings. Single user, runs on 127.0.0.1 only.

## Decisions (from the user)
- Uploads: bank statements (CSV, CAMT.053) and receipts (PDF, images).
- Agent writes require confirmation in the UI.
- Stack: Vite + React SPA, Hono server, same SQLite DB as the CLI.
- Look: duotone cobalt `#0B3986` and cream `#F4EBD8`, EB Garamond serif, uppercase tracked section labels with a hairline rule, paper grain, an original engraved-hills SVG. Minimal copy. Smooth spring motion.

## Architecture
- `server/` Hono app on `127.0.0.1:4317`. REST over the existing repositories, multipart uploads, SSE chat stream, action confirm/reject.
- `web/` React SPA. Vite dev server on 5173 proxies `/api` to 4317. Production: the Hono server serves `web/dist`.
- `bin/freebies-ro`: read-only CLI wrapper (list/get only, no `--data-dir`).
- `.claude/skills/freebies/SKILL.md`: command reference, categories, proposal protocol for the agent.

## Agent
Each turn spawns:
```
claude -p --output-format stream-json --include-partial-messages --verbose
  --setting-sources project --strict-mcp-config --tools Bash,Read,Glob
  --allowedTools "Bash(freebies-ro:*)" Read Glob --permission-mode default
  --add-dir <dataDir>/uploads --append-system-prompt <protocol> [--resume <id>]
```
cwd is the repo, `PATH` gets `bin/`, `FREEBIES_DATA_DIR` is set. Verified by a live probe: only Bash/Read/Glob exist, no MCP, reads work, other commands are denied.

Writes: Claude emits fenced `freebies-action` JSON blocks. The server validates each with zod, stores it as a pending action, and streams a `proposal` event. The UI renders a confirm card. On confirm the server executes the write through the repositories. Resolutions are prepended to the next user turn so Claude stays informed. Claude never holds write access.

Action kinds: `client.create`, `client.update`, `invoice.create`, `invoice.status`, `expense.create` (optional `upload_id` attaches the receipt), `tx.import` (`upload_id`, `format`, `mapping`), `tx.classify`, `tx.link`.

## Data
Migration 003 adds `chat_sessions` (claude session id), `chat_messages`, `agent_actions` (kind, payload, summary, status, result), `uploads` (stored under `<dataDir>/uploads/`).

## Testing
Unit tests for the read-only policy, proposal parsing and visible-text stripping, stream-json mapping (real recorded fixture), action execution, and Hono routes via `app.request`. The Claude process is replaced by a fake binary in route tests. A browser smoke check verifies the running UI.
