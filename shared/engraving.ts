// Original engraved landscape, shared by the web app (SVG) and invoice PDFs.
// Each ridge is a sum of peaks; the area under it is hatched with lines that follow
// the ridge near the crest and flatten toward the ground, broken at random like a
// hand-cut plate. Steep slopes get short shading strokes; the foreground gets grass.

export interface EngravingLayer { id: string; fill: string; ridge: string; hatch: string[]; shade: string[]; w: number; o: number }
export interface EngravingArt { layers: EngravingLayer[]; grass: string[] }
export interface EngravingOptions { width: number; height: number; seed?: number; tufts?: number; layers?: number; peak?: number; hatchScale?: number }

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = readonly [number, number];
const path = (pts: Pt[]) => pts.map(([x, y], j) => `${j ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

export function engraving({ width: W, height: H, seed = 7, tufts = 40, layers = 4, peak = 1, hatchScale = 1 }: EngravingOptions): EngravingArt {
  const r = rng(seed);
  const step = 3;
  const xs: number[] = [];
  for (let x = -step; x <= W + step; x += step) xs.push(x);

  const out: EngravingLayer[] = [];
  for (let i = 0; i < layers; i++) {
    const depth = i / Math.max(1, layers - 1); // 0 = far, 1 = near
    const base = H * (0.5 + depth * 0.34);
    const amp = H * (0.38 - depth * 0.26) * (i === 0 ? peak : 1);
    const bumps = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({
      c: r() * W, w: W * (0.07 + r() * 0.2) * (1 + depth), h: 0.35 + r() * 0.65, sharp: 1.4 + r() * 1.4,
    }));
    const roll = { f: (1.5 + r() * 2) * Math.PI / W, p: r() * 6.28 };
    const ridgeY = (x: number) => {
      let s = 0;
      for (const b of bumps) s += b.h * Math.exp(-Math.pow(Math.abs(x - b.c) / b.w, b.sharp));
      s = (1 - Math.exp(-s * 1.25)) * 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(x * roll.f + roll.p));
      return base - amp * s + Math.sin(x * 0.31 + i) * 0.6 + Math.sin(x * 0.07 + i * 3) * 1.2;
    };
    const ridge = xs.map((x) => [x, ridgeY(x)] as const);
    const fill = `${path(ridge)}L${W + step} ${H + 2}L${-step} ${H + 2}Z`;

    const hatch: string[] = [];
    const n = Math.max(2, Math.round((14 + (1 - depth) * 26) * hatchScale));
    for (let k = 1; k <= n; k++) {
      const t = Math.pow(k / n, 1.55);
      const pts = ridge.map(([x, y]) => [x, y + t * (H - y) + Math.sin(x * 0.05 + k) * 0.4] as const);
      let seg: Pt[] = [];
      for (const p of pts) {
        if (r() < 0.035) { if (seg.length > 1) hatch.push(path(seg)); seg = []; continue; }
        seg.push(p);
      }
      if (seg.length > 1) hatch.push(path(seg));
    }

    const shade: string[] = [];
    if (depth < 0.7) {
      for (let j = 2; j < ridge.length - 2; j += 2) {
        const [x, y] = ridge[j];
        const slope = (ridge[j + 2][1] - ridge[j - 2][1]) / (4 * step);
        if (slope > 0.3 && r() < 0.45) {
          const len = Math.min(18, 4 + slope * 14 + r() * 5);
          shade.push(`M${x.toFixed(1)} ${(y + 1.5).toFixed(1)}Q${(x - len * 0.1).toFixed(1)} ${(y + 1.5 + len * 0.5).toFixed(1)} ${(x - len * 0.45).toFixed(1)} ${(y + 1.5 + len).toFixed(1)}`);
        }
      }
    }
    out.push({ id: `eng-${seed}-${W}-${i}`, fill, ridge: path(ridge), hatch, shade, w: 0.45 + depth * 0.25, o: 0.6 + depth * 0.35 });
  }

  const grass: string[] = [];
  for (let t = 0; t < tufts; t++) {
    const x = r() * W, y = H * (0.9 + r() * 0.1), size = 3 + r() * r() * 14;
    const blades = 2 + Math.floor(r() * 5);
    for (let b = 0; b < blades; b++) {
      const spread = (b / Math.max(1, blades - 1) - 0.5) * 2;
      const lean = spread * size * (0.35 + r() * 0.45);
      const h = size * (0.6 + r() * 0.5);
      grass.push(`M${(x + spread).toFixed(1)} ${y.toFixed(1)}Q${(x + lean * 0.2).toFixed(1)} ${(y - h * 0.55).toFixed(1)} ${(x + lean).toFixed(1)} ${(y - h).toFixed(1)}`);
    }
  }
  return { layers: out, grass };
}
