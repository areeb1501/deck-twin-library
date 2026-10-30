/**
 * Live control-room screens: one draw function per screen kind, each painting a full 1024 × 576
 * panel from a Snap (one guarded read of the simulation). ISA-101 high-performance look — grey
 * background, dark-grey graphics, dark-blue live values, colour only where something is abnormal.
 *
 *   overview  field KPIs (oil / gas export, flare, power, production efficiency, availability)
 *             and a status block per platform (online / shutdown, general alarm)
 *   mimic     simplified process flow with live values, ESD / blowdown valve and machine states
 *   trend     two trend panes from `history` against the sim clock
 *   fgmap     plan of the fire zones coloured by their F&G status, detectors in alarm
 *   alarm     ISA-18.2 alarm summary (unacknowledged first), counts by priority, alarm rate
 *   esd       latched shutdowns and their reset state, shutdown hierarchy, ESD valve positions
 *   cctv      static camera quad with a live clock and a cycling camera
 *
 * The WHP-N local control room draws the same screens focused on WHP-N.
 */
import { ALPHA_DECK, BRIDGE_N, BRIDGE_S, LQ, WHP } from '../../model/site'
import type { PlanRect, Vec3 } from '../../model/types'
import type { FireZone } from '../../sim/fg'
import { SHUTDOWN_LABEL, SHUTDOWN_RANK, fmtClock, type Alarm, type HistoryPoint, type ShutdownLevel, type ZoneStatus } from '../../sim/types'
import {
  C,
  H,
  W,
  arrow,
  box,
  compressor,
  fmt,
  hVessel,
  hbar,
  header,
  lamp,
  mono,
  polyline,
  pump,
  rect,
  sans,
  text,
  vVessel,
  valve,
  valueBox,
  type G,
} from './hmi'
import { alertOf, detectorPos, info, runOf, valveOf, type PlatformView, type Snap } from './snapshot'

export type LiveKind = 'overview' | 'mimic' | 'trend' | 'fgmap' | 'alarm' | 'esd' | 'cctv'
export const LIVE_KINDS: LiveKind[] = ['overview', 'mimic', 'trend', 'fgmap', 'alarm', 'esd', 'cctv']
export const isLiveKind = (k: string): k is LiveKind => (LIVE_KINDS as string[]).includes(k)

export function drawScreen(g: G, kind: LiveKind, s: Snap) {
  g.save()
  rect(g, 0, 0, W, H, C.bg)
  switch (kind) {
    case 'overview':
      overview(g, s)
      break
    case 'mimic':
      if (!s.alpha) generic(g, s, 'PROCESS MIMIC')
      else if (s.focus === 'WHP-N') mimicWhp(g, s)
      else mimicAlpha(g, s)
      break
    case 'trend':
      trend(g, s)
      break
    case 'fgmap':
      fgmap(g, s)
      break
    case 'alarm':
      alarmSummary(g, s)
      break
    case 'esd':
      esd(g, s)
      break
    case 'cctv':
      cctv(g, s)
      break
  }
  g.restore()
}

const focusPlatforms = (s: Snap) => (s.focus === 'WHP-N' ? s.platforms.filter((p) => p.id === 'WHP-N') : s.platforms)
const note = (s: Snap) => (s.pending ? 'SIM DATA PENDING' : undefined)
function head(g: G, s: Snap, title: string, alert: 'red' | 'amber' | null = null) {
  header(g, { site: s.site, title, clock: s.clock, alert, blink: s.blink, note: note(s), running: s.running })
}
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v)

function generic(g: G, s: Snap, title: string) {
  head(g, s, title)
  text(g, 'Display not configured for this plant', W / 2, H / 2, { font: sans(26), color: C.dim, align: 'center' })
}

// ====================================================================== overview
function overview(g: G, s: Snap) {
  const whp = s.focus === 'WHP-N'
  head(g, s, whp ? 'WHP-N OVERVIEW' : 'FIELD OVERVIEW', alertOf(focusPlatforms(s)))
  const r = s.r
  const P = (id: string) => s.platforms.find((p) => p.id === id)
  type Row = { label: string; value: number | null | undefined; unit: string; d?: number; max: number; marks?: number[]; abn?: string | null; extra?: string; frac?: number | null }
  const flare = r?.flare
  const flareAbn = flare != null && flare > 20 ? C.p1 : flare != null && flare > 5 ? C.p2 : null
  const pg = r?.powerGenerated
  const pa = r?.powerAvailable
  const powerAbn = pg != null && pa != null && pa > 0 && pa < 900 && pg >= pa * 0.97 ? C.p2 : pa === 0 ? C.p1 : null
  const powerRow: Row = { label: 'Power gen / avail', value: pg, unit: 'MW', d: 1, max: 1, frac: pg != null && pa ? pg / Math.min(pa, 999) : null, abn: powerAbn, extra: pa != null && pa < 900 ? `of ${fmt(pa, 1)} MW available` : pa != null ? 'grid supply' : '' }
  const rows: Row[] = whp
    ? [
        { label: 'WHP-N oil to Alpha', value: P('WHP-N')?.oil, unit: 'bbl/d', max: 30000 },
        { label: 'WHP-N gas to Alpha', value: P('WHP-N')?.gas, unit: 'MMscfd', d: 1, max: 40 },
        { label: 'Field oil export', value: r?.oilExport, unit: 'bbl/d', max: 60000, marks: [49000 / 60000] },
        { label: 'Field gas export', value: r?.gasExport, unit: 'MMscfd', d: 1, max: 100, marks: [0.75] },
        { label: 'Flare', value: flare, unit: 'MMscfd', d: 1, max: 60, abn: flareAbn },
        powerRow,
      ]
    : [
        { label: 'Oil export', value: r?.oilExport, unit: 'bbl/d', max: 60000, marks: [49000 / 60000], extra: r?.oilPotential != null ? `potential ${fmt(r.oilPotential)}` : '' },
        { label: 'Gas export', value: r?.gasExport, unit: 'MMscfd', d: 1, max: 100, marks: [0.75] },
        { label: 'Flare', value: flare, unit: 'MMscfd', d: 1, max: 60, abn: flareAbn },
        powerRow,
        { label: 'Fuel gas', value: r?.fuelGas, unit: 'MMscfd', d: 1, max: 10 },
        { label: 'Produced water', value: r?.water, unit: 'bbl/d', max: 40000 },
      ]
  box(g, 12, 54, 600, 322, whp ? 'PRODUCTION: WHP-N AND FIELD' : 'FIELD PRODUCTION')
  rows.forEach((row, i) => {
    const y = 76 + i * 49
    text(g, row.label, 26, y + 18, { font: sans(18, true), color: C.text })
    valueBox(g, 220, y + 2, 190, 34, fmt(row.value, row.d ?? 0), row.unit, { abn: row.abn, px: 22 })
    hbar(g, 424, y + 12, 172, 14, row.frac !== undefined ? row.frac : row.value != null ? row.value / row.max : null, { marks: row.marks, abn: row.abn })
    if (row.extra) text(g, row.extra, 596, y + 40, { font: sans(13), color: C.dim, align: 'right' })
  })
  // production efficiency + availability
  box(g, 624, 54, 388, 186, 'PRODUCTION EFFICIENCY')
  const pe: [string, number | null][] = [
    ['NOW', pct(r?.efficiency)],
    ['LAST HOUR', pct(s.k.peHour)],
    ['SESSION', pct(s.k.pe)],
  ]
  pe.forEach(([lab, v], i) => {
    const x = 636 + i * 124
    const abn = v != null && v < 80 ? C.p2 : null
    rect(g, x, 78, 116, 112, C.well, abn ?? C.lineLight, abn ? 3 : 1.5)
    text(g, lab, x + 58, 94, { font: sans(14, true), color: C.dim, align: 'center' })
    text(g, v == null ? '----' : v.toFixed(1), x + 58, 136, { font: mono(36), color: C.value, align: 'center' })
    text(g, '%', x + 58, 172, { font: sans(15), color: C.dim, align: 'center' })
  })
  const av = s.availability
  text(g, 'Availability', 636, 214, { font: sans(18, true) })
  valueBox(g, 790, 198, 130, 32, fmt(av, 1), '%', { px: 22, abn: av != null && av < 90 ? C.p2 : null })
  box(g, 624, 248, 388, 128, 'PLANT STATUS')
  const al = s.alarms
  const unack = al ? al.filter((a) => a.state === 'unack' || a.state === 'rtnUnack').length : null
  const rate = s.k.alarmRate
  text(g, `Alarms active ${al ? al.filter((a) => a.active && a.state !== 'shelved').length : '--'}   unacked ${unack ?? '--'}`, 636, 284, { font: sans(17), color: unack ? C.text : C.dim })
  text(g, `Alarm rate ${rate == null ? '--' : rate} / 10 min`, 636, 310, { font: sans(17), color: rate != null && rate >= 10 ? C.p1 : C.dim })
  text(g, `Trips ${s.k.trips ?? '--'}   Shutdowns ${s.k.shutdowns ?? '--'}`, 820, 310, { font: sans(17), color: C.dim })
  const cons = r?.constraints?.[0]?.text ?? r?.constraint ?? null
  if (cons) {
    rect(g, 632, 330, 8, 36, C.p2)
    text(g, cons, 648, 348, { font: sans(15, true), color: C.text, max: 356 })
  } else text(g, 'No production constraint', 636, 348, { font: sans(15), color: C.dim })
  // platform blocks
  const ps = s.platforms
  const bw = (W - 24 - (ps.length - 1) * 12) / ps.length
  ps.forEach((p, i) => platformBlock(g, s, p, 12 + i * (bw + 12), 388, bw, 178, whp && p.id === 'WHP-N'))
}

