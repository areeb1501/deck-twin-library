/**
 * Example #2 — an ONSHORE gas compression station, authored with the auto-router.
 * Proves the renderer is plant-agnostic: same schema, same piping engine, different site.
 *
 *  Pipeline → V-110 inlet separator → V-120A/B scrubbers → K-130A/B compressors
 *           → E-140A/B aftercoolers → discharge header → export pipeline
 *  Liquids  → P-160A/B condensate pumps → off-site; reliefs → V-150 flare KO drum
 */
import type { CompressorPackage, Equipment, HorizontalVessel, Instrument, PipeLine, Plant, PumpPackage, ShellTube, Valve, VerticalVessel, Module } from '../types'
import { headDepth, headSurface, nozzle } from '../geom'
import { autoRoute, fromNozzle } from '../route'

const Ro = (v: { id: number; wall: number }) => v.id / 2 + v.wall

function hv(tag: string, name: string, at: [number, number], id: number, tt: number, elevation: number, extra: Partial<HorizontalVessel> = {}): HorizontalVessel {
  const wall = 0.03
  return {
    kind: 'horizontalVessel', tag, name, system: 'production', id, tt, wall, elevation,
    position: [at[0], elevation + id / 2 + wall, at[1]], rotationY: 0, nozzles: [],
    saddles: [-tt * 0.32, tt * 0.32], design: {}, ...extra,
  }
}

const V110 = hv('V-110', 'Inlet Separator', [-21, -6], 2.6, 8, 1.2, {
  internals: ['inletDiverter', 'perforatedBaffle', 'meshPad', 'vortexBreaker'], levels: { oil: 0.35 },
  design: { pressure: '70 barg', temperature: '-20 / 80 °C', capacity: '180 MMscfd', material: 'SA-516 Gr.70' },
})
V110.nozzles.push(nozzle(V110, 'N1', 'Inlet', [-(V110.tt / 2 + headDepth(V110.id) + V110.wall), 0, 0], [-1, 0, 0], 16, 0.5, 600))
V110.nozzles.push(nozzle(V110, 'N2', 'Gas outlet', [3.0, Ro(V110), 0], [0, 1, 0], 16, 0.45, 600))
V110.nozzles.push(nozzle(V110, 'N3', 'Condensate outlet', [2.4, -Ro(V110), 0], [0, -1, 0], 4, 0.35, 600))

function scrubber(tag: string, at: [number, number]): VerticalVessel {
  const v: VerticalVessel = {
    kind: 'verticalVessel', tag, name: `Suction Scrubber ${tag.slice(-1)}`, system: 'gasCompression', id: 1.5, tt: 4.6, wall: 0.035,
    elevation: 1.0, support: 'skirt', internals: ['inletDiverter', 'meshPad', 'vortexBreaker'], levels: { liquid: 0.1 }, platform: true,
    position: [at[0], 0, at[1]], rotationY: 0, nozzles: [], design: { pressure: '70 barg', capacity: '90 MMscfd' },
  }
  const r = v.id / 2 + v.wall
  v.nozzles.push(nozzle(v, 'N1', 'Gas inlet', [-r, 3.4, 0], [-1, 0, 0], 12, 0.4, 600))
  v.nozzles.push(nozzle(v, 'N2', 'Gas outlet', [0, v.elevation + v.tt + headDepth(v.id) + v.wall, 0], [0, 1, 0], 12, 0.35, 600))
  v.nozzles.push(nozzle(v, 'N3', 'Liquid outlet', [0, 1.4, r], [0, 0, 1], 2, 0.3, 600))
  v.nozzles.push(nozzle(v, 'N4', 'PSV', [0.4, v.elevation + v.tt + headSurface(v.id, v.wall, 0.4), 0], [0, 1, 0], 3, 0.3, 600))
  return v
}
const V120A = scrubber('V-120A', [-9, -9])
const V120B = scrubber('V-120B', [-9, 3])

function compressor(tag: string, at: [number, number]): CompressorPackage {
  const k: CompressorPackage = {
    kind: 'compressorPackage', tag, name: `Gas Compressor ${tag.slice(-1)}`, system: 'gasCompression', skid: [11, 4], motorKw: 5200,
    position: [at[0], 0, at[1]], rotationY: 0, nozzles: [], design: { pressure: '45 → 95 barg', capacity: '90 MMscfd' },
  }
  k.nozzles.push(nozzle(k, 'N1', 'Suction', [3.4, 2.55, 0], [0, 1, 0], 12, 0.35, 600))
  k.nozzles.push(nozzle(k, 'N2', 'Discharge', [2.2, 2.55, 0], [0, 1, 0], 10, 0.35, 900))
  return k
}
const K130A = compressor('K-130A', [5, -9])
const K130B = compressor('K-130B', [5, 3])

