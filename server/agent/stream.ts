// Maps Claude Code stream-json lines to the small event vocabulary the UI renders.
import { basename } from "node:path";

export type UiEvent =
  | { type: "session"; claudeSessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool"; id: string; label: string }
  | { type: "tool_done"; id: string; ok: boolean }
  | { type: "denied"; label: string }
  | { type: "done"; isError: boolean; error?: string };

export function toolLabel(name: string, input: any): string {
  if (name === "Bash") {
    const cmd = String(input?.command ?? "").trim();
    const m = cmd.match(/^freebies-ro\s+(\S+)/);
    if (m) return m[1];
    return cmd.length > 40 ? cmd.slice(0, 40) + "…" : cmd;
  }
  if (name === "Read") return basename(String(input?.file_path ?? "file"));
  if (name === "Glob") return "files";
  return name.toLowerCase();
}

export class StreamMapper {
  text = "";
  claudeSessionId: string | null = null;
  finished = false;
  private sawMessage = false;
  private toolNames = new Map<string, string>();

  push(o: any): UiEvent[] {
    const out: UiEvent[] = [];
    if (o?.type === "system" && o.subtype === "init" && o.session_id) {
      this.claudeSessionId = o.session_id;
      out.push({ type: "session", claudeSessionId: o.session_id });
    } else if (o?.type === "stream_event") {
      const ev = o.event ?? {};
      if (ev.type === "message_start") {
        if (this.sawMessage && this.text && !this.text.endsWith("\n\n")) {
          this.text += "\n\n";
          out.push({ type: "delta", text: "\n\n" });
        }
        this.sawMessage = true;
      } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
        this.text += ev.delta.text;
        out.push({ type: "delta", text: ev.delta.text });
      }
    } else if (o?.type === "assistant") {
      for (const b of o.message?.content ?? []) {
        if (b.type === "tool_use") {
          const label = toolLabel(b.name, b.input);
          this.toolNames.set(b.id, label);
          out.push({ type: "tool", id: b.id, label });
        }
      }
    } else if (o?.type === "user") {
      for (const b of o.message?.content ?? []) {
        if (b && typeof b === "object" && b.type === "tool_result") out.push({ type: "tool_done", id: b.tool_use_id, ok: !b.is_error });
      }
    } else if (o?.type === "system" && o.subtype === "permission_denied") {
      out.push({ type: "denied", label: this.toolNames.get(o.tool_use_id) ?? toolLabel(o.tool_name, o.tool_input) });
    } else if (o?.type === "result") {
      this.finished = true;
      if (!this.text && typeof o.result === "string") {
        this.text = o.result;
        out.push({ type: "delta", text: o.result });
      }
      out.push(o.is_error ? { type: "done", isError: true, error: String(o.result ?? o.subtype ?? "error") } : { type: "done", isError: false });
    }
    return out;
  }
}
