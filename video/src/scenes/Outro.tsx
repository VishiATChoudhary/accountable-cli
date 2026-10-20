import { interpolate, useCurrentFrame } from "remotion";
import { DrawnEngraving, Fill, mono, useSpring } from "../parts";
import { BAR, C, ramp } from "../theme";

// 10 s: the landscape again, the name, how to get it. Final hit lands at bar 3 of this scene.
export function Outro() {
  const f = useCurrentFrame();
  const t = useSpring(10, { damping: 12, stiffness: 90 });
  const hit = 3 * BAR;
  const pulse = f >= hit ? Math.exp(-(f - hit) / 6) : 0;
  const pill = useSpring(40);
  const url = useSpring(60);
  const fade = ramp(f, 270, 300);
  return (
    <Fill bg={C.ink}>
      <div style={{ position: "absolute", inset: 0, transform: `scale(${interpolate(f, [0, 300], [1.06, 1]) + pulse * 0.03})` }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: -60, height: 520 }}>
          <DrawnEngraving width={1920} height={560} seed={11} ink={C.paper} ground={C.ink} progress={ramp(f, 0, 110, 0, 1, (x) => x)} tufts={80} peak={1.1} />
        </div>
        <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center", color: C.paper }}>
          <div style={{ fontSize: 230, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, transform: `translateY(${(1 - t) * 80}px) scale(${0.9 + t * 0.1 + pulse * 0.06})`, opacity: t }}>freebies</div>
          <div style={{ display: "inline-block", marginTop: 40, padding: "18px 30px", borderRadius: 14, border: `1.5px solid rgba(244,235,216,.5)`, background: "rgba(8,44,107,.85)", ...mono(25, C.paper), opacity: pill, transform: `translateY(${(1 - pill) * 30}px)` }}>
            <span style={{ opacity: 0.55 }}>$ </span>curl -fsSL https://raw.githubusercontent.com/VishiATChoudhary/freebies/main/install.sh | sh
          </div>
          <div style={{ marginTop: 30, fontSize: 40, fontStyle: "italic", opacity: url, transform: `translateY(${(1 - url) * 20}px)` }}>
            github.com/VishiATChoudhary/freebies
          </div>
          <div style={{ marginTop: 10, fontSize: 28, opacity: url * 0.7 }}>Open source, MIT licensed. Free for good.</div>
        </div>
      </div>
      <div style={{ position: "absolute", inset: 0, background: C.paper, opacity: pulse * 0.35 }} />
      <div style={{ position: "absolute", inset: 0, background: C.deep, opacity: fade }} />
    </Fill>
  );
}
