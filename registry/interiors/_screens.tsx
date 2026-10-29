// Procedural ISA-101 style HMI screen textures (sample data, clearly labelled) and the screen-plane renderer with live-texture overrides.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { V3 } from '../lib/kit'

export type ScreenKind = 'overview' | 'mimic' | 'trend' | 'alarm' | 'fg' | 'esd' | 'cctv' | 'weather' | 'helideck' | 'kpi' | 'off'
export const SCREEN_KINDS: ScreenKind[] = ['overview', 'mimic', 'trend', 'alarm', 'fg', 'esd', 'cctv', 'weather', 'helideck', 'kpi', 'off']

/** One screen face: centre, Euler rotation (XYZ, rad), visible width and height in metres. Faces +Z of its own frame. */
export interface ScreenPlacement {
  pos: V3
  rot?: V3
  w: number
  h: number
  kind: ScreenKind
}

type G = CanvasRenderingContext2D
const W = 1024
const H = 576
const HEAD = 44

const C = {
  bg: '#c4c7ca',
  panel: '#b5b9bd',
  panelDark: '#a4a9ae',
  well: '#d6d8da',
  line: '#5f656b',
  lineLight: '#80868c',
  text: '#1d2125',
  dim: '#4b5157',
  faint: '#6f757b',
  value: '#0f2f5c',
  header: '#9aa0a6',
  white: '#eef0f1',
  p1: '#d42a1f',
  p2: '#ee8a00',
  p3: '#efd000',
  diag: '#a3369a',
  info: '#2f66b8',
}
const mono = (px: number, bold = true) => `${bold ? 'bold ' : ''}${px}px Menlo, Consolas, "DejaVu Sans Mono", "Courier New", monospace`
const sans = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px "Helvetica Neue", Arial, sans-serif`

function rng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}
function text(g: G, s: string, x: number, y: number, o: { font?: string; color?: string; align?: CanvasTextAlign; max?: number } = {}) {
  g.font = o.font ?? sans(18)
  g.fillStyle = o.color ?? C.text
  g.textAlign = o.align ?? 'left'
  g.textBaseline = 'middle'
  if (o.max) g.fillText(s, x, y, o.max)
  else g.fillText(s, x, y)
}
function rect(g: G, x: number, y: number, w: number, h: number, fill?: string, stroke?: string, lw = 2) {
  if (fill) {
    g.fillStyle = fill
    g.fillRect(x, y, w, h)
  }
  if (stroke) {
    g.strokeStyle = stroke
    g.lineWidth = lw
    g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw)
  }
}
function line(g: G, pts: [number, number][], color = C.line, lw = 3) {
  g.strokeStyle = color
  g.lineWidth = lw
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.stroke()
}
function arrow(g: G, x: number, y: number, dx: number, dy: number, color = C.line, s = 9) {
  const l = Math.hypot(dx, dy) || 1
  const ux = dx / l
  const uy = dy / l
  g.fillStyle = color
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(x - ux * s - uy * s * 0.6, y - uy * s + ux * s * 0.6)
  g.lineTo(x - ux * s + uy * s * 0.6, y - uy * s - ux * s * 0.6)
  g.closePath()
  g.fill()
}
function header(g: G, title: string, alert?: 'red' | 'amber') {
  const bg = alert === 'red' ? C.p1 : alert === 'amber' ? C.p2 : C.header
  const fg = alert === 'red' ? '#fff' : C.text
  rect(g, 0, 0, W, HEAD, bg)
  rect(g, 0, HEAD - 2, W, 2, C.line)
  text(g, 'SAMPLE FIELD', 14, HEAD / 2, { font: sans(19, true), color: fg })
  rect(g, 162, 10, 2, HEAD - 20, fg)
  text(g, title, 176, HEAD / 2, { font: sans(19), color: fg, max: W - 420 })
  text(g, '14:32:07', W - 14, HEAD / 2, { font: mono(21), color: fg, align: 'right' })
  g.fillStyle = fg
  g.beginPath()
  g.moveTo(W - 136, 14)
  g.lineTo(W - 124, 22)
  g.lineTo(W - 136, 30)
  g.closePath()
  g.fill()
}
/** Honesty strip: every procedural screen says it is sample content. */
function footer(g: G, dark = false) {
  const s = 'SAMPLE DATA · SIMULATED'
  g.font = sans(13, true)
  const w = g.measureText(s).width + 16
  rect(g, W - w - 6, H - 24, w, 20, dark ? 'rgba(10,12,14,0.6)' : C.panelDark)
  text(g, s, W - 14, H - 14, { font: sans(13, true), color: dark ? '#e6eaee' : C.diag, align: 'right' })
}
function box(g: G, x: number, y: number, w: number, h: number, caption?: string) {
  rect(g, x, y, w, h, C.panel, C.lineLight, 1.5)
  if (caption) text(g, caption, x + 10, y + 14, { font: sans(14, true), color: C.dim })
}
function valueBox(g: G, x: number, y: number, w: number, h: number, value: string, unit = '', abn?: string) {
  rect(g, x, y, w, h, C.well, abn ?? C.lineLight, abn ? 3 : 1.5)
  const px = Math.round(h * 0.62)
  const uw = unit ? Math.max(30, unit.length * px * 0.38 + 8) : 0
  text(g, value, x + w - uw - 8, y + h / 2 + 1, { font: mono(px), color: C.value, align: 'right' })
  if (unit) text(g, unit, x + w - uw + 2, y + h / 2 + 1, { font: sans(Math.round(px * 0.6)), color: C.dim })
  if (abn) rect(g, x - 10, y, 10, h, abn)
}
function hbar(g: G, x: number, y: number, w: number, h: number, f: number, marks: number[] = [], abn?: string) {
  rect(g, x, y, w, h, C.well, C.lineLight, 1)
  rect(g, x + 1, y + 1, (w - 2) * Math.max(0, Math.min(1, f)), h - 2, abn ?? '#6d747a')
  for (const m of marks) rect(g, x + w * m - 1, y - 4, 2, h + 8, C.text)
}
function capsule(g: G, x: number, y: number, w: number, h: number, level?: number) {
  g.save()
  g.beginPath()
  g.roundRect(x, y, w, h, Math.min(w, h) / 2)
  g.fillStyle = C.panel
  g.fill()
  if (level !== undefined) {
    g.clip()
    g.fillStyle = '#8e9aa6'
    g.fillRect(x, y + h * (1 - level), w, h * level)
  }
  g.restore()
  g.beginPath()
  g.roundRect(x, y, w, h, Math.min(w, h) / 2)
  g.strokeStyle = C.text
  g.lineWidth = 2.5
  g.stroke()
}
function valve(g: G, x: number, y: number, open: boolean, tag?: string, abn?: boolean, vertical = false) {
  const s = 12
  g.save()
  g.translate(x, y)
  if (vertical) g.rotate(Math.PI / 2)
  for (const sg of [-1, 1]) {
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(sg * s, -s * 0.7)
    g.lineTo(sg * s, s * 0.7)
    g.closePath()
    g.fillStyle = open ? C.text : C.white
    g.fill()
    g.strokeStyle = abn ? C.p1 : C.text
    g.lineWidth = abn ? 3.5 : 2
    g.stroke()
  }
  g.strokeStyle = C.text
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, -s * 1.2)
  g.stroke()
  g.fillStyle = C.panelDark
  g.fillRect(-s * 0.55, -s * 1.7, s * 1.1, s * 0.55)
  g.restore()
  if (tag) text(g, tag, x, y - s * 2.5, { font: sans(13, true), color: abn ? C.p1 : C.dim, align: 'center' })
}
function pumpSym(g: G, x: number, y: number, r: number, running: boolean, tag: string) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = running ? '#4f565c' : C.white
  g.fill()
  g.strokeStyle = C.text
  g.lineWidth = 2
  g.stroke()
  line(g, [[x, y - r], [x + r, y - r], [x + r, y - r * 0.4]], C.text, 2)
  text(g, tag, x, y + r + 13, { font: sans(13, true), color: C.dim, align: 'center' })
  text(g, running ? 'RUN' : 'STBY', x, y + r + 28, { font: sans(12, true), color: C.dim, align: 'center' })
}
function priTile(g: G, x: number, y: number, p: number) {
  const s = 22
  const col = [C.info, C.p1, C.p2, C.p3][p]
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
  text(g, String(p), x + s / 2, y + (p === 2 ? s * 0.62 : p === 3 ? s * 0.38 : s / 2), { font: sans(12, true), color: p === 1 ? '#fff' : C.text, align: 'center' })
}

// ------------------------------------------------------------------ screens

function overview(g: G) {
  header(g, 'FIELD OVERVIEW')
  const plats = [
    { id: 'WHP-A', role: 'Wellhead', oil: '12 480', gas: '18.2', wat: '3 120', f: 0.62 },
    { id: 'CPF', role: 'Process & export', oil: '38 950', gas: '61.4', wat: '9 860', f: 0.78 },
    { id: 'WI', role: 'Water injection', oil: '-', gas: '-', wat: '40 100', f: 0.71 },
  ]
  plats.forEach((p, i) => {
    const x = 16 + i * 336
    box(g, x, 58, 324, 250, `${p.id} · ${p.role}`)
    const rows: [string, string, string][] = [['Oil', p.oil, 'bbl/d'], ['Gas', p.gas, 'MMscfd'], ['Water', p.wat, 'bbl/d']]
    rows.forEach(([l, v, u], j) => {
      text(g, l, x + 14, 104 + j * 46, { font: sans(16, true), color: C.dim })
      valueBox(g, x + 92, 88 + j * 46, 218, 32, v, u)
    })
    text(g, 'Capacity', x + 14, 256, { font: sans(14, true), color: C.dim })
    hbar(g, x + 92, 248, 218, 16, p.f, [0.9])
    text(g, 'NORMAL', x + 310, 288, { font: sans(14, true), color: C.dim, align: 'right' })
  })
  // export summary and link diagram
  box(g, 16, 322, 660, 236, 'EXPORT')
  const cy = 420
  for (const [x, l] of [[60, 'WHP-A'], [260, 'CPF'], [460, 'RISER']] as const) {
    rect(g, x, cy - 26, 120, 52, C.well, C.text, 2)
    text(g, l, x + 60, cy, { font: sans(17, true), align: 'center' })
  }
  line(g, [[180, cy], [260, cy]], C.line, 4)
  arrow(g, 258, cy, 1, 0)
  line(g, [[380, cy], [460, cy]], C.line, 4)
  arrow(g, 458, cy, 1, 0)
  line(g, [[580, cy], [650, cy]], C.line, 4)
  arrow(g, 650, cy, 1, 0)
  text(g, 'Oil export', 40, 492, { font: sans(15, true), color: C.dim })
  valueBox(g, 140, 478, 200, 30, '49 830', 'bbl/d')
  text(g, 'Gas export', 360, 492, { font: sans(15, true), color: C.dim })
  valueBox(g, 460, 478, 200, 30, '48.6', 'MMscfd')
  text(g, 'Flare', 40, 532, { font: sans(15, true), color: C.dim })
  valueBox(g, 140, 518, 200, 30, '2.1', 'MMscfd')
  box(g, 690, 322, 318, 236, 'STATUS')
  const st: [string, string, string | undefined][] = [
    ['Shutdown level', 'NONE', undefined],
    ['Fire & gas', 'HEALTHY', undefined],
    ['Main power', '2 × 25 MW', undefined],
    ['Instrument air', '8.6 barg', undefined],
    ['Active alarms', '7', C.p2],
  ]
  st.forEach(([l, v, a], j) => {
    text(g, l, 704, 356 + j * 36, { font: sans(15, true), color: C.dim })
    text(g, v, 994, 356 + j * 36, { font: mono(17), color: a ?? C.value, align: 'right' })
  })
  footer(g)
}

function mimic(g: G) {
  header(g, 'PROCESS MIMIC: INLET & SEPARATION')
  // inlet manifold
  const y = 230
  rect(g, 30, y - 70, 70, 140, C.panel, C.text, 2.5)
  text(g, 'M-100', 65, y + 88, { font: sans(13, true), color: C.dim, align: 'center' })
  for (let i = 0; i < 4; i++) line(g, [[0, y - 52 + i * 34], [30, y - 52 + i * 34]], C.line, 3)
  line(g, [[100, y], [190, y]], C.line, 4)
  valve(g, 140, y, true, 'ESDV-101')
  // HP separator
  capsule(g, 190, y - 55, 300, 110, 0.48)
  text(g, 'V-110 HP SEPARATOR', 340, y - 78, { font: sans(15, true), align: 'center' })
  valueBox(g, 230, y - 30, 120, 30, '35.2', 'barg')
  valueBox(g, 360, y - 30, 110, 30, '52', '%')
  // gas off top
  line(g, [[440, y - 55], [440, 100], [640, 100]], C.line, 4)
  valve(g, 520, 100, true, 'PCV-111')
  rect(g, 640, 66, 60, 120, C.panel, C.text, 2.5)
  text(g, 'V-210', 670, 198, { font: sans(13, true), color: C.dim, align: 'center' })
  line(g, [[700, 100], [770, 100]], C.line, 4)
  g.beginPath()
  g.moveTo(770, 76)
  g.lineTo(850, 88)
  g.lineTo(850, 112)
  g.lineTo(770, 124)
  g.closePath()
  g.fillStyle = '#4f565c'
  g.fill()
  g.strokeStyle = C.text
  g.lineWidth = 2
  g.stroke()
  text(g, 'K-220 RUN', 810, 140, { font: sans(13, true), color: C.dim, align: 'center' })
  line(g, [[850, 100], [1010, 100]], C.line, 4)
  arrow(g, 1010, 100, 1, 0)
  text(g, 'GAS EXPORT', 1004, 76, { font: sans(13, true), color: C.dim, align: 'right' })
  valueBox(g, 880, 118, 120, 28, '138.5', 'barg')
  // oil to LP separator, pumps
  line(g, [[420, y + 55], [420, 360], [520, 360]], C.line, 4)
  valve(g, 470, 360, true, 'LV-111')
  capsule(g, 520, 320, 200, 80, 0.55)
  text(g, 'V-130 LP SEPARATOR', 620, 420, { font: sans(14, true), align: 'center' })
  line(g, [[720, 360], [800, 360], [800, 440]], C.line, 4)
  line(g, [[800, 440], [780, 440], [780, 470]], C.line, 3)
  line(g, [[800, 440], [880, 440], [880, 470]], C.line, 3)
  pumpSym(g, 780, 490, 20, true, 'P-150A')
  pumpSym(g, 880, 490, 20, false, 'P-150B')
  line(g, [[900, 470], [960, 470], [960, 360], [1010, 360]], C.line, 4)
  arrow(g, 1010, 360, 1, 0)
  text(g, 'OIL EXPORT', 1004, 336, { font: sans(13, true), color: C.dim, align: 'right' })
  // water from the boot
  line(g, [[250, y + 55], [250, 470], [400, 470]], C.line, 3)
  valve(g, 320, 470, true, 'LV-112')
  text(g, 'PRODUCED WATER', 404, 470, { font: sans(13, true), color: C.dim })
  valueBox(g, 60, 500, 130, 30, '790', 'mm')
  text(g, 'Interface', 66, 486, { font: sans(13, true), color: C.dim })
  valueBox(g, 540, 500, 140, 30, '9 860', 'bbl/d', C.p3)
  footer(g)
}

const PENS = [
  [
    { l: 'Oil export', u: 'bbl/d', c: '#1d4f9a', v: '49 830', base: 0.72, amp: 0.05 },
    { l: 'Gas export', u: 'MMscfd', c: '#24704a', v: '48.6', base: 0.55, amp: 0.06 },
    { l: 'Flare', u: 'MMscfd', c: '#7a4310', v: '2.1', base: 0.1, amp: 0.04 },
  ],
  [
    { l: 'HP sep level', u: '%', c: '#1d4f9a', v: '52', base: 0.52, amp: 0.08 },
    { l: 'HP sep press', u: 'barg', c: '#5e2a8c', v: '35.2', base: 0.6, amp: 0.03 },
    { l: 'Inst air', u: 'barg', c: '#0f6359', v: '8.6', base: 0.84, amp: 0.02 },
  ],
]
function trend(g: G) {
  header(g, 'TRENDS: EXPORT, FLARE, HP SEPARATOR')
  const r = rng(11)
  PENS.forEach((pens, i) => {
    const x = 70
    const y0 = 60 + i * 250
    const w = 710
    const h = 200
    rect(g, x, y0, w, h, C.well, C.lineLight, 1.5)
    g.strokeStyle = 'rgba(80,86,92,0.25)'
    g.lineWidth = 1
    for (let k = 1; k < 4; k++) line(g, [[x, y0 + (h * k) / 4], [x + w, y0 + (h * k) / 4]], 'rgba(80,86,92,0.25)', 1)
    for (let k = 1; k < 6; k++) line(g, [[x + (w * k) / 6, y0], [x + (w * k) / 6, y0 + h]], 'rgba(80,86,92,0.25)', 1)
    for (let k = 0; k <= 4; k++) text(g, String(100 - k * 25), x - 8, y0 + (h * k) / 4, { font: mono(12, false), color: C.dim, align: 'right' })
    if (i === 1) for (let k = 0; k <= 6; k++) text(g, `${String(13 + Math.floor((k * 10 + 32) / 60)).padStart(2, '0')}:${String((k * 10 + 32) % 60).padStart(2, '0')}`, x + (w * k) / 6, y0 + h + 14, { font: mono(13, false), color: C.dim, align: 'center' })
    for (const p of pens) {
      let v = p.base
      g.strokeStyle = p.c
      g.lineWidth = 2.5
      g.beginPath()
      for (let s = 0; s <= 120; s++) {
        v += (r() - 0.5) * p.amp * 0.5 + (p.base - v) * 0.08
        if (i === 0 && p.l === 'Flare' && s > 70 && s < 82) v += 0.04
        const px = x + (s / 120) * w
        const py = y0 + h - Math.max(0.02, Math.min(0.98, v)) * h
        if (s) g.lineTo(px, py)
        else g.moveTo(px, py)
      }
      g.stroke()
    }
    rect(g, 796, y0, 216, h, C.panel, C.lineLight, 1.5)
    pens.forEach((p, j) => {
      const yy = y0 + 12 + j * ((h - 16) / pens.length)
      rect(g, 806, yy + 6, 22, 6, p.c)
      text(g, p.l, 836, yy + 9, { font: sans(15, true) })
      text(g, p.v, 1012 - 70, yy + 36, { font: mono(22), color: C.value, align: 'right' })
      text(g, p.u, 1012 - 64, yy + 36, { font: sans(13), color: C.dim })
    })
  })
  footer(g)
}

const ALARMS: [number, string, string, string, string, string][] = [
  [1, '14:31:52', 'PAHH-110', 'HP separator pressure high-high', '40.3 barg', 'UNACK'],
  [2, '14:31:40', 'LAH-110', 'HP separator level high', '72 %', 'UNACK'],
  [2, '14:29:13', 'TAH-630', 'Cooling medium supply temp high', '45.6 °C', 'ACK'],
  [3, '14:27:02', 'PDAH-210', 'Suction scrubber dP high', '252 mbar', 'ACK'],
  [3, '14:22:48', 'XA-150B', 'Export pump B standby not ready', '', 'ACK'],
  [2, '14:18:31', 'GD-A-12', 'Gas detector 20 % LEL', '21 %LEL', 'RTN UNACK'],
  [3, '14:11:05', 'AAH-530', 'Export gas dew point high', '-9.4 °C', 'ACK'],
  [3, '14:02:44', 'LAL-240', 'Flare KO drum level low', '310 mm', 'ACK'],
  [1, '13:58:20', 'XA-FG-03', 'F&G node 3 comms fault', '', 'ACK'],
  [3, '13:51:17', 'PAL-460', 'Instrument air header low', '6.4 barg', 'RTN'],
  [3, '13:44:59', 'FAL-W40', 'Injection flow low', '14 800 bwpd', 'ACK'],
  [2, '13:40:36', 'ZSC-101', 'ESDV-101 travel time exceeded', '', 'ACK'],
]
function alarm(g: G) {
  header(g, 'ALARM SUMMARY', 'amber')
  ;[1, 2, 3].forEach((p, i) => {
    const x = 12 + i * 170
    const n = ALARMS.filter((a) => a[0] === p).length
    rect(g, x, 54, 160, 56, C.panel, [C.p1, C.p2, C.p3][i], 3)
    priTile(g, x + 10, 64, p)
    text(g, String(n), x + 96, 74, { font: mono(26), color: C.value, align: 'right' })
    text(g, ['CRITICAL', 'HIGH', 'LOW'][i], x + 102, 74, { font: sans(11, true), color: C.dim })
  })
  rect(g, 522, 54, 150, 56, C.panel, C.lineLight, 1.5)
  text(g, 'SHELVED', 534, 70, { font: sans(13, true), color: C.dim })
  text(g, '1', 660, 90, { font: mono(24), color: C.value, align: 'right' })
  rect(g, 684, 54, 328, 56, C.panel, C.lineLight, 1.5)
  text(g, 'ALARM RATE (10 min)', 696, 70, { font: sans(13, true), color: C.dim })
  text(g, '6', 860, 90, { font: mono(26), color: C.value, align: 'right' })
  text(g, 'target < 10', 1000, 90, { font: sans(14, true), color: C.dim, align: 'right' })
  const cols = { pri: 14, time: 56, tag: 170, text: 310, value: 760, state: 1008 }
  rect(g, 0, 120, W, 28, C.panelDark)
  for (const [k, x] of Object.entries(cols)) text(g, k.toUpperCase(), x, 134, { font: sans(13, true), color: C.dim, align: k === 'state' ? 'right' : 'left' })
  ALARMS.forEach(([p, t, tag, msg, val, st], i) => {
    const y = 152 + i * 32
    rect(g, 0, y, W, 30, i % 2 ? C.bg : '#bcc0c3')
    priTile(g, cols.pri, y + 4, p)
    const col = st === 'RTN' ? C.dim : C.text
    text(g, t, cols.time, y + 15, { font: mono(16, false), color: col })
    text(g, tag, cols.tag, y + 15, { font: sans(16, true), color: col, max: 134 })
    text(g, msg, cols.text, y + 15, { font: sans(16), color: col, max: 440 })
    if (val) text(g, val, cols.value, y + 15, { font: mono(15, false), color: C.value, max: 130 })
    text(g, st, cols.state, y + 15, { font: sans(14, true), color: st.includes('UNACK') ? C.text : C.dim, align: 'right' })
  })
  footer(g)
}

function fg(g: G) {
  header(g, 'FIRE & GAS: ZONE MAP, MAIN DECK')
  const x0 = 24
  const y0 = 60
  const w = 690
  const h = 470
  rect(g, x0, y0, w, h, C.well, C.text, 3)
  const zones: [string, number, number, number, number, number][] = [
    ['P-SEP', 0, 0, 0.36, 0.5, 0],
    ['P-COMP', 0.36, 0, 0.34, 0.5, 2],
    ['P-EXP', 0.7, 0, 0.3, 0.5, 0],
    ['P-PW', 0, 0.5, 0.3, 0.5, 0],
    ['P-UTIL', 0.3, 0.5, 0.4, 0.5, 0],
    ['P-PWR', 0.7, 0.5, 0.3, 0.5, 1],
  ]
  const r = rng(5)
  for (const [id, zx, zy, zw, zh, sev] of zones) {
    const x = x0 + 6 + zx * (w - 12)
    const y = y0 + 6 + zy * (h - 12)
    const ww = zw * (w - 12)
    const hh = zh * (h - 12)
    rect(g, x + 3, y + 3, ww - 6, hh - 6, [C.panel, C.p3, C.p2, C.p1][sev], C.line, 2)
    text(g, id, x + 14, y + 22, { font: sans(18, true) })
    text(g, ['HEALTHY', 'FAULT', '1ooN GAS 20 %LEL', 'FIRE'][sev], x + 14, y + 44, { font: sans(13, true), color: C.dim })
    // detectors: point gas (circle), flame (triangle), MAC (square)
    for (let i = 0; i < 6; i++) {
      const dx = x + 24 + r() * (ww - 48)
      const dy = y + 64 + r() * (hh - 88)
      const t = i % 3
      const alm = sev === 2 && i === 1
      g.fillStyle = alm ? C.p2 : C.white
      g.strokeStyle = C.text
      g.lineWidth = 2
      g.beginPath()
      if (t === 0) g.arc(dx, dy, 8, 0, Math.PI * 2)
      else if (t === 1) {
        g.moveTo(dx, dy - 9)
        g.lineTo(dx + 9, dy + 7)
        g.lineTo(dx - 9, dy + 7)
        g.closePath()
      } else g.rect(dx - 7, dy - 7, 14, 14)
      g.fill()
      g.stroke()
    }
  }
  // open-path beam across the compressor zone
  line(g, [[x0 + 0.38 * w, y0 + 0.4 * h], [x0 + 0.68 * w, y0 + 0.4 * h]], C.info, 2)
  box(g, 730, 60, 282, 210, 'LEGEND')
  const leg: [string, number][] = [['Point gas detector', 0], ['IR3 flame detector', 1], ['Manual call point', 2]]
  leg.forEach(([l, t], i) => {
    const dx = 754
    const dy = 104 + i * 34
    g.fillStyle = C.white
    g.beginPath()
    if (t === 0) g.arc(dx, dy, 8, 0, Math.PI * 2)
    else if (t === 1) {
      g.moveTo(dx, dy - 9)
      g.lineTo(dx + 9, dy + 7)
      g.lineTo(dx - 9, dy + 7)
      g.closePath()
    } else g.rect(dx - 7, dy - 7, 14, 14)
    g.fill()
    g.strokeStyle = C.text
    g.stroke()
    text(g, l, 774, dy, { font: sans(15) })
  })
  line(g, [[744, 206], [766, 206]], C.info, 3)
  text(g, 'Open-path gas beam', 774, 206, { font: sans(15) })
  text(g, 'Voting: 2ooN confirmed', 744, 244, { font: sans(14, true), color: C.dim })
  box(g, 730, 284, 282, 246, 'ZONE STATUS')
  const st: [string, string, string][] = [['P-COMP', 'GAS 1ooN', C.p2], ['P-PWR', 'DETECTOR FAULT', C.p3], ['Deluge', 'READY', C.dim], ['Fire pumps', 'AUTO', C.dim], ['GA / PA', 'NORMAL', C.dim]]
  st.forEach(([z, s, c], i) => {
    text(g, z, 744, 322 + i * 38, { font: sans(16, true) })
    text(g, s, 1000, 322 + i * 38, { font: sans(15, true), color: c, align: 'right' })
  })
  footer(g)
}

function esd(g: G) {
  header(g, 'SHUTDOWN / ESD STATUS')
  const lv = ['APS', 'ESD1', 'ESD2', 'PSD', 'USD']
  const lbl = ['Abandon platform', 'Emergency SD 1', 'Emergency SD 2', 'Process SD', 'Unit SD']
  lv.forEach((l, i) => {
    const x = 12 + i * 122
    const act = l === 'USD'
    rect(g, x, 54, 114, 62, act ? C.p2 : C.panel, act ? C.p2 : C.lineLight, act ? 3 : 1.5)
    text(g, l, x + 57, 76, { font: sans(22, true), align: 'center' })
    text(g, lbl[i], x + 57, 102, { font: sans(11), color: C.dim, align: 'center', max: 106 })
  })
  box(g, 636, 54, 376, 62)
  text(g, 'Process', 650, 74, { font: sans(15, true) })
  text(g, 'NORMAL', 1000, 74, { font: sans(15, true), color: C.dim, align: 'right' })
  text(g, 'General alarm', 650, 98, { font: sans(15, true) })
  text(g, 'OFF', 1000, 98, { font: sans(15, true), color: C.dim, align: 'right' })
  box(g, 12, 128, 690, 430, 'LATCHED SHUTDOWNS')
  const rows: [string, string, string, string, string][] = [
    ['USD', 'K-220 compressor', 'Anti-surge: surge margin < 10 %', '14:20:41', 'READY TO RESET'],
    ['PSD', 'Process', 'Instrument air low-low (test)', '09:12:03', 'RESET'],
    ['USD', 'P-150B', 'Seal pot level low', '06:45:18', 'RESET'],
  ]
  rows.forEach(([lvl, unit, cause, t, st], i) => {
    const y = 152 + i * 52
    const reset = st === 'RESET'
    rect(g, 20, y, 674, 46, i % 2 ? C.bg : '#bcc0c3')
    rect(g, 24, y + 6, 70, 34, reset ? C.white : C.p2, C.text, 1.5)
    text(g, lvl, 59, y + 23, { font: sans(17, true), align: 'center' })
    text(g, unit, 104, y + 14, { font: sans(14, true), color: C.dim })
    text(g, cause, 104, y + 33, { font: sans(15), max: 420 })
    text(g, t, 600, y + 14, { font: mono(14, false), color: C.dim, align: 'right' })
    text(g, st, 686, y + 33, { font: sans(14, true), color: reset ? C.dim : C.text, align: 'right' })
  })
  box(g, 714, 128, 298, 430, 'ESD / BLOWDOWN VALVES')
  const vs: [string, boolean, boolean][] = [['ESDV-101', true, false], ['ESDV-201', true, false], ['ESDV-230', true, false], ['ESDV-160', true, false], ['ESDV-530', true, false], ['BDV-220', false, false], ['ESDV-R101', true, false], ['ESDV-R201', true, false], ['XV-111', false, true]]
  vs.forEach(([t, open, abn], i) => {
    const y = 172 + i * 42
    valve(g, 744, y, open, undefined, abn)
    text(g, t, 772, y, { font: sans(15, true) })
    text(g, open ? 'OPEN' : 'CLOSED', 1000, y, { font: sans(14, true), color: abn ? C.p1 : C.dim, align: 'right' })
  })
  footer(g)
}

/** Generic CCTV scene: sky, steelwork, piping and deck, a different arrangement per seed. */
function camScene(g: G, x: number, y: number, w: number, h: number, seed: number, night = false) {
  const r = rng(seed)
  const sky = g.createLinearGradient(x, y, x, y + h)
  sky.addColorStop(0, night ? '#20262c' : '#9fb3c2')
  sky.addColorStop(0.55, night ? '#2e353b' : '#c7d0d6')
  sky.addColorStop(1, night ? '#15181b' : '#6c757c')
  g.fillStyle = sky
  g.fillRect(x, y, w, h)
  const horizon = y + h * (0.42 + r() * 0.12)
  g.fillStyle = night ? '#1b2a33' : '#5d7684'
  g.fillRect(x, horizon, w, h * 0.12)
  // structures
  for (let i = 0; i < 9; i++) {
    const bx = x + r() * w * 0.9
    const bw = w * (0.05 + r() * 0.16)
    const bh = h * (0.15 + r() * 0.45)
    g.fillStyle = r() < 0.5 ? (night ? '#3a4249' : '#8d969c') : night ? '#2d3439' : '#a4abb0'
    g.fillRect(bx, y + h * 0.78 - bh, bw, bh)
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.fillRect(bx + bw * 0.75, y + h * 0.78 - bh, bw * 0.25, bh)
  }
  // a horizontal vessel or two and some pipe runs
  g.fillStyle = night ? '#6d7277' : '#c9ccc8'
  g.beginPath()
  g.roundRect(x + w * (0.2 + r() * 0.3), y + h * 0.55, w * 0.32, h * 0.14, h * 0.07)
  g.fill()
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = ['#b7a24a', '#8a9399', '#a33a2c'][i]
    g.lineWidth = Math.max(2, h * 0.018)
    const py = y + h * (0.3 + r() * 0.35)
    g.beginPath()
    g.moveTo(x, py)
    g.lineTo(x + w * (0.4 + r() * 0.6), py + (r() - 0.5) * h * 0.05)
    g.stroke()
  }
  // deck with a yellow walkway line
  g.fillStyle = night ? '#24292d' : '#555c61'
  g.fillRect(x, y + h * 0.78, w, h * 0.22)
  g.fillStyle = '#d4a514'
  g.fillRect(x, y + h * 0.88, w, Math.max(2, h * 0.012))
  if (night) {
    for (let i = 0; i < 6; i++) {
      const lx = x + r() * w
      const ly = y + h * (0.3 + r() * 0.4)
      const grd = g.createRadialGradient(lx, ly, 0, lx, ly, h * 0.08)
      grd.addColorStop(0, 'rgba(255,230,170,0.9)')
      grd.addColorStop(1, 'rgba(255,230,170,0)')
      g.fillStyle = grd
      g.fillRect(lx - h * 0.08, ly - h * 0.08, h * 0.16, h * 0.16)
    }
  }
  // sensor noise
  for (let i = 0; i < (w * h) / 220; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'
    g.fillRect(x + r() * w, y + r() * h, 2, 2)
  }
}
const CAMS = ['WELLBAY', 'HP SEPARATOR', 'COMPRESSOR', 'EXPORT PUMPS', 'FLARE BOOM', 'LIFEBOATS', 'NORTH BRIDGE', 'CRANE PEDESTAL']
function cctv(g: G) {
  g.fillStyle = '#0e1012'
  g.fillRect(0, 0, W, H)
  for (let q = 0; q < 4; q++) {
    const x = (q % 2) * (W / 2)
    const y = Math.floor(q / 2) * (H / 2)
    camScene(g, x + 3, y + 3, W / 2 - 6, H / 2 - 6, 17 + q * 7, q === 3)
    rect(g, x + 8, y + 10, 270, 26, 'rgba(10,12,14,0.55)')
    text(g, `CAM ${String(q + 1).padStart(2, '0')}  ${CAMS[q]}`, x + 16, y + 23, { font: mono(16), color: '#e6eaee', max: 256 })
    text(g, '2026-10-29 14:32:07', x + W / 2 - 14, y + H / 2 - 18, { font: mono(15), color: '#e6eaee', align: 'right' })
    g.fillStyle = '#d42a1f'
    g.beginPath()
    g.arc(x + W / 2 - 24, y + 24, 6, 0, Math.PI * 2)
    g.fill()
  }
  footer(g, true)
}

function helideck(g: G) {
  // single wide CCTV feed of a helideck: green perimeter, H in a yellow circle, TD/PM circle
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#93a9ba')
  sky.addColorStop(0.4, '#c3cdd4')
  sky.addColorStop(0.42, '#5b7483')
  sky.addColorStop(1, '#34495a')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  g.save()
  g.translate(W / 2, H * 0.68)
  g.scale(1, 0.38)
  g.fillStyle = '#2f3b33'
  g.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    g.lineTo(Math.cos(a) * 440, Math.sin(a) * 440)
  }
  g.closePath()
  g.fill()
  g.strokeStyle = '#f2f2ef'
  g.lineWidth = 14
  g.stroke()
  g.strokeStyle = '#e8c21a'
  g.lineWidth = 26
  g.beginPath()
  g.arc(0, 0, 230, 0, Math.PI * 2)
  g.stroke()
  g.restore()
  g.save()
  g.translate(W / 2, H * 0.68)
  g.scale(1, 0.38)
  g.fillStyle = '#f2f2ef'
  g.fillRect(-70, -110, 34, 220)
  g.fillRect(36, -110, 34, 220)
  g.fillRect(-36, -17, 72, 34)
  g.restore()
  // safety net edge and lights
  g.fillStyle = '#1e2a22'
  g.fillRect(0, H * 0.86, W, H * 0.14)
  for (let i = 0; i < 12; i++) {
    g.fillStyle = '#7fd36a'
    g.beginPath()
    g.arc(60 + i * 82, H * 0.86, 4, 0, Math.PI * 2)
    g.fill()
  }
  rect(g, 8, 10, 360, 26, 'rgba(10,12,14,0.55)')
  text(g, 'CAM 09  HELIDECK', 16, 23, { font: mono(16), color: '#e6eaee' })
  text(g, '2026-10-29 14:32:07', W - 14, 23, { font: mono(15), color: '#e6eaee', align: 'right' })
  rect(g, 8, 44, 250, 70, 'rgba(10,12,14,0.55)')
  text(g, 'WIND 315° 18 kn', 16, 62, { font: mono(15), color: '#e6eaee' })
  text(g, 'PITCH 0.4° ROLL 0.3°', 16, 82, { font: mono(15), color: '#e6eaee' })
  text(g, 'HEAVE 0.2 m/s', 16, 102, { font: mono(15), color: '#e6eaee' })
  footer(g, true)
}

function weather(g: G) {
  header(g, 'METOCEAN & HELIDECK MONITORING')
  // wind rose
  box(g, 16, 58, 380, 470, 'WIND')
  const cx = 206
  const cy = 300
  for (const rr of [60, 120, 170]) {
    g.beginPath()
    g.arc(cx, cy, rr, 0, Math.PI * 2)
    g.strokeStyle = C.lineLight
    g.lineWidth = 1.5
    g.stroke()
  }
  ;['N', 'E', 'S', 'W'].forEach((d, i) => {
    const a = (i * Math.PI) / 2 - Math.PI / 2
    text(g, d, cx + Math.cos(a) * 186, cy + Math.sin(a) * 186, { font: sans(18, true), align: 'center' })
  })
  const a = (315 * Math.PI) / 180 - Math.PI / 2
  g.save()
  g.translate(cx, cy)
  g.rotate(a + Math.PI)
  g.fillStyle = C.value
  g.beginPath()
  g.moveTo(170, 0)
  g.lineTo(-20, -16)
  g.lineTo(0, 0)
  g.lineTo(-20, 16)
  g.closePath()
  g.fill()
  g.restore()
  valueBox(g, 60, 490, 140, 30, '315', '°')
  valueBox(g, 214, 490, 160, 30, '18.4', 'kn')
  // met values
  box(g, 410, 58, 600, 300, 'METEOROLOGICAL')
  const met: [string, string, string][] = [
    ['Air temperature', '24.1', '°C'],
    ['Relative humidity', '71', '%'],
    ['Barometric pressure', '1012.6', 'hPa'],
    ['Visibility', '9.8', 'km'],
    ['Cloud base', '2 400', 'ft'],
    ['Wind gust (10 min)', '23.0', 'kn'],
  ]
  met.forEach(([l, v, u], i) => {
    text(g, l, 426, 100 + i * 42, { font: sans(16, true), color: C.dim })
    valueBox(g, 760, 86 + i * 42, 230, 30, v, u)
  })
  box(g, 410, 372, 600, 156, 'SEA STATE · HELIDECK MOTION')
  const sea: [string, string, string][] = [['Hs', '1.6', 'm'], ['Tp', '7.8', 's'], ['Pitch / roll', '0.4 / 0.3', '°'], ['Heave rate', '0.2', 'm/s']]
  sea.forEach(([l, v, u], i) => {
    const x = 426 + (i % 2) * 296
    const y = 414 + Math.floor(i / 2) * 46
    text(g, l, x, y + 14, { font: sans(16, true), color: C.dim })
    valueBox(g, x + 120, y, 156, 30, v, u)
  })
  rect(g, 426, 500, 140, 22, '#3b8b4a')
  text(g, 'HELIDECK GREEN', 496, 511, { font: sans(13, true), color: '#fff', align: 'center' })
  footer(g)
}

function kpi(g: G) {
  header(g, 'PRODUCTION KPIs: LAST 24 h')
  const r = rng(3)
  const tiles: [string, string, string, number][] = [
    ['Oil', '49 830', 'bbl/d', 0.93],
    ['Gas', '48.6', 'MMscfd', 0.86],
    ['Water inj.', '40 100', 'bwpd', 0.95],
    ['Uptime', '98.7', '%', 0.987],
  ]
  tiles.forEach(([l, v, u, f], i) => {
    const x = 16 + i * 252
    box(g, x, 58, 240, 150, l.toUpperCase())
    text(g, v, x + 226, 112, { font: mono(40), color: C.value, align: 'right' })
    text(g, u, x + 226, 146, { font: sans(15), color: C.dim, align: 'right' })
    hbar(g, x + 14, 176, 212, 14, f, [0.9])
  })
  box(g, 16, 222, 992, 300, 'HOURLY OIL RATE vs PLAN')
  const n = 24
  for (let i = 0; i < n; i++) {
    const f = 0.7 + r() * 0.22 - (i > 9 && i < 12 ? 0.3 : 0)
    const x = 60 + i * 39
    const h = 220 * f
    rect(g, x, 500 - h, 28, h, i > 9 && i < 12 ? C.p2 : '#6d747a')
    if (i % 3 === 0) text(g, `${String(i).padStart(2, '0')}:00`, x + 14, 512, { font: mono(11, false), color: C.dim, align: 'center' })
  }
  line(g, [[50, 500 - 220 * 0.85], [1000, 500 - 220 * 0.85]], C.info, 2)
  text(g, 'PLAN', 994, 500 - 220 * 0.85 - 12, { font: sans(13, true), color: C.info, align: 'right' })
  footer(g)
}

function off(g: G) {
  g.fillStyle = '#07090b'
  g.fillRect(0, 0, W, H)
}

const DRAW: Record<ScreenKind, (g: G) => void> = { overview, mimic, trend, alarm, fg, esd, cctv, weather, helideck, kpi, off }

const texCache = new Map<ScreenKind, THREE.CanvasTexture>()
const matCache = new Map<ScreenKind, THREE.MeshBasicMaterial>()

/** Cached 1024 × 576 procedural screen texture. */
export function screenTexture(kind: ScreenKind): THREE.CanvasTexture {
  let t = texCache.get(kind)
  if (t) return t
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  ;(DRAW[kind] ?? overview)(c.getContext('2d')!)
  t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  texCache.set(kind, t)
  return t
}

/** Self-lit screen material for a procedural kind. */
export function screenMaterial(kind: ScreenKind): THREE.MeshBasicMaterial {
  let m = matCache.get(kind)
  if (!m) matCache.set(kind, (m = new THREE.MeshBasicMaterial({ map: screenTexture(kind), color: '#e8e8e8' })))
  return m
}

const liveCache = new WeakMap<THREE.Texture, THREE.MeshBasicMaterial>()
export function liveMaterial(t: THREE.Texture) {
  let m = liveCache.get(t)
  if (!m) {
    // canvas / video feeds arrive untagged; tag once so they are not washed out
    const anyT = t as THREE.Texture & { isCanvasTexture?: boolean; isVideoTexture?: boolean }
    if (t.colorSpace === THREE.NoColorSpace && (anyT.isCanvasTexture || anyT.isVideoTexture)) {
      t.colorSpace = THREE.SRGBColorSpace
      t.needsUpdate = true
    }
    liveCache.set(t, (m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false })))
  }
  return m
}

/** Renders each placement as its own plane so live textures swap without rebuilding geometry. */
export function ScreenPanels({ placements, screens }: { placements: ScreenPlacement[]; screens?: (THREE.Texture | null | undefined)[] }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useEffect(() => () => geo.dispose(), [geo])
  return (
    <>
      {placements.map((p, i) => {
        const live = screens?.[i]
        return (
          <mesh key={i} geometry={geo} material={live ? liveMaterial(live) : screenMaterial(p.kind)} position={p.pos} rotation={p.rot ?? [0, 0, 0]} scale={[p.w, p.h, 1]} />
        )
      })}
    </>
  )
}
