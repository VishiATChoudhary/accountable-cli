import { useMemo, type CSSProperties, type ReactNode } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { engraving } from "../../shared/engraving";
import { C, MONO, SERIF, soft } from "./theme";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// The freebies engraving, cut line by line: ridges first, then hatching sweeps down each hill.
export function DrawnEngraving({ width, height, seed = 7, ink, ground, progress, layers = 4, tufts = 40, peak = 1, style }: {
  width: number; height: number; seed?: number; ink: string; ground: string; progress: number; layers?: number; tufts?: number; peak?: number; style?: CSSProperties;
}) {
  const art = useMemo(() => engraving({ width, height, seed, tufts, layers, peak }), [width, height, seed, tufts, layers, peak]);
  const n = art.layers.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMax slice" style={style}>
      <defs>{art.layers.map((l) => <clipPath key={l.id} id={`v-${l.id}`}><path d={l.fill} /></clipPath>)}</defs>
      {art.layers.map((l, i) => {
        const start = (i / n) * 0.45;
        const ridge = clamp01((progress - start) / 0.3);
        return (
          <g key={l.id}>
            <path d={l.fill} fill={ground} opacity={clamp01(ridge * 3)} />
            <g clipPath={`url(#v-${l.id})`} stroke={ink} fill="none" strokeLinecap="round" strokeWidth={l.w * 1.6} opacity={l.o}>
              {l.hatch.map((d, k) => {
                const p = soft(clamp01((progress - start - 0.08 - (k / l.hatch.length) * 0.35) / 0.18));
                return <path key={k} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />;
              })}
              {l.shade.map((d, k) => {
                const p = clamp01((progress - start - 0.2 - (k / Math.max(1, l.shade.length)) * 0.2) / 0.1);
                return <path key={`s${k}`} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} opacity={0.7} />;
              })}
            </g>
            <path d={l.ridge} stroke={ink} strokeWidth={l.w * 1.6 + 0.8} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - soft(ridge)} />
          </g>
        );
      })}
      <g stroke={ink} strokeWidth={1.1} fill="none" strokeLinecap="round">
        {art.grass.map((d, i) => {
          const p = clamp01((progress - 0.75 - (i / art.grass.length) * 0.15) / 0.1);
          return <path key={i} d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />;
        })}
      </g>
    </svg>
  );
}

export function Fill({ bg, children, style }: { bg: string; children?: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, background: bg, overflow: "hidden", fontFamily: SERIF, ...style }}>{children}</div>;
}

// Springs a value in from `at` (frames, relative to the sequence).
export function useSpring(at: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 140, mass: 0.8, ...config } });
}

export function Cursor({ x, y, press = 0 }: { x: number; y: number; press?: number }) {
  return (
    <svg width={44} height={44} viewBox="0 0 24 24" style={{ position: "absolute", left: x, top: y, transform: `scale(${1 - press * 0.18})`, transformOrigin: "4px 3px", filter: "drop-shadow(0 6px 10px rgba(8,44,107,.35))", zIndex: 50 }}>
      <path d="M4 3l15 7.2-6.4 1.7L9.9 18z" fill={C.ink} stroke={C.white} strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

export function Caret({ color }: { color: string }) {
  const frame = useCurrentFrame();
  return <span style={{ display: "inline-block", width: "0.55em", height: "1.05em", background: color, marginLeft: 3, verticalAlign: "-0.15em", opacity: Math.floor(frame / 8) % 2 ? 0.15 : 1 }} />;
}

// A slab of colour that sweeps across the frame, hiding a hard cut at `at`.
export function Wipe({ at, color, dir = 1 }: { at: number; color: string; dir?: 1 | -1 }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -9 || t > 9) return null;
  const x = t < 0 ? interpolate(t, [-9, 0], [-105, 0], { easing: soft }) : interpolate(t, [0, 9], [0, 105], { easing: (v) => v * v });
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 100, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: "-10%", background: color, transform: `translateX(${x * dir}%) skewX(-12deg)` }} />
    </div>
  );
}

export const mono = (size: number, color: string): CSSProperties => ({ fontFamily: MONO, fontSize: size, color, letterSpacing: "-0.01em" });
