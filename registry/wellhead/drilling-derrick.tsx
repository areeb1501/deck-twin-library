// Platform drilling rig: substructure and drill floor, lattice derrick with V-door, racking board, crown block, travelling block + top drive, drawworks, doghouse, pipe ramp. API 4F / API 8C.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { checkerPlate, grating, handrail, ladder, member, tagPlate } from '../lib/parts'
import { textMaterial } from '../lib/textures'

export interface DrillingDerrickProps {
  /** derrick height above the drill floor, m */
  height?: number
  /** square drill floor side, m */
  floorSize?: number
  /** drill floor above the deck (substructure height), m */
  floorHeight?: number
  /** top-drive gearbox height above the drill floor, m */
  topDrive?: number
  /** stands racked in the setback */
  stands?: number
  tag?: string
}

export const defaults = { height: 43, floorSize: 13, floorHeight: 8, topDrive: 15, stands: 24, tag: 'DR-100' }

type P = typeof defaults

const WHITE = paint('#e4e2da', { metalness: 0.2, roughness: 0.55 })
const NAV = paint('#ff2a1a', { emissive: '#ff2a1a', emissiveIntensity: 1.6, roughness: 0.3 })

function dims(p: P) {
  const H = Math.max(20, p.height)
  const S = Math.max(8, p.floorSize)
  const F = Math.max(3, p.floorHeight)
  const b0 = Math.min(S * 0.35, 4.5)
  const b1 = Math.max(0.9, b0 * 0.31)
  const bays = Math.max(6, Math.round(H / 3.6))
  const dw = (h: number) => b0 + ((b1 - b0) * h) / H
  const leg = (sx: number, sz: number, h: number): V3 => [sx * dw(h), F + h, sz * dw(h)]
  const td = THREE.MathUtils.clamp(p.topDrive, 3, H - 9)
  return { H, S, F, b0, b1, bays, dw, leg, td, monkey: H * 0.63 }
}

export function DrillingDerrick(props: DrillingDerrickProps & GroupProps) {
  const { height, floorSize, floorHeight, topDrive, stands, tag, ...group } = { ...defaults, ...props }
  const p = { height, floorSize, floorHeight, topDrive, stands, tag } as P
  const D = dims(p)
  const data = useKit((k) => build(k, p), [height, floorSize, floorHeight, stands, tag])
  const hose = useKit((k) => buildHose(k, p), [height, floorSize, floorHeight, topDrive])
  const block = useKit((k) => buildTravelling(k), [])
  const falls = useKit((k) => buildFalls(k), [])
  const crownY = D.F + D.H + 1.0
  const yTD = D.F + D.td
  const drop = crownY - (yTD + 5.5)
  return (
    <group {...group}>
      <KitMesh data={data} />
      <KitMesh data={hose} />
      <group position={[0, yTD, 0]}>
        <KitMesh data={block} />
      </group>
      <group position={[0, crownY, 0]} scale={[1, drop, 1]}>
        <KitMesh data={falls} shadows={false} />
      </group>
    </group>
  )
}

export default DrillingDerrick

