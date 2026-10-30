/**
 * Fire & gas geometry shared by the simulation (detection, voting, cause & effect) and the F&G
 * mapping views (coverage heatmap, zone table): fire zones, detector positions / aims, platform
 * membership, gas-cloud readings, flame visibility and geographic / scenario coverage.
 *
 * All positions are DECK-LOCAL (world = deck-local + [0, 28, 0]).
 *
 * ── Method (ISA-TR84.00.07-2018 style F&G mapping) ─────────────────────────────────────────────
 *  - Each fire zone is gridded at CELL = 1 m, at a monitored elevation MONITOR_HEIGHT = 1.5 m above
 *    the zone floor. Cells inside solid equipment, modules or environment blocks at that height are
 *    not part of the area and are dropped.
 *  - FLAME (geographic coverage): a reference fire REF_FIRE_MW sits on the deck at each cell (base 0.5 m
 *    up; it counts as seen if its base or upper flame is, exactly the live `flameSees` test). A flame detector sees
 *    it if the cell is inside its cone of vision (90° FOV, axis tilted 20° down), within range, and the
 *    line of sight is not blocked by an equipment box. Range scales with the inverse-square law:
 *    R = FD_RANGE·√(Q / 1 MW). FD_RANGE = 16 m is the effective range for a 1 MW hydrocarbon fire. It is
 *    derated from a vendor IR3 rating (n-heptane 0.1 m² at ~45–60 m) for congestion, smoke and
 *    off-axis loss, which is common mapping practice for congested offshore modules.
 *  - GAS (scenario coverage): a reference release REF_RELEASE_KGS = 1 kg/s at each cell, in the current
 *    wind. A point GD counts if it reaches the high alarm (60 % LEL); an open-path beam counts if it
 *    reaches 3 LEL·m.
 *  - Voting group = zone membership. A detector belongs to the zone it is mounted in; open-path beams
 *    belong to the zone of their beam midpoint. Only a zone's own detectors count in that zone's coverage,
 *    which keeps it consistent with 1ooN / 2ooN voting in the C&E. Use `zoneDetectors()` for the
 *    voting sets.
 *
 * ── Targets (fraction of the zone's mapped cells) ───────────────────────────────────────────────
 *  Assumed from ISA-TR84.00.07 Annex B worked examples and typical North Sea operator philosophies
 *  (risk-graded "A/B/C" areas; 90 % / 85 % for high-risk process areas, lower for utilities):
 *    process & well bay  flame 1oo 90 / 2oo 85   gas 1oo 90 / 2oo 85
 *    turbine / power     flame 1oo 90 / 2oo 80   gas 1oo 85 / 2oo 75   (fuel gas)
 *    drilling            flame 1oo 85 / 2oo 75   gas 1oo 85 / 2oo 75
 *    utility             flame 1oo 60 / 2oo 40   gas 1oo 50 / 2oo  0
 *    LQ main deck        flame 1oo 60 / 2oo 40   gas n/a (diesel only; HVAC-intake GDs protect ingress)
 *    modules, bridges    n/a. Modules are protected by smoke / heat detection inside. Bridges carry only
 *                        welded pipe with no leak sources, so they are not graded.
 *  A target of 0 means "not graded" (n/a).
 *
 * ── Gas dispersion (deliberately simple and documented, not CFD) ───────────────────────────────
 *  Dense-gas / jet cloud as a 3-D Gaussian ellipsoid in units of the LFL:
 *    C/LFL = C0^(1 − s²),  s² = (along/a)² + (cross/b)² + ((y − hc)/c)²,  C0 = 4 (rich core).
 *  So s = 1 is the LFL envelope, s ≈ 1.17 is 60 % LEL and s ≈ 1.47 is 20 % LEL.
 *    Steady LFL radius   Rss = 7 m · √(ṁ / 1 kg/s) / (1 + 0.05·u)
 *                        (1 kg/s: 7 m calm, 5.4 m at 6 m/s; dilutes faster at higher wind)
 *    Growth              R(t) = Rss·(1 − e^(−t/8 s))
 *    Wind (e = min(u/6, 1))  stretched downwind  a = R(1 + 0.6e),  narrowed  b = R(1 − 0.25e),
 *                        centre advected 0.9·e·R downwind (upwind reach shrinks to 0.7R)
 *    Dense gas           slumps: centre height hc = floor + clamp(½·release height, 0.3, 3) m,
 *                        vertical semi-axis c = 0.35·R + 1.2 m. The cloud stays on its own deck.
 *  Open-path detectors integrate C/LFL along the beam (0.25 m steps) → LEL·m.
 */
import type { Instrument, Plant, PlanRect, Vec3 } from '../model/types'
import type { PlatformId } from './types'
import { footprints } from '../model/footprint'
import { ALPHA_DECK, BRIDGE_N, BRIDGE_S, CELLAR_FLOOR, LQ, RIG_SLOT, WEATHER_FLOOR, WHP } from '../model/site'

export type DetectorType = 'FD' | 'GD' | 'OGD' | 'HD' | 'SD' | 'MAC'

export interface FireZone {
  id: string
  name: string
  platform: PlatformId
  /** deck-local floor and ceiling of the zone */
  y0: number
  y1: number
  rects: PlanRect[]
  kind: 'process' | 'wellbay' | 'utility' | 'turbine' | 'drilling' | 'lq' | 'module' | 'bridge'
  /** performance targets (fraction of the zone area), ISA TR84.00.07 style */
  targets: { flame1: number; flame2: number; gas1: number; gas2: number }
  /** module zones: the module equipment tag */
  module?: string
  /** short description of what is in the zone */
  note?: string
}

