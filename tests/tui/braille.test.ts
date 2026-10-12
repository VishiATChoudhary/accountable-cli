import { describe, it, expect } from "vitest";
import { brailleLandscape, encodeBraille } from "../../src/tui/braille.js";

describe("braille", () => {
  it("encodes a 2x4 dot cell into one braille character", () => {
    const g = new Uint8Array(2 * 4);
    expect(encodeBraille(g, 2, 4)).toEqual(["⠀"]);
    g.fill(1);
    expect(encodeBraille(g, 2, 4)).toEqual(["⣿"]);
    const top = new Uint8Array(8); top[0] = 1; // left column, top row = dot 1
    expect(encodeBraille(top, 2, 4)).toEqual(["⠁"]);
  });
  it("draws a landscape of the requested size: sky stays empty, ground has ink", () => {
    const lines = brailleLandscape(60, 6, 4);
    expect(lines).toHaveLength(6);
    for (const l of lines) expect([...l]).toHaveLength(60);
    const ink = (l: string) => [...l].filter((c) => c !== "⠀" && c !== " ").length;
    expect(ink(lines[5])).toBeGreaterThan(30);
    expect(ink(lines[0])).toBeLessThan(ink(lines[5]));
  });
});