function platformBlock(g: G, s: Snap, p: PlatformView, x: number, y: number, w: number, h: number, emph: boolean) {
  rect(g, x, y, w, h, C.panel, emph ? C.text : C.lineLight, emph ? 3 : 1.5)
  const name = p.id === 'LQ' ? 'LQ  (CCR / quarters)' : p.id === 'Plant' ? s.plant.name : p.id === 'Alpha' ? 'ALPHA  (process)' : p.id === 'RP' ? 'RP  (risers / export)' : p.id === 'WI' ? 'WI  (water injection)' : 'WHP-N  (wellhead)'
  text(g, name, x + 14, y + 20, { font: sans(19, true) })
  // run status
  const sd = p.shutdown
  const red = sd && SHUTDOWN_RANK[sd] >= SHUTDOWN_RANK.ESD2
  const sdCol = sd ? (red ? C.p1 : C.p2) : null
  const on = sdCol && s.blink
  rect(g, x + 12, y + 40, w - 24, 46, on ? sdCol : C.well, sdCol ?? C.lineLight, sdCol ? 3 : 1.5)
  const st = sd ? `SHUTDOWN  ${sd}` : p.online == null ? 'STATUS  ----' : p.id === 'LQ' ? 'NORMAL' : p.online ? 'ONLINE' : 'NOT PRODUCING'
  text(g, st, x + w / 2, y + 63, { font: sans(22, true), color: on && red ? '#fff' : sd ? C.text : p.online === false && p.id !== 'LQ' ? C.p2 : C.text, align: 'center' })
  // general alarm
  const ga = p.ga
  const gaCol = ga === 'gas' ? C.p2 : ga === 'fire' || ga === 'muster' || ga === 'abandon' ? C.p1 : null
  const gaOn = gaCol && s.blink
  rect(g, x + 12, y + 94, w - 24, 34, gaOn ? gaCol : C.well, gaCol ?? C.lineLight, gaCol ? 3 : 1.5)
  text(g, `GA  ${ga ? ga.toUpperCase() : '----'}`, x + w / 2, y + 111, { font: sans(18, true), color: gaOn && gaCol === C.p1 ? '#fff' : C.text, align: 'center' })
  const prod = p.id === 'LQ' ? `Alarms ${p.alarms}` : p.id === 'WI' ? `Injecting ${fmt(s.p.wiRate ?? null)} bwpd   Alarms ${p.alarms}` : p.id === 'RP' ? `Export ${p.online ? 'open' : 'BLOCKED'}   Alarms ${p.alarms}` : `Oil ${fmt(p.oil)} bbl/d   Gas ${fmt(p.gas, 1)}   Alarms ${p.alarms}`
  text(g, prod, x + 14, y + 152, { font: sans(15), color: C.dim, max: w - 28 })
}

// ====================================================================== mimics
function wellsBox(g: G, s: Snap, x: number, y: number, w: number, h: number, tags: string[], extra?: { label: string; oil: number | null }) {
  box(g, x, y, w, h, 'WELLS')
  const wells = s.r?.wells ?? {}
  const rowH = Math.min(40, (h - 40 - (extra ? 50 : 0)) / Math.max(1, tags.length))
  tags.forEach((tag, i) => {
    const wv = wells[tag]
    const yy = y + 34 + i * rowH
    const on = !!wv && wv.online && wv.oil > 0.5
    lamp(g, x + 12, yy + 4, 16, on)
    text(g, tag, x + 36, yy + 12, { font: sans(15, true) })
    text(g, wv ? fmt(wv.oil) : '----', x + w - 10, yy + 12, { font: mono(15), color: wv && !wv.online ? C.dim : C.value, align: 'right' })
  })
  if (extra) {
    const yy = y + h - 44
    rect(g, x + 8, yy - 6, w - 16, 1.5, C.lineLight)
    text(g, extra.label, x + 12, yy + 10, { font: sans(14, true), color: C.dim })
    text(g, fmt(extra.oil), x + w - 10, yy + 30, { font: mono(15), color: C.value, align: 'right' })
  }
}

function levelVessel(g: G, x: number, y: number, w: number, h: number, lvl: number | null | undefined, tag: string) {
  hVessel(g, x, y, w, h)
  if (lvl != null && Number.isFinite(lvl)) {
    // liquid inventory as a muted fill inside the shell
    g.save()
    g.beginPath()
    g.roundRect(x + 2, y + 2, w - 4, h - 4, h / 2 - 2)
    g.clip()
    const ly = y + h - (h * Math.max(0, Math.min(100, lvl))) / 100
    g.fillStyle = '#8fa1b3'
    g.fillRect(x, ly, w, y + h - ly)
    g.restore()
  }
  text(g, tag, x + w / 2, y + h / 2, { font: sans(16, true), align: 'center' })
}
const lvlAbn = (v: number | null | undefined) => (v == null ? null : v > 90 || v < 10 ? C.p1 : v > 80 || v < 20 ? C.p2 : null)

function tagValue(g: G, x: number, y: number, w: number, tag: string, value: string, unit: string, abn?: string | null) {
  text(g, tag, x, y - 9, { font: sans(13, true), color: C.dim })
  valueBox(g, x, y, w, 28, value, unit, { abn, px: 18 })
}

