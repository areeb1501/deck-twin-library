/**
 * WHP-N — normally-unattended wellhead platform 40 m north of Alpha, linked by the north bridge
 * (layout: model/site.ts WHP, BRIDGE_N; environment: scene/env/whp*.ts).
 *
 *  Wells (wellhead deck, EL +28)  2 x 3 well bay: five producers + one water injector on conductors.
 *                                 Each producer: 4" flowline (XV + choke on the drop) under the deck
 *                                 into a slot riser of the M-N200 production / test manifold.
 *  Production                     M-N200 production header → V-N230 wellhead desander → 10" export
 *                                 across the bridge pipe lane (ESDV at the bridge) → Alpha inlet header
 *  Well test                      M-N200 test header → M-N210 test manifold → V-N240 multiphase flow
 *                                 meter → back into the export line
 *  Water injection                4" WI line from Alpha's injection pumps across the bridge → XT-N106
 *  Chemicals                      C-N260 scale / corrosion inhibitor package → kill wings of two trees
 *  Utilities                      instrument air across the bridge → V-N281 receiver; nitrogen rack;
 *                                 X-N270 wellhead hydraulic control panel
 *  Relief                         PSVs on every vessel → vent header → V-N290 vent KO drum → 6" vent
 *                                 across the bridge to Alpha's flare header
 *  Safety                         B-N295 temporary refuge / local control room; firewater from Alpha's
 *                                 ring → deluge valve → spray pipes over the well bay; flame, point gas,
 *                                 open-path gas, smoke detectors and manual call points
 *
 * Tags use the "N" area prefix (XT-N101, 4"-PM-N1011-E9A-H, FD-N801 …) so nothing collides with Alpha.
 * Deck-local coordinates; built with the component library like model/alphaSite.ts.
 */
import type { Equipment, EquipmentKind, Instrument, InstrumentType, Module, ModuleDoor, Nozzle, PipeLine, Service, SystemId, Valve, ValveType, Vec3 } from './types'
import { componentDef, instantiate, resolveParams } from '../library/components'
import type { NozzleTemplate, Params } from '../library/types'
import { valveClear, INSTRUMENT_DEFAULTS } from '../library/compile'
import { elbowRadius, flange, GASKET, pipeOD, valveLength } from './catalog'
import { psvGeometry } from '../scene/equipment/Valve'
import { BRIDGE_N, WHP } from './site'

export interface WhpArrays {
  equipment: Equipment[]
  lines: PipeLine[]
  valves: Valve[]
  instruments: Instrument[]
}

