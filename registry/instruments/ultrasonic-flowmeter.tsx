// Multipath ultrasonic flowmeter: forged spoolpiece with chordal transducer pairs under a stainless shroud, Pm tap and a top-mounted electronics enclosure. ISO 17089-1, AGA 9, ASME B16.5.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { SS, exHead, tag as tagPlate, flange, segFor, valveHandle } from './_parts'

export interface UltrasonicFlowmeterProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** acoustic paths (transducer pairs) */
  paths?: 2 | 4 | 6
  /** stainless cover band over the transducers */
  shroud?: boolean
  housing?: MatKey
  tag?: string
}

export const defaults = { nps: 8, rating: 600 as Rating, paths: 4 as 2 | 4 | 6, shroud: true, housing: 'equipmentPaintDark' as MatKey, tag: 'FT-2501' }

type P = typeof defaults

// Gauss-Jacobi chord heights (fraction of bore radius)
const CHORDS: Record<number, number[]> = { 2: [-0.5, 0.5], 4: [-0.809, -0.309, 0.309, 0.809], 6: [-0.866, -0.5, -0.17, 0.17, 0.5, 0.866] }

function dims(p: P) {
  const D = pipeOD(p.nps)
  const f = flangeDims(p.nps, p.rating)
  const endL = f.hubLength + f.raisedFaceHeight
  const L = 3 * D + 2 * endL // typical 3D body
  const Rb = (D / 2) * 1.28
  const Ri = D / 2 - pipeWall(p.nps, '80')
  return { D, f, endL, L, Rb, Ri }
}

export function ports(props: UltrasonicFlowmeterProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const { L } = dims(p)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], p.nps, p.rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], p.nps, p.rating)]
}

