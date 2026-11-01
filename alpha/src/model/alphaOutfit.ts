/**
 * Alpha outfit: the utility systems and small-bore pipework a working platform carries around its process plant, built
 * on the empty deck areas. Everything here is connected: every line starts and ends on a nozzle, a header or a named
 * off-deck point, and the simulation's process model is unchanged. Appended last, so no existing index shifts.
 *
 *  Production deck
 *   - plant air: K-4610 → V-4710 → new service air header on the rack
 *   - fresh water: X-6600 maker → new fresh water header → safety showers
 *   - utility stations: air, water and nitrogen drops from the rack headers
 *   - firewater: hose reels and monitors off the ring main, deluge grids over the process areas
 *   - K-2200 lube oil console and cooler, topsides HPU, chemical totes, analyser shelter, control valve bypasses
 *  Cellar deck
 *   - diesel storage, transfer pumps and filter feeding the rack diesel header
 *   - open drains: deck drain hubs → under-deck header → V-4450 → pumps → caisson
 *   - in-field pig receiver L-1010 on the WHP-N inlet
 *   - nitrogen generator X-8350 and buffer on the service air header, scale inhibitor package
 *  Weather deck
 *   - electrical house B-9120 for the new utility loads
 *  Every control valve with room for it also gets its block valves and a globe bypass.
 *
 * Library parts are proxies drawn by the component library (model/libraryItems.ts, scene/equipment/Proxy.tsx).
 */
import bounds from '../../../registry/generated/bounds.json'
import { componentDef, instantiate, resolveParams } from '../library/components'
import type { Params } from '../library/types'
import { INSTRUMENT_DEFAULTS, placeOnLine, valveClear } from '../library/compile'
import { elbowRadius } from './catalog'
import { libraryPorts } from './libraryItems'
import { CELLAR_FLOOR } from './site'
import type { Equipment, EquipmentKind, Instrument, InstrumentType, Nozzle, PipeLine, Proxy, Rating, Service, SystemId, Valve, ValveType, Vec3 } from './types'

