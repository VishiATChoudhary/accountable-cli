import { useQuery } from "@tanstack/react-query";
import { Plus, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { formatDate, formatEuro } from "../../../shared/format";
import { Button, Empty, PageHeader, Segmented, ShimmerRows } from "../components/ui";

export function Bank({ onAsk }: { onAsk: (message: string, files: File[]) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["transactions"], queryFn: api.transactions });
  const [filter, setFilter] = useState<"all" | "open">("all");
  const picker = useRef<HTMLInputElement>(null);
  const openCount = data?.filter((t) => t.status === "unclassified").length ?? 0;
  const rows = (data ?? []).filter((t) => filter === "all" || t.status === "unclassified");
  return (
    <>
      <PageHeader title="Bank">
        {openCount > 0 && <Button variant="quiet" onClick={() => onAsk("Categorize my unclassified transactions and match payments to invoices.", [])}><Sparkles size={15} strokeWidth={1.4} /> Sort {openCount}</Button>}
        <Button variant="line" onClick={() => picker.current?.click()}><Plus size={16} strokeWidth={1.5} /> Statement</Button>
        <input ref={picker} type="file" hidden accept=".csv,.xml,.txt"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onAsk("Import this bank statement.", f); }} />
      </PageHeader>
      {isLoading ? <ShimmerRows /> : !data?.length ? (
        <Empty line="No transactions yet."><Button onClick={() => picker.current?.click()}>Import a statement</Button></Empty>
      ) : (
        <div className="px-10 pb-16 max-md:px-5">
          <div className="mb-3 flex justify-end">
            <Segmented layoutId="bank-filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "all" }, { value: "open", label: `open ${openCount}` }]} />
          </div>
          {rows.map((t) => (
            <div key={t.id} className="rule grid grid-cols-[7.5rem_1fr_1.2fr_8rem_8rem] items-baseline gap-4 border-b py-3.5 max-md:grid-cols-[1fr_auto]">
              <span className="num ink-muted max-md:hidden">{formatDate(t.booking_date)}</span>
              <span className="truncate">{t.counterparty ?? "Unknown"}</span>
              <span className="ink-muted truncate max-md:hidden" title={t.reference ?? ""}>{t.reference}</span>
              <span className={`italic max-md:hidden ${t.status === "unclassified" ? "ink-faint" : ""}`}>{t.category ?? (t.status === "classified" ? "matched" : "open")}</span>
              <span className="num text-right">{formatEuro(t.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
