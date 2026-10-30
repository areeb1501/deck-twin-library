/**
 * Equipment knowledge base types (content in model/knowledge.ts). One entry per kind of thing a
 * person can walk up to — equipment roles, valves, instruments, piping services — explaining what it
 * is, how it's used in oil & gas, and what "good" looks like when it's running.
 */
export interface KnowledgeParam {
  name: string
  /** ideal / normal operating value or band, e.g. "40–45", "< 4.5" */
  ideal: string
  unit?: string
  note?: string
}

export interface Knowledge {
  id: string
  title: string
  /** one or two sentences */
  summary: string
  howItWorks: string
  useCases: string[]
  parameters: KnowledgeParam[]
  /** typical instruments / measurements on it */
  instrumentation?: string[]
  /** common problems, failure modes, upsets */
  issues: string[]
  maintenance: string[]
  safety: string[]
  standards: string[]
}
