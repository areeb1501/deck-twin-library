/**
 * PlantSpec — the topology-first description of a plant, and the target format for P&ID import.
 *
 * A P&ID gives you tags, equipment types, nozzle-to-nozzle connectivity, line sizes and inline
 * valves / instruments, but no 3D coordinates. A PlantSpec carries exactly that, plus optional
 * layout hints (plan position, rotation, run elevation). `compileSpec` (compile.ts) turns it into
 * the renderable Plant: it builds each item from the component library, lays out anything that
 * has no position, routes every line orthogonally and places valves / instruments on the routes.
 *
 * Units: metres, degrees (rotation). Coordinates are plant-local: +X east, +Z south, +Y up,
 * y = 0 is top of grade / deck.
 */
import type { DesignData, EquipmentKind, InstrumentType, PipeLine, Service, SystemId, Valve, ValveType, Vec3 } from '../model/types'
import { SERVICE } from '../model/catalog'
import type { NozzleTemplate, Params } from './types'

export interface PlantSpec {
  version: 1
  name: string
  /** free text, e.g. the P&ID drawing numbers this spec was taken from */
  source?: string
  equipment: EquipmentSpec[]
  lines: LineSpec[]
  valves: ValveSpec[]
  instruments: InstrumentSpec[]
}

export interface EquipmentSpec {
  tag: string
  /** component library id (= equipment kind) */
  type: EquipmentKind
  name?: string
  system?: SystemId
  /** overrides for the component's parameters (see library/components.ts) */
  params?: Params
  /** plan position [x, z] of the equipment origin. Omit to let the compiler lay it out. */
  at?: [number, number]
  /** degrees about vertical (0, 90, 180, 270 …) */
  rotation?: number
  /** replaces the component's default nozzles (equipment-local frame) */
  nozzles?: NozzleTemplate[]
  design?: DesignData
}

export type EndSpec =
  | { equipment: string; nozzle: string }
  /** leaves the modelled area (off-page connector). Without `at` the line runs to the nearest plot edge. */
  | { offPlant: string; at?: Vec3 }

export interface LineSpec {
  /** ISO line number, e.g. 8"-PG-101-D6A-N (see lineTag) */
  tag: string
  from: EndSpec
  to: EndSpec
  service: Service
  system?: SystemId
  /** defaults to the size of the "from" nozzle */
  nps?: number
  /** piping class; defaults from the nozzle flange rating (B1A / C3A / D6A / E9A) */
  spec?: string
  schedule?: PipeLine['schedule']
  insulation?: PipeLine['insulation']
  /** auto-route: elevation of the horizontal run above grade (m) */
  elevation?: number
  /** auto-route: run east-west first ('xz') or north-south first ('zx') */
  order?: 'xz' | 'zx'
  /** manual route in plant coordinates; replaces auto-routing */
  route?: Vec3[]
  design?: DesignData
}

export interface ValveSpec {
  tag: string
  type: Exclude<ValveType, 'psv'>
  line: string
  /** position along the line, 0 = from end, 1 = to end (default 0.5) */
  at?: number
  actuator?: Valve['actuator']
  normally?: Valve['normally']
  failAction?: Valve['failAction']
  design?: DesignData
}

export interface InstrumentSpec {
  tag: string
  type: InstrumentType
  on: { line: string; at?: number } | { equipment: string; nozzle: string }
  range?: string
  unit?: string
  nominal?: number
}

export const emptySpec = (name = 'New plant'): PlantSpec => ({ version: 1, name, equipment: [], lines: [], valves: [], instruments: [] })

/** ISO-style line number: SIZE-SERVICE-SEQ-CLASS-INSULATION */
export function lineTag(nps: number, service: Service, seq: string | number, spec: string, insulation?: string) {
  return `${nps}"-${SERVICE[service].code}-${seq}-${spec}-${insulation ?? 'N'}`
}

/** Default piping class for a flange rating (the first letter also drives flange rating in the renderer). */
export function classFor(rating: number) {
  return rating >= 900 ? 'E9A' : rating >= 600 ? 'D6A' : rating >= 300 ? 'C3A' : 'B1A'
}
