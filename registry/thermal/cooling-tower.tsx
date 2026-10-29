// Mechanical induced-draft counterflow cooling tower (cell type): concrete basin, clad casing with louvred air inlets, fan deck, fan stacks, right-angle gear drives with motors outside the stacks, hot-water risers and access. CTI STD-201 / ATC-105 practice.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, uvScale, mat4, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { flange, grating, handrail, ladder, member, motor, motorSize, pipeRun, tagPlate, weldBead } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, fanImpeller, type RotorSpec } from '../lib/rotors'
import { flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { louvreMaterial } from '../lib/textures'
import { clamp } from './_thermal'

export interface CoolingTowerProps {
  /** cells in a row along X */
  cells?: number
  /** plan size of one cell (square), m */
  cellSize?: number
  /** fan deck above grade, m */
  deckHeight?: number
  /** air inlet height above the basin curb, m */
  inletHeight?: number
  /** motor power per fan, kW */
  kw?: number
  inletNps?: number
  outletNps?: number
  rating?: Rating
  running?: boolean
  tag?: string
}

export const defaults = {
  cells: 2,
  cellSize: 9,
  deckHeight: 10,
  inletHeight: 3.2,
  kw: 110,
  inletNps: 20,
  outletNps: 24,
  rating: 150 as Rating,
  running: true,
  tag: 'CT-100',
}

type P = typeof defaults

const CURB = 0.6 // basin wall above grade

function dims(p: P) {
  const n = Math.max(1, Math.round(p.cells))
  const S = p.cellSize
  const Lx = n * S
  const Wz = S
  const yD = Math.max(p.deckHeight, p.inletHeight + CURB + 3)
  const D = clamp(Math.round(S * 0.7 * 2) / 2, 3, 12) // typical fan to cell ratio, leaves deck room for the drive
  const Hs = clamp(0.3 * D, 1.8, 4) // velocity-recovery fan stack
  const cellX = Array.from({ length: n }, (_, i) => -Lx / 2 + (i + 0.5) * S)
  const yDist = yD - 1.3 // spray distribution header level
  const xR = -Lx / 2 - 0.9 // hot water riser, outside the -X end wall
  const fi = flangeDims(p.inletNps, p.rating)
  const fo = flangeDims(p.outletNps, p.rating)
  const yIn = 1.2
  const inFace: V3 = [xR - 1.6, yIn, 0]
  const outFace: V3 = [Lx / 2 + 0.3 + 1.2 + 0.5, pipeOD(p.outletNps) / 2 + 0.25, 0] // sump wall + sump + spool
  return { n, S, Lx, Wz, yD, D, Hs, cellX, yDist, xR, fi, fo, yIn, inFace, outFace }
}

export function ports(props: CoolingTowerProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [
    port('inlet', 'Hot water inlet', d.inFace, [-1, 0, 0], p.inletNps, p.rating),
    port('outlet', 'Cold water outlet', d.outFace, [1, 0, 0], p.outletNps, p.rating),
  ]
}

export function CoolingTower(props: CoolingTowerProps & GroupProps) {
  const { cells, cellSize, deckHeight, inletHeight, kw, inletNps, outletNps, rating, running, tag, ...group } = { ...defaults, ...props }
  const p = { cells, cellSize, deckHeight, inletHeight, kw, inletNps, outletNps, rating, running, tag } as P
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { built, rotors } = useMemo(() => build(p), [cells, cellSize, deckHeight, inletHeight, kw, inletNps, outletNps, rating, tag])
  useEffect(() => () => [built, ...new Set(rotors.map((r) => r.built))].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default CoolingTower

function build(p: P) {
  const k = new Kit()
  const d = dims(p)
  const { Lx, Wz, yD, D, Hs } = d
  const frp = paint('#c8cbc2', { metalness: 0.05, roughness: 0.7, clearcoat: 0, weather: 1.2 }) // FRP cladding
  const steel = 'galvanised' as const
  const yI = CURB + p.inletHeight
  // concrete cold-water basin with curb, outlet sump on +X
  const t = 0.3
  for (const s of [-1, 1]) {
    k.box('concrete', [Lx + 2 * t, CURB, t], [0, CURB / 2, s * (Wz / 2 + t / 2)])
    k.box('concrete', [t, CURB, Wz], [s * (Lx / 2 + t / 2), CURB / 2, 0])
  }
  k.box('liquidWater', [Lx, 0.02, Wz], [0, CURB - 0.15, 0])
  k.box('concrete', [1.2, 1.0, 2.0], [Lx / 2 + t + 0.6, 0.5, 0])
  // columns, girts and diagonal bracing in the open air-inlet zone
  const colX = Array.from({ length: d.n * 2 + 1 }, (_, i) => -Lx / 2 + (i * d.S) / 2)
  for (const x of colX)
    for (const s of [-1, 1]) {
      member(k, [x, CURB, s * (Wz / 2 - 0.1)], [x, yD - 0.2, s * (Wz / 2 - 0.1)], 'SHS 150x150x8', frp)
      k.box(steel, [0.3, 0.02, 0.3], [x, CURB + 0.01, s * (Wz / 2 - 0.1)])
    }
  for (let i = 0; i < colX.length - 1; i++)
    for (const s of [-1, 1]) {
      member(k, [colX[i], yI, s * (Wz / 2 - 0.1)], [colX[i + 1], yI, s * (Wz / 2 - 0.1)], 'SHS 100x100x6.3', frp)
      if (i % 2 === 0) member(k, [colX[i], CURB + 0.2, s * (Wz / 2 - 0.1)], [colX[i + 1], yI - 0.1, s * (Wz / 2 - 0.1)], 'SHS 100x100x6.3', frp)
    }
  // air-inlet louvres on the long sides, clad casing above, solid end walls
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(Lx - 0.2, p.inletHeight - 0.2)
    uvScale(g, 1, (p.inletHeight - 0.2) / 0.18)
    k.add(louvreMaterial('#b8bcb4'), g, mat4([0, CURB + p.inletHeight / 2, s * (Wz / 2 - 0.02)], s > 0 ? undefined : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)))
    k.box(frp, [Lx, yD - yI, 0.04], [0, (yI + yD) / 2, s * (Wz / 2)])
    for (let x = -Lx / 2 + 0.6; x < Lx / 2; x += 0.6) k.box(frp, [0.05, yD - yI, 0.03], [x, (yI + yD) / 2, s * (Wz / 2 + 0.03)]) // panel ribs
    k.box(frp, [0.04, yD - CURB, Wz], [s * (Lx / 2), (CURB + yD) / 2, 0])
  }
  // fan deck, perimeter handrail
  k.box('deckPlate', [Lx + 0.1, 0.12, Wz + 0.1], [0, yD - 0.06, 0])
  const e = 0.05
  handrail(k, [[-Lx / 2 + e, yD, -Wz / 2 + e], [Lx / 2 - e, yD, -Wz / 2 + e], [Lx / 2 - e, yD, Wz / 2 - e], [-Lx / 2 + 1.0, yD, Wz / 2 - e]])
  handrail(k, [[-Lx / 2 + e, yD, Wz / 2 - e - 0.8], [-Lx / 2 + e, yD, -Wz / 2 + e]])
  // fan stacks, fans, gear drives and motors
  const R = D / 2
  const rpm = clamp(Math.round(4800 / D / 10) * 10, 90, 300) // typical tip speed ≈ 60 m/s
  const fk = new Kit()
  fanImpeller(fk, paint('#6d7478', { metalness: 0.5, roughness: 0.45 }), R - 0.05, { axis: 'y', blades: D > 7 ? 8 : 6, chord: R * 0.18, pitch: 0.22, hub: R * 0.12, hubLen: 0.35, thick: 0.03, hubMat: 'castIron' })
  const fanB = fk.build()
  const rotors: RotorSpec[] = []
  const m = motorSize(p.kw, 4)
  for (const xc of d.cellX) {
    k.lathe(frp, [[R + 0.35, yD], [R + 0.08, yD + 0.35], [R + 0.03, yD + 0.9], [R + 0.03 + Hs * 0.12, yD + Hs], [R + 0.09 + Hs * 0.12, yD + Hs], [R + 0.09 + Hs * 0.12, yD + Hs - 0.06], [R + 0.08, yD + 0.9], [R + 0.13, yD + 0.35], [R + 0.4, yD]], [xc, 0, 0], 'y', 64)
    k.lathe('vesselInner', [[R + 0.35, yD], [R + 0.08, yD + 0.35], [R + 0.03, yD + 0.9], [R + 0.03 + Hs * 0.12, yD + Hs]], [xc, 0, 0], 'y', 64)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      k.box(frp, [0.04, Hs - 0.3, 0.12], [xc + Math.cos(a) * (R + 0.13 + Hs * 0.05), yD + Hs / 2 + 0.1, Math.sin(a) * (R + 0.13 + Hs * 0.05)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
    }
    // mechanical support beam (torque tube) under the fan, gearbox at the centre
    const yF = yD + 0.55
    k.box(steel, [D + 0.6, 0.35, 0.3], [xc, yD - 0.35, 0])
    k.rbox('castIron', [0.8, 0.6, 0.6], 0.05, [xc, yD + 0.1, 0])
    k.cyl('castIron', 0.14, yF - yD - 0.3, [xc, (yF + yD + 0.4) / 2, 0], 'y', 16)
    k.box('actuatorBlue', [0.1, 0.08, 0.07], [xc + 0.45, yD + 0.15, 0.2]) // vibration switch
    rotors.push({ built: fanB, axis: 'y', pos: [xc, yF, 0], rpm })
    // motor outside the stack on the deck (+Z side), drive shaft through the stack wall to the gearbox
    const zf = R + 0.5
    const yS = yD + m.H + 0.15
    k.with(mat4([xc, yS, zf], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)), () => {
      // local +X (shaft) points to -Z, towards the gearbox
      k.with(mat4([0, 0, 0]), () => motor(k, { R: m.R, L: m.L, H: m.H, tbox: 'side', mat: 'motorPaint' }))
    })
    k.box(steel, [m.R * 2.4, 0.15, m.L + 0.2], [xc, yD + 0.075, zf + m.L / 2])
    k.cyl('stainless', 0.06, zf - 0.45, [xc, yS, (zf + 0.45) / 2 - 0.1], 'z', 12)
    for (const zz of [zf - 0.25, 0.4]) k.cyl('flangeSteel', 0.12, 0.08, [xc, yS, zz], 'z', 16)
    k.box('safetyYellow', [0.35, 0.35, 0.5], [xc, yS, zf - 0.25])
    // oil level gauge line from the gearbox out to the stack wall
    k.tube('stainless', [[xc - 0.3, yD + 0.05, 0.3], [xc - 0.3, yD + 0.05, R * 0.7], [xc - 0.3, yD + 0.9, R + 0.35]], 0.012, 6, 0.1)
    k.cyl('glass', 0.03, 0.18, [xc - 0.3, yD + 1.0, R + 0.35], 'y', 10)
  }
  // hot-water riser on the -X end, distribution header along +Z face, one branch and valve per cell
  const nps = p.inletNps
  const Lfi = d.fi.hubLength + d.fi.raisedFaceHeight
  flange(k, nps, p.rating, d.inFace, [-1, 0, 0], true)
  const zH = Wz / 2 + 0.9
  // the header turns into the last cell through an LR elbow; earlier cells take welded branches
  const xLast = d.cellX[d.n - 1]
  pipeRun(k, [[d.inFace[0] + Lfi, d.yIn, 0], [d.xR, d.yIn, 0], [d.xR, d.yDist, 0], [d.xR, d.yDist, zH], [xLast, d.yDist, zH], [xLast, d.yDist, Wz / 2 - 0.05]], nps, { mat: 'pipePaint' })
  const bnps0 = nps >= 12 ? Math.round(nps * 0.6) : nps
  for (const [i, xc] of d.cellX.entries()) {
    const last = i === d.n - 1
    const bnps = last ? nps : bnps0
    if (!last) {
      pipeRun(k, [[xc, d.yDist, zH - pipeOD(nps) / 2 + 0.01], [xc, d.yDist, Wz / 2 - 0.05]], bnps, { mat: 'pipePaint' })
      weldBead(k, bnps, [xc, d.yDist, zH - pipeOD(nps) / 2 + 0.005], [0, 0, -1])
    }
    k.cyl('valveBody', pipeOD(bnps) / 2 + 0.06, 0.12, [xc, d.yDist, Wz / 2 + 0.45], 'z', 24)
    k.rod('valveBody', [xc, d.yDist, Wz / 2 + 0.45], [xc, d.yDist + pipeOD(bnps) / 2 + 0.35, Wz / 2 + 0.45], 0.03, 8)
    k.handwheel('handwheel', 0.35, [xc, d.yDist + pipeOD(bnps) / 2 + 0.38, Wz / 2 + 0.45], 'y')
  }
  for (let x = d.xR; x < d.cellX[d.n - 1]; x += 3) k.box(steel, [0.15, 0.15, 0.9], [Math.max(x, -Lx / 2 + 0.1), d.yDist - pipeOD(nps) / 2 - 0.075, Wz / 2 + 0.45])
  k.box(steel, [0.3, d.yIn - pipeOD(nps) / 2, 0.3], [d.xR, (d.yIn - pipeOD(nps) / 2) / 2, 0])
  // cold-water outlet from the sump, make-up and overflow
  const Lfo = d.fo.hubLength + d.fo.raisedFaceHeight
  flange(k, p.outletNps, p.rating, d.outFace, [1, 0, 0], true)
  k.pipe('pipePaint', [Lx / 2 + t + 1.2, d.outFace[1], 0], [d.outFace[0] - Lfo, d.outFace[1], 0], pipeOD(p.outletNps), 0.01, 32)
  k.disc('pipeBore', pipeOD(p.outletNps) / 2 - 0.011, [Lx / 2 + t + 1.202, d.outFace[1], 0], 'x', 32) // dark sump opening
  k.pipe('pipePaint', [Lx / 2 + t, 0.45, -Wz * 0.3], [Lx / 2 + t + 0.6, 0.45, -Wz * 0.3], pipeOD(4), 0.006, 20)
  k.tube('pipePaint', [[Lx / 2 - 0.5, CURB + 0.6, -Wz * 0.35], [Lx / 2 - 0.5, CURB + 0.1, -Wz * 0.35]], pipeOD(3) / 2, 12)
  // access: caged ladders with an intermediate rest platform on the +X end
  const yMid = Math.min(yD / 2 + 0.5, 6)
  const xl = Lx / 2 + 0.5
  grating(k, [xl + 0.45, yMid, -Wz / 2 + 1.5], 0.9, 1.6)
  handrail(k, [[xl, yMid, -Wz / 2 + 0.7], [xl + 0.9, yMid, -Wz / 2 + 0.7], [xl + 0.9, yMid, -Wz / 2 + 2.3], [xl, yMid, -Wz / 2 + 2.3]])
  member(k, [xl + 0.9, CURB, -Wz / 2 + 0.75], [xl + 0.9, yMid - 0.03, -Wz / 2 + 0.75], 'SHS 100x100x6.3', steel)
  member(k, [xl + 0.9, CURB, -Wz / 2 + 2.25], [xl + 0.9, yMid - 0.03, -Wz / 2 + 2.25], 'SHS 100x100x6.3', steel)
  for (const z of [-Wz / 2 + 0.75, -Wz / 2 + 2.25]) member(k, [Lx / 2 + 0.02, yMid - 0.08, z], [xl + 0.9, yMid - 0.08, z], 'UPN 100', steel, [0, 1, 0])
  ladder(k, [xl + 0.5, CURB, -Wz / 2 + 2.6], yMid, [0, 0, 1])
  ladder(k, [xl + 0.45, yMid, -Wz / 2 + 0.4], yD, [0, 0, -1])
  k.box('deckPlate', [1.2, 0.08, 1.2], [Lx / 2 + 0.6, yD - 0.04, -Wz / 2 + 0.4])
  tagPlate(k, p.tag, [Lx / 2 + 0.03, yI + 1.5, 0], 'x', 0.6)
  return { built: k.build(), rotors }
}
