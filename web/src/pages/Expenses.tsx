import { useQuery } from "@tanstack/react-query";
import { Paperclip, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Expense } from "../lib/api";
import { formatDate, formatEuro } from "../../../shared/format";
import { Button, Drawer, Empty, PageHeader, ShimmerRows } from "../components/ui";

function Receipt({ e }: { e: Expense }) {
  const [file, setFile] = useState<{ url: string; pdf: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!e.has_receipt) return;
    let url = "";
    let live = true;
    fetch(api.receiptUrl(e.id))
      .then(async (r) => { if (!r.ok) throw new Error(); const b = await r.blob(); url = URL.createObjectURL(b); if (live) setFile({ url, pdf: b.type.includes("pdf") }); })
      .catch(() => live && setFailed(true));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [e.id, e.has_receipt]);
  if (!e.has_receipt) return <p className="italic ink-muted">No receipt attached.</p>;
  if (failed) return <p className="italic ink-muted">The receipt file is missing.</p>;
  if (!file) return <div className="shimmer h-[420px] w-full" />;
  return file.pdf
    ? <iframe title="Receipt" src={file.url} className="h-[480px] w-full rounded-[3px] border border-ink/20 bg-white" />
    : <img alt="Receipt" src={file.url} className="w-full rounded-[3px] border border-ink/20" />;
}

export function Expenses({ onAsk }: { onAsk: (message: string, files: File[]) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["expenses"], queryFn: api.expenses });
  const [open, setOpen] = useState<Expense | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const total = data?.reduce((s, e) => s + e.gross_cents, 0) ?? 0;
  return (
    <>
      <PageHeader title="Expenses">
        {!!data?.length && <span className="num ink-muted mr-3">{formatEuro(total)}</span>}
        <Button variant="line" onClick={() => picker.current?.click()}><Plus size={16} strokeWidth={1.5} /> Receipt</Button>
        <input ref={picker} type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
          onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onAsk(f.length > 1 ? "Record these receipts as expenses." : "Record this receipt as an expense.", f); }} />
      </PageHeader>
      {isLoading ? <ShimmerRows /> : !data?.length ? (
        <Empty line="No expenses yet."><Button onClick={() => picker.current?.click()}>Add a receipt</Button></Empty>
      ) : (
        <div className="px-10 pb-16 max-md:px-5">
          {data.map((e) => (
            <button key={e.id} onClick={() => setOpen(e)} className="rule grid w-full grid-cols-[7.5rem_1fr_9rem_1.5rem_8rem] items-baseline gap-4 border-b py-3.5 text-left transition-colors duration-200 hover:bg-ink/[0.035] max-md:grid-cols-[1fr_auto]">
              <span className="num ink-muted max-md:hidden">{formatDate(e.date)}</span>
              <span className="truncate">{e.supplier ?? e.description ?? "Expense"}</span>
              <span className="ink-muted italic max-md:hidden">{e.category}</span>
              <span className="ink-faint max-md:hidden">{e.has_receipt && <Paperclip size={14} strokeWidth={1.4} />}</span>
              <span className="num text-right">{formatEuro(e.gross_cents)}</span>
            </button>
          ))}
        </div>
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.supplier ?? "Expense"}>
        {open && (
          <div className="space-y-6">
            <div>
              <div className="num text-[2rem] leading-tight">{formatEuro(open.gross_cents)}</div>
              <div className="num ink-muted">{formatDate(open.date)} &nbsp;/&nbsp; {formatEuro(open.net_cents)} net, {open.vat_bp / 100}% VAT</div>
              {open.category && <div className="mt-1 italic">{open.category}</div>}
              {open.description && <p className="mt-2 ink-muted">{open.description}</p>}
            </div>
            <Receipt key={open.id} e={open} />
          </div>
        )}
      </Drawer>
    </>
  );
}
