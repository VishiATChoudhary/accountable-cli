import { interpolate, useCurrentFrame } from "remotion";
import { DrawnEngraving, Fill, useSpring } from "../parts";
import { BEAT, C, euro, ramp, soft } from "../theme";

const ITEMS = [
  ["Brand system, design work", "32 h", "95,00 €", "3.040,00 €"],
];
const TAGS = ["Gapless numbering", "VAT per rate", "§ 19 UStG ready", "One-click PDF"];

// 6 s: the invoice from the last scene lands as a real document and fills itself in.
export function Invoice() {
  const f = useCurrentFrame();
  const page = useSpring(0, { damping: 15, stiffness: 70 });
  const cam = interpolate(f, [120, 170], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: soft });
  return (
    <Fill bg={C.ink}>
      <div style={{ position: "absolute", inset: 0, perspective: 2200 }}>
        <div style={{
          position: "absolute", left: 300, top: 60, width: 700, height: 990, background: C.white, borderRadius: 4, overflow: "hidden", color: C.ink,
          boxShadow: "0 60px 140px rgba(0,0,0,.5)",
          transform: `translate(${cam * 60}px, ${(1 - page) * 1100 - cam * 330}px) rotateX(${(1 - page) * 40}deg) rotateZ(${(1 - page) * -12}deg) scale(${1 + cam * 0.45})`,
          transformOrigin: "50% 85%",
        }}>
          <Page f={f} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 1140, top: 300, color: C.paper, opacity: 1 - Math.min(1, cam * 3) }}>
        {TAGS.map((t, i) => <Tag key={t} text={t} at={30 + i * BEAT} />)}
      </div>
    </Fill>
  );
}

function Tag({ text, at }: { text: string; at: number }) {
  const s = useSpring(at, { damping: 12, stiffness: 200 });
  return (
    <div style={{ fontSize: 66, lineHeight: 1.3, transform: `translateX(${(1 - s) * 80}px)`, opacity: Math.min(1, s * 1.5), display: "flex", alignItems: "center", gap: 26 }}>
      <span style={{ width: 14, height: 14, borderRadius: 7, background: C.paper, display: "inline-block" }} />{text}
    </div>
  );
}

function Page({ f }: { f: number }) {
  const show = (at: number) => ({ opacity: ramp(f, at, at + 8), transform: `translateY(${ramp(f, at, at + 10, 14, 0)}px)` });
  const total = Math.round(ramp(f, 70, 112, 0, 361760, (t) => 1 - Math.pow(1 - t, 3)));
  return (
    <div style={{ fontSize: 15, position: "relative", height: "100%" }}>
      <div style={{ height: 150, background: C.ink, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, top: 30 }}>
          <DrawnEngraving width={700} height={120} seed={5} ink={C.paper} ground={C.ink} progress={ramp(f, 6, 50, 0, 1, (t) => t)} layers={3} tufts={20} />
        </div>
        <div style={{ position: "absolute", left: 44, top: 26, color: C.paper, fontSize: 30, fontWeight: 500 }}>Lena Hoffmann</div>
      </div>
      <div style={{ padding: "34px 44px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", ...show(14) }}>
          <div style={{ lineHeight: 1.5 }}><div style={{ opacity: 0.55 }}>Billed to</div><div style={{ fontSize: 19 }}>Nordlicht GmbH</div><div>Torstraße 140, 10119 Berlin</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 40, fontWeight: 500, lineHeight: 1 }}>Rechnung</div><div style={{ fontSize: 19, fontStyle: "italic", marginTop: 6 }}>Nr. 2026-0007</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginTop: 30, border: "1px solid rgba(11,57,134,.2)", ...show(22) }}>
          {[["Date", "12.10.2026"], ["Delivery", "Oct 2026"], ["Due", "26.10.2026"]].map(([k, v], i) => (
            <div key={k} style={{ padding: "10px 14px", borderLeft: i ? "1px solid rgba(11,57,134,.2)" : "none" }}><div style={{ opacity: 0.55, fontSize: 13 }}>{k}</div><div style={{ fontSize: 17 }}>{v}</div></div>
          ))}
        </div>
        <div style={{ marginTop: 30, ...show(32) }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 120px", background: C.ink, color: C.paper, padding: "10px 14px", fontSize: 14 }}>
            <span>Description</span><span style={{ textAlign: "right" }}>Qty</span><span style={{ textAlign: "right" }}>Price</span><span style={{ textAlign: "right" }}>Amount</span>
          </div>
          {ITEMS.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 120px", padding: "12px 14px", background: i % 2 ? "rgba(11,57,134,.05)" : "transparent", fontSize: 16, ...show(42 + i * 8) }}>
              <span>{r[0]}</span><span style={{ textAlign: "right" }}>{r[1]}</span><span style={{ textAlign: "right" }}>{r[2]}</span><span style={{ textAlign: "right" }}>{r[3]}</span>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: "auto", width: 300, marginTop: 24, lineHeight: 1.9, fontSize: 16, ...show(60) }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Net</span><span>3.040,00 €</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>VAT 19 %</span><span>577,60 €</span></div>
        </div>
        <div style={{ marginLeft: "auto", width: 340, marginTop: 10, background: C.ink, color: C.paper, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "baseline", ...show(68) }}>
          <span style={{ fontSize: 18 }}>Total due</span><span style={{ fontSize: 30, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{euro(total)}</span>
        </div>
        <div style={{ marginTop: 50, fontSize: 13, lineHeight: 1.6, ...show(80), opacity: 0.6 * ramp(f, 80, 88) }}>
          Please transfer the total by 26.10.2026 to DE89 3704 0044 0532 0130 00, quoting 2026-0007.
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 40, background: C.ink, opacity: ramp(f, 20, 30) }} />
    </div>
  );
}