export interface Detector {
  tag: string
  type: DetectorType
  /** sensor position, deck-local */
  pos: Vec3
  /** FD: unit view axis (deck frame); OGD transmitter: unit beam direction */
  aim?: Vec3
  /** OGD transmitter: receiver position */
  rx?: Vec3
  zone: string | null
  platform: PlatformId
  /** HD / SD inside a module: the module tag */
  module?: string
  /** OGD transmitter: the receiver's tag (receivers are not listed separately, so a beam votes once) */
  rxTag?: string
  /** deck level the detector stands on (deck-local y) */
  floor?: number
}

/** A gas cloud from a release, as the simulation hands it over each tick */
export interface GasCloud {
  pos: Vec3
  rateKgS: number
  /** seconds since the release started (clouds grow to steady state) */
  age: number
}
export interface FireSource {
  pos: Vec3
  sizeMW: number
}
export interface Wind {
  from: number
  speed: number
}

export interface ZoneCoverage {
  zone: string
  /** fraction of the zone's grid cells seen by ≥1 / ≥2 flame detectors */
  flame1: number
  flame2: number
  /** fraction of cells where a reference release would be picked up by ≥1 / ≥2 gas detectors */
  gas1: number
  gas2: number
  cells: number
}

// ============================================================================ constants

/** FD effective range for a 1 MW fire, m (cone drawn by FireGasOverlay) */
export const FD_RANGE = 16
/** FD half field of view, rad (90° cone) */
export const FD_HALF_FOV = Math.PI / 4
/** FD optical axis tilt below horizontal, rad */
export const FD_TILT = (20 * Math.PI) / 180
/** fire size an FD sees at FD_RANGE, MW */
export const FD_REF_MW = 1
/** mapping: reference fire, MW */
export const REF_FIRE_MW = 1
/** mapping: the reference fire sits this high above the deck (same test as live detection: flame base + 0.3 m, or 0.6 × flame height) */
export const REF_FIRE_BASE = 0.5
/** mapping: reference release, kg/s */
export const REF_RELEASE_KGS = 1
/** mapping: monitored elevation above the zone floor, m */
export const MONITOR_HEIGHT = 1.5
/** mapping grid, m */
export const CELL = 1
/** alarm setpoints: point gas %LEL, open path LEL·m */
export const GAS_LOW = 20
export const GAS_HIGH = 60
export const OGD_LOW = 1
export const OGD_HIGH = 3
/** instrument full scale */
export const GD_MAX = 100
export const OGD_MAX = 5
/** heat / smoke detector outdoor reach for a 1 MW fire (horizontal), m; ∝ Q^0.4 */
export const HS_RANGE = 5
/** wind used when the simulation has none (North Sea prevailing south-westerly; same as the sim default) */
export const DEFAULT_WIND: Wind = { from: 240, speed: 7 }

const C0 = 4
const LN_C0 = Math.log(C0)
const R_REF = 7
const TAU = 8
/** s at which the cloud reaches a given fraction of LFL */
const sAt = (frac: number) => Math.sqrt(1 + Math.log(1 / frac) / LN_C0)
/** normalised radius of the 60 % / 20 % LEL envelopes */
export const S_HIGH = sAt(GAS_HIGH / 100)
export const S_LOW = sAt(GAS_LOW / 100)
/**
 * Nominal point-gas detector radius drawn by the overlay: crosswind reach of the reference release
 * to the high alarm at DEFAULT_WIND, release and detector at the same height (≈ 4.5 m).
 */
export const GD_RADIUS = (() => {
  const u = DEFAULT_WIND.speed
  const e = Math.min(u / 6, 1)
  return ((R_REF / (1 + 0.05 * u)) * (1 - 0.25 * e)) * S_HIGH
})()

/** performance targets by zone kind (see header) */
export const TARGETS: Record<FireZone['kind'], FireZone['targets']> = {
  process: { flame1: 0.9, flame2: 0.85, gas1: 0.9, gas2: 0.85 },
  wellbay: { flame1: 0.9, flame2: 0.85, gas1: 0.9, gas2: 0.85 },
  turbine: { flame1: 0.9, flame2: 0.8, gas1: 0.85, gas2: 0.75 },
  drilling: { flame1: 0.85, flame2: 0.75, gas1: 0.85, gas2: 0.75 },
  utility: { flame1: 0.6, flame2: 0.4, gas1: 0.5, gas2: 0 },
  lq: { flame1: 0.6, flame2: 0.4, gas1: 0, gas2: 0 },
  module: { flame1: 0, flame2: 0, gas1: 0, gas2: 0 },
  bridge: { flame1: 0, flame2: 0, gas1: 0, gas2: 0 },
}

// ============================================================================ helpers

