/**
 * Materials handling and metering items added for plan 13 (asset & economics). All STATIC: none of
 * them is a kind `classOf` in sim/maintenance.ts maps to a machine class, so they never join the monitored
 * machines, the run states or the simulation's random draws. Positions come from model/site.ts; the
 * environment parts (laydown cargo, store racking, prover skid) are drawn by
 * scene/env/AlphaLogistics.tsx.
 *
 *   B-9510  Offshore materials store (containerised walk-in store), Alpha weather deck SE, under CR-A1
 *   X-R155  Compact (piston) meter prover for the oil fiscal meter X-R150 on RP
 *
 * Call once from model/plant.ts after the other extend* calls:  extendLogistics({ equipment })
 */
import type { Equipment, HorizontalVessel, Module } from './types'
import { instantiate, componentDef, resolveParams } from '../library/components'
import { ALPHA_STORE, RP_PROVER, WEATHER_FLOOR } from './site'

export const LOGISTICS_TAGS = { store: 'B-9510', prover: 'X-R155' } as const

/** the prover barrel: axis along Z (N1 inlet on the north head, actuator on the south head), on its skid */
export const PROVER_BARREL = { x: RP_PROVER.x, z: RP_PROVER.z, id: 0.5, tt: 2.0, elevation: 0.55 }

export function extendLogistics(A: { equipment: Equipment[] }) {
  const have = new Set(A.equipment.map((e) => e.tag))
  const add = (e: Equipment) => {
    if (!have.has(e.tag)) A.equipment.push(e)
  }
  const nz = (kind: 'horizontalVessel', params: Record<string, number | string | boolean>, rename: Record<string, string>) =>
    componentDef(kind)
      .nozzles(resolveParams(kind, params))
      .map((t) => ({ ...t, name: rename[t.id] ?? t.name }))

  // ---------------------------------------------------------------- offshore materials store (weather deck)
  const store = instantiate('module', {
    tag: LOGISTICS_TAGS.store,
    name: 'Offshore Materials Store (containerised)',
    system: 'utilities',
    at: [ALPHA_STORE.x, ALPHA_STORE.z],
    y: WEATHER_FLOOR,
    params: { sizeX: ALPHA_STORE.size[0], sizeY: ALPHA_STORE.size[1], sizeZ: ALPHA_STORE.size[2] },
    design: {
      capacity: '2 × 20 ft store containers joined, ≈ 1 100 bin locations',
      notes:
        'Alpha offshore store: the A/B-class critical spares, PM kits and consumables held on the installation, issued against work orders. Stock, purchase orders and the supply-vessel / helicopter schedule: Control room → Spares & supply (simulated data). Served by crane CR-A1 from the supply vessel alongside the east face; laydown to the west.',
    },
  }) as Module
  Object.assign(store, { interior: 'none', doors: [{ id: 'D1', wall: '-x', at: -1.5, width: 1.8, double: true }] })
  add(store)

  // ---------------------------------------------------------------- compact meter prover (RP, east of X-R150)
  {
    const P = PROVER_BARREL
    const params = { service: '2-phase', id: P.id, tt: P.tt, elevation: P.elevation, inletNps: 6, gasNps: 6, liquidNps: 1, psvNps: 1, rating: 600 }
    const prover = instantiate('horizontalVessel', {
        tag: LOGISTICS_TAGS.prover,
        name: 'Oil Meter Prover (compact piston prover)',
        system: 'oilExport',
        at: [P.x, P.z],
        rotationY: -Math.PI / 2,
        params,
        nozzles: nz('horizontalVessel', params, { N1: 'Oil in (from the X-R150 prover header)', N2: 'Oil out (back to the meter run)', N3: 'Drain', N5: 'Thermal relief' }),
        design: {
          pressure: '96 barg',
          capacity: '≈ 60 l swept volume, bidirectional, 4-way diverter',
          notes: 'Proves the ultrasonic meter runs of the oil fiscal metering skid X-R150 (custody transfer): meter factor from five consecutive runs, repeatability ≤ 0.05 %. Water-draw calibrated; flow computer in the RP temporary refuge B-R395.',
        },
      }) as HorizontalVessel
    // a precision barrel full of oil with a piston, not a separator: no internals
    Object.assign(prover, { internals: [], levels: { oil: 0.97 } })
    add(prover)
  }
}
