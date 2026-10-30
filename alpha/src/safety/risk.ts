/** Live risk engine (plan 02). Stub: the store shape is final, the scoring is filled in by plan 02. */
import { create } from 'zustand'
import type { RiskHistoryPoint, RiskSnapshot } from './types'

interface RiskStore {
  now: RiskSnapshot | null
  history: RiskHistoryPoint[]
}
export const useRisk = create<RiskStore>(() => ({ now: null, history: [] }))
