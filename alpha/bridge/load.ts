/**
 * plant.json to an engine Plant. The file is checked by the rules behind `deck-twin validate`, then resolved by the same
 * code that renders it, so Load refuses what `deck-twin validate` refuses, in the same words. Only the layout can add to that: ends too close for two flanges. The Plant that
 * comes out is a shell: one invisible proxy per item and data-only lines, which keep the tag tree, inspector, labels and
 * walker working. The geometry is drawn by <Plant> from the registry (LibraryLayer.tsx).
 */
import * as THREE from 'three'
import { resolve, type ComponentMap, type ComponentModule } from '../../registry/assembly/plant'
import type { LineEnd, PlantSpec } from '../../registry/assembly/spec'
import type { CategoryId, ComponentMeta } from '../../registry/meta'
import { checkPlant } from '../../cli/check.mjs'
import type { Equipment, LineEnd as EngineEnd, Nozzle, PipeLine, Plant, PlanRect, Proxy, Rating, Service, SystemId, Vec3, WalkLevel } from '../src/model/types'
import type { PlantLoad } from '../src/state/plantFormats'

const metas = import.meta.glob<{ default: ComponentMeta[] }>('../../registry/*/_meta*.ts', { eager: true })
const modules = import.meta.glob<ComponentModule>(['../../registry/*/*.tsx', '!../../registry/lib/**', '!../../registry/assembly/**', '!../../registry/*/_*'])

const META = new Map(
  Object.entries(metas).flatMap(([file, mod]) => {
    const category = file.split('/')[3] as CategoryId
    return mod.default.map((m) => [m.name, { ...m, category, path: `../../registry/${category}/${m.file}` }] as const)
  }),
)

const SYSTEM: Record<CategoryId, SystemId> = {
  piping: 'production',
  valves: 'production',
  vessels: 'production',
  thermal: 'production',
  rotating: 'production',
  wellhead: 'wells',
  drilling: 'wells',
  instruments: 'production',
  safety: 'safety',
  structure: 'utilities',
  electrical: 'utilities',
  interiors: 'accommodation',
  lifting: 'utilities',
  packages: 'utilities',
  onshore: 'production',
  environment: 'utilities',
}

const SERVICE: Record<string, Service> = {
  oil: 'oil',
  gas: 'gas',
  'fuel-gas': 'gas',
  multiphase: 'multiphase',
  water: 'water',
  seawater: 'water',
  potable: 'water',
  steam: 'water',
  firewater: 'firewater',
  air: 'instrumentAir',
  nitrogen: 'instrumentAir',
  chemical: 'chemical',
  diesel: 'chemical',
  flare: 'flare',
  drain: 'drain',
  cooling: 'cooling',
}

/** Items a person stands on or walks through rather than around. */
const OPEN: CategoryId[] = ['structure', 'piping', 'instruments', 'valves', 'environment']
/** Items that say where a floor is: fittings and instruments sit at any height. */
const STANDS: CategoryId[] = ['vessels', 'thermal', 'rotating', 'wellhead', 'drilling', 'safety', 'electrical', 'lifting', 'packages', 'onshore', 'interiors']

const loaded = new WeakMap<object, ComponentMap>()
/** Component modules of a plant that has been through loadLibraryPlant. */
export const libraryComponents = (spec: PlantSpec) => loaded.get(spec) as ComponentMap

const said = (i: { where: string; message: string }) => `${i.where}: ${i.message}`
/** What only the layout or the geometry can tell. The rest repeats `deck-twin validate`, which has already spoken, so Load and the CLI report one count. */
export const onlyDrawing = (i: { level: string; message: string }) => i.level === 'warning' && /^(No straight run|Items overlap|Stands at y)/.test(i.message)
const namesIn = (s: PlantSpec) => [...new Set([...(s.items ?? []).map((i) => i.component), ...(s.lines ?? []).flatMap((l) => (l.inline ?? []).map((v) => v.component))])]

