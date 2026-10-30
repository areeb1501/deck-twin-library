/**
 * Component library types. A component is a parametric factory for one equipment kind: it turns
 * a flat parameter record into the kind-specific fields of an Equipment record plus a set of
 * nozzles defined in the equipment's LOCAL frame. Placement (position / rotation) is applied
 * later by `instantiate`, which converts the nozzles to deck coordinates.
 */
import type { Equipment, EquipmentKind, Rating, SystemId, Vec3 } from '../model/types'

export type ParamValue = number | string | boolean
export type Params = Record<string, ParamValue>

export interface ParamDef {
  key: string
  label: string
  type: 'number' | 'int' | 'select' | 'bool'
  unit?: string
  min?: number
  max?: number
  step?: number
  options?: { value: string | number; label: string }[]
  /** hide the control unless this returns true (e.g. water nozzle only for 3-phase) */
  when?: (p: Params) => boolean
}

/** Nozzle in the equipment-local frame. Flange face = base + dir * neck. */
export interface NozzleTemplate {
  id: string
  name: string
  base: Vec3
  dir: Vec3
  nps: number
  neck?: number
  rating?: Rating
}

export type Category = 'Vessels' | 'Heat transfer' | 'Rotating' | 'Pipeline' | 'Packages & buildings'

/** Fields every Equipment shares — the factory supplies everything else. */
type Common = 'kind' | 'tag' | 'name' | 'system' | 'position' | 'rotationY' | 'nozzles' | 'design'
export type Body<K extends EquipmentKind> = Omit<Extract<Equipment, { kind: K }>, Common>

export interface ComponentDef<K extends EquipmentKind = EquipmentKind> {
  kind: K
  label: string
  category: Category
  blurb: string
  /** ISA-style tag letter used when auto-numbering (V-101, P-102 …) */
  tagPrefix: string
  system: SystemId
  params: ParamDef[]
  defaults: Params
  /** kind-specific fields */
  body: (p: Params) => Body<K>
  /** deck-frame height of the equipment origin (see each kind in model/types.ts) */
  originY: (p: Params) => number
  /** not offered in the builder palette / library page (e.g. pick proxies) */
  hidden?: boolean
  /** default nozzle set in the local frame */
  nozzles: (p: Params) => NozzleTemplate[]
}
