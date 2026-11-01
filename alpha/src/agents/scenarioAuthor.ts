/**
 * The scenario author: a conversation with a model that ends in a scenario the simulator can run. The model writes a spec
 * (sim/scen/spec.ts), never code. Each one is validated against the plant and run once with nobody at the console, and what
 * fails goes back to the model. Real money goes through here, so the spending rules are the design:
 *
 *  - A request goes out only when the operator presses Send. Nothing runs on load or in the background.
 *  - One Send may cost at most 1 + MAX_REPAIRS requests, and each one is shown in the chat.
 *  - A page load may spend CAP_REQUESTS and CAP_TOKENS, then it stops. The running count stays on screen.
 *  - Any error stops the turn. There are no retries.
 *
 * The conversation and the draft stay in this browser. Keys stay in safety/metaKey.ts, and only the provider sees them.
 */
import { create } from 'zustand'
import { forgetKey, hasKey, loadKey, saveKey } from '../safety/metaKey'
import { useMeta } from '../safety/metaSam'
import { newScenarioId, useCustom, type ChatLine } from '../sim/scen/custom'
import type { DryRunReport } from '../sim/scen/dryRun'
import type { ScenarioSpec } from '../sim/scen/spec'
import { validate } from '../sim/scen/validate'
import { usePlantStore } from '../state/plantStore'
import { askModel, AUTHOR_PROVIDERS, modelOf, priceOf, type Answer, type AuthorProviderId, type ChatMessage } from './authorProvider'
import { systemPrompt } from './scenarioPrompt'

/** automatic follow-ups one Send may spend fixing what the checks found */
export const MAX_REPAIRS = 2
export const CAP_REQUESTS = 24
export const CAP_TOKENS = 400_000
const DRY_RUN_MS = 60_000
const SETTINGS_KEY = 'deckTwin.scenarioAuthor.v1'
const DRAFT_KEY = 'deckTwin.scenarioDraft.v1'

export type Stage = 'idle' | 'thinking' | 'writing' | 'checking' | 'testing'

export interface Draft {
  spec: ScenarioSpec | null
  errors: string[]
  warnings: string[]
  report: DryRunReport | null
  /** what wrote it */
  model: string
}

interface Settings {
  provider: AuthorProviderId
  models: Partial<Record<AuthorProviderId, string>>
  endpoint: string
}

export interface Usage {
  requests: number
  input: number
  output: number
  /** null when any request ran on a model with no known price */
  usd: number | null
}

interface AuthorStore extends Settings {
  /** a key is saved for each provider (null until asked) */
  saved: Partial<Record<AuthorProviderId, boolean>>
  chat: ChatLine[]
  draft: Draft | null
  /** the saved scenario this conversation is editing */
  editing: string | null
  stage: Stage
  /** the answer as it arrives */
  partial: string
  note: string
  usage: Usage
  setProvider: (p: AuthorProviderId) => void
  setModel: (m: string) => void
  setEndpoint: (e: string) => void
  saveProviderKey: (key: string) => Promise<void>
  forgetProviderKey: () => Promise<void>
  send: (text: string) => Promise<void>
  stop: () => void
  newChat: () => void
  edit: (id: string) => void
  save: () => string | null
}

const load = <T,>(key: string): Partial<T> => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return v && typeof v === 'object' ? (v as Partial<T>) : {}
  } catch {
    return {}
  }
}
const store = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* quota / private mode */
  }
}

const settings0 = load<Settings>(SETTINGS_KEY)
const draft0 = load<{ chat: ChatLine[]; draft: Draft | null; editing: string | null }>(DRAFT_KEY)
const USAGE0: Usage = { requests: 0, input: 0, output: 0, usd: 0 }
let lineSeq = 0
const line = (role: ChatLine['role'], text: string, specJson?: string): ChatLine => ({ id: `${Date.now().toString(36)}-${++lineSeq}`, role, text, specJson })
let controller: AbortController | null = null

function persist() {
  const s = useAuthor.getState()
  store(SETTINGS_KEY, { provider: s.provider, models: s.models, endpoint: s.endpoint } satisfies Settings)
  store(DRAFT_KEY, { chat: s.chat, draft: s.draft, editing: s.editing })
}

async function refreshSaved(p: AuthorProviderId) {
  try {
    const saved = await hasKey(AUTHOR_PROVIDERS[p].keyId)
    useAuthor.setState((s) => ({ saved: { ...s.saved, [p]: saved } }))
  } catch {
    useAuthor.setState((s) => ({ saved: { ...s.saved, [p]: false } }))
  }
}

