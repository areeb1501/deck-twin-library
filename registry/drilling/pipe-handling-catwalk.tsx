// Pipe-handling catwalk machine with V-door ramp: trough and skate, pipe-rack bays with indexers, hydraulic kicker arms, drill pipe joints (API 5DP / API 7K).
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { checkerPlate, junctionBox, member, tagPlate } from '../lib/parts'
import { inch } from '../lib/standards'

export interface PipeHandlingCatwalkProps {
  /** catwalk length, m */
  length?: number
  /** drill floor height above the catwalk deck level, m */
  floorHeight?: number
  /** joints on each pipe rack */
  joints?: number
  /** drill pipe OD, inches */
  pipeOd?: number
  /** kicker arm stroke, 0 parked … 1 fully raised */
  kick?: number
  color?: string
  tag?: string
}

export const defaults = { length: 13.5, floorHeight: 6, joints: 4, pipeOd: 5, kick: 0.35, color: '#d9a21b', tag: 'CW-01' }

type P = typeof defaults

export function PipeHandlingCatwalk({ length = defaults.length, floorHeight = defaults.floorHeight, joints = defaults.joints, pipeOd = defaults.pipeOd, kick = defaults.kick, color = defaults.color, tag = defaults.tag, ...group }: PipeHandlingCatwalkProps & GroupProps) {
  const out = useMemo(() => build({ length, floorHeight, joints, pipeOd, kick, color, tag }), [length, floorHeight, joints, pipeOd, color, tag, kick])
  useEffect(() => () => [out.built, out.arm].forEach((b) => b.geometry.dispose()), [out])
  const a = Math.max(0, Math.min(1, kick)) * 0.55
  return (
    <group {...group}>
      <KitMesh data={out.built} />
      {out.arms.map((p, i) => (
        <group key={i} position={p.pos} rotation={[p.side * a, 0, 0]} scale={[1, 1, p.side]}>
          <KitMesh data={out.arm} />
        </group>
      ))}
    </group>
  )
}

export default PipeHandlingCatwalk

/** Drill pipe joint along +X from x0: tube with pin and box tool-joint upsets and hardbanding. */
function joint(k: Kit, x0: number, len: number, c: [number, number], od: number, mat: MatKey) {
  const r = od / 2
  const tj = Math.max(r * 1.32, r + 0.02)
  const [y, z] = c
  k.lathe(mat, [[r * 0.82, 0], [tj * 0.85, 0], [tj, 0.03], [tj, 0.24], [r * 1.05, 0.32], [r, 0.36], [r, len - 0.5], [r * 1.05, len - 0.46], [tj, len - 0.38], [tj, len - 0.03], [tj * 0.75, len], [r * 0.6, len + 0.1], [r * 0.45, len + 0.12]], [x0, y, z], 'x', 24)
  k.lathe('pipeBore', [[r * 0.8, 0.001], [0, 0.001]], [x0, y, z], '-x', 16)
  for (const xx of [0.06, len - 0.2]) k.cyl('machined', tj + 0.001, 0.08, [x0 + xx + 0.04, y, z], 'x', 24)
  // thread protectors
  k.cyl('actuatorBlue', tj * 1.02, 0.12, [x0 - 0.05, y, z], 'x', 20)
  k.cyl('actuatorBlue', r * 0.7, 0.14, [x0 + len + 0.12, y, z], 'x', 16)
}

