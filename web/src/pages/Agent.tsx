import { AnimatePresence, motion } from "motion/react";
import { FileText, PenLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Composer, type useAttachments } from "../components/Composer";
import { Engraving } from "../components/Engraving";
import { Proposals } from "../components/ProposalCard";
import { IconButton } from "../components/ui";
import type { useChat } from "../lib/chat";
import { visibleText } from "../../../shared/agent-text";

const RESOURCE: Record<string, string> = { clients: "customers", invoices: "invoices", expenses: "expenses", tx: "transactions", quotes: "quotes", business: "your details" };
function activityLabel(label: string | null): string {
  if (!label) return "";
  if (RESOURCE[label]) return `checking ${RESOURCE[label]}`;
  return `reading ${label.replace(/^[0-9a-f]{8}-[0-9a-f-]{27}-/, "")}`;
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{text}</ReactMarkdown>
    </div>
  );
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex h-7 items-center gap-3" role="status" aria-live="polite">
      <span className="breathe h-2.5 w-2.5 rounded-full bg-ink" />
      <AnimatePresence mode="wait">
        {label && (
          <motion.span key={label} className="sc ink-muted" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.2 }}>
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Agent({ chat, attachments }: { chat: ReturnType<typeof useChat>; attachments: ReturnType<typeof useAttachments> }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const empty = chat.loaded && chat.messages.length === 0 && !chat.live;
  const liveText = chat.live ? visibleText(chat.live.text) : "";

  // Follow content growth (streamed text, cards animating in) while pinned to the bottom.
  const observer = useRef<ResizeObserver | null>(null);
  const content = useCallback((inner: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!inner) return;
    // Child refs attach before the parent's, so read the scroller when the observer fires.
    const follow = () => { const el = scroller.current; if (el && pinned.current) el.scrollTop = el.scrollHeight; };
    observer.current = new ResizeObserver(follow);
    observer.current.observe(inner);
    requestAnimationFrame(follow);
  }, []);
  // Sending a message always brings the newest content into view.
  useEffect(() => { pinned.current = true; }, [chat.messages.length]);

  return (
    <div
      className="relative flex h-dvh flex-col"
      onDragEnter={(e) => { if (e.dataTransfer.types.includes("Files")) { depth.current++; setDragging(true); } }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setDragging(false); if (e.dataTransfer.files.length) attachments.add(e.dataTransfer.files); }}
    >
      <div className="absolute right-6 top-6 z-10 max-md:right-4">
        <AnimatePresence>
          {!empty && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IconButton label="New chat" onClick={chat.newChat} disabled={chat.busy}><PenLine size={18} strokeWidth={1.35} /></IconButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div ref={scroller} className="scroll-quiet flex-1 overflow-y-auto"
        onScroll={(e) => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        <AnimatePresence mode="wait">
          {empty ? (
            <motion.div key="empty" className="flex min-h-full flex-col items-center justify-center pb-[22vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.6 }}>
              <p className="px-6 text-center text-[1.65rem] italic leading-snug">Drop a receipt, a statement,<br />or simply ask.</p>
            </motion.div>
          ) : (
            <motion.div key="thread" ref={content} className="mx-auto w-full max-w-[700px] px-6 pb-8 pt-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {chat.messages.map((m) => (
                <div key={m.id}>
                  {m.role === "user" ? (
                    <motion.div className="my-6 flex flex-col items-end" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                      {m.meta?.uploads?.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                          {m.meta.uploads.map((u: any) => (
                            <a key={u.id} href={`/api/uploads/${u.id}`} target="_blank" rel="noreferrer" className="ink-muted inline-flex items-center gap-1.5 text-[0.95rem] hover:text-ink">
                              <FileText size={13} strokeWidth={1.4} />{u.filename}
                            </a>
                          ))}
                        </div>
                      )}
                      {m.content && <div className="max-w-[85%] whitespace-pre-wrap text-right text-[1.08rem] italic">{m.content}</div>}
                    </motion.div>
                  ) : (
                    <div className="my-5 text-[1.05rem]">
                      {m.content && <Markdown text={m.content} />}
                      {m.meta?.error && <p className="mt-1 italic ink-muted">{m.meta.error}</p>}
                    </div>
                  )}
                  <Proposals actions={chat.actions.filter((a) => a.message_id === m.id && !(a.status === "failed" && a.summary === "Proposal"))} onResolve={chat.resolve} />
                </div>
              ))}

              {chat.live && (
                <div className="my-5 text-[1.05rem]">
                  {liveText && <Markdown text={liveText} />}
                  {(!liveText || chat.live.activity) && <div className={liveText ? "mt-3" : ""}><Thinking label={activityLabel(chat.live.activity)} /></div>}
                </div>
              )}

              {chat.notices.map((n, i) => <p key={i} className="ink-muted my-2 text-[0.95rem] italic">Couldn't prepare one change: {n}</p>)}
              {chat.error && <p className="my-3 italic">{chat.error}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {empty && (
          <motion.div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38vh] max-h-[340px] min-h-[200px]"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10, transition: { duration: 0.35 } }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
            <Engraving width={1400} height={340} seed={4} ink="#0B3986" ground="#F4EBD8" tufts={150} layers={5} peak={1.15} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative mx-auto w-full max-w-[700px] px-6 pb-7 pt-2">
        <Composer busy={chat.busy} onSend={chat.send} onStop={chat.stop} attachments={attachments} />
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-[6px] border border-dashed border-ink bg-paper/85"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <p className="text-[1.4rem] italic">Drop to attach</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
