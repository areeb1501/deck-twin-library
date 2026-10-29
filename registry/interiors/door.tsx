// Offshore door set in a wall stub: single / double hinged, sliding, blast or roller shutter; A60 / H120 fire rating, vision panel, panic bar, closer, ISO 7010 signage.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, eul, type Built, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { furnitureMats } from './_furniture'
import { exitSignMaterial, labelMaterial, liningMaterial, ratingLabelMaterial, roomSignMaterial, slatMaterial } from './_textures'
import { wallWithHoles } from './_wall'

export type DoorKind = 'single' | 'double' | 'sliding' | 'blast' | 'roller-shutter'
export type FireRating = 'A60' | 'H120' | 'none'

export interface DoorProps {
  kind?: DoorKind
  fireRating?: FireRating
  /** clear opening width, m (0 = typical for the kind) */
  width?: number
  /** clear opening height, m (0 = typical for the kind) */
  height?: number
  /** 0 closed … 1 fully open (swing, slide or roll up) */
  open?: number
  /** hinge side (or slide direction) seen from the +Z face */
  hand?: 'left' | 'right'
  hardware?: 'lever' | 'panic'
  visionPanel?: boolean
  /** short wall around the frame so the door reads on its own; 'none' to set it in a room wall */
  wall?: 'stub' | 'none'
  wallThickness?: number
  sign?: 'both' | 'exit' | 'room' | 'none'
  /** room name on the sign beside the door */
  label?: string
  tag?: string
}

export const defaults = {
  kind: 'single' as DoorKind,
  fireRating: 'A60' as FireRating,
  width: 0,
  height: 0,
  open: 0.35,
  hand: 'left' as 'left' | 'right',
  hardware: 'lever' as 'lever' | 'panic',
  visionPanel: true,
  wall: 'stub' as 'stub' | 'none',
  wallThickness: 0.15,
  sign: 'both' as 'both' | 'exit' | 'room' | 'none',
  label: 'CENTRAL CONTROL ROOM',
  tag: 'D-101',
}

const TYPICAL: Record<DoorKind, [number, number]> = { single: [0.9, 2.1], double: [1.8, 2.1], sliding: [1.2, 2.1], blast: [1.0, 2.1], 'roller-shutter': [2.4, 2.6] }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Clear opening, frame and the rough hole the door needs in a wall (hole centred on x = 0, from the floor). */
export function doorOpening(p: Pick<DoorProps, 'kind' | 'width' | 'height'> = {}) {
  const kind = p.kind ?? defaults.kind
  const W = clamp(p.width || TYPICAL[kind][0], 0.6, kind === 'roller-shutter' ? 6 : 3)
  const H = clamp(p.height || TYPICAL[kind][1], 1.8, kind === 'roller-shutter' ? 5 : 3)
  const blast = kind === 'blast'
  const FR = kind === 'roller-shutter' ? 0 : blast ? 0.1 : 0.06 // frame face
  const R = kind === 'roller-shutter' ? 0 : blast ? 0.02 : 0.012 // rebate
  return { W, H, FR, R, holeW: W + 2 * (R + FR), holeH: H + R + FR }
}

export function Door(props: DoorProps & GroupProps) {
  const { kind, fireRating, width, height, open, hand, hardware, visionPanel, wall, wallThickness, sign, label, tag, ...group } = { ...defaults, ...props }
  const p = { kind, fireRating, width, height, hand, hardware, visionPanel, wall, wallThickness, sign, label, tag }
  const b = useMemo(() => build(p), [kind, fireRating, width, height, hand, hardware, visionPanel, wall, wallThickness, sign, label, tag]) // eslint-disable-line react-hooks/exhaustive-deps
  const o = clamp(open, 0, 1)
  const curtain = useMemo(() => (kind === 'roller-shutter' ? curtainBuilt(b.dims.W, b.dims.H, o, b.zFace) : null), [kind, b, o])
  useEffect(() => () => [b.built, ...b.leaves.map((l) => l.built)].forEach((x) => x.geometry.dispose()), [b])
  useEffect(() => () => curtain?.geometry.dispose(), [curtain])
  return (
    <group {...group}>
      <KitMesh data={b.built} />
      {b.leaves.map((l, i) => (
        <group key={i} position={[l.x + (l.slide ?? 0) * o, 0, l.z]} rotation={[0, l.slide !== undefined ? 0 : -l.dir * o * l.max, 0]}>
          <KitMesh data={l.built} />
        </group>
      ))}
      {curtain && <KitMesh data={curtain} />}
    </group>
  )
}

