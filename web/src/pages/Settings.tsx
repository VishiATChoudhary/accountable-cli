import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { api, PDF_TEMPLATES, type Business } from "../lib/api";
import { Area, Field, PageHeader, Segmented, ShimmerRows } from "../components/ui";

export function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["business"], queryFn: api.business });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const [form, setForm] = useState<Business | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  const save = useMutation({
    mutationFn: (b: Business) => api.saveBusiness(b),
    onSuccess: (v) => { qc.setQueryData(["business"], v); setSaved(true); setTimeout(() => setSaved(false), 1800); },
  });
  // Autosave: every edit is written shortly after typing stops.
  useEffect(() => {
    if (!form || !dirty.current) return;
    const t = setTimeout(() => save.mutate(form), 500);
    return () => clearTimeout(t);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!form) return <><PageHeader title="Settings" /><ShimmerRows rows={5} /></>;
  const update = (patch: Partial<Business>) => { dirty.current = true; setForm((f) => ({ ...f!, ...patch })); };
  const set = (k: keyof Business) => (e: { target: { value: string } }) => update({ [k]: e.target.value });
  return (
    <>
      <PageHeader title="Settings" />
      <form onSubmit={(e) => e.preventDefault()} className="max-w-[560px] space-y-5 px-10 pb-16 max-md:px-5">
        <p className="ink-muted italic">Printed on every invoice. Changes save as you type.</p>
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="business name" value={form.name ?? ""} onChange={set("name")} />
          <Field label="your name" value={form.owner ?? ""} onChange={set("owner")} placeholder="if different" />
        </div>
        <Area label="address" value={form.address ?? ""} onChange={set("address")} />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="tax number" value={form.tax_number ?? ""} onChange={set("tax_number")} placeholder="12/345/67890" />
          <Field label="vat id" value={form.vat_id ?? ""} onChange={set("vat_id")} placeholder="DE123456789" />
        </div>
        <Field label="email" type="email" value={form.email ?? ""} onChange={set("email")} />
        <div className="grid grid-cols-[2fr_1fr] gap-4 max-md:grid-cols-1">
          <Field label="iban" value={form.iban ?? ""} onChange={set("iban")} />
          <Field label="bic" value={form.bic ?? ""} onChange={set("bic")} />
        </div>
        <Field label="account holder" value={form.account_holder ?? ""} onChange={set("account_holder")} placeholder={form.owner || form.name || "defaults to your name"} />
        <label className="flex cursor-pointer items-center justify-between gap-6 py-2">
          <span>
            <span className="block">Kleinunternehmer</span>
            <span className="ink-muted text-[0.95rem] italic">No VAT on invoices, § 19 UStG</span>
          </span>
          <button type="button" role="switch" aria-checked={!!form.kleinunternehmer} onClick={() => update({ kleinunternehmer: !form.kleinunternehmer })}
            className={`relative h-7 w-12 shrink-0 rounded-full border border-ink transition-colors duration-300 ${form.kleinunternehmer ? "bg-ink" : "bg-transparent"}`}>
            <motion.span className={`absolute top-[3px] h-5 w-5 rounded-full ${form.kleinunternehmer ? "bg-paper" : "bg-ink"}`} animate={{ left: form.kleinunternehmer ? 24 : 3 }} transition={{ type: "spring", stiffness: 500, damping: 34 }} />
          </button>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-4 py-2">
          <span>
            <span className="block">Invoice template</span>
            <span className="ink-muted text-[0.95rem] italic">Default look for PDFs, change it per download too</span>
          </span>
          <Segmented layoutId="invoice-template" value={form.invoice_template ?? "engraved"} onChange={(v) => update({ invoice_template: v })} options={PDF_TEMPLATES.map((t) => ({ value: t, label: t }))} />
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="block">Invoice language</span>
          <Segmented layoutId="invoice-lang" value={form.invoice_lang ?? "de"} onChange={(v) => update({ invoice_lang: v })} options={[{ value: "de", label: "deutsch" }, { value: "en", label: "english" }]} />
        </div>
        <div className="flex items-center gap-4 pt-2">
          <AnimatePresence>{saved && <motion.span className="italic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Saved</motion.span>}</AnimatePresence>
        </div>
        {health?.dataDir && <p className="ink-faint pt-8 text-[0.9rem]">Data in {health.dataDir}</p>}
      </form>
    </>
  );
}
