import { LTTB, type DataPoint, type Indexable } from "downsample";

export type Strategy =
  | "none"
  | "lttb"
  | "peaks-only"
  | "remove-peaks"
  | "nth-point";

export const STRATEGY_LABELS: Record<Strategy, string> = {
  none: "None",
  lttb: "LTTB",
  "peaks-only": "Peaks only",
  "remove-peaks": "Remove peaks",
  "nth-point": "Nth point",
};

/** Whether the strategy uses a targetPoints parameter */
export function usesTargetPoints(s: Strategy): boolean {
  return s === "lttb" || s === "nth-point";
}

/**
 * Returns indices into the original arrays that should be kept.
 * Uses the first value column as reference for algorithms that need values.
 */
export function downsampleIndices(
  time: Date[],
  values: number[],
  strategy: Strategy,
  targetPoints: number,
): number[] {
  const n = time.length;
  if (n === 0) return [];
  if (strategy === "none" || targetPoints >= n) {
    return Array.from({ length: n }, (_, i) => i);
  }

  switch (strategy) {
    case "lttb":
      return lttbIndices(time, values, targetPoints);
    case "peaks-only":
      return peaksOnlyIndices(values);
    case "remove-peaks":
      return removePeaksIndices(values);
    case "nth-point":
      return nthPointIndices(n, targetPoints);
  }
}

function lttbIndices(
  time: Date[],
  values: number[],
  target: number,
): number[] {
  const points: DataPoint[] = time.map((t, i) => ({
    x: t.getTime(),
    y: values[i] ?? 0,
  }));
  const result = LTTB(points as Indexable<DataPoint>, target) as DataPoint[];
  // Map back to indices by matching x values
  const timeMap = new Map<number, number>();
  for (let i = 0; i < time.length; i++) {
    const key = time[i].getTime();
    if (!timeMap.has(key)) timeMap.set(key, i);
  }
  const indices: number[] = [];
  for (const p of result) {
    const x = "x" in p ? (p.x as number) : (p as [number, number])[0];
    const idx = timeMap.get(x);
    if (idx !== undefined) indices.push(idx);
  }
  return indices;
}

function peaksOnlyIndices(values: number[]): number[] {
  if (values.length <= 2)
    return Array.from({ length: values.length }, (_, i) => i);
  const indices: number[] = [0];
  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1] ?? 0;
    const curr = values[i] ?? 0;
    const next = values[i + 1] ?? 0;
    // Keep if direction changes (local min or max)
    if ((curr >= prev && curr >= next) || (curr <= prev && curr <= next)) {
      indices.push(i);
    }
  }
  indices.push(values.length - 1);
  return indices;
}

function removePeaksIndices(values: number[]): number[] {
  if (values.length <= 2)
    return Array.from({ length: values.length }, (_, i) => i);
  const indices: number[] = [0];
  for (let i = 1; i < values.length - 1; i++) {
    const prev = values[i - 1] ?? 0;
    const curr = values[i] ?? 0;
    const next = values[i + 1] ?? 0;
    // Keep if NOT a local min/max (monotonic point)
    const isLocalExtremum =
      (curr >= prev && curr >= next) || (curr <= prev && curr <= next);
    if (!isLocalExtremum) {
      indices.push(i);
    }
  }
  indices.push(values.length - 1);
  return indices;
}

function nthPointIndices(n: number, target: number): number[] {
  const step = Math.max(1, Math.floor(n / target));
  const indices: number[] = [];
  for (let i = 0; i < n; i += step) {
    indices.push(i);
  }
  // Always include last point
  if (indices[indices.length - 1] !== n - 1) {
    indices.push(n - 1);
  }
  return indices;
}