function cooler(tag: string, at: [number, number]): ShellTube {
  const e: ShellTube = {
    kind: 'shellTube', tag, name: `Aftercooler ${tag.slice(-1)}`, system: 'gasCompression', temaType: 'AES', shellOd: 0.85, length: 5.2,
    channelLength: 0.7, tubeCount: 520, tubeOd: 0.01905, elevation: 0.6, position: [at[0], 0.6 + 0.425, at[1]], rotationY: 0, nozzles: [],
    design: { pressure: '100 / 8 barg', capacity: '4.8 MW' },
  }
  const r = e.shellOd / 2
  e.nozzles.push(nozzle(e, 'N1', 'Gas in', [1.9, r, 0], [0, 1, 0], 10, 0.3, 900))
  e.nozzles.push(nozzle(e, 'N2', 'Gas out', [-1.9, r, 0], [0, 1, 0], 10, 0.3, 900))
  return e
}
const E140A = cooler('E-140A', [5, -14.5])
const E140B = cooler('E-140B', [5, 8.5])

const V150 = hv('V-150', 'Flare KO Drum', [-21, 9], 2.2, 6, 0.9, { system: 'flare', internals: ['inletDiverter', 'vortexBreaker'], levels: { oil: 0.15 }, design: { pressure: '3.5 barg' } })
V150.nozzles.push(nozzle(V150, 'N1', 'Inlet', [2.0, Ro(V150), 0], [0, 1, 0], 12, 0.4))
V150.nozzles.push(nozzle(V150, 'N2', 'Gas to flare', [-2.2, Ro(V150), 0], [0, 1, 0], 12, 0.4))

function pump(tag: string, at: [number, number]): PumpPackage {
  const p: PumpPackage = {
    kind: 'pumpPackage', tag, name: `Condensate Pump ${tag.slice(-1)}`, system: 'oilExport', stages: 1, motorKw: 75, baseplate: [2.6, 1.0],
    position: [at[0], 0, at[1]], rotationY: Math.PI / 2, nozzles: [], design: { capacity: '40 m³/h' },
  }
  p.nozzles.push(nozzle(p, 'N1', 'Suction', [0.85, 0.7, 0], [1, 0, 0], 4, 0.2))
  p.nozzles.push(nozzle(p, 'N2', 'Discharge', [0.5, 1.0, 0], [0, 1, 0], 3, 0.2))
  return p
}
const P160A = pump('P-160A', [-16, -14])
const P160B = pump('P-160B', [-13, -14])

const B190: Module = { kind: 'module', tag: 'B-190', name: 'Electrical & Control Building', system: 'utilities', size: [9, 3.8, 6], position: [21, 0, 11], rotationY: 0, nozzles: [], design: {} }

const equipment: Equipment[] = [V110, V120A, V120B, K130A, K130B, E140A, E140B, V150, P160A, P160B, B190]
const N = (e: Equipment, id: string) => e.nozzles.find((n) => n.id === id)!

const lines: PipeLine[] = []
const L = (tag: string, service: PipeLine['service'], nps: number, route: PipeLine['route'], from: PipeLine['from'], to: PipeLine['to'], system: PipeLine['system'] = 'gasCompression') =>
  lines.push({ tag, service, system, nps, schedule: nps >= 10 ? 'XS' : '80', spec: 'D6A', route, from, to, design: {} })

