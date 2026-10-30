/**
 * WI — normally-unattended water-injection platform 40 m north of WHP-N, linked by the north-north bridge
 * (layout: model/site.ts WI, BRIDGE_NN; environment: scene/env/sat*.ts).
 *
 *  Seawater lift   P-W300A/B electric caisson pumps hanging from the cellar deck → 10" lift header up
 *                  through the main deck → X-W330 coarse + fine filtration package
 *  Deaeration      → V-W320 vacuum deaerator tower (O₂ stripped to < 10 ppb, O₂ scavenger polishing)
 *  Injection       → P-W310A/B 2 × 50 % multistage injection pumps (≈ 2.6 MW each, VSD-driven from the LER)
 *                  → 10" injection header → ESDV-W401 → over the north-north bridge → tie-in at WHP-N's
 *                  north edge to injector XT-N106 and the subsea WI manifold
 *  Chemicals       C-W340 biocide (down the caissons) + O₂ scavenger (pump suction header)
 *  Utilities       instrument air from WHP-N → V-W381 receiver; firewater from WHP-N → hose reel station
 *  Safety          B-W395 local equipment room (switchgear / VSDs); little hydrocarbon on WI, so detection
 *                  is mostly flame / heat / smoke on the electrical and rotating equipment, gas detectors at
 *                  the LER HVAC intake, and manual call points
 *
 * Tags use the "W" area prefix (P-W310A, 10"-WI-W4001-E9A-N, FD-W801 …). Deck-local coordinates; built with
 * the component library like model/whpSite.ts. Lines that leave WI for WHP-N end as tie-ins under WHP-N's
 * north deck edge, so WHP-N's own data (model/whpSite.ts) is untouched.
 */
import type { Equipment, EquipmentKind, Instrument, InstrumentType, Module, ModuleDoor, Nozzle, PipeLine, Service, SystemId, Valve, ValveType, Vec3 } from './types'
import { componentDef, instantiate, resolveParams } from '../library/components'
import type { NozzleTemplate, Params } from '../library/types'
import { valveClear, INSTRUMENT_DEFAULTS } from '../library/compile'
import { elbowRadius, flange, GASKET, valveLength } from './catalog'
import { psvGeometry } from '../scene/equipment/Valve'
import { BRIDGE_NN, WHP, WI } from './site'
import type { SiteArrays } from './rpSite'

