import { Box, Text, useInput } from "ink";
import { useMemo } from "react";
import type Database from "better-sqlite3";
import { BusinessRepo } from "../db/repositories/business.js";
import { InvoicesRepo } from "../db/repositories/invoices.js";
import { invoiceTotals } from "../domain/invoice.js";
import { grossCents } from "../domain/money.js";
import { formatEuro } from "../../shared/format.js";
import { Hints, Masthead, Sheet } from "./components.js";
import { FAINT, MUTED, PAPER, tracked } from "./theme.js";

export type HomeAction = "app" | "details" | "quit";

function useBooks(db: Database.Database) {
  return useMemo(() => {
    const invoices = new InvoicesRepo(db);
    const all = invoices.list().map((i) => {
      const full = invoices.get(i.id);
      const client = db.prepare("SELECT name FROM clients WHERE id=?").get(i.client_id) as { name: string } | undefined;
      return { ...i, client: client?.name ?? "", gross: invoiceTotals(full.items).grossCents };
    });
    const open = all.filter((i) => i.status === "draft" || i.status === "sent");
    const month = new Date().toISOString().slice(0, 7);
    const expenses = (db.prepare("SELECT net_cents, vat_bp FROM expenses WHERE substr(date,1,7)=?").all(month) as { net_cents: number; vat_bp: number }[])
      .reduce((s, e) => s + grossCents(e.net_cents, e.vat_bp), 0);
    const unsorted = (db.prepare("SELECT COUNT(*) n FROM transactions WHERE status='unclassified'").get() as { n: number }).n;
    return { open, openSum: open.reduce((s, i) => s + i.gross, 0), expenses, unsorted, recent: all.reverse().slice(0, 4) };
  }, [db]);
}

function Stat({ label, count, amount }: { label: string; count?: number; amount?: number }) {
  return (
    <Box>
      <Box width={30}><Text color={MUTED}>{label}</Text></Box>
      <Box width={8} justifyContent="flex-end"><Text color={PAPER}>{count ?? ""}</Text></Box>
      <Box width={18} justifyContent="flex-end"><Text color={PAPER}>{amount !== undefined ? formatEuro(amount) : ""}</Text></Box>
    </Box>
  );
}

export function Home({ db, onAction, animate = true }: { db: Database.Database; dataDir: string; onAction: (a: HomeAction) => void; animate?: boolean }) {
  const biz = new BusinessRepo(db).get();
  const books = useBooks(db);
  useInput((input, key) => {
    if (key.return || input === "o") onAction("app");
    else if (input === "d") onAction("details");
    else if (input === "q" || key.escape) onAction("quit");
  });
  return (
    <Sheet banner={7} animate={animate}>
      <Masthead right={<Text color={MUTED}>{biz.name ?? ""}</Text>} />
      <Box flexDirection="column" marginTop={1}>
        <Stat label="Open invoices" count={books.open.length} amount={books.openSum} />
        <Stat label="Unsorted bank transactions" count={books.unsorted} />
        <Stat label="Expenses this month" amount={books.expenses} />
      </Box>
      {books.recent.length > 0 && (
        <Box flexDirection="column" marginTop={2}>
          <Text color={MUTED}>{tracked("Recent invoices")}</Text>
          <Text color={FAINT}>{"─".repeat(56)}</Text>
          {books.recent.map((i) => (
            <Box key={i.id}>
              <Box width={12}><Text color={PAPER}>{i.number}</Text></Box>
              <Box width={26}><Text color={PAPER} wrap="truncate-end">{i.client}</Text></Box>
              <Box width={7}><Text color={i.status === "paid" ? PAPER : FAINT} italic>{i.status}</Text></Box>
              <Box width={11} justifyContent="flex-end"><Text color={PAPER}>{formatEuro(i.gross)}</Text></Box>
            </Box>
          ))}
        </Box>
      )}
      {books.recent.length === 0 && <Box marginTop={2}><Text color={MUTED} italic>No invoices yet. Open the app and ask the agent to write your first one.</Text></Box>}
      <Hints items={[["enter", "open the app"], ["d", "your details"], ["q", "quit"]]} />
    </Sheet>
  );
}