const inRect = (r: PlanRect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1
const isOffshore = (plant: Plant) => (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha'

const DRILL_FLOOR: PlanRect = { x0: RIG_SLOT[0] - 6.5, x1: RIG_SLOT[0] + 6.5, z0: RIG_SLOT[1] - 6.5, z1: RIG_SLOT[1] + 9.5 }
const LIFEBOAT_DECK: PlanRect = { x0: 21, x1: 23.7, z0: 60, z1: 80 }
/** Alpha field deck plates, top down */
const FLOORS: { y: number; rects: PlanRect[] }[] = [
  { y: WEATHER_FLOOR + 8, rects: [DRILL_FLOOR] },
  { y: WEATHER_FLOOR, rects: [ALPHA_DECK] },
  { y: 0, rects: [ALPHA_DECK, WHP.deck, LQ.deck, LIFEBOAT_DECK, BRIDGE_N.walk, BRIDGE_S.walk] },
  { y: CELLAR_FLOOR, rects: [ALPHA_DECK, WHP.deck, LQ.deck] },
]

/** the deck plate a point stands on (deck-local y). Onshore plants have one grade level, 0. */
export function floorAt(p: Vec3, offshore = true): number {
  if (!offshore) return 0
  for (const f of FLOORS) if (p[1] >= f.y - 0.5 && f.rects.some((r) => inRect(r, p[0], p[2]))) return f.y
  return p[1] >= -0.5 ? 0 : CELLAR_FLOOR
}

export function platformAt(p: Vec3): PlatformId {
  const [x, , z] = p
  if (inRect(WHP.deck, x, z)) return 'WHP-N'
  if (inRect(LQ.deck, x, z) || inRect(LIFEBOAT_DECK, x, z)) return 'LQ'
  if (inRect(ALPHA_DECK, x, z)) return 'Alpha'
  // bridges: the half nearer each platform belongs to it
  if (z < 0) return z < -40 ? 'WHP-N' : 'Alpha'
  return z > 40 ? 'LQ' : 'Alpha'
}

/** axis-aligned box, deck-local */
interface Box {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
  tag?: string
}
const inBox = (b: Box, x: number, y: number, z: number, tol = 0) =>
  x >= b.x0 - tol && x <= b.x1 + tol && y >= b.y0 - tol && y <= b.y1 + tol && z >= b.z0 - tol && z <= b.z1 + tol

/** does the segment a→b pass through box (slab test), ignoring the first / last 2 % */
function segHits(b: Box, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  let t0 = 0.02
  let t1 = 0.98
  const a = [ax, ay, az]
  const d = [bx - ax, by - ay, bz - az]
  const mn = [b.x0, b.y0, b.z0]
  const mx = [b.x1, b.y1, b.z1]
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (a[k] < mn[k] || a[k] > mx[k]) return false
    } else {
      let ta = (mn[k] - a[k]) / d[k]
      let tb = (mx[k] - a[k]) / d[k]
      if (ta > tb) [ta, tb] = [tb, ta]
      if (ta > t0) t0 = ta
      if (tb < t1) t1 = tb
      if (t0 > t1) return false
    }
  }
  return true
}

/** Environment-drawn solids (scene/env, model/site): weather-deck blocks, LQ quarters. */
const ENV_BOXES: Box[] = [
  { x0: -29, x1: -15, z0: -12, z1: 6, y0: 10, y1: 20, tag: 'weather-deck quarters' },
  { x0: -13, x1: -3, z0: 8, z1: 17, y0: 10, y1: 14, tag: 'switchgear building' },
  { x0: -12.5, x1: -4.5, z0: -19.5, z1: -6.5, y0: 10, y1: 15, tag: 'mud module' },
  { x0: -12.2, x1: -5.1, z0: -5.1, z1: -1.7, y0: 10, y1: 18, tag: 'bulk silos' },
  { x0: 2.5, x1: 21, z0: 15, z1: 18.8, y0: 10, y1: 12.6, tag: 'laydown containers' },
  { x0: 22.4, x1: 25.6, z0: -18.6, z1: -15.4, y0: 10, y1: 14, tag: 'crane pedestal' },
  { x0: LQ.quarters.x0, x1: LQ.quarters.x1, z0: LQ.quarters.z0, z1: LQ.quarters.z1, y0: 0, y1: LQ.quarters.storeys * LQ.quarters.storey, tag: 'LQ quarters' },
]

interface Geo {
  offshore: boolean
  /** line-of-sight blockers (equipment + environment) */
  occ: Box[]
  /** module interiors */
  modules: Box[]
  /** cells inside these at the monitored height are not mapped */
  solid: Box[]
}
const geoCache = new WeakMap<Plant, Geo>()
function geo(plant: Plant): Geo {
  let g = geoCache.get(plant)
  if (g) return g
  const offshore = isOffshore(plant)
  const fps = footprints(plant.equipment, 0)
  const occ: Box[] = []
  const modules: Box[] = []
  plant.equipment.forEach((e, i) => {
    const f = fps[i]
    const py = e.position[1]
    let y: [number, number] | null = null
    switch (e.kind) {
      case 'horizontalVessel':
        y = [py - e.id / 2 - e.wall, py + e.id / 2 + e.wall]
        break
      case 'shellTube':
        y = [py - e.shellOd / 2, py + e.shellOd / 2]
        break
      case 'verticalVessel':
        y = [py + e.elevation, py + e.elevation + e.tt + e.id / 2]
        break
      case 'pumpPackage':
        y = [py, py + 1.3]
        break
      case 'compressorPackage':
        y = [py, py + 3.2]
        break
      case 'chemSkid':
        y = [py, py + 2.2]
        break
      case 'module':
        y = [py, py + e.size[1]]
        break
      case 'gasTurbineGenerator':
        y = [py, py + e.enclosureHeight]
        break
      case 'transformer':
        y = [py, py + e.size[1]]
        break
      case 'caissonPump':
        y = [py, py + (e.driver === 'diesel' ? 1.8 : 2.6)]
        break
      case 'proxy':
        // the derrick is an open lattice (and the drill-floor detectors sit inside its proxy box)
        if (e.role === 'bop') y = [py, py + e.size[1]]
        break
      default:
        // manifolds, trees, pig traps: open pipework, not a line-of-sight blocker
        break
    }
    if (!y) return
    const b: Box = { x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: y[0], y1: y[1], tag: e.tag }
    occ.push(b)
    if (e.kind === 'module') modules.push(b)
  })
  if (offshore) occ.push(...ENV_BOXES)
  g = { offshore, occ, modules, solid: occ }
  geoCache.set(plant, g)
  return g
}

// ============================================================================ zones

const zoneCache = new WeakMap<Plant, FireZone[]>()

