import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface Client {
  id: string; name: string; address?: string; country?: string;
  vat_id?: string; email?: string; created_at: string;
}

export class ClientsRepo {
  constructor(private db: Database.Database) {}
  add(input: Omit<Partial<Client>, "id" | "created_at"> & { name: string }): Client {
    const c: Client = { id: newId(), created_at: new Date().toISOString(), ...input };
    this.db.prepare(
      "INSERT INTO clients (id,name,address,country,vat_id,email,created_at) VALUES (@id,@name,@address,@country,@vat_id,@email,@created_at)",
    ).run({ address: null, country: null, vat_id: null, email: null, ...c });
    return c;
  }
  get(id: string): Client {
    const row = this.db.prepare("SELECT * FROM clients WHERE id=?").get(id) as Client | undefined;
    if (!row) throw new AppError("NOT_FOUND", `client not found: ${id}`, 1, { id });
    return row;
  }
  list(): Client[] {
    return this.db.prepare("SELECT * FROM clients ORDER BY created_at").all() as Client[];
  }
  edit(id: string, patch: Partial<Client>): Client {
    const cur = this.get(id);
    const next = { ...cur, ...patch };
    this.db.prepare("UPDATE clients SET name=@name,address=@address,country=@country,vat_id=@vat_id,email=@email WHERE id=@id").run(next);
    return next;
  }
  remove(id: string): void {
    const r = this.db.prepare("DELETE FROM clients WHERE id=?").run(id);
    if (r.changes === 0) throw new AppError("NOT_FOUND", `client not found: ${id}`, 1, { id });
  }
}