export default Door

interface Leaf {
  x: number
  z: number
  dir: 1 | -1
  max: number
  slide?: number
  built: Built
}

type P = Omit<typeof defaults, 'open'>

function build(p: P) {
  const k = new Kit()
  const M = furnitureMats()
  const d = doorOpening(p)
  const { W, H, FR, R } = d
  const kind = p.kind
  const blast = kind === 'blast'
  const T = clamp(p.wallThickness, 0.06, 0.4)
  const FD = Math.max(T + 0.03, blast ? 0.2 : 0.12) // frame depth
  const rating: FireRating = blast && p.fireRating === 'none' ? 'A60' : p.fireRating
  const t = blast ? 0.1 : rating === 'H120' ? 0.07 : rating === 'A60' ? 0.06 : 0.045 // leaf thickness
  const frameMat = paint(blast ? '#5d646a' : '#c9cdc9', { metalness: 0.3, roughness: 0.45, clearcoat: 0.2, weather: 0 })
  const leafMat = paint(blast ? '#6b7379' : '#d4d8d4', { metalness: 0.25, roughness: 0.42, clearcoat: 0.3, weather: 0 })
  const zo = FD / 2 - 0.003 // outer leaf face (swing doors close flush with the +Z frame face)
  const latch = p.hand === 'left' ? 1 : -1 // latch side x sign

  // wall stub with a real hole
  const slideRun = kind === 'sliding' ? W + 0.1 : 0
  const wallLen = d.holeW + slideRun + 1.5
  const wallH = Math.max(2.9, d.holeH + (kind === 'roller-shutter' ? 0.9 : 0.6))
  const wallX = kind === 'sliding' ? (-latch * slideRun) / 2 : 0
  if (p.wall === 'stub') {
    k.at([wallX, 0, 0], undefined, () => wallWithHoles(k, wallLen, wallH, T, [{ u: -wallX, w: d.holeW, y0: 0, y1: d.holeH }], liningMaterial()))
    // vinyl skirting both faces
    for (const s of [-1, 1])
      for (const [a, b] of [[-wallLen / 2 + wallX, -d.holeW / 2], [d.holeW / 2, wallLen / 2 + wallX]] as const) if (b - a > 0.01) k.box('rubberBlack', [b - a, 0.1, 0.008], [(a + b) / 2, 0.05, s * (T / 2 + 0.004)])
  }

  const leaves: Leaf[] = []
  if (kind === 'roller-shutter') {
    // reveal lining, side guides, coil box with drive, bottom seal, push-button station
    const zf = T / 2
    for (const s of [-1, 1]) {
      k.box(frameMat, [0.012, H, T], [s * (W / 2 + 0.006), H / 2, 0])
      k.box('galvanised', [0.09, H + 0.05, 0.11], [s * (W / 2 + 0.03), (H + 0.05) / 2, zf + 0.055])
      k.box('rubberBlack', [0.03, H, 0.02], [s * (W / 2 - 0.005), H / 2, zf + 0.05])
    }
    k.box(frameMat, [W, 0.012, T], [0, H + 0.006, 0])
    const bx = W + 0.3
    k.box('galvanised', [bx, 0.48, 0.46], [0, H + 0.05 + 0.24, zf + 0.23])
    k.box('galvanised', [bx + 0.01, 0.02, 0.47], [0, H + 0.05, zf + 0.235])
    k.cyl(M.housing, 0.09, 0.32, [latch * (bx / 2 + 0.16), H + 0.29, zf + 0.23], 'x', 20)
    k.box(M.housing, [0.14, 0.16, 0.14], [latch * (bx / 2 + 0.07), H + 0.29, zf + 0.23])
    const ps = latch * (W / 2 + 0.45)
    k.rbox('actuatorYellow', [0.12, 0.22, 0.08], 0.01, [ps, 1.3, zf + 0.04])
    ;(['#2e8b57', '#d42a1f', '#2e8b57'] as const).forEach((c, i) => k.cyl(paint(c, { weather: 0 }), 0.018, 0.02, [ps, 1.37 - i * 0.07, zf + 0.088], 'z', 14))
    k.plane(ratingLabelMaterial(rating === 'none' ? 'FIRE' : rating), 0.12, 0.06, [-latch * (W / 2 + 0.03), 1.5, zf + 0.1105])
    tagPlate(k, p.tag, [0, H + 0.36, zf + 0.461], 'z', 0.2)
    k.plane(labelMaterial('KEEP CLEAR', '#e5b114', '#111'), 0.6, 0.1, [0, H + 0.18, zf + 0.461])
  } else {
    // pressed-steel frame: jambs, head, rebate stops with seals, threshold
    const zStop = (zo - t - 0.002 - FD / 2) / 2 // centre of the stop behind the leaf
    const dStop = zo - t - 0.002 + FD / 2
    for (const s of [-1, 1]) {
      k.box(frameMat, [FR, H + R + FR, FD], [s * (W / 2 + R + FR / 2), (H + R + FR) / 2, 0])
      k.box(frameMat, [R, H + R, dStop], [s * (W / 2 + R / 2), (H + R) / 2, zStop])
      k.box('rubberBlack', [0.008, H, 0.006], [s * (W / 2 + R - 0.004), H / 2, zo - t - 0.005])
      if (blast) k.box(frameMat, [FR + 0.06, H + R + FR + 0.03, 0.012], [s * (W / 2 + R + FR / 2 + 0.03), (H + R + FR + 0.03) / 2, FD / 2 + 0.006])
    }
    k.box(frameMat, [W + 2 * (R + FR), FR, FD], [0, H + R + FR / 2, 0])
    k.box(frameMat, [W + 2 * R, R, dStop], [0, H + R / 2, zStop])
    k.box('rubberBlack', [W + 2 * R - 0.01, 0.006, 0.006], [0, H + R - 0.004, zo - t - 0.005])
    if (blast) k.box(frameMat, [W + 2 * (R + FR) + 0.12, 0.08, 0.012], [0, H + R + FR + 0.04, FD / 2 + 0.006])
    k.box('stainless', [W + 2 * R, 0.012, FD + 0.04], [0, 0.006, 0])
    tagPlate(k, p.tag, [0, H + R + FR / 2, FD / 2 + 0.001], 'z', Math.min(0.14, FR * 2.2))
    if (rating !== 'none') k.plane(ratingLabelMaterial(blast ? `${rating}` : rating), 0.09, 0.045, [-latch * (W / 2 + R + FR / 2), 1.6, FD / 2 + 0.0015])

    const nh = blast ? 4 : rating === 'H120' || H > 2.3 ? 4 : 3
    const hingeR = blast ? 0.03 : 0.012
    const hinge = (x: number) => {
      for (let i = 0; i < nh; i++) {
        const y = 0.25 + (i * (H - 0.5)) / (nh - 1)
        k.cyl('stainless', hingeR, blast ? 0.16 : 0.1, [x, y, zo], 'y', 14)
        k.cyl('stainless', hingeR * 0.45, 0.015, [x, y + (blast ? 0.085 : 0.055), zo], 'y', 8)
        if (blast) k.box(frameMat, [0.05, 0.14, 0.02], [x - Math.sign(x) * 0.03, y, zo - 0.005])
      }
    }
    const lw = (n: number) => (W + 2 * R) / n - (n === 2 ? 0.005 : 0.006)
    if (kind === 'double') {
      for (const dir of [1, -1] as const) {
        const hx = -dir * (W / 2 + R)
        hinge(hx)
        leaves.push({ x: hx, z: zo, dir, max: 1.66, built: leafBuilt({ ...p, rating, w: lw(2), h: H + R - 0.011, t, dir, active: dir === -1, mat: leafMat }) })
      }
    } else if (kind === 'sliding') {
      // top-hung on a track on the +Z face; the jamb stops are the closing faces
      const sw = W + 0.1
      const zl = FD / 2 + 0.015
      const hx = -sw / 2
      k.box('aluminium', [2 * sw + 0.1, 0.08, 0.06], [(-latch * slideRun) / 2, H + 0.12, FD / 2 + 0.03])
      k.box(frameMat, [2 * sw + 0.14, 0.16, 0.012], [(-latch * slideRun) / 2, H + 0.12, FD / 2 + t + 0.05])
      k.box('rubberBlack', [0.05, 0.03, 0.05], [latch * (sw / 2 + 0.03), 0.015, zl + t / 2])
      leaves.push({ x: hx * latch, z: zl + t, dir: latch as 1 | -1, max: 0, slide: -latch * slideRun, built: leafBuilt({ ...p, rating, w: sw, h: H + 0.06, t, dir: latch as 1 | -1, active: true, mat: leafMat, sliding: true }) })
    } else {
      const dir = latch as 1 | -1
      const hx = -dir * (W / 2 + R)
      hinge(hx)
      leaves.push({ x: hx, z: zo, dir, max: blast ? 1.57 : 1.66, built: leafBuilt({ ...p, rating, w: lw(1), h: H + R - 0.011, t, dir, active: true, mat: leafMat }) })
    }
    // overhead closer slide rail on the head (push side)
    if (kind !== 'sliding') k.box(M.housing, [kind === 'double' ? W * 0.8 : W * 0.45, 0.025, 0.03], [kind === 'double' ? 0 : latch * W * 0.05, H + R - 0.02, -FD / 2 - 0.015])
  }

  // signage: ISO 7010 E001 exit sign over the door, room name beside it on the latch side
  const zs = T / 2 + 0.002
  const top = kind === 'roller-shutter' ? H + 0.6 : d.holeH
  if (p.sign === 'both' || p.sign === 'exit') {
    if (kind === 'roller-shutter') k.plane(exitSignMaterial(), 0.4, 0.2, [-latch * (W / 2 + 0.5), 2.2, zs])
    else {
      const ye = top + (kind === 'sliding' ? 0.4 : 0.2)
      k.rbox(M.housing, [0.42, 0.22, 0.03], 0.01, [0, ye, zs + 0.013])
      k.plane(exitSignMaterial(), 0.4, 0.2, [0, ye, zs + 0.0285])
    }
  }
  if ((p.sign === 'both' || p.sign === 'room') && p.label) {
    const sx = latch * (d.holeW / 2 + 0.38)
    k.plane(roomSignMaterial(p.label), 0.5, 0.125, [sx, 1.6, zs])
  }
  return { built: k.build(), leaves, dims: d, zFace: T / 2 }
}

