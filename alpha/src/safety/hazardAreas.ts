/**
 * Hazardous-area classification (plan 14): ATEX / IEC 60079-10-1 gas zones derived from the plant data.
 *
 *   Zone 0  explosive gas atmosphere present continuously or for long periods (vessel interiors, vent tips)
 *   Zone 1  likely in normal operation (pump seals, compressor enclosures, wellheads, pig-trap closures)
 *   Zone 2  not likely in normal operation, and then only briefly (flanges, valves, instrument connections)
 *   safe    unclassified area (utilities, power, LQ, CCR, pressurised rooms)
 *
 * Gas only: there is no "Zone 3", and the dust zones 20 / 21 / 22 don't apply offshore.
 *
 * Extents are SCREENING values in the style of API RP 505 / IEC 60079-10-1 / EI 15 typical figures (see
 * CLASSIFICATION), not a release-rate calculation: a real area classification sizes each source from its
 * release rate, ventilation and fluid category.
 *
 * Coordinates: every volume is DECK-LOCAL (x east, z south, y up from the Alpha production-deck plate);
 * `hazardZoneAt(world)` subtracts DECK_WORLD_Y (28), `hazardZoneAtLocal(x, y, z)` takes deck-local.
 * The classification is deterministic and cached per plant (WeakMap); a lookup is a 4 m grid bucket plus a
 * handful of point-in-volume tests — cheap enough per worker per sim tick.
 *
 * This module is pure (model + plant helpers only). The tracker (who is in which zone, violations) lives in
 * safety/workers.ts, the camera side in safety/cctv.ts, the alert rule in alerts.ts.
 */
import type { Equipment, Plant, PlanRect, Vec3 } from '../model/types'
import type { PlatformId } from '../sim/types'
import type { WorkerInfo } from './types'
import { footprints, type Footprint } from '../model/footprint'
import { VENTS } from '../model/vents'
import { ALPHA_DECK } from '../model/site'
import { flareTip } from '../scene/env/topsides'
import { blockers, freeSpot, levelAt, walkable, walkLevels } from '../scene/Walk'
import { DECK_WORLD_Y } from '../state/store'
import { usePlantStore } from '../state/plantStore'
import { platformAt } from '../sim/fg'
import { useMaint } from '../sim/maintenance'

// ---------------------------------------------------------------- types

export type HazZone = 0 | 1 | 2