/** Travelling block, hook, bails, top drive (frame, motor, gearbox, gooseneck), guide dolly. Origin: gearbox bottom on the well axis. */
function buildTravelling(k: Kit) {
  const yB = 5.0
  k.cyl('actuatorYellow', 0.58, 1.3, [0, yB, 0], 'z', 28)
  for (const s of [-1, 1]) k.box('actuatorYellow', [1.24, 1.5, 0.1], [0, yB - 0.14, s * 0.7])
  k.cyl('nut', 0.1, 1.6, [0, yB, 0], 'z', 12)
  k.box('actuatorYellow', [0.7, 0.65, 0.6], [0, yB - 0.95, 0])
  k.torus('nut', 0.22, 0.06, [0, yB - 1.45, 0], 'z', 8, 20, Math.PI)
  for (const s of [-1, 1]) k.rod('nut', [s * 0.25, yB - 1.3, 0], [s * 0.35, 2.3, 0], 0.045, 8)
  k.rbox(WHITE, [1.2, 1.8, 1.1], 0.05, [0, 1.45, 0])
  k.cyl('motorPaint', 0.36, 1.7, [0.15, 1.85, 0.85], 'y', 20)
  k.cyl('motorPaint', 0.24, 0.15, [0.15, 2.78, 0.85], 'y', 16)
  k.box('nut', [1.0, 0.55, 1.0], [0, 0.275, 0])
  k.tube('nut', [[0.3, 2.35, -0.2], [0.3, 3.1, -0.2], [0.3, 3.3, -0.7]], 0.09, 10, 0.25)
  for (const s of [-1, 1]) k.rod('nut', [s * 0.35, 0.2, 0], [s * 0.22, -2.4, 0], 0.05, 8)
  k.box('actuatorYellow', [0.7, 0.3, 0.5], [0, -2.5, 0])
  // quill, IBOPs, saver sub
  k.cyl('nut', 0.11, 0.6, [0, -0.3, 0], 'y', 12)
  for (const y of [-0.36, -0.16]) k.cyl('nut', 0.14, 0.12, [0, y, 0], 'y', 12)
  k.box('actuatorYellow', [0.1, 0.36, 0.08], [0.17, -0.26, 0])
  // guide dolly on the rails (-X)
  k.box('nut', [0.6, 1.8, 0.9], [-0.9, 1.3, 0])
  // stand in the elevator, down to the rotary
  k.cyl('nut', 0.064, 3.0, [0, -2.0, 0], 'y', 10)
}

/** 8 drill-line falls from the crown (y = 0) to the block (y = -1); the group scales them by the drop. */
function buildFalls(k: Kit) {
  for (let i = 0; i < 8; i++) {
    const z = -0.63 + i * 0.18
    const s = i % 2 ? 1 : -1
    k.rod('cable', [s * 0.78, 0, z], [s * 0.5, -1, z], 0.022, 5)
  }
}