/** Fire zones: open-area zones per deck, plus one zone per enclosed module (smoke / heat inside). */
export function fireZones(plant: Plant): FireZone[] {
  let zs = zoneCache.get(plant)
  if (zs) return zs
  zs = []
  const Z = (id: string, name: string, platform: PlatformId, y0: number, y1: number, rects: PlanRect[], kind: FireZone['kind'], note?: string) =>
    zs!.push({ id, name, platform, y0, y1, rects, kind, targets: TARGETS[kind], note })
  if (isOffshore(plant)) {
    const W = WEATHER_FLOOR
    const C = CELLAR_FLOOR
    // ---- Alpha production deck (EL +28): split at the pipe-rack centreline z = 0, and east / west
    Z('A-P-SEP', 'Alpha · Separation', 'Alpha', 0, W, [{ x0: -30, x1: 0, z0: -20, z1: 0 }], 'process', 'Production / test manifold, HP & test separators, cooling medium')
    Z('A-P-EXP', 'Alpha · LP separation & oil export', 'Alpha', 0, W, [{ x0: 0, x1: 30, z0: -20, z1: 0 }], 'process', 'LP separator, crude cooler, export pumps, pig launcher, chemical injection')
    Z('A-P-COMP', 'Alpha · Gas compression & fuel gas', 'Alpha', 0, W, [{ x0: -11, x1: 15, z0: 0, z1: 20 }], 'process', 'Suction scrubber, export compressor, aftercooler, flare KO drum, fuel gas')
    Z('A-P-PW', 'Alpha · Produced water & TEG', 'Alpha', 0, W, [{ x0: -30, x1: -11, z0: 0, z1: 20 }], 'process', 'Hydrocyclones, degasser, PW pumps, closed drains, TEG contactor & regeneration, instrument air')
    Z('A-P-UTIL', 'Alpha · Utilities (LER, firewater)', 'Alpha', 0, W, [{ x0: 15, x1: 30, z0: 0, z1: 20 }], 'utility', 'Local equipment room, firewater pump houses, foam skid')
    // ---- Alpha cellar deck (EL +20)
    Z('A-C-WELL', 'Alpha · Cellar deck well bay', 'Alpha', C, 0, [{ x0: -10, x1: 10, z0: -20, z1: -4 }], 'wellbay', 'Five wellheads & trees, BOP stack under the rig')
    Z('A-C-UTIL', 'Alpha · Cellar deck utilities', 'Alpha', C, 0, [{ x0: -30, x1: -10, z0: -20, z1: -4 }, { x0: 10, x1: 30, z0: -20, z1: -4 }, { x0: -30, x1: 30, z0: -4, z1: 20 }], 'utility', 'Seawater lift & diesel firewater pumps, wellhead HPU, hypochlorite')
    // ---- Alpha weather deck (EL +38) and drill floor (EL +46)
    Z('A-W-PWR', 'Alpha · Weather deck power generation', 'Alpha', W, W + 8, [{ x0: -3, x1: 30, z0: -4.5, z1: 20 }], 'turbine', 'Gas turbine generators, main transformers, nitrogen package')
    Z('A-W-DRILL', 'Alpha · Drilling support (weather deck)', 'Alpha', W, W + 8, [{ x0: -13, x1: 23, z0: -20, z1: -4.5 }], 'drilling', 'Rig substructure, mud module, pipe deck')
    Z('A-DF', 'Alpha · Drill floor', 'Alpha', W + 8, W + 20, [DRILL_FLOOR], 'drilling', 'Drill floor, rotary table, doghouse')
    // ---- WHP-N (normally unattended wellhead platform)
    Z('N-WELL', 'WHP-N · Well bay', 'WHP-N', 0, 12, [{ x0: -2, x1: 10, z0: -80, z1: -66 }], 'wellbay', 'Six wellheads & trees')
    Z('N-MAN', 'WHP-N · Manifolds & metering', 'WHP-N', 0, 12, [{ x0: 10, x1: 22, z0: -88, z1: -60 }], 'process', 'Production & test manifolds, desander, MPFM, vent KO drum')
    Z('N-UTIL', 'WHP-N · Utilities', 'WHP-N', 0, 12, [{ x0: -2, x1: 10, z0: -88, z1: -80 }, { x0: -2, x1: 10, z0: -66, z1: -60 }, { x0: 22, x1: 26, z0: -88, z1: -60 }], 'utility', 'Chemical injection, WHCP, refuge surroundings, laydown')
    // ---- bridges
    Z('B-N', 'North bridge (Alpha ↔ WHP-N)', 'Alpha', 0, 4, [{ ...BRIDGE_N.walk, x0: BRIDGE_N.walk.x0 - 2.5 }], 'bridge', 'Walkway + pipe lane: export, water injection, IA, firewater, vent (welded)')
    Z('B-S', 'South bridge (Alpha ↔ LQ)', 'LQ', 0, 4, [{ ...BRIDGE_S.walk, x1: BRIDGE_S.walk.x1 + 1.5 }], 'bridge', 'Walkway + pipe lane: diesel, potable water, firewater')
    // ---- LQ main deck
    Z('LQ-MAIN', 'LQ · Main deck utilities', 'LQ', 0, 20, [{ x0: -9, x1: 21, z0: 60, z1: 70 }, { x0: -9, x1: 3, z0: 70, z1: 86 }], 'lq', 'Diesel day tank, potable water, emergency generator & CCR surroundings')
  } else {
    const x = plant.deck.extent
    Z('P-AREA', `${plant.deck.name} · process area`, 'Plant', 0, 12, [{ x0: x.minX, x1: x.maxX, z0: x.minZ, z1: x.maxZ }], 'process')
  }
  // enclosed modules: one zone each (smoke / heat detection inside; not part of the open-area grid)
  const g = geo(plant)
  for (const m of g.modules) {
    const e = plant.equipment.find((q) => q.tag === m.tag)!
    zs.push({
      id: `M-${e.tag}`,
      name: `${e.name} (${e.tag})`,
      platform: isOffshore(plant) ? platformAt(e.position) : 'Plant',
      y0: m.y0,
      y1: m.y1 + 0.6,
      rects: [{ x0: m.x0, x1: m.x1, z0: m.z0, z1: m.z1 }],
      kind: 'module',
      targets: TARGETS.module,
      module: e.tag,
    })
  }
  zoneCache.set(plant, zs)
  return zs
}

