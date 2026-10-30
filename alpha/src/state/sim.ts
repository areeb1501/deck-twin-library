/**
 * Plant simulation: operating knobs, equipment run states, doors, and a steady-state production /
 * power model that drives the KPIs, the instrument values, the flow animation and which machines
 * spin. Deliberately simple (first-order, steady state) but connected the way the plant is:
 *
 *   well chokes → oil / gas / water to the HP separator
 *     oil   → export pumps (capacity per running pump) → export          no pump → PSD, wells shut in
 *     gas   → export compressor (capacity ∝ speed) → fuel gas + export   excess → flare
 *     water → produced-water pumps → overboard                          over capacity → wells cut back
 *   power demand (compressor ∝ speed³, pumps, drilling, base load) vs running turbine capacity
 *     overload → load shed (compressor trips) · no turbine → blackout (everything stops)
 *
 * Production efficiency = actual oil / oil the wells could give at the current chokes.
 * Availability = time-weighted share of the last hour the plant produced unconstrained.
 */
import { create } from 'zustand'
import type { Equipment, Instrument, Plant } from '../model/types'
import { usePlantStore } from './plantStore'

export type RunState = 'running' | 'standby' | 'stopped' | 'tripped'

/** well potentials at 100 % choke (Alpha wells; others default) */
const WELLS: Record<string, { oil: number; gor: number; wc: number }> = {
  'XT-110': { oil: 11000, gor: 1100, wc: 0.25 },
  'XT-120': { oil: 10500, gor: 1050, wc: 0.35 },
  'XT-130': { oil: 1500, gor: 16000, wc: 0.05 }, // gas producer
  'XT-140': { oil: 12000, gor: 1150, wc: 0.2 },
  'XT-150': { oil: 9800, gor: 980, wc: 0.45 },
  // WHP-N wells (tied back over the north bridge into Alpha's inlet)
  'XT-N101': { oil: 7000, gor: 1050, wc: 0.3 },
  'XT-N102': { oil: 1200, gor: 15000, wc: 0.05 }, // gas producer
  'XT-N103': { oil: 6500, gor: 1000, wc: 0.35 },
  'XT-N104': { oil: 7500, gor: 1100, wc: 0.25 },
  'XT-N105': { oil: 6000, gor: 950, wc: 0.4 },
}
const EXPORT_PUMP_CAP = 58000 // bbl/d per running pump (2 × 100 %, sized for Alpha + WHP-N)
const PW_PUMP_CAP = 30000 // bbl/d water per running pump
const COMP_CAP = 95 // MMscfd at 100 % speed
const GTG_MW = 25
const DESIGN_OIL = 49000
const DESIGN_GAS = 75

const chokeF = (c: number) => Math.pow(Math.max(0, Math.min(100, c)) / 100, 0.75)

export interface Knobs {
  chokes: Record<string, number>
  wellOnline: Record<string, boolean>
  /** HP separator pressure setpoint, barg */
  hpPressure: number
  /** export compressor speed, % */
  compressorSpeed: number
  /** drilling in progress (rig load + drilling KPIs) */
  drilling: boolean
}

export interface PlantResult {
  oilPotential: number
  oilProduced: number
  oilExport: number
  gasProduced: number
  gasCompressed: number
  gasExport: number
  fuelGas: number
  flare: number
  water: number
  powerDemand: number
  powerAvailable: number
  powerGenerated: number
  efficiency: number
  constraint: string | null
  /** per-well actual oil */
  wells: Record<string, { oil: number; gas: number; water: number; online: boolean }>
  /** throughput factors for scaling instrument values (1 = design) */
  f: { oil: number; gas: number; water: number; power: number; flare: number }
}

export interface SimEvent {
  t: number
  text: string
  level: 'info' | 'warn' | 'trip'
}

interface SimState {
  t: number
  knobs: Knobs
  /** explicit run states (anything not listed uses defaultState) */
  status: Record<string, RunState>
  /** open doors, key `${tag}/${doorId}` */
  doors: Record<string, boolean>
  result: PlantResult | null
  /** flow factor per line tag (0 = no flow), refreshed every tick — drives the flow particles */
  lineFlow: Record<string, number>
  history: { t: number; oil: number; gas: number; flare: number; power: number; eff: number }[]
  availability: number
  events: SimEvent[]
  setChoke: (tag: string, v: number) => void
  setWell: (tag: string, on: boolean) => void
  setKnob: <K extends 'hpPressure' | 'compressorSpeed' | 'drilling'>(k: K, v: Knobs[K]) => void
  setStatus: (tag: string, s: RunState) => void
  trip: (tag: string, why?: string) => void
  reset: () => void
  setDoor: (key: string, open: boolean) => void
  toggleDoor: (key: string) => void
  tick: () => void
}

