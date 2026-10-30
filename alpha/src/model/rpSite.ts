/**
 * RP — normally-unattended riser & export platform 40 m west of Alpha, linked by the west bridge
 * (layout: model/site.ts RP, BRIDGE_W; environment: scene/env/sat*.ts).
 *
 *  Oil export     10" from Alpha's export pumps / ESDV-1601 across the west bridge pipe lane → X-R150 oil
 *                 fiscal metering skid → L-R110 pig launcher (kicker) → launcher outlet → down to the cellar
 *                 deck → ESDV-R101 riser ESDV → 12" oil export riser → pipeline (subsea SSIV)
 *  Gas export     8" from Alpha's gas export / ESDV-2301 across the bridge → X-R250 gas metering skid →
 *                 L-R210 pig launcher → ESDV-R201 → 10" gas export riser → pipeline (subsea SSIV)
 *  Blowdown       BDV-R203 off the gas riser topsides section → 3" vent line → RP cold vent stack VS-R300
 *  Utilities      instrument air across the bridge → V-R281 receiver (ESDV / BDV actuators, SSIV panel);
 *                 X-R160 SSIV hydraulic control panel; firewater from Alpha's ring → deluge valve DV-R2851
 *                 → spray pipes over the pig launchers
 *  Safety         B-R395 temporary refuge / local equipment room; flame, point gas, open-path gas, smoke
 *                 detectors and manual call points on both decks and the bridge ends
 *
 * Tags use the "R" area prefix (ESDV-R101, 10"-PO-R1001-D6A-N, FD-R801 …) so nothing collides with Alpha.
 * Deck-local coordinates; built with the component library like model/whpSite.ts. Lines that start on
 * Alpha start at Alpha's west deck edge as tie-ins (under the production deck plate), so Alpha's own data
 * (model/alphaSite.ts, plant.ts) is untouched.
 */
import type { Equipment, EquipmentKind, Instrument, InstrumentType, Module, ModuleDoor, Nozzle, PipeLine, Service, SystemId, Valve, ValveType, Vec3 } from './types'
import { componentDef, instantiate, resolveParams } from '../library/components'
import type { NozzleTemplate, Params } from '../library/types'
import { valveClear, INSTRUMENT_DEFAULTS } from '../library/compile'
import { elbowRadius, flange, GASKET, valveLength } from './catalog'
import { psvGeometry } from '../scene/equipment/Valve'
import { BRIDGE_W, RP } from './site'

export interface SiteArrays {
  equipment: Equipment[]
  lines: PipeLine[]
  valves: Valve[]
  instruments: Instrument[]
}

