import { Easing, interpolate } from "remotion";
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

export const C = { ink: "#0B3986", deep: "#082C6B", paper: "#F4EBD8", lift: "#FAF4E6", white: "#FFFFFF" };
export const SERIF = "EB Garamond";
export const MONO = "'SF Mono', Menlo, Monaco, monospace";

// 120 BPM at 30 fps: one beat is 15 frames, one bar is 60.
export const BEAT = 15;
export const BAR = 60;

for (const [weight, style] of [["400", "normal"], ["400", "italic"], ["500", "normal"], ["600", "normal"]] as const) {
  for (const subset of ["latin", "latin-ext"]) {
    loadFont({ family: SERIF, url: staticFile(`fonts/eb-garamond-${subset}-${weight}-${style}.woff`), weight, style });
  }
}

export const soft = Easing.bezier(0.22, 1, 0.36, 1);
export const sharp = Easing.bezier(0.7, 0, 0.84, 0);

export const ramp = (f: number, a: number, b: number, from = 0, to = 1, ease = soft) =>
  interpolate(f, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

export const typed = (text: string, f: number, start: number, perFrame = 1.6) =>
  text.slice(0, Math.max(0, Math.floor((f - start) * perFrame)));

export const euro = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
