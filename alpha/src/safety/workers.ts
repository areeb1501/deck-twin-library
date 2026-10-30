/** Simulated field workers (plan 06). Stub: the store shape is final. */
import { create } from 'zustand'
import type { WorkerInfo, WorkerPose } from './types'

/** live poses by worker id — mutated every frame by scene/Workers.tsx */
export const workerPose: Record<string, WorkerPose> = {}

interface WorkerStore {
  roster: WorkerInfo[]
}
export const useWorkers = create<WorkerStore>(() => ({ roster: [] }))
