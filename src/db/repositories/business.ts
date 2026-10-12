import type Database from "better-sqlite3";

export interface Business {
  name?: string; address?: string; vat_id?: string; tax_number?: string;
  email?: string; iban?: string; bic?: string; kleinunternehmer?: boolean;
  /** Person behind a trading name, printed under it. */ owner?: string;
  /** Name on the bank account; defaults to owner, then name. */ account_holder?: string;
}

export class BusinessRepo {
  constructor(private db: Database.Database) {}
  get(): Business {
    const row = this.db.prepare("SELECT value FROM meta WHERE key='business'").get() as { value: string } | undefined;
    return row ? JSON.parse(row.value) as Business : {};
  }
  set(patch: Business): Business {
    const next = { ...this.get(), ...patch };
    this.db.prepare("INSERT INTO meta (key, value) VALUES ('business', @v) ON CONFLICT(key) DO UPDATE SET value=@v").run({ v: JSON.stringify(next) });
    return next;
  }
}
