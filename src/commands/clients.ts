import { Command } from "commander";
import { loadContext } from "../context.js";
import { ClientsRepo } from "../db/repositories/clients.js";
import { emit } from "../output/render.js";
import { fail } from "../output/errors.js";

export function registerClients(program: Command): void {
  const g = program.command("clients").description("manage clients");
  g.command("add").requiredOption("--name <name>").option("--vat-id <v>").option("--email <e>").option("--address <a>")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        emit(new ClientsRepo(ctx.db).add({ name: o.name, vat_id: o.vatId, email: o.email, address: o.address }), ctx);
      } catch (e) { fail(e); }
    });
  g.command("list").action(() => { try { const ctx = loadContext(program.opts()); emit(new ClientsRepo(ctx.db).list(), ctx); } catch (e) { fail(e); } });
  g.command("get <id>").action((id) => { try { const ctx = loadContext(program.opts()); emit(new ClientsRepo(ctx.db).get(id), ctx); } catch (e) { fail(e); } });
  g.command("edit <id>").option("--name <n>").option("--vat-id <v>").option("--email <e>").option("--address <a>").option("--country <c>")
    .action((id, o) => { try { const ctx = loadContext(program.opts()); const patch: any = {}; if (o.name !== undefined) patch.name = o.name; if (o.vatId !== undefined) patch.vat_id = o.vatId; if (o.email !== undefined) patch.email = o.email; if (o.address !== undefined) patch.address = o.address; if (o.country !== undefined) patch.country = o.country; emit(new ClientsRepo(ctx.db).edit(id, patch), ctx); } catch (e) { fail(e); } });
  g.command("rm <id>").action((id) => { try { const ctx = loadContext(program.opts()); new ClientsRepo(ctx.db).remove(id); emit({ ok: true }, ctx); } catch (e) { fail(e); } });
}
