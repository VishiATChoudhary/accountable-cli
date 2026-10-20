import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Plus } from "lucide-react";
import { useState } from "react";
import { api, PDF_TEMPLATES, type Invoice, type PdfLang, type PdfTemplate } from "../lib/api";
import { formatDate, formatEuro } from "../../../shared/format";
import { Button, Drawer, Empty, PageHeader, Segmented, ShimmerRows } from "../components/ui";

const STATUSES: Invoice["status"][] = ["draft", "sent", "paid", "void"];

function Detail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: inv } = useQuery({ queryKey: ["invoice", id], queryFn: () => api.invoice(id) });
  const { data: business } = useQuery({ queryKey: ["business"], queryFn: api.business });
  const [template, setTemplate] = useState<PdfTemplate | null>(null);
  const [lang, setLang] = useState<PdfLang | null>(null);
  const pdf = { template: template ?? business?.invoice_template ?? "engraved", lang: lang ?? business?.invoice_lang ?? "de" };
  const status = useMutation({
    mutationFn: (s: Invoice["status"]) => api.setInvoiceStatus(id, s),
    onSuccess: (v) => { qc.setQueryData(["invoice", id], v); qc.invalidateQueries({ queryKey: ["invoices"] }); },
  });
  if (!inv) return <div className="space-y-3 pt-2"><div className="shimmer h-5 w-1/2" /><div className="shimmer h-4 w-1/3" /><div className="shimmer h-24 w-full" /></div>;
  return (
    <div className="space-y-7">
      <div>
        <div className="num text-[2rem] leading-tight">{formatEuro(inv.gross_cents)}</div>
        <div className="mt-1 text-[1.1rem]">{inv.client_name}</div>
        <div className="ink-muted num">{formatDate(inv.issue_date)}{inv.due_date && <> &nbsp;/&nbsp; due {formatDate(inv.due_date)}</>}</div>
      </div>
      <Segmented layoutId={`status-${id}`} value={inv.status} onChange={(s) => status.mutate(s)} options={STATUSES.map((s) => ({ value: s, label: s }))} />
      <div>
        {inv.items?.map((it, i) => (
          <div key={i} className="rule flex justify-between gap-6 border-b py-2.5">
            <span>{it.description}{it.quantity !== 1000 && <span className="num ink-muted"> × {(it.quantity / 1000).toLocaleString("de-DE")}</span>}</span>
            <span className="num">{formatEuro(Math.round((it.quantity * it.unit_price_cents) / 1000))}</span>
          </div>
        ))}
        <div className="num ink-muted flex justify-between pt-3"><span className="sc">net</span><span>{formatEuro(inv.net_cents)}</span></div>
        <div className="num ink-muted flex justify-between"><span className="sc">vat</span><span>{formatEuro(inv.vat_cents)}</span></div>
        <div className="num flex justify-between pt-1 text-[1.1rem]"><span className="sc">total</span><span>{formatEuro(inv.gross_cents)}</span></div>
      </div>
      {inv.notes && <p className="italic ink-muted">{inv.notes}</p>}
      <div className="space-y-3">
        <Segmented layoutId={`template-${id}`} value={pdf.template} onChange={setTemplate} options={PDF_TEMPLATES.map((t) => ({ value: t, label: t }))} />
        <Segmented layoutId={`lang-${id}`} value={pdf.lang} onChange={setLang} options={[{ value: "de", label: "deutsch" }, { value: "en", label: "english" }]} />
        <div className="flex gap-3">
          <a href={api.invoicePdfUrl(id, pdf)} className="inline-flex h-10 items-center gap-2 rounded-[3px] bg-ink px-5 text-paper transition-colors hover:bg-ink-deep">
            <Download size={16} strokeWidth={1.5} /> Download PDF
          </a>
          <a href={api.invoicePdfUrl(id, { ...pdf, inline: true })} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-[3px] border border-ink px-5 transition-colors hover:bg-ink/[0.06]">
            <Eye size={16} strokeWidth={1.5} /> Preview
          </a>
        </div>
      </div>
    </div>
  );
}

export function Invoices({ onCompose }: { onCompose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["invoices"], queryFn: api.invoices });
  const [open, setOpen] = useState<Invoice | null>(null);
  return (
    <>
      <PageHeader title="Invoices">
        <Button variant="line" onClick={onCompose}><Plus size={16} strokeWidth={1.5} /> New</Button>
      </PageHeader>
      {isLoading ? <ShimmerRows /> : !data?.length ? (
        <Empty line="No invoices yet."><Button onClick={onCompose}>Create one with the agent</Button></Empty>
      ) : (
        <div className="px-10 pb-16 max-md:px-5">
          {data.map((inv) => (
            <button key={inv.id} onClick={() => setOpen(inv)} className="rule grid w-full grid-cols-[6.5rem_1fr_7.5rem_4.5rem_8rem] items-baseline gap-4 border-b py-3.5 text-left transition-colors duration-200 hover:bg-ink/[0.035] max-md:grid-cols-[1fr_auto]">
              <span className="num max-md:hidden">{inv.number}</span>
              <span className="truncate">{inv.client_name}</span>
              <span className="num ink-muted max-md:hidden">{formatDate(inv.issue_date)}</span>
              <span className={`italic max-md:hidden ${inv.status === "paid" ? "" : "ink-muted"} ${inv.status === "void" ? "line-through" : ""}`}>{inv.status}</span>
              <span className="num text-right">{formatEuro(inv.gross_cents)}</span>
            </button>
          ))}
        </div>
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Invoice ${open.number}` : ""}>
        {open && <Detail id={open.id} />}
      </Drawer>
    </>
  );
}