const KNOBS0: Knobs = { chokes: {}, wellOnline: {}, hpPressure: 42, compressorSpeed: 92, drilling: true }

/** default run state: spares (…B with a …A sibling) and firewater pumps stand by, the rest runs */
export function defaultState(plant: Plant, e: Equipment): RunState {
  if (e.system === 'safety' && e.kind === 'caissonPump') return 'standby'
  // duty / standby pairs: the …B machine stands by (transformers, skids and buildings stay energised)
  const machine = e.kind === 'pumpPackage' || e.kind === 'compressorPackage' || e.kind === 'gasTurbineGenerator' || e.kind === 'caissonPump'
  if (machine && /B$/.test(e.tag) && plant.equipment.some((x) => x.tag === e.tag.replace(/B$/, 'A'))) return 'standby'
  return 'running'
}
const ROTATING = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump', 'chemSkid', 'module', 'transformer'])

let eventSeq = 0
export const useSim = create<SimState>((set, get) => ({
  t: 0,
  knobs: KNOBS0,
  status: {},
  doors: {},
  result: null,
  lineFlow: {},
  history: [],
  availability: 100,
  events: [],
  setChoke: (tag, v) => set((s) => ({ knobs: { ...s.knobs, chokes: { ...s.knobs.chokes, [tag]: v } } })),
  setWell: (tag, on) => {
    set((s) => ({ knobs: { ...s.knobs, wellOnline: { ...s.knobs.wellOnline, [tag]: on } } }))
    log(`${tag} ${on ? 'opened up' : 'shut in'}`, 'info')
  },
  setKnob: (k, v) => set((s) => ({ knobs: { ...s.knobs, [k]: v } })),
  setStatus: (tag, st) => {
    set((s) => ({ status: { ...s.status, [tag]: st } }))
    log(`${tag} ${st === 'running' ? 'started' : st === 'standby' ? 'set to standby' : st}`, st === 'tripped' ? 'trip' : 'info')
  },
  trip: (tag, why) => {
    set((s) => ({ status: { ...s.status, [tag]: 'tripped' } }))
    log(`${tag} TRIPPED${why ? ` — ${why}` : ''}`, 'trip')
  },
  reset: () => {
    set({ knobs: KNOBS0, status: {}, events: [], history: [], availability: 100 })
    log('Simulation reset to normal operation', 'info')
  },
  setDoor: (key, open) => get().doors[key] !== open && set((s) => ({ doors: { ...s.doors, [key]: open } })),
  toggleDoor: (key) => set((s) => ({ doors: { ...s.doors, [key]: !s.doors[key] } })),
  tick: () => {
    const plant = usePlantStore.getState().plant
    let r = computePlant(plant, get())
    // protective actions
    if (r.powerAvailable > 0 && r.powerDemand > r.powerAvailable + 0.01 && runState('K-2200') === 'running') {
      get().trip('K-2200', 'load shedding: power demand exceeds running generation')
      r = computePlant(plant, get())
    }
    const prev = get().result
    if (prev && prev.constraint !== r.constraint && r.constraint) log(r.constraint, r.oilExport === 0 ? 'trip' : 'warn')
    const t = get().t + 1
    const h = [...get().history.slice(-599), { t, oil: r.oilExport, gas: r.gasExport, flare: r.flare, power: r.powerGenerated, eff: r.efficiency }]
    const availability = (h.filter((x) => x.eff >= 97).length / h.length) * 100
    const lineFlow: Record<string, number> = {}
    for (const l of plant.lines) lineFlow[l.tag] = simScale({ tag: l.tag, type: 'FT', on: { line: l.tag, seg: 0, t: 0 }, unit: 'm³/h', nominal: 1, range: '' }, plant)
    set({ t, result: r, history: h, availability, lineFlow })
  },
}))

function log(text: string, level: SimEvent['level']) {
  const t = useSim.getState().t
  useSim.setState((s) => ({ events: [{ t, text, level, id: ++eventSeq } as SimEvent, ...s.events].slice(0, 40) }))
}