function mimicAlpha(g: G, s: Snap) {
  head(g, s, 'PROCESS: SEPARATION, COMPRESSION, EXPORT', alertOf(s.platforms.filter((p) => p.id === 'Alpha')))
  const p = s.p
  const r = s.r
  const V = (tag: string) => valveOf(s, tag)
  // ---- lines (drawn first)
  // flare header
  polyline(g, [[330, 66], [905, 66]], C.line, 3)
  arrow(g, 905, 66, 1, 0)
  // inlet
  polyline(g, [[180, 290], [228, 290]])
  polyline(g, [[262, 290], [300, 290]])
  arrow(g, 300, 290, 1, 0)
  // HP relief to flare
  polyline(g, [[330, 254], [330, 66]], C.lineLight, 2.5, [8, 5])
  text(g, 'PSV-1101', 338, 120, { font: sans(12, true), color: C.dim })
  // gas
  polyline(g, [[480, 250], [480, 170], [565, 170]])
  polyline(g, [[600, 170], [650, 170]])
  polyline(g, [[720, 170], [880, 170]])
  arrow(g, 880, 170, 1, 0)
  polyline(g, [[740, 170], [740, 228], [628, 228], [628, 170]], C.line, 2.5)
  arrow(g, 628, 176, 0, -1)
  // blowdown
  polyline(g, [[790, 170], [790, 66]], C.line, 2.5)
  // oil
  polyline(g, [[470, 330], [470, 400], [560, 400]])
  polyline(g, [[690, 400], [735, 400]])
  polyline(g, [[735, 380], [735, 450]])
  polyline(g, [[735, 380], [750, 380]])
  polyline(g, [[735, 450], [750, 450]])
  polyline(g, [[790, 360], [812, 360], [812, 430], [790, 430]])
  polyline(g, [[812, 400], [880, 400]])
  arrow(g, 880, 400, 1, 0)

  // ---- wells + manifold
  const alphaWells = Object.keys(s.r?.wells ?? {}).filter((t) => /^XT-\d/.test(t))
  const wt = alphaWells.length ? alphaWells.sort() : s.plant.equipment.filter((e) => e.kind === 'xmasTree' && /^XT-\d/.test(e.tag)).map((e) => e.tag)
  const whp = s.platforms.find((x) => x.id === 'WHP-N')
  wellsBox(g, s, 12, 54, 168, 420, wt.slice(0, 7), { label: 'WHP-N tie-in (bbl/d)', oil: whp?.oil ?? null })
  rect(g, 228, 240, 34, 100, C.panel, C.text, 2.5)
  valve(g, 203, 290, V('ESDV-1001'), { tag: 'ESDV-1001', tagBelow: true })
  text(g, 'M-1000', 245, 354, { font: sans(13, true), color: C.dim, align: 'center' })

  // ---- HP separator
  levelVessel(g, 300, 250, 220, 80, p.hpLevel, 'V-1100  HP SEP')
  tagValue(g, 360, 214, 112, 'PT-1101', fmt(p.hpPressure, 1), 'barg', p.hpPressure == null ? null : p.hpPressure > 46 ? C.p1 : p.hpPressure > 44 ? C.p2 : null)
  tagValue(g, 360, 358, 100, 'LT-1101', fmt(p.hpLevel, 0), '%', lvlAbn(p.hpLevel))
  valve(g, 515, 400, V('LV-1101'), { tag: 'LV-1101', tagBelow: true, s: 11 })

  // ---- gas train
  valve(g, 525, 170, V('ESDV-2101'), { tag: 'ESDV-2101' })
  vVessel(g, 565, 126, 35, 90)
  text(g, 'V-2100', 582, 230, { font: sans(13, true), color: C.dim, align: 'center' })
  const kst = runOf(s, 'K-2200')
  const km = compressor(g, 650, 142, 70, 56, kst)
  text(g, 'K-2200', 685, 132, { font: sans(14, true), color: C.dim, align: 'center' })
  text(g, km.label, 726, 150, { font: sans(13, true), color: km.labelColor })
  valve(g, 684, 228, V('FV-2201'), { tag: 'FV-2201', tagBelow: true, s: 10 })
  const sm = p.surgeMargin
  tagValue(g, 640, 272, 120, 'SURGE MARGIN', fmt(sm, 0), '%', sm == null ? null : sm < 5 ? C.p1 : sm < 10 ? C.p2 : null)
  tagValue(g, 640, 318, 120, 'RECYCLE', fmt(p.recycle, 0), '%', p.recycle != null && p.recycle > 30 ? C.p2 : null)
  valve(g, 790, 118, V('BDV-2201'), { tag: 'BDV-2201', vertical: true, s: 11 })
  valve(g, 840, 170, V('ESDV-2301'), { tag: 'ESDV-2301' })
  rect(g, 880, 146, 132, 52, C.panel, C.text, 2)
  text(g, 'GAS EXPORT', 946, 132, { font: sans(13, true), color: C.dim, align: 'center' })
  text(g, fmt(r?.gasExport, 1), 958, 172, { font: mono(20), color: C.value, align: 'right' })
  text(g, 'MMscfd', 962, 172, { font: sans(12), color: C.dim })

  // ---- flare
  hVessel(g, 905, 48, 95, 36)
  text(g, 'V-2400', 952, 66, { font: sans(13, true), align: 'center' })
  const fl = r?.flare
  const flAbn = fl != null && fl > 20 ? C.p1 : fl != null && fl > 5 ? C.p2 : null
  text(g, 'FLARE', 872, 107, { font: sans(13, true), color: C.dim, align: 'right' })
  valueBox(g, 880, 92, 132, 30, fmt(fl, 1), 'MMscfd', { px: 18, abn: flAbn })

  // ---- LP separator + export pumps
  levelVessel(g, 560, 370, 130, 60, p.lpLevel, 'V-1300 LP')
  tagValue(g, 560, 452, 100, 'LT-1301', fmt(p.lpLevel, 0), '%', lvlAbn(p.lpLevel))
  pump(g, 770, 380, 18, runOf(s, 'P-1500A'), 'P-1500A')
  pump(g, 770, 450, 18, runOf(s, 'P-1500B'), '')
  text(g, 'P-1500B', 770, 482, { font: sans(13, true), color: C.dim, align: 'center' })
  const pbm = runOf(s, 'P-1500B')
  text(g, pbm === 'running' ? 'RUN' : pbm === 'tripped' ? 'TRIP' : pbm === 'standby' ? 'STBY' : 'STOP', 770, 497, { font: sans(12, true), color: pbm === 'tripped' ? C.p1 : C.dim, align: 'center' })
  valve(g, 848, 400, V('ESDV-1601'), { tag: 'ESDV-1601', tagBelow: true })
  rect(g, 880, 376, 132, 52, C.panel, C.text, 2)
  text(g, 'OIL EXPORT', 946, 362, { font: sans(13, true), color: C.dim, align: 'center' })
  text(g, fmt(r?.oilExport), 968, 402, { font: mono(20), color: C.value, align: 'right' })
  text(g, 'bbl/d', 972, 402, { font: sans(12), color: C.dim })

  // ---- utilities strip
  utilities(g, s, 508)
}

