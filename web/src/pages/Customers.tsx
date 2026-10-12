import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, type Client } from "../lib/api";
import { Area, Button, Drawer, Empty, Field, PageHeader, ShimmerRows } from "../components/ui";

const FIELDS = ["name", "email", "vat_id", "address", "country"] as const;
type Form = Record<(typeof FIELDS)[number], string>;
const toForm = (c?: Client | null): Form => ({ name: c?.name ?? "", email: c?.email ?? "", vat_id: c?.vat_id ?? "", address: c?.address ?? "", country: c?.country ?? "" });

function Editor({ client, onDone }: { client: Client | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(toForm(client));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const body = () => Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || undefined])) as Partial<Client>;
  const save = useMutation({
    mutationFn: () => (client ? api.updateClient(client.id, body()) : api.createClient(body())),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); onDone(); },
    onError: (e: Error) => setError(e.message),
  });
  const del = useMutation({
    mutationFn: () => api.deleteClient(client!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); onDone(); },
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setError(null); save.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="name" value={form.name} onChange={set("name")} required autoFocus />
      <Field label="email" type="email" value={form.email} onChange={set("email")} />
      <Field label="vat id" value={form.vat_id} onChange={set("vat_id")} placeholder="DE123456789" />
      <Area label="address" value={form.address} onChange={set("address")} />
      <Field label="country" value={form.country} onChange={set("country")} placeholder="Germany" />
      {error && <p className="italic">{error}</p>}
      <div className="flex items-center justify-between pt-2">
        <Button type="submit" disabled={save.isPending || !form.name.trim()}>{save.isPending ? "Saving" : "Save"}</Button>
        {client && <Button type="button" variant="quiet" onClick={() => del.mutate()} disabled={del.isPending}>Delete</Button>}
      </div>
    </form>
  );
}

export function Customers() {
  const { data, isLoading } = useQuery({ queryKey: ["clients"], queryFn: api.clients });
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  return (
    <>
      <PageHeader title="Customers">
        <Button variant="line" onClick={() => setEditing("new")}><Plus size={16} strokeWidth={1.5} /> Add</Button>
      </PageHeader>
      {isLoading ? <ShimmerRows /> : !data?.length ? (
        <Empty line="No customers yet."><Button onClick={() => setEditing("new")}>Add a customer</Button></Empty>
      ) : (
        <div className="px-10 pb-16 max-md:px-5">
          {data.map((c) => (
            <button key={c.id} onClick={() => setEditing(c)} className="rule grid w-full grid-cols-[1.3fr_1.2fr_9rem_1fr] items-baseline gap-4 border-b py-3.5 text-left transition-colors duration-200 hover:bg-ink/[0.035] max-md:grid-cols-1">
              <span className="truncate">{c.name}</span>
              <span className="ink-muted truncate max-md:hidden">{c.email}</span>
              <span className="num ink-muted max-md:hidden">{c.vat_id}</span>
              <span className="ink-muted truncate italic max-md:hidden">{c.address?.split("\n").at(-1)}</span>
            </button>
          ))}
        </div>
      )}
      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New customer" : "Customer"}>
        {editing !== null && <Editor key={editing === "new" ? "new" : editing.id} client={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Drawer>
    </>
  );
}