/** Current run state of an equipment tag (non-reactive getter for animation / values). */
export function runState(tag: string): RunState {
  const s = useSim.getState().status[tag]
  if (s) return s
  const plant = usePlantStore.getState().plant
  const e = plant.equipment.find((x) => x.tag === tag)
  if (!e || !ROTATING.has(e.kind)) return 'running'
  return defaultState(plant, e)
}
export const isRunning = (tag: string) => {
  // nothing turns in a blackout except the LQ emergency systems
  const r = useSim.getState().result
  if (r && r.powerGenerated <= 0 && !/^(B-93|B-9310|GT-)/.test(tag)) {
    const e = usePlantStore.getState().plant.equipment.find((x) => x.tag === tag)
    if (e && e.kind !== 'gasTurbineGenerator' && !(e.kind === 'caissonPump' && e.system === 'safety')) return false
  }
  return runState(tag) === 'running'
}

const anyRunning = (tags: string[]) => tags.filter((t) => runState(t) === 'running').length

export function computePlant(plant: Plant, s: Pick<SimState, 'knobs'>): PlantResult {
  const k = s.knobs
  const wells: PlantResult['wells'] = {}
  let oilPot = 0
  let oil = 0
  let gas = 0
  let water = 0
  for (const e of plant.equipment) {
    if (e.kind !== 'xmasTree' || e.wellType === 'waterInjector') continue
    const w = WELLS[e.tag] ?? { oil: 6000, gor: 1000, wc: 0.3 }
    const online = k.wellOnline[e.tag] ?? e.wellType !== 'suspended'
    const f = chokeF(k.chokes[e.tag] ?? 60) * (online ? 1 : 0)
    // higher separator pressure → less drawdown at the wellhead
    const dp = 1 - (k.hpPressure - 42) * 0.008
    const o = w.oil * f * dp
    oilPot += o
    const g = (o * w.gor) / 1e6
    const wa = (o * w.wc) / (1 - w.wc)
    wells[e.tag] = { oil: o, gas: g, water: wa, online }
    oil += o
    gas += g
    water += wa
  }
  const hasWells = Object.keys(wells).length > 0
  let constraint: string | null = null
  // produced water handling
  const pwCap = anyRunning(['P-4300A', 'P-4300B']) * PW_PUMP_CAP
  if (hasWells && water > pwCap) {
    const cut = pwCap / water
    oil *= cut
    gas *= cut
    water = pwCap
    constraint = pwCap === 0 ? 'No produced-water pump running — wells shut in (PSD)' : `Produced-water handling limits production to ${Math.round(cut * 100)} %`
  }
  // oil export
  const expCap = anyRunning(['P-1500A', 'P-1500B']) * EXPORT_PUMP_CAP
  let oilExport = Math.min(oil, expCap)
  if (hasWells && expCap === 0) {
    constraint = 'No export pump running — HP separator high level, wells shut in (PSD)'
    oil = 0
    gas = 0
    water = 0
    oilExport = 0
  } else if (oil > expCap) {
    constraint = `Export pumps limit oil to ${Math.round(expCap).toLocaleString()} bbl/d`
    const cut = expCap / oil
    oil *= cut
    gas *= cut
    water *= cut
    oilExport = oil
  }
  // power
  // plants without their own turbines (onshore, builder plants) are on grid power
  const gtgs = plant.equipment.filter((e) => e.kind === 'gasTurbineGenerator')
  const gtgRunning = gtgs.filter((e) => runState(e.tag) === 'running').length
  const powerAvailable = gtgs.length ? gtgRunning * GTG_MW : 999
  const compOn = runState('K-2200') === 'running' && powerAvailable > 0 && hasWells
  const spd = k.compressorSpeed / 100
  let demand = 6.5
  if (compOn) demand += 6.5 * Math.pow(spd, 3)
  demand += 0.45 * anyRunning(['P-1500A', 'P-1500B'])
  demand += 0.9 * anyRunning(['P-6400A', 'P-6400B'])
  demand += 0.09 * anyRunning(['P-6200A', 'P-6200B'])
  demand += 0.055 * anyRunning(['P-4300A', 'P-4300B'])
  demand += 0.25 * anyRunning(['K-4600'])
  if (k.drilling) demand += 3.5
  if (powerAvailable === 0) {
    constraint = 'BLACKOUT — no gas turbine generator running'
    oil = gas = water = oilExport = 0
  }
  const powerGenerated = Math.min(demand, powerAvailable)
  // gas
  const fuel = powerGenerated * 0.2
  const compCap = compOn ? COMP_CAP * spd : 0
  const gasCompressed = Math.min(Math.max(0, gas - fuel), compCap)
  const flare = Math.max(0, gas - fuel - gasCompressed) + 0.4 // + purge
  if (hasWells && gas - fuel > compCap + 0.5 && !constraint) constraint = compOn ? `Compressor at capacity — ${(gas - fuel - compCap).toFixed(1)} MMscfd to flare` : 'Export compressor down — gas to flare'
  return {
    oilPotential: oilPot,
    oilProduced: oil,
    oilExport,
    gasProduced: gas,
    gasCompressed,
    gasExport: gasCompressed,
    fuelGas: Math.min(fuel, gas),
    flare,
    water,
    powerDemand: demand,
    powerAvailable,
    powerGenerated,
    efficiency: oilPot > 0 ? (oilExport / oilPot) * 100 : 100,
    constraint,
    wells,
    // plants without modelled wells keep their design values
    f: hasWells ? { oil: oilExport / DESIGN_OIL, gas: gasCompressed / DESIGN_GAS, water: water / 18000, power: powerGenerated / 17, flare: flare / 2 } : { oil: 1, gas: 1, water: 1, power: 1, flare: 1 },
  }
}

