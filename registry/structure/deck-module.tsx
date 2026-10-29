// Offshore deck module: HEB / plate-girder grid with IPE secondaries, deck plate with drain gutters or bar grating, coaming, ISO 14122 guard rail with gated openings, legs down and stub columns up.
import { type Kit, eul, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { paint } from '../lib/materials'
import { beamTOS, boxMM, column, finPlate, gate, gratingBay, gusset, hazardBand, railPath, sec, toePlate, webStiffeners } from './_steel'

export type DeckSide = 'minX' | 'maxX' | 'minZ' | 'maxZ'

export interface DeckOpening {
  side: DeckSide
  /** centre of the opening along that side (x for Z sides, z for X sides), m */
  at: number
  width: number
  /** self-closing gate across the opening */
  gate?: boolean
}

export interface DeckModuleProps {
  /** along X, m */
  length?: number
  /** along Z, m */
  width?: number
  floor?: 'plate' | 'grating'
  /** primary girders: EN/AISC name or welded plate girder 'PG <depth mm>' */
  primary?: string
  secondary?: string
  /** max secondary beam pitch, m */
  secondarySpacing?: number
  /** leg count (4, 6 or 8), also sets the primary grid */
  legs?: number
  /** leg centre spacing along X / Z, m */
  legSpanX?: number
  legSpanZ?: number
  /** legs below the floor (0 = none), m; leg foot at y = -legHeight */
  legHeight?: number
  legDiameter?: number
  /** floor-to-floor height of an identical module stacked above (0 = no stub columns), m */
  upperDeckAt?: number
  column?: string
  handrails?: boolean
  railMinX?: boolean
  railMaxX?: boolean
  railMinZ?: boolean
  railMaxZ?: boolean
  openings?: DeckOpening[]
  /** drain gutters with 3" outlets (plate floor) */
  drains?: boolean
  markings?: boolean
}

export const defaults = {
  length: 24,
  width: 16,
  floor: 'plate' as 'plate' | 'grating',
  primary: 'HEB 600',
  secondary: 'IPE 300',
  secondarySpacing: 1.5,
  legs: 4,
  legSpanX: 16,
  legSpanZ: 12,
  legHeight: 6,
  legDiameter: 1.5,
  upperDeckAt: 0,
  column: 'HEB 400',
  handrails: true,
  railMinX: true,
  railMaxX: true,
  railMinZ: true,
  railMaxZ: true,
  openings: [{ side: 'maxX', at: 0, width: 1.0, gate: true }] as DeckOpening[],
  drains: true,
  markings: true,
}

type P = typeof defaults

const DRAIN_NPS = 3
const GUTTER = { w: 0.2, depth: 0.15, drop: 0.75 }

/** Grid lines through the edges and leg lines, subdivided so no span exceeds `max`. */
function lines(edge: number, inner: number[], max: number) {
  const base = [-edge, ...inner.filter((v) => Math.abs(v) < edge - 0.8), edge].sort((a, b) => a - b)
  const out: number[] = []
  for (let i = 0; i < base.length; i++) {
    if (i > 0) {
      const gap = base[i] - base[i - 1]
      const n = Math.ceil(gap / max - 1e-6)
      for (let j = 1; j < n; j++) out.push(base[i - 1] + (gap * j) / n)
    }
    if (!out.length || base[i] - out[out.length - 1] > 0.8) out.push(base[i])
  }
  return out
}

function layout(p: P) {
  const L = Math.max(4, p.length)
  const W = Math.max(3, p.width)
  const Pm = sec(p.primary)
  const S = sec(p.secondary)
  const plate = p.floor === 'plate'
  const tTop = plate ? 0.012 : 0.03
  const tos = -tTop
  const nx = Math.max(2, Math.round((p.legs || 4) / 2))
  const spanX = Math.min(p.legSpanX, L - 1)
  const spanZ = Math.min(p.legSpanZ, W - 1)
  const legX = Array.from({ length: nx }, (_, i) => -spanX / 2 + (spanX * i) / (nx - 1))
  const legZ = [-spanZ / 2, spanZ / 2]
  const ex = L / 2 - Pm.b / 2
  const ez = W / 2 - Pm.b / 2
  const xLines = lines(ex, legX, 8)
  const zLines = lines(ez, legZ, 8)
  const sec2: number[] = []
  const pitch = Math.max(0.6, p.secondarySpacing)
  for (let j = 0; j < zLines.length - 1; j++) {
    const n = Math.ceil((zLines[j + 1] - zLines[j]) / pitch - 1e-6)
    for (let i = 1; i < n; i++) sec2.push(zLines[j] + ((zLines[j + 1] - zLines[j]) * i) / n)
  }
  // gutter strip centre (inside the edge girder flange) and the outlet x in each bay
  const gz = W / 2 - Pm.b - 0.06 - GUTTER.w / 2
  const drains = plate && p.drains
  const outlets: V3[] = []
  if (drains)
    for (let i = 0; i < xLines.length - 1; i++) {
      const xm = (xLines[i] + xLines[i + 1]) / 2
      for (const s of [-1, 1]) outlets.push([xm, tos - GUTTER.depth - GUTTER.drop, s * gz])
    }
  return { L, W, Pm, S, plate, tTop, tos, legX, legZ, xLines, zLines, sec2, gz, drains, outlets }
}

export function ports(props: DeckModuleProps = {}): Port[] {
  const lay = layout({ ...defaults, ...props } as P)
  return lay.outlets.map((o, i) => port(`drain-${i + 1}`, `Deck drain ${i + 1}`, o, [0, -1, 0], DRAIN_NPS, 150, 'drain'))
}

export function DeckModule(props: DeckModuleProps & GroupProps) {
  const { length, width, floor, primary, secondary, secondarySpacing, legs, legSpanX, legSpanZ, legHeight, legDiameter, upperDeckAt, column: col, handrails, railMinX, railMaxX, railMinZ, railMaxZ, openings, drains, markings, ...group } = {
    ...defaults,
    ...props,
  }
  const p: P = { length, width, floor, primary, secondary, secondarySpacing, legs, legSpanX, legSpanZ, legHeight, legDiameter, upperDeckAt, column: col, handrails, railMinX, railMaxX, railMinZ, railMaxZ, openings, drains, markings }
  const data = useKit((k) => build(k, p), [length, width, floor, primary, secondary, secondarySpacing, legs, legSpanX, legSpanZ, legHeight, legDiameter, upperDeckAt, col, handrails, railMinX, railMaxX, railMinZ, railMaxZ, JSON.stringify(openings), drains, markings])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default DeckModule

function build(k: Kit, p: P) {
  const lay = layout(p)
  const { L, W, Pm, S, plate, tTop, tos, legX, legZ, xLines, zLines, sec2, gz, drains, outlets } = lay
  const st = 'structSteel'
  const yP = tos - Pm.d / 2
  const yS = tos - S.d / 2

  // ---- primary grid: main girders along X (continuous), cross girders along Z framing in with fin plates
  for (const z of zLines) beamTOS(k, -L / 2, z, L / 2, z, tos, p.primary, st)
  for (const x of xLines) {
    for (let j = 0; j < zLines.length - 1; j++) {
      const za = zLines[j] + Pm.b / 2 + 0.006
      const zb = zLines[j + 1] - Pm.b / 2 - 0.006
      beamTOS(k, x, za, x, zb, tos, p.primary, st)
      for (const [zl, d] of [[zLines[j], 1], [zLines[j + 1], -1]] as const) {
        webStiffeners(k, [x, yP, zl], 'x', Pm)
        finPlate(k, [x, yP, zl + d * Pm.tw / 2], 'z', d, Pm.d, Pm.b / 2 + 0.11)
      }
    }
  }
  // ---- secondaries along X between cross girders
  for (const z of sec2) {
    for (let i = 0; i < xLines.length - 1; i++) {
      const xa = xLines[i] + Pm.b / 2 + 0.006
      const xb = xLines[i + 1] - Pm.b / 2 - 0.006
      beamTOS(k, xa, z, xb, z, tos, p.secondary, st)
      finPlate(k, [xLines[i] + Pm.tw / 2, yS, z], 'x', 1, S.d, Pm.b / 2 + 0.1)
      finPlate(k, [xLines[i + 1] - Pm.tw / 2, yS, z], 'x', -1, S.d, Pm.b / 2 + 0.1)
    }
  }

  // ---- floor
  const xEdges = [-L / 2, ...xLines.slice(1, -1), L / 2]
  if (plate) {
    const gzi = gz - GUTTER.w / 2
    const gzo = gz + GUTTER.w / 2
    const bands: [number, number][] = drains ? [[-W / 2, -gzo], [-gzi, gzi], [gzo, W / 2]] : [[-W / 2, W / 2]]
    for (const [z0, z1] of bands) boxMM(k, 'deckPlate', [-L / 2, -tTop, z0], [L / 2, 0, z1])
    if (drains) {
      for (const s of [-1, 1]) {
        // plate over the cross girders between gutter bays
        for (const x of xLines) boxMM(k, 'deckPlate', [Math.max(-L / 2, x - Pm.b / 2 - 0.03), -tTop, s * gz - GUTTER.w / 2], [Math.min(L / 2, x + Pm.b / 2 + 0.03), 0, s * gz + GUTTER.w / 2])
        for (let i = 0; i < xLines.length - 1; i++) gutter(k, xLines[i] + Pm.b / 2 + 0.03, xLines[i + 1] - Pm.b / 2 - 0.03, s * gz, tTop)
      }
      for (const o of outlets) drainOutlet(k, o, tos - GUTTER.depth)
    }
    // butt-weld seams over the girder lines
    const seam = 'structSteelDark'
    for (const z of zLines) k.box(seam, [L, 0.0015, 0.008], [0, 0.0007, z])
    for (const x of xLines) k.box(seam, [0.008, 0.0015, W], [x, 0.0007, 0])
  } else {
    const zs = [-W / 2, ...[...zLines.slice(1, -1), ...sec2].sort((a, b) => a - b), W / 2]
    for (let i = 0; i < xEdges.length - 1; i++)
      for (let j = 0; j < zs.length - 1; j++) gratingBay(k, xEdges[i], zs[j], xEdges[i + 1], zs[j + 1], 0, 'z')
  }

  // ---- coaming, guard rails, openings
  const ins = 0.05
  const sides: Record<DeckSide, { a: [number, number]; b: [number, number]; on: boolean; s: (v: number) => number }> = {
    minZ: { a: [-L / 2 + ins, -W / 2 + ins], b: [L / 2 - ins, -W / 2 + ins], on: p.railMinZ, s: (x) => x + L / 2 - ins },
    maxZ: { a: [-L / 2 + ins, W / 2 - ins], b: [L / 2 - ins, W / 2 - ins], on: p.railMaxZ, s: (x) => x + L / 2 - ins },
    minX: { a: [-L / 2 + ins, -W / 2 + ins], b: [-L / 2 + ins, W / 2 - ins], on: p.railMinX, s: (z) => z + W / 2 - ins },
    maxX: { a: [L / 2 - ins, -W / 2 + ins], b: [L / 2 - ins, W / 2 - ins], on: p.railMaxX, s: (z) => z + W / 2 - ins },
  }
  for (const [name, sd] of Object.entries(sides) as [DeckSide, (typeof sides)[DeckSide]][]) {
    const gaps: [number, number][] = (p.openings ?? []).filter((o) => o.side === name).map((o) => [sd.s(o.at) - o.width / 2, sd.s(o.at) + o.width / 2])
    // coaming at the plate edge (also the toe plate), open at access openings
    const alongX = name === 'minZ' || name === 'maxZ'
    const ce = (alongX ? W : L) / 2 - 0.004
    const sg = name.startsWith('min') ? -1 : 1
    const cut = (v: number): [number, number][] => {
      let pcs: [number, number][] = [[-v, v]]
      for (const o of (p.openings ?? []).filter((q) => q.side === name)) {
        const a = o.at - o.width / 2
        const b = o.at + o.width / 2
        pcs = pcs.flatMap(([p0, p1]) => (b <= p0 || a >= p1 ? [[p0, p1]] : [...(a > p0 ? [[p0, a]] : []), ...(b < p1 ? [[b, p1]] : [])]) as [number, number][])
      }
      return pcs
    }
    for (const [u0, u1] of cut(alongX ? L / 2 : W / 2 - 0.008)) {
      if (alongX) toePlate(k, [u0, 0, sg * ce], [u1, 0, sg * ce])
      else toePlate(k, [sg * ce, 0, u0], [sg * ce, 0, u1])
    }
    if (p.handrails && sd.on) {
      const adjacentStart = alongX ? p.railMinX : p.railMinZ
      railPath(k, [sd.a, sd.b], 0, gaps, false, { toe: false }, [alongX || !adjacentStart, alongX || !(alongX ? p.railMaxX : p.railMaxZ)])
    }
    for (const o of (p.openings ?? []).filter((q) => q.side === name)) {
      const a = o.at - o.width / 2
      const b = o.at + o.width / 2
      const e = (alongX ? W : L) / 2
      const pt = (u: number, inset: number): V3 => (alongX ? [u, 0.0015, sg * (e - inset)] : [sg * (e - inset), 0.0015, u])
      hazardBand(k, pt(a, 0.1), pt(b, 0.1), 0.2, 0.003)
      if (o.gate && p.handrails && sd.on) {
        const h = pt(a + 0.0, ins)
        const t = pt(b, ins)
        gate(k, [h[0], 0, h[2]], [t[0], 0, t[2]])
      }
    }
  }

  // ---- markings: escape-route lines and load stencils
  if (plate && p.markings) {
    const yel = paint('#e2b018', { clearcoat: 0, roughness: 0.7, weather: 1 })
    const e = 1.4
    const lw = 0.075
    for (const s of [-1, 1]) {
      k.box(yel, [L - 2 * e + lw, 0.002, lw], [0, 0.001, s * (W / 2 - e)])
      k.box(yel, [lw, 0.002, W - 2 * e - lw], [s * (L / 2 - e), 0.001, 0])
    }
    const txt = textMaterial('MAX UDL 10 kN/m²', '#666c70', '#f1f1ec', 512, 96)
    k.plane(txt, 3.2, 0.6, [0, 0.0012, -W / 2 + e + 0.7], eul(-Math.PI / 2, 0, 0))
    const esc = textMaterial('ESCAPE ROUTE', '#666c70', '#e2b018', 512, 96)
    for (const s of [-1, 1]) k.plane(esc, 2.6, 0.48, [s * (L / 4), 0.0012, W / 2 - e / 2 - 0.15], eul(-Math.PI / 2, 0, 0))
  }

  // ---- legs below, with node cans, girder gussets and chevron bracing
  if (p.legHeight > 0) {
    const R = p.legDiameter / 2
    const yF = -p.legHeight
    const lm = 'structSteel'
    for (const x of legX)
      for (const z of legZ) {
        k.pipe(lm, [x, yF, z], [x, tos, z], 2 * R, Math.max(0.04, p.legDiameter / 30), 32)
        k.cyl(lm, R + 0.03, Pm.d + 0.5, [x, tos - (Pm.d + 0.5) / 2, z], 'y', 32)
        k.cyl(lm, R + 0.002, 0.25, [x, tos - Pm.d - 0.625, z], 'y', 32, R + 0.03)
        k.torus('structSteelDark', R + 0.004, 0.012, [x, yF + 0.6, z], 'y', 6, 40)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
          gusset(k, [x + dx * (R + 0.03), tos - Pm.d, z + dz * (R + 0.03)], [dx, 0, dz], [0, -1, 0], Math.min(0.9, R), Math.min(1.1, p.legHeight * 0.4), 0.025, lm)
      }
    if (p.legHeight > 2.5) {
      const rb = Math.min(0.3, Math.max(0.12, R * 0.22))
      const yb = tos - Pm.d
      const brace = (a: V3, b: V3) => {
        const apex: V3 = [(a[0] + b[0]) / 2, yb - 0.05, (a[2] + b[2]) / 2]
        for (const q of [a, b]) k.rod(lm, [q[0], yF + 1.0, q[2]], apex, rb, 16)
        k.box(lm, Math.abs(a[0] - b[0]) > 0.1 ? [1.0, 0.6, 0.03] : [0.03, 0.6, 1.0], [apex[0], yb - 0.3, apex[2]])
      }
      for (const z of legZ) for (let i = 0; i < legX.length - 1; i++) brace([legX[i], 0, z], [legX[i + 1], 0, z])
      for (const x of [legX[0], legX[legX.length - 1]]) brace([x, 0, legZ[0]], [x, 0, legZ[1]])
    }
  }

  // ---- stub columns up to the girder underside of an identical module at y = upperDeckAt
  if (p.upperDeckAt > 0) {
    const C = sec(p.column)
    const yTop = p.upperDeckAt - tTop - Pm.d
    if (yTop > 1) {
      for (const x of legX)
        for (const z of legZ) {
          boxMM(k, st, [x - C.d / 2 - 0.1, 0, z - C.b / 2 - 0.1], [x + C.d / 2 + 0.1, 0.03, z + C.b / 2 + 0.1])
          boxMM(k, st, [x - C.d / 2 - 0.1, yTop - 0.03, z - C.b / 2 - 0.1], [x + C.d / 2 + 0.1, yTop, z + C.b / 2 + 0.1])
          column(k, x, z, 0.03, yTop - 0.03, p.column, st, 'x')
          for (const s of [-1, 1]) {
            gusset(k, [x + s * C.d / 2, 0.03, z], [s, 0, 0], [0, 1, 0], 0.09, 0.3, 0.015)
            gusset(k, [x + s * C.d / 2, yTop - 0.03, z], [s, 0, 0], [0, -1, 0], 0.09, 0.3, 0.015)
            gusset(k, [x, 0.03, z + s * (C.tw / 2)], [0, 0, s], [0, 1, 0], (C.b - C.tw) / 2, 0.3, 0.015)
          }
          // hazard band around the base
          const hx = C.d / 2 + 0.25
          const hz = C.b / 2 + 0.25
          hazardBand(k, [x - hx, 0.0015, z - hz + 0.075], [x + hx, 0.0015, z - hz + 0.075], 0.15, 0.003)
          hazardBand(k, [x - hx, 0.0015, z + hz - 0.075], [x + hx, 0.0015, z + hz - 0.075], 0.15, 0.003)
          hazardBand(k, [x - hx + 0.075, 0.0015, z - hz + 0.15], [x - hx + 0.075, 0.0015, z + hz - 0.15], 0.15, 0.003)
          hazardBand(k, [x + hx - 0.075, 0.0015, z - hz + 0.15], [x + hx - 0.075, 0.0015, z + hz - 0.15], 0.15, 0.003)
        }
    }
  }
}

/** Gutter trough between two cross girders, centred on z = zc, grating cover flush with the floor. */
function gutter(k: Kit, x0: number, x1: number, zc: number, tTop: number) {
  const { w, depth } = GUTTER
  const yb = -tTop - depth
  const t = 0.006
  boxMM(k, 'structSteel', [x0, yb - t, zc - w / 2 - t], [x1, yb, zc + w / 2 + t])
  for (const s of [-1, 1]) boxMM(k, 'structSteel', [x0, yb, zc + s * (w / 2) - (s < 0 ? t : 0)], [x1, -tTop, zc + s * (w / 2) + (s > 0 ? t : 0)])
  for (const x of [x0, x1]) boxMM(k, 'structSteel', [x - t / 2, yb, zc - w / 2], [x + t / 2, -tTop, zc + w / 2])
  // ledges for the cover
  for (const s of [-1, 1]) boxMM(k, 'galvanised', [x0, -0.042, zc + s * (w / 2 - 0.012) - 0.006], [x1, -0.03, zc + s * (w / 2 - 0.012) + 0.006])
  gratingBay(k, x0 + 0.004, zc - w / 2 + 0.003, x1 - 0.004, zc + w / 2 - 0.003, 0, 'z')
}

/** 3" drain outlet below a gutter at yTop: pipe, liquid-seal pot (stops gas back-flow between decks), pipe and a downward 150# flange at `face`. */
function drainOutlet(k: Kit, face: V3, yTop: number) {
  const od = pipeOD(DRAIN_NPS)
  const L = flange(k, DRAIN_NPS, 150, face, [0, -1, 0], true)
  const pot = { top: yTop - 0.2, h: 0.32, r: 0.11 }
  k.pipe('pipePaint', [face[0], yTop - 0.006, face[2]], [face[0], pot.top, face[2]], od, pipeWall(DRAIN_NPS, '40'))
  k.cyl('pipePaint', pot.r, pot.h, [face[0], pot.top - pot.h / 2, face[2]], 'y', 20)
  for (const y of [pot.top, pot.top - pot.h]) k.cyl('pipePaint', pot.r + 0.01, 0.02, [face[0], y, face[2]], 'y', 20)
  k.cyl('pipePaint', 0.025, 0.06, [face[0] + pot.r, pot.top - pot.h + 0.06, face[2]], 'x', 8) // clean-out plug
  k.pipe('pipePaint', [face[0], pot.top - pot.h, face[2]], [face[0], face[1] + L, face[2]], od, pipeWall(DRAIN_NPS, '40'))
}
