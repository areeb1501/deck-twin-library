// CCR operator console: straight, angled (wedge) or curved run of 1–5 segments, technical base with rear access, bi-level top, multi-monitor rails, sit-stand option. ISO 11064, EN 527.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, eul, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { louvreMaterial } from '../lib/textures'
import { INCH, chair, deskPhone, deskRadio, frame, furnitureMats, keyboardAndMouse, monitor, taskLight } from './_furniture'
import { ScreenPanels, type ScreenKind, type ScreenPlacement } from './_screens'
import { labelMaterial } from './_textures'

export interface ControlConsoleProps {
  /** number of console segments, 1–5 */
  segments?: number
  layout?: 'straight' | 'angled' | 'curved'
  /** turn between segments (angled wedge / curved sweep per segment), degrees */
  angle?: number
  /** segment width along the front edge, m */
  segmentWidth?: number
  /** overall depth, front edge to rear doors, m */
  depth?: number
  /** worksurface top height, m (EN 527 range 0.65–1.25 when sit-stand) */
  deskHeight?: number
  /** worksurface on electric lifting columns */
  sitStand?: boolean
  /** monitor columns per segment, 1–4 */
  monitorsPerSegment?: number
  /** monitor rows, 1–2 */
  rows?: number
  /** monitor diagonal, inches (shrinks to fit the segment) */
  monitorSize?: number
  chairs?: boolean
  /** keyboards, phone, radio and task lights */
  accessories?: boolean
  /** procedural content, cycled over the monitors */
  content?: ScreenKind[]
  /** live textures per monitor (segment by segment, bottom row first, left to right); overrides the procedural content */
  screens?: (THREE.Texture | null | undefined)[]
  tag?: string
}

export const defaults = {
  segments: 3,
  layout: 'curved' as 'straight' | 'angled' | 'curved',
  angle: 20,
  segmentWidth: 1.6,
  depth: 1.2,
  deskHeight: 0.74,
  sitStand: false,
  monitorsPerSegment: 2,
  rows: 2,
  monitorSize: 24,
  chairs: true,
  accessories: true,
  content: ['alarm', 'mimic', 'trend', 'overview', 'fg', 'esd', 'cctv', 'kpi', 'weather'] as ScreenKind[],
  screens: [] as (THREE.Texture | null | undefined)[],
  tag: 'OWS-101',
}

type P = Omit<typeof defaults, 'screens'>

export function ControlConsole({ screens, ...rest }: ControlConsoleProps & GroupProps) {
  const { segments, layout, angle, segmentWidth, depth, deskHeight, sitStand, monitorsPerSegment, rows, monitorSize, chairs, accessories, content, tag, ...group } = { ...defaults, ...rest }
  const contentKey = content.join(',')
  const b = useMemo(
    () => build({ segments, layout, angle, segmentWidth, depth, deskHeight, sitStand, monitorsPerSegment, rows, monitorSize, chairs, accessories, content, tag }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments, layout, angle, segmentWidth, depth, deskHeight, sitStand, monitorsPerSegment, rows, monitorSize, chairs, accessories, contentKey, tag],
  )
  useEffect(() => () => b.built.geometry.dispose(), [b])
  return (
    <group {...group}>
      <group position={b.offset}>
        <KitMesh data={b.built} />
        <ScreenPanels placements={b.placements} screens={screens} />
      </group>
    </group>
  )
}

export default ControlConsole

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Front-edge path: position and heading at arc length s, for each layout. Local +Z points at the operator. */
function makePath(layout: P['layout'], n: number, W: number, ang: number) {
  const L = n * W
  const R = layout === 'curved' && ang > 1e-4 ? W / ang : Infinity
  const heads = Array.from({ length: n }, (_, i) => (layout === 'straight' ? 0 : (i - (n - 1) / 2) * ang))
  const joints: [number, number][] = [[0, 0]]
  for (let i = 0; i < n; i++) {
    const [x, z] = joints[i]
    joints.push([x + W * Math.cos(heads[i]), z + W * Math.sin(heads[i])])
  }
  const at = (s: number, seg?: number): { x: number; z: number; phi: number } => {
    if (Number.isFinite(R)) {
      const phi = s / R
      return { x: R * Math.sin(phi), z: R - R * Math.cos(phi), phi }
    }
    const i = seg ?? clamp(Math.floor((s + L / 2) / W), 0, n - 1)
    const d = s + L / 2 - i * W
    const phi = heads[i]
    return { x: joints[i][0] + d * Math.cos(phi), z: joints[i][1] + d * Math.sin(phi), phi }
  }
  /** point at arc length s, offset z towards the operator (negative = towards the back) */
  const edge = (s: number, z: number, seg?: number): [number, number] => {
    const p = at(s, seg)
    return [p.x - Math.sin(p.phi) * z, p.z + Math.cos(p.phi) * z]
  }
  const mat = (s: number, y: number, z: number, seg?: number, extra?: THREE.Matrix4) => {
    const p = at(s, seg)
    const [x, zz] = edge(s, z, seg)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, zz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.phi), new THREE.Vector3(1, 1, 1))
    return extra ? m.multiply(extra) : m
  }
  return { L, R, at, edge, mat, curved: Number.isFinite(R) }
}