/** a volume, deck-local metres */
export type HazShape =
  | { kind: 'box'; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
  /** vertical cylinder */
  | { kind: 'cyl'; x: number; z: number; r: number; y0: number; y1: number }
  | { kind: 'sphere'; x: number; y: number; z: number; r: number }
  /** horizontal cylinder (vessel shell): axis through (x, y, z) along the unit plan vector (ux, uz), ± half */
  | { kind: 'hcyl'; x: number; y: number; z: number; ux: number; uz: number; half: number; r: number }

export type HazSource = 'pumpSeal' | 'compressor' | 'wellhead' | 'wellCentre' | 'pigTrap' | 'process' | 'valve' | 'interior' | 'vent' | 'flare' | 'turbine'

export interface HazVolume {
  id: string
  zone: HazZone
  /** the plant item the release source belongs to */
  tag: string
  source: HazSource
  /** plain words: "Pump mechanical seal, Crude Export Pump A" */
  reason: string
  platform: PlatformId
  /** walk-level index of the floor it stands on; -1 = elevated (vent / flare tips) */
  level: number
  shape: HazShape
  /** broad phase: [x0, y0, z0, x1, y1, z1] */
  bb: [number, number, number, number, number, number]
}

export interface HazHit {
  zone: HazZone
  volume: HazVolume
}

// ---------------------------------------------------------------- the table (shown in the console)

/** source kinds → typical extents (screening values) — the console prints this table */
export const CLASSIFICATION: { source: HazSource; what: string; z0?: string; z1?: string; z2?: string }[] = [
  { source: 'pumpSeal', what: 'Pump mechanical seals (hydrocarbon service)', z1: '1 m around the pump skid', z2: '3 m around, to 1 m above the skid' },
  { source: 'compressor', what: 'Gas compressor package', z1: 'inside the package enclosure', z2: '3 m around the package' },
  { source: 'wellhead', what: 'Wellheads / Xmas trees (producers)', z1: '1.5 m around the tree', z2: '3 m around the tree' },
  { source: 'wellCentre', what: 'Well centre: BOP stack, rotary table', z1: '1.5 m around', z2: '3 m around' },
  { source: 'pigTrap', what: 'Pig-trap closure door', z1: '1.5 m around the closure', z2: '3 m around the trap' },
  { source: 'process', what: 'HC vessels, exchangers, manifolds, metering / chemical skids: flanges, valves, instrument connections', z2: '3 m envelope' },
  { source: 'valve', what: 'Control, ESD and blowdown valve stations on hydrocarbon lines (flanges, stem packing)', z2: '3 m around the valve' },
  { source: 'interior', what: 'Vessel / tank interiors (hydrocarbon)', z0: 'inside the shell — confined-space entry only' },
  { source: 'vent', what: 'Cold vent tips (elevated)', z0: '1 m', z1: '3 m', z2: '6 m' },
  { source: 'flare', what: 'Flare tip, unlit / flame-out case (elevated)', z0: '1 m', z1: '3 m', z2: '6 m' },
  { source: 'turbine', what: 'Gas-turbine enclosure (fuel gas)', z2: 'inside the acoustic enclosure' },
]
export const CLASSIFICATION_BASIS =
  'Screening extents after API RP 505 / IEC 60079-10-1 / EI 15 typical figures — not a release-rate calculation. Utilities, power, LQ, the CCR and pressurised rooms are safe (unclassified) area.'

/** industry colours: Zone 0 red, Zone 1 orange, Zone 2 yellow */
export const HAZ_COLOR: Record<HazZone, string> = { 0: '#e0453a', 1: '#f08c1e', 2: '#f2d02b' }

// ---------------------------------------------------------------- PPE / entry matrix

export type PpeItem = 'hardHat' | 'vest' | 'gasMonitor'
export const PPE_LABEL: Record<PpeItem, string> = { hardHat: 'hard hat', vest: 'hi-vis / FR coverall', gasMonitor: 'personal gas monitor' }

export interface ZoneRule {
  zone: HazZone | 'safe'
  name: string
  /** where it is, in words */
  where: string
  entry: string
  /** PPE / gear tracked by the twin */
  ppe: PpeItem[]
  /** further rules shown in the matrix (not tracked per person) */
  also: string[]
}

export const ZONE_RULES: ZoneRule[] = [
  { zone: 0, name: 'Zone 0', where: 'Vessel / tank interiors, vent and flare tips', entry: 'No entry — only under an issued confined-space entry permit with a gas test', ppe: ['hardHat', 'vest', 'gasMonitor'], also: ['Standby man and rescue plan', 'Continuous gas test'] },
  { zone: 1, name: 'Zone 1', where: 'Pump seals, compressor enclosures, wellheads, pig-trap closures', entry: 'Authorised personnel', ppe: ['hardHat', 'vest', 'gasMonitor'], also: ['No non-Ex devices (phones, radios, torches must be Ex)', 'Hot work only under a hot-work permit'] },
  { zone: 2, name: 'Zone 2', where: '3 m envelopes around flanges, valves and HC equipment', entry: 'Authorised personnel', ppe: ['hardHat', 'vest'], also: ['Ex-rated portable equipment', 'Hot work only under a hot-work permit'] },
  { zone: 'safe', name: 'Safe area', where: 'Utilities, power, LQ, CCR, pressurised rooms (unclassified)', entry: 'Open', ppe: [], also: ['Site minimum PPE on open deck (hard hat, coverall, boots, glasses)'] },
]

/** PPE / gear the twin tracks for a zone (null = safe area: the site minimum, covered by the plain PPE rule) */
export function requiredPpe(zone: HazZone | null): PpeItem[] {
  return zone === null ? [] : ZONE_RULES.find((r) => r.zone === zone)!.ppe
}

export type HazViolationKind = 'zone0Entry' | 'zonePpe'
/**
 * What is wrong with this person being here: Zone 0 entry without an issued confined-space permit, or PPE /
 * gear missing for the zone. A permit makes Zone 0 a Zone 1-style PPE check. null = nothing wrong.
 */
export function assess(w: Pick<WorkerInfo, 'hardHat' | 'vest' | 'gasMonitor'>, hit: HazHit | null, permitOk = false): { kind: HazViolationKind; missing: PpeItem[] } | null {
  if (!hit) return null
  const missing = requiredPpe(hit.zone).filter((k) => !w[k])
  if (hit.zone === 0 && !permitOk) return { kind: 'zone0Entry', missing }
  return missing.length ? { kind: 'zonePpe', missing } : null
}

/** an issued confined-space entry permit on this item (the only lawful Zone 0 entry) */
export function confinedPermitFor(tag: string): string | null {
  for (const p of Object.values(useMaint.getState().permits ?? {})) if (p.type === 'confined' && p.status === 'issued' && p.tag === tag) return p.id
  return null
}

// ---------------------------------------------------------------- classification

/** systems carrying hydrocarbons (utilities, safety and accommodation are safe area) */
const HC_SYSTEMS = new Set(['production', 'oilExport', 'gasCompression', 'flare', 'wells', 'producedWater', 'gasTreatment', 'drains'])
/** equipment in an HC system that isn't a release source itself (hydraulic oil panels) */
const NOT_A_SOURCE = /hydraulic|HPU|WHCP/i

const R2 = 3 // Zone 2 envelope, m
const PUMP_Z1 = 1
const TREE_Z1 = 1.5
const TREE_Z2 = 3
const TRAP_Z1 = 1.5
const TIP = { z0: 1, z1: 3, z2: 6 }

const hasHc = (e: Equipment) => HC_SYSTEMS.has(e.system) && !NOT_A_SOURCE.test(e.name)
/** valve stations that are release sources on hydrocarbon lines */
const VALVE_SOURCES = new Set(['control', 'esdv', 'bdv'])
const HC_SERVICES = new Set(['oil', 'gas', 'multiphase'])

/** rough top of an item, deck-local */
function topOf(e: Equipment): number {
  const y = e.position[1]
  switch (e.kind) {
    case 'horizontalVessel':
      return y + e.id / 2
    case 'verticalVessel':
      return y + e.elevation + e.tt + e.id / 4
    case 'shellTube':
      return y + e.shellOd / 2
    case 'pumpPackage':
      return y + 1.4
    case 'compressorPackage':
      return y + 3.5
    case 'pigTrap':
      return y + 0.6
    case 'manifold':
      return y + 1.6
    case 'chemSkid':
      return y + 2.4
    case 'xmasTree':
      return y + e.wellheadHeight + 2.2
    case 'gasTurbineGenerator':
      return y + e.enclosureHeight
    case 'proxy':
      return y + e.size[1]
    default:
      return y + 2.5
  }
}

/** the deck above (production under the Alpha weather deck, cellars under their main deck) caps a volume */
function ceilingAt(levelId: string | undefined, x: number, z: number): number {
  if (levelId === 'cellar') return -0.9
  if (levelId === 'production' && x >= ALPHA_DECK.x0 && x <= ALPHA_DECK.x1 && z >= ALPHA_DECK.z0 && z <= ALPHA_DECK.z1) return 9.4
  return Infinity
}

function bbOf(s: HazShape): HazVolume['bb'] {
  switch (s.kind) {
    case 'box':
      return [s.x0, s.y0, s.z0, s.x1, s.y1, s.z1]
    case 'cyl':
      return [s.x - s.r, s.y0, s.z - s.r, s.x + s.r, s.y1, s.z + s.r]
    case 'sphere':
      return [s.x - s.r, s.y - s.r, s.z - s.r, s.x + s.r, s.y + s.r, s.z + s.r]
    case 'hcyl': {
      const ex = Math.abs(s.ux) * s.half + s.r
      const ez = Math.abs(s.uz) * s.half + s.r
      return [s.x - ex, s.y - s.r, s.z - ez, s.x + ex, s.y + s.r, s.z + ez]
    }
  }
}

/** is the deck-local point inside the shape */
export function contains(s: HazShape, x: number, y: number, z: number): boolean {
  switch (s.kind) {
    case 'box':
      return x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1 && z >= s.z0 && z <= s.z1
    case 'cyl': {
      if (y < s.y0 || y > s.y1) return false
      const dx = x - s.x
      const dz = z - s.z
      return dx * dx + dz * dz <= s.r * s.r
    }
    case 'sphere': {
      const dx = x - s.x
      const dy = y - s.y
      const dz = z - s.z
      return dx * dx + dy * dy + dz * dz <= s.r * s.r
    }
    case 'hcyl': {
      const dx = x - s.x
      const dy = y - s.y
      const dz = z - s.z
      const a = dx * s.ux + dz * s.uz
      if (a < -s.half || a > s.half) return false
      const px = dx - a * s.ux
      const pz = dz - a * s.uz
      return px * px + dy * dy + pz * pz <= s.r * s.r
    }
  }
}

interface Built {
  volumes: HazVolume[]
  /** 4 m plan buckets → volume indices */
  grid: Map<number, number[]>
  /** pressurised / enclosed rooms (modules): safe area even inside an envelope */
  rooms: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }[]
}

