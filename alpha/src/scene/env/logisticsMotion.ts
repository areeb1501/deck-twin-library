/**
 * Shared motion helpers for the logistics animations (scene/env/Vessel.tsx, scene/env/Helicopter.tsx): a
 * smooth sim clock, the progress through a logistics leg and the forward-only display timeline.
 */
import { useSim } from '../../state/sim'
import type { LogisticsLeg } from '../../sim/assetTypes'

/** sim clock, extrapolated between engine ticks so motion is smooth at any speed */
const clk = { t: Number.NaN, wall: 0 }
export function simNowSmooth() {
  const st = useSim.getState() as { t?: number; speed?: number }
  const t = st.t ?? 0
  const now = performance.now() / 1000
  if (t !== clk.t) {
    clk.t = t
    clk.wall = now
  }
  return t + Math.min(now - clk.wall, 0.6) * (st.speed ?? 0)
}
/** progress through the leg's current state (time based when the leg has an end time) */
export function legProgress(leg: LogisticsLeg, now: number) {
  if (leg.until > leg.since) return Math.min(1, Math.max(0, (now - leg.since) / (leg.until - leg.since)))
  return Math.min(1, Math.max(0, leg.progress || 0))
}
/**
 * Forward-only chase of a display timeline (0 … 3 per cycle) towards `target`, at most `rate(phase)` units per
 * second. A target behind the display in an earlier phase is the next cycle (play on and wrap); behind in
 * the same phase (clock jitter) is held. `target` 3 = end of the cycle: play out, then rest at 0.
 */
export function chaseTimeline(cur: number, target: number, dt: number, rate: (phase: number) => number) {
  let tgt = target
  if (tgt >= 3) tgt = cur <= 1e-9 ? 0 : 3
  else if (tgt < cur - 1e-6) {
    if (Math.floor(tgt) < Math.floor(cur)) tgt += 3
    else return cur
  }
  let s = cur
  let left = dt
  while (left > 1e-6 && s < tgt - 1e-9) {
    const r = rate(Math.floor(s) % 3)
    const end = Math.min(Math.floor(s + 1e-9) + 1, tgt)
    const need = (end - s) / r
    if (need <= left) {
      s = end
      left -= need
    } else {
      s += r * left
      left = 0
    }
  }
  return s >= 3 - 1e-9 ? Math.max(0, s - 3) : s
}