/** line tags the simulation / other platforms may want to refer to */
export const WI_LINES = {
  lift: '10"-SW-W3001-A1A-N',
  filtered: '10"-SW-W3301-A1A-N',
  suction: '12"-WI-W3201-A1A-N',
  /** injection header → bridge → WHP-N tie-in */
  injection: '10"-WI-W4001-E9A-N',
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const P = (...v: number[]) => v.map(r3) as Vec3

export function extendWI(A: SiteArrays) {
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
    if (!n) throw new Error(`wiSite: nozzle ${tag}/${id} missing`)
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
  function VS(tag: string, type: ValveType, line: string, seg: number, d: number, o: Partial<Valve> = {}) {
    const l = lineBy.get(line)!
    const len = segLen(l, seg)
    const clear = valveClear(type, l.nps, l.spec)
    if (d < clear - 0.13 || d > len - clear + 0.13) console.warn(`[wiSite] ${tag} too close to a bend on ${line} seg ${seg} (d ${d.toFixed(2)} of ${len.toFixed(2)})`)
    const occ = valveLength(type, l.nps) / 2 + GASKET + flange(l.nps, rating(l.spec)).length
    const key = `${line}#${seg}`
    const list = taken.get(key) ?? []
    for (const [a, b, t] of list) if (d - occ < b && d + occ > a) console.warn(`[wiSite] ${tag} overlaps ${t} on ${line}`)
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
    for (const [a, b, t] of taken.get(key) ?? []) if (d > a - 0.12 && d < b + 0.12) console.warn(`[wiSite] ${tag} sits on valve ${t} (${line})`)
    if (d < elbowRadius(l.nps) + 0.1 || d > len - elbowRadius(l.nps) - 0.1) console.warn(`[wiSite] ${tag} too close to a bend on ${line} seg ${seg}`)
    const dd = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { line, seg, t: r3(d / len) }, dir: [0, 1, 0], range: dd.range, unit: dd.unit, nominal: dd.nominal, alarms: ALARMS[type], ...o })
  }
  function IE(tag: string, type: InstrumentType, equipment: string, at: Vec3, dir: Vec3, o: Partial<Instrument> = {}) {
    const d = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { equipment, at: P(...at) }, dir, range: d.range, unit: d.unit, nominal: d.nominal, alarms: ALARMS[type], ...o })
  }
  function PSVatm(tag: string, eqTag: string, nz: string, outDir: Vec3, seq: string, set: string, run: number, rise: number) {
    const n = N(eqTag, nz)
    const g = psvGeometry(n.nps)
    const pos: Vec3 = [n.pos[0] + n.dir[0] * (g.outletY + GASKET) + outDir[0] * g.outletX, n.pos[1] + n.dir[1] * (g.outletY + GASKET), n.pos[2] + n.dir[2] * (g.outletY + GASKET) + outDir[2] * g.outletX]
    const p1: Vec3 = [pos[0] + outDir[0] * run, pos[1], pos[2] + outDir[2] * run]
    const line = L(`${g.outletNps}"-VA-${seq}-A1A-N`, 'instrumentAir', eqBy.get(eqTag)!.system, g.outletNps, 'A1A', [pos, p1, [p1[0], p1[1] + rise, p1[2]]], { offDeck: `${tag} outlet` }, { offDeck: 'Atmosphere (tail pipe, safe location)' })
    A.valves.push({ tag, type: 'psv', line, seg: -1, t: 0, mount: { equipment: eqTag, nozzle: nz }, outletDir: outDir, normally: 'closed', design: { notes: `Set ${set}` } })
  }

  const [LX_WI, LX_IA, LX_FW] = BRIDGE_NN.pipeLane.x
  const LY = BRIDGE_NN.pipeLane.y
  /** bridge drop points: just onto the bridge from the WI south edge / the WHP-N north edge */
  const ZW = WI.deck.z1 + BRIDGE_NN.dropInset // -127.6
  const ZN = WHP.deck.z0 - BRIDGE_NN.dropInset // -88.4
  /** WHP-N tie-in: under WHP-N's wellhead deck plate, just inside its north edge */
  const ZN2 = WHP.deck.z0 + 0.6 // -87.4
  const fromWhp = (x: number, yu: number): Vec3[] => [[x, yu, ZN2], [x, yu, ZN], [x, LY, ZN], [x, LY, ZW]]
  const C = WI.cellarY

  // ================================================================ SEAWATER LIFT (cellar deck)
  for (const [s2, z] of [['A', -146.5], ['B', -143.0]] as const)
    E('caissonPump', `P-W300${s2}`, `Seawater Lift Pump ${s2} (water injection)`, 'utilities', [3.0, z], 0, { driver: 'electric', motorKw: 600, caissonOD: 0.9, caissonLength: 30, dischargeNps: 10, rating: 150 }, {
      y: C, design: { capacity: '2 × 100 %, 320 m³/h @ 7 barg', notes: 'Electric submersible-motor caisson pump, suction strainer at EL −10, biocide dosed down the caisson' },
    })
  E('chemSkid', 'X-W330', 'Seawater Filtration Package (coarse + fine)', 'utilities', [5.5, -149.5], 0, { skidL: 5.5, skidW: 3.0, tanks: 3, outlets: 0 }, {
    extra: [
      { id: 'N1', name: 'Raw seawater inlet', base: [2.75, 0.8, 0], dir: [1, 0, 0], nps: 10, neck: 0.3, rating: 150 },
      { id: 'N2', name: 'Filtered water outlet', base: [-2.75, 0.8, 0], dir: [-1, 0, 0], nps: 10, neck: 0.3, rating: 150 },
    ],
    design: { capacity: '320 m³/h', notes: 'Self-cleaning 80 µm coarse strainers + 3 × 50 % dual-media fine filters (2 µm, 98 %), automatic backwash on ΔP' },
  })
  E('verticalVessel', 'V-W320', 'Vacuum Deaerator Tower', 'utilities', [7.0, -140.5], 0, { id: 2.2, tt: 6.5, elevation: 2.0, support: 'skirt', internals: 'vane', platform: true, inletNps: 10, gasNps: 3, liquidNps: 12, psvNps: 3, rating: 150 }, {
    rename: { N1: 'Filtered seawater inlet (spray header)', N2: 'Vacuum / stripped gas to vacuum pumps', N3: 'Deaerated water outlet', N4: 'Vacuum breaker / PSV' },
    design: { pressure: '−0.95 / 3.5 barg', capacity: '320 m³/h', notes: 'Two-stage packed vacuum tower: dissolved O₂ from ~8 ppm down to < 10 ppb, sump sized for 3 min pump suction hold-up; elevated for pump NPSH' },
  })
  for (const [s2, z] of [['A', -137.5], ['B', -142.0]] as const)
    E('pumpPackage', `P-W310${s2}`, `Water Injection Pump ${s2}`, 'utilities', [18.0, z], 180, { stages: 4, motorKw: 2600, baseL: 5.2, baseW: 1.9, rating: 900, suctionNps: 12, dischargeNps: 10 }, {
      rename: { N1: 'Suction (deaerated water)', N2: 'High-pressure discharge' },
      design: { pressure: '230 barg discharge', capacity: '2 × 50 %, 20 000 bwpd each', notes: 'Multistage barrel pump, 2.6 MW VSD motor powered from Alpha over the WHP-N cable trays; balance drum + mechanical seals with seal-water' },
    })
  E('chemSkid', 'C-W340', 'Chemical Injection Package (biocide + O₂ scavenger)', 'utilities', [1.0, -140.5], 0, { skidL: 3.2, skidW: 2.2, tanks: 2, outlets: 2 }, {
    rename: { N1: 'O₂ scavenger to the injection pump suction header', N2: 'Biocide to the lift-pump caissons' },
    design: { capacity: '2 × 3 m³', notes: 'Ammonium bisulphite O₂ scavenger (continuous), THPS / glutaraldehyde biocide (batch, weekly)' },
  })
  E('verticalVessel', 'V-W381', 'Instrument Air Receiver', 'utilities', [8.6, -137.2], 0, { id: 0.8, tt: 2.0, elevation: 0.6, support: 'legs', internals: 'mesh', platform: false, inletNps: 2, gasNps: 1, liquidNps: 1, psvNps: 1, rating: 300 }, {
    rename: { N1: 'Air inlet (from WHP-N)', N2: 'Air outlet', N3: 'Condensate drain' },
    design: { pressure: '10 barg', capacity: '1.5 m³, 30 min hold-up for ESDV-W401 and the filter backwash valves' },
  })
  E('module', 'B-W395', 'Local Equipment Room (switchgear + injection pump VSDs)', 'utilities', [3.8, -132.6], 0, { sizeX: 10, sizeY: 3.8, sizeZ: 6 }, {
    design: { notes: '11 kV switchboard fed from Alpha, 2 × 3 MVA VSDs for the injection pumps, 690 V MCC, UPS, RTU / ESD / F&G panels; pressurised, A60' },
  })
  {
    const m = eqBy.get('B-W395')
    const doors: ModuleDoor[] = [{ id: 'D1', wall: '+x', at: 0, width: 1.2 }, { id: 'D2', wall: '-z', at: -2.5, width: 1.0 }]
    if (m?.kind === 'module') Object.assign(m, { interior: 'switchgear' as NonNullable<Module['interior']>, doors })
  }

  // ================================================================ LIFT → FILTERS → DEAERATOR
  const fa = face('P-W300A', 'N1')
  const fb = face('P-W300B', 'N1')
  const fi = face('X-W330', 'N1')
  const XL = 9.6
  const lift = L(WI_LINES.lift, 'water', 'utilities', 10, 'A1A', [fa, [XL, fa[1], fa[2]], [XL, fa[1], fi[2]], [XL, fi[1], fi[2]], fi], eqEnd('P-W300A', 'N1'), eqEnd('X-W330', 'N1'), {
    design: { pressure: '10 barg', notes: 'Raw seawater lift header, cellar deck → filtration package' },
  })
  VS('NRV-W301A', 'check', lift, 0, 1.15)
  IS('PT-W301', 'PT', lift, 1, 1.6, { range: '0–12', unit: 'barg', nominal: 6.8, alarms: { lo: 4.5, loLo: 3.5 } })
  IS('FT-W301', 'FT', lift, 2, 3.4, { range: '0–500', unit: 'm³/h', nominal: 268 })
  const XB = 6.5
  const lb = L('10"-SW-W3002-A1A-N', 'water', 'utilities', 10, 'A1A', [fb, [XB, fb[1], fb[2]], [XB, fb[1], fa[2]]], eqEnd('P-W300B', 'N1'), { line: lift })
  VS('NRV-W301B', 'check', lb, 0, 1.2)
  const fo = face('X-W330', 'N2')
  const di = face('V-W320', 'N1')
  const XF = 1.6
  const filt = L(WI_LINES.filtered, 'water', 'utilities', 10, 'A1A', [fo, [XF, fo[1], fo[2]], [XF, di[1], fo[2]], [XF, di[1], di[2]], di], eqEnd('X-W330', 'N2'), eqEnd('V-W320', 'N1'), {
    design: { pressure: '6 barg', notes: 'Filtered seawater to the deaerator spray header' },
  })
  VS('HV-W331', 'butterfly', filt, 3, 1.6, { actuator: 'gear' })
  IS('PT-W331', 'PT', filt, 2, 4.6, { range: '0–10', unit: 'barg', nominal: 4.1 })
  IE('PDT-W330', 'PDT', 'X-W330', [5.5, 1.9, -149.5 + 1.5], [0, 0, 1], { range: '0–2', unit: 'bar', nominal: 0.35, alarms: { hi: 1.0 } })
  IE('AT-W330', 'AT', 'X-W330', [4.0, 1.9, -149.5 + 1.5], [0, 0, 1], { range: '0–10', unit: 'NTU turbidity', nominal: 0.6, alarms: { hi: 2 } })
  // deaerator overhead to the vacuum pumps (on the tower platform) and its vacuum breaker / PSV
  const dg = face('V-W320', 'N2')
  L('3"-VA-W3202-A1A-N', 'instrumentAir', 'utilities', 3, 'A1A', [dg, [dg[0], dg[1] + 0.6, dg[2]], [dg[0] + 0.9, dg[1] + 0.6, dg[2]]], eqEnd('V-W320', 'N2'), { offDeck: 'Liquid-ring vacuum pumps (deaerator overhead)' })
  PSVatm('PSV-W3200', 'V-W320', 'N4', [0, 0, 1], 'W3209', '3.5 barg / −0.95 barg', 0.5, 1.6)
  IE('LT-W320', 'LT', 'V-W320', [7.0, 2.9, -140.5 + 1.25], [0, 0, 1], { range: '0–100', unit: '%', nominal: 50, alarms: { lo: 30, loLo: 15, hi: 70, hiHi: 85 } })
  IE('PT-W320', 'PT', 'V-W320', [7.0 - 1.25, 7.6, -140.5], [-1, 0, 0], { range: '-1–1', unit: 'barg', nominal: -0.93, alarms: { hi: -0.8 } })

  // ================================================================ INJECTION PUMPS
  const d3 = face('V-W320', 'N3')
  const sa = face('P-W310A', 'N1')
  const sb = face('P-W310B', 'N1')
  const YS = 3.6
  const XS1 = r3(d3[0] + 1.0)
  const XS2 = 14.8
  const suct = L(WI_LINES.suction, 'water', 'utilities', 12, 'A1A', [d3, [XS1, d3[1], d3[2]], [XS1, YS, d3[2]], [XS2, YS, d3[2]], [XS2, YS, sa[2]], [XS2, sa[1], sa[2]], sa], eqEnd('V-W320', 'N3'), eqEnd('P-W310A', 'N1'), {
    design: { pressure: '3.5 barg', notes: 'Deaerated water suction header (O₂ < 10 ppb) to the injection pumps' },
  })
  IS('AT-W321', 'AT', suct, 2, 1.2, { range: '0–100', unit: 'ppb O₂', nominal: 7, alarms: { hi: 20, hiHi: 50 } })
  IS('PT-W321', 'PT', suct, 2, 4.6, { range: '0–6', unit: 'barg', nominal: 1.8, alarms: { lo: 0.8, loLo: 0.5 } })
  VS('HV-W312A', 'gate', suct, 4, 1.35, { actuator: 'gear', design: { notes: 'Pump A suction isolation' } })
  const XSB = 12.5
  const XSB2 = 15.0
  const sbl = L('12"-WI-W3202-A1A-N', 'water', 'utilities', 12, 'A1A', [[XSB, YS, d3[2]], [XSB, YS, sb[2]], [XSB2, YS, sb[2]], [XSB2, sb[1], sb[2]], sb], { line: suct }, eqEnd('P-W310B', 'N1'))
  VS('HV-W312B', 'gate', sbl, 2, 1.35, { actuator: 'gear', design: { notes: 'Pump B suction isolation' } })
  // discharge header (from pump B), pump A tees in from below
  const na = face('P-W310A', 'N2')
  const nb = face('P-W310B', 'N2')
  const YH = 4.4
  const ZH = -130.6
  const inj = L(WI_LINES.injection, 'water', 'utilities', 10, 'E9A', [nb, [nb[0], YH, nb[2]], [nb[0], YH, ZH], [LX_WI, YH, ZH], [LX_WI, YH, ZW], [LX_WI, LY, ZW], [LX_WI, LY, ZN], [LX_WI, -1.6, ZN], [LX_WI, -1.6, ZN2]], eqEnd('P-W310B', 'N2'), { offDeck: 'To WHP-N injector XT-N106 / WI manifold' }, {
    design: { pressure: '230 barg', notes: 'Treated seawater, 40 000 bwpd: over the north-north bridge pipe lane to WHP-N (injector N-06 and the subsea WI manifold)' },
  })
  VS('NRV-W311B', 'check', inj, 0, 1.45)
  VS('HV-W313B', 'gate', inj, 1, 1.5, { actuator: 'gear', design: { notes: 'Pump B discharge isolation' } })
  const s1 = segLen(lineBy.get(inj)!, 1)
  VS('ESDV-W401', 'esdv', inj, 1, s1 - 2.2, { actuator: 'pistonSpring', failAction: 'FC', up: [1, 0, 0], design: { notes: 'Injection header ESDV, closes on PSD / ESD (and WHP-N shut-in)' } })
  IS('PT-W311', 'PT', inj, 1, s1 - 4.6, { range: '0–300', unit: 'barg', nominal: 226, alarms: { lo: 150, hi: 245, hiHi: 255 } })
  IS('FT-W401', 'FT', inj, 2, 3.5, { range: '0–60 000', unit: 'bwpd', nominal: 40000, alarms: { lo: 15000 } })
  IS('TT-W401', 'TT', inj, 2, 5.2, { range: '0–60', unit: '°C', nominal: 14 })
  VS('HV-W403', 'gate', inj, 5, 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, WI end' } })
  VS('HV-W404', 'gate', inj, 5, segLen(lineBy.get(inj)!, 5) - 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, WHP-N end' } })
  const ia1 = L('10"-WI-W4002-E9A-N', 'water', 'utilities', 10, 'E9A', [na, [na[0], YH, na[2]]], eqEnd('P-W310A', 'N2'), { line: inj })
  VS('NRV-W311A', 'check', ia1, 0, 1.45)
  for (const [s2, z] of [['A', -137.5], ['B', -142.0]] as const) {
    IE(`PT-W31${s2 === 'A' ? 4 : 5}`, 'PT', `P-W310${s2}`, [18.0 - 2.2, 1.4, z + 0.75], [0, 0, 1], { range: '0–300', unit: 'barg', nominal: 224 })
    IE(`TT-W31${s2 === 'A' ? 6 : 7}`, 'TT', `P-W310${s2}`, [18.0 + 1.6, 1.3, z + 0.75], [0, 0, 1], { range: '0–150', unit: '°C bearing', nominal: 68, alarms: { hi: 90, hiHi: 105 } })
  }

  // ================================================================ CHEMICALS
  {
    const o1 = face('C-W340', 'N1')
    const XC = 3.8
    const o2l = L('1"-CI-W3401-E9A-N', 'chemical', 'utilities', 1, 'E9A', [o1, [XC, o1[1], o1[2]], [XC, 4.2, o1[2]], [XC, 4.2, -143.0], [11.6, 4.2, -143.0], [11.6, 4.2, d3[2]], [11.6, YS, d3[2]]], eqEnd('C-W340', 'N1'), { line: suct }, {
      design: { notes: 'Ammonium bisulphite O₂ scavenger, 5–10 ppm' },
    })
    VS('XV-W3401', 'needle', o2l, 3, 0.55, { up: [0, 0, -1] })
    VS('NRV-W3401', 'check', o2l, 3, 1.45)
    const o2 = face('C-W340', 'N2')
    const XC2 = 3.2
    const bl = L('1"-CI-W3402-E9A-N', 'chemical', 'utilities', 1, 'E9A', [o2, [XC2, o2[1], o2[2]], [XC2, -3.0, o2[2]], [XC2, -3.0, -144.8]], eqEnd('C-W340', 'N2'), { offDeck: 'Biocide dosing to the lift-pump caissons P-W300A/B' }, {
      design: { notes: 'THPS biocide, batch dosed down the caissons' },
    })
    VS('XV-W3402', 'needle', bl, 1, 0.42, { up: [1, 0, 0] })
  }

  // ================================================================ INSTRUMENT AIR + FIREWATER FROM WHP-N
  {
    const n1 = face('V-W381', 'N1')
    const XI = r3(n1[0] - 1.0)
    const ia = L('2"-IA-W2801-A1A-N', 'instrumentAir', 'utilities', 2, 'A1A', [...fromWhp(LX_IA, -1.0), [LX_IA, -1.0, ZW], [LX_IA, -1.0, n1[2]], [XI, -1.0, n1[2]], [XI, n1[1], n1[2]], n1], { offDeck: 'From WHP-N instrument air (V-N281 header)' }, eqEnd('V-W381', 'N1'))
    VS('HV-W2801', 'ball', ia, 2, 1.2, { actuator: 'lever' })
    IS('PT-W2801', 'PT', ia, 2, 36.5, { range: '0–12', unit: 'barg', nominal: 7.9, alarms: { lo: 6.5, loLo: 5.5 } })
    VS('NRV-W2802', 'check', ia, 4, 4.0)
    const o2 = face('V-W381', 'N2')
    L('1"-IA-W2803-A1A-N', 'instrumentAir', 'utilities', 1, 'A1A', [o2, [o2[0], o2[1] + 0.55, o2[2]], [o2[0] + 0.9, o2[1] + 0.55, o2[2]]], eqEnd('V-W381', 'N2'), { offDeck: 'IA distribution (ESDV-W401, filter backwash valves)' })
    const dr = face('V-W381', 'N3')
    L('1"-OD-W2804-A1A-N', 'drain', 'utilities', 1, 'A1A', [dr, [dr[0] + 0.45, dr[1], dr[2]], [dr[0] + 0.45, -1.2, dr[2]]], eqEnd('V-W381', 'N3'), { offDeck: 'Open drain' })
    PSVatm('PSV-W2810', 'V-W381', 'N4', [0, 0, -1], 'W2809', '10 barg', 0.5, 2.0)
    IE('PT-W2811', 'PT', 'V-W381', [8.6 + 0.52, 1.9, -137.2], [1, 0, 0], { range: '0–12', unit: 'barg', nominal: 7.8, alarms: { lo: 6.5, loLo: 5.5 } })
  }
  {
    const ZH2 = -144.5
    const fw = L('6"-FW-W2851-F1A-N', 'firewater', 'safety', 6, 'F1A', [...fromWhp(LX_FW, -1.5), [LX_FW, -1.5, ZW], [LX_FW, -1.5, ZH2], [LX_FW, 1.1, ZH2]], { offDeck: 'From WHP-N firewater (Alpha ring via the north bridge)' }, { offDeck: 'Hose reel / hydrant station HR-W1 (capped)' }, {
      design: { pressure: '16 barg', notes: 'GRP-lined CuNi 90/10, hose reels and hydrant for the pump and laydown areas' },
    })
    VS('HV-W2850', 'butterfly', fw, 2, 1.4, { actuator: 'gear', design: { notes: 'Bridge isolation, locked open' } })
    IS('PT-W2851', 'PT', fw, 4, 8.0, { range: '0–25', unit: 'barg', nominal: 13.2, alarms: { lo: 10 } })
  }

  // ================================================================ FIRE & GAS (little hydrocarbon: electrical + rotating equipment)
  const aim = (from: [number, number], to: [number, number]): Vec3 => {
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const l = Math.hypot(dx, dz) || 1
    return [r3(dx / l), 0, r3(dz / l)]
  }
  let fd = 1
  const FD = (host: string, x: number, y: number, z: number, target: [number, number]) => IE(`FD-W8${String(fd++).padStart(2, '0')}`, 'FD', host, [x, y, z], aim([x, z], target))
  FD('P-W310B', 14.4, 3.4, -145.0, [18.5, -139.8]) // injection pumps (lube oil, motors) from the north-west
  FD('P-W310A', 21.4, 3.4, -133.6, [17.5, -140]) // … and from the south-east
  FD('X-W330', 10.4, 3.4, -153.2, [5, -146]) // filtration + chemical skid
  FD('V-W320', -1.4, 3.4, -136.6, [8, -143]) // deaerator / chem skid / LER east wall
  FD('V-W320', -1.4, 3.4, -155.4, [11, -141]) // north-west corner: filters, deaerator, pump area
  FD('P-W300A', -1.4, C + 3.4, -151.0, [3.5, -144.5]) // cellar: lift-pump motors
  FD('P-W300B', 9.0, C + 3.4, -139.6, [3.0, -145.5])
  let gd = 1
  const GD = (host: string, at: Vec3) => IE(`GD-W8${String(10 + gd++)}`, 'GD', host, at, [0, 0, 1])
  GD('B-W395', [3.8 - 3.5, 4.3, -135.6 - 0.2]) // LER HVAC intake (gas at the intake shuts the dampers)
  GD('B-W395', [3.8 + 3.5, 4.3, -135.6 - 0.2])
  let hd = 1
  for (const x of [0.5, 7.0]) IE(`HD-W85${hd++}`, 'HD', 'B-W395', [x, 3.45, -132.6], [0, 1, 0])
  let sdn = 1
  for (const x of [1.0, 6.5]) IE(`SD-W84${sdn++}`, 'SD', 'B-W395', [x, 3.45, -131.6], [1, 0, 0])
  let mac = 1
  const MAC = (x: number, z: number, dir: Vec3, y = 1.3) => IE(`MAC-W83${mac++}`, 'MAC', 'B-W395', [x, y, z], dir)
  MAC(BRIDGE_NN.walk.x1 + 0.35, WI.deck.z1 - 0.6, [-1, 0, 0]) // WI end of the bridge
  MAC(9.3, -133.4, [1, 0, 0]) // LER door
  MAC(-1.4, -144.4, [1, 0, 0]) // west escape route / cellar stair head
  MAC(21.3, -150.2, [-1, 0, 0]) // laydown / crane
  MAC(14.6, -155.4, [0, 0, 1]) // north edge
  MAC(-1.4, -141.0, [1, 0, 0], C + 1.3) // cellar deck, by the lift pumps
  // north-north bridge, WHP-N end (on WHP-N's north deck edge; host is WHP-N's vent KO drum)
  IE(`MAC-W83${mac++}`, 'MAC', 'V-N290', [BRIDGE_NN.walk.x1 + 0.35, 1.3, WHP.deck.z0 + 0.6], [-1, 0, 0])
}
