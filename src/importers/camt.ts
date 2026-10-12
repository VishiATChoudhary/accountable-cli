import { XMLParser } from "fast-xml-parser";
import { parseEuroToCents } from "../domain/money.js";
import { AppError } from "../output/errors.js";
import type { ParsedTx } from "../db/repositories/transactions.js";

export function parseCamt(xml: string): ParsedTx[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const stmt = doc?.Document?.BkToCstmrStmt?.Stmt;
  if (!stmt) throw new AppError("BAD_INPUT", "not a CAMT.053 document", 1);
  const entries = Array.isArray(stmt.Ntry) ? stmt.Ntry : stmt.Ntry ? [stmt.Ntry] : [];
  return entries.map((e: any) => {
    const amtStr = String(e.Amt?.["#text"] ?? e.Amt).replace(".", ",");
    let cents = parseEuroToCents(amtStr);
    if (e.CdtDbtInd === "DBIT") cents = -cents;
    const td = e.NtryDtls?.TxDtls ?? {};
    const nm = td.RltdPties?.Cdtr?.Nm ?? td.RltdPties?.Dbtr?.Nm;
    return { booking_date: e.BookgDt?.Dt, amount_cents: cents, counterparty: nm, reference: td.RmtInf?.Ustrd, currency: e.Amt?.["@_Ccy"] ?? "EUR", raw: e };
  });
}
