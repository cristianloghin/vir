import type { NormalizeFunction } from "@mikrostack/vir";

export interface Row {
  id: string;
  title: string;
  body: string;
}

const WORDS =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud".split(
    " "
  );

// Deterministic pseudo-random so list contents are stable across reloads
// (no Math.random): a small integer hash of the index.
export function seededInt(n: number, mod: number): number {
  let h = (n + 1) * 2654435761;
  h = (h ^ (h >>> 13)) >>> 0;
  return h % mod;
}

function bodyFor(i: number, words: number): string {
  const start = seededInt(i, WORDS.length);
  return Array.from({ length: words }, (_, k) => WORDS[(start + k) % WORDS.length]).join(" ");
}

export function makeRows(count: number, prefix = "row"): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: `Item ${i}`,
    body: bodyFor(i, 8 + seededInt(i, 40)), // varying lengths -> varying heights
  }));
}

export const normalizeRows: NormalizeFunction<Row> = (rows) =>
  rows.map((row) => ({ id: row.id, content: row }));