function utilities(g: G, s: Snap, y: number) {
  const p = s.p
  const r = s.r
  rect(g, 0, y - 4, W, 1.5, C.lineLight)
  const cells: [string, string, string, string | null][] = [
    ['POWER', `${fmt(r?.powerGenerated, 1)} / ${r?.powerAvailable != null && r.powerAvailable < 900 ? fmt(r.powerAvailable, 0) : '--'}`, 'MW', r?.powerAvailable === 0 ? C.p1 : null],
    ['BUS', fmt(p.busHz, 1), 'Hz', p.busHz != null && Math.abs(p.busHz - 50) > 1 ? C.p2 : null],
    ['INST AIR', fmt(p.iaPressure, 1), 'barg', p.iaPressure != null && p.iaPressure < 5 ? (p.iaPressure < 4 ? C.p1 : C.p2) : null],
    ['COOLING', fmt(p.cmTemp, 0), '°C', p.cmTemp != null && p.cmTemp > 45 ? C.p2 : null],
    ['FUEL GAS', fmt(p.fuelGasPressure, 1), 'barg', null],
    ['FIREWATER', fmt(p.fwPressure, 1), 'barg', p.fwPressure != null && p.fwPressure < 7 ? C.p2 : null],
  ]
  const cw = (W - 24) / cells.length
  cells.forEach(([lab, v, u, abn], i) => {
    const x = 12 + i * cw
    text(g, lab, x + 6, y + 12, { font: sans(13, true), color: C.dim })
    valueBox(g, x + 6, y + 24, cw - 22, 32, v, u, { px: 18, abn })
  })
  // turbines
  const gts = s.plant.equipment.filter((e) => e.kind === 'gasTurbineGenerator').map((e) => e.tag)
  gts.slice(0, 2).forEach((t, i) => {
    const st = runOf(s, t)
    const x = 12 + 6 + 96 + i * 26
    lamp(g, x, y + 4, 14, st === 'running', st === 'tripped' ? C.p1 : C.text)
  })
}

function mimicWhp(g: G, s: Snap) {
  head(g, s, 'WHP-N: WELLS, MANIFOLD, METERING, EXPORT', alertOf(s.platforms.filter((p) => p.id === 'WHP-N')))
  const V = (tag: string) => valveOf(s, tag)
  const wells = Object.keys(s.r?.wells ?? {}).filter((t) => /^XT-N/.test(t))
  const tags = wells.length ? wells.sort() : s.plant.equipment.filter((e) => e.kind === 'xmasTree' && /^XT-N/.test(e.tag)).map((e) => e.tag)
  const P = s.platforms.find((x) => x.id === 'WHP-N')
  // lines
  polyline(g, [[220, 270], [252, 270]])
  polyline(g, [[290, 270], [340, 270]])
  polyline(g, [[380, 270], [440, 270]])
  polyline(g, [[480, 270], [880, 270]])
  arrow(g, 880, 270, 1, 0)
  polyline(g, [[360, 210], [360, 80], [600, 80]], C.lineLight, 2.5, [8, 5])
  polyline(g, [[680, 80], [880, 80]], C.lineLight, 2.5, [8, 5])
  arrow(g, 880, 80, 1, 0)
  wellsBox(g, s, 12, 54, 208, 440, tags.slice(0, 8))
  rect(g, 252, 200, 38, 140, C.panel, C.text, 2.5)
  text(g, 'M-N200', 271, 356, { font: sans(13, true), color: C.dim, align: 'center' })
  rect(g, 252, 390, 38, 70, C.panel, C.lineLight, 2)
  text(g, 'M-N210 test', 271, 474, { font: sans(13, true), color: C.dim, align: 'center' })
  vVessel(g, 340, 210, 40, 120)
  text(g, 'V-N230', 360, 346, { font: sans(13, true), color: C.dim, align: 'center' })
  text(g, 'desander', 360, 362, { font: sans(12), color: C.dim, align: 'center' })
  vVessel(g, 440, 210, 40, 120)
  text(g, 'V-N240', 460, 346, { font: sans(13, true), color: C.dim, align: 'center' })
  text(g, 'MPFM', 460, 362, { font: sans(12), color: C.dim, align: 'center' })
  const water = Object.entries(s.r?.wells ?? {}).reduce((a, [t, w]) => (/^XT-N/.test(t) ? a + (w?.water ?? 0) : a), 0)
  tagValue(g, 520, 320, 150, 'MPFM OIL', fmt(P?.oil), 'bbl/d')
  tagValue(g, 520, 376, 150, 'MPFM GAS', fmt(P?.gas, 1), 'MMscfd')
  tagValue(g, 520, 432, 150, 'MPFM WATER', s.r ? fmt(water) : '----', 'bbl/d')
  valve(g, 760, 270, V('ESDV-N2003'), { tag: 'ESDV-N2003' })
  rect(g, 880, 236, 132, 70, C.panel, C.text, 2)
  text(g, 'TO ALPHA', 946, 222, { font: sans(13, true), color: C.dim, align: 'center' })
  text(g, fmt(P?.oil), 962, 256, { font: mono(19), color: C.value, align: 'right' })
  text(g, 'bbl/d', 966, 256, { font: sans(12), color: C.dim })
  text(g, fmt(P?.gas, 1), 962, 286, { font: mono(19), color: C.value, align: 'right' })
  text(g, 'MMscfd', 966, 286, { font: sans(12), color: C.dim })
  hVessel(g, 600, 62, 80, 36)
  text(g, 'V-N290', 640, 80, { font: sans(13, true), align: 'center' })
  text(g, 'VENT', 890, 80, { font: sans(13, true), color: C.dim })
  // platform state block on the right
  if (P) platformBlock(g, s, P, 700, 330, 312, 170, true)
  utilities(g, s, 508)
}

// ====================================================================== trend
interface Pen {
  key: keyof HistoryPoint
  label: string
  unit: string
  lo: number
  hi: number
  color: string
  d: number
}
const PANES: Pen[][] = [
  [
    { key: 'oil', label: 'Oil export', unit: 'bbl/d', lo: 0, hi: 60000, color: '#1d4f9a', d: 0 },
    { key: 'gas', label: 'Gas export', unit: 'MMscfd', lo: 0, hi: 100, color: '#24704a', d: 1 },
    { key: 'flare', label: 'Flare', unit: 'MMscfd', lo: 0, hi: 150, color: '#7a4310', d: 1 },
  ],
  [
    { key: 'hpLevel', label: 'HP sep level', unit: '%', lo: 0, hi: 100, color: '#1d4f9a', d: 0 },
    { key: 'hpPressure', label: 'HP sep press', unit: 'barg', lo: 0, hi: 60, color: '#5e2a8c', d: 1 },
    { key: 'iaPressure', label: 'Inst air press', unit: 'barg', lo: 0, hi: 10, color: '#0f6359', d: 1 },
  ],
]

function trend(g: G, s: Snap) {
  head(g, s, s.focus === 'WHP-N' ? 'TRENDS: FIELD EXPORT AND HP SEPARATOR' : 'TRENDS: EXPORT, FLARE, HP SEPARATOR, AIR')
  const hist = s.history.filter((h) => typeof h.t === 'number')
  const t1 = hist.length ? (hist[hist.length - 1].t as number) : s.t
  const t0 = Math.max(0, Math.min(hist.length ? (hist[0].t as number) : t1, t1 - 60))
  const px0 = 70
  const px1 = 780
  PANES.forEach((pens, i) => {
    const y0 = 58 + i * 252
    const h = 210
    pane(g, px0, y0, px1 - px0, h, pens, hist, t0, t1, i === PANES.length - 1)
    legend(g, 796, y0, 216, h, pens, hist)
  })
}