// ---------------------------------------------------------------- instrument values follow the plant
const RATE_UNITS = /m³\/h|MMscfd|bbl\/d|m³\/d|L\/h|MW|kW|A\b|rpm|%LEL|LEL·m/

/**
 * How far an instrument's reading moves from its nominal with the simulated plant: flow-like
 * readings scale with the throughput of their stream; pressures and temperatures move a little;
 * anything on a stopped machine drops to idle.
 */
export function simScale(inst: Instrument, plant: Plant): number {
  const r = useSim.getState().result
  if (!r) return 1
  const rate = RATE_UNITS.test(inst.unit) && !/%LEL|LEL·m/.test(inst.unit)
  // host equipment / line
  let system: string | undefined
  let host: string | undefined
  if ('line' in inst.on) {
    const l = plant.lines.find((x) => x.tag === (inst.on as { line: string }).line)
    system = l?.system
    const ends = l ? [l.from, l.to].filter((e) => 'equipment' in e).map((e) => (e as { equipment: string }).equipment) : []
    host = ends.find((t) => plant.equipment.find((x) => x.tag === t && (x.kind === 'pumpPackage' || x.kind === 'compressorPackage' || x.kind === 'caissonPump' || x.kind === 'xmasTree')))
    if (l && l.service === 'flare') return rate ? Math.max(0.05, r.f.flare) : 1
  } else {
    host = inst.on.equipment
    system = plant.equipment.find((x) => x.tag === host)?.system
  }
  // drilling: everything on the rig / BOP follows the drilling knob
  const hostEq = host ? plant.equipment.find((x) => x.tag === host) : undefined
  if (hostEq?.kind === 'proxy' || host === 'DR-100') {
    const drilling = useSim.getState().knobs.drilling && isRunning('DR-100')
    if (drilling) return 1
    if (/%LEL|LEL·m|ppm|% IR/.test(inst.unit)) return 1
    if (inst.unit === 't') return 0.4 // block + top drive weight only
    if (/barg/.test(inst.unit) && hostEq?.kind === 'proxy' && hostEq.role === 'bop') return /ACC|ANN/.test(inst.tag) ? 1 : 0.5
    return 0.02
  }
  // per-well flowlines
  if (host && r.wells[host]) {
    const w = r.wells[host]
    const base = (WELLS[host]?.oil ?? 6000) * chokeF(60)
    const f = w.oil / base
    return rate ? f : 0.75 + 0.25 * Math.min(1.2, f)
  }
  if (host && !isRunning(host)) {
    const e = plant.equipment.find((x) => x.tag === host)
    if (e && ROTATING.has(e.kind) && e.kind !== 'module' && e.kind !== 'transformer') return rate ? 0 : 0.35
  }
  const f = system === 'gasCompression' || system === 'gasTreatment' ? r.f.gas : system === 'producedWater' ? r.f.water : system === 'production' || system === 'oilExport' || system === 'wells' ? r.f.oil : 1
  return rate ? f : 0.85 + 0.15 * Math.min(1.3, f)
}
