import { Box, Text, useInput } from "ink";
import { useEffect, useReducer, useState } from "react";
import type Database from "better-sqlite3";
import { BusinessRepo, type Business } from "../db/repositories/business.js";
import type { AgentStatus } from "./agent.js";
import { Heading, Hints, Masthead, Sheet, Spinner, Steps } from "./components.js";
import { ALERT, FAINT, INK, MUTED, PAPER } from "./theme.js";
import { email, iban, required, vatId, type Check } from "./validate.js";

type Key = "name" | "address" | "tax_number" | "vat_id" | "email" | "iban";
const FIELDS: { key: Key; label: string; hint: string; check?: Check }[] = [
  { key: "name", label: "Name", hint: "you or your business", check: required("name") },
  { key: "address", label: "Address", hint: "street, postcode and city" },
  { key: "tax_number", label: "Tax number", hint: "Steuernummer, e.g. 12/345/67890" },
  { key: "vat_id", label: "VAT ID", hint: "USt-IdNr., optional", check: vatId },
  { key: "email", label: "Email", hint: "optional", check: email },
  { key: "iban", label: "IBAN", hint: "where clients pay you", check: iban },
];
const TOGGLE = FIELDS.length; // index of the Kleinunternehmer toggle
const LABEL_W = 14;

export type Finish = "app" | "finish";
type Step = "welcome" | "details" | "agent" | "done";

interface State { step: Step; values: Record<Key, string>; klein: boolean; focus: number; error: string | null; choice: number; agentReady: boolean; saved: boolean; finished: Finish | null }
type Action =
  | { t: "text"; text: string } | { t: "backspace" } | { t: "enter" } | { t: "next" } | { t: "prev" } | { t: "esc" }
  | { t: "klein"; v: boolean | "flip" } | { t: "choice" } | { t: "agentReady" };

const validate = (s: State, i: number) => { const f = FIELDS[i]; return f?.check ? f.check(s.values[f.key]) : null; };

/** Pure keyboard state machine: every key, including a burst of pasted keys, is applied in order. */
function reduce(s: State, a: Action): State {
  if (s.finished) return s;
  switch (s.step) {
    case "welcome":
      return a.t === "enter" ? { ...s, step: "details" } : s;
    case "agent":
      if (a.t === "enter" && s.agentReady) return { ...s, step: "done" };
      if (a.t === "esc") return { ...s, step: "details" };
      if (a.t === "agentReady") return { ...s, agentReady: true };
      return s;
    case "done":
      if (a.t === "choice" || a.t === "next" || a.t === "prev") return { ...s, choice: 1 - s.choice };
      if (a.t === "enter") return { ...s, finished: s.choice === 0 ? "app" : "finish" };
      return s;
  }
  // details
  const go = (focus: number): State => ({ ...s, error: null, focus: Math.max(0, Math.min(TOGGLE, focus)) });
  switch (a.t) {
    case "esc": return s.focus === 0 ? { ...s, step: "welcome", error: null } : go(s.focus - 1);
    case "prev": return go(s.focus - 1);
    case "enter":
    case "next": {
      if (s.focus === TOGGLE) {
        const bad = FIELDS.findIndex((_, i) => validate(s, i));
        if (bad >= 0) return { ...s, focus: bad, error: validate(s, bad) };
        return a.t === "enter" ? { ...s, step: "agent", saved: true, error: null } : s;
      }
      const msg = validate(s, s.focus);
      return msg ? { ...s, error: msg } : go(s.focus + 1);
    }
    case "klein": return s.focus === TOGGLE ? { ...s, klein: a.v === "flip" ? !s.klein : a.v } : s;
    case "backspace": {
      if (s.focus === TOGGLE) return s;
      const k = FIELDS[s.focus].key;
      return { ...s, error: null, values: { ...s.values, [k]: s.values[k].slice(0, -1) } };
    }
    case "text": {
      if (s.focus === TOGGLE) {
        const c = a.text.toLowerCase();
        return c === "y" || c === "j" ? { ...s, klein: true } : c === "n" ? { ...s, klein: false } : c === " " ? { ...s, klein: !s.klein } : s;
      }
      const k = FIELDS[s.focus].key;
      return { ...s, error: null, values: { ...s.values, [k]: s.values[k] + a.text } };
    }
  }
  return s;
}

