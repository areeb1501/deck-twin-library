/**
 * ISA-101 high-performance HMI drawing kit for the control-room screens: a grey palette where
 * colour is reserved for abnormal states, the screen header (site, title, live sim clock), value
 * boxes, bar gauges and the P&ID-style symbols (valves, machines, vessels).
 *
 * All drawing is in canvas pixels of a 1024 × 576 panel (W × H).
 */
export type G = CanvasRenderingContext2D

export const W = 1024
export const H = 576
export const HEAD = 44

/** ISA-101 palette: greys for normal, saturated colours only for alarms / abnormal states */
export const C = {
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
  // abnormal
  p1: '#d42a1f',
  p2: '#ee8a00',
  p3: '#efd000',
  diag: '#a3369a',
  info: '#2f66b8',
  deluge: '#2c63c6',
} as const

/** monospace and sans fonts, sized in px */
export const mono = (px: number, bold = true) => `${bold ? 'bold ' : ''}${px}px "DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace`
export const sans = (px: number, bold = false) => `${bold ? 'bold ' : ''}${px}px "Helvetica Neue", Arial, sans-serif`

export function text(g: G, s: string, x: number, y: number, o: { font?: string; color?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline; max?: number } = {}) {
  g.font = o.font ?? sans(18)
  g.fillStyle = o.color ?? C.text
  g.textAlign = o.align ?? 'left'
  g.textBaseline = o.base ?? 'middle'
  if (o.max) g.fillText(s, x, y, o.max)
  else g.fillText(s, x, y)
}

