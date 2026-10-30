/**
 * Alpha field expansion — everything added to the authored Alpha production deck:
 *
 *  Wells (cellar deck, EL +20)   5 wellheads + christmas trees on the conductors (the 6th slot is
 *                                under the drilling rig), individual 4" flowlines rising under the
 *                                production deck into the M-1000 manifold slot risers
 *  Produced water                hydrocyclone → degasser → produced-water pumps → overboard caisson
 *  Closed drains                 rack drain header → closed drain drum → drain pump → cellar caisson
 *  Gas treatment                 TEG contactor + regeneration skid, fuel gas scrubber + superheater
 *                                → fuel gas header on the rack
 *  Utilities                     instrument air compressor + receiver → IA header; cooling-medium
 *                                expansion drum + circulation pumps + seawater cooler; methanol
 *                                injection to the wellheads; firewater pump + foam modules
 *  Accommodation platform (LQ)   control room, emergency generator, diesel + potable-water tanks,
 *                                linked over the south bridge by diesel, potable water and firewater
 *  Fire & gas                    flame, point gas, open-path gas, heat and smoke detectors and manual
 *                                call points across every area
 *  …plus PSVs on every new vessel and extra gauges / transmitters on the existing lines.
 *
 * Deck-local coordinates (see model/site.ts). Built from the component library so the nozzle
 * layouts match the builder, and routed with the compiler's orthogonal router where a hand route
 * isn't needed.
 */
import type { Equipment, EquipmentKind, Instrument, InstrumentType, Nozzle, PipeLine, Service, SystemId, Valve, ValveType, Vec3 } from './types'
import { componentDef, instantiate, resolveParams } from '../library/components'
import type { NozzleTemplate, Params } from '../library/types'
import { orthoRoute, placeOnLine, valveClear, INSTRUMENT_DEFAULTS } from '../library/compile'
import { elbowRadius, GASKET } from './catalog'
import { psvGeometry } from '../scene/equipment/Valve'
import { BRIDGE_S, CELLAR_FLOOR, RIG_SLOT, WEATHER_FLOOR, WELL_SLOTS } from './site'

export interface AlphaArrays {
  equipment: Equipment[]
  lines: PipeLine[]
  valves: Valve[]
  instruments: Instrument[]
}

export interface AlphaConsts {
  FLARE_Y: number
  FLARE_Z: number
  OVER: number
  CELLAR: number
  onTier: (tier: 1 | 2, nps: number) => number
  /** flare header tag (PSV discharges tee into it) */
  flareHeader: string
  /** manifold receiving the well flowlines */
  manifold: string
}

const r3 = (v: number) => Math.round(v * 1000) / 1000
const P = (...v: number[]) => v.map(r3) as Vec3

