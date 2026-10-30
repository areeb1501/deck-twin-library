/** CCTV cameras and simulated PPE / hazard detections (plan 07). Stub: the store shape is final. */
import { create } from 'zustand'
import type { CctvCamera, Detection } from './types'

export const CAMERAS: CctvCamera[] = []

interface CctvStore {
  /** detections in the latest frame of each camera */
  live: Record<string, Detection[]>
  /** violations logged (newest first, capped) */
  log: Detection[]
}
export const useCctv = create<CctvStore>(() => ({ live: {}, log: [] }))