export function zoneById(plant: Plant, id: string): FireZone | null {
  return fireZones(plant).find((z) => z.id === id) ?? null
}

function zoneAtTol(plant: Plant, p: Vec3, modTol: number): FireZone | null {
  const zs = fireZones(plant)
  const inZ = (z: FireZone, tol: number) => p[1] >= z.y0 - 0.5 && p[1] < z.y1 && z.rects.some((r) => p[0] >= r.x0 - tol && p[0] <= r.x1 + tol && p[2] >= r.z0 - tol && p[2] <= r.z1 + tol)
  return zs.find((z) => z.kind === 'module' && inZ(z, modTol)) ?? zs.find((z) => z.kind !== 'module' && inZ(z, 0)) ?? null
}

/** the zone a point is in (modules take precedence over the open area around them) */
export function zoneAt(plant: Plant, p: Vec3): FireZone | null {
  return zoneAtTol(plant, p, 0)
}

/** zone centre (deck-local, at the monitored height) and plan size */
export function zoneCentre(z: FireZone): { centre: Vec3; size: [number, number] } {
  const x0 = Math.min(...z.rects.map((r) => r.x0))
  const x1 = Math.max(...z.rects.map((r) => r.x1))
  const z0 = Math.min(...z.rects.map((r) => r.z0))
  const z1 = Math.max(...z.rects.map((r) => r.z1))
  return { centre: [(x0 + x1) / 2, z.y0 + MONITOR_HEIGHT, (z0 + z1) / 2], size: [x1 - x0, z1 - z0] }
}

/** position of an equipment / valve / line / instrument tag (deck-local), if known */
export function tagPosition(plant: Plant, tag: string): Vec3 | null {
  const e = plant.equipment.find((x) => x.tag === tag)
  if (e) return e.position
  const v = plant.valves.find((x) => x.tag === tag)
  const lineTag = v ? v.line : tag
  const l = plant.lines.find((x) => x.tag === lineTag)
  if (l) {
    const s = v && v.seg >= 0 ? v.seg : 0
    const a = l.route[Math.min(s, l.route.length - 1)]
    const b = l.route[Math.min(s + 1, l.route.length - 1)]
    const t = v && v.seg >= 0 ? v.t : 0.5
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  }
  const i = plant.instruments.find((x) => x.tag === tag)
  if (i) return 'equipment' in i.on ? (i.on.at ?? plant.equipment.find((x) => x.tag === (i.on as { equipment: string }).equipment)?.position ?? null) : tagPosition(plant, i.on.line)
  return null
}

export function zoneOfTag(plant: Plant, tag: string): FireZone | null {
  const d = detectorMap(plant).get(tag) ?? detectorMap(plant).get(tag.replace(/R$/, 'T'))
  if (d && (d.tag === tag || d.rxTag === tag)) return d.zone ? zoneById(plant, d.zone) : null
  const p = tagPosition(plant, tag)
  return p ? zoneAt(plant, p) : null
}
export function platformOfTag(plant: Plant, tag: string): PlatformId {
  if (!isOffshore(plant)) return 'Plant'
  const z = zoneOfTag(plant, tag)
  // bridges: each half belongs to the platform it lands on
  if (z && z.kind !== 'bridge') return z.platform
  const p = tagPosition(plant, tag)
  return p ? platformAt(p) : 'Alpha'
}

// ============================================================================ detectors

const FG_TYPES = new Set<string>(['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC'])
/** minimal shape of scene/piping/build.ts InstrumentPlacement (pos is deck-local) */
export interface PlacementLike {
  inst: Instrument
  pos: { x: number; y: number; z: number }
}

const detCache = new WeakMap<Plant, Detector[]>()
const detMapCache = new WeakMap<Plant, Map<string, Detector>>()
/** per-detector geometry context (occluders, site) — kept off the public object */
const ctxOf = new WeakMap<Detector, Geo>()

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * F&G detectors of the plant, cached per plant object. Positions are the piping-build placements
 * (pass `built` from buildPiping to use them directly; without it the same placement is derived:
 * equipment-mounted `at` instruments sit exactly at `on.at`, which is what build.ts does).
 * Open-path receivers (…R) are folded into their transmitter (…T) entry as `rx` / `rxTag`.
 */
export function detectors(plant: Plant, built?: { instruments: PlacementLike[] }): Detector[] {
  let ds = detCache.get(plant)
  if (ds) return ds
  const g = geo(plant)
  const offshore = g.offshore
  const placed = new Map<string, Vec3>()
  for (const p of built?.instruments ?? []) if (FG_TYPES.has(p.inst.type)) placed.set(p.inst.tag, [p.pos.x, p.pos.y, p.pos.z])
  const posOf = (i: Instrument): Vec3 | null => placed.get(i.tag) ?? ('equipment' in i.on && i.on.at ? i.on.at : tagPosition(plant, i.tag))
  const fg = plant.instruments.filter((i) => FG_TYPES.has(i.type))
  ds = []
  for (const i of fg) {
    const type = i.type as DetectorType
    if (type === 'OGD' && /R$/.test(i.tag) && fg.some((x) => x.tag === i.tag.slice(0, -1) + 'T')) continue
    const pos = posOf(i)
    if (!pos) continue
    const d: Detector = { tag: i.tag, type, pos, zone: null, platform: offshore ? platformAt(pos) : 'Plant', floor: floorAt(pos, offshore) }
    let anchor: Vec3 = pos
    if (type === 'FD') {
      const h = norm([i.dir?.[0] ?? 0, 0, i.dir?.[2] ?? 1])
      d.aim = [h[0] * Math.cos(FD_TILT), -Math.sin(FD_TILT), h[2] * Math.cos(FD_TILT)]
    } else if (type === 'OGD') {
      const rxI = fg.find((x) => x.tag === i.tag.slice(0, -1) + 'R')
      const rx = rxI ? posOf(rxI) : null
      if (rx) {
        d.rx = rx
        d.rxTag = rxI!.tag
        d.aim = norm([rx[0] - pos[0], rx[1] - pos[1], rx[2] - pos[2]])
        anchor = [(pos[0] + rx[0]) / 2, (pos[1] + rx[1]) / 2, (pos[2] + rx[2]) / 2]
      } else d.aim = norm(i.dir ?? [1, 0, 0])
    }
    if (type === 'HD' || type === 'SD') {
      const m = g.modules.find((b) => inBox(b, pos[0], pos[1], pos[2], 0.35))
      if (m) d.module = m.tag
    }
    const z = d.module ? fireZones(plant).find((q) => q.module === d.module) ?? null : zoneAtTol(plant, anchor, 0)
    d.zone = z?.id ?? null
    if (z) d.platform = z.platform
    ctxOf.set(d, g)
    ds.push(d)
  }
  detCache.set(plant, ds)
  detMapCache.set(plant, new Map(ds.map((x) => [x.tag, x])))
  return ds
}

