import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export type ActionStatus = "pending" | "confirmed" | "rejected" | "failed";
export interface AgentAction { id: string; session_id: string; message_id: string | null; kind: string; payload: any; summary: string; status: ActionStatus; result: any; created_at: string; resolved_at: string | null; }

function hydrate(r: any): AgentAction {
  return { ...r, payload: JSON.parse(r.payload), result: r.result ? JSON.parse(r.result) : null };
}

export class ActionsRepo {
  constructor(private db: Database.Database) {}
  create(input: { session_id: string; kind: string; payload: unknown; summary: string; message_id?: string }): AgentAction {
    const id = newId();
    this.db.prepare("INSERT INTO agent_actions (id,session_id,message_id,kind,payload,summary,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)")
      .run(id, input.session_id, input.message_id ?? null, input.kind, JSON.stringify(input.payload), input.summary, new Date().toISOString());
    return this.get(id);
  }
  setMessage(id: string, messageId: string): void {
    this.db.prepare("UPDATE agent_actions SET message_id=? WHERE id=?").run(messageId, id);
  }
  get(id: string): AgentAction {
    const r = this.db.prepare("SELECT * FROM agent_actions WHERE id=?").get(id);
    if (!r) throw new AppError("NOT_FOUND", `action not found: ${id}`, 1, { id });
    return hydrate(r);
  }
  forSession(sessionId: string): AgentAction[] {
    return (this.db.prepare("SELECT * FROM agent_actions WHERE session_id=? ORDER BY created_at").all(sessionId)).map(hydrate);
  }
  resolve(id: string, status: Exclude<ActionStatus, "pending">, result: unknown): AgentAction {
    const cur = this.get(id);
    if (cur.status !== "pending") throw new AppError("ALREADY_RESOLVED", `action already ${cur.status}`, 1, { id, status: cur.status });
    this.db.prepare("UPDATE agent_actions SET status=?, result=?, resolved_at=? WHERE id=?").run(status, result === null || result === undefined ? null : JSON.stringify(result), new Date().toISOString(), id);
    return this.get(id);
  }
  unnotified(sessionId: string): AgentAction[] {
    return (this.db.prepare("SELECT * FROM agent_actions WHERE session_id=? AND status!='pending' AND notified=0 ORDER BY resolved_at").all(sessionId)).map(hydrate);
  }
  markNotified(sessionId: string): void {
    this.db.prepare("UPDATE agent_actions SET notified=1 WHERE session_id=? AND status!='pending'").run(sessionId);
  }
}