function build(k: Kit, p: P) {
  const D = dims(p)
  const { H, S, F, bays, dw, leg } = D
  const h2 = S / 2

  // ---------------------------------------------------------------- substructure
  for (const s of [-1, 1]) {
    member(k, [-h2 - 0.6, 0.45, s * (h2 - 0.6)], [h2 + 1.2, 0.45, s * (h2 - 0.6)], 'HEB 900', 'structSteelDark')
    for (const x of [-h2 - 0.7, h2 + 1.3]) k.box('actuatorYellow', [0.3, 0.35, 1.0], [x, 1.07, s * (h2 - 0.6)])
  }
  const xs = [-h2 + 0.2, -h2 / 3, h2 / 3, h2 - 0.2]
  const zs = [-h2 + 0.2, -h2 + 1.6, h2 - 1.6, h2 - 0.2]
  const yb = 0.9
  const yt = F - 0.9
  const ym = (yb + yt) / 2
  for (const x of xs) for (const z of zs) member(k, [x, yb, z], [x, yt, z], 'HEB 360', 'structSteel')
  for (const z of zs) {
    member(k, [xs[0], ym, z], [xs[3], ym, z], 'HEB 260', 'structSteel')
    member(k, [-h2, F - 0.48, z], [h2, F - 0.48, z], 'HEB 800', 'structSteel')
  }
  for (const z of [zs[0], zs[3]])
    for (let i = 0; i < xs.length - 1; i++)
      for (const [y0, y1] of [[yb, ym], [ym, yt]]) {
        member(k, [xs[i], y0, z], [xs[i + 1], y1, z], 'CHS 168.3x8', 'structSteel')
        member(k, [xs[i + 1], y0, z], [xs[i], y1, z], 'CHS 168.3x8', 'structSteel')
      }
  for (const x of [xs[0], xs[3]])
    for (const [z0, z1] of [[zs[0], zs[1]], [zs[2], zs[3]]]) {
      member(k, [x, yb, z0], [x, yt, z1], 'CHS 168.3x8', 'structSteel')
      member(k, [x, yb, z1], [x, yt, z0], 'CHS 168.3x8', 'structSteel')
    }
  for (const x of [-h2 + 0.2, -1.3, 1.3, h2 - 0.2]) member(k, [x, F - 0.42, -h2], [x, F - 0.42, h2], 'HEB 700', 'structSteel', [0, 1, 0])
  // drill floor plate, rotary table, mousehole
  checkerPlate(k, [0, F, 0], S, S, 0.06)
  k.cyl('nut', 1.0, 0.5, [0, F + 0.2, 0], 'y', 40)
  k.cyl('machined', 0.75, 0.04, [0, F + 0.47, 0], 'y', 40)
  k.cyl('pipeBore', 0.32, 0.05, [0, F + 0.47, 0], 'y', 24)
  for (const s of [-1, 1]) k.box('actuatorYellow', [0.5, 0.06, 0.25], [s * 0.45, F + 0.5, 0])
  k.cyl('nut', 0.25, 0.08, [1.8, F + 0.04, 1.2], 'y', 20)
  k.cyl('pipeBore', 0.2, 0.09, [1.8, F + 0.04, 1.2], 'y', 20)
  // guard rail with openings at the V-door (+X) and the doghouse (+Z)
  const e = 0.05
  handrail(k, [[-h2 + e, F, -h2 + e], [h2 - e, F, -h2 + e], [h2 - e, F, -1.0]])
  handrail(k, [[h2 - e, F, 1.0], [h2 - e, F, h2 - e], [2.5, F, h2 - e]])
  handrail(k, [[-2.5, F, h2 - e], [-h2 + e, F, h2 - e], [-h2 + e, F, h2 - 2.5]])
  handrail(k, [[-h2 + e, F, h2 - 3.5], [-h2 + e, F, -h2 + e]])
  ladder(k, [-h2 - 0.4, 0, h2 - 3.0], F, [-1, 0, 0])
  // bell nipple and riser under the rotary, flowline to the shakers
  k.cyl('actuatorRed', 0.62, 1.2, [0, F - 1.8, 0], 'y', 28)
  k.pipe('pipePaint', [0, 0, 0], [0, F - 2.4, 0], 0.55, 0.02, 28)
  k.pipe('pipePaint', [0, F - 1.2, 0], [0, F - 0.1, 0], 0.68, 0.015, 28)
  k.tube('pipePaint', [[-0.3, F - 1.0, 0], [-1.2, F - 1.05, 0], [-h2 - 1.0, F - 2.2, 0.5]], 0.15, 12, 0.6)

  // ---------------------------------------------------------------- derrick
  const C: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const NRM: V3[] = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]]
  const dh = H / bays
  const vB = 3 // V-door bays on +X
  for (const [sx, sz] of C) {
    member(k, leg(sx, sz, 0), leg(sx, sz, H), 'SHS 400x400x16', WHITE)
    const q = leg(sx, sz, 0)
    k.box('structSteelDark', [1.0, 0.3, 1.0], [q[0], F + 0.15, q[2]])
    k.box(WHITE, [0.5, 0.9, 0.03], [q[0] - sx * 0.42, F + 0.75, q[2]])
    k.box(WHITE, [0.03, 0.9, 0.5], [q[0], F + 0.75, q[2] - sz * 0.42])
  }
  const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  for (let i = 0; i <= bays; i++) {
    const h0 = i * dh
    for (let f = 0; f < 4; f++) {
      const [ax, az] = C[f]
      const [bx, bz] = C[(f + 1) % 4]
      const vdoor = f === 1 && i < vB
      if (i > 0 && !vdoor) member(k, leg(ax, az, h0), leg(bx, bz, h0), 'UPN 200', WHITE, NRM[f])
      if (i === bays || vdoor) continue
      const A0 = leg(ax, az, h0)
      const B0 = leg(bx, bz, h0)
      const A1 = leg(ax, az, h0 + dh)
      const B1 = leg(bx, bz, h0 + dh)
      if (i < 4) {
        const m = i % 2 === 0 ? mid(A1, B1) : mid(A0, B0)
        member(k, i % 2 === 0 ? A0 : A1, m, 'L150x150x15', WHITE, NRM[f])
        member(k, i % 2 === 0 ? B0 : B1, m, 'L150x150x15', WHITE, NRM[f])
      } else {
        member(k, A0, B1, 'L120x120x12', WHITE, NRM[f])
        member(k, B0, A1, 'L120x120x12', WHITE, NRM[f])
      }
    }
    if (i > 0 && i < bays && i % 3 === 0)
      for (let f = 0; f < 4; f++) {
        const pa = leg(C[f][0], C[f][1], h0)
        const pb = leg(C[(f + 1) % 4][0], C[(f + 1) % 4][1], h0)
        const pc = leg(C[(f + 3) % 4][0], C[(f + 3) % 4][1], h0)
        member(k, [pa[0] + (pb[0] - pa[0]) * 0.35, pa[1], pa[2] + (pb[2] - pa[2]) * 0.35], [pa[0] + (pc[0] - pa[0]) * 0.35, pa[1], pa[2] + (pc[2] - pa[2]) * 0.35], 'SHS 100x100x6.3', WHITE)
      }
  }
  // V-door inverted-V frame
  const apex: V3 = [dw(vB * dh), F + vB * dh, 0]
  member(k, leg(1, -1, 0), apex, 'SHS 250x250x12.5', WHITE)
  member(k, leg(1, 1, 0), apex, 'SHS 250x250x12.5', WHITE)

  // racking (monkey) board with fingers and the derrickman's platform outside +X
  const yM = F + D.monkey
  const w = dw(D.monkey)
  member(k, [w, yM, -w], [w, yM, w], 'UPN 300', 'structSteel', [1, 0, 0])
  for (const s of [-1, 1]) member(k, [0.8, yM, s * (w - 0.05)], [w, yM, s * (w - 0.05)], 'UPN 260', 'structSteel')
  for (let j = 0; j < 6; j++) for (const s of [-1, 1]) member(k, [0.85, yM + 0.05, s * (0.56 + j * 0.3)], [w, yM + 0.05, s * (0.56 + j * 0.3)], 'SHS 100x100x6.3', 'actuatorYellow')
  grating(k, [w + 0.6, yM - 0.12, 0], 1.2, 2.6)
  handrail(k, [[w, yM - 0.12, -1.3], [w + 1.2, yM - 0.12, -1.3], [w + 1.2, yM - 0.12, 1.3], [w, yM - 0.12, 1.3]])
  // racked stands in the setback, leaning into the fingers
  const n = Math.max(0, Math.round(p.stands))
  for (let j = 0; j < n; j++) {
    const row = j % 2 ? 1 : -1
    const c = Math.floor(j / 2)
    const z = row * (0.4 + (c % 6) * 0.3 + 0.15)
    const x0 = 1.6 + Math.floor(c / 6) * 0.25
    k.rod('nut', [x0, F + 0.05, z * 0.9], [0.95 + Math.floor(c / 6) * 0.25, yM + 2.5, z], 0.064, 8)
  }
  k.box('rubberBlack', [1.2, 0.08, 4.0], [2.0, F + 0.04, 0])

  // crown: water table, sheave cluster, gin pole, rails, aviation lights
  const yc = F + H
  const hw = dw(H)
  k.box('structSteel', [2 * hw + 0.8, 0.6, 2 * hw + 0.8], [0, yc - 0.3, 0])
  grating(k, [0, yc + 0.03, 0], 2 * hw + 1.4, 2 * hw + 1.4)
  const r = hw + 0.65
  handrail(k, [[-r, yc + 0.03, -r], [r, yc + 0.03, -r], [r, yc + 0.03, r], [-r, yc + 0.03, r], [-r, yc + 0.03, -r + 0.6]])
  for (const s of [-1, 1]) k.box('structSteelDark', [2.2, 1.9, 0.16], [0, yc + 0.95, s * 0.95])
  k.cyl('actuatorYellow', 0.8, 1.7, [0, yc + 1.0, 0], 'z', 32)
  k.cyl('nut', 0.12, 1.9, [0, yc + 1.0, 0], 'z', 12)
  k.cyl('actuatorYellow', 0.45, 0.3, [-1.4, yc + 1.2, 0.6], 'z', 20)
  for (const s of [-1, 1]) member(k, [s * 1.5, yc + 0.03, 0], [0, yc + 4.6, 0], 'CHS 114.3x6.3', WHITE)
  member(k, [0, yc + 4.6, -0.3], [0, yc + 4.6, 0.3], 'CHS 114.3x6.3', WHITE)
  k.sphere(NAV, 0.22, [0, yc + 4.95, 0], undefined, 12)
  for (const [sx, sz] of C) {
    const q: V3 = [sx * (hw + 0.55), yc + 1.4, sz * (hw + 0.55)]
    k.rod('structSteelDark', [q[0], yc + 0.03, q[2]], [q[0], q[1] - 0.15, q[2]], 0.04, 6)
    k.sphere(NAV, 0.17, q, undefined, 10)
    const m = leg(sx, sz, H / 2)
    k.sphere(NAV, 0.16, [m[0] + sx * 0.3, m[1], m[2] + sz * 0.3], undefined, 10)
  }
  // derrick ladder with rest platforms up the -X,-Z leg
  ladder(k, [-D.b0 - 0.6, F, -D.b0], F + H * 0.5, [-1, 0, 0], { cage: true })

  // drill line: fast line to the drawworks drum, dead-line anchor
  const xd = -h2 + 1.8
  k.rod('cable', [-1.85, yc + 1.2, 0.6], [xd + 0.3, F + 1.75, 0.3], 0.028, 5)
  k.rod('cable', [-0.78, yc + 1.0, -0.75], [-0.9, F + 0.75, -3.9], 0.028, 5)
  k.box('structSteelDark', [0.7, 0.8, 0.7], [-0.9, F + 0.4, -3.9])
  // top-drive guide rails on the -X side, tied back to the derrick
  const xr = -1.3
  for (const s of [-1, 1]) member(k, [xr, F + 3, s * 0.35], [xr, F + H - 4.5, s * 0.35], 'HEB 200', 'structSteelDark', [1, 0, 0])
  for (let h = 6; h < H - 5; h += 7) member(k, [xr, F + h, 0], [-dw(h), F + h, 0], 'SHS 100x100x6.3', 'structSteelDark')

  // drawworks: skid, drum with drill line wraps, AC motors, disc brakes, guard
  k.box('structSteelDark', [2.0, 0.3, 3.4], [xd, F + 0.15, 0])
  k.cyl('nut', 0.55, 2.0, [xd, F + 1.0, 0], 'z', 32)
  for (let j = -6; j <= 6; j++) k.torus('cable', 0.57, 0.022, [xd, F + 1.0, j * 0.14], 'z', 5, 32)
  for (const s of [-1, 1]) {
    k.cyl('actuatorRed', 0.85, 0.08, [xd, F + 1.0, s * 1.08], 'z', 36)
    k.box('nut', [0.3, 0.4, 0.2], [xd + 0.7, F + 1.3, s * 1.1])
    k.cyl('motorPaint', 0.45, 1.0, [xd - 0.2, F + 0.75, s * 1.75], 'z', 24)
  }
  k.box('actuatorYellow', [1.6, 0.05, 2.0], [xd, F + 1.75, 0])
  // standpipe up the -X,+Z leg with gooseneck, rotary hose to the top drive
  const sp = (h: number): V3 => {
    const q = leg(-1, 1, h)
    return [q[0] + 0.35, q[1], q[2] - 0.35]
  }
  const hs = Math.min(14, H * 0.33)
  k.tube('nut', [[sp(0)[0], 0.9, sp(0)[2] + 0.2], [sp(0)[0], F + 0.4, sp(0)[2]], sp(hs), [sp(hs)[0] + 0.45, sp(hs)[1] + 0.85, sp(hs)[2] - 0.45]], 0.075, 10, 0.4)
  for (let h = 2; h < hs; h += 3) k.rod('structSteelDark', sp(h), leg(-1, 1, h), 0.04, 6)
  // doghouse (driller's cabin) on the +Z edge with windows facing the rotary
  const dx = -h2 + 2.2
  const dz = h2 - 1.6
  k.rbox('cladding', [4.0, 3.0, 2.8], 0.05, [dx, F + 1.5, dz])
  for (const j of [-1, 0, 1]) k.box('glass', [1.1, 1.0, 0.02], [dx + j * 1.25, F + 1.9, dz - 1.41])
  k.box('glass', [0.02, 0.9, 1.6], [dx + 2.01, F + 1.9, dz - 0.2])
  k.box('structSteelDark', [0.9, 2.1, 0.03], [dx + 1.3, F + 1.05, dz + 1.41])
  k.rbox('plasticGrey', [0.9, 0.6, 0.7], 0.04, [dx - 1.0, F + 3.3, dz])
  k.box(textMaterial("DRILLER'S CABIN", '#1f3e70', '#ffffff', 512, 96), [1.6, 0.3, 0.01], [dx, F + 2.75, dz - 1.41])
  tagPlate(k, p.tag, [dx + 1.3, F + 2.3, dz + 1.42], 'z', 0.35)

  // V-door pipe ramp down to the catwalk (+X)
  const rampL = Math.hypot(F - 1.1, F * 1.25)
  const ang = Math.atan2(F - 1.1, F * 1.25)
  const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -ang)
  k.box('safetyYellow', [rampL, 0.08, 1.2], [h2 + (F * 1.25) / 2, (F + 1.1) / 2, 0], rq)
  for (const s of [-1, 1]) k.box('safetyYellow', [rampL, 0.25, 0.08], [h2 + (F * 1.25) / 2, (F + 1.1) / 2 + 0.12, s * 0.6], rq)
  for (let i = 1; i < 4; i++) {
    const x = h2 + (F * 1.25 * i) / 4
    const y = F - ((F - 1.1) * i) / 4
    member(k, [x, 0, 0], [x, y - 0.1, 0], 'HEB 200', 'structSteel')
  }
  const cx0 = h2 + F * 1.25
  checkerPlate(k, [cx0 + 6, 1.1, 0], 12, 2.4)
  for (let x = cx0; x <= cx0 + 12; x += 3) for (const s of [-1, 1]) member(k, [x, 0, s * 1.1], [x, 1.03, s * 1.1], 'HEB 200', 'structSteel')
  for (const s of [-1, 1]) member(k, [cx0, 1.0, s * 1.15], [cx0 + 12, 1.0, s * 1.15], 'UPN 200', 'structSteel', [0, 0, 1])
}

/** Rotary hose from the standpipe gooseneck to the top-drive gooseneck, sagging between them. */
function buildHose(k: Kit, p: P) {
  const D = dims(p)
  const { F, H, leg } = D
  const sp = (h: number): V3 => {
    const q = leg(-1, 1, h)
    return [q[0] + 0.35, q[1], q[2] - 0.35]
  }
  const hs = Math.min(14, H * 0.33)
  const g: V3 = [sp(hs)[0] + 0.7, sp(hs)[1] + 0.35, sp(hs)[2] - 0.7]
  const tdG: V3 = [0.3, F + D.td + 3.3, -0.7]
  const sag = Math.max(1, (g[1] + tdG[1]) / 2 - (F + 1.5))
  k.spline('rubberBlack', [g, [(g[0] + tdG[0]) / 2, (g[1] + tdG[1]) / 2 - Math.min(sag, 4), (g[2] + tdG[2]) / 2], tdG], 0.07, 8, 30)

}