/** Door leaf from its hinge line along dir·X, outer face at z = 0, inner face at z = -t. */
function leafBuilt(o: P & { rating: FireRating; w: number; h: number; t: number; dir: 1 | -1; active: boolean; mat: MatKey; sliding?: boolean }): Built {
  const k = new Kit()
  const M = furnitureMats()
  const { w: lw, h, t, dir } = o
  const blast = o.kind === 'blast'
  const X = (x: number) => dir * x
  const x0 = 0.003
  const y0 = 0.008
  const zc = -t / 2
  // vision panel: A60 type-approved glazing, laminated for blast
  const vis = o.visionPanel
  const vw = Math.min(blast ? 0.2 : 0.3, lw * 0.4)
  const vy0 = blast ? 1.35 : 1.25
  const vy1 = Math.min(h - 0.25, vy0 + (blast ? 0.3 : 0.55))
  const vc = x0 + lw / 2
  const piece = (a: number, b: number, ya: number, yb: number) => k.box(o.mat, [b - a, yb - ya, t], [X((a + b) / 2), (ya + yb) / 2, zc])
  if (vis) {
    piece(x0, x0 + lw, y0, vy0)
    piece(x0, x0 + lw, vy1, h)
    piece(x0, vc - vw / 2, vy0, vy1)
    piece(vc + vw / 2, x0 + lw, vy0, vy1)
    k.box('glass', [vw, vy1 - vy0, Math.min(0.03, t * 0.5)], [X(vc), (vy0 + vy1) / 2, zc])
    for (const zz of [0.004, -t - 0.004]) {
      const bw = blast ? 0.04 : 0.02
      for (const yy of [vy0, vy1]) k.box('stainless', [vw + 2 * bw, bw, 0.008], [X(vc), yy, zz])
      for (const s of [-1, 1]) k.box('stainless', [bw, vy1 - vy0 + 2 * bw, 0.008], [X(vc + s * (vw / 2 + bw / 2 - bw / 2)), (vy0 + vy1) / 2, zz])
      if (blast) for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        k.cyl('nut', 0.007, 0.012, [X(vc + Math.cos(a) * (vw / 2 + 0.02)), (vy0 + vy1) / 2 + Math.sin(a) * ((vy1 - vy0) / 2 + 0.02), zz + Math.sign(zz) * 0.006], 'z', 6)
      }
    }
  } else piece(x0, x0 + lw, y0, h)
  // kick plates
  for (const zz of [0.0025, -t - 0.0025]) k.box('stainless', [lw - 0.04, 0.25, 0.003], [X(vc), y0 + 0.135, zz])
  // fire door signage, rating plate on the outer face
  if (o.rating !== 'none' && !o.sliding) k.plane(labelMaterial(blast ? 'BLAST DOOR · KEEP SHUT' : 'FIRE DOOR · KEEP SHUT', '#1f4e9a', '#ffffff', 512, 96), Math.min(0.3, lw * 0.5), Math.min(0.3, lw * 0.5) * 0.1875, [X(vc), vis ? vy0 - 0.12 : 1.55, 0.0012])

  const zi = -t // push (inner) face
  const hx = lw - 0.075 // handle position from the hinge line
  if (o.sliding) {
    // flush pull on both faces, hangers to the track
    k.rbox('stainless', [0.03, 0.4, 0.04], 0.01, [X(hx), 1.05, 0.025])
    k.box(M.bezel, [0.03, 0.2, 0.004], [X(hx), 1.05, zi - 0.0015])
    for (const f of [0.15, lw - 0.15]) {
      k.box('aluminium', [0.08, 0.1, 0.012], [X(f), h + 0.03, zc])
      k.cyl('rubberBlack', 0.025, 0.02, [X(f), h + 0.08, zc + 0.01], 'z', 14)
    }
    return k.build()
  }
  if (o.active) {
    // lever furniture on the pull side
    const lever = (zz: number, s: number) => {
      k.cyl('stainless', 0.026, 0.012, [X(hx), 1.05, zz + s * 0.006], 'z', 20)
      k.rod('stainless', [X(hx), 1.05, zz + s * 0.012], [X(hx), 1.05, zz + s * 0.06], 0.009, 10)
      k.rod('stainless', [X(hx), 1.05, zz + s * 0.06], [X(hx - 0.13), 1.05, zz + s * 0.065], 0.01, 10)
      k.rbox('stainless', [0.04, 0.09, 0.008], 0.004, [X(hx), 0.95, zz + s * 0.004])
      k.cyl('brass', 0.011, 0.012, [X(hx), 0.95, zz + s * 0.01], 'z', 12)
    }
    lever(0, 1)
    if (blast) {
      // multi-point locking: centre gearbox with dog lever, rods to top and bottom keepers
      k.rbox(M.housing, [0.14, 0.24, 0.05], 0.01, [X(hx - 0.04), 1.05, zi - 0.025])
      k.rod('actuatorRed', [X(hx - 0.04), 1.05, zi - 0.06], [X(hx - 0.3), 1.12, zi - 0.07], 0.016, 10)
      for (const [ya, yb] of [[1.17, h - 0.05], [0.93, 0.05]] as const) {
        k.rod('galvanised', [X(hx - 0.04), ya, zi - 0.02], [X(hx - 0.04), yb, zi - 0.02], 0.012, 8)
        k.box(M.housing, [0.06, 0.04, 0.04], [X(hx - 0.04), yb + (yb > 1 ? -0.02 : 0.02), zi - 0.02])
      }
      for (const y of [0.4, 1.7]) {
        k.rod('galvanised', [X(hx - 0.04), y, zi - 0.02], [X(lw - 0.01), y, zi - 0.02], 0.01, 8)
        k.box(M.housing, [0.05, 0.05, 0.03], [X(hx + 0.02), y, zi - 0.02])
      }
    } else if (o.hardware === 'panic') {
      // push bar across the push face with end housings
      const a = 0.09
      const b = lw - 0.05
      k.rbox(M.alu, [b - a, 0.07, 0.05], 0.015, [X((a + b) / 2), 0.98, zi - 0.045])
      k.rbox('stainless', [b - a - 0.1, 0.05, 0.03], 0.012, [X((a + b) / 2 - 0.02), 0.98, zi - 0.085])
      k.rbox(M.housing, [0.1, 0.12, 0.07], 0.01, [X(b - 0.04), 0.98, zi - 0.035])
      k.rbox(M.housing, [0.06, 0.1, 0.06], 0.01, [X(a + 0.02), 0.98, zi - 0.03])
    } else lever(zi, -1)
  } else {
    // passive leaf: flush bolts on the meeting edge
    for (const y of [0.15, h - 0.15]) k.box('stainless', [0.02, 0.18, 0.004], [X(lw - 0.02), y, zi - 0.002])
  }
  // overhead closer body on the push face near the hinge
  k.rbox(M.housing, [0.28, 0.065, 0.055], 0.012, [X(0.25), h - 0.08, zi - 0.0275])
  k.box(M.alu, [0.012, 0.012, 0.08], [X(0.38), h - 0.05, zi - 0.04], eul(0, dir * 0.4, 0))
  // astragal on the active leaf of a pair
  if (o.kind === 'double' && o.active) k.box(o.mat, [0.04, h - 0.02, 0.006], [X(lw + 0.012), h / 2, 0.003])
  return k.build()
}

/** Roller-shutter curtain of interlocking slats between the guides, rolled up by `open`. */
function curtainBuilt(W: number, H: number, open: number, zf: number): Built {
  const k = new Kit()
  const yb = Math.min(H - 0.02, open * H)
  const h = H + 0.04 - yb
  const g = new THREE.PlaneGeometry(W + 0.06, h)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * (h / 0.075))
  k.add(slatMaterial(), g, new THREE.Matrix4().makeTranslation(0, yb + h / 2, zf + 0.055))
  k.add(slatMaterial(), g.clone(), new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, yb + h / 2, zf + 0.045))
  k.box('aluminium', [W + 0.06, 0.06, 0.04], [0, yb + 0.03, zf + 0.05])
  k.box('rubberBlack', [W + 0.04, 0.012, 0.025], [0, yb + 0.006, zf + 0.05])
  return k.build()
}