/** Horizontal slab: polygon in plan (x, z), top at yTop, thickness t downwards. */
function slab(k: Kit, mat: Parameters<Kit['box']>[0], pts: [number, number][], yTop: number, t: number) {
  if (pts.length < 3) return
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)))
  k.extrude(mat, s, t, new THREE.Matrix4().makeTranslation(0, yTop, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)))
}

function build(p: P) {
  const k = new Kit()
  const placements: ScreenPlacement[] = []
  const M = furnitureMats()
  const n = clamp(Math.round(p.segments), 1, 5)
  const W = clamp(p.segmentWidth, 0.8, 2.4)
  const D = clamp(p.depth, 0.9, 1.6)
  const ang = (clamp(p.angle, 0, 45) * Math.PI) / 180
  const layout = p.layout === 'curved' && ang < 1e-3 ? 'straight' : p.layout
  const path = makePath(layout, n, W, ang)
  const { L, edge, mat } = path
  const deskH = p.sitStand ? clamp(p.deskHeight, 0.65, 1.25) : clamp(p.deskHeight, 0.68, 0.8)
  const SHELF = 0.45 // technical base depth (rear)
  const FD = D - SHELF // front worksurface depth
  const SH = Math.min(0.7, deskH - 0.04) // rear (monitor) level, 40–70 mm below the worksurface on a fixed console
  const PL = 0.1 // recessed plinth
  const top = paint('#d9dad5', { metalness: 0, roughness: 0.55, clearcoat: 0.15, weather: 0 }) // compact laminate
  const body = paint('#3a3f44', { metalness: 0.3, roughness: 0.5, clearcoat: 0.1, weather: 0 }) // RAL 7016-ish
  const endP = paint('#bfc3c6', { metalness: 0.6, roughness: 0.35, clearcoat: 0, weather: 0 })
  const ns = path.curved ? 14 : 1

  // per-segment polygons along the path
  const band = (i: number, z0: number, z1: number, ins = 0): [number, number][] => {
    const s0 = -L / 2 + i * W + ins
    const s1 = -L / 2 + (i + 1) * W - ins
    const a: [number, number][] = []
    const b: [number, number][] = []
    for (let j = 0; j <= ns; j++) {
      const s = s0 + ((s1 - s0) * j) / ns
      a.push(edge(s, z0, i))
      b.push(edge(s, z1, i))
    }
    return [...a, ...b.reverse()]
  }

  for (let i = 0; i < n; i++) {
    const sm = -L / 2 + (i + 0.5) * W
    // worksurface and its soft front edge, rear level, technical base and plinth
    slab(k, top, band(i, 0, -FD), deskH, 0.03)
    slab(k, top, band(i, -FD, -D + 0.005), SH, 0.025)
    slab(k, body, band(i, -FD - 0.02, -D + 0.02, 0.002), SH - 0.025, SH - 0.025 - PL)
    slab(k, 'rubberBlack', band(i, -FD - 0.06, -D + 0.06, 0.03), PL, PL)
    // rubber-nosed front edge
    for (let j = 0; j < ns; j++) {
      const s0 = -L / 2 + i * W + (W * j) / ns
      const s1 = s0 + W / ns
      const [x0, z0] = edge(s0, 0.004, i)
      const [x1, z1] = edge(s1, 0.004, i)
      k.rod(M.bezel, [x0, deskH - 0.015, z0], [x1, deskH - 0.015, z1], 0.016, 10)
    }
    // riser face on the step down to the rear level
    if (deskH - SH > 0.035) slab(k, body, band(i, -FD + 0.002, -FD - 0.002), deskH - 0.03, deskH - 0.03 - SH)

    k.with(mat(sm, 0, 0, i), () => {
      // operator face of the base: CPU bay vent, power LED, cable grommet, segment label
      const zf = -FD - 0.02 + 0.003
      k.plane(louvreMaterial('#3a3f44'), W * 0.3, 0.25, [-W * 0.2, 0.3, zf])
      k.box(M.ledGreen, [0.008, 0.008, 0.003], [-W * 0.2 + W * 0.15 - 0.03, 0.45, zf])
      k.plane(labelMaterial(`${p.tag}-${i + 1}`), 0.16, 0.03, [W * 0.25, SH - 0.08, zf])
      k.cyl('rubberBlack', 0.03, 0.006, [W * 0.3, SH + 0.002, -D + 0.08], 'y', 16)
      // rear access doors: louvred, flush handle, quarter-turn lock
      const nd = Math.max(1, Math.ceil((W - 0.04) / 0.6))
      const dw = (W - 0.04) / nd
      for (let d = 0; d < nd; d++) {
        const x = -W / 2 + 0.02 + (d + 0.5) * dw
        const dh = SH - 0.025 - PL - 0.02
        k.with(frame([x, PL + 0.01 + dh / 2, -D + 0.012], [0, Math.PI, 0]), () => {
          k.box(body, [dw - 0.006, dh, 0.016], [0, 0, 0.008])
          k.plane(louvreMaterial('#353a3f'), dw * 0.6, dh * 0.35, [0, dh * 0.22, 0.0165])
          k.plane(louvreMaterial('#353a3f'), dw * 0.6, dh * 0.2, [0, -dh * 0.3, 0.0165])
          k.rbox(M.housing, [0.025, 0.12, 0.012], 0.004, [dw / 2 - 0.05, 0, 0.022])
          k.cyl('stainless', 0.01, 0.006, [dw / 2 - 0.05, 0.1, 0.019], 'z', 12)
        })
      }
      // cable basket under the worksurface rear edge
      const yT = deskH - 0.16
      for (const zz of [-FD + 0.03, -FD + 0.17]) k.box('galvanised', [W - 0.1, 0.004, 0.004], [0, yT + 0.06, zz])
      for (let x = -W / 2 + 0.08; x < W / 2 - 0.05; x += 0.1) k.tube('galvanised', [[x, yT + 0.06, -FD + 0.03], [x, yT, -FD + 0.03], [x, yT, -FD + 0.17], [x, yT + 0.06, -FD + 0.17]], 0.002, 4, 0.01)
      for (let c = 0; c < 5; c++) k.rod('cable', [-W / 2 + 0.06, yT + 0.012 + (c % 2) * 0.012, -FD + 0.06 + c * 0.022], [W / 2 - 0.06, yT + 0.012 + (c % 2) * 0.012, -FD + 0.06 + c * 0.022], 0.006, 6)
      for (const sx of [-1, 1]) k.box('galvanised', [0.03, deskH - 0.03 - yT, 0.003], [sx * (W / 2 - 0.08), (deskH - 0.03 + yT) / 2, -FD + 0.02])

      if (p.sitStand) {
        // electric lifting columns with floor feet, hand control and energy chain to the base
        for (const sx of [-1, 1]) {
          const x = sx * (W / 2 - 0.18)
          k.box('rubberBlack', [0.07, 0.03, FD - 0.1], [x, 0.015, -FD / 2 - 0.02])
          k.rbox(M.housing, [0.09, 0.55, 0.06], 0.006, [x, 0.03 + 0.275, -FD + 0.12])
          k.rbox(M.alu, [0.075, deskH - 0.6, 0.05], 0.005, [x, 0.575 + (deskH - 0.6) / 2 - 0.02, -FD + 0.12])
          k.box(M.housing, [0.06, 0.04, FD - 0.2], [x, deskH - 0.05, -FD / 2])
        }
        k.rbox(M.housing, [0.12, 0.025, 0.06], 0.008, [-W / 2 + 0.25, deskH - 0.045, -0.06])
        for (let c = 0; c < 4; c++) k.box(c === 0 ? M.ledGreen : 'plasticGrey', [0.016, 0.006, 0.012], [-W / 2 + 0.2 + c * 0.03, deskH - 0.06, -0.04])
        const ch: V3[] = []
        for (let t = 0; t <= 10; t++) {
          const a = (t / 10) * Math.PI
          ch.push([W * 0.1, (SH + deskH) / 2 - 0.15 + Math.cos(a) * ((deskH - SH) / 2 + 0.15), -FD - 0.02 + 0.03 + Math.sin(a) * 0.05])
        }
        for (const q of ch) k.box(M.housing, [0.05, 0.025, 0.025], q)
      } else {
        // cantilever brackets under the worksurface
        for (const sx of [-1, 1]) k.box(M.alu, [0.012, 0.08, FD - 0.12], [sx * (W / 2 - 0.12), deskH - 0.07, -FD / 2 - 0.04])
      }
    })

    // monitor rails and posts on the rear level, monitors on short arms
    const cols = clamp(Math.round(p.monitorsPerSegment), 1, 4)
    const nr = clamp(Math.round(p.rows), 1, 2)
    const fit = ((W - 0.04) / cols - 0.026) / ((INCH * 16) / Math.hypot(16, 9))
    const diag = clamp(Math.min(p.monitorSize, fit), 17, 43)
    const mw = (diag * INCH * 16) / Math.hypot(16, 9)
    const mh = (mw * 9) / 16
    const zr = -D + 0.11
    const y0 = Math.max(deskH, SH) + 0.11 + mh / 2
    const rowY = Array.from({ length: nr }, (_, r) => y0 + r * (mh + 0.03))
    const s0 = -L / 2 + i * W + 0.06
    const s1 = -L / 2 + (i + 1) * W - 0.06
    for (const y of rowY) {
      const pts: V3[] = []
      for (let j = 0; j <= ns; j++) {
        const s = s0 + ((s1 - s0) * j) / ns
        const [x, z] = edge(s, zr, i)
        pts.push([x, y, z])
      }
      if (path.curved) k.tube(M.alu, pts, 0.018, 12)
      else k.with(mat(sm, y, zr, i), () => k.rbox(M.alu, [s1 - s0, 0.06, 0.035], 0.006, [0, 0, 0]))
    }
    for (const s of [s0 + 0.1, s1 - 0.1]) {
      const yTop = rowY[nr - 1] + 0.05
      k.with(mat(s, 0, zr - 0.035, i), () => {
        k.rbox(M.alu, [0.06, yTop - SH, 0.035], 0.006, [0, SH + (yTop - SH) / 2, 0])
        k.box(M.housing, [0.1, 0.012, 0.08], [0, SH + 0.006, 0])
      })
    }
    for (let r = 0; r < nr; r++)
      for (let c = 0; c < cols; c++) {
        const s = sm + (c - (cols - 1) / 2) * (mw + 0.026)
        const tilt = nr > 1 && r === nr - 1 ? 0.1 : -0.04
        const m = mat(s, rowY[r], zr + 0.11, i, new THREE.Matrix4().makeRotationX(tilt))
        const kind = p.content.length ? p.content[(i * nr * cols + r * cols + c) % p.content.length] : 'overview'
        placements.push(monitor(k, m, diag, kind, { arm: 0.03 }))
      }

    // operator position: keyboard and mouse, chair
    if (p.accessories) keyboardAndMouse(k, mat(sm, deskH, -0.26, i), 0.32)
    if (p.chairs) chair(k, mat(sm, 0, 0.62, i, new THREE.Matrix4().makeRotationY(Math.PI)), { seat: Math.max(0.46, Math.min(0.62, deskH - 0.25)) })
  }

  // wedge fillers at angled joints: worksurface, rear level, base
  if (layout === 'angled')
    for (let j = 1; j < n; j++) {
      const s = -L / 2 + j * W
      const A = (z: number) => edge(s, z, j - 1)
      const B = (z: number) => edge(s, z, j)
      slab(k, top, [A(0), B(-FD), A(-FD)].reverse(), deskH, 0.03)
      slab(k, top, [A(-FD), B(-FD), B(-D + 0.005), A(-D + 0.005)].reverse(), SH, 0.025)
      slab(k, body, [A(-FD - 0.02), B(-FD - 0.02), B(-D + 0.02), A(-D + 0.02)].reverse(), SH - 0.025, SH - 0.025 - PL)
      slab(k, 'rubberBlack', [A(-FD - 0.06), B(-FD - 0.06), B(-D + 0.06), A(-D + 0.06)].reverse(), PL, PL)
    }

  // end panels with tag plates
  for (const [sgn, seg] of [[-1, 0], [1, n - 1]] as const) {
    const s = (sgn * L) / 2
    k.with(mat(s, 0, 0, seg), () => {
      const x = sgn * 0.015
      const hEnd = p.sitStand ? SH : deskH - 0.03
      k.rbox(endP, [0.03, hEnd, D - 0.04], 0.01, [x, hEnd / 2, -D / 2 - 0.01])
      k.plane(labelMaterial(p.tag), 0.2, 0.04, [x + sgn * 0.0155, hEnd - 0.1, -D / 2], eul(0, (sgn * Math.PI) / 2, 0))
    })
  }

  // accessories: phone left, radio right, LED task lights at both ends
  if (p.accessories) {
    deskPhone(k, mat(-L / 2 + W * 0.18, deskH, -0.5, 0, new THREE.Matrix4().makeRotationY(0.3)))
    deskRadio(k, mat(L / 2 - W * 0.18, deskH, -0.52, n - 1, new THREE.Matrix4().makeRotationY(-0.3)))
    taskLight(k, mat(-L / 2 + 0.1, deskH, -FD + 0.06, 0, new THREE.Matrix4().makeRotationY(-0.6)))
    taskLight(k, mat(L / 2 - 0.1, deskH, -FD + 0.06, n - 1, new THREE.Matrix4().makeRotationY(0.6)))
  }

  const built = k.build()
  const bb = built.geometry.boundingBox!
  const offset: V3 = [-(bb.min.x + bb.max.x) / 2, 0, -(bb.min.z + bb.max.z) / 2]
  return { built, placements, offset }
}
