import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve, relative } from "node:path";
import { z } from "zod";
import { openDb } from "../src/db/index.js";
import { newId } from "../src/db/id.js";
import { ClientsRepo } from "../src/db/repositories/clients.js";
import { InvoicesRepo } from "../src/db/repositories/invoices.js";
import { ExpensesRepo } from "../src/db/repositories/expenses.js";
import { TransactionsRepo } from "../src/db/repositories/transactions.js";
import { BusinessRepo } from "../src/db/repositories/business.js";
import { ChatRepo } from "../src/db/repositories/chat.js";
import { ActionsRepo } from "../src/db/repositories/actions.js";
import { UploadsRepo } from "../src/db/repositories/uploads.js";
import { invoiceTotals } from "../src/domain/invoice.js";
import { grossCents } from "../src/domain/money.js";
import { renderInvoicePdf } from "../src/pdf/invoice.js";
import { AppError } from "../src/output/errors.js";
import { handleChatTurn, type RunTurn } from "./agent/chat.js";
import { prepareAction, executeAction, SCHEMAS } from "./agent/actions.js";

const MAX_UPLOAD = 25 * 1024 * 1024;

function statusFor(e: AppError): 400 | 404 | 409 | 413 | 500 {
  if (e.exitCode === 2) return 500;
  if (e.code === "NOT_FOUND") return 404;
  if (e.code === "TOO_LARGE") return 413;
  if (e.code === "IN_USE" || e.code === "BUSY" || e.code.startsWith("ALREADY_")) return 409;
  return 400;
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new AppError("BAD_INPUT", r.error.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; "), 1);
  return r.data;
}

const safeName = (name: string) => basename(name.replace(/\\/g, "/")).replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(-120) || "file";

export function createApp(opts: { dataDir: string; runTurn: RunTurn; webDist?: string }) {
  const db = openDb(opts.dataDir);
  const uploadsDir = join(opts.dataDir, "uploads");
  const filesDir = join(opts.dataDir, "files");
  mkdirSync(uploadsDir, { recursive: true });
  const busy = new Set<string>();
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, statusFor(err));
    console.error(err);
    return c.json({ error: { code: "INTERNAL", message: err.message } }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, dataDir: opts.dataDir }));

  // Customers
  const clientBody = SCHEMAS["client.create"];
  app.get("/api/clients", (c) => c.json(new ClientsRepo(db).list()));
  app.get("/api/clients/:id", (c) => c.json(new ClientsRepo(db).get(c.req.param("id"))));
  app.post("/api/clients", async (c) => c.json(new ClientsRepo(db).add(parse(clientBody, await c.req.json())), 201));
  app.patch("/api/clients/:id", async (c) => c.json(new ClientsRepo(db).edit(c.req.param("id"), parse(clientBody.partial(), await c.req.json()))));
  app.delete("/api/clients/:id", (c) => { new ClientsRepo(db).remove(c.req.param("id")); return c.json({ ok: true }); });

  // Invoices
  const invoiceView = (id: string) => {
    const inv = new InvoicesRepo(db).get(id);
    const t = invoiceTotals(inv.items);
    const client = db.prepare("SELECT name FROM clients WHERE id=?").get(inv.client_id) as { name: string } | undefined;
    return { ...inv, client_name: client?.name ?? "", net_cents: t.netCents, vat_cents: t.vatCents, gross_cents: t.grossCents };
  };
  app.get("/api/invoices", (c) => c.json(new InvoicesRepo(db).list().reverse().map((i) => { const { items, ...rest } = invoiceView(i.id); return rest; })));
  app.get("/api/invoices/:id", (c) => c.json(invoiceView(c.req.param("id"))));
  app.post("/api/invoices", async (c) => {
    const body = parse(SCHEMAS["invoice.create"], await c.req.json());
    if (!body.client_id) throw new AppError("BAD_INPUT", "client_id is required", 1);
    return c.json(invoiceView(new InvoicesRepo(db).create(body as any).id), 201);
  });
  app.post("/api/invoices/:id/status", async (c) => {
    const { status } = parse(SCHEMAS["invoice.status"].pick({ status: true }), await c.req.json());
    new InvoicesRepo(db).setStatus(c.req.param("id"), status);
    return c.json(invoiceView(c.req.param("id")));
  });
  app.get("/api/invoices/:id/pdf", async (c) => {
    const inv = new InvoicesRepo(db).get(c.req.param("id"));
    const out = join(filesDir, `${inv.number}.pdf`);
    await renderInvoicePdf(inv, new ClientsRepo(db).get(inv.client_id), out, new BusinessRepo(db).get());
    return new Response(readFileSync(out), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${inv.number}.pdf"` } });
  });

  // Expenses
  app.get("/api/expenses", (c) => c.json(new ExpensesRepo(db).list().reverse().map((e) => ({ ...e, gross_cents: grossCents(e.net_cents, e.vat_bp), has_receipt: !!e.receipt_path }))));
  app.get("/api/expenses/:id/receipt", (c) => {
    const e = new ExpensesRepo(db).get(c.req.param("id"));
    if (!e.receipt_path) throw new AppError("NOT_FOUND", "no receipt attached", 1);
    const p = resolve(e.receipt_path);
    if (relative(resolve(filesDir), p).startsWith("..") || !existsSync(p)) throw new AppError("NOT_FOUND", "receipt missing", 1);
    const mime = p.toLowerCase().endsWith(".pdf") ? "application/pdf" : p.match(/\.(png|jpe?g|webp|gif|heic)$/i) ? `image/${p.split(".").pop()!.toLowerCase().replace("jpg", "jpeg")}` : "application/octet-stream";
    return new Response(readFileSync(p), { headers: { "content-type": mime, "content-disposition": `inline; filename="${basename(p)}"` } });
  });

  // Bank
  app.get("/api/transactions", (c) => c.json(new TransactionsRepo(db).list().reverse().map(({ raw, ...t }) => t)));

  // Business identity
  app.get("/api/business", (c) => c.json(new BusinessRepo(db).get()));
  app.put("/api/business", async (c) => {
    const body = parse(z.object({ name: z.string().optional(), address: z.string().optional(), vat_id: z.string().optional(), tax_number: z.string().optional(), email: z.string().optional(), iban: z.string().optional(), bic: z.string().optional(), owner: z.string().optional(), account_holder: z.string().optional(), kleinunternehmer: z.boolean().optional() }).strict(), await c.req.json());
    return c.json(new BusinessRepo(db).set(body));
  });

  // Uploads
  app.post("/api/uploads", async (c) => {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) throw new AppError("BAD_INPUT", "expected a file field", 1);
    if (file.size > MAX_UPLOAD) throw new AppError("TOO_LARGE", "file larger than 25 MB", 1);
    const id = newId();
    const filename = safeName(file.name);
    const path = join(uploadsDir, `${id}-${filename}`);
    writeFileSync(path, Buffer.from(await file.arrayBuffer()));
    return c.json(new UploadsRepo(db).add({ id, filename, path, mime: file.type || "application/octet-stream", size: file.size }), 201);
  });
  app.get("/api/uploads/:id", (c) => {
    const u = new UploadsRepo(db).get(c.req.param("id"));
    return new Response(readFileSync(u.path), { headers: { "content-type": u.mime, "content-disposition": `inline; filename="${u.filename}"` } });
  });

  // Chat
  const sessionView = (id: string) => ({ session: new ChatRepo(db).getSession(id), messages: new ChatRepo(db).messages(id), actions: new ActionsRepo(db).forSession(id) });
  app.get("/api/chat/latest", (c) => { const s = new ChatRepo(db).latestSession(); return c.json(s ? sessionView(s.id) : null); });
  app.get("/api/chat/sessions/:id", (c) => c.json(sessionView(c.req.param("id"))));
  app.post("/api/chat", async (c) => {
    const body = parse(z.object({ sessionId: z.string().optional(), message: z.string().max(20000), uploadIds: z.array(z.string()).max(10).default([]) }), await c.req.json());
    if (!body.message.trim() && body.uploadIds.length === 0) throw new AppError("BAD_INPUT", "empty message", 1);
    if (body.sessionId) new ChatRepo(db).getSession(body.sessionId);
    const lock = body.sessionId ?? `new-${newId()}`;
    if (busy.has(lock)) throw new AppError("BUSY", "the agent is still answering", 1);
    busy.add(lock);
    return streamSSE(c, async (stream) => {
      const ctrl = new AbortController();
      stream.onAbort(() => ctrl.abort());
      // Keep SSE writes ordered and make sure all of them flush before the stream closes.
      let queue: Promise<void> = Promise.resolve();
      const send = (e: unknown) => { queue = queue.then(() => stream.writeSSE({ data: JSON.stringify(e) })).catch(() => {}); };
      try {
        await handleChatTurn({
          db, dataDir: opts.dataDir, sessionId: body.sessionId, message: body.message, uploadIds: body.uploadIds,
          runTurn: opts.runTurn, signal: ctrl.signal, emit: send,
        });
      } catch (err) {
        send({ type: "done", isError: true, error: (err as Error).message });
      } finally {
        await queue;
        busy.delete(lock);
      }
    });
  });

  // Proposals
  app.post("/api/actions/:id/confirm", (c) => {
    const actions = new ActionsRepo(db);
    const a = actions.get(c.req.param("id"));
    if (a.status !== "pending") throw new AppError("ALREADY_RESOLVED", `action already ${a.status}`, 1);
    const fresh = prepareAction(db, { kind: a.kind, payload: a.payload });
    if (!fresh.ok) return c.json(actions.resolve(a.id, "failed", { error: fresh.error }));
    try {
      return c.json(actions.resolve(a.id, "confirmed", executeAction(db, opts.dataDir, fresh.kind, fresh.payload)));
    } catch (err) {
      return c.json(actions.resolve(a.id, "failed", { error: err instanceof AppError ? err.message : String(err) }));
    }
  });
  app.post("/api/actions/:id/reject", (c) => c.json(new ActionsRepo(db).resolve(c.req.param("id"), "rejected", null)));

  // Built web app (production mode)
  if (opts.webDist && existsSync(opts.webDist)) {
    app.use("/*", serveStatic({ root: relative(process.cwd(), opts.webDist) }));
    app.get("*", (c) => c.html(readFileSync(join(opts.webDist!, "index.html"), "utf8")));
  }
  return app;
}