export async function loadLibraryPlant(json: Record<string, unknown>): Promise<PlantLoad> {
  const spec = json as unknown as PlantSpec
  const components: ComponentMap = {}
  await Promise.all(
    namesIn(spec).map(async (n) => {
      const m = META.get(n)
      const load = m && modules[m.path]
      if (load) components[n] = await load()
    }),
  )
  // the CLI reads ports at each component's preview props; so does this
  const catalog = [...META.values()].map((m) => {
    const c = components[m.name]
    const defaults = c?.defaults ?? {}
    return { ...m, defaults, ports: c?.ports?.({ ...defaults, ...(m.preview ?? {}) }) ?? [] }
  })
  const issues = checkPlant(spec, catalog)
  const errors = issues.filter((i) => i.level === 'error').map(said)
  const warnings = issues.filter((i) => i.level === 'warning').map(said)
  if (errors.length) return { errors, warnings }

  const layout = resolve(spec, components)
  const blocked = layout.issues.filter((i) => i.level === 'error').map(said)
  const all = [...warnings, ...layout.issues.filter(onlyDrawing).map(said)]
  if (blocked.length) return { errors: blocked, warnings: all }

  const eq: Equipment[] = layout.items.map((it) => {
    const m = META.get(it.component)!
    const nozzles: Nozzle[] = [...it.ports.values()].map((p) => ({ id: p.id, name: p.label, pos: p.position as Vec3, dir: p.direction as Vec3, nps: p.nps, rating: (p.rating ?? 300) as Rating, base: p.position as Vec3 }))
    return shell(it.tag, m, it.position as Vec3, nozzles)
  })
  // tagged inline items are real valves on the line: they get a pick box of their own, sized to the body
  for (const v of layout.inline) {
    if (!v.tag) continue
    const name = spec.lines?.flatMap((l) => l.inline ?? []).find((i) => i.tag === v.tag)?.component
    const m = name && META.get(name)
    if (m) eq.push({ ...shell(v.tag, m, [v.position[0], v.position[1] - 0.3, v.position[2]] as Vec3, []), size: [0.7, 0.6, 0.7], solid: false })
  }

  const tags = new Set(eq.map((e) => e.tag))
  const end = (r: LineEnd): EngineEnd => {
    if (typeof r !== 'string') return { offDeck: r.label ?? 'Battery limit' }
    const i = r.lastIndexOf('.')
    return tags.has(r.slice(0, i)) ? { equipment: r.slice(0, i), nozzle: r.slice(i + 1) } : { offDeck: r }
  }
  const lines: PipeLine[] = layout.lines.map((l) => ({
    tag: l.line.tag,
    service: SERVICE[l.line.service ?? ''] ?? 'water',
    system: 'production',
    nps: l.nps,
    schedule: 'STD',
    spec: l.line.tag.split('-')[3] ?? '',
    insulation: l.line.insulated ? 'H' : undefined,
    route: l.path as Vec3[],
    from: end(l.line.from),
    to: end(l.line.to),
    design: {},
  }))

  const positions = layout.items.map((i) => i.position)
  const xs = positions.map((p) => p[0])
  const zs = positions.map((p) => p[2])
  const offshore = !!spec.sea || layout.items.some((i) => i.component === 'jacket')
  const plant: Plant = {
    name: spec.name || 'Imported plant',
    deck: {
      name: spec.source && spec.source.length <= 80 ? spec.source : 'Imported plant',
      elevation: 0,
      extent: { minX: Math.min(...xs, 0) - 6, maxX: Math.max(...xs, 0) + 6, minZ: Math.min(...zs, 0) - 6, maxZ: Math.max(...zs, 0) + 6 },
      site: offshore ? 'none' : 'onshore',
    },
    equipment: eq,
    lines,
    valves: [],
    instruments: [],
    custom: { renderer: 'library', source: spec },
  }
  loaded.set(spec, components)
  return { plant, errors: [], warnings: all }
}

function shell(tag: string, m: ComponentMeta & { category: CategoryId }, position: Vec3, nozzles: Nozzle[]): Proxy {
  return {
    kind: 'proxy',
    role: 'custom',
    tag,
    name: m.title,
    system: SYSTEM[m.category],
    position,
    rotationY: 0,
    nozzles,
    size: [1, 1, 1],
    solid: !OPEN.includes(m.category),
    design: { component: m.name, category: m.category, notes: 'Generic geometry sized from public standards, not vendor CAD.' },
  }
}

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const cat = (e: Equipment) => e.design.category as CategoryId | undefined

/** Real sizes from the mounted geometry: proxies, the plot extent and the walkable levels all follow them. */
export function applyBounds(p: Plant, boxes: Map<string, THREE.Box3>): Plant {
  const spec = p.custom!.source as PlantSpec
  const equipment = p.equipment.map((e) => {
    const b = boxes.get(e.tag)
    if (!b || b.isEmpty() || e.kind !== 'proxy') return e
    const c = b.getCenter(new THREE.Vector3())
    const s = b.getSize(new THREE.Vector3())
    return { ...e, position: [c.x, b.min.y, c.z] as Vec3, size: [s.x, s.y, s.z] as Vec3 }
  })
  const all = new THREE.Box3()
  for (const b of boxes.values()) if (!b.isEmpty()) all.union(b)
  const pad = 4
  const extent = all.isEmpty() ? p.deck.extent : { minX: Math.floor(all.min.x - pad), maxX: Math.ceil(all.max.x + pad), minZ: Math.floor(all.min.z - pad), maxZ: Math.ceil(all.max.z + pad) }

  const levels = new Map<number, PlanRect[]>()
  const addLevel = (y: number, r: PlanRect) => {
    const k = Math.round(y * 10) / 10
    levels.set(k, [...(levels.get(k) ?? []), r])
  }
  const floors = [...boxes.entries()]
    .map(([tag, b]) => ({ tag, b, e: equipment.find((x) => x.tag === tag) }))
    .filter(({ b, e }) => e && cat(e) === 'structure' && (b.max.x - b.min.x) * (b.max.z - b.min.z) >= 30)
  for (const it of spec.items) {
    const e = equipment.find((x) => x.tag === it.tag)
    const y = it.position?.[1] ?? 0
    if (!e || !STANDS.includes(cat(e) as CategoryId) || y < 0.5) continue
    for (const { b } of floors) {
      if (e.position[0] < b.min.x || e.position[0] > b.max.x || e.position[2] < b.min.z || e.position[2] > b.max.z) continue
      if (near(y, b.max.y, 1.2) || (y >= b.min.y && y <= b.max.y)) addLevel(y, { x0: b.min.x + 0.4, x1: b.max.x - 0.4, z0: b.min.z + 0.4, z1: b.max.z - 0.4 })
    }
  }
  const walk: WalkLevel[] = [...levels.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([y, areas]) => ({ id: `y${y}`, label: `Level +${y.toFixed(1)} m`, y, areas: dedupe(areas) }))
  if (p.deck.site === 'onshore') walk.unshift({ id: 'grade', label: 'Grade', y: 0, areas: [{ x0: extent.minX, x1: extent.maxX, z0: extent.minZ, z1: extent.maxZ }] })
  return { ...p, equipment, deck: { ...p.deck, extent, walk: walk.length ? walk : undefined } }
}

const dedupe = (rs: PlanRect[]) => [...new Map(rs.map((r) => [`${r.x0},${r.x1},${r.z0},${r.z1}`, r])).values()]
