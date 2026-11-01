/**
 * Component-library parts used on the Alpha field (model/alphaOutfit.ts). The plant takes their flange faces from the
 * parts' own ports, and scene/equipment/Proxy.tsx draws them, so a nozzle always sits where the geometry has its flange.
 */
import type { ComponentType } from 'react'
import * as analyserShelter from '../../../registry/electrical/analyser-shelter'
import * as cartridgeFilter from '../../../registry/vessels/cartridge-filter'
import * as drainHub from '../../../registry/piping/drain-hub'
import * as eHouse from '../../../registry/electrical/e-house'
import * as fireMonitor from '../../../registry/safety/fire-monitor'
import * as hoseReel from '../../../registry/safety/hose-reel'
import * as hydraulicPowerUnit from '../../../registry/packages/hydraulic-power-unit'
import * as nitrogenGenerator from '../../../registry/packages/nitrogen-generator'
import * as plateHeatExchanger from '../../../registry/thermal/plate-heat-exchanger'
import * as safetyShower from '../../../registry/safety/safety-shower'
import * as screwCompressor from '../../../registry/rotating/screw-compressor'
import * as toteTank from '../../../registry/lifting/tote-tank'
import * as utilityStation from '../../../registry/piping/utility-station'
import * as waterFilterPackage from '../../../registry/packages/water-filter-package'
import type { Port } from '../../../registry/lib/ports'

interface LibraryModule {
  default: ComponentType<Record<string, unknown>>
  defaults?: Record<string, unknown>
  ports?: (p?: never) => Port[]
}

export const LIBRARY: Record<string, LibraryModule> = {
  'analyser-shelter': analyserShelter,
  'cartridge-filter': cartridgeFilter,
  'drain-hub': drainHub,
  'e-house': eHouse,
  'fire-monitor': fireMonitor,
  'hose-reel': hoseReel,
  'hydraulic-power-unit': hydraulicPowerUnit,
  'nitrogen-generator': nitrogenGenerator,
  'plate-heat-exchanger': plateHeatExchanger,
  'safety-shower': safetyShower,
  'screw-compressor': screwCompressor,
  'tote-tank': toteTank,
  'utility-station': utilityStation,
  'water-filter-package': waterFilterPackage,
} as unknown as Record<string, LibraryModule>

/** a part's ports with these props, in its local frame */
export function libraryPorts(component: string, props: Record<string, unknown> = {}): Port[] {
  const m = LIBRARY[component]
  return m.ports?.({ ...m.defaults, ...props } as never) ?? []
}
