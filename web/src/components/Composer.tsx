import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, FileText, Image, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Upload } from "../lib/api";

export interface PendingFile { key: string; file: File; upload?: Upload; error?: string }

export function useAttachments() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const add = (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setFiles((f) => [...f, { key, file }]);
      api.upload(file)
        .then((upload) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, upload } : x))))
        .catch((e) => setFiles((f) => f.map((x) => (x.key === key ? { ...x, error: e.message } : x))));
    }
  };
  const remove = (key: string) => setFiles((f) => f.filter((x) => x.key !== key));
  const clear = () => setFiles([]);
  const ready = files.every((f) => f.upload || f.error);
  return { files, add, remove, clear, ready };
}

export function Composer({ busy, onSend, onStop, attachments }: {
  busy: boolean; onSend: (text: string, uploads: Upload[]) => void; onStop: () => void; attachments: ReturnType<typeof useAttachments>;
}) {
  const [text, setText] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const uploads = attachments.files.flatMap((f) => (f.upload ? [f.upload] : []));
  const canSend = !busy && attachments.ready && (text.trim().length > 0 || uploads.length > 0);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), uploads);
    setText("");
    attachments.clear();
  };

  return (
    <div className="w-full">
      <AnimatePresence initial={false}>
        {attachments.files.length > 0 && (
          <motion.div className="mb-2 flex flex-wrap gap-2" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {attachments.files.map((f) => {
              const Icon = f.file.type.startsWith("image/") ? Image : FileText;
              return (
                <motion.span key={f.key} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                  className={`relative inline-flex max-w-[260px] items-center gap-2 overflow-hidden rounded-[3px] border border-ink/30 bg-paper-lift py-1 pl-2.5 pr-1 text-[0.95rem] ${f.error ? "italic" : ""}`}>
                  {!f.upload && !f.error && <span className="shimmer absolute inset-0 -z-0 opacity-70" />}
                  <Icon size={14} strokeWidth={1.4} className="relative shrink-0" />
                  <span className="relative truncate">{f.error ? `${f.file.name}: ${f.error}` : f.file.name}</span>
                  <button className="relative grid h-6 w-6 place-items-center rounded-full hover:bg-ink/10" aria-label={`Remove ${f.file.name}`} onClick={() => attachments.remove(f.key)}>
                    <X size={13} strokeWidth={1.5} />
                  </button>
                </motion.span>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-stretch rounded-[3px] border border-ink bg-paper-lift transition-shadow duration-300 focus-within:shadow-[0_0_0_4px_rgba(11,57,134,0.08)]">
        <button onClick={() => picker.current?.click()} aria-label="Attach a receipt or bank statement" title="Attach"
          className="ink-muted grid w-11 shrink-0 place-items-center transition-colors hover:text-ink">
          <Paperclip size={18} strokeWidth={1.35} />
        </button>
        <input ref={picker} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv,.xml,.txt" onChange={(e) => { if (e.target.files) attachments.add(e.target.files); e.target.value = ""; }} />
        <textarea
          ref={ta} rows={1} value={text} placeholder="Message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          className="min-h-[50px] flex-1 resize-none bg-transparent py-[12px] pr-3 text-[1.05rem] outline-none"
          aria-label="Message the agent"
        />
        {busy ? (
          <button onClick={onStop} aria-label="Stop" title="Stop" className="grid w-[52px] shrink-0 place-items-center bg-ink text-paper transition-colors hover:bg-ink-deep">
            <Square size={13} strokeWidth={0} fill="currentColor" />
          </button>
        ) : (
          <button onClick={submit} disabled={!canSend} aria-label="Send" title="Send"
            className="grid w-[52px] shrink-0 place-items-center bg-ink text-paper transition-[background-color,opacity] duration-200 hover:bg-ink-deep disabled:opacity-35">
            <ArrowRight size={19} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