const CELL = 4
const key = (ix: number, iz: number) => (ix + 512) * 4096 + (iz + 2048)
const cache = new WeakMap<Plant, Built>()

function classify(plant: Plant): HazVolume[] {
  const levels = walkLevels(plant)
  const fps = footprints(plant.equipment, 0)
  const out: HazVolume[] = []
  let n = 0
  const add = (e: { tag: string; position: Vec3 }, zone: HazZone, source: HazSource, reason: string, shape: HazShape, level: number) => {
    // cap at the deck above (keeps the cellar volumes under the production deck plate)
    const lv = level >= 0 ? levels[level] : undefined
    const cap = ceilingAt(lv?.id, e.position[0], e.position[2])
    if (shape.kind === 'box' || shape.kind === 'cyl') shape.y1 = Math.min(shape.y1, cap)
    out.push({ id: `HZ${(++n).toString().padStart(3, '0')}`, zone, tag: e.tag, source, reason, platform: platformAt(e.position), level, shape, bb: bbOf(shape) })
  }
  const grow = (f: Footprint, m: number, y0: number, y1: number): HazShape => ({ kind: 'box', x0: f.x0 - m, x1: f.x1 + m, z0: f.z0 - m, z1: f.z1 + m, y0, y1 })

  plant.equipment.forEach((e, i) => {
    const f = fps[i]
    const li = levelAt(levels, e.position[1])
    const floor = levels[li]?.y ?? 0
    const top = topOf(e)
    const env2 = (what: string) => add(e, 2, 'process', `${what}, ${e.name}`, grow(f, R2, floor, top + R2), li)

    // gas-turbine enclosures carry fuel gas whatever their system (utilities)
    if (e.kind === 'gasTurbineGenerator') {
      const c = Math.cos(e.rotationY)
      const s = Math.sin(e.rotationY)
      const hx = e.skid[0] / 2
      const hz = e.skid[1] / 2
      const ex = Math.abs(c) * hx + Math.abs(s) * hz
      const ez = Math.abs(s) * hx + Math.abs(c) * hz
      add(e, 2, 'turbine', `Gas-turbine acoustic enclosure (fuel gas), ${e.name}`, { kind: 'box', x0: e.position[0] - ex, x1: e.position[0] + ex, z0: e.position[2] - ez, z1: e.position[2] + ez, y0: floor, y1: floor + e.enclosureHeight }, li)
      return
    }
    if (!hasHc(e)) return

    switch (e.kind) {
      case 'pumpPackage':
        add(e, 1, 'pumpSeal', `Pump mechanical seal, ${e.name}`, grow(f, PUMP_Z1, floor, top + PUMP_Z1), li)
        add(e, 2, 'pumpSeal', `Pump seal / flanges, ${e.name}`, grow(f, R2, floor, top + R2), li)
        return
      case 'compressorPackage':
        add(e, 1, 'compressor', `Inside the compressor package enclosure, ${e.name}`, grow(f, 0, floor, top), li)
        add(e, 2, 'compressor', `Around the compressor package, ${e.name}`, grow(f, R2, floor, top + R2), li)
        return
      case 'xmasTree': {
        if (e.wellType === 'waterInjector') return
        const x = e.position[0]
        const z = e.position[2]
        if (e.wellType !== 'suspended') add(e, 1, 'wellhead', `Wellhead / Xmas tree, ${e.name}`, { kind: 'cyl', x, z, r: TREE_Z1, y0: floor, y1: top + TREE_Z1 }, li)
        add(e, 2, 'wellhead', `Around the wellhead, ${e.name}`, { kind: 'cyl', x, z, r: TREE_Z2, y0: floor, y1: top + TREE_Z2 }, li)
        return
      }
      case 'pigTrap': {
        // closure door at the local +X end of the barrel
        const cx = e.position[0] + Math.cos(e.rotationY) * (e.length / 2)
        const cz = e.position[2] - Math.sin(e.rotationY) * (e.length / 2)
        add(e, 1, 'pigTrap', `Pig-trap closure door, ${e.name}`, { kind: 'cyl', x: cx, z: cz, r: TRAP_Z1, y0: floor, y1: top + TRAP_Z1 }, li)
        add(e, 2, 'pigTrap', `Around the pig trap, ${e.name}`, grow(f, R2, floor, top + R2), li)
        return
      }
      case 'horizontalVessel': {
        env2('Flanges, valves and instrument connections')
        const ux = Math.cos(e.rotationY)
        const uz = -Math.sin(e.rotationY)
        add(e, 0, 'interior', `Inside ${e.name}`, { kind: 'hcyl', x: e.position[0], y: e.position[1], z: e.position[2], ux, uz, half: e.tt / 2 + e.id / 4, r: e.id / 2 }, li)
        return
      }
      case 'verticalVessel': {
        env2('Flanges, valves and instrument connections')
        const y0 = e.position[1] + e.elevation - e.id / 4
        add(e, 0, 'interior', `Inside ${e.name}`, { kind: 'cyl', x: e.position[0], z: e.position[2], r: e.id / 2, y0: Math.max(floor, y0), y1: e.position[1] + e.elevation + e.tt + e.id / 4 }, li)
        return
      }
      case 'shellTube':
        env2('Exchanger flanges and channel head')
        return
      case 'manifold':
        env2('Manifold valves and flanges')
        return
      case 'chemSkid':
        env2('Skid flanges, valves and vents')
        return
      case 'proxy': {
        if (e.role !== 'bop' && e.role !== 'drillingRig') return // vent stacks: from VENTS below
        const x = e.position[0]
        const z = e.position[2]
        const r = e.role === 'bop' ? Math.max(e.size[0], e.size[2]) / 2 : 0
        const y1 = e.role === 'bop' ? e.position[1] + e.size[1] : floor + 2
        const what = e.role === 'bop' ? `Well centre, ${e.name}` : `Rotary table / bell nipple, ${e.name}`
        add(e, 1, 'wellCentre', what, { kind: 'cyl', x, z, r: r + TREE_Z1, y0: floor, y1: y1 + TREE_Z1 }, li)
        add(e, 2, 'wellCentre', what, { kind: 'cyl', x, z, r: r + TREE_Z2, y0: floor, y1: y1 + TREE_Z2 }, li)
        return
      }
      default:
        return
    }
  })

  // valve stations on hydrocarbon lines between the equipment (the export headers' control and ESD valves …):
  // flanges and stem packing are secondary-grade sources → a Zone 2 envelope like the equipment's
  const lineByTag = new Map(plant.lines.map((l) => [l.tag, l]))
  for (const v of plant.valves) {
    if (!VALVE_SOURCES.has(v.type)) continue
    const l = lineByTag.get(v.line)
    if (!l || !HC_SERVICES.has(l.service) || v.seg < 0) continue
    const a = l.route[v.seg]
    const b = l.route[v.seg + 1]
    if (!a || !b) continue
    const p: Vec3 = [a[0] + (b[0] - a[0]) * v.t, a[1] + (b[1] - a[1]) * v.t, a[2] + (b[2] - a[2]) * v.t]
    const li = levelAt(levels, p[1])
    const floor = levels[li]?.y ?? 0
    if (p[1] < floor - 0.3) continue // under the deck plate: nobody walks there
    add({ tag: v.tag, position: p }, 2, 'valve', `Valve station flanges and packing, ${v.tag} on ${v.line}`, { kind: 'cyl', x: p[0], z: p[2], r: R2, y0: floor, y1: p[1] + R2 }, li)
  }

  // elevated tips: cold vents (model/vents.ts) and the Alpha flare (unlit / flame-out case)
  const tips: { tag: string; source: HazSource; what: string; p: Vec3 }[] = []
  const tags = new Set(plant.equipment.map((e) => e.tag))
  for (const v of VENTS) if (tags.has(v.tag)) tips.push({ tag: v.tag, source: 'vent', what: `Cold vent tip, ${v.name}`, p: [v.x, v.y + v.height, v.z] })
  if (plant.deck.site === 'offshoreAlpha') {
    const w = flareTip()
    tips.push({ tag: 'FLARE', source: 'flare', what: 'Flare tip (unlit / flame-out case)', p: [w[0], w[1] - DECK_WORLD_Y, w[2]] })
  }
  for (const tp of tips) {
    const e = { tag: tp.tag, position: tp.p }
    add(e, 0, tp.source, tp.what, { kind: 'sphere', x: tp.p[0], y: tp.p[1], z: tp.p[2], r: TIP.z0 }, -1)
    add(e, 1, tp.source, tp.what, { kind: 'sphere', x: tp.p[0], y: tp.p[1], z: tp.p[2], r: TIP.z1 }, -1)
    add(e, 2, tp.source, tp.what, { kind: 'sphere', x: tp.p[0], y: tp.p[1], z: tp.p[2], r: TIP.z2 }, -1)
  }
  return out
}

