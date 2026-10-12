import { Box, Text, useStdout } from "ink";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { brailleLandscape } from "./braille.js";
import { FAINT, INK, MUTED, PAPER, tracked } from "./theme.js";
import { VERSION } from "../version.js";

export function useSize() {
  const { stdout: raw } = useStdout();
  const stdout = raw as NodeJS.WriteStream | undefined;
  const read = () => ({ cols: stdout?.columns || 100, rows: stdout?.rows || 30 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    if (!stdout?.on) return;
    const on = () => setSize(read());
    stdout.on("resize", on);
    return () => { stdout.off("resize", on); };
  }, [stdout]);
  return size;
}

/** Full-screen cobalt sheet; content column centered, landscape along the bottom. */
export function Sheet({ children, banner = 0, animate = true }: { children: ReactNode; banner?: number; animate?: boolean }) {
  const { cols, rows } = useSize();
  const showBanner = banner > 0 && rows >= 26;
  const inner = Math.min(cols - 4, 76);
  return (
    <Box flexDirection="column" width={cols} minHeight={rows} backgroundColor={INK}>
      <Box flexDirection="column" flexGrow={1} alignItems="center" paddingTop={1}>
        <Box flexDirection="column" width={inner}>{children}</Box>
      </Box>
      {showBanner && <Landscape cols={cols} rows={banner} animate={animate} />}
    </Box>
  );
}

export function Landscape({ cols, rows, animate }: { cols: number; rows: number; animate: boolean }) {
  const lines = useMemo(() => brailleLandscape(cols, rows, 4), [cols, rows]);
  const [shown, setShown] = useState(animate ? 0 : cols);
  useEffect(() => {
    if (!animate) return;
    const t = setInterval(() => setShown((n) => { if (n >= cols) { clearInterval(t); return cols; } return n + 3; }), 14);
    return () => clearInterval(t);
  }, [animate, cols]);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => <Text key={i} color={PAPER} backgroundColor={INK}>{[...l].slice(0, shown).join("").padEnd(cols, "⠀")}</Text>)}
    </Box>
  );
}

export function Masthead({ right }: { right?: ReactNode }) {
  return (
    <Box justifyContent="space-between" marginBottom={1}>
      <Text color={PAPER} bold>✺  f r e e b i e s</Text>
      <Box>{right ?? <Text color={FAINT}>v{VERSION}</Text>}</Box>
    </Box>
  );
}

export function Heading({ children, note }: { children: string; note?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={PAPER}>{tracked(children)}</Text>
      <Text color={PAPER}>───</Text>
      {note && <Text color={MUTED} italic>{note}</Text>}
    </Box>
  );
}

export function Steps({ at, of }: { at: number; of: number }) {
  return <Text color={MUTED}>{Array.from({ length: of }, (_, i) => (i === at ? "●" : "○")).join(" ")}</Text>;
}

export function Hints({ items }: { items: [string, string][] }) {
  return (
    <Box marginTop={1} gap={3}>
      {items.map(([k, label]) => (
        <Text key={k}><Text color={PAPER} bold>{k}</Text><Text color={FAINT}> {label}</Text></Text>
      ))}
    </Box>
  );
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 80); return () => clearInterval(t); }, []);
  return <Text color={PAPER}>{FRAMES[i]}</Text>;
}