function build(p: P) {
  const k = new Kit()
  const C: MatKey = paint(p.color)
  const PIPE: MatKey = paint('#3d4e5c', { metalness: 0.5, roughness: 0.45 })
  const L = Math.max(10, p.length)
  const W = 1.5
  const yD = 1.05 // catwalk deck height, typical
  const od = inch(Math.max(2.375, Math.min(6.625, p.pipeOd)))
  const jl = Math.min(L - 1.2, 9.45) // range 2 joint
  const nj = Math.max(0, Math.min(8, Math.round(p.joints)))

  // catwalk body: side beams, cross members, legs on base runners, checker-plate deck either side of the trough
  for (const s of [-1, 1]) {
    member(k, [-L / 2, yD - 0.2, s * (W / 2 - 0.1)], [L / 2, yD - 0.2, s * (W / 2 - 0.1)], 'HEB 400', C)
    member(k, [-L / 2, 0.1, s * (W / 2 - 0.1)], [L / 2, 0.1, s * (W / 2 - 0.1)], 'HEB 200', C)
  }
  const nl = Math.round(L / 2.2)
  for (let i = 0; i <= nl; i++) {
    const x = -L / 2 + 0.2 + ((L - 0.4) * i) / nl
    for (const s of [-1, 1]) member(k, [x, 0.2, s * (W / 2 - 0.1)], [x, yD - 0.4, s * (W / 2 - 0.1)], 'HEB 200', C)
    member(k, [x, yD - 0.25, -W / 2 + 0.2], [x, yD - 0.25, W / 2 - 0.2], 'IPE 200', C)
    member(k, [x, 0.1, -W / 2 + 0.2], [x, 0.1, W / 2 - 0.2], 'IPE 200', C)
  }
  for (const s of [-1, 1]) checkerPlate(k, [0, yD, s * (W / 2 - 0.25)], L, 0.5)
  // V trough with wear strips, and the skate (pipe pusher) on its rails
  const yT = yD - 0.12
  for (const s of [-1, 1]) {
    k.box(C, [L, 0.012, 0.32], [0, yT + 0.06, s * 0.13], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -s * 0.45))
    k.box('rubberBlack', [L, 0.01, 0.04], [0, yT + 0.035, s * 0.07], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -s * 0.45))
  }
  const xs = -L / 2 + 0.9
  k.rbox('actuatorYellow', [0.6, 0.3, 0.4], 0.03, [xs, yT + 0.2, 0])
  k.box('nut', [0.04, 0.35, 0.3], [xs + 0.32, yT + 0.25, 0])
  for (const s of [-1, 1]) k.cyl('rubberBlack', 0.07, 0.06, [xs, yT + 0.08, s * 0.24], 'z', 16)
  // drive chain run in the trough bottom
  k.box('nut', [L - 1, 0.02, 0.03], [0, yT + 0.01, 0])

  // pipe-rack bays either side: rack beams on stands, stops, indexer fingers, joints of drill pipe
  const rackX = [-jl / 2 + 0.9, 0, jl / 2 - 0.9]
  const rw = 2.6
  const yR = yD - 0.05
  for (const s of [-1, 1]) {
    for (const x of rackX) {
      const z0 = s * (W / 2)
      const z1 = s * (W / 2 + rw)
      member(k, [x, yR - 0.15, z0], [x, yR - 0.15 + 0.04, z1], 'HEB 300', 'structSteelDark')
      for (const z of [z1 - s * 0.2, z0 + s * 1.2]) {
        k.box('structSteelDark', [0.2, yR - 0.33, 0.2], [x, (yR - 0.3 + 0.03) / 2, z])
        k.box('structSteelDark', [0.4, 0.03, 0.4], [x, 0.015, z])
      }
      k.box('safetyYellow', [0.3, 0.25, 0.03], [x, yR + 0.12, z1])
      // indexer finger at the inner end
      k.box('actuatorYellow', [0.08, 0.12, 0.18], [x, yR + 0.06, z0 + s * 0.25])
      k.cyl('stainless', 0.025, 0.25, [x - 0.1, yR - 0.1, z0 + s * 0.25], 'y', 10)
    }
    for (let j = 0; j < nj; j++) {
      const z = s * (W / 2 + rw - 0.22 - j * (od * 1.4 + 0.03))
      const tj = Math.max((od / 2) * 1.32, od / 2 + 0.02)
      joint(k, -jl / 2, jl, [yR + tj, z], od, PIPE)
    }
  }
  // joint waiting in the trough
  joint(k, xs + 0.36, jl * 0.98, [yT + 0.13, 0], od, PIPE)

  // V-door ramp (pipe slide) from the catwalk end up to the drill floor, with wear plate, side guides and a mid support
  const H = Math.max(2.5, p.floorHeight)
  const ang = (36 * Math.PI) / 180
  const run = (H - yD) / Math.tan(ang)
  const x0 = L / 2
  const x1 = x0 + run
  const len = Math.hypot(run, H - yD)
  const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang)
  const mid: V3 = [(x0 + x1) / 2, (yD + H) / 2, 0]
  k.with(new THREE.Matrix4().compose(new THREE.Vector3(...mid), qr, new THREE.Vector3(1, 1, 1)), () => {
    k.box(C, [len, 0.02, 0.9], [0, -0.01, 0])
    k.box('stainless', [len, 0.006, 0.5], [0, 0.003, 0])
    for (const s of [-1, 1]) {
      k.box(C, [len, 0.3, 0.02], [0, 0.13, s * 0.46])
      member(k, [-len / 2, -0.14, s * 0.4], [len / 2, -0.14, s * 0.4], 'UPN 200', C)
    }
    for (let i = 0; i <= Math.round(len / 1.5); i++) k.box(C, [0.08, 0.2, 0.8], [-len / 2 + 0.1 + ((len - 0.2) * i) / Math.round(len / 1.5), -0.12, 0])
  })
  for (const s of [-1, 1]) {
    const xm = x0 + run * 0.45
    member(k, [xm, 0, s * 0.4], [xm, yD + (H - yD) * 0.45 - 0.3, s * 0.4], 'HEB 200', C)
    k.box(C, [0.4, 0.03, 0.4], [xm, 0.015, s * 0.4])
  }
  // drill floor edge at the V-door: landing beam on a column, hook plates, toe board and V-door posts
  member(k, [x1 + 0.05, H - 0.2, -1.4], [x1 + 0.05, H - 0.2, 1.4], 'HEB 400', 'structSteelDark')
  member(k, [x1 + 0.05, 0, 0], [x1 + 0.05, H - 0.4, 0], 'HEB 400', 'structSteelDark')
  k.box('structSteelDark', [0.6, 0.03, 0.6], [x1 + 0.05, 0.015, 0])
  checkerPlate(k, [x1 + 0.8, H, 0], 1.5, 3)
  k.box('structSteelDark', [1.5, 0.3, 3], [x1 + 0.8, H - 0.15, 0])
  for (const s of [-1, 1]) {
    k.box(C, [0.12, 0.12, 0.1], [x1 - 0.02, H + 0.02, s * 0.35])
    k.box('safetyYellow', [0.25, 2.2, 0.25], [x1 + 0.2, H + 1.1, s * 0.85])
  }

  // control console at the -X end, hydraulic power hoses
  const xc = -L / 2 - 0.5
  k.box('structSteelDark', [0.6, 0.03, 0.8], [xc, 0.015, 0])
  k.rbox('stainless', [0.5, 1.0, 0.6], 0.03, [xc, 0.55, 0])
  k.box('stainless', [0.5, 0.06, 0.65], [xc, 1.1, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.3))
  for (let i = 0; i < 4; i++) k.rod('actuatorRed', [xc + 0.05, 1.15, -0.2 + i * 0.13], [xc + 0.08, 1.3, -0.2 + i * 0.13], 0.01, 6)
  junctionBox(k, [xc - 0.25, 0.7, 0], '-x', [0.25, 0.25, 0.12])
  for (const s of [-1, 1]) k.spline('rubberBlack', [[xc + 0.25, 0.3, s * 0.15], [xc + 0.6, 0.15, s * 0.3], [-L / 2 + 0.5, 0.25, s * 0.5]], 0.018, 8, 20)
  tagPlate(k, p.tag, [0, yD - 0.25, W / 2 + 0.002], 'z', 0.3)

  // kicker arm (built about its pivot on the catwalk edge, lifting towards -Z; mirrored for the other side)
  const a = new Kit()
  a.rbox('actuatorYellow', [0.14, 0.08, 0.95], 0.02, [0, 0.0, -0.45], undefined)
  a.box('actuatorYellow', [0.14, 0.14, 0.08], [0, 0.06, -0.92])
  a.cyl('stainless', 0.045, 0.2, [0, 0, 0], 'x', 16)
  a.cyl('actuatorYellow', 0.06, 0.4, [0, -0.25, -0.3], [0, 1, -0.6], 16)
  const arms = rackX.flatMap((x) => [-1, 1].map((side) => ({ pos: [x + 0.2, yD + 0.02, side * (W / 2 - 0.1)] as V3, side })))
  // the arm's local -Z points out to the rack; mirror for the +Z side
  return { built: k.build(), arm: a.build(), arms: arms.map((r) => ({ ...r, side: -r.side })) }
}