function build(plant: Plant): Built {
  let b = cache.get(plant)
  if (b) return b
  const volumes = classify(plant)
  const grid = new Map<number, number[]>()
  volumes.forEach((v, i) => {
    const [x0, , z0, x1, , z1] = v.bb
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = key(ix, iz)
        const l = grid.get(k)
        if (l) l.push(i)
        else grid.set(k, [i])
      }
  })
  const levels = walkLevels(plant)
  const fps = footprints(plant.equipment, 0)
  const rooms = plant.equipment.flatMap((e, i) => {
    if (e.kind !== 'module') return []
    const floor = levels[levelAt(levels, e.position[1])]?.y ?? 0
    const f = fps[i]
    return [{ x0: f.x0 + 0.2, x1: f.x1 - 0.2, z0: f.z0 + 0.2, z1: f.z1 - 0.2, y0: floor - 0.5, y1: floor + e.size[1] }]
  })
  b = { volumes, grid, rooms }
  cache.set(plant, b)
  return b
}

/** every classified volume of the plant (deterministic, cached per plant) */
export function hazardAreas(plant: Plant = usePlantStore.getState().plant): HazVolume[] {
  return build(plant).volumes
}

/** highest-hazard zone holding a DECK-LOCAL point (null = safe / unclassified area) */
export function hazardZoneAtLocal(x: number, y: number, z: number, plant: Plant = usePlantStore.getState().plant): HazHit | null {
  const b = build(plant)
  const list = b.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)))
  if (!list) return null
  for (const r of b.rooms) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1) return null
  let best: HazVolume | null = null
  for (const i of list) {
    const v = b.volumes[i]
    if (best && v.zone >= best.zone) continue
    const bb = v.bb
    if (x < bb[0] || y < bb[1] || z < bb[2] || x > bb[3] || y > bb[4] || z > bb[5]) continue
    if (contains(v.shape, x, y, z)) {
      best = v
      if (v.zone === 0) break
    }
  }
  return best ? { zone: best.zone, volume: best } : null
}

