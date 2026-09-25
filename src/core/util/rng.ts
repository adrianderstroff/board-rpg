/**
 * Deterministic RNG (mulberry32). The state lives inside GameState so saves are reproducible.
 */
export interface RngState {
  seed: number;
}

export class Rng {
  constructor(private readonly state: RngState) {}

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state.seed = (this.state.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** Picks by weight; returns undefined for an empty list. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
    if (total <= 0) return items[0];
    let r = this.next() * total;
    for (const t of items) {
      r -= Math.max(0, weight(t));
      if (r < 0) return t;
    }
    return items[items.length - 1];
  }
}

/** Stable pseudo-random number for tie-breaking without consuming RNG state. */
export function hashNoise(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
