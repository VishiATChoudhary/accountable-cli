import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes, type ButtonHTMLAttributes } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6 px-10 pt-10 pb-6 max-md:px-5 max-md:pt-16">
      <div>
        <h1 className="sc text-[1.15rem] font-medium">{title}</h1>
        <div className="mt-2 h-px w-7 bg-ink" />
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}

export function IconButton({ label, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={`grid h-9 w-9 place-items-center rounded-full transition-colors duration-200 hover:bg-ink/[0.07] disabled:opacity-40 ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Button({ variant = "solid", className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "line" | "quiet" }) {
  const look = {
    solid: "bg-ink text-paper hover:bg-ink-deep",
    line: "border border-ink/70 hover:bg-ink/[0.06]",
    quiet: "ink-muted hover:text-ink",
  }[variant];
  return (
    <button className={`inline-flex h-9 items-center gap-2 rounded-[3px] px-4 transition-colors duration-200 disabled:opacity-40 ${look} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="sc ink-muted text-[0.95rem]">{label}</span>
      <input className="mt-1 block w-full rounded-[3px] border border-ink/35 bg-paper-lift px-3 py-2 outline-none transition-colors focus:border-ink" {...rest} />
    </label>
  );
}

export function Area({ label, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="sc ink-muted text-[0.95rem]">{label}</span>
      <textarea rows={3} className="mt-1 block w-full resize-none rounded-[3px] border border-ink/35 bg-paper-lift px-3 py-2 outline-none transition-colors focus:border-ink" {...rest} />
    </label>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-paper/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onClose} />
          <motion.aside
            role="dialog" aria-label={title}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-ink/20 bg-paper shadow-[-24px_0_60px_-30px_rgba(11,57,134,0.35)]"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center justify-between px-7 pt-7 pb-4">
              <h2 className="sc text-[1.05rem] font-medium">{title}</h2>
              <IconButton label="Close" onClick={onClose}><X size={18} strokeWidth={1.4} /></IconButton>
            </div>
            <div className="scroll-quiet flex-1 overflow-y-auto px-7 pb-8">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function ShimmerRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="px-10 max-md:px-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rule flex items-center gap-6 border-b py-[15px]">
          <div className="shimmer h-3" style={{ width: `${18 + ((i * 37) % 20)}%` }} />
          <div className="shimmer h-3 flex-1 opacity-60" />
          <div className="shimmer h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function Empty({ line, children }: { line: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 px-10 py-16 max-md:px-5">
      <p className="text-[1.35rem] italic">{line}</p>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, layoutId }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; layoutId: string }) {
  return (
    <div className="relative inline-flex rounded-full border border-ink/25 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`relative z-10 rounded-full px-3 py-0.5 transition-colors duration-200 ${value === o.value ? "text-paper" : "ink-muted hover:text-ink"}`}>
          {value === o.value && <motion.span layoutId={layoutId} className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
          <span className="sc">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