function pane(g: G, x: number, y: number, w: number, h: number, pens: Pen[], hist: Partial<HistoryPoint>[], t0: number, t1: number, axis: boolean) {
  rect(g, x, y, w, h, C.well, C.lineLight, 1.5)
  g.strokeStyle = 'rgba(80,86,92,0.25)'
  g.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    g.beginPath()
    g.moveTo(x, y + (h * i) / 4)
    g.lineTo(x + w, y + (h * i) / 4)
    g.stroke()
  }
  const span = Math.max(1, t1 - t0)
  // time grid: about 6 divisions on round sim-time steps
  const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400]
  const step = steps.find((st) => span / st <= 7) ?? 14400
  for (let tt = Math.ceil(t0 / step) * step; tt <= t1; tt += step) {
    const gx = x + ((tt - t0) / span) * w
    g.beginPath()
    g.moveTo(gx, y)
    g.lineTo(gx, y + h)
    g.stroke()
    if (axis) text(g, fmtClock(tt, false), gx, y + h + 14, { font: mono(14, false), color: C.dim, align: 'center' })
  }
  // scale of the first pen on the left
  const p0 = pens[0]
  for (let i = 0; i <= 4; i++) text(g, fmt(p0.lo + ((p0.hi - p0.lo) * (4 - i)) / 4, 0), x - 6, y + (h * i) / 4, { font: mono(12, false), color: C.dim, align: 'right' })
  let any = false
  for (const pen of pens) {
    g.strokeStyle = pen.color
    g.lineWidth = 2.5
    g.beginPath()
    let started = false
    for (const pt of hist) {
      const v = pt[pen.key]
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        started = false
        continue
      }
      const gx = x + (((pt.t as number) - t0) / span) * w
      const gy = y + h - (Math.max(0, Math.min(1, (v - pen.lo) / (pen.hi - pen.lo))) * (h - 4) + 2)
      if (started) g.lineTo(gx, gy)
      else g.moveTo(gx, gy)
      started = true
      any = true
    }
    g.stroke()
  }
  if (!any) text(g, 'NO TREND DATA YET', x + w / 2, y + h / 2, { font: sans(20, true), color: C.faint, align: 'center' })
}

function legend(g: G, x: number, y: number, w: number, h: number, pens: Pen[], hist: Partial<HistoryPoint>[]) {
  rect(g, x, y, w, h, C.panel, C.lineLight, 1.5)
  const last = hist[hist.length - 1] ?? {}
  pens.forEach((pen, i) => {
    const yy = y + 12 + i * ((h - 16) / pens.length)
    rect(g, x + 10, yy + 6, 22, 6, pen.color)
    text(g, pen.label, x + 40, yy + 9, { font: sans(15, true) })
    const v = last[pen.key]
    text(g, typeof v === 'number' ? fmt(v, pen.d) : '----', x + w - 64, yy + 36, { font: mono(22), color: C.value, align: 'right' })
    text(g, pen.unit, x + w - 58, yy + 36, { font: sans(13), color: C.dim })
    text(g, `${fmt(pen.lo)}–${fmt(pen.hi)}`, x + 40, yy + 58, { font: sans(12), color: C.faint })
  })
}

// ====================================================================== F&G map
const sev = (z: ZoneStatus | undefined) => {
  if (!z) return 0
  if (z.fire === 'confirmed' || z.gas === 'confirmed' || z.smoke === 'confirmed') return 3
  if (z.gas === 'high' || z.fire === 'single' || z.smoke === 'single') return 2
  if (z.gas === 'low') return 1
  return 0
}
const sevColor = (n: number) => [C.panelDark, C.p3, C.p2, C.p1][n]
const zoneWord = (z: ZoneStatus | undefined) => {
  if (!z) return '----'
  const out: string[] = []
  if (z.fire !== 'normal') out.push(`FIRE ${z.fire === 'confirmed' ? 'CONF' : '1ooN'}`)
  if (z.gas !== 'normal') out.push(`GAS ${z.gas === 'confirmed' ? 'CONF' : z.gas.toUpperCase()}`)
  if (z.smoke !== 'normal') out.push(`SMOKE ${z.smoke === 'confirmed' ? 'CONF' : '1ooN'}`)
  return out.length ? out.join(' ') : 'NORMAL'
}

function mapPanel(g: G, s: Snap, pn: MapPanel, zones: FireZone[]) {
  const i = info(s.plant)
  rect(g, pn.x, pn.y, pn.w, pn.h, C.well, C.lineLight, 1.5)
  text(g, pn.title, pn.x + 10, pn.y + 14, { font: sans(13, true), color: C.dim })
  const rects = [...pn.ctx, ...zones.flatMap((z) => z.rects)]
  if (!rects.length) {
    text(g, 'NO F&G ZONES', pn.x + pn.w / 2, pn.y + pn.h / 2, { font: sans(18, true), color: C.faint, align: 'center' })
    return
  }
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x0)
    x1 = Math.max(x1, r.x1)
    z0 = Math.min(z0, r.z0)
    z1 = Math.max(z1, r.z1)
  }
  const rot = pn.rot
  const pw = rot ? z1 - z0 : x1 - x0
  const ph = rot ? x1 - x0 : z1 - z0
  const sc = Math.min((pn.w - 24) / pw, (pn.h - 40) / ph)
  const ox = pn.x + (pn.w - pw * sc) / 2
  const oy = pn.y + 28 + (pn.h - 32 - ph * sc) / 2
  // plan (x, z) → screen; rotated: north (−z) left, east (+x) up
  const P = (x: number, z: number): [number, number] => (rot ? [ox + (z - z0) * sc, oy + (x1 - x) * sc] : [ox + (x - x0) * sc, oy + (z - z0) * sc])
  const R = (r: PlanRect): [number, number, number, number] => {
    const [ax, ay] = P(r.x0, r.z0)
    const [bx, by] = P(r.x1, r.z1)
    return [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay)]
  }
  for (const r of pn.ctx) {
    const [x, y, w, h] = R(r)
    rect(g, x, y, w, h, '#cbced1', C.lineLight, 1)
  }
  // big zones first, modules (small) on top
  const area = (z: FireZone) => z.rects.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0)
  const order = zones.slice().sort((a, b) => area(b) - area(a))
  for (const z of order) {
    const st = s.fg[z.id]
    const n = sev(st)
    const on = n > 0 && (n < 3 || s.blink)
    for (const r of z.rects) {
      const [x, y, w, h] = R(r)
      rect(g, x, y, w, h, on ? sevColor(n) : n ? '#d6a39e' : z.kind === 'module' ? '#a9aeb3' : '#b9bdc1', C.text, z.kind === 'module' ? 1.5 : 2)
      if (st?.deluge) {
        g.save()
        g.beginPath()
        g.rect(x, y, w, h)
        g.clip()
        g.strokeStyle = C.deluge
        g.lineWidth = 3
        for (let d = -h; d < w; d += 14) {
          g.beginPath()
          g.moveTo(x + d, y + h)
          g.lineTo(x + d + h, y)
          g.stroke()
        }
        g.restore()
      }
    }
  }
  // labels on the open-area zones that have room for them (modules are named in the zone list)
  for (const z of order) {
    if (z.kind === 'module') continue
    const big = z.rects.map(R).sort((a, b) => b[2] * b[3] - a[2] * a[3])[0]
    const [x, y, w, h] = big
    if (w < 40 || h < 22) continue
    const n = sev(s.fg[z.id])
    const inv = n === 3 && s.blink
    // near the top of the zone, so a smaller zone drawn inside it (drill floor, modules) keeps its own label clear
    const ly = h > 60 ? y + 16 : y + h / 2 - (h > 40 ? 8 : 0)
    text(g, z.id, x + w / 2, ly, { font: sans(14, true), color: inv ? '#fff' : C.text, align: 'center', max: w - 6 })
    if (h > 40) text(g, zoneWord(s.fg[z.id]), x + w / 2, ly + 16, { font: sans(11, true), color: inv ? '#fff' : C.dim, align: 'center', max: w - 6 })
  }
  // detectors on this level: every mapped one as a small dot, those in alarm / fault on top
  const inBand = (p: Vec3) => p[1] >= (pn.y0 < -50 ? -99 : pn.y0 === -0.5 ? 0 : pn.y0 + 0.5) && p[1] < (pn.y1 > 50 ? 999 : pn.y1 + 0.5)
  for (const d of i.dets) {
    if (!inBand(d.pos)) continue
    const [x, y] = P(d.pos[0], d.pos[2])
    g.fillStyle = C.faint
    g.fillRect(x - 1.5, y - 1.5, 3, 3)
  }
  for (const [tag, d] of Object.entries(s.det)) {
    if (!d || d.state === 'normal') continue
    const pos = detectorPos(s.plant, tag)
    if (!pos || !inBand(pos)) continue
    const [x, y] = P(pos[0], pos[2])
    if (x < pn.x || x > pn.x + pn.w || y < pn.y || y > pn.y + pn.h) continue
    const col = d.state === 'high' ? C.p1 : d.state === 'low' ? C.p3 : d.state === 'fault' ? C.diag : C.white
    g.beginPath()
    g.arc(x, y, 6, 0, Math.PI * 2)
    g.fillStyle = col
    g.fill()
    g.strokeStyle = C.text
    g.lineWidth = 2
    g.stroke()
  }
  // north arrow
  const nx = pn.x + pn.w - 34
  const ny = pn.y + 16
  const [dx, dy] = rot ? [-1, 0] : [0, -1]
  polyline(g, [[nx - dx * 10, ny - dy * 10], [nx + dx * 10, ny + dy * 10]], C.text, 2)
  arrow(g, nx + dx * 12, ny + dy * 12, dx, dy, C.text, 8)
  text(g, 'N', nx + (rot ? -28 : 14), ny + (rot ? 0 : 4), { font: sans(13, true), align: 'center' })
}

