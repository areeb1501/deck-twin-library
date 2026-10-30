/** Alert rules, outbox and trace log (plan 04). Stub: the store shape is final. */
import { create } from 'zustand'
import type { Alert, TraceStep } from './types'

/** default alert recipient (prototype). Never abdullahweb24bd@gmail.com. */
export const DEFAULT_RECIPIENT = 'areeb.projects@gmail.com'

interface AlertStore {
  alerts: Alert[]
  trace: TraceStep[]
  recipients: string[]
  /** email channel: 'outbox' drafts only (browser prototype); 'server' posts to the alert endpoint (plan 09) */
  channel: 'outbox' | 'server'
}
export const useAlerts = create<AlertStore>(() => ({ alerts: [], trace: [], recipients: [DEFAULT_RECIPIENT], channel: 'outbox' }))
