/**
 * Checks a scenario spec against the loaded plant before anything runs it. The failure this guards against is a scenario that
 * reads well and does nothing: a trip on a tag the engine doesn't run, or an objective waiting on a step that can't fire. Every
 * message says what to use instead, because a model reads these and repairs the spec.
 */
import type { Plant } from '../../model/types'
import { simTags } from '../../state/sim'
import { CE_BY_ID } from '../causeEffect'
import { detectors, fireZones } from '../fg'
import { compile } from './compile'
import { unavailable } from './library'
import { BUILTIN_ACTIONS, CATEGORIES, CMP, DIFFICULTIES, LEVELS, METRICS, OPERATOR_ACTIONS, PLATFORMS, SCORE_CATEGORIES, SPEC_KNOBS, SPEC_VERSION, UPSETS, type ActionSpec, type Effect, type GoalSpec, type ScenarioSpec, type StepSpec } from './spec'

export interface SpecCheck {
  /** the spec, cleaned of what the UI can't show */
  spec: ScenarioSpec | null
  /** it can't run until these are fixed */
  errors: string[]
  warnings: string[]
}

export const LIMITS = { steps: 24, goals: 16, actions: 12, list: 8, title: 120, text: 400, conds: 40, minDuration: 300, maxDuration: 3600 }
const LEVEL_VALVES = ['LV-1101', 'LV-1102']
const AUTO_MARKS = ['_down:Alpha', '_down:WHP-N', '_down:RP', '_down:WI']
const ID = /^[a-zA-Z][\w-]{0,39}$/

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** the house rule for visible text, on whatever a model writes */
const plainText = (t: string) => t.replace(/(\d)\s*–\s*(\d)/g, '$1 to $2').replace(/\s*[—–]\s*/g, ': ').trim()

function clean<T>(v: T, max = LIMITS.text): T {
  if (typeof v === 'string') return plainText(v).slice(0, max) as T
  if (Array.isArray(v)) return v.map((x) => clean(x, max)) as T
  if (isObj(v)) return Object.fromEntries(Object.entries(v).filter(([k]) => k !== '__proto__' && k !== 'constructor').map(([k, x]) => [k, clean(x, max)])) as T
  return v
}

const some = (list: string[], n = 12) => list.slice(0, n).join(', ') + (list.length > n ? ', …' : '')