function detectorMap(plant: Plant) {
  if (!detMapCache.has(plant)) detectors(plant)
  return detMapCache.get(plant)!
}

/** the voting group of a zone: its own detectors (optionally of one type) */
export function zoneDetectors(plant: Plant, zone: string, type?: DetectorType): Detector[] {
  return detectors(plant).filter((d) => d.zone === zone && (!type || d.type === type))
}

/** is this detector out of service given a set of excluded tags (an OGD drops if T or R is excluded) */
export const isExcluded = (d: Detector, exclude?: Set<string>) => !!exclude && (exclude.has(d.tag) || (!!d.rxTag && exclude.has(d.rxTag)))

// ============================================================================ gas

export interface CloudShape {
  /** ellipsoid centre, deck-local */
  centre: Vec3
  /** along-wind, crosswind, vertical semi-axes of the LFL envelope, m */
  a: number
  b: number
  c: number
  /** downwind unit vector (plan) */
  dir: [number, number]
  /** current LFL radius (before wind stretch) and steady-state LFL radius, m */
  R: number
  Rss: number
  /** deck level the cloud lies on */
  floor: number
}

/** unit vector the wind blows TOWARDS (plan x, z): `from` 0 = north (−Z), clockwise */
export function downwind(w: Wind): [number, number] {
  const th = (w.from * Math.PI) / 180
  return [-Math.sin(th), Math.cos(th)]
}

/** geometry of a release's cloud (see header for the model) */
export function cloudShape(c: GasCloud, wind: Wind, offshore = true): CloudShape {
  const u = Math.max(0, wind.speed)
  const e = Math.min(u / 6, 1)
  const Rss = (R_REF * Math.sqrt(Math.max(0, c.rateKgS) / REF_RELEASE_KGS)) / (1 + 0.05 * u)
  const grow = c.age === Infinity ? 1 : 1 - Math.exp(-Math.max(0, c.age) / TAU)
  const R = Rss * grow
  const dir = downwind(wind)
  const floor = floorAt(c.pos, offshore)
  const hc = floor + Math.min(3, Math.max(0.3, 0.5 * (c.pos[1] - floor)))
  const off = 0.9 * e * R
  return { centre: [c.pos[0] + dir[0] * off, hc, c.pos[2] + dir[1] * off], a: R * (1 + 0.6 * e), b: R * (1 - 0.25 * e), c: (0.35 * Rss + 1.2) * grow, dir, R, Rss, floor }
}

/** concentration as a fraction of the LFL at a point (one cloud) */
function concAt(s: CloudShape, x: number, y: number, z: number, floorOfPoint: number) {
  if (s.R < 0.05 || floorOfPoint !== s.floor) return 0
  const dx = x - s.centre[0]
  const dz = z - s.centre[2]
  const al = dx * s.dir[0] + dz * s.dir[1]
  const cr = -dx * s.dir[1] + dz * s.dir[0]
  const dy = y - s.centre[1]
  const s2 = (al / s.a) ** 2 + (cr / s.b) ** 2 + (dy / s.c) ** 2
  return s2 >= 4 ? 0 : Math.exp(LN_C0 * (1 - s2))
}

/** concentration at a point summed over clouds, as a fraction of the LFL */
export function gasConcentration(p: Vec3, clouds: GasCloud[], wind: Wind, offshore = true): number {
  const f = floorAt(p, offshore)
  let c = 0
  for (const cl of clouds) c += concAt(cloudShape(cl, wind, offshore), p[0], p[1], p[2], f)
  return c
}

function readShapes(d: Detector, shapes: CloudShape[], offshore: boolean): number {
  if (d.type === 'GD') {
    const f = d.floor ?? floorAt(d.pos, offshore)
    let c = 0
    for (const s of shapes) c += concAt(s, d.pos[0], d.pos[1], d.pos[2], f)
    return Math.min(GD_MAX, c * 100)
  }
  if (d.type === 'OGD' && d.rx) {
    const [ax, ay, az] = d.pos
    const L = Math.hypot(d.rx[0] - ax, d.rx[1] - ay, d.rx[2] - az)
    const n = Math.max(2, Math.ceil(L / 0.25))
    const ds = L / n
    const f = floorAt([(ax + d.rx[0]) / 2, (ay + d.rx[1]) / 2, (az + d.rx[2]) / 2], offshore)
    let sum = 0
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      const x = ax + (d.rx[0] - ax) * t
      const y = ay + (d.rx[1] - ay) * t
      const z = az + (d.rx[2] - az) * t
      for (const s of shapes) sum += concAt(s, x, y, z, f) * ds
    }
    return Math.min(OGD_MAX, sum)
  }
  return 0
}

