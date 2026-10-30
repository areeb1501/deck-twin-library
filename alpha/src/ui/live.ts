/**
 * A tiny simulated historian: every instrument gets a smooth, plausible signal around its
 * nominal value (sum of slow sines + noise), so the inspector shows live trends.
 * Replace `sample()` with a real OPC UA / PI / MQTT feed to make the twin live.
 */
import type { Instrument } from '../model/types'

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

export function sample(inst: Instrument, t: number) {
  const h = hash(inst.tag)
  const span = Math.max(Math.abs(inst.nominal) * 0.025, 0.05)
  const v =
    inst.nominal +
    span * (0.9 * Math.sin(t * (0.05 + h * 0.07) + h * 10) + 0.45 * Math.sin(t * (0.23 + h * 0.2) + h * 4) + 0.18 * Math.sin(t * 1.7 + h * 2))
  return v
}

export function history(inst: Instrument, t: number, n = 90, dt = 2) {
  const out: number[] = []
  for (let i = n - 1; i >= 0; i--) out.push(sample(inst, t - i * dt))
  return out
}

export function fmt(v: number) {
  const a = Math.abs(v)
  return a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(2)
}
