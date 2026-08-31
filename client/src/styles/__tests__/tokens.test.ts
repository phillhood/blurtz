import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CARD_HUES, CARD_GROUND } from "../tokens";

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return [16, 8, 0]
    .map((shift) => {
      const channel = ((n >> shift) & 255) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    })
    .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("card tokens", () => {
  it("defines exactly the four game colours", () => {
    expect(Object.keys(CARD_HUES).sort()).toEqual([
      "blue",
      "green",
      "red",
      "yellow",
    ]);
  });

  it("keeps every hue distinct", () => {
    expect(new Set(Object.values(CARD_HUES)).size).toBe(4);
  });

  it("clears AA against the emissive card ground", () => {
    for (const [name, hex] of Object.entries(CARD_HUES)) {
      expect(contrast(hex, CARD_GROUND), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every hue clear of the reserved interaction purple", () => {
    for (const [name, hex] of Object.entries(CARD_HUES)) {
      expect(hex.toLowerCase(), name).not.toBe("#a855f7");
    }
  });
});

describe("token parity", () => {
  it("keeps the stylesheet and the module on the same values", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    for (const [name, hex] of Object.entries(CARD_HUES)) {
      expect(css, name).toContain(`--color-card-${name}: ${hex};`);
    }
    expect(css).toContain(`--color-card-ground: ${CARD_GROUND};`);
  });
});
