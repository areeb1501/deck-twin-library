/**
 * Cold vent stacks of the Alpha field (drawn by scene/env/Vents.tsx, plume driven by `process.vent`):
 *
 *   VS-A300  Alpha weather deck, east edge by the flare-boom foot (28.4, +10, 3.6): 8" stack, tip 22 m
 *            above the weather deck (EL +60). Takes the TEG regeneration still-column overhead vapour
 *            (C-5350) and the LP flash gas. It is downwind of the deck in the prevailing WSW wind,
 *            > 14 m from the turbine air intakes (GT-8100A/B filter houses), ~60 m from the helideck and
 *            ~46 m from the quarters HVAC intake, and above everything within 15 m (GT stacks EL +56).
 *   VS-R300  RP, at RP.vent: 12" stack, top RP.vent.height above the main deck, for the riser topsides
 *            blowdown (BDV on the export risers).
 *
 * Deck-local coordinates (world = + [0, 28, 0]).
 */
import type { PlatformId } from '../sim/types'
import type { Equipment, Proxy } from './types'
import { instantiate } from '../library/components'
import { RP, WEATHER_FLOOR } from './site'

export interface VentStack {
  tag: string
  name: string
  platform: PlatformId
  /** base centre (deck-local) */
  x: number
  y: number
  z: number
  /** stack height above its base, m */
  height: number
  /** stack OD, m */
  od: number
  nps: number
  /** what it vents (knowledge card / inspector) */
  service: string
}

export const VENTS: VentStack[] = [
  {
    tag: 'VS-A300',
    name: 'Cold Vent Stack A (TEG still vent + LP flash)',
    platform: 'Alpha',
    x: 28.4,
    y: WEATHER_FLOOR,
    z: 3.6,
    height: 22,
    od: 0.219,
    nps: 8,
    service: 'TEG regeneration still-column overhead (water vapour, BTEX, traces of methane) and LP flash gas',
  },
  {
    tag: 'VS-R300',
    name: 'Cold Vent Stack R (riser topsides blowdown)',
    platform: 'RP',
    x: RP.vent.x,
    y: 0,
    z: RP.vent.z,
    height: RP.vent.height,
    od: 0.324,
    nps: 12,
    service: 'RP export-riser topsides blowdown (BDV) and the riser pig-trap vents',
  },
]
export const VENT_BY_TAG = new Map(VENTS.map((v) => [v.tag, v]))

/** world-space tip of a stack */
export const ventTip = (v: VentStack): [number, number, number] => [v.x, v.y + v.height + 28, v.z]

/** Add the vent-stack inspection proxies (called by extendCranes). */
export function extendVents(A: { equipment: Equipment[] }) {
  const have = new Set(A.equipment.map((e) => e.tag))
  for (const v of VENTS) {
    if (have.has(v.tag)) continue
    const e = instantiate('proxy', {
      tag: v.tag,
      name: v.name,
      system: 'flare',
      at: [v.x, v.z],
      y: v.y,
      // role 'ventStack' (not yet in model/types Proxy['role']; behaves like an unknown role: no machine,
      // no line-of-sight blocking, knowledge by name)
      params: { role: 'ventStack', sizeX: 1.6, sizeY: v.height, sizeZ: 1.6 },
      design: {
        capacity: `${v.nps}" stack, tip ${v.height} m above deck`,
        notes: `Cold vent to atmosphere: ${v.service}. Flame arrestor / molecular seal at the tip, purged; dispersion checked so the tip is outside hazardous-area and air-intake envelopes.`,
      },
    }) as Proxy
    A.equipment.push(e)
  }
}
