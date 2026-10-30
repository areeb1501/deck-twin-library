/**
 * Render quality, adapted to how fast this browser actually draws the scene. Level 0 is full quality;
 * each step down sheds the most expensive, least visible work first:
 *   0  high    — pixel ratio up to 1.75, ambient occlusion
 *   1  medium  — pixel ratio 1.25, ambient occlusion
 *   2  low     — pixel ratio 1, no ambient occlusion, more aggressive small-detail culling
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
  level: pinned ?? 0,
  auto: pinned === null,
  fps: 60,
  setLevel: (level) => set({ level }),
  setAuto: (auto) => set({ auto }),
}))

export const QUALITY = {
  dpr: [1.75, 1.25, 1] as const,
  ao: [true, true, false] as const,
  /** objects smaller than this on screen (radius, px) are not drawn */
  cullPx: [1.6, 2.2, 3] as const,
}

if (import.meta.env.DEV) Object.assign(window, { __quality: useQuality })
