// NPS as a shop fraction: 0.5 → 1/2, 1.5 → 1-1/2.
export function frac(n: number) {
  const w = Math.floor(n)
  const f = n - w
  const map: Record<string, string> = { '0.125': '1/8', '0.25': '1/4', '0.375': '3/8', '0.5': '1/2', '0.75': '3/4' }
  const fs = map[String(+f.toFixed(3))]
  if (!f) return String(w)
  return w ? `${w}-${fs ?? f}` : (fs ?? String(n))
}
