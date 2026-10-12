// Shared by server and web: agent replies embed write proposals as fenced
// ```freebies-action blocks. These helpers hide them from display and parse them.

const OPEN = "```freebies-action";
const BLOCK_RE = /```freebies-action[^\n]*\n([\s\S]*?)\n?```/g;

export function visibleText(raw: string): string {
  let text = raw.replace(BLOCK_RE, "");
  // Unterminated block (still streaming): hide from the opener onward.
  const open = text.indexOf(OPEN);
  if (open >= 0) text = text.slice(0, open);
  // Trailing partial opener such as "`", "``", "```fr" at the start of a line.
  const lastLine = text.slice(text.lastIndexOf("\n") + 1);
  const before = text.slice(0, text.length - lastLine.length);
  const insideCodeBlock = (before.match(/^```/gm) ?? []).length % 2 === 1;
  if (!insideCodeBlock && lastLine.length > 0 && lastLine.startsWith("`") && OPEN.startsWith(lastLine)) {
    text = text.slice(0, text.length - lastLine.length);
  }
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

export type ParsedBlock = { ok: true; value: unknown } | { ok: false; error: string; raw: string };

export function extractActionBlocks(raw: string): ParsedBlock[] {
  const out: ParsedBlock[] = [];
  for (const m of raw.matchAll(BLOCK_RE)) {
    try {
      out.push({ ok: true, value: JSON.parse(m[1]) });
    } catch (e) {
      out.push({ ok: false, error: (e as Error).message, raw: m[1] });
    }
  }
  return out;
}