interface Arrays {
  equipment: Equipment[]
  lines: PipeLine[]
  valves: Valve[]
  instruments: Instrument[]
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const P = (...v: number[]) => v.map(r3) as Vec3
const RING = '8"-FW-9001-F1A-N'
const OVER_DECK = 8.55

export function extendOutfit(A: Arrays) {
  const eqBy = new Map(A.equipment.map((e) => [e.tag, e]))
  const lineBy = new Map(A.lines.map((l) => [l.tag, l]))

  const nozzle = (tag: string, id: string): Nozzle => {
    const n = eqBy.get(tag)?.nozzles.find((x) => x.id === id)
    if (!n) throw new Error(`alphaOutfit: nozzle ${tag}/${id} missing`)
    return n
  }
  const face = (tag: string, id: string) => nozzle(tag, id).pos
  const to = (tag: string, id: string) => ({ equipment: tag, nozzle: id })
  const hdr = (line: string) => ({ line })

  /** engine equipment, as alphaSite.ts places it */
  function E(kind: EquipmentKind, tag: string, name: string, system: SystemId, at: [number, number], rotDeg: number, params: Params, o: { y?: number; rename?: Record<string, string>; design?: Equipment['design'] } = {}) {
    const p = resolveParams(kind, params)
    const nz = componentDef(kind).nozzles(p).map((t) => ({ ...t, name: o.rename?.[t.id] ?? t.name }))
    const eq = instantiate(kind, { tag, name, system, at, rotationY: (rotDeg * Math.PI) / 180, params, y: o.y, nozzles: nz, design: o.design })
    A.equipment.push(eq)
    eqBy.set(tag, eq)
    return eq
  }

  /** a component-library part, its nozzles taken from the part's own ports */
  function LIB(tag: string, name: string, system: SystemId, component: string, at: [number, number], rotDeg: number, o: { y?: number; props?: Record<string, unknown>; size?: Vec3; design?: Equipment['design'] } = {}) {
    const y = o.y ?? 0
    const a = (rotDeg * Math.PI) / 180
    const c = Math.cos(a)
    const s = Math.sin(a)
    const rot = ([x, h, z]: Vec3): Vec3 => [x * c + z * s, h, -x * s + z * c]
    const nozzles: Nozzle[] = libraryPorts(component, o.props).map((p) => {
      const q = rot(p.position)
      const dir = rot(p.direction).map((v) => Math.round(v * 1000) / 1000) as Vec3
      const pos = P(q[0] + at[0], q[1] + y, q[2] + at[1])
      return { id: p.id, name: p.label, pos, dir, nps: p.nps, rating: (p.rating && p.rating <= 900 ? p.rating : 150) as Rating, base: P(pos[0] - dir[0] * 0.15, pos[1] - dir[1] * 0.15, pos[2] - dir[2] * 0.15) }
    })
    const size = o.size ?? ((bounds as unknown as Record<string, { size: Vec3 }>)[component]?.size ?? [1, 1, 1])
    const eq: Proxy = { kind: 'proxy', role: 'custom', tag, name, system, position: [at[0], y, at[1]], rotationY: a, size, solid: size[0] > 0.6, nozzles, design: o.design ?? {}, library: { component, props: o.props } }
    A.equipment.push(eq)
    eqBy.set(tag, eq)
    return eq
  }

  function L(tag: string, service: Service, system: SystemId, nps: number, route: Vec3[], from: PipeLine['from'], end: PipeLine['to'], o: Partial<PipeLine> = {}) {
    const rating = Number(tag.match(/-([A-Z])\d[A-Z]-/)?.[1] === 'C' ? 300 : 150)
    const l: PipeLine = { tag, service, system, nps, schedule: nps >= 10 ? 'XS' : '80', spec: tag.split('-')[3] ?? (rating >= 300 ? 'C3A' : 'A1A'), route: route.map((v) => P(...v)), from, to: end, design: {}, ...o }
    A.lines.push(l)
    lineBy.set(tag, l)
    return tag
  }
  function VA(tag: string, type: ValveType, line: string, at: number, o: Partial<Valve> = {}) {
    const l = lineBy.get(line)!
    const { seg, t } = placeOnLine(l, at, valveClear(type, l.nps, l.spec))
    A.valves.push({ tag, type, line, seg, t: r3(t), normally: 'open', design: {}, ...o })
  }
  function IL(tag: string, type: InstrumentType, line: string, at: number, o: Partial<Instrument> = {}) {
    const l = lineBy.get(line)!
    const { seg, t } = placeOnLine(l, at, elbowRadius(l.nps) + 0.15)
    const d = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { line, seg, t: r3(t) }, dir: [0, 1, 0], range: d.range, unit: d.unit, nominal: d.nominal, ...o })
  }

  // ================================================================ rack headers
  const SA = L('2"-SA-9702-A1A-N', 'instrumentAir', 'utilities', 2, [[-24.2, 6.53, 0.05], [24.2, 6.53, 0.05]], { offDeck: 'Header end (blind flange)' }, { offDeck: 'Header end (blind flange)' }, { design: { pressure: '8 barg', notes: 'Service air header' } })
  const FR = L('2"-PW-9611-A1A-N', 'water', 'utilities', 2, [[-24.2, 6.53, 0.5], [24.2, 6.53, 0.5]], { offDeck: 'Header end (blind flange)' }, { offDeck: 'Header end (blind flange)' }, { design: { pressure: '6 barg', notes: 'Fresh water header' } })
  const NG = '2"-NG-9401-A1A-N'
  const UW = '3"-UW-9301-A1A-N'
  const yU = lineBy.get(UW)!.route[1][1]
  const zU = lineBy.get(UW)!.route[1][2]
  const yN = lineBy.get(NG)!.route[1][1]
  const zN = lineBy.get(NG)!.route[1][2]

  // ================================================================ plant air (north-east corner)
  LIB('K-4610', 'Plant Air Compressor', 'utilities', 'screw-compressor', [21.4, -8.5], 0, {
    props: { kw: 110, service: 'air', inletNps: 4, outletNps: 3, rating: 150 }, size: [4.8, 2.6, 3.9],
    design: { capacity: '900 Nm³/h at 8 barg', notes: 'Oil-free screw compressor in an acoustic enclosure. Serves the service air header and the utility stations' },
  })
  E('verticalVessel', 'V-4710', 'Plant Air Receiver', 'utilities', [26.2, -8.0], 0, { id: 1.1, tt: 2.4, elevation: 0.6, support: 'legs', internals: 'mesh', platform: false, inletNps: 2, gasNps: 2, liquidNps: 1, psvNps: 2, rating: 150 }, {
    rename: { N1: 'Air inlet', N2: 'Air outlet', N3: 'Condensate drain' }, design: { pressure: '11 barg', capacity: '3 m³' },
  })
  const ko = face('K-4610', 'outlet')
  const ri = face('V-4710', 'N1')
  const sa1 = L('3"-SA-4611-A1A-N', 'instrumentAir', 'utilities', 3, [ko, [ko[0], ko[1], ko[2] - 0.6], [ri[0] - 0.7, ko[1], ko[2] - 0.6], [ri[0] - 0.7, ri[1], ko[2] - 0.6], [ri[0] - 0.7, ri[1], ri[2]], ri], to('K-4610', 'outlet'), to('V-4710', 'N1'))
  const ro = face('V-4710', 'N2')
  const sa2 = L('2"-SA-4612-A1A-N', 'instrumentAir', 'utilities', 2, [ro, [ro[0], 5.6, ro[2]], [ro[0], 5.6, 0.05], [24.2, 5.6, 0.05], [24.2, 6.53, 0.05]], to('V-4710', 'N2'), hdr(SA))
  VA('NRV-4611', 'check', sa1, 0.3)
  VA('HV-4611', 'gate', sa1, 0.72, { actuator: 'handwheel' })
  VA('HV-4612', 'ball', sa2, 0.2, { actuator: 'lever' })
  IL('PG-4612', 'PG', sa2, 0.45, { range: '0–12', unit: 'barg', nominal: 7.8 })

  // ================================================================ fresh water maker (under the east end of the rack)
  LIB('X-6600', 'Fresh Water Maker', 'utilities', 'water-filter-package', [21.4, 0.1], 0, {
    props: { filters: 2, filterDiameter: 0.9, filterHeight: 1.5, headerNps: 4, branchNps: 3 }, size: [7.3, 3.5, 3.5],
    design: { capacity: '80 m³/d', notes: 'Reverse osmosis from seawater, media pre-filters' },
  })
  const fi = face('X-6600', 'inlet')
  const fo = face('X-6600', 'outlet')
  const fb = face('X-6600', 'backwash')
  const seaIn = L('4"-SW-6601-A1A-N', 'water', 'utilities', 4, [[18.6, 2.4, -7.75], [18.6, 2.4, -2.45], [17.1, 2.4, -2.45], [17.1, fi[1], -2.45], [17.1, fi[1], fi[2]], fi], hdr('8"-SW-6302-A1A-N'), to('X-6600', 'inlet'))
  const toHdr = L('4"-PW-6602-A1A-N', 'water', 'utilities', 4, [fo, [26.1, fo[1], fo[2]], [26.1, 5.8, fo[2]], [26.1, 5.8, 1.0], [23.6, 5.8, 1.0], [23.6, 5.8, 0.5], [23.6, 6.53, 0.5]], to('X-6600', 'outlet'), hdr(FR))
  const waste = L('4"-OD-6603-B1A-N', 'drain', 'utilities', 4, [fb, [26.6, fb[1], fb[2]], [26.6, -8.4, fb[2]]], to('X-6600', 'backwash'), { offDeck: 'Backwash overboard (cellar deck)' })
  VA('HV-6601', 'butterfly', seaIn, 0.6, { actuator: 'gear' })
  VA('HV-6602', 'gate', toHdr, 0.2, { actuator: 'handwheel' })
  VA('NRV-6602', 'check', toHdr, 0.32)
  VA('HV-6603', 'butterfly', waste, 0.3, { actuator: 'gear' })
  IL('PG-6601', 'PG', seaIn, 0.8, { range: '0–10', unit: 'barg', nominal: 4.2 })
  IL('AT-6602', 'AT', toHdr, 0.55, { range: '0–500', unit: 'µS/cm', nominal: 120 })

  // ================================================================ utility stations: air, water, nitrogen from the rack
  const stations: [string, number, number, 0 | 180][] = [
    ['US-1701', -20.8, -5.6, 0],
    ['US-1703', 7.8, -5.6, 0],
    ['US-1704', -10.2, 5.0, 180],
  ]
  stations.forEach(([tag, x, z, rot], i) => {
    LIB(tag, `Utility Station ${i + 1}`, 'utilities', 'utility-station', [x, z], rot, { size: [0.9, 2.4, 0.5], design: { notes: 'Service air, utility water and nitrogen hose points, with their isolation valves' } })
    const seq = 1701 + i * 3
    const leg = (id: string, nps: number, service: Service, code: string, y: number, hz: number, hy: number, host: string, n: number) => {
      const p = face(tag, id)
      return L(`1"-${code}-${seq + n}-A1A-N`, service, 'utilities', nps, [p, [p[0], y, p[2]], [p[0], y, hz], [p[0], hy, hz]], to(tag, id), hdr(host))
    }
    const a = leg('air', 1, 'instrumentAir', 'SA', 3.72, 0.05, 6.53, SA, 0)
    const w = leg('water', 1, 'water', 'UW', 3.4, zU, yU, UW, 1)
    const n = leg('nitrogen', 1, 'instrumentAir', 'NG', 3.56, zN, yN, NG, 2)
    VA(`HV-${seq}`, 'ball', a, 0.14, { actuator: 'lever' })
    VA(`HV-${seq + 1}`, 'ball', w, 0.14, { actuator: 'lever' })
    VA(`HV-${seq + 2}`, 'ball', n, 0.14, { actuator: 'lever' })
  })

  // ================================================================ safety showers (fresh water)
  const showers: [string, number, number, number][] = [
    ['SS-9001', 19.2, -15.8, 90],
  ]
  showers.forEach(([tag, x, z, rot], i) => {
    LIB(tag, `Safety Shower ${i + 1}`, 'safety', 'safety-shower', [x, z], rot, { size: [0.6, 2.9, 0.9], design: { notes: 'Tepid fresh water, eyewash, flow alarm to the CCR' } })
    const p = face(tag, 'inlet')
    const n = nozzle(tag, 'inlet')
    const off: Vec3 = [p[0] + n.dir[0] * 0.4, p[1], p[2] + n.dir[2] * 0.4]
    const hz = 0.5
    const l = L(`1"-PW-96${21 + i}-A1A-N`, 'water', 'safety', 1, [p, off, [off[0], 3.9, off[2]], [off[0], 3.9, 0.95], [off[0], 5.6, 0.95], [off[0], 5.6, hz], [off[0], 6.53, hz]], to(tag, 'inlet'), hdr(FR))
    VA(`HV-96${21 + i}`, 'ball', l, 0.06, { actuator: 'lever' })
  })

  // ================================================================ firewater: hose reels and monitors off the ring
  const reel = (tag: string, name: string, part: string, at: [number, number], rot: number, ringAt: Vec3, nps: number, seq: number, props?: Record<string, unknown>) => {
    LIB(tag, name, 'safety', part, at, rot, { props, size: part === 'fire-monitor' ? [1, 2.6, 1.2] : [0.8, 1.7, 0.7], design: { notes: 'Fed from the firewater ring main' } })
    const p = face(tag, 'inlet')
    const dir = nozzle(tag, 'inlet').dir
    const off: Vec3 = [p[0] + dir[0] * 0.5, p[1], p[2] + dir[2] * 0.5]
    const route: Vec3[] = [ringAt, [ringAt[0], off[1], ringAt[2]], [ringAt[0], off[1], off[2]], off, p]
    const l = L(`${nps}"-FW-${seq}-F1A-N`, 'firewater', 'safety', nps, route.filter((q, i, r) => !i || Math.hypot(q[0] - r[i - 1][0], q[1] - r[i - 1][1], q[2] - r[i - 1][2]) > 0.01), hdr(RING), to(tag, 'inlet'))
    VA(`HV-${seq}`, nps >= 4 ? 'butterfly' : 'gate', l, 0.86, { actuator: nps >= 4 ? 'gear' : 'handwheel' })
  }
  const N = -18.7
  const S = 18.7
  reel('HR-7101', 'Hose Reel, north west', 'hose-reel', [-20.4, -18.0], 180, [-19.6, OVER_DECK, N], 2, 7111)
  reel('HR-7103', 'Hose Reel, north east', 'hose-reel', [17.6, -18.0], 180, [18.4, OVER_DECK, N], 2, 7113)
  reel('HR-7104', 'Hose Reel, south west', 'hose-reel', [-7.8, 18.0], 180, [-7.0, OVER_DECK, S], 2, 7114)
  reel('FM-7101', 'Fire Monitor, east', 'fire-monitor', [26.0, -3.0 - 2.4], 180, [27.0, OVER_DECK, -5.4], 4, 7116, { nps: 4 })

  // ================================================================ deluge grids over the process areas
  const grid = (seq: number, zoneNote: string, route: Vec3[], ringPoint: boolean) => {
    const l = L(`4"-FW-${seq}-F1A-N`, 'firewater', 'safety', 4, route, ringPoint ? hdr(RING) : { offDeck: 'Firewater ring' }, { offDeck: 'Deluge spray pipe (capped)' }, { sprayNozzles: true, design: { notes: `Deluge grid: ${zoneNote}` } })
    VA(`XV-${seq}`, 'ball', l, 0.16, { normally: 'closed', actuator: 'pistonSpring', failAction: 'FO', design: { notes: `Deluge valve, ${zoneNote}` } })
  }
  grid(9013, 'export compressor K-2200', [[-1.0, OVER_DECK, S], [-1.0, OVER_DECK, 4.95], [-1.0, 7.3, 4.95], [8.8, 7.3, 4.95]], true)
  grid(9014, 'produced water and degasser', [[-27.4, OVER_DECK, 5.0], [-26.2, OVER_DECK, 5.0], [-26.2, 6.3, 5.0], [-11.6, 6.3, 5.0]], true)
  grid(9015, 'crude cooler and export pumps', [[12.4, OVER_DECK, N], [12.4, OVER_DECK, -12.1], [12.4, 5.2, -12.1], [18.0, 5.2, -12.1]], true)
  grid(9016, 'TEG contactor and fuel gas', [[-10.6, OVER_DECK, S], [-10.6, OVER_DECK, 15.2], [-10.6, 7.4, 15.2], [-23.0, 7.4, 15.2]], true)

  // ================================================================ K-2200 lube oil console and cooler
  LIB('X-2260', 'K-2200 Lube Oil Console', 'gasCompression', 'hydraulic-power-unit', [13.0, 6.1], 0, {
    props: { reservoir: 800, pumps: 1, kw: 15, accumulators: 0, tag: 'X-2260' }, size: [4.6, 2.2, 2.1],
    design: { capacity: '180 L/min', notes: 'Main and auxiliary lube oil pumps, rundown tank, duplex filters' },
  })
  LIB('E-2210', 'K-2200 Lube Oil Cooler', 'gasCompression', 'plate-heat-exchanger', [13.0, 8.45], 0, {
    props: { nps: 2, plates: 60 }, size: [1.8, 2.3, 0.95],
    design: { capacity: '320 kW', material: 'Titanium plates', notes: 'Cooled by the cooling medium loop' },
  })
  const los = face('X-2260', 'supply')
  const lor = face('X-2260', 'return')
  const loIn = face('E-2210', 'hot-in')
  const loOut = face('E-2210', 'hot-out')
  const ls = L('1"-LO-2261-A1A-N', 'chemical', 'gasCompression', 0.75, [los, [los[0] + 0.5, los[1], los[2]], [los[0] + 0.5, 2.6, los[2]], [los[0] + 0.5, 2.6, loIn[2]], [loIn[0] - 0.8, 2.6, loIn[2]], [loIn[0] - 0.8, loIn[1], loIn[2]], loIn], to('X-2260', 'supply'), to('E-2210', 'hot-in'))
  const lb = L('2"-LO-2262-A1A-N', 'chemical', 'gasCompression', 2, [loOut, [9.5, loOut[1], loOut[2]]], to('E-2210', 'hot-out'), { offDeck: 'K-2200 bearing header (skid edge)' })
  L('2"-LO-2263-A1A-N', 'chemical', 'gasCompression', 1.5, [lor, [lor[0] + 0.35, lor[1], lor[2]], [lor[0] + 0.35, lor[1], 4.72], [9.5, lor[1], 4.72]], to('X-2260', 'return'), { offDeck: 'K-2200 drain header (skid edge)' })
  VA('TCV-2261', 'control', lb, 0.4, { actuator: 'diaphragm', failAction: 'FO', design: { notes: 'Lube oil temperature control' } })
  IL('TT-2261', 'TT', lb, 0.72, { range: '0–100', unit: '°C', nominal: 48 })
  IL('PT-2261', 'PT', ls, 0.8, { range: '0–6', unit: 'barg', nominal: 2.4 })
  const cmIn = face('E-2210', 'cold-in')
  const cmOut = face('E-2210', 'cold-out')
  const cmA = L('2"-CM-2214-A1A-N', 'cooling', 'gasCompression', 2, [[1.15, 9.1, 10.75], [1.15, 9.1, 9.15], [11.2, 9.1, 9.15], [11.2, 9.1, 7.7], [11.2, cmIn[1], 7.7], [11.2, cmIn[1], cmIn[2]], cmIn], hdr('6"-CM-2311-A1A-N'), to('E-2210', 'cold-in'))
  const cmB = L('2"-CM-2215-A1A-N', 'cooling', 'gasCompression', 2, [cmOut, [10.6, cmOut[1], cmOut[2]], [10.6, 8.8, cmOut[2]], [2.0, 8.8, cmOut[2]], [2.0, 8.8, 12.2], [1.15, 8.8, 12.2]], to('E-2210', 'cold-out'), hdr('6"-CM-2312-A1A-N'))
  VA('HV-2214', 'gate', cmA, 0.3, { actuator: 'handwheel' })
  VA('HV-2215', 'gate', cmB, 0.7, { actuator: 'handwheel' })

  // ================================================================ topsides hydraulic power unit
  LIB('X-1950', 'Topsides Hydraulic Power Unit', 'safety', 'hydraulic-power-unit', [-24.8, -5.9], 0, {
    props: { reservoir: 400, pumps: 1, kw: 7.5, accumulators: 2, tag: 'X-1950' }, size: [4.6, 2.2, 2.1],
    design: { pressure: '207 barg', notes: 'Hydraulic supply to the topsides ESD valve actuators' },
  })
  const hs = face('X-1950', 'supply')
  const hr = face('X-1950', 'return')
  const hyd = L('1"-HY-1951-A1A-N', 'chemical', 'safety', 0.75, [hs, [hs[0] + 0.5, hs[1], hs[2]], [hs[0] + 0.5, 3.0, hs[2]], [hs[0] + 0.5, 3.0, -7.0], [-5.0, 3.0, -7.0]], to('X-1950', 'supply'), { offDeck: 'ESD valve hydraulic ring' })
  L('2"-HY-1952-A1A-N', 'chemical', 'safety', 1.5, [[-5.0, 2.7, -6.8], [hr[0] + 0.85, 2.7, -6.8], [hr[0] + 0.85, hr[1], -6.8], [hr[0] + 0.85, hr[1], hr[2]], hr], { offDeck: 'ESD valve hydraulic ring' }, to('X-1950', 'return'))
  IL('PT-1951', 'PT', hyd, 0.15, { range: '0–300', unit: 'barg', nominal: 207, alarms: { lo: 150 } })

  // ================================================================ chemical totes beside C-1700
  ;[['TT-1701', 21.2, 'Demulsifier Tote', '#2d5fa8'], ['TT-1702', 19.2, 'Corrosion Inhibitor Tote', '#b3541e']].forEach(([tag, x, name, color]) => {
    const t = tag as string
    LIB(t, name as string, 'production', 'tote-tank', [x as number, -14.2], 0, { props: { color, liftingSet: false }, size: [1.6, 2.2, 1.6], design: { capacity: '1.5 m³', notes: 'Transfer tote feeding the C-1700 day tanks' } })
    const p = face(t, 'outlet')
    const l = L(`2"-CI-17${t.slice(-2)}-A1A-N`, 'chemical', 'production', 2, [p, [p[0], p[1], p[2] + 0.45], [23.6, p[1], p[2] + 0.45]], to(t, 'outlet'), { offDeck: 'C-1700 suction manifold' })
    VA(`HV-17${50 + Number(t.slice(-1))}`, 'ball', l, 0.12, { actuator: 'lever' })
  })

  // ================================================================ analyser shelter: gas and oil quality on the export lines
  LIB('AH-5480', 'Analyser Shelter', 'gasTreatment', 'analyser-shelter', [4.4, 15.8], 0, {
    props: { length: 2.6, width: 2.0, height: 2.7, panels: 2, bottles: 4, tag: 'AH-5480' }, size: [3.6, 4.1, 3.4],
    design: { notes: 'Gas chromatograph, water and H2S analysers on export gas, with sample conditioning and calibration bottles' },
  })

  const sg = L('1"-AS-5481-E9A-N', 'gas', 'gasTreatment', 0.75, [[-6.6, 8.2, 0.6], [-6.6, 8.2, 14.2], [2.2, 8.2, 14.2], [2.2, 1.6, 14.2], [2.2, 1.6, 15.2]], hdr('8"-PG-5302-E9A-N'), { offDeck: 'AH-5480 sample conditioning panel' })
  VA('HV-5481', 'needle', sg, 0.1)

  // ================================================================ cellar: diesel storage and transfer
  const c = CELLAR_FLOOR
  E('verticalVessel', 'T-9350', 'Diesel Storage Tank', 'utilities', [13.2, 2.6], 0, { id: 2.8, tt: 4.2, elevation: 0.7, support: 'legs', internals: 'mesh', platform: true, inletNps: 3, gasNps: 2, liquidNps: 3, psvNps: 2, rating: 150 }, {
    y: c, rename: { N1: 'Bunkering inlet', N2: 'Vent', N3: 'Outlet to transfer pumps' }, design: { capacity: '30 m³', notes: 'Bunkered from the supply vessel. Feeds the turbines on diesel, the firewater pump day tanks and the LQ' },
  })
  for (const [s, z] of [['A', 1.0], ['B', 3.4]] as const)
    E('pumpPackage', `P-9351${s}`, `Diesel Transfer Pump ${s}`, 'utilities', [7.6, z], 180, { suctionNps: 3, dischargeNps: 2, motorKw: 15, baseL: 2.2, baseW: 0.9, rating: 150 }, { y: c, design: { capacity: '12 m³/h' } })
  LIB('F-9352', 'Diesel Filter Coalescer', 'utilities', 'cartridge-filter', [3.8, 2.2], 0, { y: c, props: { diameter: 0.6, height: 1.6, inletNps: 2, outletNps: 2, pressure: 10, rating: 150 }, size: [1.1, 3.1, 1.1], design: { notes: 'Duty filter, water coalescing element' } })
  const tkOut = face('T-9350', 'N3')
  const sB = face('P-9351B', 'N1')
  const sA = face('P-9351A', 'N1')
  const xS = Math.max(sA[0], sB[0]) + 0.7
  const d1 = L('3"-DF-9352-A1A-N', 'chemical', 'utilities', 3, [tkOut, [tkOut[0], c + 0.32, tkOut[2]], [xS, c + 0.32, tkOut[2]], [xS, c + 0.32, sB[2]], [xS, sB[1], sB[2]], sB], to('T-9350', 'N3'), to('P-9351B', 'N1'))
  const d1b = L('3"-DF-9353-A1A-N', 'chemical', 'utilities', 3, [[xS, c + 0.32, tkOut[2]], [xS, c + 0.32, sA[2]], [xS, sA[1], sA[2]], sA], hdr(d1), to('P-9351A', 'N1'))
  const dA = face('P-9351A', 'N2')
  const dB = face('P-9351B', 'N2')
  const fIn = face('F-9352', 'inlet')
  const fOut = face('F-9352', 'outlet')
  const yD = c + 2.5
  const d2 = L('2"-DF-9354-A1A-N', 'chemical', 'utilities', 2, [dA, [dA[0], yD, dA[2]], [fIn[0] - 0.6, yD, dA[2]], [fIn[0] - 0.6, yD, fIn[2]], [fIn[0] - 0.6, fIn[1], fIn[2]], fIn], to('P-9351A', 'N2'), to('F-9352', 'inlet'))
  L('2"-DF-9355-A1A-N', 'chemical', 'utilities', 2, [dB, [dB[0], yD, dB[2]], [dB[0], yD, dA[2]]], to('P-9351B', 'N2'), hdr(d2))
  const d3 = L('2"-DF-9356-A1A-N', 'chemical', 'utilities', 2, [fOut, [fOut[0] + 0.6, fOut[1], fOut[2]], [fOut[0] + 0.6, 5.6, fOut[2]], [fOut[0] + 0.6, 5.6, -0.45], [fOut[0] + 0.6, 6.54, -0.45]], to('F-9352', 'outlet'), hdr('3"-DF-9901-A1A-N'))
  VA('HV-9352A', 'gate', d1, 0.92, { actuator: 'handwheel' })
  VA('HV-9352B', 'gate', d1b, 0.85, { actuator: 'handwheel' })
  VA('NRV-9354', 'check', d2, 0.12)
  VA('HV-9354', 'gate', d2, 0.86, { actuator: 'handwheel' })
  VA('HV-9356', 'gate', d3, 0.14, { actuator: 'handwheel' })
  IL('PT-9354', 'PT', d2, 0.5, { range: '0–10', unit: 'barg', nominal: 4.6 })
  const tkIn = face('T-9350', 'N1')
  const bunk = L('3"-DF-9357-A1A-N', 'chemical', 'utilities', 3, [[28.6, tkIn[1], tkIn[2]], tkIn], { offDeck: 'Bunkering station, east hose connection (blind flange)' }, to('T-9350', 'N1'))
  VA('HV-9357', 'ball', bunk, 0.3, { actuator: 'gear' })
  const tkV = face('T-9350', 'N2')
  L('2"-VA-9358-A1A-N', 'instrumentAir', 'utilities', 2, [tkV, [tkV[0], -2.2, tkV[2]], [29.5, -2.2, tkV[2]], [29.5, -3.4, tkV[2]]], to('T-9350', 'N2'), { offDeck: 'Atmosphere (gooseneck over the east side)' })

  // ================================================================ cellar: open drains
  E('horizontalVessel', 'V-4450', 'Open Drain Tank', 'drains', [-6.6, 3.0], 0, { service: 'ko', id: 1.5, tt: 4.0, elevation: 0.7, inletNps: 4, gasNps: 2, liquidNps: 3, psvNps: 2, rating: 150 }, {
    y: c, rename: { N1: 'Deck drain header', N2: 'Vent', N3: 'To open drain pumps' }, design: { pressure: 'Atmospheric', capacity: '6 m³', notes: 'Rain and wash-down from the deck drain hubs, skimmed before the caisson' },
  })
  for (const [s, x] of [['A', -9.2], ['B', -3.2]] as const)
    E('pumpPackage', `P-4550${s}`, `Open Drain Pump ${s}`, 'drains', [x, 6.6], 0, { suctionNps: 3, dischargeNps: 2, motorKw: 7.5, baseL: 2.0, baseW: 0.8, rating: 150 }, { y: c, design: { capacity: '20 m³/h' } })
  const odIn = face('V-4450', 'N1')
  const OD = '4"-OD-4451-B1A-N'
  const yH = -1.7
  L(OD, 'drain', 'drains', 4, [[-21.0, yH, -5.5], [odIn[0] - 0.8, yH, -5.5], [odIn[0] - 0.8, yH, odIn[2]], [odIn[0] - 0.8, odIn[1], odIn[2]], odIn], { offDeck: 'Header end (rodding point)' }, to('V-4450', 'N1'))
  const hubs: [string, number, number][] = [['DH-4451', -19.5, -5.5], ['DH-4452', -15.6, -5.5], ['DH-4453', -13.0, -5.5]]
  hubs.forEach(([tag, x, z], i) => {
    LIB(tag, `Deck Drain Hub ${i + 1}`, 'drains', 'drain-hub', [x, z], 0, { props: { kind: 'hub', nps: 3, depth: 0.45 }, size: [0.45, 0.2, 0.45], design: { notes: 'Collects rain and wash-down from the plated deck' } })
    const p = face(tag, 'drain')
    L(`3"-OD-44${54 + i}-B1A-N`, 'drain', 'drains', 3, [p, [p[0], yH, p[2]]], to(tag, 'drain'), hdr(OD))
  })
  const odOut = face('V-4450', 'N3')
  const sa = face('P-4550A', 'N1')
  const sb = face('P-4550B', 'N1')
  const o1 = L('3"-OD-4457-B1A-N', 'drain', 'drains', 3, [odOut, [odOut[0], c + 0.32, odOut[2]], [odOut[0], c + 0.32, sb[2] - 0.9], [sb[0] + 0.7, c + 0.32, sb[2] - 0.9], [sb[0] + 0.7, c + 0.32, sb[2]], [sb[0] + 0.7, sb[1], sb[2]], sb], to('V-4450', 'N3'), to('P-4550B', 'N1'))
  const o2 = L('3"-OD-4458-B1A-N', 'drain', 'drains', 3, [[sa[0] + 0.7, c + 0.32, sb[2] - 0.9], [sa[0] + 0.7, c + 0.32, sa[2]], [sa[0] + 0.7, sa[1], sa[2]], sa], hdr(o1), to('P-4550A', 'N1'))
  const pa = face('P-4550A', 'N2')
  const pb = face('P-4550B', 'N2')
  const yO = c + 2.3
  const o3 = L('2"-OD-4459-B1A-N', 'drain', 'drains', 2, [pb, [pb[0], yO, pb[2]], [-14.6, yO, pb[2]], [-14.6, yO, 11.0]], to('P-4550B', 'N2'), { offDeck: 'Open drain caisson (cellar deck)' })
  L('2"-OD-4460-B1A-N', 'drain', 'drains', 2, [pa, [pa[0], yO, pa[2]]], to('P-4550A', 'N2'), hdr(o3))
  VA('HV-4457', 'gate', o1, 0.86, { actuator: 'handwheel' })
  VA('HV-4458', 'gate', o2, 0.7, { actuator: 'handwheel' })
  VA('NRV-4459', 'check', o3, 0.2)
  const ov = face('V-4450', 'N2')
  L('2"-VA-4461-A1A-N', 'instrumentAir', 'drains', 2, [ov, [ov[0], -2.9, ov[2]], [ov[0], -2.9, 4.5], [-29.5, -2.9, 4.5], [-29.5, -4.0, 4.5]], to('V-4450', 'N2'), { offDeck: 'Atmosphere (gooseneck over the west side)' })
  IL('PG-4459', 'PG', o3, 0.08, { range: '0–10', unit: 'barg', nominal: 3.4 })

  // ================================================================ cellar: in-field pig receiver on the WHP-N inlet
  E('pigTrap', 'L-1010', 'In-field Pig Receiver', 'wells', [17.6, -14.0], 180, { majorBarrelNps: 12, minorBarrelNps: 10, length: 5.0, elevation: 1.0, rating: 600, kickerNps: 6 }, {
    y: c, rename: { N1: 'Inlet from the WHP-N line', N2: 'Bypass to the inlet header' }, design: { pressure: '50 barg', notes: 'Receives cleaning pigs from the 10" WHP-N flowline. Quick-opening closure with pressure-warning interlock' },
  })
  const pgIn = face('L-1010', 'N1')
  const pgBy = face('L-1010', 'N2')
  const WN = '10"-PM-N2002-D6A-N'
  const rx = L('10"-PM-1011-D6A-N', 'multiphase', 'wells', 10, [[9.6, -5.7, -19.4], [9.6, -5.7, -18.6], [13.4, -5.7, -18.6], [13.4, pgIn[1], -18.6], [13.4, pgIn[1], pgIn[2]], pgIn], hdr(WN), to('L-1010', 'N1'))
  const by = L('6"-PM-1012-D6A-N', 'multiphase', 'wells', 6, [pgBy, [pgBy[0], pgBy[1], pgBy[2] + 1.0], [pgBy[0], -3.6, pgBy[2] + 1.0], [pgBy[0], -3.6, -19.0], [9.6, -3.6, -19.0], [9.6, -3.6, -19.4]], to('L-1010', 'N2'), hdr(WN))
  VA('ESDV-1011', 'esdv', rx, 0.5, { actuator: 'pistonSpring', failAction: 'FC', up: [1, 0, 0], design: { notes: 'Pig receiver isolation' } })
  VA('HV-1011', 'gate', rx, 0.2, { actuator: 'gear' })
  VA('HV-1012', 'gate', by, 0.3, { actuator: 'gear' })
  IL('PG-1011', 'PG', rx, 0.8, { range: '0–100', unit: 'barg', nominal: 42 })

  // ================================================================ cellar: nitrogen generator on service air
  LIB('X-8350', 'Nitrogen Generator', 'utilities', 'nitrogen-generator', [18.6, -2.2], 0, { y: c, props: { modules: 3, tag: 'X-8350' }, size: [6.8, 3.1, 1.9], design: { capacity: '150 Nm³/h, 98 %', notes: 'Membrane package. Feeds the nitrogen header for purging and blanketing' } })
  E('verticalVessel', 'V-8360', 'Nitrogen Buffer Receiver', 'utilities', [20.6, 1.4], 0, { id: 0.9, tt: 2.0, elevation: 0.6, support: 'legs', internals: 'mesh', platform: false, inletNps: 2, gasNps: 2, liquidNps: 1, psvNps: 2, rating: 150 }, {
    y: c, rename: { N1: 'Nitrogen inlet', N2: 'Nitrogen outlet', N3: 'Drain' }, design: { capacity: '1.5 m³', pressure: '11 barg' },
  })
  const nAir = face('X-8350', 'air-in')
  const nOut = face('X-8350', 'n2-out')
  const nVent = face('X-8350', 'vent')
  const bIn = face('V-8360', 'N1')
  const bOut = face('V-8360', 'N2')
  const a1 = L('2"-SA-8351-A1A-N', 'instrumentAir', 'utilities', 2, [[ro[0], 4.4, ro[2]], [27.5, 4.4, ro[2]], [27.5, -5.0, ro[2]], [27.5, -5.0, -3.9], [nAir[0] - 0.6, -5.0, -3.9], [nAir[0] - 0.6, -5.0, nAir[2]], [nAir[0] - 0.6, nAir[1], nAir[2]], nAir], hdr(sa2), to('X-8350', 'air-in'))
  const n1 = L('2"-NG-8352-A1A-N', 'instrumentAir', 'utilities', 1.5, [nOut, [nOut[0] + 0.35, nOut[1], nOut[2]], [nOut[0] + 0.35, nOut[1], 2.8], [bIn[0] - 0.6, nOut[1], 2.8], [bIn[0] - 0.6, nOut[1], bIn[2]], [bIn[0] - 0.6, bIn[1], bIn[2]], bIn], to('X-8350', 'n2-out'), to('V-8360', 'N1'))
  const n2 = L('2"-NG-8353-A1A-N', 'instrumentAir', 'utilities', 2, [bOut, [bOut[0], -1.4, bOut[2]], [27.2, -1.4, bOut[2]], [27.2, 5.2, bOut[2]], [27.2, 5.2, -0.3], [24.6, 5.2, -0.3]], to('V-8360', 'N2'), hdr(NG))
  L('2"-VA-8354-A1A-N', 'instrumentAir', 'utilities', 2, [nVent, [nVent[0], -2.6, nVent[2]], [29.5, -2.6, nVent[2]], [29.5, -3.6, nVent[2]]], to('X-8350', 'vent'), { offDeck: 'Atmosphere (gooseneck over the east side)' })
  VA('HV-8351', 'ball', a1, 0.8, { actuator: 'lever' })
  VA('NRV-8352', 'check', n1, 0.5)
  VA('HV-8353', 'ball', n2, 0.16, { actuator: 'lever' })
  IL('AT-8352', 'AT', n1, 0.3, { range: '0–5', unit: '% O2', nominal: 1.6, alarms: { hi: 3 } })

  // ================================================================ cellar: scale inhibitor to the wellheads
  E('chemSkid', 'C-1800', 'Scale Inhibitor Package', 'wells', [-24.6, 6.8], 90, { skidL: 3.2, skidW: 2.2, tanks: 2, outlets: 1 }, { y: c, rename: { N1: 'Scale inhibitor to the wellheads' }, design: { capacity: '2 m³', pressure: '345 barg discharge', notes: 'Skid with metering pumps, injects at the wellheads' } })
  const si = face('C-1800', 'N1')
  const scale = L('1"-CI-1801-E9A-N', 'chemical', 'wells', 0.75, [si, [si[0], -3.5, si[2]], [-5.6, -3.5, si[2]], [-5.6, -3.5, -6.6], [-5.6, -6.0, -6.6]], to('C-1800', 'N1'), { offDeck: 'Wellhead chemical injection manifold' })
  VA('XV-1801', 'needle', scale, 0.2)

  // ================================================================ weather deck: electrical house
  LIB('B-9120', 'Utility Electrical House', 'utilities', 'e-house', [-8.2, 2.9], 0, { y: 10, props: { length: 8, width: 4.4, height: 3.6, label: 'UTILITY SWITCHROOM', interior: false, tag: 'B-9120' }, size: [9.2, 4.8, 6], design: { notes: 'Motor control and UPS for the plant air, fresh water and diesel transfer systems' } })

  // ================================================================ control valve stations: block valves and a globe bypass
  const reduced = (nps: number) => (nps >= 8 ? 6 : nps >= 6 ? 4 : nps >= 4 ? 3 : 2)
  for (const v of [...A.valves]) {
    if (v.type !== 'control' || BYPASS_SKIP.has(v.tag)) continue
    const l = lineBy.get(v.line)
    if (!l || l.nps < 3 || v.seg < 0) continue
    const a = l.route[v.seg]
    const b = l.route[v.seg + 1]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    if (len < 3.4 || Math.abs(a[1] - b[1]) > 1e-3) continue
    const d: Vec3 = [(b[0] - a[0]) / len, 0, (b[2] - a[2]) / len]
    const at = len * v.t
    const room = 1.1 + l.nps * 0.05
    if (at < room + 0.5 || len - at < room + 0.5) continue
    const off = 0.55 + l.nps * 0.05
    const side: Vec3 = [-d[2], 0, d[0]]
    const pt = (s: number, o: number): Vec3 => [a[0] + d[0] * (at + s) + side[0] * o, a[1], a[2] + d[2] * (at + s) + side[2] * o]
    const nps = reduced(l.nps)
    const parts = l.tag.split('-')
    const tag = `${nps}"-${parts[1]}-${parts[2]}B-${parts[3]}-N`
    const by = L(tag, l.service, l.system, nps, [pt(-room, 0), pt(-room, off), pt(room, off), pt(room, 0)], hdr(l.tag), hdr(l.tag), { spec: l.spec })
    const num = v.tag.split('-')[1]
    VA(`HV-${num}BP`, 'globe', by, 0.5, { actuator: 'handwheel', normally: 'closed', design: { notes: `${v.tag} bypass` } })
  }
}

/** LV-1101 has its own block and bypass station in model/plant.ts; a PDV-4101 bypass would land in the escape aisle */
const BYPASS_SKIP = new Set<string>(['LV-1101', 'PDV-4101'])
