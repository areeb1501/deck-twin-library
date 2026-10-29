// Unit conversion and nearest-size lookup shared by the standards tables.

export const mm = (v: number) => v / 1000
export const inch = (v: number) => v * 0.0254

/** Closest tabulated value to v (ties go to the larger size). Never throws. */
export function nearest(list: readonly number[], v: number): number {
  if (list.length === 0) return v
  if (!Number.isFinite(v)) return v > 0 ? Math.max(...list) : Math.min(...list)
  let best = list[0]
  let bestD = Math.abs(best - v)
  for (const s of list) {
    const d = Math.abs(s - v)
    if (d < bestD || (d === bestD && s > best)) {
      best = s
      bestD = d
    }
  }
  return best
}

/** Sorted numeric keys of a size-keyed table. */
export function tableKeys(table: Record<number, unknown>): number[] {
  return Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
}
