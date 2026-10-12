// One chat turn: compose the prompt, run Claude, persist messages, and turn
// fenced action blocks into pending proposals the UI can confirm.
import type Database from "better-sqlite3";
import { ChatRepo } from "../../src/db/repositories/chat.js";
import { ActionsRepo, type AgentAction } from "../../src/db/repositories/actions.js";
import { UploadsRepo, type Upload } from "../../src/db/repositories/uploads.js";
import { visibleText, extractActionBlocks } from "../../shared/agent-text.js";
import { prepareAction } from "./actions.js";
import type { UiEvent } from "./stream.js";

export type ChatEvent =
  | UiEvent
  | { type: "chat"; sessionId: string; userMessageId: string }
  | { type: "proposal"; action: AgentAction }
  | { type: "proposal_error"; error: string }
  | { type: "saved"; messageId: string };

export type RunTurn = (args: { prompt: string; resumeId: string | null; onEvent: (e: UiEvent) => void; signal?: AbortSignal }) =>
  Promise<{ claudeSessionId: string | null; text: string; isError: boolean; error?: string }>;

function describeResolution(a: AgentAction): string {
  if (a.status === "confirmed") return `- ${a.summary} (${a.kind}): confirmed by the user. Result: ${JSON.stringify(a.result)}`;
  if (a.status === "rejected") return `- ${a.summary} (${a.kind}): declined by the user.`;
  return `- ${a.summary} (${a.kind}): failed. ${JSON.stringify(a.result)}`;
}

export function composePrompt(resolved: AgentAction[], uploads: Upload[], message: string): string {
  const parts: string[] = [];
  if (resolved.length) parts.push(`[Updates since your last reply]\n${resolved.map(describeResolution).join("\n")}`);
  if (uploads.length) parts.push(`[Attached files]\n${uploads.map((u) => `- upload_id=${u.id} name=${u.filename} type=${u.mime} path=${u.path}`).join("\n")}`);
  parts.push(message);
  return parts.join("\n\n");
}

export async function handleChatTurn(opts: {
  db: Database.Database; dataDir: string; sessionId?: string; message: string; uploadIds: string[];
  emit: (e: ChatEvent) => void; runTurn: RunTurn; signal?: AbortSignal;
}): Promise<{ sessionId: string }> {
  const chat = new ChatRepo(opts.db);
  const actions = new ActionsRepo(opts.db);
  const uploadsRepo = new UploadsRepo(opts.db);

  const session = opts.sessionId ? chat.getSession(opts.sessionId) : chat.createSession();
  const uploads = opts.uploadIds.map((id) => uploadsRepo.get(id));
  const prompt = composePrompt(actions.unnotified(session.id), uploads, opts.message);

  const userMsg = chat.addMessage(session.id, "user", opts.message, uploads.length ? { uploads: uploads.map(({ id, filename, mime, size }) => ({ id, filename, mime, size })) } : undefined);
  chat.setTitle(session.id, opts.message.slice(0, 48) || "Files");
  actions.markNotified(session.id);
  opts.emit({ type: "chat", sessionId: session.id, userMessageId: userMsg.id });

  let result: Awaited<ReturnType<RunTurn>>;
  try {
    result = await opts.runTurn({
      prompt,
      resumeId: session.claude_session_id,
      signal: opts.signal,
      onEvent: (e) => {
        if (e.type === "session") chat.setClaudeSession(session.id, e.claudeSessionId);
        if (e.type !== "done") opts.emit(e);
      },
    });
  } catch (err) {
    result = { claudeSessionId: null, text: "", isError: true, error: (err as Error).message };
  }
  if (result.claudeSessionId) chat.setClaudeSession(session.id, result.claudeSessionId);

  const assistant = chat.addMessage(session.id, "assistant", visibleText(result.text), result.isError ? { error: result.error ?? "agent error" } : undefined);
  for (const block of extractActionBlocks(result.text)) {
    const prepared = block.ok ? prepareAction(opts.db, block.value) : { ok: false as const, error: `unreadable action block: ${block.error}` };
    if (prepared.ok) {
      const a = actions.create({ session_id: session.id, message_id: assistant.id, kind: prepared.kind, payload: prepared.payload, summary: prepared.summary });
      opts.emit({ type: "proposal", action: a });
    } else {
      const raw: any = block.ok ? block.value : {};
      const a = actions.create({ session_id: session.id, message_id: assistant.id, kind: String(raw?.kind ?? "unknown"), payload: raw?.payload ?? null, summary: "Proposal" });
      actions.resolve(a.id, "failed", { error: prepared.error });
      opts.emit({ type: "proposal_error", error: prepared.error });
    }
  }
  opts.emit({ type: "saved", messageId: assistant.id });
  opts.emit(result.isError ? { type: "done", isError: true, error: result.error } : { type: "done", isError: false });
  return { sessionId: session.id };
}