/** highest-hazard zone holding a WORLD point (y world = deck-local + 28) */
export function hazardZoneAt(p: Vec3 | { x: number; y: number; z: number }, plant?: Plant): HazHit | null {
  const [x, y, z] = Array.isArray(p) ? p : [p.x, p.y, p.z]
  return hazardZoneAtLocal(x, y - DECK_WORLD_Y, z, plant)
}
/** the brief's name for the world lookup */
export const zoneAt = hazardZoneAt

/** a person is sampled at chest height (deck-local floor + this) */
export const CHEST = 1.0

/** zone of a person standing at plan (x, z) on the floor at deck-local height `floor` */
export const personZone = (x: number, floor: number, z: number, plant?: Plant) => hazardZoneAtLocal(x, floor + CHEST, z, plant)

// ---------------------------------------------------------------- instructor / scripted targets

export interface ZoneTarget {
  volume: HazVolume
  /** where the person stands (inside the volume, chest height inside) */
  to: [number, number]
  /** a walkable point outside it the path planner aims for first */
  via: [number, number]
  /** equipment to face */
  face: string
  /** the person is partly hidden by the item (Zone 0: inside the shell) */
  hidden: boolean
}

const targetCache = new WeakMap<Plant, Map<string, ZoneTarget[]>>()