/** %LEL for GD, LEL·m for OGD (0 for other types) */
export function gasReading(d: Detector, clouds: GasCloud[], wind: Wind): number {
  if (d.type !== 'GD' && d.type !== 'OGD') return 0
  if (!clouds.length) return 0
  const offshore = ctxOf.get(d)?.offshore ?? true
  return readShapes(d, clouds.map((c) => cloudShape(c, wind, offshore)), offshore)
}

// ============================================================================ fire

/** visible flame height (Heskestad, pool of 1.5 MW/m²), m */
export function flameHeight(sizeMW: number) {
  const q = Math.max(0.01, sizeMW)
  const D = Math.sqrt((4 * (q / 1.5)) / Math.PI)
  return Math.max(0.6, 0.235 * Math.pow(q * 1000, 0.4) - 1.02 * D)
}

/** can FD `d` see the point p (a fire of `mw`)? cone + range + same deck + line of sight */
function fdSeesPoint(d: Detector, g: Geo | undefined, px: number, py: number, pz: number, mw: number, floorP?: number) {
  if (!d.aim) return false
  const R = FD_RANGE * Math.sqrt(Math.max(0, mw) / FD_REF_MW)
  const dx = px - d.pos[0]
  const dy = py - d.pos[1]
  const dz = pz - d.pos[2]
  const dist = Math.hypot(dx, dy, dz)
  if (dist > R) return false
  if (dist < 0.3) return true
  if ((dx * d.aim[0] + dy * d.aim[1] + dz * d.aim[2]) / dist < Math.cos(FD_HALF_FOV)) return false
  const offshore = g?.offshore ?? true
  const fp = floorP ?? floorAt([px, py, pz], offshore)
  if ((d.floor ?? floorAt(d.pos, offshore)) !== fp) return false
  if (!g) return true
  const [ax, ay, az] = d.pos
  const rx0 = Math.min(ax, px)
  const rx1 = Math.max(ax, px)
  const ry0 = Math.min(ay, py)
  const ry1 = Math.max(ay, py)
  const rz0 = Math.min(az, pz)
  const rz1 = Math.max(az, pz)
  for (const b of g.occ) {
    if (b.x1 < rx0 || b.x0 > rx1 || b.y1 < ry0 || b.y0 > ry1 || b.z1 < rz0 || b.z0 > rz1) continue
    if (inBox(b, ax, ay, az, 0.4) || inBox(b, px, py, pz, 0.1)) continue
    if (segHits(b, ax, ay, az, px, py, pz)) return false
  }
  return true
}

/** a fire is seen if the detector sees the base of the flame (pos + 0.3 m) or its upper part (pos + 0.6·H) */
function fdSeesFire(d: Detector, g: Geo | undefined, x: number, y: number, z: number, mw: number, floor?: number) {
  const fl = floor ?? floorAt([x, y, z], g?.offshore ?? true)
  return fdSeesPoint(d, g, x, y + 0.3, z, mw, fl) || fdSeesPoint(d, g, x, y + 0.6 * flameHeight(mw), z, mw, fl)
}

export function flameSees(d: Detector, fire: FireSource): boolean {
  if (d.type !== 'FD') return false
  return fdSeesFire(d, ctxOf.get(d), fire.pos[0], fire.pos[1], fire.pos[2], fire.sizeMW)
}

/** HD / SD: does this fire set it off */
export function heatSmokeSees(d: Detector, fire: FireSource): boolean {
  if (d.type !== 'HD' && d.type !== 'SD') return false
  const g = ctxOf.get(d)
  const [x, y, z] = fire.pos
  const inMod = g?.modules.find((b) => inBox(b, x, y, z, 0.2))
  // inside a module: smoke and heat fill the room; walls shield everything else
  if (d.module) return !!inMod && inMod.tag === d.module
  if (inMod) return false
  const offshore = g?.offshore ?? true
  if ((d.floor ?? floorAt(d.pos, offshore)) !== floorAt(fire.pos, offshore)) return false
  // outdoor ceiling detector: the plume reaches it if the fire is below and within reach
  if (y > d.pos[1] + 1 || d.pos[1] - y > 12) return false
  return Math.hypot(x - d.pos[0], z - d.pos[2]) <= HS_RANGE * Math.pow(Math.max(0, fire.sizeMW) / 1, 0.4)
}

// ============================================================================ coverage

export type CoverageMode = 'flame' | 'gas'

export interface CoverageGrid {
  zone: string
  /** grid origin (cell [0,0] lower corner), deck-local x / z */
  x0: number
  z0: number
  nx: number
  nz: number
  cell: number
  /** monitored elevation, deck-local */
  y: number
  /** per cell (index ix + iz·nx): detectors that see / pick up the reference event; 255 = not mapped */
  counts: Uint8Array
  /** detectors that took part (zone members of the mode's types, not excluded) */
  used: string[]
}

interface ZoneGrid {
  x0: number
  z0: number
  nx: number
  nz: number
  y: number
  /** mapped cell indices */
  cells: Int32Array
  /** flame: per zone FD, visibility bits per mapped cell */
  flame: { d: Detector; bits: Uint8Array }[]
  /** gas: per wind bucket, per zone GD / OGD */
  gas: Map<string, { d: Detector; bits: Uint8Array }[]>
}
const gridCache = new WeakMap<Plant, Map<string, ZoneGrid>>()

