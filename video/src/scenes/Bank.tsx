import { useCurrentFrame } from "remotion";
import { Cursor, Fill, useSpring } from "../parts";
import { BEAT, C, MONO, ramp, soft } from "../theme";

const TX: [string, string, string, string, boolean][] = [
  ["03.10.", "Nordlicht GmbH", "+3.617,60 €", "Paid: 2026-0007", true],
  ["05.10.", "Deutsche Bahn", "−89,90 €", "Travel", false],
  ["07.10.", "Adobe Systems", "−66,45 €", "Software", false],
  ["12.10.", "Hetzner Online", "−12,49 €", "Hosting", false],
  ["15.10.", "Café Mitte", "−14,20 €", "Meals", false],
  ["20.10.", "Techniker Krankenkasse", "−412,00 €", "Insurance", false],
];

// 6 s: drop the bank export in, every line gets sorted on the beat.
export function Bank() {
  const f = useCurrentFrame();
  const drag = ramp(f, 0, 22, 0, 1);
  const dropped = f >= 24;
  const flash = ramp(f, 24, 28) - ramp(f, 28, 40);
  const sorted = TX.filter((_, i) => f >= 60 + i * BEAT * 0.9).length;
  return (
    <Fill bg={C.paper}>
      <div style={{ position: "absolute", left: 200, top: 90, right: 200, color: C.ink, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 84, fontWeight: 500, letterSpacing: "-0.02em" }}>Bank</div>
        <div style={{ fontSize: 40, fontStyle: "italic", fontVariantNumeric: "tabular-nums", opacity: ramp(f, 50, 60) }}>{sorted} of {TX.length} sorted</div>
      </div>
      <div style={{ position: "absolute", left: 200, right: 200, top: 210, height: 6, background: "rgba(11,57,134,.12)", borderRadius: 3, opacity: ramp(f, 50, 60) }}>
        <div style={{ height: "100%", width: `${(sorted / TX.length) * 100}%`, background: C.ink, borderRadius: 3, transition: "none" }} />
      </div>
      {!dropped || f < 44 ? (
        <div style={{
          position: "absolute", left: 200, right: 200, top: 260, height: 640, borderRadius: 24, border: `3px dashed rgba(11,57,134,${0.3 + flash * 0.6})`,
          background: `rgba(11,57,134,${flash * 0.08})`, display: "grid", placeItems: "center", color: C.ink, fontSize: 40, fontStyle: "italic",
          opacity: 1 - ramp(f, 36, 44), transform: `scale(${1 + flash * 0.02})`,
        }}>
          Drop a CSV or CAMT.053 export
        </div>
      ) : null}
      {!dropped && <FileChip x={1500 - drag * 560} y={900 - drag * 300} />}
      {!dropped && <Cursor x={1500 - drag * 560 + 150} y={900 - drag * 300 + 40} />}
      {f >= 40 && (
        <div style={{ position: "absolute", left: 200, right: 200, top: 270, color: C.ink }}>
          {TX.map((t, i) => <Row key={i} t={t} i={i} at={40 + i * 3} tag={60 + i * BEAT * 0.9} />)}
        </div>
      )}
    </Fill>
  );
}

function FileChip({ x, y }: { x: number; y: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", gap: 14, alignItems: "center", padding: "18px 26px", background: C.white, borderRadius: 14, boxShadow: "0 24px 50px rgba(11,57,134,.25)", color: C.ink, fontSize: 28, transform: "rotate(-4deg)" }}>
      <svg width={30} height={36} viewBox="0 0 30 36"><path d="M2 2h18l8 8v24H2z" fill="none" stroke={C.ink} strokeWidth={2.4} strokeLinejoin="round" /><path d="M20 2v8h8" fill="none" stroke={C.ink} strokeWidth={2.4} /></svg>
      umsaetze-oktober.csv
    </div>
  );
}

function Row({ t, i, at, tag }: { t: (typeof TX)[number]; i: number; at: number; tag: number }) {
  const s = useSpring(at, { damping: 16, stiffness: 160 });
  const c = useSpring(tag, { damping: 10, stiffness: 220 });
  const f = useCurrentFrame();
  const [date, who, amt, cat, link] = t;
  const inflow = amt.startsWith("+");
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "150px 1fr 260px 340px", alignItems: "center", height: 98, borderBottom: "1.5px solid rgba(11,57,134,.12)",
      transform: `translateY(${(1 - s) * 60}px)`, opacity: s, fontSize: 34,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 26, opacity: 0.6 }}>{date}</span>
      <span>{who}</span>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: inflow ? 600 : 400 }}>{amt}</span>
      <span style={{ display: "flex", justifyContent: "flex-end" }}>
        {f >= tag && (
          <span style={{
            fontSize: 27, padding: "8px 22px", borderRadius: 999, transform: `scale(${c})`, transformOrigin: "right center",
            background: link ? C.ink : "transparent", color: link ? C.paper : C.ink, border: `2px solid ${C.ink}`,
            boxShadow: `0 0 0 ${(1 - ramp(f, tag, tag + 12, 0, 1, soft)) * 16}px rgba(11,57,134,${0.25 * (1 - ramp(f, tag, tag + 12))})`,
          }}>{cat}</span>
        )}
      </span>
    </div>
  );
}
