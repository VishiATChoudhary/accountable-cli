import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Sidebar, type Tab } from "./components/Sidebar";
import { useAttachments } from "./components/Composer";
import { useChat } from "./lib/chat";
import { api } from "./lib/api";
import { Agent } from "./pages/Agent";
import { Invoices } from "./pages/Invoices";
import { Customers } from "./pages/Customers";
import { Expenses } from "./pages/Expenses";
import { Bank } from "./pages/Bank";
import { Settings } from "./pages/Settings";

const TABS: Tab[] = ["agent", "invoices", "customers", "expenses", "bank", "settings"];
const readHash = (): Tab => { const h = location.hash.replace("#/", "") as Tab; return TABS.includes(h) ? h : "agent"; };
const isNarrow = () => window.matchMedia("(max-width: 767px)").matches;

function Shell() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(readHash);
  const [open, setOpen] = useState(() => !isNarrow() && localStorage.getItem("sidebar") !== "closed");
  const refresh = useCallback(() => { for (const k of ["invoices", "clients", "expenses", "transactions", "invoice"]) qc.invalidateQueries({ queryKey: [k] }); }, [qc]);
  const chat = useChat(refresh);
  const attachments = useAttachments();

  const go = useCallback((t: Tab) => { setTab(t); history.replaceState(null, "", `#/${t}`); if (isNarrow()) setOpen(false); }, []);
  const toggle = useCallback(() => setOpen((o) => { localStorage.setItem("sidebar", o ? "closed" : "open"); return !o; }), []);

  useEffect(() => {
    const onHash = () => setTab(readHash());
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggle(); } };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("keydown", onKey); };
  }, [toggle]);

  const ask = useCallback(async (message: string, files: File[]) => {
    go("agent");
    const uploads = await Promise.all(files.map((f) => api.upload(f)));
    chat.send(message, uploads);
  }, [chat, go]);

  const page = {
    agent: <Agent chat={chat} attachments={attachments} />,
    invoices: <Invoices onCompose={() => go("agent")} />,
    customers: <Customers />,
    expenses: <Expenses onAsk={ask} />,
    bank: <Bank onAsk={ask} />,
    settings: <Settings />,
  }[tab];

  return (
    <div className="grain flex h-dvh overflow-hidden bg-paper text-ink">
      <Sidebar tab={tab} onSelect={go} open={open} onToggle={toggle} />
      <AnimatePresence>
        {open && <motion.div className="fixed inset-0 z-20 bg-ink/20 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={toggle} />}
      </AnimatePresence>
      <main className="relative min-w-0 flex-1 max-md:pl-[72px]">
        <AnimatePresence mode="wait">
          <motion.div key={tab} className={`h-dvh ${tab === "agent" ? "" : "scroll-quiet overflow-y-auto"}`}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            {tab === "agent" ? page : <div className="max-w-[1180px]">{page}</div>}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export function App() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <Shell />
      </MotionConfig>
    </QueryClientProvider>
  );
}
