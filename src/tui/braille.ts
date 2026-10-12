// Rasterizes the shared engraving onto a braille grid (2x4 dots per character)
// so the terminal shows the same hatched hills as the app and the invoices.
import { engraving } from "../../shared/engraving.js";

const BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]; // [row][col]

export function encodeBraille(grid: Uint8Array, w: number, h: number): string[] {
  const lines: string[] = [];
  for (let cy = 0; cy < h / 4; cy++) {
    let line = "";
    for (let cx = 0; cx < w / 2; cx++) {
      let bits = 0;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) if (grid[(cy * 4 + r) * w + cx * 2 + c]) bits |= BITS[r][c];
      line += String.fromCharCode(0x2800 + bits);
    }
    lines.push(line);
  }
  return lines;
}

type P = [number, number];
function polylines(d: string): P[][] {
  const out: P[][] = [];
  let cur: P[] = [];
  let pen: P = [0, 0];
  for (const [, cmd, rest] of d.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const n = rest.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === "M") { if (cur.length > 1) out.push(cur); pen = [n[0], n[1]]; cur = [pen]; }
    else if (cmd === "L") { pen = [n[0], n[1]]; cur.push(pen); }
    else if (cmd === "Q") {
      const [cx, cy, x, y] = n;
      const [x0, y0] = pen;
      for (let t = 1; t <= 6; t++) { const u = t / 6; cur.push([(1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x, (1 - u) ** 2 * y0 + 2 * (1 - u) * u * cy + u * u * y]); }
      pen = [x, y];
    }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

export function brailleLandscape(cols: number, rows: number, seed = 4): string[] {
  const w = cols * 2, h = rows * 4, k = 3; // geometry drawn at k× then sampled down
  const art = engraving({ width: w * k, height: h * k, seed, tufts: Math.round(cols / 3), layers: 4, peak: 1.15, hatchScale: 0.11 });
  const grid = new Uint8Array(w * h);
  const set = (x: number, y: number) => { const px = Math.round(x / k), py = Math.round(y / k); if (px >= 0 && px < w && py >= 0 && py < h) grid[py * w + px] = 1; };
  const line = (a: P, b: P) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (k * 0.5)));
    for (let i = 0; i <= steps; i++) set(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps);
  };
  const stroke = (d: string) => { for (const pl of polylines(d)) for (let i = 1; i < pl.length; i++) line(pl[i - 1], pl[i]); };

  for (const layer of art.layers) {
    // Occlude whatever lies behind this hill, then engrave it.
    const ridge = polylines(layer.ridge)[0];
    for (let px = 0; px < w; px++) {
      const x = px * k;
      let j = 1;
      while (j < ridge.length - 1 && ridge[j][0] < x) j++;
      const [x0, y0] = ridge[j - 1], [x1, y1] = ridge[j];
      const ry = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0 || 1);
      for (let py = Math.max(0, Math.ceil(ry / k)); py < h; py++) grid[py * w + px] = 0;
    }
    for (const d of layer.hatch) stroke(d);
    stroke(layer.ridge);
  }
  for (const d of art.grass) stroke(d);
  return encodeBraille(grid, w, h);
}