interface MapPanel {
  title: string
  x: number
  y: number
  w: number
  h: number
  /** deck-local floor band of the zones / detectors shown */
  y0: number
  y1: number
  ctx: PlanRect[]
  /** north to the left (long north–south field) */
  rot: boolean
}

function fgmap(g: G, s: Snap) {
  const i = info(s.plant)
  const whpOnly = s.focus === 'WHP-N' && i.zones.some((z) => z.platform === 'WHP-N')
  const zones = whpOnly ? i.zones.filter((z) => z.platform === 'WHP-N') : i.zones
  const worst = Math.max(0, ...zones.map((z) => sev(s.fg[z.id])))
  head(g, s, whpOnly ? 'FIRE & GAS: WHP-N ZONE STATUS' : 'FIRE & GAS: ZONE STATUS', worst >= 3 ? 'red' : worst >= 2 ? 'amber' : null)
  const MX0 = 14
  const MY0 = 56
  const MW = 690
  const MH = 478
  rect(g, MX0, MY0, MW, MH, C.bg)
  const multi = s.alpha && !whpOnly && zones.some((z) => z.y0 < -0.5) && zones.some((z) => z.y0 >= 9.5)
  const panels: MapPanel[] = multi
    ? [
        { title: 'PRODUCTION DECK EL +28 · BRIDGES · WHP-N · LQ', x: MX0, y: MY0, w: MW, h: 240, y0: -0.5, y1: 9.5, ctx: [ALPHA_DECK, WHP.deck, LQ.deck, BRIDGE_N.walk, BRIDGE_S.walk], rot: true },
        { title: 'ALPHA CELLAR DECK EL +20', x: MX0, y: MY0 + 248, w: (MW - 10) / 2, h: MH - 248, y0: -99, y1: -0.5, ctx: [ALPHA_DECK], rot: true },
        { title: 'ALPHA WEATHER EL +38 · DRILL FLOOR', x: MX0 + (MW + 10) / 2, y: MY0 + 248, w: (MW - 10) / 2, h: MH - 248, y0: 9.5, y1: 99, ctx: [ALPHA_DECK], rot: true },
      ]
    : [{ title: whpOnly ? 'WHP-N MAIN DECK' : 'PLAN', x: MX0, y: MY0, w: MW, h: MH, y0: -99, y1: 99, ctx: s.alpha ? (whpOnly ? [WHP.deck] : [ALPHA_DECK, WHP.deck, LQ.deck, BRIDGE_N.walk, BRIDGE_S.walk]) : [], rot: !whpOnly && s.alpha }]
  for (const pn of panels) mapPanel(g, s, pn, zones.filter((z) => z.y0 >= pn.y0 && z.y0 < pn.y1))
  // zone table
  const TX = 716
  box(g, TX, 56, 296, 506, 'ZONES')
  const rowH = Math.max(22, Math.min(46, 460 / Math.max(1, zones.length)))
  // abnormal zones first
  const listed = zones.slice().sort((a, b) => sev(s.fg[b.id]) - sev(s.fg[a.id]) || Number(!!s.fg[b.id]?.deluge) - Number(!!s.fg[a.id]?.deluge))
  listed.slice(0, Math.floor(470 / rowH)).forEach((z, k) => {
    const st = s.fg[z.id]
    const n = sev(st)
    const y = 80 + k * rowH
    rect(g, TX + 10, y, 14, rowH - 6, n ? sevColor(n) : C.white, C.text, 1.5)
    text(g, z.id, TX + 32, y + (rowH - 6) / 2 - (rowH > 34 ? 8 : 0), { font: sans(14, true), max: 120 })
    if (rowH > 34) text(g, z.name, TX + 32, y + (rowH - 6) / 2 + 9, { font: sans(11), color: C.dim, max: 150 })
    text(g, zoneWord(st), TX + 286, y + (rowH - 6) / 2, { font: sans(12, true), color: n ? C.text : C.dim, align: 'right', max: 120 })
    if (st?.deluge) text(g, 'DELUGE', TX + 286, y + rowH - 4, { font: sans(10, true), color: C.deluge, align: 'right' })
  })
  // legend
  const ly = H - 14
  ;([['GAS LOW', C.p3], ['HIGH / 1ooN', C.p2], ['CONFIRMED', C.p1], ['DET FAULT', C.diag], ['DELUGE', C.deluge]] as const).forEach(([l, c], k) => {
    rect(g, 24 + k * 136, ly - 7, 14, 14, c, C.text, 1)
    text(g, l, 44 + k * 136, ly, { font: sans(12, true), color: C.dim })
  })
}

// ====================================================================== alarm summary
const PRI_COL: Record<number, string> = { 1: C.p1, 2: C.p2, 3: C.p3 }
const isUnack = (a: Alarm) => a.state === 'unack' || a.state === 'rtnUnack'

