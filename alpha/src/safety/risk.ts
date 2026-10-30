/**
 * Live risk engine (plan 02): a 0–100 risk score per platform and for the field, every point traced
 * to a named contributor ("HP separator level 79 % (LAHH 83 %) +18"), plus a rolling history.
 *
 * `computeRisk()` is a pure read of the simulation (useSim), machinery health (useMaint), the cranes,
 * the field workers and the CCTV detector. A sim plugin recomputes it every ≥ 5 simulated seconds and
 * keeps up to 720 history points (one hour at 5 s).
 *
 * Every rule's numbers live in `RULES` below, so they are easy to tune.
 */
import { create } from 'zustand'
import type { Plant } from '../model/types'
import { useSim, registerSimPlugin, isRunning } from '../state/sim'
import { usePlantStore } from '../state/plantStore'
import { useMaint } from '../sim/maintenance'
import { useCranes } from '../sim/cranes'
import { CRANES } from '../model/cranes'
import { fireZones, detectors as fgDetectors, platformOfTag, type Detector, type FireZone } from '../sim/fg'
import { FIELD_PLATFORMS, SHUTDOWN_RANK, type PlatformId, type ShutdownLevel, type SimState } from '../sim/types'
import { useCctv, CAMERAS } from './cctv'
import { useHazardTrack, useWorkers } from './workers'
import { bandOf, type PlatformRisk, type RiskContributor, type RiskHistoryPoint, type RiskSnapshot } from './types'

// ================================================================= tuning table

export const RULES = {
  process: {
    /** HP separator level, %: 0 points below `from`, ramps to `max` at LAHH */
    hpLevel: { from: 65, lahh: 83, max: 30 },
    /** HP separator pressure, barg: 0 below `from`, ramps to `max` at the PSV set pressure */
    hpPressure: { from: 36, psv: 42, max: 35 },
    /** compressor surge margin, %: 0 above `from`, ramps to `max` at 0 % (only while K-2200 runs) */
    surge: { from: 15, max: 20 },
    /** instrument air, barg: 0 above `from`, ramps to `max` at the PSD set point */
    ia: { from: 6.5, psd: 5.5, max: 20 },
    /** cooling medium, °C: 0 below `from`, ramps to `max` at the trip */
    cm: { from: 45, trip: 55, max: 15 },
    /** flaring: points per MMscfd, capped; contributions under `minPts` are ignored (normal purge / pilot) */
    flare: { perMMscfd: 0.5, max: 10, minPts: 1 },
  },
  fireGas: { gas: { low: 15, high: 30, confirmed: 60 }, fire: { single: 35, confirmed: 80 }, deluge: 10 },
  shutdown: { USD: 10, PSD: 20, ESD2: 35, ESD1: 50, APS: 70 } as Record<ShutdownLevel, number>,
  /** a shutdown that has been reset but the platform not yet restarted counts this share */
  shutdownResetShare: 0.5,
  alarms: { p1: 8, p2: 3, p3: 1, max: 25, floodRate: 10, flood: 10 },
  machinery: { alert: 4, alarm: 10, failed: 15, tripped: 6 },
  barriers: { inhibit: 4, fault: 3, stuckValve: 10 },
  work: { hot: 6, hotWithGas: 20, confined: 5 },
  weather: { windHi: 15, windHiPts: 5, windVhi: 20, windVhiPts: 12, craneSuspended: 4 },
  people: { window: 120, each: 5, max: 15 },
  /** hazardous areas (plan 14), live tracked violations: Zone 0 entry / Zone 1 / Zone 2 PPE missing, capped per platform */
  hazardous: { zone0: 25, zone1: 10, zone2: 5, max: 35 },
  /** field score = worst platform + `others` × sum of the other platforms */
  field: { others: 0.15 },
  /** recompute period (sim seconds) and history length */
  period: 5,
  historyCap: 720,
} as const

// ================================================================= store

interface RiskStore {
  now: RiskSnapshot | null
  history: RiskHistoryPoint[]
}
export const useRisk = create<RiskStore>(() => ({ now: null, history: [] }))

// ================================================================= helpers

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
/** linear ramp: 0 at `a`, 1 at `b` (works for falling ramps too: a > b) */
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a))
const r1 = (v: number) => Math.round(v * 10) / 10
const f0 = (v: number) => v.toFixed(0)
const f1 = (v: number) => v.toFixed(1)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

