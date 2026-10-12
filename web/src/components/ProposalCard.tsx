import { AnimatePresence, motion } from "motion/react";
import { Check, Download, X } from "lucide-react";
import { useState } from "react";
import type { AgentAction } from "../lib/api";
import { api } from "../lib/api";
import { formatEuro } from "../../../shared/format";
import { parseSummary } from "../../../shared/summary";

type Resolve = (id: string, how: "confirm" | "reject") => Promise<unknown>;
const spring = { type: "spring" as const, stiffness: 300, damping: 30 };

function outcome(a: AgentAction): string {
  if (a.status === "rejected") return "Cancelled";
  if (a.status === "failed") return a.result?.error ?? "Failed";
  switch (a.kind) {
    case "invoice.create": return `Created ${a.result?.number ?? ""}`;
    case "tx.import": return `${a.result?.count ?? 0} transactions imported`;
    case "invoice.status": return `Marked ${a.result?.status ?? ""}`;
    case "tx.link": return "Matched";
    default: return "Saved";
  }
}

function Result({ a }: { a: AgentAction }) {
  return (
    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`inline-flex items-center gap-3 ${a.status === "failed" ? "italic" : ""}`}>
      <span className="inline-flex items-center gap-2">{a.status === "confirmed" && <Check size={15} strokeWidth={1.6} />}{outcome(a)}</span>
      {a.status === "confirmed" && a.kind === "invoice.create" && a.result?.id && (
        <a href={api.invoicePdfUrl(a.result.id)} className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
          <Download size={15} strokeWidth={1.5} /> PDF
        </a>
      )}
    </motion.span>
  );
}

function Card({ action, onResolve }: { action: AgentAction; onResolve: Resolve }) {
  const [working, setWorking] = useState<"confirm" | "reject" | null>(null);
  const s = parseSummary(action.kind, action.summary);
  const items: any[] = action.kind === "invoice.create" ? action.payload?.items ?? [] : [];
  const done = action.status !== "pending";
  const go = async (how: "confirm" | "reject") => { setWorking(how); try { await onResolve(action.id, how); } finally { setWorking(null); } };
  return (
    <motion.div layout initial={{ opacity: 0, y: 6, scale: 0.985 }} animate={{ opacity: action.status === "rejected" ? 0.55 : 1, y: 0, scale: 1 }} transition={spring}
      className={`my-4 rounded-[4px] border bg-paper-lift px-5 py-4 transition-colors duration-500 ${done ? "border-ink/25" : "border-ink/70"}`}>
      <div className="sc ink-muted text-[0.95rem]">{s.label}</div>
      <div className="mt-0.5 flex items-baseline justify-between gap-6">
        <div className="text-[1.2rem] leading-snug">{s.title}{s.note && <span className="ink-muted italic"> &nbsp;{s.note}</span>}</div>
        {s.amount && <div className="num shrink-0 text-[1.2rem]">{s.amount}</div>}
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {items.map((it, i) => (
            <li key={i} className="ink-muted flex justify-between gap-6 text-[0.95rem]">
              <span>{it.description}{it.quantity !== 1000 && <span className="num"> × {(it.quantity / 1000).toLocaleString("de-DE")}</span>}</span>
              <span className="num">{formatEuro(Math.round((it.quantity * it.unit_price_cents) / 1000))}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex min-h-9 items-center gap-3">
        {!done ? (
          <>
            <button onClick={() => go("confirm")} disabled={!!working} className="inline-flex h-9 items-center gap-2 rounded-[3px] bg-ink px-4 text-paper transition-colors duration-200 hover:bg-ink-deep disabled:opacity-60">
              {working === "confirm" ? <span className="breathe h-2 w-2 rounded-full bg-paper" /> : <Check size={16} strokeWidth={1.6} />} Confirm
            </button>
            <button onClick={() => go("reject")} disabled={!!working} className="ink-muted inline-flex h-9 items-center gap-1.5 px-2 transition-colors hover:text-ink disabled:opacity-60">
              <X size={15} strokeWidth={1.5} /> Cancel
            </button>
          </>
        ) : <Result a={action} />}
      </div>
    </motion.div>
  );
}

function Row({ action, onResolve, busy }: { action: AgentAction; onResolve: Resolve; busy: boolean }) {
  const [working, setWorking] = useState(false);
  const s = parseSummary(action.kind, action.summary);
  const pending = action.status === "pending";
  const go = async (how: "confirm" | "reject") => { setWorking(true); try { await onResolve(action.id, how); } finally { setWorking(false); } };
  return (
    <motion.li layout className={`rule grid grid-cols-[1fr_auto_5.5rem] items-center gap-4 border-b py-2.5 last:border-b-0 ${action.status === "rejected" ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <span className="sc ink-muted mr-2 text-[0.9rem]">{s.label}</span>
        <span className="truncate">{s.title}</span>
        {s.note && <span className="ink-muted italic"> &nbsp;{s.note}</span>}
      </div>
      <span className="num">{s.amount}</span>
      <div className="flex justify-end">
        <AnimatePresence mode="wait" initial={false}>
          {pending ? (
            <motion.div key="act" className="flex gap-1" exit={{ opacity: 0 }}>
              <button aria-label={`Confirm: ${action.summary}`} title="Confirm" onClick={() => go("confirm")} disabled={working || busy}
                className="grid h-8 w-8 place-items-center rounded-full border border-ink/60 transition-colors hover:bg-ink hover:text-paper disabled:opacity-40">
                {working ? <span className="breathe h-1.5 w-1.5 rounded-full bg-current" /> : <Check size={15} strokeWidth={1.6} />}
              </button>
              <button aria-label={`Cancel: ${action.summary}`} title="Cancel" onClick={() => go("reject")} disabled={working || busy}
                className="ink-muted grid h-8 w-8 place-items-center rounded-full transition-colors hover:text-ink disabled:opacity-40">
                <X size={15} strokeWidth={1.5} />
              </button>
            </motion.div>
          ) : (
            <motion.span key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-[0.95rem] italic" title={action.status === "failed" ? action.result?.error : undefined}>
              {action.status === "confirmed" ? <Check size={16} strokeWidth={1.6} /> : action.status === "failed" ? "failed" : "cancelled"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

/** One card per change; three or more changes collapse into a compact list with "Confirm all". */
export function Proposals({ actions, onResolve }: { actions: AgentAction[]; onResolve: Resolve }) {
  const [all, setAll] = useState(false);
  if (actions.length < 3) return <>{actions.map((a) => <Card key={a.id} action={a} onResolve={onResolve} />)}</>;
  const pending = actions.filter((a) => a.status === "pending");
  const confirmAll = async () => {
    setAll(true);
    try { for (const a of pending) await onResolve(a.id, "confirm"); } finally { setAll(false); }
  };
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className={`my-4 rounded-[4px] border bg-paper-lift px-5 pb-3 pt-4 ${pending.length ? "border-ink/70" : "border-ink/25"}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="sc ink-muted text-[0.95rem]">{actions.length} changes</span>
        {pending.length > 1 && (
          <button onClick={confirmAll} disabled={all} className="inline-flex h-8 items-center gap-2 rounded-[3px] bg-ink px-3.5 text-paper transition-colors hover:bg-ink-deep disabled:opacity-60">
            {all ? <span className="breathe h-2 w-2 rounded-full bg-paper" /> : <Check size={15} strokeWidth={1.6} />} Confirm all
          </button>
        )}
      </div>
      <ul>{actions.map((a) => <Row key={a.id} action={a} onResolve={onResolve} busy={all} />)}</ul>
    </motion.div>
  );
}