export function validate(raw: unknown, plant: Plant): SpecCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const fail = (m: string) => void errors.push(m)
  if (!isObj(raw)) return { spec: null, errors: ['The scenario must be one JSON object.'], warnings }
  const sim = simTags()
  if (!sim.alpha) return { spec: null, errors: ['Generated scenarios need the Alpha field: this plant has no process model.'], warnings }
  const s = clean(raw) as unknown as ScenarioSpec
  s.version = SPEC_VERSION

  const machines = new Set(sim.machines)
  const valves = new Set(sim.valves)
  const wells = new Set(sim.wells)
  const equipment = new Set(plant.equipment.map((e) => e.tag))
  const dets = detectors(plant)
  const detectorTags = new Set(dets.map((d) => d.tag))
  const zones = new Set(fireZones(plant).map((z) => z.id))
  const alarmTags = new Set<string>([...equipment, ...plant.valves.map((v) => v.tag), ...plant.instruments.map((i) => i.tag), ...detectorTags, ...LEVELS, 'FLARE', 'MAIN BUS', 'GT-8100', 'PSV-1101'])

  const needText = (v: unknown, where: string) => {
    if (typeof v !== 'string' || !v) fail(`${where} must be a non-empty string.`)
  }
  const needList = (v: unknown, where: string, min = 1) => {
    if (!Array.isArray(v) || v.length < min || v.some((x) => typeof x !== 'string' || !x)) fail(`${where} must be a list of at least ${min} strings.`)
    else if (v.length > LIMITS.list) fail(`${where} has ${v.length} entries, the limit is ${LIMITS.list}.`)
  }
  const range = (v: unknown, lo: number, hi: number, where: string, optional = false) => {
    if (v === undefined && optional) return
    if (!isNum(v) || v < lo || v > hi) fail(`${where} must be a number from ${lo} to ${hi}.`)
  }
  const oneOf = (v: unknown, list: readonly unknown[], where: string, optional = false) => {
    if (v === undefined && optional) return
    if (!list.includes(v)) fail(`${where} must be one of: ${list.join(', ')}.`)
  }

  needText(s.title, 'title')
  if (typeof s.title === 'string') s.title = s.title.slice(0, LIMITS.title)
  needText(s.summary, 'summary')
  oneOf(s.difficulty, DIFFICULTIES, 'difficulty')
  oneOf(s.category, CATEGORIES, 'category')
  needList(s.objectives, 'objectives')
  needList(s.briefing, 'briefing')
  needList(s.expected, 'expected')
  if (s.hints === undefined) s.hints = []
  needList(s.hints, 'hints', 0)
  needList(s.platforms, 'platforms')
  if (Array.isArray(s.platforms)) for (const p of s.platforms) oneOf(p, PLATFORMS, 'platforms entry')
  range(s.maxDuration, LIMITS.minDuration, LIMITS.maxDuration, 'maxDuration')
  range(s.settle, 0, 600, 'settle', true)
  if (!isObj(s.ideal)) fail('ideal must be { deferredBoe, note }.')
  else {
    range(s.ideal.deferredBoe, 0, 100000, 'ideal.deferredBoe')
    needText(s.ideal.note, 'ideal.note')
  }
  const steps: StepSpec[] = Array.isArray(s.timeline) ? s.timeline : []
  const goals: GoalSpec[] = Array.isArray(s.goals) ? s.goals : []
  const actions: ActionSpec[] = s.actions === undefined ? [] : Array.isArray(s.actions) ? s.actions : []
  if (!Array.isArray(s.timeline) || !steps.length) fail('timeline must be a list with at least one step.')
  if (!Array.isArray(s.goals) || !goals.length) fail('goals must be a list with at least one objective.')
  if (s.actions !== undefined && !Array.isArray(s.actions)) fail('actions must be a list.')
  if (steps.length > LIMITS.steps) fail(`timeline has ${steps.length} steps, the limit is ${LIMITS.steps}.`)
  if (goals.length > LIMITS.goals) fail(`goals has ${goals.length} objectives, the limit is ${LIMITS.goals}.`)
  if (actions.length > LIMITS.actions) fail(`actions has ${actions.length} entries, the limit is ${LIMITS.actions}.`)

  // ---------------------------------------------------------------- what can be referred to
  const stepIds = new Set<string>(AUTO_MARKS)
  const unique = (ids: unknown[], what: string) => {
    const seen = new Set<unknown>()
    for (const id of ids) {
      if (typeof id !== 'string' || !ID.test(id)) fail(`${what} id "${String(id)}" must be a short word: letters, digits, - and _.`)
      if (seen.has(id)) fail(`${what} id "${String(id)}" is used twice.`)
      seen.add(id)
    }
  }
  unique(steps.map((x) => x?.id), 'step')
  for (const x of steps) if (isObj(x) && typeof x.id === 'string') stepIds.add(x.id)
  unique(goals.map((g) => g?.id), 'objective')
  const actionIds = new Set<string>()
  for (const a of actions) {
    if (!isObj(a)) continue
    if ('builtin' in a) actionIds.add(String(a.builtin))
    else if (typeof a.id === 'string') actionIds.add(a.id)
  }
  unique(actions.filter((a) => isObj(a) && !('builtin' in a)).map((a) => (a as { id: unknown }).id), 'action')

  /** incident keys are set by effects anywhere, so they are gathered before anything is checked */
  const keys = new Set<string>()
  const effectLists = (): [Effect[], string][] => [
    [Array.isArray(s.setup?.do) ? s.setup.do : [], 'setup.do'],
    ...steps.map((x, i): [Effect[], string] => [Array.isArray(x?.do) ? x.do : [], `timeline[${i}] (${x?.id}).do`]),
    ...actions.map((a, i): [Effect[], string] => [isObj(a) && 'do' in a && Array.isArray(a.do) ? a.do : [], `actions[${i}].do`]),
  ]
  for (const [list] of effectLists()) for (const e of list as unknown as Obj[]) if (isObj(e) && typeof e.key === 'string') keys.add(e.key)

  // ---------------------------------------------------------------- conditions
  let conds = 0
  const needTag = (tag: unknown, known: Set<string>, what: string, where: string) => {
    if (typeof tag !== 'string' || !known.has(tag)) fail(`${where}: "${String(tag)}" is not ${what}. Use one of: ${some([...known])}.`)
  }
  const needZone = (zone: unknown, where: string) => {
    if (typeof zone !== 'string' || !zones.has(zone)) fail(`${where}: "${String(zone)}" is not a fire zone. Use one of: ${some([...zones], 32)}.`)
  }
  const needKey = (key: unknown, where: string) => {
    if (typeof key !== 'string' || !keys.has(key)) fail(`${where}: incident key "${String(key)}" is not set by any effect. Set it with "key" on the effect that starts it.`)
  }
  const needStep = (id: unknown, where: string) => {
    if (typeof id !== 'string' || !stepIds.has(id)) fail(`${where}: no timeline step has the id "${String(id)}".`)
  }
  const needAction = (id: unknown, where: string) => {
    if (typeof id !== 'string') return fail(`${where}: action must be a string.`)
    if (id.startsWith('field:')) return needTag(id.slice(6), machines, 'a machine', where)
    if (!actionIds.has(id)) fail(`${where}: no action has the id "${id}". Add it to actions, or use field:<machine> for the automatic local reset.`)
  }
  const cond = (c: unknown, where: string, depth = 0): void => {
    if (!isObj(c)) return fail(`${where} must be a condition object.`)
    if (++conds > LIMITS.conds) return
    if (depth > 6) return fail(`${where}: conditions nest too deep.`)
    switch (c.is) {
      case 'all':
      case 'any':
        if (!Array.isArray(c.of) || !c.of.length) return fail(`${where}: "${c.is}" needs a non-empty "of" list.`)
        return c.of.forEach((x, i) => cond(x, `${where}.of[${i}]`, depth + 1))
      case 'not':
        return cond(c.cond, `${where}.cond`, depth + 1)
      case 'metric':
        if (typeof c.metric !== 'string' || !METRICS[c.metric]) fail(`${where}: "${String(c.metric)}" is not a metric. Use one of: ${Object.keys(METRICS).join(', ')}.`)
        oneOf(c.op, CMP, `${where}.op`)
        return range(c.value, -1e7, 1e7, `${where}.value`)
      case 'machine':
        needTag(c.tag, machines, 'a machine the simulator runs', where)
        return oneOf(c.state, ['on', 'running', 'tripped', 'off'], `${where}.state`)
      case 'valve':
        needTag(c.tag, valves, 'a valve the simulator moves', where)
        oneOf(c.op, CMP, `${where}.op`)
        return range(c.value, 0, 1, `${where}.value (travel, 0 closed to 1 open)`)
      case 'shutdown':
        oneOf(c.platform, PLATFORMS, `${where}.platform`, true)
        oneOf(c.level, LEVELS, `${where}.level`, true)
        oneOf(c.atLeast, LEVELS, `${where}.atLeast`, true)
        if (c.zone !== undefined) needZone(c.zone, where)
        if (c.cause !== undefined && !(typeof c.cause === 'string' && CE_BY_ID[c.cause])) fail(`${where}: "${String(c.cause)}" is not a cause & effect row, so this can never be true. Use one of: ${Object.keys(CE_BY_ID).join(', ')}.`)
        return
      case 'anyShutdown':
        return oneOf(c.platform, PLATFORMS, `${where}.platform`)
      case 'restarted':
        oneOf(c.platform, PLATFORMS, `${where}.platform`)
        return range(c.oil, 0, 60000, `${where}.oil`, true)
      case 'fired':
        needStep(c.step, where)
        return range(c.after, 0, 3600, `${where}.after`, true)
      case 'ordered':
      case 'completed':
        return needAction(c.action, where)
      case 'acked':
      case 'raised':
        if (typeof c.tag !== 'string' || !c.tag) return fail(`${where}: "${c.is}" needs the alarm's exact tag.`)
        if (!alarmTags.has(c.tag)) fail(`${where}: no alarm uses the tag "${c.tag}", so this can never be true. Alarms use the machine, valve, instrument or detector tag, or a shutdown level.`)
        return
      case 'gas':
      case 'gasClear':
        if (c.is === 'gas') oneOf(c.level, ['low', 'high', 'confirmed'], `${where}.level`)
        if (c.zone === undefined && c.incident === undefined) return fail(`${where}: name a zone, or the incident key of a release.`)
        if (c.zone !== undefined) needZone(c.zone, where)
        if (c.incident !== undefined) needKey(c.incident, where)
        return
      case 'flame':
        oneOf(c.level, ['single', 'confirmed'], `${where}.level`)
        return needZone(c.zone, where)
      case 'deluge':
        return needZone(c.zone, where)
      case 'incident':
        return needKey(c.incident, where)
      case 'fireBurning':
        return
      case 'operatorDid':
        if (typeof c.tag !== 'string' || !c.tag) fail(`${where}: "operatorDid" needs a tag.`)
        return oneOf(c.action, OPERATOR_ACTIONS, `${where}.action`)
      case 'elapsed':
        return range(c.seconds, 0, LIMITS.maxDuration, `${where}.seconds`)
      default:
        return fail(`${where}: "${String(c.is)}" is not a condition.`)
    }
  }

  // ---------------------------------------------------------------- effects
  const effect = (e: unknown, where: string) => {
    if (!isObj(e)) return fail(`${where} must be an effect object.`)
    if (e.key !== undefined && (typeof e.key !== 'string' || !ID.test(e.key))) fail(`${where}: key must be a short word.`)
    switch (e.do) {
      case 'trip':
        needTag(e.tag, machines, 'a machine the simulator runs', where)
        needText(e.cause, `${where}.cause`)
        return range(e.repairH, 0, 48, `${where}.repairH`, true)
      case 'gasRelease':
      case 'fire':
        needTag(e.at, equipment, 'an equipment tag', where)
        range(e.dy, -2, 8, `${where}.dy`, true)
        return e.do === 'fire' ? range(e.sizeMW, 0.1, 50, `${where}.sizeMW`) : range(e.rateKgS, 0.05, 20, `${where}.rateKgS`)
      case 'valveStuck':
        return needTag(e.tag, valves, 'a valve the simulator moves', where)
      case 'levelControlFail':
        return needTag(e.tag, new Set(LEVEL_VALVES), 'a level valve', where)
      case 'detectorFault':
      case 'inhibit':
        return needTag(e.tag, detectorTags, 'a fire & gas detector', where)
      case 'antiSurgeFail':
      case 'instrumentAirFail':
      case 'coolingFail':
      case 'exportBlocked':
        return
      case 'clear':
        return needKey(e.incident, where)
      case 'setValve':
        needTag(e.tag, valves, 'a valve the simulator moves', where)
        if (e.tag === 'FV-2201') fail(`${where}: FV-2201 follows the anti-surge controller. Use the antiSurgeFail effect instead.`)
        return oneOf(e.cmd, ['open', 'closed'], `${where}.cmd`)
      case 'setChokes':
        range(e.to, 0, 100, `${where}.to`)
        if (e.wells !== undefined) (Array.isArray(e.wells) ? e.wells : [null]).forEach((w) => needTag(w, wells, 'a production well', where))
        return
      case 'setWell':
        needTag(e.tag, wells, 'a production well', where)
        if (typeof e.online !== 'boolean') fail(`${where}.online must be true or false.`)
        return
      case 'setKnob':
        return knob(e.knob, e.value, where)
      case 'shutdown':
        oneOf(e.level, LEVELS, `${where}.level`)
        oneOf(e.platform, PLATFORMS.filter((p) => p !== 'LQ'), `${where}.platform`)
        needText(e.reason, `${where}.reason`)
        if (e.level === 'ESD2' || e.zone !== undefined) needZone(e.zone, where)
        return
      case 'resetTrip':
      case 'start':
      case 'stop':
        return needTag(e.tag, machines, 'a machine the simulator runs', where)
      case 'note':
        return needText(e.text, `${where}.text`)
      default:
        return fail(`${where}: "${String(e.do)}" is not an effect.`)
    }
  }
  const knob = (name: unknown, v: unknown, where: string) => {
    oneOf(name, SPEC_KNOBS, `${where}.knob`)
    if (name === 'wind') {
      if (!isObj(v)) return fail(`${where}: wind must be { from, speed }.`)
      range(v.from, 0, 360, `${where}: wind.from`)
      range(v.speed, 0, 40, `${where}: wind.speed`)
    }
    if (name === 'seaState') range(v, 0, 8, `${where}: seaState`)
    if (name === 'compressorSpeed') range(v, 50, 105, `${where}: compressorSpeed`)
    if (name === 'hpPressure') range(v, 25, 40, `${where}: hpPressure`)
    if ((name === 'autoChangeover' || name === 'drilling') && typeof v !== 'boolean') fail(`${where}: ${name} must be true or false.`)
  }

  // ---------------------------------------------------------------- setup
  if (s.setup !== undefined) {
    if (!isObj(s.setup)) fail('setup must be an object.')
    else {
      if (s.setup.knobs !== undefined) {
        if (!isObj(s.setup.knobs)) fail('setup.knobs must be an object.')
        else for (const [k, v] of Object.entries(s.setup.knobs)) knob(k, v, 'setup.knobs')
      }
      const ch = s.setup.chokes
      if (typeof ch === 'number') range(ch, 0, 100, 'setup.chokes')
      else if (isObj(ch)) {
        for (const [w, v] of Object.entries(ch)) {
          needTag(w, wells, 'a production well', 'setup.chokes')
          range(v, 0, 100, `setup.chokes.${w}`)
        }
      }
      else if (ch !== undefined) fail('setup.chokes must be a number, or a choke per well.')
    }
  }
  for (const [list, where] of effectLists()) list.forEach((e, i) => effect(e, `${where}[${i}]`))

  // ---------------------------------------------------------------- timeline
  const afters = new Map<string, string>()
  steps.forEach((x, i) => {
    const where = `timeline[${i}] (${x?.id})`
    if (!isObj(x)) return fail(`${where} must be an object.`)
    if (x.at === undefined && x.after === undefined && x.when === undefined) fail(`${where}: give it "at", "after" or "when", or it fires at the start.`)
    if (x.at !== undefined) {
      range(x.at, 0, LIMITS.maxDuration, `${where}.at`)
      if (isNum(x.at) && isNum(s.maxDuration) && x.at >= s.maxDuration) fail(`${where}: at ${x.at} s is past maxDuration ${s.maxDuration} s, so it never fires.`)
    }
    if (x.after !== undefined) {
      if (x.at !== undefined) fail(`${where}: use "at" or "after", not both: "at" wins and "after" is ignored.`)
      if (!isObj(x.after)) fail(`${where}.after must be { step, seconds }.`)
      else {
        needStep(x.after.step, where)
        range(x.after.seconds, 0, LIMITS.maxDuration, `${where}.after.seconds`)
        if (typeof x.after.step === 'string') afters.set(x.id, x.after.step)
      }
    }
    if (x.when !== undefined) cond(x.when, `${where}.when`)
    if (x.only !== undefined) cond(x.only, `${where}.only`)
    if (x.do !== undefined && !Array.isArray(x.do)) fail(`${where}.do must be a list.`)
    if (x.ramp !== undefined) {
      if (!isObj(x.ramp)) fail(`${where}.ramp must be an object.`)
      else {
        range(x.ramp.seconds, 1, LIMITS.maxDuration, `${where}.ramp.seconds`)
        oneOf(x.ramp.target, ['chokes', 'compressorSpeed', 'windSpeed'], `${where}.ramp.target`)
        range(x.ramp.from, 0, 105, `${where}.ramp.from`)
        range(x.ramp.to, 0, 105, `${where}.ramp.to`)
        if (x.ramp.wells !== undefined) (Array.isArray(x.ramp.wells) ? x.ramp.wells : [null]).forEach((w) => needTag(w, wells, 'a production well', where))
      }
    }
  })
  for (const start of afters.keys()) {
    const seen = new Set([start])
    for (let at = afters.get(start); at; at = afters.get(at)) {
      if (seen.has(at)) {
        fail(`timeline: "${start}" waits on itself through "after", so it never fires.`)
        break
      }
      seen.add(at)
    }
  }
  if (!effectLists().some(([list]) => list.some((e) => isObj(e) && UPSETS.includes(e.do))) && !steps.some((x) => x?.ramp)) fail('Nothing happens: the scenario needs at least one effect that upsets the plant, such as a trip, a release or a fire.')

  // ---------------------------------------------------------------- actions
  actions.forEach((a, i) => {
    const where = `actions[${i}]`
    if (!isObj(a)) return fail(`${where} must be an object.`)
    if ('builtin' in a) return oneOf(a.builtin, BUILTIN_ACTIONS, `${where}.builtin`)
    needText(a.label, `${where}.label`)
    oneOf(a.who, ['operator', 'field'], `${where}.who`)
    range(a.delay, 0, 1800, `${where}.delay`, true)
    if (a.available !== undefined) cond(a.available, `${where}.available`)
    if (a.do !== undefined && !Array.isArray(a.do)) fail(`${where}.do must be a list.`)
    if (a.reports !== undefined) {
      if (!Array.isArray(a.reports)) fail(`${where}.reports must be a list.`)
      else
        a.reports.forEach((r, j) => {
          if (!isObj(r)) return fail(`${where}.reports[${j}] must be an object.`)
          needText(r.text, `${where}.reports[${j}].text`)
          if (r.when !== undefined) cond(r.when, `${where}.reports[${j}].when`)
        })
    }
  })
  if (actions.some((a) => isObj(a) && 'builtin' in a && a.builtin === 'pob') && !actionIds.has('muster')) fail('actions: "pob" is only offered after "muster", so add "muster" as well.')

  // ---------------------------------------------------------------- objectives
  goals.forEach((g, i) => {
    const where = `goals[${i}] (${g?.id})`
    if (!isObj(g)) return fail(`${where} must be an object.`)
    needText(g.text, `${where}.text`)
    oneOf(g.kind, ['do', 'avoid'], `${where}.kind`)
    oneOf(g.category, SCORE_CATEGORIES, `${where}.category`)
    if (g.from !== undefined) needStep(g.from, where)
    range(g.window, 1, LIMITS.maxDuration, `${where}.window`, true)
    range(g.deadline, 1, LIMITS.maxDuration * 2, `${where}.deadline`, true)
    if (isNum(g.window) && isNum(g.deadline) && g.deadline < g.window) fail(`${where}: deadline ${g.deadline} s comes before window ${g.window} s.`)
    range(g.penalty, 0, 60, `${where}.penalty`, true)
    cond(g.check, `${where}.check`)
  })
  const scored = goals.filter((g) => isObj(g) && !g.optional)
  if (goals.length && !scored.some((g) => g.kind === 'do')) fail('goals: add at least one required "do" objective, or a trainee passes by doing nothing.')
  if (s.complete !== undefined) cond(s.complete, 'complete')
  else warnings.push('No "complete" condition: every attempt runs to maxDuration.')
  if (conds > LIMITS.conds) fail(`The scenario has more than ${LIMITS.conds} conditions.`)

  // the same answer the runner will give: a spec that passes here must be able to start
  if (!errors.length) {
    try {
      const why = unavailable(compile(s), plant)
      if (why) fail(`The scenario can't start on this plant: ${why}. Tags: ${compile(s).requires?.tags.join(', ')}.`)
    } catch (e) {
      fail(`The scenario can't be built: ${e instanceof Error ? e.message : String(e)}.`)
    }
  }
  return { spec: errors.length ? null : s, errors, warnings }
}