/** line tags the simulation / other platforms may want to refer to */
export const RP_LINES = {
  oilIn: '10"-PO-R1001-D6A-N',
  oilKicker: '10"-PO-R1102-D6A-N',
  oilRiser: '12"-PO-R1101-D6A-N',
  gasIn: '8"-PG-R2001-E9A-N',
  gasKicker: '8"-PG-R2102-E9A-N',
  gasRiser: '10"-PG-R2101-E9A-N',
  blowdown: '3"-VF-R2031-E9A-N',
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const P = (...v: number[]) => v.map(r3) as Vec3

export function extendRP(A: SiteArrays) {
  const eqBy = new Map<string, Equipment>()
  const lineBy = new Map<string, PipeLine>()
  for (const e of A.equipment) eqBy.set(e.tag, e)
  for (const l of A.lines) lineBy.set(l.tag, l)

  // ---------------------------------------------------------------- helpers (as model/whpSite.ts)
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
    if (!n) throw new Error(`rpSite: nozzle ${tag}/${id} missing`)
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
  const taken = new Map<string, [number, number, string][]>()
  /** valve at an explicit distance `d` (m) from the start of segment `seg` */
  function VS(tag: string, type: ValveType, line: string, seg: number, d: number, o: Partial<Valve> = {}) {
    const l = lineBy.get(line)!
    const len = segLen(l, seg)
    const clear = valveClear(type, l.nps, l.spec)
    if (d < clear - 0.13 || d > len - clear + 0.13) console.warn(`[rpSite] ${tag} too close to a bend on ${line} seg ${seg} (d ${d.toFixed(2)} of ${len.toFixed(2)})`)
    const occ = valveLength(type, l.nps) / 2 + GASKET + flange(l.nps, rating(l.spec)).length
    const key = `${line}#${seg}`
    const list = taken.get(key) ?? []
    for (const [a, b, t] of list) if (d - occ < b && d + occ > a) console.warn(`[rpSite] ${tag} overlaps ${t} on ${line}`)
    list.push([d - occ, d + occ, tag])
    taken.set(key, list)
    A.valves.push({ tag, type, line, seg, t: r3(d / len), normally: 'open', design: {}, ...o })
  }
  const ALARMS: Partial<Record<InstrumentType, Instrument['alarms']>> = {
    GD: { hi: 20, hiHi: 60 }, OGD: { hi: 1, hiHi: 3 }, FD: { hi: 30, hiHi: 60 }, HD: { hi: 68, hiHi: 90 }, SD: { hi: 2, hiHi: 5 }, MAC: { hi: 12 },
  }
  function IS(tag: string, type: InstrumentType, line: string, seg: number, d: number, o: Partial<Instrument> = {}) {
    const l = lineBy.get(line)!
    const len = segLen(l, seg)
    const key = `${line}#${seg}`
    for (const [a, b, t] of taken.get(key) ?? []) if (d > a - 0.12 && d < b + 0.12) console.warn(`[rpSite] ${tag} sits on valve ${t} (${line})`)
    if (d < elbowRadius(l.nps) + 0.1 || d > len - elbowRadius(l.nps) - 0.1) console.warn(`[rpSite] ${tag} too close to a bend on ${line} seg ${seg}`)
    const dd = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { line, seg, t: r3(d / len) }, dir: [0, 1, 0], range: dd.range, unit: dd.unit, nominal: dd.nominal, alarms: ALARMS[type], ...o })
  }
  function IE(tag: string, type: InstrumentType, equipment: string, at: Vec3, dir: Vec3, o: Partial<Instrument> = {}) {
    const d = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { equipment, at: P(...at) }, dir, range: d.range, unit: d.unit, nominal: d.nominal, alarms: ALARMS[type], ...o })
  }
  /** PSV on a vessel nozzle with a tail pipe to atmosphere (as whpSite.ts PSV(..., { atmosphere: true })) */
  function PSVatm(tag: string, eqTag: string, nz: string, outDir: Vec3, seq: string, set: string, run: number, rise: number) {
    const n = N(eqTag, nz)
    const g = psvGeometry(n.nps)
    const pos: Vec3 = [n.pos[0] + n.dir[0] * (g.outletY + GASKET) + outDir[0] * g.outletX, n.pos[1] + n.dir[1] * (g.outletY + GASKET), n.pos[2] + n.dir[2] * (g.outletY + GASKET) + outDir[2] * g.outletX]
    const p1: Vec3 = [pos[0] + outDir[0] * run, pos[1], pos[2] + outDir[2] * run]
    const line = L(`${g.outletNps}"-VA-${seq}-A1A-N`, 'instrumentAir', eqBy.get(eqTag)!.system, g.outletNps, 'A1A', [pos, p1, [p1[0], p1[1] + rise, p1[2]]], { offDeck: `${tag} outlet` }, { offDeck: 'Atmosphere (tail pipe, safe location)' })
    A.valves.push({ tag, type: 'psv', line, seg: -1, t: 0, mount: { equipment: eqTag, nozzle: nz }, outletDir: outDir, normally: 'closed', design: { notes: `Set ${set}` } })
  }

  const [LZ_OIL, LZ_GAS, LZ_IA, LZ_FW] = BRIDGE_W.pipeLane.z
  const LY = BRIDGE_W.pipeLane.y
  /** bridge drop points: just onto the bridge from the RP east edge / the Alpha west edge */
  const XR = RP.deck.x1 + BRIDGE_W.dropInset // -69.6
  const XA = BRIDGE_W.walk.x1 - BRIDGE_W.dropInset // -30.4
  /** Alpha tie-in: under Alpha's production deck plate, just inside its west edge */
  const XA2 = BRIDGE_W.walk.x1 + 0.6 // -29.4
  /** from an Alpha tie-in (under the deck at height yu) out onto the bridge lane at z */
  const fromAlpha = (z: number, yu: number): Vec3[] => [[XA2, yu, z], [XA, yu, z], [XA, LY, z], [XR, LY, z]]
  const [[RXO, RZO], [RXG, RZG]] = RP.risers
  const YC = RP.cellarY + 1.4 // riser ESDV run on the cellar deck
  const YRT = RP.cellarY - 0.9 // riser top flange, just under the cellar plate

  // ================================================================ EQUIPMENT
  // fiscal metering skids: meter runs on a bunded skid (inlet east end, outlet west / south)
  E('chemSkid', 'X-R150', 'Oil Fiscal Metering Skid (export)', 'oilExport', [-78.5, -19.5], 0, { skidL: 5.0, skidW: 2.6, tanks: 1, outlets: 0 }, {
    extra: [
      { id: 'N1', name: 'Oil inlet (from Alpha)', base: [2.5, 0.8, 0], dir: [1, 0, 0], nps: 10, neck: 0.3, rating: 600 },
      { id: 'N2', name: 'Metered oil outlet', base: [-2.0, 0.8, 1.3], dir: [0, 0, 1], nps: 10, neck: 0.3, rating: 600 },
    ],
    design: { pressure: '96 barg', capacity: '2 × 100 % ultrasonic meter runs, 0–40 000 bbl/d', notes: 'Custody-transfer metering: ultrasonic meters, densitometer, BS&W analyser, automatic sampler, bidirectional prover connection, flow computer in the TR' },
  })
  E('chemSkid', 'X-R250', 'Gas Export Metering Skid', 'gasCompression', [-78.5, -23.2], 0, { skidL: 5.0, skidW: 2.4, tanks: 1, outlets: 0 }, {
    extra: [
      { id: 'N1', name: 'Gas inlet (from Alpha)', base: [2.5, 0.8, 0], dir: [1, 0, 0], nps: 8, neck: 0.3, rating: 900 },
      { id: 'N2', name: 'Metered gas outlet', base: [-2.5, 0.8, 0], dir: [-1, 0, 0], nps: 8, neck: 0.3, rating: 900 },
    ],
    design: { pressure: '150 barg', capacity: '0–80 MMscfd, 2 × 100 % ultrasonic runs', notes: 'Fiscal gas metering to ISO 17089: multipath ultrasonic meters, online gas chromatograph, hydrocarbon + water dew point analysers' },
  })
  // pig launchers: closure to the west (pig handling area by the laydown), outlet east toward the risers
  E('pigTrap', 'L-R110', 'Oil Export Pig Launcher', 'oilExport', [-83.0, RZO], 180, { majorBarrelNps: 14, minorBarrelNps: 12, length: 5.6, elevation: 1.3, rating: 600, kickerNps: 10 }, {
    rename: { N1: 'Outlet to oil export riser', N2: 'Kicker inlet (metered oil)' },
    design: { pressure: '96 barg', temperature: '60 °C', material: 'API 5L X65', notes: 'Launches cleaning / inspection (intelligent) pigs into the 12" oil export pipeline; quick-opening closure with pressure-warning interlock' },
  })
  E('pigTrap', 'L-R210', 'Gas Export Pig Launcher', 'gasCompression', [-85.5, RZG], 180, { majorBarrelNps: 12, minorBarrelNps: 10, length: 5.4, elevation: 1.3, rating: 900, kickerNps: 8 }, {
    rename: { N1: 'Outlet to gas export riser', N2: 'Kicker inlet (metered gas)' },
    design: { pressure: '150 barg', temperature: '50 °C', material: 'API 5L X65', notes: 'Launches pigs into the 10" gas export pipeline; quick-opening closure with pressure-warning interlock' },
  })
  E('chemSkid', 'X-R160', 'SSIV Hydraulic Control Panel', 'safety', [-91.5, -18.6], 0, { skidL: 3.2, skidW: 2.2, tanks: 2, outlets: 0 }, {
    design: { pressure: '345 barg hydraulic', notes: 'HPU + accumulators for the oil and gas subsea isolation valves (SSIVs) via the riser umbilicals; closes the SSIVs on ESD-1 / riser fire, fail-safe closed on loss of hydraulics' },
  })
  E('verticalVessel', 'V-R281', 'Instrument Air Receiver', 'utilities', [-88.5, -18.6], 180, { id: 0.8, tt: 2.0, elevation: 0.6, support: 'legs', internals: 'mesh', platform: false, inletNps: 2, gasNps: 1, liquidNps: 1, psvNps: 1, rating: 300 }, {
    rename: { N1: 'Air inlet (from Alpha)', N2: 'Air outlet', N3: 'Condensate drain' },
    design: { pressure: '10 barg', capacity: '1.5 m³, 30 min hold-up for the riser ESDVs and BDV' },
  })
  E('module', 'B-R395', 'Temporary Refuge / Local Equipment Room', 'safety', [-89.0, -24.2], 0, { sizeX: 8, sizeY: 3.4, sizeZ: 5 }, {
    design: { notes: 'H120 / A60 temporary refuge for 8 persons; RTU, ESD / F&G panels, metering flow computers, UPS (72 h), radio, first aid' },
  })
  {
    const m = eqBy.get('B-R395')
    const doors: ModuleDoor[] = [{ id: 'D1', wall: '+x', at: 0.6, width: 1.1 }, { id: 'D2', wall: '+z', at: -1.8, width: 1.0 }]
    if (m?.kind === 'module') Object.assign(m, { interior: 'controlRoom' as NonNullable<Module['interior']>, doors })
  }

  // ================================================================ OIL EXPORT
  {
    const n1 = face('X-R150', 'N1')
    const oil = L(RP_LINES.oilIn, 'oil', 'oilExport', 10, 'D6A', [...fromAlpha(LZ_OIL, -1.6), [XR, 3.0, LZ_OIL], [-73.5, 3.0, LZ_OIL], [-73.5, 3.0, n1[2]], [-73.5, n1[1], n1[2]], n1], { offDeck: 'From Alpha export pumps / ESDV-1601' }, eqEnd('X-R150', 'N1'), {
      design: { pressure: '96 barg', temperature: '48 °C', notes: 'Stabilised crude from Alpha (after ESDV-1601) across the west bridge pipe lane to the fiscal meter' },
    })
    VS('HV-R1001', 'gate', oil, 2, 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, Alpha end' } })
    VS('HV-R1002', 'gate', oil, 2, segLen(lineBy.get(oil)!, 2) - 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, RP end' } })
    IS('PT-R1001', 'PT', oil, 5, 1.3, { range: '0–160', unit: 'barg', nominal: 88, alarms: { lo: 60, hi: 98, hiHi: 104 } })
    IS('TT-R1001', 'TT', oil, 5, 2.4, { range: '0–150', unit: '°C', nominal: 47 })
    // metered oil → launcher kicker (over the main walkway)
    const n2 = face('X-R150', 'N2')
    const kick = face('L-R110', 'N2')
    const ZK = -16.6
    const kl = L(RP_LINES.oilKicker, 'oil', 'oilExport', 10, 'D6A', [n2, [n2[0], n2[1], ZK], [n2[0], 3.8, ZK], [kick[0], 3.8, ZK], [kick[0], 3.8, kick[2]], kick], eqEnd('X-R150', 'N2'), eqEnd('L-R110', 'N2'), {
      design: { pressure: '96 barg', notes: 'Metered oil to the launcher kicker (normal export path through the launcher barrel)' },
    })
    VS('HV-R111', 'gate', kl, 4, 1.0, { actuator: 'gear', design: { notes: 'Kicker valve' } })
    IS('FT-R1102', 'FT', kl, 3, 7.0, { range: '0–80 000', unit: 'bbl/d', nominal: 49800, alarms: { lo: 5000 } })
    // launcher outlet → down to the cellar deck → riser ESDV → riser
    const o1 = face('L-R110', 'N1')
    const XD = -77.6
    const rl = L(RP_LINES.oilRiser, 'oil', 'oilExport', 12, 'D6A', [o1, [XD, o1[1], o1[2]], [XD, YC, o1[2]], [RXO, YC, RZO], [RXO, YRT, RZO]], eqEnd('L-R110', 'N1'), { offDeck: 'Oil export riser → pipeline' }, {
      design: { pressure: '96 barg', notes: '12" oil export riser to the 16" trunk line; subsea SSIV 60 m from the jacket' },
    })
    VS('HV-R112', 'ball', rl, 0, 1.15, { actuator: 'gear', design: { notes: 'Launcher outlet isolation' } })
    VS('ESDV-R101', 'esdv', rl, 2, 1.3, { actuator: 'pistonSpring', failAction: 'FC', up: [0, 0, 1], design: { notes: 'Oil riser ESDV (topsides), SIL 3; closes on PSD / ESD and riser fire' } })
    IS('PT-R1101', 'PT', rl, 3, 1.1, { range: '0–160', unit: 'barg', nominal: 86, alarms: { lo: 40, hi: 98, hiHi: 104 } })
    IS('PT-R1102', 'PT', rl, 1, 3.4, { range: '0–160', unit: 'barg', nominal: 86.5 })
  }
  IE('FT-R150', 'FT', 'X-R150', [-77.2, 1.6, -19.5 - 1.3], [0, 0, -1], { range: '0–80 000', unit: 'bbl/d', nominal: 49800, alarms: { lo: 5000 } })
  IE('AT-R151', 'AT', 'X-R150', [-79.8, 1.6, -19.5 - 1.3], [0, 0, -1], { range: '0–5', unit: '% BS&W', nominal: 0.3, alarms: { hi: 0.5, hiHi: 1.0 } })
  IE('PT-R152', 'PT', 'X-R150', [-76.2, 1.6, -19.5 - 1.3], [0, 0, -1], { range: '0–160', unit: 'barg', nominal: 87 })
  IE('TT-R153', 'TT', 'X-R150', [-78.5, 1.6, -19.5 - 1.3], [0, 0, -1], { range: '0–150', unit: '°C', nominal: 47 })

  // ================================================================ GAS EXPORT
  {
    const n1 = face('X-R250', 'N1')
    const gas = L(RP_LINES.gasIn, 'gas', 'gasCompression', 8, 'E9A', [...fromAlpha(LZ_GAS, -1.6), [XR, 3.6, LZ_GAS], [-72.5, 3.6, LZ_GAS], [-72.5, 3.6, n1[2]], [-72.5, n1[1], n1[2]], n1], { offDeck: 'From Alpha gas export / ESDV-2301' }, eqEnd('X-R250', 'N1'), {
      design: { pressure: '140 barg', temperature: '39 °C', notes: 'Dry export gas from Alpha (after ESDV-2301) across the west bridge pipe lane to the gas meter' },
    })
    VS('HV-R2001', 'gate', gas, 2, 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, Alpha end' } })
    VS('HV-R2002', 'gate', gas, 2, segLen(lineBy.get(gas)!, 2) - 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, RP end' } })
    IS('PT-R2001', 'PT', gas, 5, 1.6, { range: '0–200', unit: 'barg', nominal: 136.8, alarms: { lo: 100, hi: 145, hiHi: 150 } })
    IS('TT-R2001', 'TT', gas, 5, 3.0, { range: '0–150', unit: '°C', nominal: 38 })
    const n2 = face('X-R250', 'N2')
    const kick = face('L-R210', 'N2')
    const XG = -82.6
    const ZG = -11.0
    const kl = L(RP_LINES.gasKicker, 'gas', 'gasCompression', 8, 'E9A', [n2, [XG, n2[1], n2[2]], [XG, 4.6, n2[2]], [XG, 4.6, ZG], [kick[0], 4.6, ZG], [kick[0], 4.6, kick[2]], kick], eqEnd('X-R250', 'N2'), eqEnd('L-R210', 'N2'), {
      design: { pressure: '140 barg', notes: 'Metered gas to the launcher kicker' },
    })
    VS('HV-R211', 'gate', kl, 5, 1.1, { actuator: 'gear', design: { notes: 'Kicker valve' } })
    const o1 = face('L-R210', 'N1')
    const XD = -77.6
    const rl = L(RP_LINES.gasRiser, 'gas', 'gasCompression', 10, 'E9A', [o1, [XD, o1[1], o1[2]], [XD, YC, o1[2]], [RXG, YC, RZG], [RXG, YRT, RZG]], eqEnd('L-R210', 'N1'), { offDeck: 'Gas export riser → pipeline' }, {
      design: { pressure: '140 barg', notes: '10" gas export riser to the 14" gas trunk line; subsea SSIV 60 m from the jacket' },
    })
    VS('HV-R212', 'ball', rl, 0, 1.15, { actuator: 'gear', design: { notes: 'Launcher outlet isolation' } })
    VS('ESDV-R201', 'esdv', rl, 2, 1.3, { actuator: 'pistonSpring', failAction: 'FC', up: [0, 0, 1], design: { notes: 'Gas riser ESDV (topsides), SIL 3; closes on PSD / ESD and riser fire' } })
    IS('PT-R2101', 'PT', rl, 3, 1.1, { range: '0–200', unit: 'barg', nominal: 136, alarms: { lo: 60, hi: 145, hiHi: 150 } })
    // riser topsides blowdown: off the top of the riser run (between the launcher and the drop) → cold vent stack
    const s0 = lineBy.get(rl)!.route[0]
    const XT = r3(s0[0] + 2.6)
    const V = RP.vent
    const XV = V.x - 0.6
    const bd = L(RP_LINES.blowdown, 'flare', 'flare', 3, 'E9A', [[XT, s0[1], s0[2]], [XT, 3.0, s0[2]], [XT, 3.0, V.z], [-72.8, 3.0, V.z], [-72.8, 1.2, V.z], [XV, 1.2, V.z]], { line: rl }, { offDeck: 'RP cold vent stack VS-R300' }, {
      design: { pressure: '140 barg upstream of BDV, 10 barg downstream', notes: 'Riser topsides depressurisation to the cold vent (restriction orifice downstream of the BDV)' },
    })
    VS('BDV-R203', 'bdv', bd, 2, 2.4, { actuator: 'pistonSpring', failAction: 'FO', normally: 'closed', up: [1, 0, 0], design: { notes: 'Riser topsides blowdown valve, opens on ESD-1 / confirmed fire (fail open)' } })
    IS('PT-R2031', 'PT', bd, 2, 4.6, { range: '0–20', unit: 'barg', nominal: 0.05 })
  }
  IE('FT-R250', 'FT', 'X-R250', [-77.2, 1.6, -23.2 - 1.2], [0, 0, -1], { range: '0–80', unit: 'MMscfd', nominal: 48.6, alarms: { lo: 10 } })
  IE('AT-R251', 'AT', 'X-R250', [-79.8, 1.6, -23.2 - 1.2], [0, 0, -1], { range: '-40–20', unit: '°C dew pt', nominal: -18, alarms: { hi: -8 } })
  IE('PT-R252', 'PT', 'X-R250', [-76.2, 1.6, -23.2 - 1.2], [0, 0, -1], { range: '0–200', unit: 'barg', nominal: 136.5 })

  // ================================================================ INSTRUMENT AIR
  {
    const n1 = face('V-R281', 'N1')
    const XI = n1[0] + 1.1
    const ia = L('2"-IA-R2801-A1A-N', 'instrumentAir', 'utilities', 2, 'A1A', [...fromAlpha(LZ_IA, -1.0), [XR, -1.0, LZ_IA], [XI, -1.0, LZ_IA], [XI, -1.0, n1[2]], [XI, n1[1], n1[2]], n1], { offDeck: 'From Alpha instrument air header' }, eqEnd('V-R281', 'N1'))
    VS('HV-R2801', 'ball', ia, 2, 1.2, { actuator: 'lever' })
    IS('PT-R2801', 'PT', ia, 2, 36.5, { range: '0–12', unit: 'barg', nominal: 8.2, alarms: { lo: 6.5, loLo: 5.5 } })
    VS('NRV-R2802', 'check', ia, 4, 8.0)
    const o2 = face('V-R281', 'N2')
    L('1"-IA-R2803-A1A-N', 'instrumentAir', 'utilities', 1, 'A1A', [o2, [o2[0], o2[1] + 0.55, o2[2]], [o2[0] - 0.9, o2[1] + 0.55, o2[2]]], eqEnd('V-R281', 'N2'), { offDeck: 'IA distribution (riser ESDVs, BDV, SSIV panel)' })
    const d3 = face('V-R281', 'N3')
    L('1"-OD-R2804-A1A-N', 'drain', 'utilities', 1, 'A1A', [d3, [d3[0] - 0.45, d3[1], d3[2]], [d3[0] - 0.45, -1.2, d3[2]]], eqEnd('V-R281', 'N3'), { offDeck: 'Open drain' })
    PSVatm('PSV-R2810', 'V-R281', 'N4', [0, 0, -1], 'R2809', '10 barg', 0.5, 2.0)
    IE('PT-R2811', 'PT', 'V-R281', [-88.5 - 0.52, 1.9, -18.6], [-1, 0, 0], { range: '0–12', unit: 'barg', nominal: 8.0, alarms: { lo: 6.5, loLo: 5.5 } })
  }
  IE('PT-R1601', 'PT', 'X-R160', [-91.5 + 1.0, 1.7, -18.6 + 1.1], [0, 0, 1], { range: '0–400', unit: 'barg', nominal: 318, alarms: { lo: 250, loLo: 220 } })

  // ================================================================ FIREWATER → DELUGE OVER THE LAUNCHERS
  {
    const XF = -76.2
    const ZF = -10.4
    const YF = 5.4
    const XF1 = -88.0
    const fw = L('6"-FW-R2851-F1A-N', 'firewater', 'safety', 6, 'F1A', [...fromAlpha(LZ_FW, -1.5), [XR, -1.5, LZ_FW], [XF, -1.5, LZ_FW], [XF, -1.5, ZF], [XF, YF, ZF], [XF1, YF, ZF]], { offDeck: 'From Alpha firewater ring (8"-FW-9001-F1A-N)' }, { offDeck: 'Launcher deluge header (capped end)' }, {
      design: { pressure: '16 barg', notes: 'GRP-lined CuNi 90/10; deluge 10.2 l/min/m² over the pig launchers and risers' },
    })
    VS('HV-R2850', 'butterfly', fw, 2, 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, locked open' } })
    VS('DV-R2851', 'esdv', fw, 6, 2.6, { actuator: 'pistonSpring', failAction: 'FO', normally: 'closed', up: [1, 0, 0], design: { notes: 'Launcher-area deluge valve, opens on confirmed fire (2ooN flame) or manual release' } })
    IS('PT-R2851', 'PT', fw, 6, 4.4, { range: '0–25', unit: 'barg', nominal: 13.8, alarms: { lo: 10 } })
    for (const [seq, x] of [['R2853', -82.0], ['R2854', -86.0]] as [string, number][]) {
      L(`3"-FW-${seq}-F1A-N`, 'firewater', 'safety', 3, 'F1A', [[x, YF, ZF], [x, YF, -3.4]], { line: fw }, { offDeck: 'Deluge spray pipe (capped)' }, { sprayNozzles: true, design: { notes: 'Deluge spray pipe over the pig launchers' } })
    }
  }

  // ================================================================ FIRE & GAS
  const aim = (from: [number, number], to: [number, number]): Vec3 => {
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const l = Math.hypot(dx, dz) || 1
    return [r3(dx / l), 0, r3(dz / l)]
  }
  const C = RP.cellarY
  let fd = 1
  const FD = (host: string, x: number, y: number, z: number, target: [number, number]) => IE(`FD-R8${String(fd++).padStart(2, '0')}`, 'FD', host, [x, y, z], aim([x, z], target))
  // main deck: meters (NE), launchers (S), risers / BDV (SE)
  FD('X-R150', -70.7, 3.4, -27.3, [-79, -21])
  FD('X-R250', -84.6, 3.4, -27.3, [-77, -21])
  FD('L-R110', -70.7, 3.4, -10.6, [-82, -6])
  FD('L-R210', -90.6, 3.4, -11.0, [-80, -6])
  FD('L-R110', -86.0, 3.4, -0.7, [-79, -9])
  FD('X-R150', -70.7, 3.4, -18.2, [-82, -12])
  // cellar deck: risers + riser ESDVs
  FD('L-R110', -70.7, C + 3.4, -1.0, [-76, -7.5])
  FD('L-R210', -80.5, C + 3.4, -13.4, [-75, -6])
  FD('L-R110', -70.7, C + 3.4, -14.6, [-76, -6])
  // west half: refuge, SSIV panel, pig handling + laydown (utility zone)
  FD('X-R160', -97.4, 3.4, -0.8, [-91, -13])
  FD('B-R395', -84.4, 3.4, -16.3, [-94, -9])
  FD('L-R210', -84.0, C + 3.4, -0.8, [-76, -9]) // cellar, from the south-west
  let gd = 1
  const GD = (host: string, at: Vec3) => IE(`GD-R8${String(10 + gd++)}`, 'GD', host, at, [0, 0, 1])
  GD('L-R110', [-85.6, 1.9, -5.2 + 0.7]) // oil launcher closure
  GD('L-R110', [-80.6, 1.9, -5.2 - 0.7]) // oil launcher outlet / kicker valve
  GD('L-R210', [-88.0, 1.9, -8.8 - 0.7]) // gas launcher closure
  GD('L-R210', [-82.9, 1.9, -8.8 + 0.7]) // gas launcher outlet
  GD('X-R150', [-77.0, 1.6, -19.5 + 1.6])
  GD('X-R150', [-80.6, 1.6, -19.5 + 1.6])
  GD('X-R250', [-77.0, 1.6, -23.2 - 1.6])
  GD('X-R250', [-80.6, 1.6, -23.2 + 1.5])
  GD('L-R210', [-78.4, 1.5, -11.6]) // riser drops / BDV
  GD('B-R395', [-86.4, 3.0, -21.4]) // TR HVAC intake on the south wall (gas at the intake shuts the dampers)
  GD('B-R395', [-91.4, 3.0, -21.4]) // TR HVAC intake, west end
  GD('L-R110', [-76.2, C + 1.2, -4.2]) // cellar: oil riser ESDV
  GD('L-R210', [-76.2, C + 1.2, -9.8]) // cellar: gas riser ESDV
  GD('L-R110', [-73.9, C + 1.2, -7.0]) // cellar: riser tops
  const OGD = (tag: string, host: string, a: Vec3, b: Vec3) => {
    const d = aim([a[0], a[2]], [b[0], b[2]])
    IE(`${tag}T`, 'OGD', host, a, d, { range: '0–5', unit: 'LEL·m' })
    IE(`${tag}R`, 'OGD', host, b, [-d[0], 0, -d[2]], { range: '0–5', unit: 'LEL·m' })
  }
  OGD('OGD-R821', 'L-R110', [-91.0, 1.4, -2.2], [-71.0, 1.4, -2.2]) // south edge, past the launchers + vent
  OGD('OGD-R822', 'X-R150', [-71.0, 1.4, -27.2], [-84.4, 1.4, -27.2]) // north edge, past the meters
  OGD('OGD-R823', 'L-R210', [-89.2, 1.4, -11.3], [-71.0, 1.4, -11.3]) // walkway south edge, upwind of the launchers
  OGD('OGD-R824', 'L-R110', [-79.8, C + 1.4, -2.0], [-79.8, C + 1.4, -13.0]) // cellar, west of the risers
  let sdn = 1
  for (const x of [-91.0, -87.0]) IE(`SD-R84${sdn++}`, 'SD', 'B-R395', [x, 3.45, -24.2], [1, 0, 0])
  let mac = 1
  const MAC = (x: number, z: number, dir: Vec3, y = 1.3) => IE(`MAC-R83${mac++}`, 'MAC', 'B-R395', [x, y, z], dir)
  MAC(RP.deck.x1 - 0.6, BRIDGE_W.walk.z1 + 0.35, [0, 0, -1]) // RP end of the bridge
  MAC(-84.6, -21.1, [1, 0, 0]) // TR door
  MAC(-82.9, -27.4, [0, 0, 1]) // stair head (north edge)
  MAC(-93.0, -10.4, [1, 0, 0]) // laydown / pig handling
  MAC(-73.6, -0.6, [0, 0, -1]) // SE corner, vent stack
  MAC(-72.6, -14.4, [-1, 0, 0], C + 1.3) // cellar deck, by the risers
  // west bridge, Alpha end (on Alpha's deck edge; host is Alpha's manifold M-1000)
  IE(`MAC-R83${mac++}`, 'MAC', 'M-1000', [BRIDGE_W.walk.x1 + 0.6, 1.3, BRIDGE_W.walk.z1 + 0.35], [0, 0, -1])
}