function alarmSummary(g: G, s: Snap) {
  const whp = s.focus === 'WHP-N'
  const rate = s.k.alarmRate
  const flood = rate != null && rate >= 10
  head(g, s, whp ? 'ALARM SUMMARY: WHP-N' : 'ALARM SUMMARY', flood ? 'amber' : null)
  const all = s.alarms
  // counts strip
  const vis = all ? all.filter((a) => (!whp || a.platform === 'WHP-N') && a.state !== 'shelved' && (a.active || isUnack(a))) : []
  const shelved = all ? all.filter((a) => a.state === 'shelved' && (!whp || a.platform === 'WHP-N')).length : 0
  ;([1, 2, 3] as const).forEach((p, i) => {
    const n = vis.filter((a) => a.priority === p).length
    const un = vis.filter((a) => a.priority === p && isUnack(a)).length
    const x = 12 + i * 170
    rect(g, x, 54, 160, 56, C.panel, n ? PRI_COL[p] : C.lineLight, n ? 3 : 1.5)
    priTile(g, x + 10, 64, p, true)
    text(g, `${all ? n : '--'}`, x + 96, 74, { font: mono(26), color: C.value, align: 'right' })
    text(g, all ? `${un} unack` : '', x + 150, 98, { font: sans(13), color: un ? C.text : C.dim, align: 'right' })
    text(g, ['CRITICAL', 'HIGH', 'LOW'][i], x + 102, 74, { font: sans(11, true), color: C.dim })
  })
  rect(g, 522, 54, 150, 56, C.panel, C.lineLight, 1.5)
  text(g, 'SHELVED', 534, 70, { font: sans(13, true), color: C.dim })
  text(g, all ? String(shelved) : '--', 660, 90, { font: mono(24), color: C.value, align: 'right' })
  const fOn = flood && s.blink
  rect(g, 684, 54, 328, 56, fOn ? C.p2 : C.panel, flood ? C.p2 : C.lineLight, flood ? 3 : 1.5)
  text(g, 'ALARM RATE (10 min)', 696, 70, { font: sans(13, true), color: C.dim })
  text(g, rate == null ? '--' : String(rate), 860, 90, { font: mono(26), color: C.value, align: 'right' })
  text(g, flood ? 'FLOOD' : 'target < 10', 1000, 90, { font: sans(flood ? 22 : 14, true), color: flood ? C.text : C.dim, align: 'right' })
  // column header
  const cols = { pri: 14, time: 66, tag: 186, text: 340, value: 812, state: 1008 }
  rect(g, 0, 120, W, 28, C.panelDark)
  for (const [k, x] of Object.entries(cols)) text(g, k.toUpperCase(), x, 134, { font: sans(13, true), color: C.dim, align: k === 'state' ? 'right' : 'left' })
  const rowH = 30
  const y0 = 152
  if (!all) {
    // engine without an alarm list yet: show the trip / warning event log instead
    const ev = s.events.filter((e) => e.level !== 'info').slice(0, 13)
    text(g, 'Alarm list not available from the simulation yet: showing the event log', 14, H - 14, { font: sans(13, true), color: C.diag })
    if (!ev.length) text(g, 'NO EVENTS', W / 2, 330, { font: sans(24, true), color: C.faint, align: 'center' })
    ev.forEach((e, i) => {
      const y = y0 + i * rowH
      rect(g, 0, y, W, rowH - 2, i % 2 ? C.bg : '#bcc0c3')
      priTile(g, cols.pri, y + 3, e.level === 'trip' ? 2 : 3, true)
      text(g, fmtClock(e.t, false), cols.time, y + rowH / 2, { font: mono(16, false) })
      text(g, e.text, cols.tag, y + rowH / 2, { font: sans(16), max: 800 })
    })
    return
  }
  const list = vis.slice().sort((a, b) => Number(isUnack(b)) - Number(isUnack(a)) || a.priority - b.priority || b.raisedAt - a.raisedAt)
  if (!list.length) text(g, 'NO ACTIVE ALARMS', W / 2, 340, { font: sans(26, true), color: C.faint, align: 'center' })
  const max = Math.floor((H - y0 - 4) / rowH) - (vis.length * rowH > H - y0 - 4 ? 1 : 0)
  list.slice(0, max).forEach((a, i) => {
    const y = y0 + i * rowH
    const un = isUnack(a)
    rect(g, 0, y, W, rowH - 2, i % 2 ? C.bg : '#bcc0c3')
    priTile(g, cols.pri, y + 3, a.priority, !un || s.blink)
    const col = a.active ? C.text : C.dim
    text(g, fmtClock(a.raisedAt, false), cols.time, y + rowH / 2, { font: mono(16, false), color: col })
    text(g, a.tag, cols.tag, y + rowH / 2, { font: sans(16, true), color: col, max: 148 })
    text(g, a.text, cols.text, y + rowH / 2, { font: sans(16), color: col, max: 460 })
    if (a.value) text(g, a.value, cols.value, y + rowH / 2, { font: mono(15, false), color: C.value, max: 110 })
    const st = a.state === 'unack' ? 'UNACK' : a.state === 'rtnUnack' ? 'RTN UNACK' : a.active ? 'ACK' : 'RTN'
    text(g, st, cols.state, y + rowH / 2, { font: sans(14, true), color: un ? C.text : C.dim, align: 'right' })
  })
  if (list.length > max) text(g, `+ ${list.length - max} more`, W - 14, H - 10, { font: sans(13, true), color: C.dim, align: 'right' })
}

/** ISA-101 priority indicator: shape + number (P1 square red, P2 triangle orange, P3 inverted triangle yellow) */
function priTile(g: G, x: number, y: number, p: number, on: boolean) {
  const s = 24
  const col = on ? PRI_COL[p] ?? C.info : C.white
  g.beginPath()
  if (p === 1) g.rect(x, y, s, s)
  else if (p === 2) {
    g.moveTo(x + s / 2, y)
    g.lineTo(x + s, y + s)
    g.lineTo(x, y + s)
  } else {
    g.moveTo(x, y)
    g.lineTo(x + s, y)
    g.lineTo(x + s / 2, y + s)
  }
  g.closePath()
  g.fillStyle = col
  g.fill()
  g.strokeStyle = C.text
  g.lineWidth = 1.5
  g.stroke()
  text(g, String(p), x + s / 2, y + (p === 2 ? s * 0.62 : p === 3 ? s * 0.38 : s / 2), { font: sans(13, true), color: p === 1 && on ? '#fff' : C.text, align: 'center' })
}

// ====================================================================== ESD / shutdown status
const LEVELS: ShutdownLevel[] = ['APS', 'ESD1', 'ESD2', 'PSD', 'USD']
const lvlCol = (l: ShutdownLevel) => (SHUTDOWN_RANK[l] >= SHUTDOWN_RANK.ESD2 ? C.p1 : C.p2)

