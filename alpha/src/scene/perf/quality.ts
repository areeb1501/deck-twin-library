/**
 * Render quality, adapted to how fast this browser actually draws the scene. Level 0 is full quality;
 * each step down sheds the most expensive, least visible work first:
 *   0  high    — pixel ratio up to 1.5, ambient occlusion, all fire and gas particles
 *   1  medium  — pixel ratio 1.25, ambient occlusion, 3/4 of the particles
 *   2  low     — pixel ratio 1, no ambient occlusion, half the particles, more aggressive small-detail culling
 * Without a pin it starts at medium, so the first seconds are smooth, and climbs if the browser has headroom.
 * `?quality=high|medium|low` pins a level (no adaptation).
 */
import { create } from 'zustand'

export type QualityLevel = 0 | 1 | 2
const PIN = new URLSearchParams(location.search).get('quality')
const pinned: QualityLevel | null = PIN === 'high' ? 0 : PIN === 'medium' ? 1 : PIN === 'low' ? 2 : null

interface Quality {
  level: QualityLevel
  /** adapt automatically to the measured frame rate */
  auto: boolean
  /** smoothed frames per second (for the HUD / tests) */
  fps: number
  setLevel: (l: QualityLevel) => void
  setAuto: (a: boolean) => void
}

export const useQuality = create<Quality>((set) => ({
  level: pinned ?? 1,
  auto: pinned === null,
  fps: 60,
  setLevel: (level) => set({ level }),
  setAuto: (auto) => set({ auto }),
}))

export const QUALITY = {
  dpr: [1.5, 1.25, 1] as const,
  ao: [true, true, false] as const,
  /** share of the fire and gas particles drawn */
  fx: [1, 0.75, 0.5] as const,
  /** objects smaller than this on screen (radius, px) are not drawn */
  cullPx: [1.6, 2.2, 3] as const,
}

if (import.meta.env.DEV) Object.assign(window, { __quality: useQuality })
