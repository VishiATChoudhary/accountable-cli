import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface Upload { id: string; filename: string; path: string; mime: string; size: number; created_at: string; }

export class UploadsRepo {
  constructor(private db: Database.Database) {}
  add(input: Omit<Upload, "id" | "created_at"> & { id?: string }): Upload {
    const u: Upload = { id: input.id ?? newId(), filename: input.filename, path: input.path, mime: input.mime, size: input.size, created_at: new Date().toISOString() };
    this.db.prepare("INSERT INTO uploads (id,filename,path,mime,size,created_at) VALUES (@id,@filename,@path,@mime,@size,@created_at)").run(u);
    return u;
  }
  get(id: string): Upload {
    const u = this.db.prepare("SELECT * FROM uploads WHERE id=?").get(id) as Upload | undefined;
    if (!u) throw new AppError("NOT_FOUND", `upload not found: ${id}`, 1, { id });
    return u;
  }
}