export const useAuthor = create<AuthorStore>((set, get) => ({
  provider: settings0.provider && AUTHOR_PROVIDERS[settings0.provider] ? settings0.provider : 'modal',
  models: settings0.models ?? {},
  endpoint: settings0.endpoint ?? '',
  saved: {},
  chat: Array.isArray(draft0.chat) ? draft0.chat : [],
  draft: draft0.draft ?? null,
  editing: draft0.editing ?? null,
  stage: 'idle',
  partial: '',
  note: '',
  usage: USAGE0,
  setProvider: (provider) => {
    set({ provider, note: '' })
    persist()
    void refreshSaved(provider)
  },
  setModel: (m) => {
    set((s) => ({ models: { ...s.models, [s.provider]: m } }))
    persist()
  },
  setEndpoint: (endpoint) => {
    set({ endpoint: endpoint.trim() })
    persist()
  },
  saveProviderKey: async (key) => {
    const p = get().provider
    if (p === 'meta') await useMeta.getState().save(key)
    else await saveKey(key, AUTHOR_PROVIDERS[p].keyId)
    await refreshSaved(p)
    set({ note: '' })
  },
  forgetProviderKey: async () => {
    const p = get().provider
    if (p === 'meta') await useMeta.getState().forget()
    else await forgetKey(AUTHOR_PROVIDERS[p].keyId)
    await refreshSaved(p)
  },
  send: (text) => send(text),
  stop: () => controller?.abort(),
  newChat: () => {
    set({ chat: [], draft: null, editing: null, note: '', partial: '' })
    persist()
  },
  edit: (id) => {
    const x = useCustom.getState().items.find((y) => y.id === id)
    if (!x) return
    set({ chat: x.chat, draft: { spec: x.spec, errors: [], warnings: [], report: null, model: x.model }, editing: id, note: '' })
    persist()
  },
  save: () => {
    const { draft, chat, editing } = get()
    if (!draft?.spec || draft.errors.length) return 'Fix the problems first.'
    if (draft.report?.blockers.length) return 'The unattended run found problems. Ask the model to fix them first.'
    const old = editing ? useCustom.getState().items.find((y) => y.id === editing) : undefined
    const id = old?.id ?? newScenarioId(draft.spec.title)
    const now = new Date().toISOString()
    const ok = useCustom.getState().put({ id, spec: { ...draft.spec, id }, model: draft.model, chat, createdAt: old?.createdAt ?? now, updatedAt: now })
    if (!ok) return 'This browser is out of storage, so the scenario was not saved.'
    set({ editing: id })
    persist()
    return null
  },
}))

const why = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** the JSON in a reply, and the words around it */
export function readReply(text: string): { prose: string; raw: string | null; json: unknown } {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const open = fence ? null : text.match(/\{[\s\S]*\}/)
  const raw = fence?.[1]?.trim() ?? open?.[0] ?? null
  const looksLikeSpec = !!raw && /"timeline"/.test(raw)
  if (!raw || !looksLikeSpec) return { prose: text.trim(), raw: null, json: null }
  const prose = text.replace(fence?.[0] ?? raw, '').trim()
  try {
    return { prose, raw, json: JSON.parse(raw) }
  } catch {
    return { prose, raw, json: undefined }
  }
}

/** what goes to the model: older scenarios drop out, because each reply carries the whole thing and input is billed */
export function messagesFor(system: string, chat: ChatLine[]): ChatMessage[] {
  const latest = chat.map((x) => !!x.specJson).lastIndexOf(true)
  return [
    { role: 'system', content: system },
    ...chat.map((x, i): ChatMessage => {
      if (x.role !== 'assistant') return { role: 'user', content: x.text }
      if (!x.specJson) return { role: 'assistant', content: x.text }
      return { role: 'assistant', content: i === latest ? `${x.text}\n\n\`\`\`json\n${x.specJson}\n\`\`\`` : `${x.text}\n\n[an earlier version of the scenario]` }
    }),
  ]
}

function charge(a: Answer) {
  const price = priceOf(a.model)
  useAuthor.setState((s) => ({
    usage: {
      requests: s.usage.requests + 1,
      input: s.usage.input + a.input,
      output: s.usage.output + a.output,
      usd: price && s.usage.usd !== null ? s.usage.usd + ((a.input - a.cached) * price.in + a.cached * price.cached + a.output * price.out) / 1e6 : null,
    },
  }))
}

export const overLimit = (u: Usage) => u.requests >= CAP_REQUESTS || u.input + u.output >= CAP_TOKENS

