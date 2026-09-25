export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function uniq<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}
