export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? "HTTP", body?.error?.message ?? res.statusText, res.status);
  }
  return res.json() as Promise<T>;
}
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export interface Client { id: string; name: string; address: string | null; country: string | null; vat_id: string | null; email: string | null; created_at: string; }
export interface InvoiceItem { description: string; quantity: number; unit_price_cents: number; vat_bp: number; }
export interface Invoice { id: string; number: string; client_id: string; client_name: string; issue_date: string; due_date: string | null; status: "draft" | "sent" | "paid" | "void"; notes: string | null; net_cents: number; vat_cents: number; gross_cents: number; items?: InvoiceItem[]; }
export interface Expense { id: string; date: string; supplier: string | null; description: string | null; net_cents: number; vat_bp: number; gross_cents: number; category: string | null; has_receipt: boolean; }
export interface Transaction { id: string; booking_date: string; amount_cents: number; counterparty: string | null; reference: string | null; status: "unclassified" | "classified" | "ignored"; category: string | null; }
export interface Business { name?: string; address?: string; vat_id?: string; tax_number?: string; email?: string; iban?: string; bic?: string; owner?: string; account_holder?: string; kleinunternehmer?: boolean; }
export interface Upload { id: string; filename: string; mime: string; size: number; }
export interface AgentAction { id: string; session_id: string; message_id: string | null; kind: string; payload: any; summary: string; status: "pending" | "confirmed" | "rejected" | "failed"; result: any; }
export interface ChatMessage { id: string; role: "user" | "assistant"; content: string; meta: any; created_at: string; }
export interface SessionView { session: { id: string; title: string | null }; messages: ChatMessage[]; actions: AgentAction[]; }

export const api = {
  health: () => req<{ ok: boolean; dataDir: string }>("/api/health"),
  clients: () => req<Client[]>("/api/clients"),
  createClient: (b: Partial<Client>) => req<Client>("/api/clients", send("POST", b)),
  updateClient: (id: string, b: Partial<Client>) => req<Client>(`/api/clients/${id}`, send("PATCH", b)),
  deleteClient: (id: string) => req<{ ok: true }>(`/api/clients/${id}`, { method: "DELETE" }),
  invoices: () => req<Invoice[]>("/api/invoices"),
  invoice: (id: string) => req<Invoice>(`/api/invoices/${id}`),
  setInvoiceStatus: (id: string, status: Invoice["status"]) => req<Invoice>(`/api/invoices/${id}/status`, send("POST", { status })),
  invoicePdfUrl: (id: string) => `/api/invoices/${id}/pdf`,
  expenses: () => req<Expense[]>("/api/expenses"),
  receiptUrl: (id: string) => `/api/expenses/${id}/receipt`,
  transactions: () => req<Transaction[]>("/api/transactions"),
  business: () => req<Business>("/api/business"),
  saveBusiness: (b: Business) => req<Business>("/api/business", send("PUT", b)),
  upload: async (file: File) => { const fd = new FormData(); fd.append("file", file); return req<Upload>("/api/uploads", { method: "POST", body: fd }); },
  latestChat: () => req<SessionView | null>("/api/chat/latest"),
  confirm: (id: string) => req<AgentAction>(`/api/actions/${id}/confirm`, { method: "POST" }),
  reject: (id: string) => req<AgentAction>(`/api/actions/${id}/reject`, { method: "POST" }),
};

/** POST /api/chat and yield each server-sent event as parsed JSON. */
export async function* chatStream(body: { sessionId?: string; message: string; uploadIds: string[] }, signal: AbortSignal): AsyncGenerator<any> {
  const res = await fetch("/api/chat", { ...send("POST", body), signal });
  if (!res.ok || !res.body) {
    const b = await res.json().catch(() => null);
    throw new ApiError(b?.error?.code ?? "HTTP", b?.error?.message ?? res.statusText, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let cut: number;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
      if (data) yield JSON.parse(data);
    }
  }
}
