import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { api, type Business } from "../lib/api";
import { Area, Button, Field, PageHeader, ShimmerRows } from "../components/ui";

export function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["business"], queryFn: api.business });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const [form, setForm] = useState<Business | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  const save = useMutation({
    mutationFn: (b: Business) => api.saveBusiness(b),
    onSuccess: (v) => { qc.setQueryData(["business"], v); setSaved(true); setTimeout(() => setSaved(false), 1800); },
  });
  if (!form) return <><PageHeader title="Settings" /><ShimmerRows rows={5} /></>;
  const set = (k: keyof Business) => (e: { target: { value: string } }) => setForm((f) => ({ ...f!, [k]: e.target.value }));
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(form); };
  return (
    <>
      <PageHeader title="Settings" />
      <form onSubmit={submit} className="max-w-[560px] space-y-5 px-10 pb-16 max-md:px-5">
        <p className="ink-muted italic">Printed on every invoice.</p>
        <Field label="name" value={form.name ?? ""} onChange={set("name")} />
        <Area label="address" value={form.address ?? ""} onChange={set("address")} />
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="tax number" value={form.tax_number ?? ""} onChange={set("tax_number")} placeholder="12/345/67890" />
          <Field label="vat id" value={form.vat_id ?? ""} onChange={set("vat_id")} placeholder="DE123456789" />
        </div>
        <Field label="email" type="email" value={form.email ?? ""} onChange={set("email")} />
        <Field label="iban" value={form.iban ?? ""} onChange={set("iban")} />
        <label className="flex cursor-pointer items-center justify-between gap-6 py-2">
          <span>
            <span className="block">Kleinunternehmer</span>
            <span className="ink-muted text-[0.95rem] italic">No VAT on invoices, § 19 UStG</span>
          </span>
          <button type="button" role="switch" aria-checked={!!form.kleinunternehmer} onClick={() => setForm((f) => ({ ...f!, kleinunternehmer: !f!.kleinunternehmer }))}
            className={`relative h-7 w-12 shrink-0 rounded-full border border-ink transition-colors duration-300 ${form.kleinunternehmer ? "bg-ink" : "bg-transparent"}`}>
            <motion.span className={`absolute top-[3px] h-5 w-5 rounded-full ${form.kleinunternehmer ? "bg-paper" : "bg-ink"}`} animate={{ left: form.kleinunternehmer ? 24 : 3 }} transition={{ type: "spring", stiffness: 500, damping: 34 }} />
          </button>
        </label>
        <div className="flex items-center gap-4 pt-2">
          <Button type="submit" disabled={save.isPending}>Save</Button>
          <AnimatePresence>{saved && <motion.span className="italic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Saved</motion.span>}</AnimatePresence>
        </div>
        {health?.dataDir && <p className="ink-faint pt-8 text-[0.9rem]">Data in {health.dataDir}</p>}
      </form>
    </>
  );
}