function esd(g: G, s: Snap) {
  const whp = s.focus === 'WHP-N'
  const list = (s.shutdowns ?? []).filter((d) => !whp || d.platform === 'WHP-N')
  const latched = list.filter((d) => d.resetAt == null)
  const top = latched.reduce<ShutdownLevel | null>((a, d) => (!a || SHUTDOWN_RANK[d.level] > SHUTDOWN_RANK[a] ? d.level : a), null)
  head(g, s, whp ? 'SHUTDOWN STATUS: WHP-N' : 'SHUTDOWN / ESD STATUS', top ? (SHUTDOWN_RANK[top] >= SHUTDOWN_RANK.ESD2 ? 'red' : 'amber') : null)
  // hierarchy strip
  LEVELS.forEach((l, i) => {
    const x = 12 + i * 122
    const act = latched.some((d) => d.level === l)
    const on = act && s.blink
    rect(g, x, 54, 114, 62, on ? lvlCol(l) : C.panel, act ? lvlCol(l) : C.lineLight, act ? 3 : 1.5)
    text(g, l, x + 57, 76, { font: sans(22, true), color: on && lvlCol(l) === C.p1 ? '#fff' : C.text, align: 'center' })
    text(g, SHUTDOWN_LABEL[l], x + 57, 102, { font: sans(10), color: on && lvlCol(l) === C.p1 ? '#fff' : C.dim, align: 'center', max: 106 })
  })
  // platform states
  const ps = whp ? s.platforms.filter((p) => p.id === 'WHP-N') : s.platforms
  ps.forEach((p, i) => {
    const y = 54 + i * 22
    const x = 636
    text(g, p.id, x, y + 10, { font: sans(15, true) })
    text(g, p.shutdown ?? 'NORMAL', x + 70, y + 10, { font: sans(15, true), color: p.shutdown ? lvlCol(p.shutdown) : C.dim })
    text(g, `GA ${p.ga ? p.ga.toUpperCase() : '--'}`, x + 170, y + 10, { font: sans(15, true), color: p.ga && p.ga !== 'normal' ? C.p1 : C.dim })
  })
  // latched shutdown list
  box(g, 12, 128, 690, 438, 'LATCHED SHUTDOWNS')
  if (!s.shutdowns) text(g, 'Shutdown data not available from the simulation yet', 357, 340, { font: sans(18, true), color: C.diag, align: 'center' })
  else if (!list.length) text(g, 'NO SHUTDOWNS LATCHED', 357, 340, { font: sans(26, true), color: C.faint, align: 'center' })
  const rowH = 52
  list
    .slice()
    .sort((a, b) => Number(a.resetAt != null) - Number(b.resetAt != null) || SHUTDOWN_RANK[b.level] - SHUTDOWN_RANK[a.level] || b.at - a.at)
    .slice(0, 8)
    .forEach((d, i) => {
      const y = 152 + i * rowH
      const reset = d.resetAt != null
      rect(g, 20, y, 674, rowH - 6, i % 2 ? C.bg : '#bcc0c3')
      rect(g, 24, y + 6, 70, rowH - 18, reset ? C.white : lvlCol(d.level), C.text, 1.5)
      text(g, d.level, 59, y + rowH / 2 - 3, { font: sans(17, true), color: !reset && lvlCol(d.level) === C.p1 ? '#fff' : C.text, align: 'center' })
      text(g, `${d.platform}${d.zone ? ` · ${d.zone}` : ''}`, 104, y + 14, { font: sans(14, true), color: C.dim })
      text(g, d.cause, 104, y + 33, { font: sans(15), max: 420 })
      text(g, fmtClock(d.at, false), 600, y + 14, { font: mono(14, false), color: C.dim, align: 'right' })
      const st = reset ? 'RESET' : d.resettable ? 'READY TO RESET' : 'LATCHED'
      text(g, st, 686, y + 33, { font: sans(14, true), color: reset ? C.dim : d.resettable ? C.text : lvlCol(d.level), align: 'right' })
    })
  // ESD valves
  box(g, 714, 128, 298, 438, 'ESD / BLOWDOWN VALVES')
  const tags = (whp ? ['ESDV-N2003'] : ['ESDV-1001', 'ESDV-2101', 'ESDV-2301', 'ESDV-1601', 'ESDV-5301', 'ESDV-N2003', 'BDV-2201']).filter((t) => valveOf(s, t).exists)
  const extra = s.plant.valves.filter((v) => (v.type === 'esdv' || v.type === 'bdv') && !tags.includes(v.tag) && (!whp || /-N/.test(v.tag)))
  const all = [...tags, ...extra.map((v) => v.tag)].slice(0, 10)
  all.forEach((t, i) => {
    const y = 168 + i * 39
    const v = valveOf(s, t)
    valve(g, 744, y, v, { s: 10 })
    text(g, t, 770, y, { font: sans(15, true) })
    const open = v.pos == null ? null : v.pos > 0.95 ? 'OPEN' : v.pos < 0.05 ? 'CLOSED' : `${Math.round(v.pos * 100)} %`
    const abn = v.fault ? C.diag : v.pos != null && (v.normallyOpen ? v.pos < 0.95 : v.pos > 0.05) ? C.p1 : null
    text(g, v.fault ? 'STUCK' : open ?? '----', 1000, y, { font: sans(14, true), color: abn ?? C.dim, align: 'right' })
  })
}

// ====================================================================== CCTV
let cctvBase: HTMLCanvasElement | null = null
const CAMS = ['WELLBAY', 'HP SEPARATOR', 'COMPRESSOR K-2200', 'EXPORT PUMPS', 'FLARE BOOM', 'HELIDECK', 'LIFEBOATS', 'NORTH BRIDGE', 'SOUTH BRIDGE', 'CRANE PEDESTAL']
function cctvStatic() {
  if (cctvBase) return cctvBase
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  let seed = 7
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  g.fillStyle = '#16191b'
  g.fillRect(0, 0, W, H)
  for (let q = 0; q < 4; q++) {
    const x = (q % 2) * (W / 2)
    const y = Math.floor(q / 2) * (H / 2)
    const grd = g.createLinearGradient(x, y, x, y + H / 2)
    grd.addColorStop(0, '#78858e')
    grd.addColorStop(0.5, '#56616a')
    grd.addColorStop(1, '#2c3337')
    g.fillStyle = grd
    g.fillRect(x + 3, y + 3, W / 2 - 6, H / 2 - 6)
    // deck line, steel, pipework
    g.fillStyle = '#3a4146'
    g.fillRect(x + 3, y + H / 2 - 70, W / 2 - 6, 67)
    for (let k = 0; k < 7; k++) {
      g.fillStyle = k % 2 ? '#8e979e' : '#a0a8ae'
      const bx = x + 20 + rnd() * (W / 2 - 120)
      const bh = 40 + rnd() * 120
      g.fillRect(bx, y + H / 2 - 70 - bh, 30 + rnd() * 80, bh)
    }
    g.strokeStyle = '#b7a24a'
    g.lineWidth = 6
    g.beginPath()
    g.moveTo(x + 10, y + 120 + q * 8)
    g.lineTo(x + W / 2 - 10, y + 110 + q * 5)
    g.stroke()
  }
  cctvBase = c
  return c
}
function cctv(g: G, s: Snap) {
  g.drawImage(cctvStatic(), 0, 0)
  const cyc = Math.floor(s.wall / 6)
  for (let q = 0; q < 4; q++) {
    const x = (q % 2) * (W / 2)
    const y = Math.floor(q / 2) * (H / 2)
    const cam = q < 3 ? q : 3 + (cyc % (CAMS.length - 3))
    rect(g, x + 8, y + 10, 300, 26, 'rgba(10,12,14,0.55)')
    text(g, `CAM ${String(cam + 1).padStart(2, '0')}  ${CAMS[cam]}`, x + 16, y + 23, { font: mono(16), color: '#e6eaee', max: 290 })
    text(g, s.clock, x + W / 2 - 14, y + H / 2 - 18, { font: mono(16), color: '#e6eaee', align: 'right' })
    if (q === 3) text(g, 'AUTO-CYCLE', x + 16, y + 52, { font: mono(13), color: '#c9d0d6' })
    if (s.blink) {
      g.fillStyle = '#d42a1f'
      g.beginPath()
      g.arc(x + W / 2 - 24, y + 24, 6, 0, Math.PI * 2)
      g.fill()
    }
  }
  text(g, s.site, W / 2, H - 14, { font: mono(13), color: '#c9d0d6', align: 'center' })
}