/** Splits one stdin chunk into ordered actions: text runs, Enter, Backspace. */
function tokenize(input: string): Action[] {
  const out: Action[] = [];
  let text = "";
  const flush = () => { if (text) { out.push({ t: "text", text }); text = ""; } };
  for (const ch of input) {
    if (ch === "\r" || ch === "\n") { flush(); out.push({ t: "enter" }); }
    else if (ch === "\x7f" || ch === "\b") { flush(); out.push({ t: "backspace" }); }
    else if (ch === "\t") { flush(); out.push({ t: "next" }); }
    else if (ch >= " ") text += ch;
  }
  flush();
  return out;
}

export function Onboarding({ db, dataDir, checkAgent, onFinish, animate = true, start = "welcome" }: {
  db: Database.Database; dataDir: string; checkAgent: () => Promise<AgentStatus>; onFinish: (c: Finish) => void; animate?: boolean; start?: Step;
}) {
  const [s, dispatch] = useReducer(reduce, undefined, (): State => {
    const existing = new BusinessRepo(db).get();
    return {
      step: start, focus: 0, error: null, choice: 0, agentReady: false, saved: false, finished: null,
      klein: !!existing.kleinunternehmer,
      values: Object.fromEntries(FIELDS.map((f) => [f.key, String(existing[f.key] ?? "")])) as Record<Key, string>,
    };
  });
  const [agent, setAgent] = useState<AgentStatus | null>(null);
  const { step, values, klein, focus, error, choice } = s;

  useEffect(() => {
    if (step !== "agent" || agent) return;
    checkAgent().then((r) => { setAgent(r); dispatch({ t: "agentReady" }); });
  }, [step, agent, checkAgent]);

  useEffect(() => {
    if (!s.saved) return;
    const biz: Business = { kleinunternehmer: s.klein };
    for (const f of FIELDS) (biz as any)[f.key] = s.values[f.key].trim() || undefined;
    if (biz.vat_id) biz.vat_id = biz.vat_id.replace(/\s+/g, "").toUpperCase();
    new BusinessRepo(db).set(biz);
    db.prepare("INSERT INTO meta (key, value) VALUES ('onboarded_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(new Date().toISOString());
  }, [s.saved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (s.finished) onFinish(s.finished); }, [s.finished, onFinish]);

  useInput((input, key) => {
    if (key.escape) return dispatch({ t: "esc" });
    if (key.upArrow || (key.tab && key.shift)) return dispatch({ t: "prev" });
    if (key.downArrow || key.tab) return dispatch({ t: "next" });
    if (key.leftArrow || key.rightArrow) return dispatch(step === "done" ? { t: "choice" } : { t: "klein", v: "flip" });
    if (key.return) return dispatch({ t: "enter" });
    if (key.backspace || key.delete) return dispatch({ t: "backspace" });
    if (key.ctrl || key.meta) return;
    for (const a of tokenize(input)) dispatch(a);
  });

  if (step === "welcome") {
    return (
      <Sheet banner={9} animate={animate}>
        <Masthead />
        <Box flexDirection="column" marginTop={2}>
          <Text color={PAPER} italic>Bookkeeping for German freelancers.</Text>
          <Text color={PAPER} italic>Invoices, receipts and your bank, all on this machine.</Text>
        </Box>
        <Box marginTop={2}><Text color={MUTED}>Let's set up the details that go on your invoices.</Text></Box>
        <Hints items={[["enter", "begin"], ["ctrl+c", "quit"]]} />
      </Sheet>
    );
  }

  if (step === "details") {
    return (
      <Sheet>
        <Masthead right={<Steps at={0} of={3} />} />
        <Heading note="Printed on every invoice. You can change these later.">Your business</Heading>
        {FIELDS.map((f, i) => {
          const on = i === focus;
          const v = values[f.key];
          return (
            <Box key={f.key} flexDirection="column">
              <Box>
                <Box width={LABEL_W}><Text color={on ? PAPER : MUTED} bold={on}>{f.label}</Text></Box>
                <Box flexGrow={1}>
                  {v ? <Text color={PAPER}>{v}</Text> : <Text color={FAINT} italic>{on ? f.hint : ""}</Text>}
                  {on && <Text color={INK} backgroundColor={PAPER}> </Text>}
                </Box>
              </Box>
              <Box><Box width={LABEL_W} /><Text color={on ? PAPER : FAINT}>{"─".repeat(Math.max(10, 76 - LABEL_W - 2))}</Text></Box>
              {on && error && <Box><Box width={LABEL_W} /><Text color={ALERT}>{error}</Text></Box>}
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text color={focus === TOGGLE ? PAPER : MUTED} bold={focus === TOGGLE}>Kleinunternehmer</Text>
        </Box>
        <Box>
          <Box width={LABEL_W} />
          <Text>
            <Text color={!klein ? INK : MUTED} backgroundColor={!klein ? PAPER : undefined}> no </Text>
            <Text>  </Text>
            <Text color={klein ? INK : MUTED} backgroundColor={klein ? PAPER : undefined}> yes </Text>
            <Text color={FAINT} italic>   no VAT on invoices, § 19 UStG</Text>
          </Text>
        </Box>
        {focus === TOGGLE && error && <Text color={ALERT}>{error}</Text>}
        <Hints items={focus === TOGGLE ? [["y / n", "choose"], ["enter", "save and continue"], ["↑", "back"]] : [["enter", "next"], ["↑", "back"], ["esc", "previous"]]} />
      </Sheet>
    );
  }

  if (step === "agent") {
    return (
      <Sheet>
        <Masthead right={<Steps at={1} of={3} />} />
        <Heading note="Reads receipts and bank statements, drafts invoices. Nothing is saved until you confirm.">The agent</Heading>
        {!agent ? (
          <Box gap={1}><Spinner /><Text color={MUTED}>Looking for Claude Code…</Text></Box>
        ) : agent.ok ? (
          <Text><Text color={PAPER} bold>✓ </Text><Text color={PAPER}>Claude Code {agent.version}</Text><Text color={MUTED}> is ready.</Text></Text>
        ) : (
          <Box flexDirection="column">
            <Text color={ALERT}>Claude Code isn't installed. Everything else works without it.</Text>
            <Text color={MUTED}>To turn on the agent later, run:</Text>
            <Box marginLeft={2} marginTop={1}><Text color={PAPER}>npm install -g @anthropic-ai/claude-code</Text></Box>
          </Box>
        )}
        <Box flexDirection="column" marginTop={2}>
          <Text color={MUTED}>{"Your data".toUpperCase().split("").join(" ")}</Text>
          <Text color={PAPER}>{dataDir}</Text>
          <Text color={FAINT} italic>One SQLite file and your receipts. Nothing leaves this machine.</Text>
        </Box>
        <Hints items={agent ? [["enter", "continue"], ["esc", "back"]] : [["esc", "back"]]} />
      </Sheet>
    );
  }

  const first = values.name.trim().split(/\s+/)[0] || "there";
  const options = ["Open the app", "Finish"];
  return (
    <Sheet banner={8} animate={animate}>
      <Masthead right={<Steps at={2} of={3} />} />
      <Box marginTop={1}><Text color={PAPER} italic>{`You're set, ${first}.`}</Text></Box>
      <Box marginTop={2} gap={2}>
        {options.map((o, i) => (
          <Text key={o} color={i === choice ? INK : PAPER} backgroundColor={i === choice ? PAPER : undefined} bold={i === choice}>{`  ${o}  `}</Text>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={2}>
        <Text color={MUTED}>Any time from your terminal:</Text>
        <Text><Text color={PAPER}>  freebies        </Text><Text color={FAINT}>this screen</Text></Text>
        <Text><Text color={PAPER}>  freebies app    </Text><Text color={FAINT}>open the app</Text></Text>
        <Text><Text color={PAPER}>  freebies --help </Text><Text color={FAINT}>every command</Text></Text>
      </Box>
      <Hints items={[["← →", "choose"], ["enter", "go"]]} />
    </Sheet>
  );
}
