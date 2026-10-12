import { AnimatePresence, motion } from "motion/react";
import { MessageCircle, FileText, Users, Receipt, Landmark, Settings2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Engraving } from "./Engraving";

export type Tab = "agent" | "invoices" | "customers" | "expenses" | "bank" | "settings";
const NAV: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "agent", label: "Agent", icon: MessageCircle },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "customers", label: "Customers", icon: Users },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "bank", label: "Bank", icon: Landmark },
];

const spring = { type: "spring" as const, stiffness: 300, damping: 32 };

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none">
        <circle cx="16" cy="16" r="3.4" />
        <path d="M16 4v6M16 22v6M4 16h6M22 16h6M7.5 7.5l4.2 4.2M20.3 20.3l4.2 4.2M24.5 7.5l-4.2 4.2M11.7 20.3l-4.2 4.2" />
      </g>
    </svg>
  );
}

function Item({ id, label, Icon, active, open, onSelect }: { id: Tab; label: string; Icon: typeof FileText; active: boolean; open: boolean; onSelect: (t: Tab) => void }) {
  return (
    <button onClick={() => onSelect(id)} aria-current={active ? "page" : undefined} title={open ? undefined : label}
      className={`group relative flex h-11 w-full items-center gap-4 rounded-[3px] px-[18px] text-left transition-colors duration-200 ${active ? "text-paper" : "text-paper/65 hover:text-paper"}`}>
      {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-paper" transition={spring} />}
      <Icon size={19} strokeWidth={1.35} className="shrink-0" />
      <AnimatePresence initial={false}>
        {open && (
          <motion.span className="whitespace-nowrap text-[1.05rem]" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.18 }}>
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export function Sidebar({ tab, onSelect, open, onToggle }: { tab: Tab; onSelect: (t: Tab) => void; open: boolean; onToggle: () => void }) {
  return (
    <motion.nav
      aria-label="Main"
      className="relative z-30 flex h-dvh shrink-0 flex-col overflow-hidden bg-ink text-paper max-md:fixed max-md:inset-y-0 max-md:left-0"
      initial={false}
      animate={{ width: open ? 236 : 72 }}
      transition={spring}
    >
      <div className="flex h-[72px] items-center gap-3 px-[22px]">
        <Mark />
        <AnimatePresence initial={false}>
          {open && (
            <motion.span className="text-[1.45rem] italic tracking-[0.01em]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              freebies
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex flex-col gap-1 px-2">
        {NAV.map((n) => <Item key={n.id} id={n.id} label={n.label} Icon={n.icon} active={tab === n.id} open={open} onSelect={onSelect} />)}
      </div>

      <div className="mt-auto px-2 pb-1">
        <Item id="settings" label="Settings" Icon={Settings2} active={tab === "settings"} open={open} onSelect={onSelect} />
        <button onClick={onToggle} aria-label={open ? "Collapse sidebar" : "Expand sidebar"} title={`${open ? "Collapse" : "Expand"} (⌘B)`}
          className="flex h-11 w-full items-center gap-4 rounded-[3px] px-[18px] text-paper/50 transition-colors duration-200 hover:text-paper">
          {open ? <PanelLeftClose size={19} strokeWidth={1.35} /> : <PanelLeftOpen size={19} strokeWidth={1.35} />}
        </button>
      </div>

      <div className="pointer-events-none h-[150px] w-[236px] shrink-0 text-paper">
        <Engraving width={236} height={150} seed={11} ink="#F4EBD8" ground="#0B3986" tufts={22} layers={3} />
      </div>
    </motion.nav>
  );
}