/**
 * Standing points INSIDE zone-0 / zone-1 volumes on a walk level, one per volume where one exists: open
 * deck (not inside another item's skid) with the chest inside the volume by ≥ 0.5 m. Zone 0 targets are
 * the head ends of horizontal vessels low enough for a standing person's chest to be inside the shell
 * (the "entering through the manway" picture), then vertical vessels. Cached per plant + level.
 */
export function zoneTargets(zone: 0 | 1, li: number, plant: Plant = usePlantStore.getState().plant): ZoneTarget[] {
  let m = targetCache.get(plant)
  if (!m) targetCache.set(plant, (m = new Map()))
  const k = `${zone}:${li}`
  const hit = m.get(k)
  if (hit) return hit
  const levels = walkLevels(plant)
  const lv = levels[li]
  const out: ZoneTarget[] = []
  if (lv) {
    const fps = footprints(plant.equipment, 0.1)
    const onLevel = plant.equipment.map((e, i) => ({ e, f: fps[i] })).filter(({ e }) => e.kind !== 'proxy' && levelAt(levels, e.position[1]) === li)
    const block = blockers(plant, li)
    const inRects = (rs: PlanRect[], x: number, z: number) => rs.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)
    const standable = (x: number, z: number, own: string) => inRects(lv.areas, x, z) && !inRects(lv.obstacles ?? [], x, z) && !onLevel.some(({ e, f }) => e.tag !== own && x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1)
    const chest = lv.y + CHEST
    for (const v of hazardAreas(plant)) {
      if (v.zone !== zone || v.level !== li) continue
      const s = v.shape
      const ownFp = onLevel.find(({ e }) => e.tag === v.tag)?.f
      const outsideOwn = (x: number, z: number) => !ownFp || !(x > ownFp.x0 && x < ownFp.x1 && z > ownFp.z0 && z < ownFp.z1)
      if (zone === 0) {
        // vessel head ends (horizontal) / shell edge (vertical): chest inside the shell
        const cands: { to: [number, number]; out: [number, number] }[] = []
        if (s.kind === 'hcyl') {
          if (s.y - s.r > chest - 0.1) continue // the shell is above a standing person's chest
          for (const sg of [1, -1]) {
            const ex = s.x + sg * s.ux * s.half
            const ez = s.z + sg * s.uz * s.half
            cands.push({ to: [ex - sg * s.ux * 0.35, ez - sg * s.uz * 0.35], out: [ex + sg * s.ux * 1.6, ez + sg * s.uz * 1.6] })
          }
        } else if (s.kind === 'cyl') {
          if (s.y0 > chest - 0.2 || s.y1 < chest + 0.2) continue
          for (let a = 0; a < 8; a++) {
            const dx = Math.cos((a / 8) * Math.PI * 2)
            const dz = Math.sin((a / 8) * Math.PI * 2)
            cands.push({ to: [s.x + dx * Math.max(0, s.r - 0.3), s.z + dz * Math.max(0, s.r - 0.3)], out: [s.x + dx * (s.r + 1.6), s.z + dz * (s.r + 1.6)] })
          }
        } else continue
        for (const c of cands) {
          if (!contains(s, c.to[0], chest, c.to[1]) || !standable(c.out[0], c.out[1], v.tag)) continue
          if (!walkable(plant, li, block, c.out[0], c.out[1])) continue
          out.push({ volume: v, to: c.to, via: c.out, face: v.tag, hidden: s.kind === 'cyl' })
          if (s.kind === 'cyl') break // vertical shell: one spot; horizontal: both head ends (a camera may see only one)
        }
        continue
      }
      // zone 1: march out from the source centre in 16 directions; the farthest standable point still ≥ 0.5 m inside
      const cx = s.kind === 'box' ? (s.x0 + s.x1) / 2 : s.kind === 'hcyl' || s.kind === 'cyl' || s.kind === 'sphere' ? s.x : 0
      const cz = s.kind === 'box' ? (s.z0 + s.z1) / 2 : s.kind === 'hcyl' || s.kind === 'cyl' || s.kind === 'sphere' ? s.z : 0
      let best: ZoneTarget | null = null
      let bestScore = -Infinity
      for (let a = 0; a < 16; a++) {
        const dx = Math.cos((a / 16) * Math.PI * 2)
        const dz = Math.sin((a / 16) * Math.PI * 2)
        let pick = -1
        for (let t = 0.2; t < 9; t += 0.1) {
          const x = cx + dx * t
          const z = cz + dz * t
          if (!contains(s, x, chest, z)) break
          if (contains(s, cx + dx * (t + 0.5), chest, cz + dz * (t + 0.5)) && outsideOwn(x, z) && standable(x, z, v.tag)) pick = t
        }
        if (pick < 0) continue
        const to: [number, number] = [cx + dx * pick, cz + dz * pick]
        // the approach point: first walkable spot ≥ 0.8 m outside the volume along the same ray
        let via: [number, number] | null = null
        for (let t = pick + 0.5; t < pick + 6; t += 0.25) {
          const x = cx + dx * t
          const z = cz + dz * t
          if (!contains(s, x, chest, z) && walkable(plant, li, block, x, z)) {
            via = [x, z]
            break
          }
        }
        if (!via) continue
        // prefer a short last leg off the walkway
        const score = -Math.hypot(via[0] - to[0], via[1] - to[1])
        if (score > bestScore) {
          bestScore = score
          best = { volume: v, to, via, face: v.tag, hidden: false }
        }
      }
      if (best) out.push(best)
    }
  }
  m.set(k, out)
  return out
}

/** nearest walkable spot (re-exported for the instructor when a target's approach point moved) */
export const nearestWalkable = freeSpot

if (import.meta.env?.DEV && typeof window !== 'undefined') Object.assign(window as unknown as Record<string, unknown>, { __hazAreas: { hazardAreas, hazardZoneAt, hazardZoneAtLocal, zoneTargets, personZone } })