export function UltrasonicFlowmeter(props: UltrasonicFlowmeterProps & GroupProps) {
  const { nps, rating, paths, shroud, housing, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, paths, shroud, housing, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default UltrasonicFlowmeter

function build(k: Kit, p: P) {
  const { D, endL, L, Rb, Ri } = dims(p)
  const xb = L / 2 - endL
  for (const s of [-1, 1]) flange(k, p.nps, p.rating, [(s * L) / 2, 0, 0], s > 0 ? 'x' : '-x')
  // forged body: hubs blend into a thick centre section
  k.lathe('equipmentPaint', [[D / 2, -xb], [D / 2 * 1.06, -xb + 0.01], [Rb, -xb + D * 0.45], [Rb, xb - D * 0.45], [D / 2 * 1.06, xb - 0.01], [D / 2, xb]], [0, 0, 0], 'x', segFor(2 * Rb))
  k.lathe('pipeBore', [[Ri, xb], [Ri, -xb]], [0, 0, 0], 'x', segFor(2 * Ri))

  // chordal transducer pairs crossing at 45°, alternating sides
  const conduits: V3[] = []
  const chords = CHORDS[p.paths] ?? CHORDS[4]
  chords.forEach((c, i) => {
    const h = c * Ri
    const zc = Math.sqrt(Ri * Ri - h * h)
    const side = i % 2 === 0 ? 1 : -1
    for (const e of [-1, 1]) {
      const a = new THREE.Vector3(e * zc, h, side * e * zc * -1)
      // boss axis follows the path direction outward from the bore wall
      const dir = new THREE.Vector3(e, 0, Math.sign(a.z)).normalize()
      // march out until clear of the body, then stand proud by 30 mm
      let reach = 0
      while (reach < 0.6 && Math.hypot(a.y + dir.y * reach, a.z + dir.z * reach) < Rb) reach += 0.002
      reach += 0.03
      const tip = a.clone().addScaledVector(dir, reach)
      k.rod(SS, a.toArray() as V3, tip.toArray() as V3, 0.022, 16)
      k.hex(SS, 0.05, 0.022, tip.clone().addScaledVector(dir, 0.006).toArray() as V3, dir.toArray() as V3)
      const cap = tip.clone().addScaledVector(dir, 0.03)
      k.cyl(SS, 0.016, 0.03, cap.toArray() as V3, dir.toArray() as V3, 12)
      conduits.push(cap.clone().addScaledVector(dir, 0.016).toArray() as V3)
    }
  })

  let X = 0
  let Rs = Rb
  for (const c of conduits) {
    X = Math.max(X, Math.abs(c[0]))
    Rs = Math.max(Rs, Math.hypot(c[1], c[2]))
  }
  X += 0.03
  Rs += 0.02
  if (p.shroud) {
    // stainless transducer shroud (cover band) enclosing all transducers and their cabling
    k.lathe(SS, [[Rb - 0.002, -X], [Rs, -X], [Rs, X], [Rb - 0.002, X]], [0, 0, 0], 'x', segFor(2 * Rs))
    for (const s of [-1, 1]) k.torus(SS, Rs, 0.004, [s * X, 0, 0], 'x', 6, segFor(2 * Rs))
    for (let a = 0; a < 6; a++) k.hex('nut', 0.012, 0.006, [((a % 3) - 1) * X * 0.6, Rs * Math.cos(Math.PI / 4), (a < 3 ? 1 : -1) * Rs * Math.sin(Math.PI / 4)], [0, Math.cos(Math.PI / 4), (a < 3 ? 1 : -1) * Math.sin(Math.PI / 4)])
  }

  // electronics: enclosure base on a pedestal, Ex d head
  const yPed = Math.max(Rb + 0.09, (p.shroud ? Rs : Rb) + 0.05)
  k.cyl('equipmentPaint', 0.045, yPed - Rb + 0.02, [0, (Rb + yPed) / 2 - 0.01, 0], 'y', 24)
  const jb: V3 = [0, yPed + 0.07, 0]
  k.rbox(p.housing, [0.26, 0.14, 0.16], 0.02, jb)
  k.rbox(p.housing, [0.24, 0.12, 0.012], 0.006, [0, jb[1], 0.086])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.012, 0.006, [sx * 0.11, jb[1] + sy * 0.05, 0.095], 'z')
  exHead(k, [0, jb[1] + 0.07 + 0.011 + 0.048 - 0.004, 0], p.housing)
  if (p.shroud) {
    // one flexible conduit from the shroud to the enclosure base
    for (const gz of [-0.05, 0.05]) {
      k.hex('brass', 0.022, 0.012, [0.09, jb[1] - 0.076, gz], 'y')
      k.spline('cable', [[0.09, jb[1] - 0.082, gz], [0.11, (Rs + jb[1] - 0.08) / 2, gz * 1.4], [0.13, Rs + 0.004, gz * 0.6]], 0.009, 8, 24)
      k.cyl(SS, 0.016, 0.01, [0.13, Rs + 0.002, gz * 0.6], 'y', 12)
    }
  } else {
    // conduits run from each transducer round the body surface to a gland under the enclosure
    conduits.forEach((c) => {
      const gz = c[2] > 0 ? 0.05 : -0.05
      const gx = Math.max(-0.11, Math.min(0.11, c[0]))
      const g: V3 = [gx, jb[1] - 0.07, gz]
      k.hex('brass', 0.022, 0.012, [g[0], g[1] - 0.006, g[2]], 'y')
      const t0 = Math.atan2(c[1], c[2])
      const t1 = Math.atan2(Rb, gz * 2)
      const Rr = Rb + 0.035
      const pts: V3[] = [c]
      for (let j = 0; j <= 4; j++) {
        const t = t0 + ((t1 - t0) * j) / 4
        pts.push([c[0] + (gx - c[0]) * (j / 4) * 0.6, Rr * Math.sin(t), Rr * Math.cos(t)])
      }
      pts.push([gx, g[1] - 0.05, gz], [g[0], g[1] - 0.012, g[2]])
      k.spline('cable', pts, 0.007, 6, 48)
    })
  }
  tagPlate(k, p.tag, [0, jb[1] - 0.025, 0.093], 'z', 0.1)
  // pressure (Pm) tap on the body top, upstream of the shroud: boss, needle valve, plug
  const xp = -Math.min(X + 0.03, xb - D * 0.5)
  k.cyl('equipmentPaint', 0.016, 0.02, [xp, Rb + 0.008, 0], 'y', 16)
  k.box(SS, [0.032, 0.04, 0.032], [xp, Rb + 0.038, 0])
  valveHandle(k, [xp, Rb + 0.042, 0.016], [0, 0, 1], 'handwheel', 0.85)
  k.hex(SS, 0.024, 0.012, [xp, Rb + 0.064, 0])
  // lifting lugs welded to the body clear of the shroud
  for (const s of [-1, 1]) {
    const xl = s * Math.min(X + 0.045, xb - D * 0.46)
    k.box('equipmentPaint', [0.02, 0.07, 0.07], [xl, Rb + 0.02, s > 0 ? 0 : -0.06])
    k.torus('pipeBore', 0.014, 0.003, [xl, Rb + 0.035, s > 0 ? 0 : -0.06], 'x', 6, 16)
  }
}