L('16"-PG-101-D6A-N', 'gas', 16, [[-29.5, -0.6, -6], [-29.5, V110.position[1], -6], N(V110, 'N1').pos], { offDeck: 'Inlet pipeline' }, { equipment: 'V-110', nozzle: 'N1' }, 'production')
// inlet header 16" from separator gas outlet, splitting to two scrubbers
const g = N(V110, 'N2').pos
L('16"-PG-111-D6A-N', 'gas', 16, [g, [g[0], 5.2, g[2]], [-15, 5.2, g[2]], [-15, 5.2, -9], [-15, N(V120A, 'N1').pos[1], -9], N(V120A, 'N1').pos], { equipment: 'V-110', nozzle: 'N2' }, { equipment: 'V-120A', nozzle: 'N1' })
L('12"-PG-112-D6A-N', 'gas', 12, [[-15, 5.2, -4.0], [-15, 5.2, 3], [-15, N(V120B, 'N1').pos[1], 3], N(V120B, 'N1').pos], { line: '16"-PG-111-D6A-N' }, { equipment: 'V-120B', nozzle: 'N1' })
for (const [s, k, e, sfx] of [
  [V120A, K130A, E140A, 'A'],
  [V120B, K130B, E140B, 'B'],
] as const) {
  L(`12"-PG-12${sfx === 'A' ? 1 : 2}-D6A-N`, 'gas', 12, autoRoute(fromNozzle(N(s, 'N2')), fromNozzle(N(k, 'N1')), 5.4), { equipment: s.tag, nozzle: 'N2' }, { equipment: k.tag, nozzle: 'N1' })
  L(`10"-PG-13${sfx === 'A' ? 1 : 2}-E9A-N`, 'gas', 10, autoRoute(fromNozzle(N(k, 'N2')), fromNozzle(N(e, 'N1')), 4.2, 'zx'), { equipment: k.tag, nozzle: 'N2' }, { equipment: e.tag, nozzle: 'N1' })
  L(`10"-PG-14${sfx === 'A' ? 1 : 2}-E9A-N`, 'gas', 10, autoRoute(fromNozzle(N(e, 'N2')), [26, 3.0, sfx === 'A' ? -16.5 : 10.5], 3.0, 'zx'), { equipment: e.tag, nozzle: 'N2' }, { offDeck: 'Export header' })
  L(`2"-PO-12${sfx === 'A' ? 5 : 6}-D6A-N`, 'drain', 2, [N(s, 'N3').pos, [N(s, 'N3').pos[0], 1.4, N(s, 'N3').pos[2] + 0.8], [N(s, 'N3').pos[0], -0.6, N(s, 'N3').pos[2] + 0.8]], { equipment: s.tag, nozzle: 'N3' }, { offDeck: 'Closed drain' })
}
const c = N(V110, 'N3').pos
L('4"-PO-161-D6A-N', 'oil', 4, [c, [c[0], 0.75, c[2]], [c[0], 0.75, -12.2], [N(P160A, 'N1').pos[0], 0.75, -12.2], N(P160A, 'N1').pos], { equipment: 'V-110', nozzle: 'N3' }, { equipment: 'P-160A', nozzle: 'N1' }, 'oilExport')
L('4"-PO-162-D6A-N', 'oil', 4, [[N(P160B, 'N1').pos[0], 0.75, -12.2], N(P160B, 'N1').pos], { line: '4"-PO-161-D6A-N' }, { equipment: 'P-160B', nozzle: 'N1' }, 'oilExport')
for (const p of [P160A, P160B]) {
  const d = N(p, 'N2').pos
  L(`3"-PO-${p.tag.slice(2)}-D6A-N`, 'oil', 3, [d, [d[0], 2.6, d[2]], [d[0], 2.6, -16.6], [27, 2.6, -16.6]], { equipment: p.tag, nozzle: 'N2' }, { offDeck: 'Condensate export' }, 'oilExport')
}
const fi = N(V150, 'N1').pos
L('12"-FL-151-B1A-N', 'flare', 12, [[-12.5, 6.0, 9], [fi[0], 6.0, 9], fi], { offDeck: 'Relief header' }, { equipment: 'V-150', nozzle: 'N1' }, 'flare')
const fo = N(V150, 'N2').pos
L('12"-FL-152-B1A-N', 'flare', 12, [fo, [fo[0], 5.0, fo[2]], [-29.5, 5.0, fo[2]]], { equipment: 'V-150', nozzle: 'N2' }, { offDeck: 'Ground flare' }, 'flare')

const valves: Valve[] = [
  { tag: 'ESDV-101', type: 'esdv', line: '16"-PG-101-D6A-N', seg: 0, t: 0.55, actuator: 'pistonSpring', failAction: 'FC', normally: 'open', up: [1, 0, 0], design: {} },
  { tag: 'XV-121', type: 'ball', line: '12"-PG-121-D6A-N', seg: 1, t: 0.5, actuator: 'electric', normally: 'open', design: {} },
  { tag: 'XV-122', type: 'ball', line: '12"-PG-122-D6A-N', seg: 1, t: 0.5, actuator: 'electric', normally: 'open', design: {} },
  { tag: 'NRV-131', type: 'check', line: '10"-PG-131-E9A-N', seg: 1, t: 0.5, normally: 'open', design: {} },
  { tag: 'NRV-132', type: 'check', line: '10"-PG-132-E9A-N', seg: 1, t: 0.5, normally: 'open', design: {} },
  { tag: 'HV-161', type: 'gate', line: '4"-PO-161-D6A-N', seg: 2, t: 0.5, actuator: 'handwheel', normally: 'open', design: {} },
  { tag: 'LV-110', type: 'control', line: '4"-PO-161-D6A-N', seg: 1, t: 0.5, actuator: 'diaphragm', failAction: 'FC', normally: 'open', design: {} },
]
const instruments: Instrument[] = [
  { tag: 'PT-101', type: 'PT', on: { line: '16"-PG-101-D6A-N', seg: 1, t: 0.4 }, range: '0–100', unit: 'barg', nominal: 66 },
  { tag: 'FT-111', type: 'FT', on: { line: '16"-PG-111-D6A-N', seg: 1, t: 0.5 }, dir: [0, 1, 0], range: '0–200', unit: 'MMscfd', nominal: 162 },
  { tag: 'PT-131', type: 'PT', on: { line: '10"-PG-131-E9A-N', seg: 1, t: 0.2 }, range: '0–120', unit: 'barg', nominal: 93 },
  { tag: 'TT-141', type: 'TT', on: { line: '10"-PG-141-E9A-N', seg: 1, t: 0.4 }, range: '0–150', unit: '°C', nominal: 41 },
  { tag: 'LT-110', type: 'LT', on: { equipment: 'V-110', at: [-19.5, 2.2, -7.36] }, dir: [0, 0, -1], range: '0–2600', unit: 'mm', nominal: 910 },
]

export const onshoreStation: Plant = {
  name: 'Bravo Compressor Station',
  deck: { name: 'Onshore · grade EL +0.3 m', elevation: 0, extent: { minX: -30, maxX: 30, minZ: -18, maxZ: 18 }, site: 'onshore' },
  equipment,
  lines,
  valves,
  instruments,
}
