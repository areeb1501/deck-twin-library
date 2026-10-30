/**
 * Example PlantSpec written the way a P&ID reads: tags, types, nozzle-to-nozzle connections,
 * line numbers and inline valves / instruments, with NO coordinates. The compiler lays out and
 * routes it. This is the shape a P&ID importer should emit.
 *
 *  M-100 manifold → V-101 3-phase separator ─ gas → V-102 scrubber → gas export
 *                                            ─ oil → P-105 pump → E-106 cooler → oil export
 *                                            ─ water → produced water treatment
 */
import type { PlantSpec } from '../spec'

export const separationTrainSpec: PlantSpec = {
  version: 1,
  name: 'Charlie Separation Train (from spec)',
  source: 'Example — hand-written from a simplified P&ID',
  equipment: [
    { tag: 'M-100', type: 'manifold', name: 'Production Manifold', params: { slots: 3, testNps: 0, prodNps: 12 } },
    { tag: 'V-101', type: 'horizontalVessel', name: 'Production Separator', params: { service: '3-phase', id: 2.6, tt: 9, inletNps: 12, gasNps: 8, liquidNps: 6, waterNps: 4 }, design: { pressure: '45 barg', temperature: '-10 / 110 °C' } },
    { tag: 'V-102', type: 'verticalVessel', name: 'Gas Scrubber', params: { inletNps: 8, gasNps: 8, liquidNps: 2 } },
    { tag: 'P-105', type: 'pumpPackage', name: 'Oil Transfer Pump', params: { suctionNps: 6, dischargeNps: 4, motorKw: 160 } },
    { tag: 'E-106', type: 'shellTube', name: 'Oil Cooler', params: { shellNps: 4, tubeNps: 6 } },
    { tag: 'B-109', type: 'module', name: 'Local Equipment Room', params: { sizeX: 7, sizeZ: 5 } },
  ],
  lines: [
    { tag: '12"-PM-101-D6A-H', service: 'multiphase', insulation: 'H', from: { equipment: 'M-100', nozzle: 'N1' }, to: { equipment: 'V-101', nozzle: 'N1' } },
    { tag: '8"-PG-102-D6A-N', service: 'gas', from: { equipment: 'V-101', nozzle: 'N2' }, to: { equipment: 'V-102', nozzle: 'N1' } },
    { tag: '8"-PG-103-D6A-N', service: 'gas', from: { equipment: 'V-102', nozzle: 'N2' }, to: { offPlant: 'Gas export' } },
    { tag: '6"-PO-104-D6A-N', service: 'oil', from: { equipment: 'V-101', nozzle: 'N3' }, to: { equipment: 'P-105', nozzle: 'N1' } },
    { tag: '4"-PO-105-C3A-N', service: 'oil', from: { equipment: 'P-105', nozzle: 'N2' }, to: { equipment: 'E-106', nozzle: 'N1' } },
    { tag: '4"-PO-106-C3A-N', service: 'oil', from: { equipment: 'E-106', nozzle: 'N2' }, to: { offPlant: 'Oil export' } },
    { tag: '4"-PW-107-D6A-N', service: 'water', from: { equipment: 'V-101', nozzle: 'N4' }, to: { offPlant: 'Produced water treatment' } },
    { tag: '2"-CD-108-D6A-N', service: 'drain', from: { equipment: 'V-102', nozzle: 'N3' }, to: { offPlant: 'Closed drain' } },
    { tag: '6"-CM-109-C3A-N', service: 'cooling', from: { offPlant: 'Cooling medium supply' }, to: { equipment: 'E-106', nozzle: 'N3' } },
    { tag: '6"-CM-110-C3A-N', service: 'cooling', from: { equipment: 'E-106', nozzle: 'N4' }, to: { offPlant: 'Cooling medium return' } },
  ],
  valves: [
    { tag: 'ESDV-101', type: 'esdv', line: '12"-PM-101-D6A-H', at: 0.45, failAction: 'FC' },
    { tag: 'PCV-103', type: 'control', line: '8"-PG-103-D6A-N', at: 0.6, failAction: 'FO' },
    { tag: 'HV-104', type: 'gate', line: '6"-PO-104-D6A-N', at: 0.35 },
    { tag: 'NRV-105', type: 'check', line: '4"-PO-105-C3A-N', at: 0.35 },
    { tag: 'HV-105', type: 'gate', line: '4"-PO-105-C3A-N', at: 0.7 },
    { tag: 'LV-107', type: 'control', line: '4"-PW-107-D6A-N', at: 0.5, failAction: 'FC' },
  ],
  instruments: [
    { tag: 'PT-102', type: 'PT', on: { line: '8"-PG-102-D6A-N', at: 0.3 }, nominal: 44 },
    { tag: 'FT-106', type: 'FT', on: { line: '4"-PO-106-C3A-N', at: 0.6 }, range: '0–150', nominal: 95 },
    { tag: 'TT-106', type: 'TT', on: { line: '4"-PO-106-C3A-N', at: 0.25 }, nominal: 48 },
  ],
}