function zoneGrid(plant: Plant, z: FireZone): ZoneGrid {
  let m = gridCache.get(plant)
  if (!m) gridCache.set(plant, (m = new Map()))
  let zg = m.get(z.id)
  if (zg) return zg
  const g = geo(plant)
  const x0 = Math.floor(Math.min(...z.rects.map((r) => r.x0)))
  const z0 = Math.floor(Math.min(...z.rects.map((r) => r.z0)))
  const nx = Math.ceil((Math.max(...z.rects.map((r) => r.x1)) - x0) / CELL)
  const nz = Math.ceil((Math.max(...z.rects.map((r) => r.z1)) - z0) / CELL)
  const y = z.y0 + MONITOR_HEIGHT
  const cells: number[] = []
  if (z.kind !== 'module')
    for (let iz = 0; iz < nz; iz++)
      for (let ix = 0; ix < nx; ix++) {
        const cx = x0 + (ix + 0.5) * CELL
        const cz = z0 + (iz + 0.5) * CELL
        if (!z.rects.some((r) => inRect(r, cx, cz))) continue
        if (g.solid.some((b) => inBox(b, cx, y, cz))) continue
        cells.push(ix + iz * nx)
      }
  const ci = Int32Array.from(cells)
  const flame = zoneDetectors(plant, z.id, 'FD').map((d) => {
    const bits = new Uint8Array(ci.length)
    for (let k = 0; k < ci.length; k++) {
      const ix = ci[k] % nx
      const iz = (ci[k] - ix) / nx
      bits[k] = fdSeesFire(d, g, x0 + (ix + 0.5) * CELL, z.y0 + REF_FIRE_BASE, z0 + (iz + 0.5) * CELL, REF_FIRE_MW, z.y0) ? 1 : 0
    }
    return { d, bits }
  })
  zg = { x0, z0, nx, nz, y, cells: ci, flame, gas: new Map() }
  m.set(z.id, zg)
  return zg
}

/** wind bucket used for gas coverage (15°, 1 m/s) */
const windKey = (w: Wind) => {
  const from = ((Math.round(w.from / 15) * 15) % 360 + 360) % 360
  const speed = Math.round(Math.max(0, w.speed))
  return { key: `${from}|${speed}`, w: { from, speed } }
}

function gasBits(plant: Plant, z: FireZone, zg: ZoneGrid, wind: Wind) {
  const { key, w } = windKey(wind)
  let gb = zg.gas.get(key)
  if (gb) return gb
  const offshore = geo(plant).offshore
  const ds = detectors(plant).filter((d) => d.zone === z.id && (d.type === 'GD' || d.type === 'OGD'))
  const lists = ds.map(() => new Uint8Array(zg.cells.length))
  for (let k = 0; k < zg.cells.length; k++) {
    const ix = zg.cells[k] % zg.nx
    const iz = (zg.cells[k] - ix) / zg.nx
    const sh = cloudShape({ pos: [zg.x0 + (ix + 0.5) * CELL, zg.y, zg.z0 + (iz + 0.5) * CELL], rateKgS: REF_RELEASE_KGS, age: Infinity }, w, offshore)
    for (let j = 0; j < ds.length; j++) {
      const d = ds[j]
      const v = readShapes(d, [sh], offshore)
      lists[j][k] = (d.type === 'GD' ? v >= GAS_HIGH : v >= OGD_HIGH) ? 1 : 0
    }
  }
  gb = ds.map((d, j) => ({ d, bits: lists[j] }))
  zg.gas.set(key, gb)
  return gb
}

/** per-cell detector counts for the heatmap (memoised geometry; exclusions just recount) */
export function coverageGrid(plant: Plant, zone: string, mode: CoverageMode, exclude?: Set<string>, wind: Wind = DEFAULT_WIND): CoverageGrid | null {
  const z = zoneById(plant, zone)
  if (!z) return null
  const zg = zoneGrid(plant, z)
  const sets = mode === 'flame' ? zg.flame : gasBits(plant, z, zg, wind)
  const counts = new Uint8Array(zg.nx * zg.nz).fill(255)
  for (let k = 0; k < zg.cells.length; k++) counts[zg.cells[k]] = 0
  const used: string[] = []
  for (const s of sets) {
    if (isExcluded(s.d, exclude)) continue
    used.push(s.d.tag)
    for (let k = 0; k < zg.cells.length; k++) if (s.bits[k]) counts[zg.cells[k]] = Math.min(254, counts[zg.cells[k]] + 1)
  }
  return { zone, x0: zg.x0, z0: zg.z0, nx: zg.nx, nz: zg.nz, cell: CELL, y: zg.y, counts, used }
}

function frac(zg: ZoneGrid, sets: { d: Detector; bits: Uint8Array }[], exclude?: Set<string>) {
  const n = zg.cells.length
  if (!n) return [0, 0]
  const c = new Uint8Array(n)
  for (const s of sets) if (!isExcluded(s.d, exclude)) for (let k = 0; k < n; k++) c[k] += s.bits[k]
  let one = 0
  let two = 0
  for (let k = 0; k < n; k++) {
    if (c[k] >= 1) one++
    if (c[k] >= 2) two++
  }
  return [one / n, two / n]
}

/**
 * Geographic (flame) and scenario (gas) coverage of a zone by its own detectors, leaving out
 * `exclude` (inhibited / faulted tags). Gas coverage uses `wind` (default DEFAULT_WIND).
 * First call per zone builds the visibility tables (~ms); later calls only recount.
 */
export function coverage(plant: Plant, zone: string, exclude?: Set<string>, wind: Wind = DEFAULT_WIND): ZoneCoverage {
  const z = zoneById(plant, zone)
  if (!z) return { zone, flame1: 0, flame2: 0, gas1: 0, gas2: 0, cells: 0 }
  const zg = zoneGrid(plant, z)
  const [flame1, flame2] = frac(zg, zg.flame, exclude)
  const [gas1, gas2] = frac(zg, gasBits(plant, z, zg, wind), exclude)
  return { zone, flame1, flame2, gas1, gas2, cells: zg.cells.length }
}