/** the unattended run, off the page. It has its own engine, so the live plant never notices */
export async function unattended(spec: ScenarioSpec): Promise<DryRunReport> {
  if (typeof Worker === 'undefined') return (await import('../sim/scen/dryRun')).dryRun(spec)
  const worker = new Worker(new URL('../sim/scen/dryRun.worker.ts', import.meta.url), { type: 'module' })
  try {
    return await new Promise<DryRunReport>((done, fail) => {
      const timer = setTimeout(() => fail(new Error('The unattended run took too long')), DRY_RUN_MS)
      worker.onmessage = (e: MessageEvent<{ report?: DryRunReport; error?: string }>) => {
        clearTimeout(timer)
        if (e.data.report) done(e.data.report)
        else fail(new Error(e.data.error ?? 'The unattended run failed'))
      }
      worker.onerror = (e) => {
        clearTimeout(timer)
        fail(new Error(e.message || 'The unattended run failed'))
      }
      worker.postMessage(spec)
    })
  } finally {
    worker.terminate()
  }
}

const push = (l: ChatLine) => useAuthor.setState((s) => ({ chat: [...s.chat, l] }))

function feedback(errors: string[], report: DryRunReport | null) {
  if (report) {
    const seen = report.alarms.slice(0, 12).map((a) => `${a.tag} at ${a.at} s`).join(', ') || 'none'
    const down = report.shutdowns.map((s) => `${s.level} ${s.platform} (${s.causeId}) at ${s.at} s`).join(', ') || 'none'
    return `Checks failed. The scenario ran once with nobody at the console:\n${report.blockers.map((b) => `- ${b}`).join('\n')}\nSteps that fired: ${report.fired.map((f) => `${f.id} at ${f.at} s`).join(', ') || 'none'}. Steps that did not: ${report.quiet.join(', ') || 'none'}. Alarms: ${seen}. Shutdowns: ${down}. Idle score ${report.idleScore}.\nFix it and send the whole scenario again.`
  }
  return `Checks failed, the simulator can't run this:\n${errors.slice(0, 20).map((e) => `- ${e}`).join('\n')}\nFix it and send the whole scenario again.`
}

async function send(text: string) {
  const s = useAuthor.getState()
  const words = text.trim()
  if (!words || s.stage !== 'idle') return
  const p = AUTHOR_PROVIDERS[s.provider]
  if (overLimit(s.usage)) return void useAuthor.setState({ note: `Stopped at the limit for this page load: ${CAP_REQUESTS} requests or ${CAP_TOKENS.toLocaleString()} tokens. Reload to carry on. This conversation is kept.` })
  if (p.endpoint && !s.endpoint) return void useAuthor.setState({ note: 'Add your Modal endpoint first.' })
  // busy before the first await, so a second press can't send and bill twice
  useAuthor.setState({ stage: 'thinking', partial: '', note: '' })
  const key = await loadKey(p.keyId).catch(() => null)
  if (!key) return void useAuthor.setState({ stage: 'idle', note: 'Save a key first.' })
  const model = modelOf(p, s.models[s.provider])
  controller = new AbortController()
  push(line('user', words))
  persist()
  const set = useAuthor.setState
  try {
    const system = systemPrompt(usePlantStore.getState().plant)
    for (let repairs = 0; ; repairs++) {
      if (overLimit(useAuthor.getState().usage)) throw new Error(`Stopped at the limit for this page load: ${CAP_REQUESTS} requests or ${CAP_TOKENS.toLocaleString()} tokens. Reload to carry on.`)
      set({ stage: 'thinking', partial: '' })
      const a = await askModel({ provider: s.provider, model, endpoint: s.endpoint, key }, messagesFor(system, useAuthor.getState().chat), controller.signal, (so) =>
        set({ partial: so, stage: so ? 'writing' : 'thinking' }),
      )
      charge(a)
      const r = readReply(a.text)
      push(line('assistant', r.prose, r.raw ?? undefined))
      set({ partial: '' })
      if (r.raw === null) break

      set({ stage: 'checking' })
      const check = r.json === undefined ? { spec: null, errors: ['That was not valid JSON.'], warnings: [] } : validate(r.json, usePlantStore.getState().plant)
      if (check.spec === null) {
        set({ draft: { spec: null, errors: check.errors, warnings: check.warnings, report: null, model } })
        if (repairs >= MAX_REPAIRS) break
        push(line('check', feedback(check.errors, null)))
        continue
      }
      set({ stage: 'testing' })
      const report = await unattended(check.spec)
      set({ draft: { spec: check.spec, errors: [], warnings: check.warnings, report, model } })
      if (!report.blockers.length || repairs >= MAX_REPAIRS) break
      push(line('check', feedback([], report)))
    }
  } catch (e) {
    const stopped = controller.signal.aborted
    set({ note: stopped ? 'Stopped. Anything the provider already generated is still billed.' : why(e) })
  } finally {
    controller = null
    set({ stage: 'idle', partial: '' })
    persist()
  }
}

void refreshSaved(useAuthor.getState().provider)

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window, { __author: useAuthor })