interface PlantCtx {
  plant: Plant
  offshore: boolean
  alpha: boolean
  zones: Map<string, FireZone>
  dets: Detector[]
  detByTag: Map<string, Detector>
  plat: Map<string, PlatformId>
  items: Set<string>
  /** a platform's first ESD valve (the "go to" item for a shutdown) */
  esdv: Map<PlatformId, string | undefined>
}
let pctx: PlantCtx | null = null
function plantCtx(): PlantCtx {
  const plant = usePlantStore.getState().plant
  if (pctx && pctx.plant === plant) return pctx
  let zones: FireZone[] = []
  let dets: Detector[] = []
  try {
    zones = fireZones(plant)
  } catch {
    zones = []
  }
  try {
    dets = fgDetectors(plant)
  } catch {
    dets = []
  }
  const items = new Set<string>([...plant.equipment.map((e) => e.tag), ...plant.valves.map((v) => v.tag), ...plant.instruments.map((i) => i.tag), ...plant.lines.map((l) => l.tag)])
  pctx = {
    plant,
    offshore: (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha',
    alpha: plant.equipment.some((e) => e.tag === 'V-1100'),
    zones: new Map(zones.map((z) => [z.id, z])),
    dets,
    detByTag: new Map(dets.map((d) => [d.tag, d])),
    plat: new Map(),
    items,
    esdv: new Map(),
  }
  return pctx
}
/** platform a plant item stands on (cached per plant); 'Alpha' when unknown on the offshore field */
function platOf(c: PlantCtx, tag: string): PlatformId {
  if (!c.offshore) return 'Plant'
  let p = c.plat.get(tag)
  if (!p) {
    try {
      p = c.detByTag.get(tag)?.platform ?? platformOfTag(c.plant, tag)
    } catch {
      p = 'Alpha'
    }
    if (!p || p === 'Plant') p = 'Alpha'
    c.plat.set(tag, p)
  }
  return p
}
function esdvOf(c: PlantCtx, platform: PlatformId): string | undefined {
  if (!c.esdv.has(platform)) c.esdv.set(platform, c.plant.valves.find((v) => v.type === 'esdv' && platOf(c, v.tag) === platform)?.tag)
  return c.esdv.get(platform)
}
/** the tag only when it is a plant item (Show in 3D / Walk to work on it) */
const itemOr = (c: PlantCtx, ...tags: (string | undefined)[]) => tags.find((t) => t && c.items.has(t))

// ================================================================= scoring

export function computeRisk(): RiskSnapshot {
  const s = useSim.getState() as Partial<SimState>
  const c = plantCtx()
  const t = num(s.t) ?? 0
  const out: RiskContributor[] = []
  const add = (x: RiskContributor) => {
    if (x.points > 0) out.push({ ...x, points: r1(x.points) })
  }
  const home: PlatformId = c.offshore ? 'Alpha' : 'Plant'

  // ---- process margins (the Alpha dynamic model)
  const p = s.process
  if (p && c.alpha) {
    const R = RULES.process
    const lvl = num(p.hpLevel)
    if (lvl !== undefined) {
      const pts = R.hpLevel.max * ramp(lvl, R.hpLevel.from, R.hpLevel.lahh)
      add({ id: 'proc:hpLevel', platform: 'Alpha', category: 'process', tag: itemOr(c, 'V-1100', 'LT-1101'), text: `HP separator level ${f0(lvl)} % (LAHH ${R.hpLevel.lahh} %)`, points: pts })
    }
    const pr = num(p.hpPressure)
    if (pr !== undefined) {
      const pts = R.hpPressure.max * ramp(pr, R.hpPressure.from, R.hpPressure.psv)
      add({ id: 'proc:hpPressure', platform: 'Alpha', category: 'process', tag: itemOr(c, 'V-1100', 'PT-1101'), text: `HP separator pressure ${f1(pr)} barg (PSV set ${R.hpPressure.psv} barg)`, points: pts })
    }
    const sm = num(p.surgeMargin)
    let kRun = false
    try {
      kRun = isRunning('K-2200')
    } catch {
      kRun = s.status?.['K-2200'] === 'running'
    }
    if (sm !== undefined && kRun) {
      const pts = R.surge.max * ramp(sm, R.surge.from, 0)
      add({ id: 'proc:surge', platform: 'Alpha', category: 'process', tag: itemOr(c, 'K-2200'), text: `K-2200 surge margin ${f0(sm)} % (anti-surge opens at 10 %)`, points: pts })
    }
    const ia = num(p.iaPressure)
    if (ia !== undefined) {
      const pts = R.ia.max * ramp(ia, R.ia.from, R.ia.psd)
      add({ id: 'proc:ia', platform: 'Alpha', category: 'process', tag: itemOr(c, 'K-4600', 'PT-4603'), text: `Instrument air ${f1(ia)} barg (PSD at ${R.ia.psd} barg)`, points: pts })
    }
    const cm = num(p.cmTemp)
    if (cm !== undefined) {
      const pts = R.cm.max * ramp(cm, R.cm.from, R.cm.trip)
      add({ id: 'proc:cm', platform: 'Alpha', category: 'process', tag: itemOr(c, 'TT-6303', 'P-6200A'), text: `Cooling medium ${f0(cm)} °C (compressor trip at ${R.cm.trip} °C)`, points: pts })
    }
  }
  const flare = num(s.result?.flare)
  if (flare !== undefined && c.alpha) {
    const R = RULES.process.flare
    const pts = Math.min(R.max, flare * R.perMMscfd)
    if (pts >= R.minPts) add({ id: 'proc:flare', platform: 'Alpha', category: 'process', tag: itemOr(c, 'PT-2401'), text: `Flaring ${f1(flare)} MMscfd`, points: pts })
  }

  // ---- fire & gas, per zone
  const fg = s.fg ?? {}
  const detState = s.detectors ?? {}
  const incidents = (s.incidents ?? []).filter((i) => i.cleared === undefined)
  const gasOn = new Set<PlatformId>()
  for (const [zid, z] of Object.entries(fg)) {
    if (!z) continue
    const zone = c.zones.get(zid)
    const platform = zone?.platform ?? home
    const name = zone?.name ?? zid
    // the item to go to: the source of an incident in the zone, else the detector reading highest
    const src = incidents.find((i) => i.zone === zid && 'source' in i.fault && i.fault.source)
    const srcTag = src && 'source' in src.fault ? src.fault.source : undefined
    let topDet: string | undefined
    let topVal = -Infinity
    for (const d of c.dets) {
      if (d.zone !== zid) continue
      const v = detState[d.tag]?.value ?? 0
      if (v > topVal && v > 0) {
        topVal = v
        topDet = d.tag
      }
    }
    const tag = itemOr(c, srcTag, topDet)
    const G = RULES.fireGas
    if (z.gas && z.gas !== 'normal') {
      gasOn.add(platform)
      const what = z.gas === 'confirmed' ? 'confirmed gas (2ooN high)' : z.gas === 'high' ? 'gas high (60 % LEL)' : 'gas low (20 % LEL)'
      add({ id: `fg:gas:${zid}`, platform, category: 'fireGas', tag, text: `${name}: ${what}${z.highCount ? `, ${z.highCount} detector${z.highCount > 1 ? 's' : ''} high` : ''}`, points: G.gas[z.gas] ?? 0 })
    }
    if (z.fire && z.fire !== 'normal') {
      add({ id: `fg:fire:${zid}`, platform, category: 'fireGas', tag, text: `${name}: ${z.fire === 'confirmed' ? 'confirmed fire (2ooN flame)' : 'flame detected (1ooN)'}`, points: G.fire[z.fire] ?? 0 })
    }
    if (z.deluge) add({ id: `fg:deluge:${zid}`, platform, category: 'fireGas', tag, text: `${name}: deluge released`, points: G.deluge })
  }

  // ---- shutdowns: the highest latched level per platform
  const sdBy: Partial<Record<PlatformId, { level: ShutdownLevel; reset: boolean; cause: string; id: string }>> = {}
  for (const sd of s.shutdowns ?? []) {
    const cur = sdBy[sd.platform]
    const reset = sd.resetAt !== undefined
    if (!cur || SHUTDOWN_RANK[sd.level] > SHUTDOWN_RANK[cur.level] || (SHUTDOWN_RANK[sd.level] === SHUTDOWN_RANK[cur.level] && cur.reset && !reset)) {
      sdBy[sd.platform] = { level: sd.level, reset, cause: sd.cause, id: sd.id }
    }
  }
  const shutdowns: Partial<Record<PlatformId, string>> = {}
  for (const [pl, sd] of Object.entries(sdBy) as [PlatformId, NonNullable<(typeof sdBy)[PlatformId]>][]) {
    shutdowns[pl] = sd.level
    const pts = (RULES.shutdown[sd.level] ?? 0) * (sd.reset ? RULES.shutdownResetShare : 1)
    add({ id: `sd:${pl}`, platform: pl, category: 'shutdown', tag: esdvOf(c, pl), text: `${sd.level} latched${sd.reset ? ' (reset, awaiting restart)' : ''}: ${sd.cause}`, points: pts })
  }

  // ---- alarm load: unacknowledged alarms per platform
  const A = RULES.alarms
  const unack: Partial<Record<PlatformId, { n: [number, number, number]; top?: { tag: string; text: string; prio: number } }>> = {}
  for (const a of s.alarms ?? []) {
    if (a.state !== 'unack') continue
    const pl = a.platform ?? home
    const u = (unack[pl] ??= { n: [0, 0, 0] })
    u.n[(a.priority ?? 3) - 1]++
    if (!u.top || a.priority < u.top.prio) u.top = { tag: a.tag, text: a.text, prio: a.priority }
  }
  for (const [pl, u] of Object.entries(unack) as [PlatformId, NonNullable<(typeof unack)[PlatformId]>][]) {
    const pts = Math.min(A.max, u.n[0] * A.p1 + u.n[1] * A.p2 + u.n[2] * A.p3)
    const total = u.n[0] + u.n[1] + u.n[2]
    const parts = [u.n[0] && `${u.n[0]}×P1`, u.n[1] && `${u.n[1]}×P2`, u.n[2] && `${u.n[2]}×P3`].filter(Boolean).join(', ')
    add({ id: `alarm:unack:${pl}`, platform: pl, category: 'alarms', tag: itemOr(c, u.top?.tag), text: `${total} unacknowledged alarm${total > 1 ? 's' : ''} (${parts})${u.top ? ` — worst: ${u.top.text}` : ''}`, points: pts })
  }
  const rate = num(s.kpis?.alarmRate) ?? 0
  if (rate >= A.floodRate) {
    const worst = (Object.entries(unack) as [PlatformId, NonNullable<(typeof unack)[PlatformId]>][]).sort((a, b) => b[1].n[0] * 100 + b[1].n[1] * 10 + b[1].n[2] - (a[1].n[0] * 100 + a[1].n[1] * 10 + a[1].n[2]))[0]?.[0] ?? home
    add({ id: 'alarm:flood', platform: worst, category: 'alarms', text: `Alarm flood: ${f0(rate)} alarms in 10 min (ISA-18.2 flood ≥ ${A.floodRate})`, points: A.flood })
  }

  // ---- machinery health and trips
  const M = RULES.machinery
  const health = useMaint.getState()?.health ?? {}
  for (const [tag, h] of Object.entries(health)) {
    const stage = h?.stage
    if (!stage || stage === 'normal') continue
    const pts = stage === 'failed' ? M.failed : stage === 'alarm' ? M.alarm : M.alert
    const deg = num(h.degr)
    add({ id: `mach:health:${tag}`, platform: platOf(c, tag), category: 'machinery', tag: itemOr(c, tag), text: `${tag} condition ${stage}${h.mode ? ` — ${h.mode}` : ''}${deg !== undefined ? ` (degradation ${f0(deg * 100)} %)` : ''}`, points: pts })
  }
  for (const [tag, st] of Object.entries(s.status ?? {})) {
    if (st !== 'tripped') continue
    const why = s.machines?.[tag]?.tripCause
    add({ id: `mach:trip:${tag}`, platform: platOf(c, tag), category: 'machinery', tag: itemOr(c, tag), text: `${tag} tripped${why ? `: ${why}` : ''}`, points: M.tripped })
  }

  // ---- safety barriers: inhibits, detector faults, stuck valves
  const B = RULES.barriers
  for (const [tag, on] of Object.entries(s.inhibits ?? {})) {
    if (on) add({ id: `bar:inh:${tag}`, platform: platOf(c, tag), category: 'barriers', tag: itemOr(c, tag), text: `${tag} detector inhibited (override in force)`, points: B.inhibit })
  }
  for (const [tag, d] of Object.entries(detState)) {
    if (d?.state === 'fault') add({ id: `bar:fault:${tag}`, platform: platOf(c, tag), category: 'barriers', tag: itemOr(c, tag), text: `${tag} detector in fault`, points: B.fault })
  }
  for (const [tag, v] of Object.entries(s.valves ?? {})) {
    if (v?.fault === 'stuck') add({ id: `bar:stuck:${tag}`, platform: platOf(c, tag), category: 'barriers', tag: itemOr(c, tag), text: `${tag} stuck — valve not moving (position discrepancy)`, points: B.stuckValve })
  }

  // ---- work & permits
  const W = RULES.work
  for (const pm of Object.values(useMaint.getState()?.permits ?? {})) {
    if (pm?.status !== 'issued') continue
    const pl = pm.platform && pm.platform !== 'Plant' ? pm.platform : platOf(c, pm.tag)
    if (pm.type === 'hot') {
      const gas = gasOn.has(pl)
      add({ id: `work:hot:${pm.id}`, platform: pl, category: 'work', tag: itemOr(c, pm.tag), text: `Hot-work permit ${pm.id} issued at ${pm.tag}${gas ? ' — gas alarm on the platform' : ''}`, points: W.hot + (gas ? W.hotWithGas : 0) })
    } else if (pm.type === 'confined') {
      add({ id: `work:cse:${pm.id}`, platform: pl, category: 'work', tag: itemOr(c, pm.tag), text: `Confined-space entry ${pm.id} at ${pm.tag}`, points: W.confined })
    }
  }

  // ---- weather & lifting
  const WX = RULES.weather
  const wind = num(s.knobs?.wind?.speed) ?? 0
  if (wind > WX.windHi) {
    add({ id: 'wx:wind', platform: home, category: 'weather', text: `Wind ${f0(wind)} m/s${wind > WX.windVhi ? ' (above crane limit)' : ''}`, points: wind > WX.windVhi ? WX.windVhiPts : WX.windHiPts })
  }
  const cranes = useCranes.getState()?.cranes ?? {}
  for (const [tag, cr] of Object.entries(cranes)) {
    if (cr?.state !== 'suspended') continue
    const site = CRANES.find((x) => x.tag === tag)
    add({ id: `wx:crane:${tag}`, platform: site?.platform ?? platOf(c, tag), category: 'weather', tag: itemOr(c, tag), text: `${tag} load suspended mid-lift${cr.reason ? `: ${cr.reason}` : ''}`, points: WX.craneSuspended })
  }

  // ---- people & PPE (CCTV detections in the last 2 min)
  const P = RULES.people
  const log = useCctv.getState()?.log ?? []
  const roster = useWorkers.getState()?.roster ?? []
  const ppe: Partial<Record<PlatformId, { n: number; last: string; worker?: string }>> = {}
  for (const d of log) {
    if (d.kind !== 'noHardHat' && d.kind !== 'noVest' && d.kind !== 'restrictedZone') continue
    if (t - d.t > P.window || d.t > t + 1) continue
    const cam = CAMERAS.find((x) => x.id === d.camera)
    const pl = cam?.platform ?? roster.find((w) => w.id === d.workerId)?.platform ?? home
    const e = (ppe[pl] ??= { n: 0, last: '' })
    e.n++
    if (!e.last) {
      const who = roster.find((w) => w.id === d.workerId)?.name
      e.last = `${d.kind === 'noHardHat' ? 'no hard hat' : d.kind === 'noVest' ? 'no hi-vis vest' : `too close to running ${d.tag ?? 'machinery'}`}${who ? ` (${who})` : ''}${cam ? ` on ${cam.name}` : ''}`
      e.worker = d.workerId
    }
  }
  for (const [pl, e] of Object.entries(ppe) as [PlatformId, NonNullable<(typeof ppe)[PlatformId]>][]) {
    add({ id: `ppe:${pl}`, platform: pl, category: 'people', text: `${e.n} PPE / machinery-zone violation${e.n > 1 ? 's' : ''} on CCTV in 2 min — latest: ${e.last}`, points: Math.min(P.max, e.n * P.each) })
  }

  // ---- hazardous areas: people tracked (worn tag / RTLS) in a Zone 0 / 1 / 2 without what it needs
  const HZ = RULES.hazardous
  const hz: Partial<Record<PlatformId, { pts: number; top: number; n: number; worst: string; tag?: string }>> = {}
  for (const v of useHazardTrack.getState()?.active ?? []) {
    const pts = v.kind === 'zone0Entry' ? HZ.zone0 : v.zone === 1 ? HZ.zone1 : HZ.zone2
    const e = (hz[v.platform] ??= { pts: 0, top: 0, n: 0, worst: '' })
    e.n++
    if (pts > e.top) {
      e.top = pts
      const who = roster.find((w) => w.id === v.workerId)?.name ?? v.workerId
      e.worst = v.kind === 'zone0Entry' ? `${who} inside Zone 0 of ${v.tag} (no confined-space permit)` : `${who} in Zone ${v.zone} at ${v.tag} without ${v.missing.map((k) => (k === 'gasMonitor' ? 'gas monitor' : k === 'hardHat' ? 'hard hat' : 'hi-vis / FR')).join(', ')}`
      e.tag = v.tag
    }
    e.pts += pts
  }
  for (const [pl, e] of Object.entries(hz) as [PlatformId, NonNullable<(typeof hz)[PlatformId]>][]) {
    add({ id: `hz:${pl}`, platform: pl, category: 'people', tag: e.tag && c.items.has(e.tag) ? e.tag : undefined, text: `Hazardous area: ${e.worst}${e.n > 1 ? ` (+${e.n - 1} more)` : ''} — tracked by worn tag`, points: Math.min(HZ.max, e.pts) })
  }

  // ---- roll up per platform, then the field
  const ids: PlatformId[] = c.offshore ? [...FIELD_PLATFORMS] : ['Plant']
  for (const x of out) if (!ids.includes(x.platform)) ids.push(x.platform)
  out.sort((a, b) => b.points - a.points)
  const platforms: Partial<Record<PlatformId, PlatformRisk>> = {}
  for (const id of ids) {
    const cs = out.filter((x) => x.platform === id)
    const score = Math.min(100, cs.reduce((a, x) => a + x.points, 0))
    platforms[id] = { platform: id, score: r1(score), band: bandOf(score), contributors: cs }
  }
  const scores = ids.map((id) => platforms[id]?.score ?? 0).sort((a, b) => b - a)
  const field = r1(Math.min(100, (scores[0] ?? 0) + RULES.field.others * scores.slice(1).reduce((a, v) => a + v, 0)))

  return {
    t,
    field,
    band: bandOf(field),
    platforms,
    contributors: out,
    availability: num(s.kpis?.availability) ?? num(s.availability) ?? 100,
    producing: (num(s.result?.actual) ?? 0) > 0,
    shutdowns,
  }
}

// ================================================================= plugin

let lastAt = -Infinity

function sample() {
  let now: RiskSnapshot
  try {
    now = computeRisk()
  } catch (e) {
    console.error('[risk] computeRisk failed', e)
    return
  }
  const p: Partial<Record<PlatformId, number>> = {}
  for (const [id, pr] of Object.entries(now.platforms)) if (pr) p[id as PlatformId] = pr.score
  const pt: RiskHistoryPoint = { t: now.t, field: now.field, p, availability: now.availability }
  useRisk.setState((st) => {
    const h = st.history
    // the clock went back (session reset / scenario load): start a fresh history
    const base = h.length && h[h.length - 1].t > now.t ? [] : h
    return { now, history: [...base.slice(-(RULES.historyCap - 1)), pt] }
  })
}

registerSimPlugin({
  id: 'risk',
  step: (_dt, t) => {
    if (t - lastAt < RULES.period && t >= lastAt) return
    lastAt = t
    sample()
  },
  reset: () => {
    lastAt = -Infinity
    useRisk.setState({ now: null, history: [] })
    // a first snapshot right away, so the console isn't empty while the clock is paused
    setTimeout(sample, 0)
  },
})

// first snapshot once the stores are up (the clock may start paused)
setTimeout(() => {
  if (!useRisk.getState().now) sample()
}, 0)

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __risk?: typeof useRisk }).__risk = useRisk
