/**
 * "Ask the plant" (plan 04): natural-language questions answered from the live twin.
 *
 * The planner here is LOCAL and rule-based (keyword intents → read-only tool calls → a crisp answer
 * with the numbers). It reaches the twin ONLY through `runTool` (agentTools.ts) and records every
 * step in the trace, so plan 09 can swap `localAnswer` for a tool-calling LLM (Nemotron / Muse
 * Spark) without changing the tool, trace or ChatMessage shapes.
 *
 * Advisory only: nothing here calls a simulation action.
 */
import { create } from 'zustand'
import type { ChatMessage } from './types'
import type { PlatformId } from '../sim/types'
import { useSim } from '../state/sim'
import { addTrace, newTraceId } from './alerts'
import { runTool } from './agentTools'
import { runAgent } from '../agents/runtime'
import { useProvider } from '../agents/provider'
import { PLANT_CONTEXT } from '../agents/catalog'

const CAP_CHAT = 100

interface ChatStore {
  messages: ChatMessage[]
  busy: boolean
  clear: () => void
}
export const useChat = create<ChatStore>((set) => ({ messages: [], busy: false, clear: () => set({ messages: [] }) }))

let msgSeq = 0
const push = (m: Omit<ChatMessage, 'id' | 't'>): ChatMessage => {
  const msg: ChatMessage = { ...m, id: `M${++msgSeq}`, t: useSim.getState().t }
  useChat.setState((s) => ({ messages: [...s.messages, msg].slice(-CAP_CHAT) }))
  return msg
}

// ---------------------------------------------------------------- intents
export type Intent = 'status' | 'risk' | 'equipment' | 'alarms' | 'shutdown' | 'fireGas' | 'whatif' | 'permits' | 'barriers' | 'drift' | 'spares' | 'value' | 'insights' | 'help'

const INTENT_RULES: [Intent, RegExp][] = [
  ['insights', /\b(insights?|summary|summari[sz]e|brief(ing)?|priorit\w*|recommend\w*|focus|worry|what should (i|we) do|what matters|biggest (issue|problem|loss))\b/],
  ['spares', /\b(spares?|spare parts?|stock\w*|inventory|reorder|purchase orders?|lead.?times?|cartridges?|seal kits?|bearings?|deliver\w*|supply (boat|vessel|base)|helicopter)\b|do we have (a|an|any)\b/],
  ['value', /\b(revenue|money|costs?|dollars?|financ\w*|economics?|cash|margin|lifting cost|worth|at risk|exposure|carbon|emissions?|co2)\b|\$/],
  ['whatif', /\bwhat (happens|would happen|if)\b|\bwhat-if\b|\bif .* (trips?|fails?|stops?|leaks?)\b/],
  ['barriers', /\b(barriers?|swiss|erosion|hidden|combinations?|line[sd]? up|safety layers?)\b/],
  ['drift', /\b(drift\w*|creep\w*|trend\w*|slowly|heading (to|for))\b/],
  ['shutdown', /\b(shut ?down|shut down|esd\d?|psd|aps|reset|restart)\b/],
  ['permits', /\b(permits?|hot.?work|simops|confined)\b|safe to (weld|work)/],
  ['fireGas', /\b(gas|fire|flame|smoke|leak\w*|detectors?|deluge)\b|f&g/],
  ['alarms', /\b(alarms?|alerts?)\b/],
  ['risk', /\b(risk|danger\w*)\b|why is .* (up|high)|how safe/],
  ['status', /\b(status|production|producing|availability|efficiency|overview|doing)\b|how is (the )?(plant|field|alpha)|how are we/],
  ['help', /\b(help|what can you|who are you)\b/],
]