export function rect(g: G, x: number, y: number, w: number, h: number, fill?: string, stroke?: string, lw = 2) {
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

export function polyline(g: G, pts: [number, number][], color: string = C.line, lw = 3, dash?: number[]) {
  g.strokeStyle = color
  g.lineWidth = lw
  g.setLineDash(dash ?? [])
  g.beginPath()
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.stroke()
  g.setLineDash([])
}

/** flow arrow head at (x, y) pointing along (dx, dy) */
export function arrow(g: G, x: number, y: number, dx: number, dy: number, color: string = C.line, s = 9) {
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

export interface HeaderOpts {
  site: string
  title: string
  clock: string
  /** flashing header: red (shutdown / fire) or amber (PSD / gas) */
  alert?: 'red' | 'amber' | null
  blink: boolean
  /** small status note (e.g. "SIM DATA PENDING") */
  note?: string
  /** clock running? (false = paused) */
  running?: boolean
}

export function header(g: G, o: HeaderOpts) {
  const flash = o.alert && o.blink
  const bg = flash ? (o.alert === 'red' ? C.p1 : C.p2) : o.alert ? '#7d8389' : C.header
  const fg = flash && o.alert === 'red' ? '#ffffff' : C.text
  rect(g, 0, 0, W, HEAD, bg)
  rect(g, 0, HEAD - 2, W, 2, C.line)
  text(g, o.site, 14, HEAD / 2, { font: sans(19, true), color: fg })
  const sw = g.measureText(o.site).width
  rect(g, 26 + sw, 10, 2, HEAD - 20, fg)
  text(g, o.title, 38 + sw, HEAD / 2, { font: sans(19), color: fg, max: W - 300 - sw })
  // clock (sim time) with a run / pause marker
  text(g, o.clock, W - 14, HEAD / 2, { font: mono(21), color: fg, align: 'right' })
  const cw = g.measureText(o.clock).width
  const x = W - 30 - cw
  g.fillStyle = fg
  if (o.running === false) {
    g.fillRect(x - 12, 14, 4, 16)
    g.fillRect(x - 5, 14, 4, 16)
  } else {
    g.beginPath()
    g.moveTo(x - 12, 14)
    g.lineTo(x, 22)
    g.lineTo(x - 12, 30)
    g.closePath()
    g.fill()
  }
  if (o.note) text(g, o.note, x - 24, HEAD / 2, { font: sans(13, true), color: flash ? fg : C.diag, align: 'right' })
}

/** framed group box with a caption */
export function box(g: G, x: number, y: number, w: number, h: number, caption?: string) {
  rect(g, x, y, w, h, C.panel, C.lineLight, 1.5)
  if (caption) text(g, caption, x + 10, y + 14, { font: sans(14, true), color: C.dim })
}

/** live value in a recessed field: dark-blue digits, coloured border when abnormal */
export function valueBox(g: G, x: number, y: number, w: number, h: number, value: string, unit = '', o: { abn?: string | null; px?: number; align?: CanvasTextAlign } = {}) {
  rect(g, x, y, w, h, C.well, o.abn ?? C.lineLight, o.abn ? 3 : 1.5)
  const px = o.px ?? Math.round(h * 0.62)
  const uw = unit ? Math.max(30, unit.length * px * 0.38 + 8) : 0
  text(g, value, x + w - uw - 8, y + h / 2 + 1, { font: mono(px), color: C.value, align: 'right' })
  if (unit) text(g, unit, x + w - uw + 2, y + h / 2 + 1, { font: sans(Math.round(px * 0.6)), color: C.dim })
  if (o.abn) {
    // ISA-101 alarm indicator tab on the left
    rect(g, x - 10, y, 10, h, o.abn)
  }
}

/** horizontal analogue bar (ISA-101: grey bar, dark pointer, design / limit ticks) */
export function hbar(g: G, x: number, y: number, w: number, h: number, frac: number | null, o: { marks?: number[]; abn?: string | null } = {}) {
  rect(g, x, y, w, h, C.well, C.lineLight, 1)
  if (frac != null && Number.isFinite(frac)) {
    const f = Math.max(0, Math.min(1, frac))
    rect(g, x + 1, y + 1, (w - 2) * f, h - 2, o.abn ?? '#6d747a')
  }
  for (const m of o.marks ?? []) {
    const mx = x + w * Math.max(0, Math.min(1, m))
    rect(g, mx - 1, y - 4, 2, h + 8, C.text)
  }
}

/** vertical level bar inside a vessel outline */
export function vbar(g: G, x: number, y: number, w: number, h: number, frac: number | null, abn?: string | null) {
  rect(g, x, y, w, h, C.well, C.line, 1.5)
  if (frac != null && Number.isFinite(frac)) {
    const f = Math.max(0, Math.min(1, frac))
    rect(g, x + 2, y + h - (h - 4) * f - 2, w - 4, (h - 4) * f, abn ?? '#5d7896')
  }
}

export type ValveVis = { pos: number | null; normallyOpen: boolean; fault?: boolean }
/**
 * Bow-tie valve symbol (ISA-101): open = filled dark grey, closed = hollow, travelling = half.
 * Out of its normal position it gets a coloured outline (red for a closed ESD / an open BDV).
 */
export function valve(g: G, x: number, y: number, v: ValveVis, o: { vertical?: boolean; tag?: string; s?: number; tagBelow?: boolean } = {}) {
  const s = o.s ?? 13
  const open = v.pos == null ? v.normallyOpen : v.pos > 0.95
  const closed = v.pos == null ? !v.normallyOpen : v.pos < 0.05
  const abnormal = v.fault ? C.diag : v.pos != null && (v.normallyOpen ? !open : !closed) ? C.p1 : null
  g.save()
  g.translate(x, y)
  if (o.vertical) g.rotate(Math.PI / 2)
  const tri = (sgn: number) => {
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(sgn * s, -s * 0.7)
    g.lineTo(sgn * s, s * 0.7)
    g.closePath()
  }
  for (const sgn of [-1, 1]) {
    tri(sgn)
    g.fillStyle = open ? C.text : closed ? C.white : sgn < 0 ? C.text : C.white
    g.fill()
    g.strokeStyle = abnormal ?? C.text
    g.lineWidth = abnormal ? 3.5 : 2
    g.stroke()
  }
  // actuator stem + head
  g.strokeStyle = C.text
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(0, -s * 1.2)
  g.stroke()
  g.fillStyle = C.panelDark
  g.fillRect(-s * 0.55, -s * 1.7, s * 1.1, s * 0.55)
  g.strokeRect(-s * 0.55, -s * 1.7, s * 1.1, s * 0.55)
  g.restore()
  if (o.tag) {
    const ty = o.tagBelow ? y + s * 1.6 : y - s * 2.4
    text(g, o.tag, x, ty, { font: sans(13, true), color: abnormal ?? C.dim, align: 'center' })
    if (abnormal && v.pos != null) text(g, open ? 'OPEN' : closed ? 'CLOSED' : `${Math.round(v.pos * 100)}%`, x, ty + (o.tagBelow ? 15 : -15), { font: sans(12, true), color: abnormal, align: 'center' })
  }
}

export type Run = 'running' | 'starting' | 'standby' | 'stopped' | 'tripped' | string
/** machine state fill (ISA-101: filled = running, hollow = stopped / standby, red outline = tripped) */
export function machineStyle(st: Run) {
  return {
    fill: st === 'running' ? '#4f565c' : st === 'starting' ? '#8b9298' : C.white,
    stroke: st === 'tripped' ? C.p1 : C.text,
    lw: st === 'tripped' ? 4 : 2,
    label: st === 'running' ? 'RUN' : st === 'starting' ? 'START' : st === 'standby' ? 'STBY' : st === 'tripped' ? 'TRIP' : 'STOP',
    labelColor: st === 'tripped' ? C.p1 : C.dim,
  }
}

/** centrifugal pump: circle + discharge nozzle */
export function pump(g: G, x: number, y: number, r: number, st: Run, tag?: string) {
  const m = machineStyle(st)
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = m.fill
  g.fill()
  g.strokeStyle = m.stroke
  g.lineWidth = m.lw
  g.stroke()
  g.beginPath()
  g.moveTo(x, y - r)
  g.lineTo(x + r, y - r)
  g.lineTo(x + r, y - r * 0.4)
  g.stroke()
  if (tag) {
    text(g, tag, x, y + r + 13, { font: sans(13, true), color: C.dim, align: 'center' })
    text(g, m.label, x, y + r + 28, { font: sans(12, true), color: m.labelColor, align: 'center' })
  }
}

/** compressor: trapezoid (wide suction end left) */
export function compressor(g: G, x: number, y: number, w: number, h: number, st: Run) {
  const m = machineStyle(st)
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(x + w, y + h * 0.25)
  g.lineTo(x + w, y + h * 0.75)
  g.lineTo(x, y + h)
  g.closePath()
  g.fillStyle = m.fill
  g.fill()
  g.strokeStyle = m.stroke
  g.lineWidth = m.lw
  g.stroke()
  return m
}

/** horizontal vessel outline (capsule) */
export function hVessel(g: G, x: number, y: number, w: number, h: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, h / 2)
  g.fillStyle = C.panel
  g.fill()
  g.strokeStyle = C.text
  g.lineWidth = 2.5
  g.stroke()
}
/** vertical vessel outline */
export function vVessel(g: G, x: number, y: number, w: number, h: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, w / 2)
  g.fillStyle = C.panel
  g.fill()
  g.strokeStyle = C.text
  g.lineWidth = 2.5
  g.stroke()
}

/** small state lamp / indicator square */
export function lamp(g: G, x: number, y: number, s: number, on: boolean, color: string = C.text) {
  rect(g, x, y, s, s, on ? color : C.white, C.text, 1.5)
}

/** number formatting with placeholders for missing data */
export const fmt = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '----' : v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }))