export function extendAlpha(A: AlphaArrays, K: AlphaConsts) {
  const eqBy = new Map<string, Equipment>()
  const lineBy = new Map<string, PipeLine>()
  for (const e of A.equipment) eqBy.set(e.tag, e)
  for (const l of A.lines) lineBy.set(l.tag, l)

  // ---------------------------------------------------------------- helpers
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
    if (!n) throw new Error(`alphaSite: nozzle ${tag}/${id} missing`)
    return n
  }
  const face = (tag: string, id: string) => N(tag, id).pos
  const spec = (nps: number, rating = 300) => (rating >= 900 ? 'E9A' : rating >= 600 ? 'D6A' : nps >= 1 && rating >= 300 ? 'C3A' : 'B1A')
  function L(tag: string, service: Service, system: SystemId, nps: number, route: Vec3[], from: PipeLine['from'], to: PipeLine['to'], o: Partial<PipeLine> = {}) {
    const l: PipeLine = { tag, service, system, nps, schedule: nps >= 10 ? 'XS' : '80', spec: o.spec ?? spec(nps), route: route.map((v) => P(...v)), from, to, design: {}, ...o }
    A.lines.push(l)
    lineBy.set(tag, l)
    return tag
  }
  const eqEnd = (tag: string, nozzle: string) => ({ equipment: tag, nozzle })
  function VA(tag: string, type: ValveType, line: string, at: number, o: Partial<Valve> = {}) {
    const l = lineBy.get(line)!
    const { seg, t } = placeOnLine(l, at, valveClear(type, l.nps, l.spec))
    A.valves.push({ tag, type, line, seg, t: r3(t), normally: 'open', design: {}, ...o })
  }
  const ALARMS: Partial<Record<InstrumentType, Instrument['alarms']>> = {
    GD: { hi: 20, hiHi: 60 }, OGD: { hi: 1, hiHi: 3 }, FD: { hi: 30, hiHi: 60 }, HD: { hi: 68, hiHi: 90 }, SD: { hi: 2, hiHi: 5 }, MAC: { hi: 12 },
  }
  function IL(tag: string, type: InstrumentType, line: string, at: number, o: Partial<Instrument> = {}) {
    const l = lineBy.get(line)!
    const { seg, t } = placeOnLine(l, at, elbowRadius(l.nps) + 0.15)
    const d = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { line, seg, t: r3(t) }, dir: [0, 1, 0], range: d.range, unit: d.unit, nominal: d.nominal, alarms: ALARMS[type], ...o })
  }
  function IE(tag: string, type: InstrumentType, equipment: string, at: Vec3, dir: Vec3, o: Partial<Instrument> = {}) {
    const d = INSTRUMENT_DEFAULTS[type]
    A.instruments.push({ tag, type, on: { equipment, at: P(...at) }, dir, range: d.range, unit: d.unit, nominal: d.nominal, alarms: ALARMS[type], ...o })
  }
  /** level transmitter on the side of a vessel */
  function LTon(tag: string, eqTag: string, nominal = 50) {
    const e = eqBy.get(eqTag)!
    if (e.kind === 'horizontalVessel') {
      const ro = e.id / 2 + e.wall
      IE(tag, 'LT', eqTag, [e.position[0] + e.tt * 0.12, e.position[1] - 0.15, e.position[2] - ro - 0.1], [0, 0, -1], { range: '0–100', unit: '%', nominal, alarms: { lo: 20, hi: 80, loLo: 10, hiHi: 90 } })
    } else if (e.kind === 'verticalVessel') {
      const ro = e.id / 2 + e.wall
      IE(tag, 'LT', eqTag, [e.position[0], e.elevation + 0.9, e.position[2] + ro + 0.1], [0, 0, 1], { range: '0–100', unit: '%', nominal, alarms: { hi: 40, hiHi: 60 } })
    }
  }
  /** PSV on a vessel nozzle: discharge to the flare header (tee from above) or to atmosphere */
  function PSV(tag: string, eqTag: string, nz: string, outDir: Vec3, seq: string, set: string, to: 'flare' | 'atmosphere', minRun = 0) {
    const n = N(eqTag, nz)
    const g = psvGeometry(n.nps)
    const pos: Vec3 = [n.pos[0] + n.dir[0] * (g.outletY + GASKET) + outDir[0] * g.outletX, n.pos[1] + n.dir[1] * (g.outletY + GASKET), n.pos[2] + n.dir[2] * (g.outletY + GASKET) + outDir[2] * g.outletX]
    const run = Math.max(minRun, 0.45 + g.outletNps * 0.05)
    const p1: Vec3 = [pos[0] + outDir[0] * run, pos[1], pos[2] + outDir[2] * run]
    let line: string
    if (to === 'flare') {
      const up = Math.max(K.OVER + 0.3, pos[1])
      line = L(`${g.outletNps}"-FL-${seq}-B1A-N`, 'flare', 'flare', g.outletNps, [pos, p1, [p1[0], up, p1[2]], [p1[0], up, K.FLARE_Z], [p1[0], K.FLARE_Y, K.FLARE_Z]], { offDeck: `${tag} outlet` }, { line: K.flareHeader })
    } else {
      line = L(`${g.outletNps}"-VA-${seq}-A1A-N`, 'instrumentAir', eqBy.get(eqTag)!.system, g.outletNps, [pos, p1, [p1[0], pos[1] + 2.2, p1[2]]], { offDeck: `${tag} outlet` }, { offDeck: 'Atmosphere (tail pipe, safe location)' })
    }
    A.valves.push({ tag, type: 'psv', line, seg: -1, t: 0, mount: { equipment: eqTag, nozzle: nz }, outletDir: outDir, normally: 'closed', design: { notes: `Set ${set}` } })
  }
  const down = (p: Vec3, y = K.CELLAR): Vec3 => [p[0], y, p[2]]

  // ================================================================ WELLS (cellar deck)
  // manifold: one slot per well (5 trees + the slot under the rig)
  const man = eqBy.get(K.manifold)!
  if (man.kind !== 'manifold') throw new Error('alphaSite: manifold expected')
  const mL = man.length
  const slotX = (i: number) => man.position[0] - mL / 2 + (mL * (i + 0.5)) / man.slots
  const maxOd = Math.max(...man.headers.map((h) => (h.nps * 25.4 + 10) / 1000))
  const riserZ = man.position[2] + Math.max(...man.headers.map((h) => h.z), 0) + maxOd / 2 + 0.55
  const WELL_TYPES = ['oilProducer', 'oilProducer', 'gasProducer', 'oilProducer', 'oilProducer'] as const
  const trees = WELL_SLOTS.filter(([x, z]) => !(x === RIG_SLOT[0] && z === RIG_SLOT[1]))
  // manifold slot per tree: inner-row (z -10.5) wells take the western, lower slots so the
  // flowlines under the deck never cross (further west = lower run)
  const order = trees.map((t, i) => ({ t, i })).sort((a, b) => (b.t[1] - a.t[1]) || (a.t[0] - b.t[0]))
  const slotOf = new Map(order.map((o, s) => [o.i, s]))
  trees.forEach(([x, z], i) => {
    const k = slotOf.get(i)!
    const tag = `XT-1${i + 1}0`
    const wt = WELL_TYPES[i]
    E('xmasTree', tag, `Well A-0${i + 1} Wellhead & Tree`, 'wells', [x, z], 0, { wellType: wt, wellheadHeight: 0.9 }, {
      y: CELLAR_FLOOR,
      design: { pressure: '345 barg (5000 psi) API 6A', material: 'AISI 4130 / Inconel-clad', notes: `Conductor slot ${i + 1} → ${K.manifold} slot ${k + 1}; ${wt === 'gasProducer' ? 'gas' : 'oil'} producer, SCSSV at 300 m` },
    })
    // 4" flowline: wing → up under the production deck → west → manifold slot riser
    const f = face(tag, 'N1')
    const lane = x + (z < -12 ? 1.6 : 1.75)
    const y = -4.6 + 0.4 * k
    const rx = slotX(k)
    const ft = L(`4"-PM-10${i + 1}0-E9A-H`, 'multiphase', 'wells', 4, [f, [lane, f[1], z], [lane, y, z], [lane, y, riserZ], [rx, y, riserZ], [rx, -2.5, riserZ]], eqEnd(tag, 'N1'), { offDeck: `${K.manifold} slot ${k + 1} riser` }, { insulation: 'H', design: { pressure: '345 barg', notes: 'Flowline, Duplex, heat-traced' } })
    VA(`XV-10${i + 1}1`, 'ball', ft, 0.42, { actuator: 'pistonSpring', failAction: 'FC', design: { notes: 'Flowline wing isolation' } })
    IL(`PT-10${i + 1}1`, 'PT', ft, 0.62, { unit: 'barg', range: '0–250', nominal: wt === 'gasProducer' ? 92 : 46, alarms: { hi: 120, hiHi: 160 } })
    IL(`TT-10${i + 1}1`, 'TT', ft, 0.72, { unit: '°C', range: '0–150', nominal: 74 })
    // F&G at the wellhead: point gas detector beside the tree
    IE(`GD-81${i + 1}0`, 'GD', tag, [x - 0.8, CELLAR_FLOOR + 2.4, z + 0.7], [0, 0, 1])
  })

  // ================================================================ PRODUCED WATER
  E('horizontalVessel', 'X-4200', 'Produced Water Hydrocyclone Package', 'producedWater', [-14.5, 7.4], 180, { service: 'ko', id: 0.9, tt: 3.2, elevation: 1.0, inletNps: 4, gasNps: 2, liquidNps: 4, psvNps: 2, rating: 300 }, {
    rename: { N2: 'Oil reject', N3: 'Clean water outlet' }, design: { pressure: '19 barg', capacity: '7 000 m³/d', notes: '24 deoiling liners, PDR control' },
  })
  E('horizontalVessel', 'V-4100', 'Produced Water Degasser', 'producedWater', [-22.5, 7.4], 180, { service: '2-phase', id: 1.8, tt: 5, elevation: 1.2, inletNps: 4, gasNps: 3, liquidNps: 4, psvNps: 2, rating: 150 }, {
    rename: { N2: 'Gas to LP flare', N3: 'Water outlet' }, design: { pressure: '3.5 barg', notes: 'Flash degassing, 5 min retention' },
  })
  for (const [s, z] of [['A', 11.6], ['B', 14.0]] as const)
    E('pumpPackage', `P-4300${s}`, `Produced Water Pump ${s}`, 'producedWater', [-25.2, z], 0, { suctionNps: 4, dischargeNps: 3, motorKw: 55, baseL: 2.4, baseW: 0.9, rating: 150 }, { design: { capacity: '150 m³/h', notes: '2 × 100 %' } })

  const pwHdr = '4"-PW-9601-C3A-N'
  const hdrY = lineBy.get(pwHdr)!.route[1][1]
  const pw1 = L('4"-PW-4101-C3A-N', 'water', 'producedWater', 4, orthoRoute([-11.3, hdrY, 1.25], N('X-4200', 'N1'), 4, N('X-4200', 'N1').pos[1], 'zx'), { line: pwHdr }, eqEnd('X-4200', 'N1'))
  const pw2 = L('4"-PW-4102-C3A-N', 'water', 'producedWater', 4, orthoRoute(N('X-4200', 'N3'), N('V-4100', 'N1'), 4), eqEnd('X-4200', 'N3'), eqEnd('V-4100', 'N1'))
  const n3 = face('V-4100', 'N3')
  const sB = face('P-4300B', 'N1')
  const sA = face('P-4300A', 'N1')
  const pw4 = L('4"-PW-4104-C3A-N', 'water', 'producedWater', 4, [n3, [n3[0], 0.45, n3[2]], [n3[0], 0.45, 9.4], [-22.6, 0.45, 9.4], [-22.6, 0.45, sB[2]], [-22.6, sB[1], sB[2]], sB], eqEnd('V-4100', 'N3'), eqEnd('P-4300B', 'N1'))
  const pw5 = L('4"-PW-4105-C3A-N', 'water', 'producedWater', 4, [[-22.6, 0.45, sA[2]], [-22.6, sA[1], sA[2]], sA], { line: pw4 }, eqEnd('P-4300A', 'N1'))
  const pwd: string[] = []
  for (const s of ['A', 'B']) {
    const d = face(`P-4300${s}`, 'N2')
    const y = s === 'A' ? 2.2 : 2.6
    pwd.push(L(`3"-PW-430${s === 'A' ? 6 : 7}-B1A-N`, 'water', 'producedWater', 3, [d, [d[0], y, d[2]], [-28.3, y, d[2]], [-28.3, K.CELLAR, d[2]]], eqEnd(`P-4300${s}`, 'N2'), { offDeck: 'Overboard caisson (cellar deck)' }))
  }
  const rj = face('X-4200', 'N2')
  const pwR = L('2"-PO-4108-C3A-N', 'oil', 'producedWater', 2, [rj, [rj[0], 3.2, rj[2]], [-12.9, 3.2, rj[2]], [-12.9, 3.2, 5.4], [-12.9, K.CELLAR, 5.4]], eqEnd('X-4200', 'N2'), { offDeck: 'Reject oil → LP separator (via cellar)' })
  const g3 = face('V-4100', 'N2')
  // the header starts at x −23.6 (clear of the rack utility risers): run east to meet it
  const pwG = L('3"-FL-4103-B1A-N', 'flare', 'producedWater', 3, [g3, [g3[0], K.OVER + 0.3, g3[2]], [-23.0, K.OVER + 0.3, g3[2]], [-23.0, K.OVER + 0.3, K.FLARE_Z], [-23.0, K.FLARE_Y, K.FLARE_Z]], eqEnd('V-4100', 'N2'), { line: K.flareHeader })
  VA('HV-4101', 'gate', pw1, 0.25, { actuator: 'handwheel' })
  VA('PDV-4101', 'control', pw1, 0.7, { actuator: 'diaphragm', failAction: 'FC', design: { notes: 'Hydrocyclone inlet, pressure-differential ratio control' } })
  VA('HV-4102', 'gate', pw2, 0.5, { actuator: 'handwheel' })
  VA('PCV-4103', 'control', pwG, 0.3, { actuator: 'diaphragm', failAction: 'FO' })
  VA('HV-4301A', 'gate', pw5, 0.75, { actuator: 'handwheel' })
  VA('HV-4301B', 'gate', pw4, 0.93, { actuator: 'handwheel' })
  pwd.forEach((l, i) => {
    const s = 'AB'[i]
    VA(`NRV-4302${s}`, 'check', l, 0.33)
    VA(`HV-4302${s}`, 'gate', l, 0.5, { actuator: 'handwheel' })
  })
  VA('PDV-4108', 'control', pwR, 0.35, { actuator: 'diaphragm', failAction: 'FC' })
  VA('HV-4108', 'gate', pwR, 0.6, { actuator: 'handwheel' })
  IL('PDT-4101', 'PDT', pw1, 0.85, { range: '0–6', unit: 'bar', nominal: 2.1 })
  IL('FT-4106', 'FT', pwd[0], 0.62, { range: '0–200', unit: 'm³/h', nominal: 118 })
  IL('AT-4106', 'AT', pwd[0], 0.75, { range: '0–100', unit: 'ppm OiW', nominal: 14, alarms: { hi: 29, hiHi: 40 } })
  IL('PT-4103', 'PT', pwG, 0.15, { range: '0–6', unit: 'barg', nominal: 1.2 })
  IL('PG-4302A', 'PG', pwd[0], 0.12, { range: '0–25', unit: 'barg', nominal: 11 })
  IL('PG-4302B', 'PG', pwd[1], 0.12, { range: '0–25', unit: 'barg', nominal: 0.3 })
  LTon('LT-4100', 'V-4100', 45)
  LTon('LT-4200', 'X-4200', 50)
  PSV('PSV-4100', 'V-4100', 'N5', [0, 0, -1], '4109', '3.5 barg', 'flare')
  PSV('PSV-4200', 'X-4200', 'N5', [0, 0, -1], '4209', '19 barg', 'flare')

  // ================================================================ CLOSED DRAINS
  E('horizontalVessel', 'V-4400', 'Closed Drain Drum', 'drains', [-14.5, 14.0], 0, { service: 'ko', id: 1.6, tt: 4.2, elevation: 0.8, inletNps: 4, gasNps: 3, liquidNps: 3, psvNps: 2, rating: 150 }, {
    rename: { N2: 'Vent to flare', N3: 'Liquid to drain pump' }, design: { pressure: '3.5 barg', notes: 'Collects process drains from the rack header' },
  })
  E('pumpPackage', 'P-4500', 'Closed Drain Pump', 'drains', [-13.4, 16.9], 0, { suctionNps: 3, dischargeNps: 2, motorKw: 30, baseL: 2.2, baseW: 0.9, rating: 150 })
  const cdHdr = '6"-CD-9501-B1A-N'
  const cdY = lineBy.get(cdHdr)!.route[1][1]
  const d1 = face('V-4400', 'N1')
  const cd1 = L('4"-CD-4401-B1A-N', 'drain', 'drains', 4, [[-18.4, cdY, 0.45], [-18.4, 5.6, 0.45], [-18.4, 5.6, d1[2]], [-18.4, d1[1], d1[2]], d1], { line: cdHdr }, eqEnd('V-4400', 'N1'))
  const cd2 = L('3"-CD-4402-B1A-N', 'drain', 'drains', 3, orthoRoute(N('V-4400', 'N3'), N('P-4500', 'N1'), 3), eqEnd('V-4400', 'N3'), eqEnd('P-4500', 'N1'))
  const dd = face('P-4500', 'N2')
  const cd3 = L('2"-CD-4403-B1A-N', 'drain', 'drains', 2, [dd, [dd[0], 2.0, dd[2]], [-11.2, 2.0, dd[2]], [-11.2, K.CELLAR, dd[2]]], eqEnd('P-4500', 'N2'), { offDeck: 'Closed drain caisson (cellar deck)' })
  const dv = face('V-4400', 'N2')
  const cd4 = L('3"-FL-4404-B1A-N', 'flare', 'drains', 3, [dv, [dv[0], K.OVER + 0.3, dv[2]], [dv[0], K.OVER + 0.3, K.FLARE_Z], [dv[0], K.FLARE_Y, K.FLARE_Z]], eqEnd('V-4400', 'N2'), { line: K.flareHeader })
  VA('HV-4401', 'gate', cd1, 0.8, { actuator: 'handwheel' })
  VA('HV-4402', 'ball', cd2, 0.5, { actuator: 'lever' })
  VA('NRV-4403', 'check', cd3, 0.35)
  VA('LV-4403', 'control', cd3, 0.6, { actuator: 'diaphragm', failAction: 'FC' })
  VA('HV-4404', 'gate', cd4, 0.25, { actuator: 'handwheel', design: { notes: 'Locked open' } })
  LTon('LT-4400', 'V-4400', 30)
  PSV('PSV-4400', 'V-4400', 'N5', [0, 0, 1], '4409', '3.5 barg', 'flare')

  // ================================================================ GAS TREATMENT: TEG + FUEL GAS
  E('verticalVessel', 'T-5300', 'TEG Glycol Contactor', 'gasTreatment', [-20, 12.6], 0, { id: 1.3, tt: 6, elevation: 0.9, support: 'skirt', internals: 'vane', platform: true, inletNps: 8, gasNps: 8, liquidNps: 2, psvNps: 3, rating: 900 }, {
    rename: { N1: 'Wet gas inlet', N2: 'Dry gas outlet', N3: 'Rich TEG outlet' },
    extra: [{ id: 'N5', name: 'Lean TEG inlet', base: [0, 0.9 + 6 * 0.9, 0.65 + 0.029], dir: [0, 0, 1], nps: 2, neck: 0.3, rating: 900 }],
    design: { pressure: '145 barg', temperature: '40 °C', capacity: '60 MMscfd', notes: '8 structured-packing stages, dew point −18 °C' },
  })
  E('chemSkid', 'C-5350', 'TEG Regeneration Package', 'gasTreatment', [-19.6, 16.6], 0, { skidL: 4, skidW: 2.6, tanks: 2, outlets: 2 }, {
    rename: { N1: 'Rich TEG inlet', N2: 'Lean TEG outlet' }, design: { notes: 'Reboiler 204 °C, still column, surge drum, lean/rich exchanger' },
  })
  E('verticalVessel', 'V-5100', 'Fuel Gas Scrubber', 'gasTreatment', [-7.6, 12.2], 90, { id: 0.9, tt: 3, elevation: 0.8, support: 'legs', internals: 'mesh', platform: false, inletNps: 4, gasNps: 4, liquidNps: 2, psvNps: 2, rating: 600 }, {
    design: { pressure: '40 barg', capacity: '1.5 MMscfd' },
  })
  E('shellTube', 'E-5200', 'Fuel Gas Superheater', 'gasTreatment', [-4.2, 15.6], 0, { shellOd: 0.45, length: 2.8, elevation: 0.6, shellNps: 4, tubeNps: 2, rating: 600 }, {
    rename: { N3: 'Heating medium in', N4: 'Heating medium out' }, design: { notes: 'Superheats fuel gas 25 K above dew point for the turbines' },
  })
  const wg = face('T-5300', 'N1')
  const gt1 = L('8"-PG-5301-E9A-N', 'gas', 'gasTreatment', 8, [[wg[0] - 0.8, K.CELLAR, wg[2]], [wg[0] - 0.8, wg[1], wg[2]], wg], { offDeck: 'Wet gas from export compressor (cellar crossover)' }, eqEnd('T-5300', 'N1'))
  const dg = face('T-5300', 'N2')
  const t2 = K.onTier(2, 8)
  const gt2 = L('8"-PG-5302-E9A-N', 'gas', 'gasTreatment', 8, [dg, [dg[0], 8.2, dg[2]], [dg[0], 8.2, 0.6], [dg[0], t2, 0.6], [-6.0, t2, 0.6]], eqEnd('T-5300', 'N2'), { offDeck: 'Dry gas → export (rack, to K-2200 discharge)' })
  const fi = face('V-5100', 'N1')
  // scrubber inlet faces south: come over the top, drop south of it and turn north into the nozzle
  const fs = fi[2] + 0.55
  const fg1 = L('4"-FG-5303-D6A-N', 'gas', 'gasTreatment', 4, [[-9.5, t2, 0.6], [-9.5, 8.2, 0.6], [-9.5, 8.2, fs], [-9.5, fi[1], fs], [fi[0], fi[1], fs], fi], { line: gt2 }, eqEnd('V-5100', 'N1'))
  const fg2 = L('4"-FG-5304-D6A-N', 'gas', 'gasTreatment', 4, orthoRoute(N('V-5100', 'N2'), N('E-5200', 'N1'), 4), eqEnd('V-5100', 'N2'), eqEnd('E-5200', 'N1'))
  const fgHdr = '6"-FG-9201-C3A-N'
  const fgY = lineBy.get(fgHdr)!.route[1][1]
  const so = N('E-5200', 'N2')
  const fg3 = L('4"-FG-5305-D6A-N', 'gas', 'gasTreatment', 4, orthoRoute(so, [so.pos[0], fgY, -1.45], 4, 5.6, 'zx'), eqEnd('E-5200', 'N2'), { line: fgHdr })
  const sn = N('V-5100', 'N3')
  const sl: Vec3 = [sn.pos[0] + sn.dir[0] * 0.5, sn.pos[1], sn.pos[2] + sn.dir[2] * 0.5]
  const fg4 = L('2"-CD-5106-B1A-N', 'drain', 'gasTreatment', 2, [sn.pos, sl, down(sl)], eqEnd('V-5100', 'N3'), { offDeck: 'Closed drain (cellar)' })
  const rt = face('T-5300', 'N3')
  const ri = face('C-5350', 'N1')
  const tg1 = L('2"-TG-5306-E9A-N', 'chemical', 'gasTreatment', 2, [rt, [-18.7, rt[1], rt[2]], [-18.7, rt[1], 15.05], [ri[0] + 0.45, rt[1], 15.05], [ri[0] + 0.45, rt[1], ri[2]], [ri[0] + 0.45, ri[1], ri[2]], ri], eqEnd('T-5300', 'N3'), eqEnd('C-5350', 'N1'))
  const tg2 = L('2"-TG-5307-E9A-N', 'chemical', 'gasTreatment', 2, orthoRoute(N('C-5350', 'N2'), N('T-5300', 'N5'), 2), eqEnd('C-5350', 'N2'), eqEnd('T-5300', 'N5'))
  VA('ESDV-5301', 'esdv', gt1, 0.55, { actuator: 'pistonSpring', failAction: 'FC' })
  VA('HV-5302', 'gate', gt2, 0.5, { actuator: 'gear' })
  VA('HV-5303', 'ball', fg1, 0.75, { actuator: 'gear' })
  VA('PCV-5305', 'control', fg3, 0.35, { actuator: 'diaphragm', failAction: 'FC', design: { notes: 'Fuel gas pressure to 18 barg' } })
  VA('HV-5305', 'ball', fg3, 0.55, { actuator: 'lever' })
  VA('LV-5106', 'control', fg4, 0.5, { actuator: 'diaphragm', failAction: 'FC' })
  VA('LV-5306', 'control', tg1, 0.45, { actuator: 'diaphragm', failAction: 'FC' })
  VA('FV-5307', 'control', tg2, 0.6, { actuator: 'diaphragm', failAction: 'FO' })
  VA('NRV-5307', 'check', tg2, 0.8)
  IL('AT-5302', 'AT', gt2, 0.35, { range: '-40–20', unit: '°C dew pt', nominal: -18, alarms: { hi: -10 } })
  IL('FT-5302', 'FT', gt2, 0.8, { range: '0–80', unit: 'MMscfd', nominal: 51 })
  IL('PT-5305', 'PT', fg3, 0.7, { range: '0–40', unit: 'barg', nominal: 18, alarms: { lo: 14, hi: 22 } })
  IL('TT-5304', 'TT', fg2, 0.85, { range: '0–100', unit: '°C', nominal: 46 })
  IL('TT-5305', 'TT', fg3, 0.8, { range: '0–100', unit: '°C', nominal: 48 })
  IL('FT-5307', 'FT', tg2, 0.3, { range: '0–5', unit: 'm³/h', nominal: 2.6 })
  LTon('LT-5300', 'T-5300', 25)
  LTon('LT-5100', 'V-5100', 10)
  PSV('PSV-5300', 'T-5300', 'N4', [-1, 0, 0], '5309', '145 barg', 'flare', 0.9)
  PSV('PSV-5100', 'V-5100', 'N4', [1, 0, 0], '5109', '40 barg', 'flare', 1.5)

  // ================================================================ INSTRUMENT AIR
  E('compressorPackage', 'K-4600', 'Instrument Air Compressor Package', 'utilities', [-24.6, 16.6], 0, { skidL: 5.5, skidW: 2.4, motorKw: 250, suctionNps: 4, dischargeNps: 3, rating: 300 }, {
    rename: { N1: 'Air intake', N2: 'Compressed air outlet' }, design: { capacity: '1 400 Nm³/h, 2 × 100 %', notes: 'Oil-free screw, desiccant dryer, −40 °C dew point' },
  })
  E('verticalVessel', 'V-4700', 'Instrument Air Receiver', 'utilities', [-17, 11], 0, { id: 1.1, tt: 2.6, elevation: 0.6, support: 'legs', internals: 'mesh', platform: false, inletNps: 3, gasNps: 3, liquidNps: 1, psvNps: 2, rating: 300 }, {
    rename: { N1: 'Air inlet', N2: 'Air outlet', N3: 'Condensate drain' }, design: { pressure: '10 barg', capacity: '6 m³, 15 min hold-up' },
  })
  const ai = face('K-4600', 'N1')
  const ia0 = L('4"-IA-4601-A1A-N', 'instrumentAir', 'utilities', 4, [[ai[0], 9.2, ai[2]], ai], { offDeck: 'Air intake (weather-deck louvre)' }, eqEnd('K-4600', 'N1'))
  void ia0
  const ia1 = L('3"-IA-4602-A1A-N', 'instrumentAir', 'utilities', 3, orthoRoute(N('K-4600', 'N2'), N('V-4700', 'N1'), 3, 3.4, 'zx'), eqEnd('K-4600', 'N2'), eqEnd('V-4700', 'N1'))
  const ra = face('V-4700', 'N2')
  const iaHdr = '2"-IA-9701-A1A-N'
  const iaY = lineBy.get(iaHdr)!.route[1][1]
  const ia2 = L('2"-IA-4603-A1A-N', 'instrumentAir', 'utilities', 2, [ra, [ra[0], 7.1, ra[2]], [ra[0], 7.1, -1.5], [ra[0], iaY, -1.5]], eqEnd('V-4700', 'N2'), { line: iaHdr })
  const rd = face('V-4700', 'N3')
  const ia3 = L('1"-OD-4604-A1A-N', 'drain', 'utilities', 1, [rd, [rd[0] + 0.5, rd[1], rd[2]], [rd[0] + 0.5, K.CELLAR, rd[2]]], eqEnd('V-4700', 'N3'), { offDeck: 'Open drain' })
  VA('NRV-4601', 'check', ia1, 0.3)
  VA('HV-4601', 'gate', ia1, 0.75, { actuator: 'handwheel' })
  VA('HV-4603', 'ball', ia2, 0.2, { actuator: 'lever' })
  IL('PT-4603', 'PT', ia2, 0.5, { range: '0–12', unit: 'barg', nominal: 8.6, alarms: { lo: 6.5, loLo: 5.5 } })
  IL('AT-4603', 'AT', ia2, 0.6, { range: '-80–0', unit: '°C dew pt', nominal: -42, alarms: { hi: -30 } })
  void ia3
  PSV('PSV-4700', 'V-4700', 'N4', [0, 0, 1], '4709', '10 barg', 'atmosphere', 0.9)

  // ================================================================ COOLING MEDIUM
  E('horizontalVessel', 'V-6100', 'Cooling Medium Expansion Drum', 'utilities', [-5, -16.6], 0, { service: 'ko', id: 1.0, tt: 3.6, elevation: 2.2, inletNps: 6, gasNps: 2, liquidNps: 6, psvNps: 2, rating: 150 }, {
    rename: { N1: 'CM return inlet', N2: 'Nitrogen blanket', N3: 'CM to circulation pumps' }, design: { notes: 'TEG/water 30 %, N₂ blanketed' },
  })
  for (const [s, x] of [['A', -14.0], ['B', -10.2]] as const)
    E('pumpPackage', `P-6200${s}`, `Cooling Medium Pump ${s}`, 'utilities', [x, -17.7], 0, { suctionNps: 6, dischargeNps: 6, motorKw: 90, baseL: 2.6, baseW: 1.0, rating: 150 }, { design: { capacity: '420 m³/h', notes: '2 × 100 %' } })
  E('shellTube', 'E-6300', 'Cooling Medium / Seawater Cooler', 'utilities', [13, -7.0], 180, { shellOd: 0.8, length: 4.5, elevation: 0.5, shellNps: 6, tubeNps: 8, rating: 150 }, {
    rename: { N1: 'CM inlet (hot)', N2: 'CM outlet (cooled)', N3: 'Seawater in', N4: 'Seawater out' }, design: { capacity: '9.5 MW', material: 'Ti tubes' },
  })
  const cmd = face('V-6100', 'N3')
  const pa = face('P-6200A', 'N1')
  const pb = face('P-6200B', 'N1')
  const xA = pa[0] + 0.62
  const xB = pb[0] + 0.55
  const cm1 = L('6"-CM-6101-A1A-N', 'cooling', 'utilities', 6, [cmd, [cmd[0], 0.45, cmd[2]], [cmd[0], 0.45, -15.95], [xA, 0.45, -15.95], [xA, 0.45, pa[2]], [xA, pa[1], pa[2]], pa], eqEnd('V-6100', 'N3'), eqEnd('P-6200A', 'N1'))
  const cm2 = L('6"-CM-6102-A1A-N', 'cooling', 'utilities', 6, [[xB, 0.45, -15.95], [xB, 0.45, pb[2]], [xB, pb[1], pb[2]], pb], { line: cm1 }, eqEnd('P-6200B', 'N1'))
  const da = face('P-6200A', 'N2')
  const db = face('P-6200B', 'N2')
  const ci = face('E-6300', 'N1')
  const cm3 = L('6"-CM-6103-A1A-N', 'cooling', 'utilities', 6, [da, [da[0], 3.2, da[2]], [ci[0], 3.2, da[2]], [ci[0], 3.2, ci[2]], ci], eqEnd('P-6200A', 'N2'), eqEnd('E-6300', 'N1'))
  const cm4 = L('6"-CM-6104-A1A-N', 'cooling', 'utilities', 6, [db, [db[0], 3.2, db[2]]], eqEnd('P-6200B', 'N2'), { line: cm3 })
  const co = face('E-6300', 'N2')
  const cm5 = L('6"-CM-6105-A1A-N', 'cooling', 'utilities', 6, [co, [co[0], co[1], co[2] - 0.75], down([co[0], co[1], co[2] - 0.75])], eqEnd('E-6300', 'N2'), { offDeck: 'CM supply header → users (cellar)' })
  const cr = face('V-6100', 'N1')
  const cm6 = L('6"-CM-6106-A1A-N', 'cooling', 'utilities', 6, [down([cr[0] - 0.8, 0, cr[2]]), [cr[0] - 0.8, cr[1], cr[2]], cr], { offDeck: 'CM return header (cellar)' }, eqEnd('V-6100', 'N1'))
  // seawater lift pumps hang in caissons from the cellar deck; they lift seawater up through the
  // production deck into the cooler
  for (const [s2, x] of [['A', 14.0], ['B', 17.0]] as const)
    E('caissonPump', `P-6400${s2}`, `Seawater Lift Pump ${s2}`, 'utilities', [x, -6.5], 0, { driver: 'electric', motorKw: 900, caissonOD: 0.9, caissonLength: 30, dischargeNps: 8, rating: 150 }, {
      y: CELLAR_FLOOR, design: { capacity: '1 800 m³/h @ 6.5 barg, 2 × 100 %', notes: 'Caisson to EL −10, hypochlorite dosed at the pump suction' },
    })
  const si = face('E-6300', 'N3')
  const fa = face('P-6400A', 'N1')
  const fb = face('P-6400B', 'N1')
  const sw1 = L('8"-SW-6301-A1A-N', 'water', 'utilities', 8, [fa, [si[0], fa[1], fa[2]], [si[0], -1.6, fa[2]], [si[0], -1.6, si[2] + 0.55], [si[0], si[1], si[2] + 0.55], si], eqEnd('P-6400A', 'N1'), eqEnd('E-6300', 'N3'))
  const sw3 = L('8"-SW-6303-A1A-N', 'water', 'utilities', 8, [fb, [fb[0] + 0.5, fb[1], fb[2]], [fb[0] + 0.5, -3.2, fb[2]], [si[0], -3.2, fb[2]]], eqEnd('P-6400B', 'N1'), { line: sw1 })
  VA('NRV-6401A', 'check', sw1, 0.32)
  VA('NRV-6401B', 'check', sw3, 0.55)
  VA('HV-6401B', 'butterfly', sw3, 0.85, { actuator: 'gear' })
  IL('PT-6401', 'PT', sw1, 0.6, { range: '0–12', unit: 'barg', nominal: 6.4, alarms: { lo: 4 } })
  const so2 = face('E-6300', 'N4')
  const sw2 = L('8"-SW-6302-A1A-N', 'water', 'utilities', 8, [so2, [so2[0], 2.4, so2[2]], [18.6, 2.4, so2[2]], [18.6, K.CELLAR, so2[2]]], eqEnd('E-6300', 'N4'), { offDeck: 'Seawater overboard (dump caisson)' })
  VA('HV-6201A', 'butterfly', cm1, 0.86, { actuator: 'gear' })
  VA('HV-6201B', 'butterfly', cm2, 0.7, { actuator: 'gear' })
  VA('NRV-6202A', 'check', cm3, 0.08)
  VA('HV-6202A', 'butterfly', cm3, 0.16, { actuator: 'gear' })
  VA('TCV-6303', 'control', cm5, 0.2, { actuator: 'diaphragm', failAction: 'FO' })
  VA('HV-6106', 'butterfly', cm6, 0.5, { actuator: 'gear' })
  VA('HV-6301', 'butterfly', sw1, 0.48, { actuator: 'gear' })
  void cm4
  IL('TT-6303', 'TT', cm5, 0.1, { range: '0–100', unit: '°C', nominal: 32 })
  IL('PT-6202', 'PT', cm3, 0.4, { range: '0–10', unit: 'barg', nominal: 5.4 })
  IL('FT-6202', 'FT', cm3, 0.7, { range: '0–600', unit: 'm³/h', nominal: 405 })
  IL('TT-6302', 'TT', sw2, 0.3, { range: '0–60', unit: '°C', nominal: 27 })
  LTon('LT-6100', 'V-6100', 55)
  PSV('PSV-6100', 'V-6100', 'N5', [1, 0, 0], '6109', '6 barg', 'atmosphere')

  // ================================================================ METHANOL TO THE WELLHEADS
  E('chemSkid', 'C-5600', 'Methanol Injection Package', 'wells', [-25.3, -15.6], 0, { skidL: 3.2, skidW: 2.2, tanks: 2, outlets: 2 }, {
    rename: { N1: 'Methanol to XT-110', N2: 'Methanol to XT-130' }, design: { capacity: '2 × 4 m³', pressure: '345 barg discharge', notes: 'Hydrate inhibition at start-up' },
  })
  ;[['N1', 'XT-110'], ['N2', 'XT-130']].forEach(([nz, t], i) => {
    // separate drops through the production deck, then along the cellar under-deck to the kill wing
    const a = face('C-5600', nz)
    const k = face(t, 'N2')
    const x = -22.2 + 0.4 * i
    const y = -4.9 - 0.4 * i
    const l = L(`1"-MI-560${i + 1}-E9A-N`, 'chemical', 'wells', 1, [a, [x, a[1], a[2]], [x, y, a[2]], [x, y, k[2]], [k[0] - 0.55, y, k[2]], [k[0] - 0.55, k[1], k[2]], k], eqEnd('C-5600', nz), eqEnd(t, 'N2'))
    VA(`XV-560${i + 1}`, 'needle', l, 0.85)
  })

  // ================================================================ FIREWATER PUMP + FOAM MODULES (production deck, south)
  E('module', 'B-7100', 'Firewater Pump Module A (diesel)', 'safety', [12.8, 16.5], 0, { sizeX: 5.6, sizeY: 3.6, sizeZ: 3.2 }, { design: { capacity: '1 200 m³/h @ 16 barg', notes: 'Diesel-driven lineshaft pump, A60' } })
  E('module', 'B-7200', 'Firewater Pump Module B (diesel)', 'safety', [19.6, 16.5], 0, { sizeX: 5.6, sizeY: 3.6, sizeZ: 3.2 }, { design: { capacity: '1 200 m³/h @ 16 barg' } })
  E('chemSkid', 'C-7300', 'AFFF Foam Concentrate Skid', 'safety', [25.3, 16.6], 0, { skidL: 3.0, skidW: 2.2, tanks: 1, outlets: 0 }, { design: { capacity: '6 m³ AFFF 3 %' } })

  // ================================================================ ACCOMMODATION PLATFORM (LQ) + SOUTH BRIDGE
  E('module', 'B-9300', 'Central Control Room (CCR)', 'accommodation', [-3, 66], 0, { sizeX: 9, sizeY: 4, sizeZ: 7 }, { design: { notes: 'DCS / SIS / F&G operator stations, CCTV wall, radio room. Pressurised, A60.' } })
  E('module', 'B-9310', 'Emergency Generator Module', 'accommodation', [-3, 78.5], 0, { sizeX: 8, sizeY: 3.8, sizeZ: 6 }, { design: { capacity: '1.5 MW diesel', notes: 'Starts on loss of main power, 18 h day tank' } })
  E('horizontalVessel', 'V-9330', 'Diesel Day Tank', 'accommodation', [16.5, 63.8], 0, { service: 'ko', id: 1.4, tt: 4, elevation: 0.6, inletNps: 3, gasNps: 2, liquidNps: 2, psvNps: 1, rating: 150 }, {
    rename: { N1: 'Diesel inlet', N2: 'Vent', N3: 'Diesel to generator' }, design: { capacity: '8 m³' },
  })
  E('verticalVessel', 'T-9320', 'Potable Water Tank', 'accommodation', [11, 65.5], 0, { id: 2.2, tt: 3, elevation: 0.5, support: 'legs', internals: 'mesh', platform: false, inletNps: 2, gasNps: 2, liquidNps: 3, psvNps: 1, rating: 150 }, {
    rename: { N1: 'Watermaker inlet', N2: 'Vent', N3: 'Outlet to pumps' }, design: { capacity: '12 m³' },
  })
  E('pumpPackage', 'P-9340', 'Potable Water Pump', 'accommodation', [16.5, 67.2], 0, { suctionNps: 3, dischargeNps: 2, motorKw: 7.5, baseL: 1.8, baseW: 0.8, rating: 150 })
  const [lx0, lx1, lx2] = BRIDGE_S.pipeLane.x
  const ly = BRIDGE_S.pipeLane.y
  // diesel: rack utility (tier 2) → over the deck → down onto the bridge lane → LQ day tank
  const dfHdr = '3"-DF-9901-A1A-N'
  const dfY = lineBy.get(dfHdr)!.route[1][1]
  const dt = face('V-9330', 'N1')
  const br1 = L('3"-DF-9902-A1A-N', 'oil', 'accommodation', 3, [[lx2, dfY, -0.45], [lx2, 8.0, -0.45], [lx2, 8.0, 19.0], [lx2, ly, 19.0], [lx2, ly, dt[2]], [dt[0] - 0.5, ly, dt[2]], [dt[0] - 0.5, dt[1], dt[2]], dt], { line: dfHdr }, eqEnd('V-9330', 'N1'), { design: { notes: 'Diesel to LQ day tank across the south bridge' } })
  // potable water: LQ tank → pump → bridge → Alpha utility stations
  const pt = face('T-9320', 'N3')
  const pws = face('P-9340', 'N1')
  const pw10 = L('3"-PW-9341-A1A-N', 'water', 'accommodation', 3, orthoRoute(N('T-9320', 'N3'), N('P-9340', 'N1'), 3), eqEnd('T-9320', 'N3'), eqEnd('P-9340', 'N1'))
  void pt
  void pws
  const pd = face('P-9340', 'N2')
  const br2 = L('2"-PW-9342-A1A-N', 'water', 'accommodation', 2, [pd, [pd[0], 1.6, pd[2]], [lx1, 1.6, pd[2]], [lx1, ly, pd[2]], [lx1, ly, 18.6], down([lx1, 0, 18.6])], eqEnd('P-9340', 'N2'), { offDeck: 'Alpha potable water / safety showers (cellar ring)' })
  // firewater: Alpha ring main → bridge → LQ hydrants and deluge
  const fwY = lineBy.get('8"-FW-9001-F1A-N')!.route[1][1]
  const br3 = L('6"-FW-9031-F1A-N', 'firewater', 'safety', 6, [[lx0, fwY, 18.7], [lx0, fwY, 19.4], [lx0, ly, 19.4], [lx0, ly, 61.2], [lx0, 0.9, 61.2], [lx0, 0.9, 62.2], [lx0, 3.8, 62.2]], { line: '8"-FW-9001-F1A-N' }, { offDeck: 'LQ firewater ring & hydrants' })
  VA('HV-9902', 'ball', br1, 0.42, { actuator: 'lever' })
  VA('HV-9342', 'gate', br2, 0.5, { actuator: 'handwheel' })
  VA('NRV-9342', 'check', br2, 0.12)
  VA('XV-9031', 'butterfly', br3, 0.3, { actuator: 'electric' })
  VA('HV-9031', 'butterfly', br3, 0.75, { actuator: 'gear' })
  void pw10
  IL('FT-9902', 'FT', br1, 0.55, { range: '0–10', unit: 'm³/h', nominal: 1.8 })
  IL('PT-9031', 'PT', br3, 0.55, { range: '0–25', unit: 'barg', nominal: 14.5, alarms: { lo: 10 } })
  IL('PT-9342', 'PT', br2, 0.3, { range: '0–10', unit: 'barg', nominal: 4.5 })
  LTon('LT-9330', 'V-9330', 72)
  LTon('LT-9320', 'T-9320', 64)

  // ================================================================ POWER GENERATION + ELECTRICAL (weather deck, EL +38)
  const WD = WEATHER_FLOOR
  for (const [s2, z] of [['A', 4.5], ['B', 11.5]] as const)
    E('gasTurbineGenerator', `GT-8100${s2}`, `Gas Turbine Generator ${s2}`, 'utilities', [7.0, z], 0, { ratedMW: 25, skidL: 15, skidW: 4.6, enclosureHeight: 5.2, stackHeight: 13, fuelNps: 3 }, {
      y: WD, design: { capacity: '25 MW ISO, 2 × 100 %', notes: 'Dual fuel (fuel gas / diesel), DLE combustor, 11 kV 50 Hz generator' },
    })
  for (const [s2, z] of [['A', -2.5], ['B', 1.5]] as const)
    E('transformer', `TR-8200${s2}`, `Main Power Transformer ${s2}`, 'utilities', [19.5, z], 0, { ratingMVA: 30, voltage: '11/6.6 kV', tankL: 3.2, tankH: 2.8, tankW: 2.0 }, { y: WD, design: { notes: 'ONAN/ONAF, feeds the 6.6 kV switchboard in the LER' } })
  E('chemSkid', 'X-8300', 'Nitrogen Generation Package (membrane)', 'utilities', [19.5, 7.0], 0, { skidL: 4.2, skidW: 2.6, tanks: 1, outlets: 0 }, { y: WD, design: { capacity: '250 Nm³/h, 98 % N₂', notes: 'Purge, blanketing, seal gas' } })
  // fuel gas from the rack header (production deck) up through the weather deck to each turbine
  const ga = face('GT-8100A', 'N1')
  const gb = face('GT-8100B', 'N1')
  const fgA = L('3"-FG-8101-D6A-N', 'gas', 'utilities', 3, [[ga[0], fgY, -1.45], [ga[0], fgY, -2.6], [ga[0], ga[1], -2.6], ga], { line: fgHdr }, eqEnd('GT-8100A', 'N1'), { design: { notes: 'Fuel gas to GT-8100A, rises through the weather deck' } })
  const fgB = L('3"-FG-8102-D6A-N', 'gas', 'utilities', 3, [[16.5, fgY, -1.45], [16.5, fgY, -2.6], [16.5, gb[1], -2.6], [16.5, gb[1], gb[2] - 0.45], [gb[0], gb[1], gb[2] - 0.45], gb], { line: fgHdr }, eqEnd('GT-8100B', 'N1'))
  for (const [l, s2] of [[fgA, 'A'], [fgB, 'B']] as const) {
    VA(`ESDV-810${s2 === 'A' ? 1 : 2}`, 'esdv', l, 0.62, { actuator: 'pistonSpring', failAction: 'FC', design: { notes: 'Turbine fuel gas ESD valve' } })
    IL(`PT-810${s2 === 'A' ? 1 : 2}`, 'PT', l, 0.85, { range: '0–30', unit: 'barg', nominal: 18.2, alarms: { lo: 15 } })
  }

  // ================================================================ DRILLING (rig on the weather deck, BOP in the cellar) — pick proxies
  E('proxy', 'DR-100', 'Platform Drilling Rig (derrick, top drive, drill floor)', 'wells', [RIG_SLOT[0], RIG_SLOT[1]], 0, { role: 'drillingRig', sizeX: 13, sizeY: 44, sizeZ: 13 }, {
    y: WD + 8, design: { capacity: '1 000 hp drawworks, 450 t hook load', notes: `Drilling well A-06 on slot (${RIG_SLOT.join(', ')}), 12¼" section, oil-based mud 1.35 SG` },
  })
  E('proxy', 'BOP-100', 'BOP Stack (annular + double ram)', 'wells', [RIG_SLOT[0], RIG_SLOT[1]], 0, { role: 'bop', sizeX: 2.8, sizeY: 5.5, sizeZ: 2.8 }, {
    y: CELLAR_FLOOR, design: { pressure: '10 000 psi (690 barg)', notes: '13⅝" annular + double ram, choke & kill lines to the choke manifold' },
  })

  // ================================================================ CELLAR DECK UTILITIES
  for (const [s2, z] of [['A', 11.5], ['B', 15.0]] as const)
    E('caissonPump', `P-7101${s2}`, `Firewater Pump ${s2} (diesel)`, 'safety', [27.2, z], 0, { driver: 'diesel', motorKw: 1100, caissonOD: 1.0, caissonLength: 30, dischargeNps: 10, rating: 150 }, {
      y: CELLAR_FLOOR, design: { capacity: '1 200 m³/h @ 16 barg, 2 × 100 %', notes: 'Diesel driver + right-angle gearbox, auto-start on F&G / ring pressure' },
    })
  for (const s2 of ['A', 'B'] as const) {
    const f = face(`P-7101${s2}`, 'N1')
    const l = L(`10"-FW-710${s2 === 'A' ? 1 : 2}-F1A-N`, 'firewater', 'safety', 10, [f, [f[0] + 0.55, f[1], f[2]], [f[0] + 0.55, 7.6, f[2]], [27.0, 7.6, f[2]], [27.0, fwY, f[2]]], eqEnd(`P-7101${s2}`, 'N1'), { line: '8"-FW-9001-F1A-N' })
    VA(`NRV-710${s2 === 'A' ? 1 : 2}`, 'check', l, 0.25)
    VA(`HV-710${s2 === 'A' ? 1 : 2}`, 'butterfly', l, 0.45, { actuator: 'gear' })
  }
  E('chemSkid', 'X-1900', 'Wellhead Hydraulic Control Panel (HPU)', 'wells', [-3.5, 10.75], 0, { skidL: 5, skidW: 3.5, tanks: 2, outlets: 0 }, { y: CELLAR_FLOOR, design: { notes: 'SSV / SCSSV hydraulics for all wells, 345 / 690 barg pumps, ESD logic' } })
  E('chemSkid', 'X-6500', 'Sodium Hypochlorite Generator', 'utilities', [4, 10.75], 0, { skidL: 4, skidW: 2.5, tanks: 2, outlets: 0 }, { y: CELLAR_FLOOR, design: { notes: 'Electrochlorination, doses the seawater lift pump suctions' } })

  // ================================================================ FIRE & GAS DETECTION
  const nearest = (x: number, z: number, y = 0) => {
    let best = A.equipment[0]
    let bd = Infinity
    for (const e of A.equipment) {
      const sameLevel = (e.position[1] < -4) === (y < -4)
      if (!sameLevel) continue
      const d = Math.hypot(e.position[0] - x, e.position[2] - z)
      if (d < bd) (bd = d), (best = e)
    }
    return best.tag
  }
  const aim = (from: [number, number], to: [number, number]): Vec3 => {
    const dx = to[0] - from[0]
    const dz = to[1] - from[1]
    const l = Math.hypot(dx, dz) || 1
    return [r3(dx / l), 0, r3(dz / l)]
  }
  let fd = 1
  const FD = (x: number, y: number, z: number, target: [number, number]) => IE(`FD-80${String(fd++).padStart(2, '0')}`, 'FD', nearest(target[0], target[1], y), [x, y, z], aim([x, z], target))
  // production deck: on the rack posts (both sides) looking out over the process areas …
  for (const bx of [-18, -6, 6, 18]) {
    FD(bx, 5.4, -2.25, [bx, -10])
    FD(bx, 5.4, 2.25, [bx, 10])
  }
  // … and on the jacket legs / deck columns looking back at the deck centre
  for (const [x, z] of [[-24, -17], [24, -17], [-24, 17], [24, 17], [-8, -17], [8, -17], [-8, 17], [8, 17]] as [number, number][])
    FD(x + Math.sign(-x) * 1.0, 6.2, z + Math.sign(-z) * 1.0, [x * 0.45, z * 0.35])
  // cellar deck well bay
  for (const [x, z] of [[-8, -17], [8, -17]] as [number, number][]) FD(x, CELLAR_FLOOR + 4.2, z + 0.6, [0, -11.8])
  // LQ
  FD(-8.2, 4.2, 70.5, [-3, 78.5])
  FD(20.2, 3.2, 62, [14, 65])

  // point gas detectors at likely leak sources (pump seals, compressor, separator nozzles)
  let gd = 1
  const GD = (host: string, at: Vec3) => IE(`GD-80${String(gd++).padStart(2, '0')}`, 'GD', host, at, [0, 0, 1])
  for (const e of A.equipment) {
    if (e.position[1] < -4) continue
    const [x, , z] = e.position
    if (e.kind === 'pumpPackage') GD(e.tag, [x + Math.cos(e.rotationY) * e.baseplate[0] * 0.3, 1.6, z - Math.sin(e.rotationY) * e.baseplate[0] * 0.3 + e.baseplate[1] / 2 + 0.25])
    else if (e.kind === 'compressorPackage') {
      GD(e.tag, [x - e.skid[0] * 0.3, 3.4, z + e.skid[1] / 2 + 0.3])
      GD(e.tag, [x + e.skid[0] * 0.3, 3.4, z - e.skid[1] / 2 - 0.3])
    } else if (e.kind === 'horizontalVessel' && e.system !== 'accommodation') {
      // beside the outlet end of the vessel, at head height on its own stanchion
      const c = Math.cos(e.rotationY), sn = Math.sin(e.rotationY)
      GD(e.tag, [x + c * e.tt * 0.3 + sn * (e.id / 2 + 0.7), 1.7, z - sn * e.tt * 0.3 + c * (e.id / 2 + 0.7)])
    }
    else if (e.kind === 'verticalVessel' && e.system !== 'accommodation') GD(e.tag, [x + e.id / 2 + 0.4, 2.2, z])
    else if (e.kind === 'manifold' || e.kind === 'pigTrap') GD(e.tag, [x, 2.4, z + 1.4])
  }
  // HVAC air intakes of the control room and LER, and the turbine hood (gas at air intakes trips the HVAC)
  GD('B-9300', [-3, 4.4, 62.3])
  GD('B-9100', [21.3, 4.2, 5.9])

  // open-path gas detectors: beam pairs along the edges of the main process areas
  const OGD = (tag: string, host: string, a: Vec3, b: Vec3) => {
    const d = aim([a[0], a[2]], [b[0], b[2]])
    IE(`${tag}T`, 'OGD', host, a, d, { range: '0–5', unit: 'LEL·m' })
    IE(`${tag}R`, 'OGD', host, b, [-d[0], 0, -d[2]], { range: '0–5', unit: 'LEL·m' })
  }
  OGD('OGD-8201', 'V-1100', [-27.5, 1.4, -5.4], [-9.6, 1.4, -5.4])
  OGD('OGD-8202', 'V-1300', [-1.0, 1.4, -5.4], [12.6, 1.4, -5.4])
  OGD('OGD-8203', 'K-2200', [-2.6, 3.6, 9.6], [9.6, 3.6, 9.6])
  OGD('OGD-8204', 'V-4100', [-27.6, 1.4, 5.3], [-16.8, 1.4, 5.3])

  // heat detectors under the weather deck over the hot areas; smoke detectors at the modules
  let hd = 1
  for (const [host, x, z] of [['K-2200', 1.5, 6.5], ['K-2200', 6, 6.5], ['P-1500A', 15, -12], ['E-1400', 6, -14.8], ['K-4600', -24.6, 16.6], ['B-9310', -3, 81.6]] as [string, number, number][])
    IE(`HD-83${String(hd++).padStart(2, '0')}`, 'HD', host, [x, host === 'B-9310' ? 3.6 : 9.25, z], [1, 0, 0])
  let sd = 1
  for (const [host, x, y, z] of [['B-9100', 17.4, 3.9, 9.6], ['B-9100', 25.2, 3.9, 9.6], ['B-9300', -6.4, 4.05, 66], ['B-9300', 0.4, 4.05, 66], ['B-7100', 12.8, 3.65, 14.8], ['B-7200', 19.6, 3.65, 14.8]] as [string, number, number, number][])
    IE(`SD-84${String(sd++).padStart(2, '0')}`, 'SD', host, [x, y, z], [1, 0, 0])

  // weather deck + drill floor
  FD(16, WD + 3.5, -5, [3, -13])
  FD(-1, WD + 3.5, 8, [7, 8])
  FD(16, WD + 3.5, 14, [7, 8])
  FD(9.2, WD + 8 + 2.8, -7, [3, -13]) // drill floor, on a post at the floor edge
  GD('GT-8100A', [ga[0], WD + 1.6, ga[2] - 0.4])
  GD('GT-8100B', [gb[0], WD + 1.6, gb[2] - 0.4])
  GD('DR-100', [4.6, WD + 8.6, -11.4]) // at the bell nipple
  GD('DR-100', [-8.5, WD + 1.6, -6.1]) // at the shale shakers (gas out of the mud)
  GD('BOP-100', [4.8, CELLAR_FLOOR + 2.0, -11.3])
  for (const s2 of ['A', 'B']) IE(`HD-83${String(hd++).padStart(2, '0')}`, 'HD', `P-7101${s2}`, [27.2, CELLAR_FLOOR + 3.9, s2 === 'A' ? 11.5 : 15], [1, 0, 0])

  // manual call points on the escape routes, stair heads and bridge ends
  let mac = 1
  const MAC = (x: number, z: number, dir: Vec3, y = 1.3) => IE(`MAC-85${String(mac++).padStart(2, '0')}`, 'MAC', nearest(x, z, y), [x, y, z], dir)
  MAC(-28.6, 3.5, [1, 0, 0])
  MAC(28.6, 3.5, [-1, 0, 0])
  MAC(-28.6, -3.5, [1, 0, 0])
  MAC(28.6, -3.5, [-1, 0, 0])
  MAC(-28.6, 10.6, [1, 0, 0])
  MAC(28.6, -12.4, [-1, 0, 0])
  MAC(BRIDGE_S.walk.x0 - 0.2, 19.2, [1, 0, 0])
  MAC(BRIDGE_S.walk.x0 - 0.2, 61.0, [1, 0, 0])
  MAC(2.4, 69.5, [0, 0, -1])
  MAC(-7.6, -15.6, [1, 0, 0], CELLAR_FLOOR + 1.3) // cellar deck, at the well bay

  // ================================================================ MORE GAUGES ON THE EXISTING LINES
  const extra: [string, InstrumentType, string, number, Partial<Instrument>][] = [
    ['PG-1102', 'PG', '6"-PO-1102-C3A-H', 0.15, { range: '0–60', unit: 'barg', nominal: 41 }],
    ['TG-1102', 'TG', '6"-PO-1102-C3A-H', 0.9, { range: '0–150', unit: '°C', nominal: 76 }],
    ['PG-1104', 'PG', '4"-PW-1104-C3A-N', 0.85, { range: '0–60', unit: 'barg', nominal: 38 }],
    ['PG-1202', 'PG', '4"-PO-1202-C3A-H', 0.5, { range: '0–60', unit: 'barg', nominal: 40 }],
    ['PG-2102', 'PG', '2"-PO-2102-C3A-N', 0.6, { range: '0–60', unit: 'barg', nominal: 40 }],
    ['TG-2201', 'TG', '8"-PG-2201-E9A-N', 0.8, { range: '0–200', unit: '°C', nominal: 128 }],
    ['PG-2301', 'PG', '8"-PG-2301-E9A-N', 0.92, { range: '0–200', unit: 'barg', nominal: 137 }],
    ['PG-2402', 'PG', '16"-FL-2402-B1A-N', 0.5, { range: '0–6', unit: 'barg', nominal: 0.08 }],
    ['TG-1411', 'TG', '6"-CM-1411-A1A-N', 0.8, { range: '0–100', unit: '°C', nominal: 28 }],
    ['TG-2311', 'TG', '6"-CM-2311-A1A-N', 0.8, { range: '0–100', unit: '°C', nominal: 29 }],
    ['PG-9001', 'PG', '8"-FW-9001-F1A-N', 0.3, { range: '0–25', unit: 'barg', nominal: 14.2 }],
    ['PI-9201', 'PI', '6"-FG-9201-C3A-N', 0.4, { range: '0–40', unit: 'barg', nominal: 18 }],
    ['PI-9701', 'PI', '2"-IA-9701-A1A-N', 0.6, { range: '0–12', unit: 'barg', nominal: 8.4 }],
  ]
  for (const [tag, type, line, at, o] of extra) if (lineBy.has(line)) IL(tag, type, line, at, o)
}
