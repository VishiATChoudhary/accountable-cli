import { useMemo } from "react";
import { engraving } from "../../../shared/engraving";

interface Props { width: number; height: number; seed?: number; ink: string; ground: string; className?: string; tufts?: number; layers?: number; peak?: number }

export function Engraving({ width, height, seed = 7, ink, ground, className, tufts = 40, layers = 4, peak = 1 }: Props) {
  const art = useMemo(() => engraving({ width, height, seed, tufts, layers, peak }), [width, height, seed, tufts, layers, peak]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true">
      <defs>{art.layers.map((l) => <clipPath key={l.id} id={l.id}><path d={l.fill} /></clipPath>)}</defs>
      {art.layers.map((l) => (
        <g key={l.id}>
          <path d={l.fill} fill={ground} />
          <g clipPath={`url(#${l.id})`} stroke={ink} fill="none" strokeLinecap="round" strokeWidth={l.w} opacity={l.o}>
            {l.hatch.map((d, k) => <path key={k} d={d} />)}
            {l.shade.map((d, k) => <path key={`s${k}`} d={d} opacity={0.7} />)}
          </g>
          <path d={l.ridge} stroke={ink} strokeWidth={l.w + 0.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      <g stroke={ink} strokeWidth={0.75} fill="none" strokeLinecap="round">{art.grass.map((d, i) => <path key={i} d={d} />)}</g>
    </svg>
  );
}