export interface WhpConsts {
  /** Alpha flare header tag (the WHP vent line ends at Alpha, routed via the cellar into it) */
  flareHeader: string
  /** Alpha firewater ring main tag (the WHP firewater supply is fed from it) */
  firewaterRing: string
  /** Alpha cellar deck plate (deck-local y) — bridge lines leave / join Alpha's systems there */
  CELLAR: number
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const P = (...v: number[]) => v.map(r3) as Vec3

export function extendWHP(A: WhpArrays, K: WhpConsts) {
  const eqBy = new Map<string, Equipment>()
  const lineBy = new Map<string, PipeLine>()
  for (const e of A.equipment) eqBy.set(e.tag, e)
  for (const l of A.lines) lineBy.set(l.tag, l)

  // ---------------------------------------------------------------- helpers (as model/alphaSite.ts)
  function E(
    kind: EquipmentKind, tag: string, name: string, system: SystemId, at: [number, number], rotDeg: number, params: Params,
    o: { y?: number; rename?: Record<string, string>; extra?: NozzleTemplate[]; design?: Equipment['design'] } = {},
  ) {
    const p = resolveParams(kind, params)
    const nz = componentDef(kind).nozzles(p).map((t) => ({ ...t, name: o.rename?.[t.id] ?? t.name }))
    const eq = instantiate(kind, { tag, name, system, at, rotationY: (rotDeg * Math.PI) / 180, params, y: o.y, nozzles: [...nz, ...(o.extra ?? [])], design: o.design })
    A.equipment.push(eq)
    eqBy.set(tag, eq)
    return eq
  }
  const N = (tag: string, id: string): Nozzle => {
    const n = eqBy.get(tag)?.nozzles.find((x) => x.id === id)
    if (!n) throw new Error(`whpSite: nozzle ${tag}/${id} missing`)
    return n
  }
  const face = (tag: string, id: string) => N(tag, id).pos
  function L(tag: string, service: Service, system: SystemId, nps: number, spec: string, route: Vec3[], from: PipeLine['from'], to: PipeLine['to'], o: Partial<PipeLine> = {}) {
    const l: PipeLine = { tag, service, system, nps, schedule: nps >= 10 ? 'XS' : '80', spec, route: route.map((v) => P(...v)), from, to, design: {}, ...o }
    A.lines.push(l)
    lineBy.set(tag, l)
    return tag
  }
  const eqEnd = (tag: string, nozzle: string) => ({ equipment: tag, nozzle })
  const segLen = (l: PipeLine, i: number) => Math.hypot(...([0, 1, 2].map((k) => l.route[i + 1][k] - l.route[i][k]) as [number, number, number]))
  const rating = (spec: string) => (spec.startsWith('E') ? 900 : spec.startsWith('D') ? 600 : spec.startsWith('C') ? 300 : 150) as 150 | 300 | 600 | 900
  /** occupied intervals per line segment, to keep valves from overlapping */
  const taken = new Map<string, [number, number, string][]>()
  /** valve at an explicit distance `d` (m) from the start of segment `seg` */
  function VS(tag: string, type: ValveType, line: string, seg: number, d: number, o: Partial<Valve> = {}) {
    const l = lineBy.get(line)!
    const len = segLen(l, seg)
    const clear = valveClear(type, l.nps, l.spec)
    if (d < clear - 0.13 || d > len - clear + 0.13) console.warn(`[whpSite] ${tag} too close to a bend on ${line} seg ${seg} (d ${d.toFixed(2)} of ${len.toFixed(2)})`)
    const occ = valveLength(type, l.nps) / 2 + GASKET + flange(l.nps, rating(l.spec)).length
    const key = `${line}#${seg}`
    const list = taken.get(key) ?? []
    for (const [a, b, t] of list) if (d - occ < b && d + occ > a) console.warn(`[whpSite] ${tag} overlaps ${t} on ${line}`)
    list.push([d - occ, d + occ, tag])
    taken.set(key, list)
    A.valves.push({ tag, type, line, seg, t: r3(d / len), normally: 'open', design: {}, ...o })
  }
  const ALARMS: Partial<Record<InstrumentType, Instrument['alarms']>> = {
    GD: { hi: 20, hiHi: 60 }, OGD: { hi: 1, hiHi: 3 }, FD: { hi: 30, hiHi: 60 }, HD: { hi: 68, hiHi: 90 }, SD: { hi: 2, hiHi: 5 }, MAC: { hi: 12 },
  }
  /** in-line instrument at distance `d` along segment `seg` */
  function IS(tag: string, type: InstrumentType, line: string, seg: number, d: number, o: Partial<Instrument> = {}) {
    const l = lineBy.get(line)!
    const len = segLen(l, seg)
    const key = `${line}#${seg}`
    for (const [a, b, t] of taken.get(key) ?? []) if (d > a - 0.12 && d < b + 0.12) console.warn(`[whpSite] ${tag} sits on valve ${t} (${line})`)
    if (d < elbowRadius(l.nps) + 0.1 || d > len - elbowRadius(l.nps) - 0.1) console.warn(`[whpSite] ${tag} too close to a bend on ${line} seg ${seg}`)
    const dd = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { line, seg, t: r3(d / len) }, dir: [0, 1, 0], range: dd.range, unit: dd.unit, nominal: dd.nominal, alarms: ALARMS[type], ...o })
  }
  function IE(tag: string, type: InstrumentType, equipment: string, at: Vec3, dir: Vec3, o: Partial<Instrument> = {}) {
    const d = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { equipment, at: P(...at) }, dir, range: d.range, unit: d.unit, nominal: d.nominal, alarms: ALARMS[type], ...o })
  }
  function LTon(tag: string, eqTag: string, nominal: number, o: Partial<Instrument> = {}) {
    const e = eqBy.get(eqTag)!
    if (e.kind === 'horizontalVessel') {
      const ro = e.id / 2 + e.wall
      IE(tag, 'LT', eqTag, [e.position[0] + e.tt * 0.12, e.position[1] - 0.15, e.position[2] + ro + 0.1], [0, 0, 1], { range: '0–100', unit: '%', nominal, alarms: { lo: 20, hi: 80, loLo: 10, hiHi: 90 }, ...o })
    } else if (e.kind === 'verticalVessel') {
      const ro = e.id / 2 + e.wall
      IE(tag, 'LT', eqTag, [e.position[0], e.elevation + 0.9, e.position[2] + ro + 0.1], [0, 0, 1], { range: '0–100', unit: '%', nominal, alarms: { hi: 40, hiHi: 60 }, ...o })
    }
  }
  /**
   * PSV on a vessel nozzle discharging into the WHP vent system. The tail runs `run` m along outDir,
   * then follows `path` (points after the tail) to its end `to` (normally a tee into the vent header).
   */
  function PSV(tag: string, eqTag: string, nz: string, outDir: Vec3, seq: string, set: string, run: number, path: (p1: Vec3) => Vec3[], to: PipeLine['to'], o: { atmosphere?: boolean } = {}) {
    const n = N(eqTag, nz)
    const g = psvGeometry(n.nps)
    const pos: Vec3 = [n.pos[0] + n.dir[0] * (g.outletY + GASKET) + outDir[0] * g.outletX, n.pos[1] + n.dir[1] * (g.outletY + GASKET), n.pos[2] + n.dir[2] * (g.outletY + GASKET) + outDir[2] * g.outletX]
    const p1: Vec3 = [pos[0] + outDir[0] * run, pos[1], pos[2] + outDir[2] * run]
    const line = o.atmosphere
      ? L(`${g.outletNps}"-VA-${seq}-A1A-N`, 'instrumentAir', eqBy.get(eqTag)!.system, g.outletNps, 'A1A', [pos, p1, ...path(p1)], { offDeck: `${tag} outlet` }, to)
      : L(`${g.outletNps}"-VF-${seq}-B1A-N`, 'flare', 'flare', g.outletNps, 'B1A', [pos, p1, ...path(p1)], { offDeck: `${tag} outlet` }, to)
    A.valves.push({ tag, type: 'psv', line, seg: -1, t: 0, mount: { equipment: eqTag, nozzle: nz }, outletDir: outDir, normally: 'closed', design: { notes: `Set ${set}` } })
    return line
  }

  const [LX_IA, LX_EXP, LX_WI, LX_FW, LX_VENT] = BRIDGE_N.pipeLane.x
  const LY = BRIDGE_N.pipeLane.y
  /** bridge drop points: just onto the bridge from the WHP south edge / Alpha north edge */
  const ZW = WHP.deck.z1 + BRIDGE_N.dropInset // -59.6
  const ZA = BRIDGE_N.walk.z1 - BRIDGE_N.dropInset // -20.4
  /** at Alpha the lines drop off the lane to YU, step in under the deck edge to ZA2 and run down to the cellar */
  const YU = -1.6
  const ZA2 = BRIDGE_N.walk.z1 + 0.6 // -19.4, inside Alpha's footprint, clear of the cellar accumulator (z > -19)
  const fromAlpha = (x: number): Vec3[] => [[x, K.CELLAR, ZA2], [x, YU, ZA2], [x, YU, ZA], [x, LY, ZA]]
  const toAlpha = (x: number): Vec3[] => [[x, LY, ZA], [x, YU, ZA], [x, YU, ZA2], [x, K.CELLAR, ZA2]]
  const UP_S: Vec3 = [0, 0, 1] // stems on vertical drops face south (the aisle between tree rows)

  // ================================================================ WELLS
  const WELLS = [
    { type: 'oilProducer', name: 'N-01' },
    { type: 'gasProducer', name: 'N-02' },
    { type: 'oilProducer', name: 'N-03' },
    { type: 'oilProducer', name: 'N-04' },
    { type: 'oilProducer', name: 'N-05' },
    { type: 'waterInjector', name: 'N-06' },
  ] as const
  const WH_H = 1.3 // wellhead spool stack: production wing at y = 2.55
  WHP.wells.forEach(([x, z], i) => {
    const w = WELLS[i]
    E('xmasTree', `XT-N10${i + 1}`, `Well ${w.name} Wellhead & Tree`, 'wells', [x, z], 0, { wellType: w.type, wellheadHeight: WH_H }, {
      design: {
        pressure: '345 barg (5000 psi) API 6A',
        material: 'AISI 4130 / Inconel-clad',
        notes: w.type === 'waterInjector' ? 'Water injector, 30" conductor, injection from Alpha across the north bridge' : `${w.type === 'gasProducer' ? 'Gas' : 'Oil'} producer, 30" conductor, SCSSV at 280 m, gas-lift ready`,
      },
    })
  })

  // production / test manifold (one riser per slot), test manifold, desander, multiphase meter
  E('manifold', 'M-N200', 'Production Manifold (production + test headers)', 'wells', [17.3, -73.5], 0, { slots: 6, length: 4.2, rating: 900, prodNps: 10, testNps: 6 }, {
    rename: { N1: 'Production header outlet', N2: 'Test header outlet' },
    design: { pressure: '345 barg', notes: 'Six well slots (five producers + spare), each with a valve onto the production and test headers' },
  })
  E('manifold', 'M-N210', 'Test Manifold', 'wells', [17.3, -79.5], 0, { slots: 2, length: 2.4, rating: 900, prodNps: 6, testNps: 0 }, {
    rename: { N1: 'Test outlet to MPFM' },
    design: { pressure: '345 barg', notes: 'Slot 1: test header from M-N200; slot 2: clean-up / flowback (spare)' },
  })
  E('verticalVessel', 'V-N230', 'Wellhead Desander', 'wells', [17.8, -67], 180, { id: 1.0, tt: 2.4, elevation: 0.8, support: 'legs', internals: 'cyclone', platform: false, inletNps: 10, gasNps: 10, liquidNps: 3, psvNps: 2, rating: 600 }, {
    rename: { N1: 'Production inlet', N2: 'Desanded fluid outlet', N3: 'Sand dump', N4: 'PSV connection' },
    design: { pressure: '99 barg', capacity: '25 000 bbl/d liquids', notes: 'Cyclonic wellhead desander, 98 % removal of 50 µm sand, sand accumulator flushed to the cellar' },
  })
  E('verticalVessel', 'V-N240', 'Multiphase Flow Meter Skid (MPFM)', 'wells', [21.0, -79.5], 0, { id: 0.6, tt: 2.0, elevation: 0.8, support: 'legs', internals: 'mesh', platform: false, inletNps: 6, gasNps: 6, liquidNps: 2, psvNps: 2, rating: 600 }, {
    rename: { N1: 'Test fluid inlet', N2: 'Metered outlet', N3: 'Drain', N4: 'PSV connection' },
    design: { capacity: '0–8 000 bbl/d, GVF 0–98 %', notes: 'Venturi + dual-energy gamma, in-line well testing without a test separator' },
  })

  // manifold slot geometry (as model/alphaSite.ts / the Manifold renderer)
  const slotX = (tag: string, i: number) => {
    const m = eqBy.get(tag)!
    if (m.kind !== 'manifold') throw new Error('whpSite: manifold expected')
    return m.position[0] - m.length / 2 + (m.length * (i + 0.5)) / m.slots
  }
  const riserZ = (tag: string) => {
    const m = eqBy.get(tag)!
    if (m.kind !== 'manifold') throw new Error('whpSite: manifold expected')
    return m.position[2] + Math.max(...m.headers.map((h) => h.z), 0) + Math.max(...m.headers.map((h) => pipeOD(h.nps))) / 2 + 0.55
  }
  const RZ = riserZ('M-N200')

  // producer flowlines: wing → drop beside the tree (XV + choke above the deck) → under the deck → riser.
  // Slot k runs at y = -3.0 - 0.4k: western slots run higher, and wells further from the riser line run
  // lower, so no drop or riser crosses another flowline.
  for (let i = 0; i < 5; i++) {
    const [x, z] = WHP.wells[i]
    const tag = `XT-N10${i + 1}`
    const k = i
    const f = face(tag, 'N1')
    const lane = x + 1.6
    const y = -3.0 - 0.4 * k
    const rx = slotX('M-N200', k)
    const seq = `N1${i + 1}1`
    const gas = WELLS[i].type === 'gasProducer'
    const fl = L(`4"-PM-${seq}-E9A-H`, 'multiphase', 'wells', 4, 'E9A', [f, [lane, f[1], z], [lane, y, z], [lane, y, RZ], [rx, y, RZ], [rx, -2.5, RZ]], eqEnd(tag, 'N1'), { offDeck: `M-N200 slot ${k + 1} riser` }, {
      insulation: 'H', design: { pressure: '345 barg', notes: `Flowline ${WELLS[i].name}, 22Cr duplex, heat-traced` },
    })
    const drop = f[1] - y
    VS(`XV-N1${i + 1}1`, 'ball', fl, 1, 0.62, { actuator: 'pistonSpring', failAction: 'FC', up: UP_S, design: { notes: 'Flowline wing isolation (ESD)' } })
    VS(`HCV-N1${i + 1}2`, 'control', fl, 1, 1.75, { actuator: 'electric', failAction: 'FL', up: UP_S, design: { notes: 'Production choke, stepping actuator' } })
    VS(`NRV-N1${i + 1}3`, 'check', fl, 3, 0.9)
    void drop
    const run = segLen(lineBy.get(fl)!, 3)
    IS(`PT-N1${i + 1}1`, 'PT', fl, 3, run - 1.2, { unit: 'barg', range: '0–250', nominal: gas ? 88 : 44, alarms: { hi: 120, hiHi: 160 } })
    IS(`TT-N1${i + 1}1`, 'TT', fl, 3, run - 0.7, { unit: '°C', range: '0–150', nominal: gas ? 61 : 72 })
    IS(`AT-N1${i + 1}4`, 'AT', fl, 3, 2.0, { range: '0–10', unit: 'g/s sand', nominal: 0.3, alarms: { hi: 2, hiHi: 5 } })
  }

  // water injection: Alpha WI pumps → bridge → under the deck → injector wing (flow into the well)
  {
    const tag = 'XT-N106'
    const [x, z] = WHP.wells[5]
    const f = face(tag, 'N1')
    const lane = x + 1.6
    const wi = L('4"-WI-N1611-E9A-N', 'water', 'wells', 4, 'E9A', [...fromAlpha(LX_WI), [LX_WI, LY, ZW], [LX_WI, -1.6, ZW], [LX_WI, -1.6, z], [lane, -1.6, z], [lane, f[1], z], f], { offDeck: 'From Alpha water injection pumps' }, eqEnd(tag, 'N1'), {
      design: { pressure: '230 barg', notes: 'Treated seawater, 6 000 bbl/d to well N-06' },
    })
    const l = lineBy.get(wi)!
    VS('HV-N1611', 'gate', wi, 3, 1.4, { actuator: 'handwheel', design: { notes: 'Bridge isolation, Alpha end' } })
    IS('FT-N1611', 'FT', wi, 3, 6.0, { range: '0–60', unit: 'm³/h', nominal: 39 })
    VS('NRV-N1613', 'check', wi, 5, 2.2)
    IS('PT-N1612', 'PT', wi, 5, 4.0, { range: '0–300', unit: 'barg', nominal: 214, alarms: { hi: 240, hiHi: 255 } })
    const v5 = segLen(l, 7)
    VS('XV-N1611', 'ball', wi, 7, v5 - 0.62, { actuator: 'pistonSpring', failAction: 'FC', up: UP_S, design: { notes: 'Injection wing isolation (ESD)' } })
    VS('FCV-N1612', 'control', wi, 7, v5 - 1.75, { actuator: 'electric', failAction: 'FL', up: UP_S, design: { notes: 'Injection choke, flow control' } })
  }

  // ================================================================ CHEMICAL INJECTION → kill wings
  E('chemSkid', 'C-N260', 'Chemical Injection Package (scale + corrosion inhibitor)', 'wells', [2.5, -82], 180, { skidL: 3.2, skidW: 2.2, tanks: 2, outlets: 2 }, {
    rename: { N1: 'Scale inhibitor to XT-N105', N2: 'Corrosion inhibitor to XT-N103' },
    design: { capacity: '2 × 2 m³', pressure: '345 barg discharge', notes: 'Pneumatic metering pumps (instrument air), downhole + wellhead injection' },
  })
  ;[['N1', 'XT-N105', 0.2, -1.4], ['N2', 'XT-N103', -0.2, -1.7]].forEach(([nz, t, cx, cy], i) => {
    const a = face('C-N260', nz as string)
    const k = face(t as string, 'N2')
    const xr = k[0] - 0.55
    const l = L(`1"-CI-N260${i + 1}-E9A-N`, 'chemical', 'wells', 1, 'E9A', [a, [cx as number, a[1], a[2]], [cx as number, cy as number, a[2]], [cx as number, cy as number, k[2]], [xr, cy as number, k[2]], [xr, k[1], k[2]], k], eqEnd('C-N260', nz as string), eqEnd(t as string, 'N2'))
    const s4 = segLen(lineBy.get(l)!, 4)
    VS(`XV-N260${i + 1}`, 'needle', l, 4, s4 - 0.55, { up: [-1, 0, 0] })
    VS(`NRV-N260${i + 1}`, 'check', l, 4, s4 - 1.45)
  })

  // ================================================================ WELLHEAD CONTROL, AIR + NITROGEN
  E('chemSkid', 'X-N270', 'Wellhead Hydraulic Control Panel (WHCP)', 'wells', [7.0, -82], 0, { skidL: 4, skidW: 2.5, tanks: 2, outlets: 0 }, {
    design: { notes: 'Air-driven 345 / 690 barg pumps for SSV + SCSSV, ESD / fusible-plug loops, solar-backed RTU' },
  })
  E('verticalVessel', 'V-N281', 'Instrument Air Receiver', 'utilities', [15.4, -63.5], 0, { id: 0.8, tt: 2.0, elevation: 0.6, support: 'legs', internals: 'mesh', platform: false, inletNps: 2, gasNps: 2, liquidNps: 1, psvNps: 1, rating: 300 }, {
    rename: { N1: 'Air inlet (from Alpha)', N2: 'Air outlet', N3: 'Condensate drain' },
    design: { pressure: '10 barg', capacity: '1.5 m³, 30 min hold-up for the ESD valves' },
  })
  E('chemSkid', 'X-N282', 'Nitrogen Bottle Rack (purge / leak test)', 'utilities', [18.6, -62.6], 0, { skidL: 2.4, skidW: 1.6, tanks: 4, outlets: 0 }, {
    design: { capacity: '4 × 50 L quads, 300 bar', notes: 'Purging, well kick-off and leak testing' },
  })
  {
    const n1 = face('V-N281', 'N1')
    const ia = L('2"-IA-N2801-A1A-N', 'instrumentAir', 'utilities', 2, 'A1A', [...fromAlpha(LX_IA), [LX_IA, LY, ZW], [LX_IA, -1.0, ZW], [LX_IA, -1.0, n1[2]], [14.0, -1.0, n1[2]], [14.0, n1[1], n1[2]], n1], { offDeck: 'From Alpha instrument air header' }, eqEnd('V-N281', 'N1'))
    VS('HV-N2801', 'ball', ia, 3, 1.2, { actuator: 'lever' })
    IS('PT-N2801', 'PT', ia, 3, 36.5, { range: '0–12', unit: 'barg', nominal: 8.3, alarms: { lo: 6.5, loLo: 5.5 } })
    VS('NRV-N2802', 'check', ia, 7, 2.0)
    const o2 = face('V-N281', 'N2')
    L('1"-IA-N2803-A1A-N', 'instrumentAir', 'utilities', 1, 'A1A', [o2, [o2[0], o2[1] + 0.55, o2[2]], [o2[0] + 0.9, o2[1] + 0.55, o2[2]]], eqEnd('V-N281', 'N2'), { offDeck: 'IA distribution (WHCP pumps, ESD actuators)' })
    const d3 = face('V-N281', 'N3')
    L('1"-OD-N2804-A1A-N', 'drain', 'utilities', 1, 'A1A', [d3, [d3[0] + 0.45, d3[1], d3[2]], [d3[0] + 0.45, -1.2, d3[2]]], eqEnd('V-N281', 'N3'), { offDeck: 'Open drain' })
    PSV('PSV-N2810', 'V-N281', 'N4', [0, 0, -1], 'N2809', '10 barg', 0.5, (p) => [[p[0], p[1] + 2.0, p[2]]], { offDeck: 'Atmosphere (tail pipe, safe location)' }, { atmosphere: true })
    IE('PT-N2811', 'PT', 'V-N281', [15.4 + 0.52, 1.9, -63.5], [1, 0, 0], { range: '0–12', unit: 'barg', nominal: 8.1, alarms: { lo: 6.5, loLo: 5.5 } })
  }

  // ================================================================ PRODUCTION EXPORT
  const f1 = face('M-N200', 'N1')
  const dn1 = face('V-N230', 'N1')
  const xE = 20.5
  const e1 = L('10"-PM-N2001-D6A-N', 'multiphase', 'wells', 10, 'D6A', [f1, [xE, f1[1], f1[2]], [xE, f1[1], dn1[2]], [xE, dn1[1], dn1[2]], dn1], eqEnd('M-N200', 'N1'), eqEnd('V-N230', 'N1'), {
    design: { pressure: '99 barg', notes: 'Production header to the desander' },
  })
  VS('HV-N2001', 'gate', e1, 1, 1.6, { actuator: 'gear' })
  IS('AT-N2001', 'AT', e1, 1, 4.4, { range: '0–10', unit: 'g/s sand', nominal: 0.9, alarms: { hi: 4, hiHi: 8 } })
  IS('PT-N2001', 'PT', e1, 1, 5.4, { range: '0–100', unit: 'barg', nominal: 38, alarms: { hi: 60, hiHi: 80 } })
  const dn2 = face('V-N230', 'N2')
  const YE = 4.8
  const e2 = L('10"-PM-N2002-D6A-N', 'multiphase', 'wells', 10, 'D6A', [dn2, [dn2[0], YE, dn2[2]], [LX_EXP, YE, dn2[2]], [LX_EXP, YE, ZW], [LX_EXP, LY, ZW], ...toAlpha(LX_EXP)], eqEnd('V-N230', 'N2'), { offDeck: 'Alpha inlet header (via cellar)' }, {
    design: { pressure: '99 barg', notes: 'WHP-N production export across the north bridge pipe lane to M-1000 / the HP separator inlet' },
  })
  VS('NRV-N2002', 'check', e2, 2, 1.6)
  VS('ESDV-N2003', 'esdv', e2, 4, 2.4, { actuator: 'pistonSpring', failAction: 'FC', design: { notes: 'Bridge ESD valve, WHP-N end (closes on ESD-1 / bridge fire)' } })
  IS('PT-N2003', 'PT', e2, 4, 4.3, { range: '0–100', unit: 'barg', nominal: 36, alarms: { hi: 60, hiHi: 80 } })
  IS('FT-N2003', 'FT', e2, 4, 7.0, { range: '0–40 000', unit: 'bbl/d', nominal: 21500, alarms: { lo: 8000 } })
  IS('TT-N2003', 'TT', e2, 4, 8.2, { range: '0–150', unit: '°C', nominal: 64 })
  VS('HV-N2004', 'gate', e2, 4, 37.6, { actuator: 'gear', design: { notes: 'Bridge isolation, Alpha end' } })
  // sand dump
  const sd = face('V-N230', 'N3')
  const sdl = L('3"-SD-N2305-E9A-N', 'drain', 'wells', 3, 'E9A', [sd, [16.4, sd[1], sd[2]], [16.4, -2.2, sd[2]]], eqEnd('V-N230', 'N3'), { offDeck: 'Sand accumulator / flush skid (cellar deck)' })
  VS('XV-N2305', 'ball', sdl, 1, 0.6, { actuator: 'pistonSpring', failAction: 'FC', up: [-1, 0, 0], design: { notes: 'Sand dump valve' } })
  LTon('LT-N2300', 'V-N230', 22, { unit: '% sand', alarms: { hi: 60, hiHi: 80 } })
  IE('PDT-N2300', 'PDT', 'V-N230', [17.8 - 0.62, 2.6, -67], [-1, 0, 0], { range: '0–6', unit: 'bar', nominal: 1.4, alarms: { hi: 3.5 } })

  // ================================================================ WELL TEST
  const t2 = face('M-N200', 'N2')
  const RZ2 = riserZ('M-N210')
  const sx0 = slotX('M-N210', 0)
  const tl = L('6"-PM-N2101-E9A-N', 'multiphase', 'wells', 6, 'E9A', [t2, [20.2, t2[1], t2[2]], [20.2, -3.0, t2[2]], [20.2, -3.0, RZ2], [sx0, -3.0, RZ2], [sx0, -2.5, RZ2]], eqEnd('M-N200', 'N2'), { offDeck: 'M-N210 slot 1 riser' }, {
    design: { notes: 'Test header to the test manifold' },
  })
  VS('HV-N2101', 'gate', tl, 3, 2.0, { actuator: 'handwheel' })
  const m1 = face('M-N210', 'N1')
  const mp1 = face('V-N240', 'N1')
  const ml = L('6"-PM-N2102-E9A-N', 'multiphase', 'wells', 6, 'E9A', [m1, [19.5, m1[1], m1[2]], [19.5, mp1[1], m1[2]], mp1], eqEnd('M-N210', 'N1'), eqEnd('V-N240', 'N1'))
  void ml
  const mp2 = face('V-N240', 'N2')
  const YR = 5.6
  const rl = L('6"-PM-N2103-E9A-N', 'multiphase', 'wells', 6, 'E9A', [mp2, [mp2[0], YR, mp2[2]], [mp2[0], YR, dn2[2]], [16.4, YR, dn2[2]], [16.4, YE, dn2[2]]], eqEnd('V-N240', 'N2'), { line: e2 }, {
    design: { notes: 'Metered test fluid back into the export line' },
  })
  VS('NRV-N2103', 'check', rl, 1, 2.0)
  VS('HV-N2103', 'gate', rl, 1, 4.0, { actuator: 'handwheel' })
  IE('FT-N2400', 'FT', 'V-N240', [21.0 + 0.45, 2.0, -79.5], [1, 0, 0], { range: '0–8 000', unit: 'bbl/d liquid', nominal: 4200 })
  IE('AT-N2401', 'AT', 'V-N240', [21.0 + 0.45, 1.5, -79.5], [1, 0, 0], { range: '0–100', unit: '% water cut', nominal: 34 })
  IE('PT-N2402', 'PT', 'V-N240', [21.0, 1.5, -79.5 + 0.45], [0, 0, 1], { range: '0–100', unit: 'barg', nominal: 37 })

  // ================================================================ VENT SYSTEM: PSVs → header → KO drum → Alpha flare
  E('horizontalVessel', 'V-N290', 'Vent / Flare KO Drum', 'flare', [17.0, -85.8], 0, { service: 'ko', id: 1.2, tt: 3.2, elevation: 0.9, inletNps: 3, gasNps: 6, liquidNps: 2, psvNps: 2, rating: 150 }, {
    rename: { N1: 'Vent header inlet', N2: 'Gas to Alpha flare', N3: 'Liquid to drains' },
    design: { pressure: '10 barg', capacity: '3 m³', notes: 'Knocks out liquid carry-over from the WHP relief and blowdown before the bridge line' },
  })
  const XH = 18.9 // vent header lane (z-run over the manifolds)
  const YH = 4.2
  const ZH = -84.3
  const ko1 = face('V-N290', 'N1')
  // the desander PSV tail is the head of the vent header
  const ds4 = N('V-N230', 'N4')
  const g230 = psvGeometry(ds4.nps)
  const hdr = PSV('PSV-N2300', 'V-N230', 'N4', [1, 0, 0], 'N2309', '99 barg', XH - (ds4.pos[0] + g230.outletX), (p) => [[XH, YH, p[2]], [XH, YH, ZH], [13.9, YH, ZH], [13.9, ko1[1], ZH], [13.9, ko1[1], ko1[2]], ko1], eqEnd('V-N290', 'N1'))
  const hdrL = lineBy.get(hdr)!
  hdrL.design = { notes: 'WHP vent header to the KO drum' }
  // MPFM PSV → tee onto the header from above
  const mp4 = N('V-N240', 'N4')
  PSV('PSV-N2400', 'V-N240', 'N4', [-1, 0, 0], 'N2409', '99 barg', 0.55, (p) => [[p[0], YH + 0.5, p[2]], [XH, YH + 0.5, p[2]], [XH, YH, p[2]]], { line: hdr })
  void mp4
  // KO drum own PSV → onto the header from above
  PSV('PSV-N2900', 'V-N290', 'N5', [0, 0, 1], 'N2909', '10 barg', 0.7, (p) => [[p[0], YH + 0.5, p[2]], [p[0], YH + 0.5, ZH], [p[0], YH, ZH]], { line: hdr })
  const kg = face('V-N290', 'N2')
  const YV = 3.6
  const vent = L('6"-VF-N2901-B1A-N', 'flare', 'flare', 6, 'B1A', [kg, [kg[0], YV, kg[2]], [LX_VENT, YV, kg[2]], [LX_VENT, YV, ZW], [LX_VENT, LY, ZW], ...toAlpha(LX_VENT)], eqEnd('V-N290', 'N2'), { offDeck: `To Alpha flare header (${K.flareHeader}, via cellar)` }, {
    design: { pressure: '10 barg', notes: 'WHP-N relief / vent to the Alpha flare across the north bridge' },
  })
  VS('HV-N2901', 'gate', vent, 2, 1.4, { actuator: 'handwheel', design: { notes: 'Locked open' } })
  IS('PT-N2901', 'PT', vent, 4, 3.0, { range: '0–10', unit: 'barg', nominal: 0.15 })
  const kl = face('V-N290', 'N3')
  const kdl = L('2"-CD-N2903-B1A-N', 'drain', 'flare', 2, 'B1A', [kl, [kl[0], -2.4, kl[2]]], eqEnd('V-N290', 'N3'), { offDeck: 'WHP closed drain caisson (cellar deck)' })
  VS('LV-N2903', 'control', kdl, 0, 1.6, { actuator: 'diaphragm', failAction: 'FC', up: [0, 0, 1] })
  LTon('LT-N2900', 'V-N290', 12, { alarms: { hi: 60, hiHi: 80 } }) // vent KO drum: normally near empty

  // ================================================================ TEMPORARY REFUGE + FIREWATER
  E('module', 'B-N295', 'Temporary Refuge / Local Control Room', 'safety', [3.5, -64.5], 0, { sizeX: 8, sizeY: 3.4, sizeZ: 5 }, {
    design: { notes: 'H120 / A60 temporary refuge for 12 persons, RTU / ESD / F&G panels, radio, battery + UPS (72 h), first aid' },
  })
  const room = (tag: string, interior: NonNullable<Module['interior']>, doors: ModuleDoor[]) => {
    const m = eqBy.get(tag)
    if (m?.kind === 'module') Object.assign(m, { interior, doors })
  }
  room('B-N295', 'controlRoom', [{ id: 'D1', wall: '+x', at: 0.6, width: 1.1 }, { id: 'D2', wall: '+z', at: 1.8, width: 1.0 }])

  // firewater: Alpha ring main → bridge → under the deck → deluge valve → header over the well bay
  const ZF = -79.2
  const XF0 = 1.8
  const fw = L('6"-FW-N2851-F1A-N', 'firewater', 'safety', 6, 'F1A', [...fromAlpha(LX_FW), [LX_FW, LY, ZW], [LX_FW, -1.2, ZW], [LX_FW, -1.2, ZF], [LX_FW, 4.6, ZF], [XF0, 4.6, ZF]], { offDeck: `From Alpha firewater ring (${K.firewaterRing})` }, { offDeck: 'Well-bay deluge header (capped end)' }, {
    design: { pressure: '16 barg', notes: 'GRP-lined CuNi 90/10, deluge 12.2 l/min/m² over the well bay' },
  })
  VS('HV-N2850', 'butterfly', fw, 3, 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, locked open' } })
  VS('DV-N2851', 'esdv', fw, 6, 2.6, { actuator: 'pistonSpring', failAction: 'FO', normally: 'closed', up: [1, 0, 0], design: { notes: 'Well-bay deluge valve, opens on confirmed fire (2ooN flame) or manual release' } })
  IS('PT-N2851', 'PT', fw, 6, 4.2, { range: '0–25', unit: 'barg', nominal: 14.1, alarms: { lo: 10 } })
  for (const [seq, x] of [['N2853', WHP.wells[0][0]], ['N2854', WHP.wells[1][0]]] as [string, number][]) {
    L(`3"-FW-${seq}-F1A-N`, 'firewater', 'safety', 3, 'F1A', [[x, 4.6, ZF], [x, 4.6, -69.4]], { line: fw }, { offDeck: 'Deluge spray pipe (capped)' }, { sprayNozzles: true, design: { notes: 'Deluge spray pipe over the christmas trees' } })
  }

  // ================================================================ FIRE & GAS
  const aim = (from: [number, number], to: [number, number]): Vec3 => {
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const l = Math.hypot(dx, dz) || 1
    return [r3(dx / l), 0, r3(dz / l)]
  }
  const BAY: [number, number] = [4.25, -74]
  let fd = 1
  const FD = (host: string, x: number, y: number, z: number, target: [number, number]) => IE(`FD-N8${String(fd++).padStart(2, '0')}`, 'FD', host, [x, y, z], aim([x, z], target))
  FD('XT-N101', 9.0, 3.4, -69.2, BAY)
  FD('XT-N105', -1.4, 3.4, -79.6, BAY)
  FD('XT-N106', 9.6, 3.4, -79.9, BAY)
  FD('XT-N102', -1.4, 3.4, -68.6, BAY)
  FD('M-N200', 14.0, 3.4, -69.8, [17.3, -76])
  FD('M-N210', 14.0, 3.4, -81.6, [17.3, -74])
  FD('V-N290', 13.6, 3.4, -87.3, [17.5, -85.8])
  FD('V-N230', 21.4, 3.4, -64.6, [17.8, -69])
  let gd = 1
  const GD = (host: string, at: Vec3) => IE(`GD-N8${String(10 + gd++)}`, 'GD', host, at, [0, 0, 1])
  WHP.wells.forEach(([x, z], i) => GD(`XT-N10${i + 1}`, [x - 0.8, 2.6, z + 1.25]))
  GD('M-N200', [17.3, 2.4, -71.4])
  GD('M-N200', [14.3, 2.4, -75.6])
  GD('M-N210', [15.0, 2.4, -77.4])
  GD('V-N230', [17.8 - 0.95, 2.2, -65.8])
  GD('V-N240', [21.0, 2.2, -78.6])
  GD('V-N290', [17.0, 1.7, -84.7])
  GD('C-N260', [4.6, 1.6, -82.0])
  GD('B-N295', [3.5, 3.9, -61.9]) // TR HVAC intake (gas at the intake shuts the dampers)
  const OGD = (tag: string, host: string, a: Vec3, b: Vec3) => {
    const d = aim([a[0], a[2]], [b[0], b[2]])
    IE(`${tag}T`, 'OGD', host, a, d, { range: '0–5', unit: 'LEL·m' })
    IE(`${tag}R`, 'OGD', host, b, [-d[0], 0, -d[2]], { range: '0–5', unit: 'LEL·m' })
  }
  OGD('OGD-N821', 'XT-N103', [-1.3, 1.4, -75.5], [9.2, 1.4, -75.5]) // across the well bay, between the tree rows
  OGD('OGD-N822', 'XT-N101', [-1.3, 1.4, -69.0], [9.2, 1.4, -69.0]) // well bay south edge
  OGD('OGD-N823', 'M-N200', [14.1, 1.4, -65.4], [14.1, 1.4, -83.6]) // manifold area, west side
  let sdn = 1
  for (const x of [1.5, 5.5]) IE(`SD-N84${sdn++}`, 'SD', 'B-N295', [x, 3.45, -64.5], [1, 0, 0])
  let mac = 1
  const MAC = (x: number, z: number, dir: Vec3, y = 1.3) => IE(`MAC-N83${mac++}`, 'MAC', 'B-N295', [x, y, z], dir)
  MAC(BRIDGE_N.walk.x1 + 0.35, WHP.deck.z1 - 0.6, [-1, 0, 0]) // WHP end of the bridge
  MAC(BRIDGE_N.walk.x1 + 0.35, BRIDGE_N.walk.z1 + 0.6, [-1, 0, 0]) // Alpha end of the bridge
  MAC(8.1, -66.4, [-1, 0, 0]) // TR door
  MAC(-1.4, -82.6, [1, 0, 0]) // west escape route / cellar stair head
  MAC(13.4, -87.2, [0, 0, 1]) // north edge, KO drum
  MAC(21.3, -61.0, [-1, 0, 0]) // laydown / crane
}
