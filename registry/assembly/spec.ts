// plant.json: a plant as data. Items are registry components placed in plant coordinates; lines join item ports.
import type { Service } from '../lib/standards'
import type { Schedule } from '../lib/standards'

export type Vec3 = [number, number, number]

export interface PlantSpec {
  name: string
  description?: string
  /** drawing numbers or documents this plant was taken from */
  source?: string
  items: PlantItem[]
  lines?: PlantLine[]
  /** optional framing for viewers: look at `target` from `direction`, fitting a sphere of `radius` */
  camera?: { target: Vec3; radius: number; direction?: Vec3 }
  /** optional sea for offshore plants: mean sea level as plant y (a jacket at y = 0 has it at -airGap), and water depth to draw the seabed */
  sea?: { level: number; depth?: number }
}

export interface PlantItem {
  /** unique tag, e.g. "V-100", "P-101A", "DECK-1" */
  tag: string
  /** registry component name, e.g. "horizontal-separator" */
  component: string
  props?: Record<string, unknown>
  /** [x, y, z] metres. x east, y up, z south. y is the level the item stands on. */
  position?: Vec3
  /** degrees about +Y (counter-clockwise seen from above) */
  rotation?: number
}

export interface PlantLine {
  /** line number, e.g. 8"-PG-1001-D6A-N */
  tag: string
  /** "TAG.port", e.g. "V-100.gas", or a battery limit / off-plot tie-in { at: [x, y, z] } */
  from: LineEnd
  to: LineEnd
  nps?: number
  service?: Service
  schedule?: Schedule
  insulated?: boolean
  /** elevation of the horizontal run, metres */
  elevation?: number
  order?: 'xz' | 'zx'
  /** manual waypoints between the two ends (plant coordinates); replaces auto-routing */
  via?: Vec3[]
  /** add stanchions under horizontal runs (default true) */
  supports?: boolean
  inline?: InlineItem[]
}

/** A line end: an item port ("TAG.port") or a battery limit where the line leaves the plot (P&ID off-page connector). */
export type LineEnd = string | { at: Vec3; direction?: Vec3; label?: string }

export interface InlineItem {
  /** inline registry component with ports A and B, e.g. "gate-valve" */
  component: string
  tag?: string
  /** position along the line, 0 = from end, 1 = to end (default 0.5) */
  at?: number
  props?: Record<string, unknown>
}

export interface Issue {
  level: 'error' | 'warning'
  where: string
  message: string
}

export const splitRef = (ref: string): [string, string] => {
  const i = ref.lastIndexOf('.')
  return i < 0 ? [ref, ''] : [ref.slice(0, i), ref.slice(i + 1)]
}