/** plant items people name in words (so "the export pump" works without the tag) */
const NAMED: [RegExp, string][] = [
  [/export pump/, 'P-1500A'],
  [/air compressor|instrument air compressor/, 'K-4600'],
  [/export compressor|gas compressor|\bcompressor\b/, 'K-2200'],
  [/hp separator|high.pressure separator|\bseparator\b/, 'V-1100'],
  [/lp separator/, 'V-1300'],
  [/turbine|generator|gtg/, 'GT-8100A'],
  [/firewater pump|fire pump/, 'P-7101A'],
  [/cooling medium pump/, 'P-6200A'],
  [/injection pump/, 'P-W310A'],
]

const TAG_RE = /\b[A-Z]{1,5}-[A-Z]?\d{2,5}[A-Z]?\b/g

export function platformIn(q: string): PlatformId | undefined {
  const m = q.match(/\b(alpha|whp-?n|rp|wi|lq)\b/i)
  if (!m) return undefined
  const k = m[1].toLowerCase().replace('whpn', 'whp-n')
  return ({ alpha: 'Alpha', 'whp-n': 'WHP-N', rp: 'RP', wi: 'WI', lq: 'LQ' } as Record<string, PlatformId>)[k]
}

/** pure: which intents a question carries (most specific first) */
export function intentsOf(question: string): Intent[] {
  const q = question.toLowerCase()
  const out: Intent[] = []
  for (const [i, re] of INTENT_RULES) if (re.test(q)) out.push(i)
  return out
}

// ---------------------------------------------------------------- tool helpers (typed views of plain JSON)
type J = Record<string, unknown>
const call = (name: string, args: J, traceId: string) => (runTool(name, args, traceId) ?? {}) as J
const arr = (v: unknown) => (Array.isArray(v) ? (v as J[]) : [])

function resolveTag(question: string, traceId: string): string | undefined {
  const tokens = [...new Set(question.toUpperCase().match(TAG_RE) ?? [])]
  for (const tok of tokens) {
    const r = call('search_tags', { query: tok }, traceId)
    const m = arr(r.matches).find((x) => String(x.tag).toUpperCase() === tok)
    if (m) return String(m.tag)
  }
  const q = question.toLowerCase()
  for (const [re, tag] of NAMED) if (re.test(q)) return tag
  return undefined
}

