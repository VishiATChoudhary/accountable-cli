import { Command } from "commander";
import { loadContext } from "../context.js";
import { BusinessRepo } from "../db/repositories/business.js";
import { emit } from "../output/render.js";
import { fail } from "../output/errors.js";
import { TEMPLATES, pickLang, pickTemplate } from "../pdf/common.js";

export function registerBusiness(program: Command): void {
  const g = program.command("business").description("your own business identity (for invoices)");
  g.command("set").option("--name <n>").option("--address <a>").option("--vat-id <v>").option("--tax-number <t>").option("--email <e>").option("--iban <i>").option("--bic <b>").option("--owner <o>", "person behind the business name").option("--account-holder <a>").option("--kleinunternehmer <bool>")
    .option("--invoice-template <t>", `default invoice PDF template: ${TEMPLATES.join(", ")}`).option("--invoice-lang <l>", "default invoice language: de, en")
    .action((o) => {
      try {
        const ctx = loadContext(program.opts());
        const patch: any = {};
        if (o.name !== undefined) patch.name = o.name;
        if (o.address !== undefined) patch.address = o.address;
        if (o.vatId !== undefined) patch.vat_id = o.vatId;
        if (o.taxNumber !== undefined) patch.tax_number = o.taxNumber;
        if (o.email !== undefined) patch.email = o.email;
        if (o.iban !== undefined) patch.iban = o.iban;
        if (o.bic !== undefined) patch.bic = o.bic;
        if (o.owner !== undefined) patch.owner = o.owner;
        if (o.accountHolder !== undefined) patch.account_holder = o.accountHolder;
        if (o.kleinunternehmer !== undefined) patch.kleinunternehmer = o.kleinunternehmer === "true";
        if (o.invoiceTemplate !== undefined) patch.invoice_template = pickTemplate(o.invoiceTemplate);
        if (o.invoiceLang !== undefined) patch.invoice_lang = pickLang(o.invoiceLang);
        emit(new BusinessRepo(ctx.db).set(patch), ctx);
      } catch (e) { fail(e); }
    });
  g.command("get").action(() => { try { const ctx = loadContext(program.opts()); emit(new BusinessRepo(ctx.db).get(), ctx); } catch (e) { fail(e); } });
}
