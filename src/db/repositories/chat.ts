import type Database from "better-sqlite3";
import { newId } from "../id.js";
import { AppError } from "../../output/errors.js";

export interface ChatSession { id: string; claude_session_id: string | null; title: string | null; created_at: string; updated_at: string; }
export interface ChatMessage { id: string; session_id: string; role: "user" | "assistant"; content: string; meta: unknown; created_at: string; }

export class ChatRepo {
  constructor(private db: Database.Database) {}
  createSession(): ChatSession {
    const now = new Date().toISOString();
    const s: ChatSession = { id: newId(), claude_session_id: null, title: null, created_at: now, updated_at: now };
    this.db.prepare("INSERT INTO chat_sessions (id,claude_session_id,title,created_at,updated_at) VALUES (@id,@claude_session_id,@title,@created_at,@updated_at)").run(s);
    return s;
  }
  getSession(id: string): ChatSession {
    const s = this.db.prepare("SELECT * FROM chat_sessions WHERE id=?").get(id) as ChatSession | undefined;
    if (!s) throw new AppError("NOT_FOUND", `chat session not found: ${id}`, 1, { id });
    return s;
  }
  latestSession(): ChatSession | undefined {
    return this.db.prepare("SELECT * FROM chat_sessions ORDER BY updated_at DESC, created_at DESC LIMIT 1").get() as ChatSession | undefined;
  }
  setClaudeSession(id: string, claudeSessionId: string): void {
    this.db.prepare("UPDATE chat_sessions SET claude_session_id=?, updated_at=? WHERE id=?").run(claudeSessionId, new Date().toISOString(), id);
  }
  setTitle(id: string, title: string): void {
    this.db.prepare("UPDATE chat_sessions SET title=? WHERE id=? AND title IS NULL").run(title, id);
  }
  addMessage(sessionId: string, role: "user" | "assistant", content: string, meta?: unknown): ChatMessage {
    const seq = (this.db.prepare("SELECT COALESCE(MAX(seq),0)+1 n FROM chat_messages WHERE session_id=?").get(sessionId) as { n: number }).n;
    const m = { id: newId(), session_id: sessionId, role, content, meta: meta === undefined ? null : JSON.stringify(meta), created_at: new Date().toISOString(), seq };
    this.db.prepare("INSERT INTO chat_messages (id,session_id,role,content,meta,created_at,seq) VALUES (@id,@session_id,@role,@content,@meta,@created_at,@seq)").run(m);
    this.db.prepare("UPDATE chat_sessions SET updated_at=? WHERE id=?").run(m.created_at, sessionId);
    return { ...m, meta: meta ?? null };
  }
  messages(sessionId: string): ChatMessage[] {
    const rows = this.db.prepare("SELECT * FROM chat_messages WHERE session_id=? ORDER BY seq").all(sessionId) as (ChatMessage & { meta: string | null })[];
    return rows.map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }));
  }
}
