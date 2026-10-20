import { interpolate, useCurrentFrame } from "remotion";
import { DrawnEngraving, Fill, useSpring } from "../parts";
import { C, ramp, sharp } from "../theme";

const TITLE = "freebies";

export function Intro() {
  const f = useCurrentFrame();
  const draw = ramp(f, 0, 200, 0, 1, (t) => t);
  const push = interpolate(f, [0, 240], [1.12, 1]);
  // bars 3-4: the riser. Everything rushes at the camera, then the drop cuts in.
  const rush = ramp(f, 205, 240, 0, 1, sharp);
  return (
    <Fill bg={C.ink}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${push + rush * 1.6})`, opacity: 1 - rush * 0.9, transformOrigin: "50% 40%" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 640 }}>
          <DrawnEngraving width={1920} height={640} seed={7} ink={C.paper} ground={C.ink} progress={draw} tufts={70} peak={1.15} />
        </div>
        <div style={{ position: "absolute", top: 170, width: "100%", textAlign: "center", color: C.paper }}>
          <div style={{ fontSize: 250, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {[...TITLE].map((ch, i) => <Letter key={i} ch={ch} at={58 + i * 4} />)}
          </div>
          <Sub />
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, background: C.paper, opacity: ramp(f, 228, 240, 0, 1) }} />
    </Fill>
  );
}

function Letter({ ch, at }: { ch: string; at: number }) {
  const s = useSpring(at, { damping: 11, stiffness: 120 });
  return (
    <span style={{ display: "inline-block", transform: `translateY(${(1 - s) * 140}px) rotate(${(1 - s) * 14}deg)`, opacity: Math.min(1, s * 1.5), filter: `blur(${Math.max(0, (1 - s) * 14)}px)` }}>
      {ch}
    </span>
  );
}

function Sub() {
  const f = useCurrentFrame();
  const rule = ramp(f, 110, 150);
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ width: 520 * rule, height: 1.5, background: C.paper, margin: "0 auto", opacity: 0.7 }} />
      <div style={{ fontSize: 46, fontStyle: "italic", marginTop: 26, opacity: ramp(f, 125, 160), transform: `translateY(${ramp(f, 125, 160, 18, 0)}px)` }}>
        Bookkeeping for German freelancers
      </div>
    </div>
  );
}
