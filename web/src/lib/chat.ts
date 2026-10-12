import { useCallback, useEffect, useRef, useState } from "react";
import { api, chatStream, type AgentAction, type ChatMessage, type Upload } from "./api";
import { visibleText } from "../../../shared/agent-text";

export interface Live { text: string; activity: string | null }

export function useChat(onDataChanged: () => void) {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    api.latestChat().then((v) => {
      if (v) { setSessionId(v.session.id); setMessages(v.messages); setActions(v.actions); }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const send = useCallback(async (message: string, uploads: Upload[]) => {
    if (ctrl.current) return;
    const c = new AbortController();
    ctrl.current = c;
    setError(null);
    setNotices([]);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: message, meta: uploads.length ? { uploads } : null, created_at: new Date().toISOString() }]);
    setLive({ text: "", activity: null });
    let text = "";
    try {
      for await (const e of chatStream({ sessionId, message, uploadIds: uploads.map((u) => u.id) }, c.signal)) {
        if (e.type === "chat") setSessionId(e.sessionId);
        else if (e.type === "delta") { text += e.text; setLive({ text, activity: null }); }
        else if (e.type === "tool") setLive((l) => ({ text: l?.text ?? text, activity: e.label }));
        else if (e.type === "proposal") setActions((a) => [...a, e.action]);
        else if (e.type === "proposal_error") setNotices((n) => [...n, e.error]);
        else if (e.type === "saved") {
          setMessages((m) => [...m, { id: e.messageId, role: "assistant", content: visibleText(text), meta: null, created_at: new Date().toISOString() }]);
          setLive(null);
        } else if (e.type === "done" && e.isError) setError(e.error === "stopped" ? null : e.error ?? "The agent stopped unexpectedly.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setLive(null);
      ctrl.current = null;
    }
  }, [sessionId]);

  const stop = useCallback(() => ctrl.current?.abort(), []);

  const newChat = useCallback(() => {
    if (ctrl.current) return;
    setSessionId(undefined); setMessages([]); setActions([]); setNotices([]); setError(null);
  }, []);

  const resolve = useCallback(async (id: string, how: "confirm" | "reject") => {
    const updated = how === "confirm" ? await api.confirm(id) : await api.reject(id);
    setActions((a) => a.map((x) => (x.id === id ? updated : x)));
    if (updated.status === "confirmed") onDataChanged();
    return updated;
  }, [onDataChanged]);

  return { sessionId, messages, actions, live, notices, error, loaded, busy: live !== null, send, stop, newChat, resolve };
}