// ---------------------------------------------------------------- renderers
function renderStatus(r: J): string {
  const sd = arr(r.shutdowns)
  const plats = Object.entries((r.platforms as Record<string, J>) ?? {})
  const lines = [
    `Oil export ${r.oilExportBpd ?? '-'} bbl/d, gas export ${r.gasExportMMscfd ?? '-'} MMscfd, flare ${r.flareMMscfd ?? '-'} MMscfd.`,
    `Production efficiency ${r.efficiencyPct ?? '-'} % now (session PE ${r.pePct ?? '-'} %), availability ${r.availabilityPct ?? '-'} %.`,
    sd.length ? `Latched shutdowns: ${sd.map((s) => `${s.level} ${s.platform}${s.zone ? ` (${s.zone})` : ''}: ${s.cause}`).join('; ')}.` : 'No latched shutdowns.',
  ]
  const ga = plats.filter(([, p]) => p.ga && p.ga !== 'normal')
  if (ga.length) lines.push(`General alarm: ${ga.map(([k, p]) => `${k} ${p.ga}`).join(', ')}.`)
  const cons = arr(r.constraints)
  if (cons.length) lines.push(`Binding constraint: ${cons[0].text} (${cons[0].boe} boe/d).`)
  return lines.join(' ')
}
function renderRisk(r: J): string {
  const contrib = arr(r.contributors)
  const head = r.platform ? `${r.platform} risk is ${r.score}/100 (${r.band}).` : `Field risk is ${r.field}/100 (${r.band}). ${arr(r.platforms).map((p) => `${p.platform} ${p.score}`).join(' · ')}.`
  const why = contrib.length ? ` Top contributors: ${contrib.map((c) => `${c.text} (+${c.points})`).join('; ')}.` : ' Nothing is adding risk right now.'
  return head + why + (r.source === 'fallback-estimate' ? ' (Estimate: the live risk engine has not reported yet.)' : '')
}
function renderAlarms(r: J): string {
  const a = arr(r.alarms)
  const bp = (r.byPriority as number[]) ?? [0, 0, 0]
  if (!a.length) return `No active alarms${r.shelved ? ` (${r.shelved} shelved)` : ''}.`
  return `${r.count} active alarm(s): ${bp[0]} P1, ${bp[1]} P2, ${bp[2]} P3${r.shelved ? `, ${r.shelved} shelved` : ''}. Newest: ${a
    .slice(0, 5)
    .map((x) => `P${x.priority} ${x.tag} ${x.text}${x.value ? ` (${x.value})` : ''}, ${Math.round(Number(x.ageS) / 60)} min ago`)
    .join('; ')}.`
}
function renderEquipment(r: J): string {
  if (r.error) return String(r.error)
  const h = r.health as J | null
  const v = r.valve as J | null
  const metrics = arr(r.metrics)
  const off = metrics.filter((m) => m.state !== 'normal')
  const parts = [
    `${r.tag}: ${r.name} (${r.kind}) on ${r.platform}${r.zoneName ? `, zone ${r.zoneName}` : ''}.`,
    r.runState ? `Run state: ${r.runState}${r.tripCause ? ` (trip: ${r.tripCause})` : ''}.` : '',
    v ? `Valve ${v.position} % open, commanded ${v.command}${v.fault ? `, FAULT ${v.fault}` : ''}${v.by ? ` (by ${v.by})` : ''}.` : '',
    h ? `Health ${h.stage}, degradation ${h.degradationPct} %${h.mode ? ` (${h.mode})` : ''}${h.timeToFailureH !== null ? `, ~${h.timeToFailureH} running h to failure` : ''}.` : '',
    metrics.length ? `Live: ${metrics.slice(0, 5).map((m) => `${m.label} ${m.value} ${m.unit}${m.state !== 'normal' ? ` [${m.state}]` : ''}`).join('; ')}.` : '',
    off.length ? `Out of limits: ${off.map((m) => `${m.label} ${m.state}`).join(', ')}.` : metrics.length ? 'All readings inside their limits.' : '',
    arr(r.openWorkOrders).length ? `Open work orders: ${arr(r.openWorkOrders).map((w) => `${w.id} ${w.title} (${w.status})`).join('; ')}.` : '',
    r.lockout ? `Locked out under ${(r.lockout as J).by}.` : '',
  ]
  return parts.filter(Boolean).join(' ')
}
function renderSensor(r: J): string {
  if (r.error) return String(r.error)
  const l = (r.limits as J | null) ?? {}
  const d = r.drift as J | null
  return `${r.tag} (${r.type} on ${r.on ?? '?'}) reads ${r.value} ${r.unit}: ${r.state}. Limits: LL ${l.loLo ?? '-'} · L ${l.lo ?? '-'} · H ${l.hi ?? '-'} · HH ${l.hiHi ?? '-'}. Recent range ${r.min ?? '-'} … ${r.max ?? '-'}.${d ? ` Drifting ${d.ratePerHour} ${r.unit}/h: ~${d.minutesToTrip} min to the trip at ${d.limit}.` : ''}`
}
function renderShutdown(r: J): string {
  const sd = arr(r.shutdowns)
  if (!sd.length) return String(r.note)
  return sd
    .map((s) => {
      const ce = s.causeEffect as J | null
      return `${s.level}${s.zone ? ` (${s.zone})` : ''} since ${s.since}: ${s.cause}. ${s.reset ? `Reset at ${s.reset}: restart the platform when ready.` : s.resettable ? 'The cause has cleared: it can be reset.' : 'Not resettable yet: the cause is still present.'}${ce ? ` C&E effects: ${(ce.effects as string[]).slice(0, 3).join('; ')}.` : ''}`
    })
    .join(' ')
}
function renderFg(r: J, cams: J | null): string {
  const z = arr(r.zones)
  const d = arr(r.detectorsInAlarm)
  const inh = arr(r.inhibited)
  const parts = [
    z.length ? `Abnormal zones: ${z.map((x) => `${x.name}: gas ${x.gas}, fire ${x.fire}${x.deluge ? ', deluge' : ''}`).join('; ')}.` : `No gas or fire in the ${r.zonesChecked} zones checked.`,
    d.length ? `Detectors in alarm: ${d.slice(0, 6).map((x) => `${x.tag} ${x.value} (${x.state})`).join(', ')}.` : '',
    inh.length ? `Inhibited: ${inh.map((x) => x.tag).join(', ')}: out of the voting.` : '',
    arr(r.faulted).length ? `Faulted: ${arr(r.faulted).map((x) => x.tag).join(', ')}.` : '',
  ]
  if (cams) {
    const c = arr(cams.cameras)
    if (c.length) parts.push(`Cameras: ${c.map((x) => `${x.name}${arr(x.detections).length ? ` sees ${arr(x.detections).map((k) => k.kind).join(', ')}` : ''}`).join('; ')}.`)
  }
  return parts.filter(Boolean).join(' ')
}
function renderPermits(r: J): string {
  const pm = arr(r.permits)
  const cf = arr(r.conflicts)
  const hot = Object.entries((r.hotWorkAllowedNow as Record<string, string>) ?? {})
  const blocked = hot.filter(([, v]) => v !== 'yes')
  return [
    blocked.length ? `Hot work is NOT safe on ${blocked.map(([k, v]) => `${k} (${v})`).join('; ')}.` : `Hot work is allowed by SIMOPS on ${hot.map(([k]) => k).join(', ')}.`,
    pm.length ? `${pm.length} live permit(s): ${pm.slice(0, 5).map((p) => `${p.id} ${p.type} on ${p.tag} (${p.status})`).join('; ')}.` : 'No live permits.',
    cf.length ? `Conflicts: ${cf.map((c) => `${c.permit}: ${c.reason}`).join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
function renderErosion(r: J): string {
  const f = arr(r.findings)
  if (!f.length) return 'No zone has a weakened safety layer right now.'
  const al = f.filter((x) => x.aligned)
  const show = (al.length ? al : f).slice(0, 3)
  return `${al.length ? `${al.length} zone(s) with three or more barriers weakened at once` : 'No aligned barriers, but some layers are weakened'}: ${show
    .map((x) => `${x.zoneName}: ${arr(x.layers).map((l) => l.text).join('; ')}`)
    .join(' | ')}.${al.length ? ` Suggested: ${(show[0].actions as string[]).slice(0, 2).join('; ')}.` : ''}`
}
function renderDrift(r: J): string {
  const d = arr(r.drifting)
  if (!d.length) return `Nothing is drifting towards a trip (${r.signalsWatched} signals watched over ${r.historyMin} min).${r.note ? ` ${r.note}` : ''}`
  return `${d.length} signal(s) creeping towards a trip while still inside their alarm limits: ${d
    .slice(0, 4)
    .map((x) => `${x.label} ${x.value} ${x.unit}, ${Number(x.ratePerHour) > 0 ? '+' : ''}${x.ratePerHour} ${x.unit}/h → ${x.limitName} ${x.limit} in ~${Math.round(Number(x.minutesToTrip))} min`)
    .join('; ')}.`
}

function renderInsights(r: J): string {
  const list = arr(r.insights)
  const lines = [String(r.headline ?? '')]
  if (list.length) lines.push(`Top findings: ${list.slice(0, 4).map((x, i) => `${i + 1}. ${x.title}${Number(x.usdPerDay) > 0 && x.area !== 'safety' ? ` (${usd(x.usdPerDay)}/d)` : ''}`).join(' ')}`)
  else lines.push('Nothing stands out right now.')
  return `${lines.filter(Boolean).join(' ')} (From simulated data: see Asset & economics → Insights.)`
}
function renderSpares(r: J): string {
  const parts = arr(r.parts)
  const cover = (r.cover as J | null) ?? null
  const lines: string[] = []
  if (cover && cover.status && cover.status !== 'notStocked') lines.push(`Repair cover: ${String(cover.note ?? cover.status)}${Number(cover.waitDays) > 0 ? ` (≈ ${Math.round(Number(cover.waitDays))} d to get the parts offshore)` : ''}.`)
  for (const p of parts.slice(0, 4)) {
    const pos = arr(p.openOrders)
    lines.push(
      `${p.id} ${p.name} (class ${p.criticality}): ${p.offshore} offshore, ${p.base} at the supply base${Number(p.reserved) ? `, ${p.reserved} reserved` : ''}; lead ${p.leadDays} d standard / ${p.expediteDays} d expedited${pos.length ? `; on order: ${pos.map((o) => `${o.id} ×${o.qty} (${String(o.stage)}, ETA ${o.eta})`).join(', ')}` : ''}.`,
    )
  }
  if (!parts.length) {
    const short = arr(r.short)
    lines.push(short.length ? `Parts short or below their reorder point: ${short.map((x) => `${x.id} ${x.name} (${x.offshore} offshore, ${x.base} base)`).join('; ')}.` : 'No part is short or below its reorder point.')
  }
  if (Number(r.awaitingMaterials) > 0) lines.push(`${r.awaitingMaterials} work order(s) are waiting for materials.`)
  return `${lines.join(' ')} (Simulated stock: see Spares & supply.)`
}
const usd = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '-'
  const a = Math.abs(n)
  return `${n < 0 ? '−' : ''}$${a >= 1e6 ? `${(a / 1e6).toFixed(2)} M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)} k` : a.toFixed(0)}`
}
function renderValue(r: J): string {
  const s = (r.session as J) ?? {}
  const risks = arr(r.atRisk)
  const def = arr(s.deferredUsd)
  const deck = (r.priceDeck as J) ?? {}
  return [
    `At the assumed price deck ($${deck.oilUsdBbl}/bbl oil, $${deck.gasUsdMMBtu}/MMBtu gas) the field earns ${usd(r.revenueUsdD)}/d, cash margin ${usd(r.cashUsdD)}/d, lifting cost $${r.liftingCostUsdBoe}/boe, carbon intensity ${r.intensityKgBoe} kgCO2e/boe.`,
    def.length ? `Deferred revenue this session: ${def.map((d) => `${String(d.category)} ${usd(d.usd)}`).join(', ')}${Number(s.awaitingSparesUsd) > 0 ? ` (of which ${usd(s.awaitingSparesUsd)} waiting for spares)` : ''}.` : 'Nothing deferred this session yet.',
    risks.length ? `Most at risk over 30 days: ${risks.slice(0, 3).map((a) => `${a.tag} ${usd(a.exposureUsd)} (P ${a.pFail30d} %, spare ${a.spare}): ${a.action}`).join('; ')}.` : '',
    '(Simulated economics: see Asset & economics.)',
  ]
    .filter(Boolean)
    .join(' ')
}

const HELP =
  'Ask me about the live plant: "How is the plant doing?", "What is at risk in dollars?", "Do we have a dry gas seal cartridge?", "What is the risk on Alpha?", "Tell me about K-2200", "What alarms are active?", "Why did Alpha shut down?", "Any gas?", "Is hot work safe now?", "What happens if P-1500A trips?", "Any hidden barrier erosion?", "Is anything drifting towards a trip?". I only read the twin, I never operate it.'

/** tags mentioned in a text that are real plant items */
function tagsInText(text: string, traceId: string, known: Set<string>): string[] {
  const out: string[] = []
  for (const tok of new Set(text.match(TAG_RE) ?? [])) {
    if (known.has(tok)) {
      out.push(tok)
      continue
    }
    if (out.length >= 8) break
    const r = runTool('search_tags', { query: tok }) as J
    if (arr(r.matches).some((m) => m.tag === tok)) out.push(tok)
  }
  void traceId
  return out.slice(0, 8)
}

/**
 * The local planner: question → intents → tool calls → answer. Pure with respect to the plant (reads
 * through runTool only). Returns the answer text, the plant tags it mentions, and the tools it used.
 */
export function localAnswer(question: string, traceId: string): { text: string; tags: string[]; calls: { name: string; args: J }[]; intents: Intent[] } {
  const calls: { name: string; args: J }[] = []
  const c = (name: string, args: J = {}) => {
    calls.push({ name, args })
    return call(name, args, traceId)
  }
  const platform = platformIn(question)
  const tag = resolveTag(question, traceId)
  let intents = intentsOf(question)
  if (!intents.length) intents = tag ? ['equipment'] : ['status', 'risk']
  else if (tag && intents.length === 1 && intents[0] === 'status') intents = ['equipment']
  addTrace(traceId, { actor: 'assistant', kind: 'decide', text: `Intent: ${intents.join(' + ')}${tag ? ` · tag ${tag}` : ''}${platform ? ` · platform ${platform}` : ''}`, data: { intents, tag: tag ?? null, platform: platform ?? null } })

  const parts: string[] = []
  const known = new Set<string>(tag ? [tag] : [])
  const done = new Set<Intent>()
  for (const intent of intents) {
    if (done.has(intent)) continue
    done.add(intent)
    switch (intent) {
      case 'help':
        parts.push(HELP)
        break
      case 'status':
        parts.push(renderStatus(c('get_field_status')))
        break
      case 'risk':
        parts.push(renderRisk(c('get_risk', platform ? { platform } : {})))
        break
      case 'alarms':
        parts.push(renderAlarms(c('get_alarms', { ...(platform ? { platform } : {}), ...(tag ? { tag } : {}) })))
        break
      case 'shutdown':
        parts.push(renderShutdown(c('get_shutdown_cause', { platform: platform ?? 'Alpha' })))
        break
      case 'fireGas': {
        const fg = c('get_fire_gas', platform ? { platform } : {})
        const cams = c('get_cameras', tag ? { tag } : platform ? { platform } : {})
        parts.push(renderFg(fg, cams))
        break
      }
      case 'permits': {
        parts.push(renderPermits(c('get_permits', platform ? { platform } : {})))
        if (!done.has('fireGas')) {
          done.add('fireGas')
          const fg = c('get_fire_gas', platform ? { platform } : {})
          if (arr(fg.zones).length || arr(fg.inhibited).length) parts.push(renderFg(fg, null))
        }
        const er = c('check_barrier_erosion', platform ? { platform } : {})
        if (Number(er.aligned) > 0) parts.push(`Before any hot work: ${renderErosion(er)}`)
        break
      }
      case 'barriers':
        parts.push(renderErosion(c('check_barrier_erosion', platform ? { platform } : {})))
        break
      case 'drift':
        parts.push(renderDrift(c('check_sensor_drift', { ...(platform ? { platform } : {}), ...(tag ? { tag } : {}) })))
        break
      case 'whatif': {
        const m = arr(c('find_scenarios', { query: question, ...(tag ? { tag } : {}) }).matches).filter((x) => Number(x.score) >= 2)
        if (!m.length) {
          parts.push(`I have no scenario that matches "${question}". Try the Risk & what-if page for the scenario library.`)
          break
        }
        const r = c('get_scenario_consequence', { scenarioId: m[0].id })
        const cq = r.consequence as J | null
        if (cq) {
          const chain = arr(cq.chain)
          const dboe = (cq.deferredBoe as J) ?? {}
          parts.push(
            `Closest scenario: "${r.title}". ${chain.length ? `Likely chain: ${chain.slice(0, 5).map((s) => `${s.t} ${s.text}`).join(' → ')}.` : ''} Worst case ${cq.worstShutdown ?? '-'} on ${arr(cq.platforms).join(', ') || '-'}; deferred ≈ ${dboe.unmitigated ?? '-'} boe unmitigated vs ${dboe.ideal ?? '-'} with a good response; risk peak ~${cq.riskPeak ?? '-'}. ${arr(cq.barriers).length ? `What stops it: ${(cq.barriers as unknown as string[]).slice(0, 3).join('; ')}.` : ''}`,
          )
        } else {
          parts.push(`Closest scenario: "${r.title}": ${r.summary} What stops it escalating: ${(r.expected as string[]).slice(0, 3).join('; ')}. A good response defers about ${r.idealDeferredBoe} boe.`)
        }
        break
      }
      case 'insights':
        parts.push(renderInsights(c('get_insights')))
        break
      case 'spares':
        parts.push(renderSpares(c('get_spares', { ...(tag ? { tag } : {}), query: question })))
        break
      case 'value':
        parts.push(renderValue(c('get_economics')))
        break
      case 'equipment':
        if (!tag) break
        {
          const e = c('get_equipment', { tag })
          if (e.error) {
            const sn = c('get_sensor', { tag })
            parts.push(sn.error ? `I could not find ${tag} in this plant.` : renderSensor(sn))
          } else parts.push(renderEquipment(e))
        }
        break
    }
  }
  if (tag && !done.has('equipment') && !done.has('whatif') && !done.has('drift') && !done.has('spares') && !done.has('value')) {
    const e = c('get_equipment', { tag })
    if (!e.error) parts.push(renderEquipment(e))
  }
  const text = parts.filter(Boolean).join('\n\n') || HELP
  return { text, tags: tagsInText(text, traceId, known), calls, intents }
}

/** ask the plant a question (local planner today; plan 09 swaps in a model behind the same shape) */
export async function ask(question: string): Promise<ChatMessage> {
  const q = question.trim()
  push({ role: 'user', text: q })
  useChat.setState({ busy: true })
  const traceId = newTraceId('Q')
  addTrace(traceId, { actor: 'operator', kind: 'observe', text: `Question: "${q}"` })
  // a short pause so the answer reads like it was worked out, not pasted
  await new Promise((r) => setTimeout(r, 350))
  let msg: ChatMessage
  // a remote model (Nemotron / Muse) when one is selected; the local planner otherwise or on failure
  if (useProvider.getState().provider !== 'sim') {
    try {
      const r = await runAgent({ traceId, system: PLANT_CONTEXT, user: q, maxSteps: 6 })
      const tags = tagsInText(r.text, traceId, new Set())
      addTrace(traceId, { actor: 'assistant', kind: 'answer', text: `Answered by ${r.model} with ${r.toolCalls} tool call(s)`, data: { planner: r.provider, model: r.model } })
      msg = push({ role: 'assistant', text: r.text || '(no answer)', tags, traceId })
      useChat.setState({ busy: false })
      return msg
    } catch (e) {
      addTrace(traceId, { actor: 'assistant', kind: 'decide', text: `Model unavailable (${e instanceof Error ? e.message : String(e)}): falling back to the local planner` })
    }
  }
  try {
    const a = localAnswer(q, traceId)
    addTrace(traceId, {
      actor: 'assistant',
      kind: 'answer',
      text: `Answered with ${a.calls.length} tool call(s): ${a.calls.map((x) => x.name).join(', ') || 'none'}`,
      data: { planner: 'local-rules', intents: a.intents, calls: a.calls, tags: a.tags },
    })
    msg = push({ role: 'assistant', text: a.text, tags: a.tags, traceId })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    addTrace(traceId, { actor: 'assistant', kind: 'answer', text: `Failed: ${err}` })
    msg = push({ role: 'assistant', text: `Sorry: I could not work that out (${err}).`, traceId })
  } finally {
    useChat.setState({ busy: false })
  }
  return msg
}
