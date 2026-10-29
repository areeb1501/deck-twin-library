// Firewater isolation valve built into a Kit: flanged OS&Y gate valve (rising stem, handwheel, locked-open chain) along local X, stem up local Y.
import * as THREE from 'three'
import { Kit, axisVec, mat4, type Axis, type MatKey, type V3 } from '../lib/kit'
import { gasket } from '../lib/parts'
import { GASKET_SPIRAL_WOUND, faceToFace, flange as flangeDims, handwheelDia, pipeOD, stemHeight, type Rating } from '../lib/standards'

/** OS&Y gate valve centred on the origin of the current Kit frame; ends at x = ±faceToFace/2. */
export function osyGate(k: Kit, nps: number, rating: Rating, body: MatKey = 'firewaterRed') {
  const D = pipeOD(nps)
  const f = flangeDims(nps, rating)
  const L = faceToFace('gate', nps, rating)
  const neck = (D / 2) * 1.12
  for (const s of [-1, 1]) {
    const x = (s * L) / 2
    k.at([x, 0, 0], s > 0 ? 'x' : '-x', () => {
      const yb = -f.raisedFaceHeight - f.thickness
      k.lathe(body, [[neck, yb - 0.003], [neck + 0.003, yb], [f.od / 2, yb], [f.od / 2, -f.raisedFaceHeight], [f.raisedFace / 2, -f.raisedFaceHeight]], [0, 0, 0], 'y', 32)
      k.lathe('machined', [[f.raisedFace / 2, -f.raisedFaceHeight], [f.raisedFace / 2, 0], [D / 2 * 0.85, 0]], [0, 0, 0], 'y', 32)
    })
  }
  k.cyl(body, neck, L - 2 * (f.raisedFaceHeight + f.thickness) + 0.004, [0, 0, 0], 'x', 28)
  const rx = Math.min(D * 0.55 + 0.012, L / 2 - f.raisedFaceHeight - f.thickness)
  const rz = D * 0.66 + 0.014
  const yTop = D * 0.85 + 0.02
  const yBot = -D * 0.5
  k.add(body, new THREE.CylinderGeometry(1, 1, yTop - yBot, 32), mat4([0, (yTop + yBot) / 2, 0], 'y', [rx, 1, rz]))
  k.sphere(body, 1, [0, yBot, 0], [rx, D * 0.25, rz], 24)
  // bonnet flange and studs
  const t = Math.max(0.01, D * 0.11)
  const bd = Math.max(0.01, Math.min(0.032, f.boltDia * 0.9))
  const brx = rx + f.boltDia * 2.4
  const brz = rz + f.boltDia * 2.4
  k.add(body, new THREE.CylinderGeometry(1, 1, 2 * t, 32), mat4([0, yTop, 0], 'y', [brx, 1, brz]))
  const n = nps >= 8 ? 12 : 8
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2
    const x = Math.cos(a) * (brx - bd * 1.6)
    const z = Math.sin(a) * (brz - bd * 1.6)
    k.cyl('boltXylan', bd / 2, 2 * t + bd * 2.2, [x, yTop, z], 'y', 6)
    k.hex('nut', bd * 1.85, bd * 0.9, [x, yTop + t + bd * 0.45, z], 'y')
  }
  // bonnet, yoke, stem, handwheel
  const H = stemHeight('gate', nps, rating)
  const hB = Math.max(0.06, D * 1.0 + 0.03)
  const stemR = Math.max(0.007, D * 0.085)
  const y0 = yTop + t
  k.add(body, new THREE.CylinderGeometry(1, 1, hB, 28), mat4([0, y0 + hB / 2, 0], 'y', [Math.max(stemR * 2.2, rx * 0.7), 1, Math.max(stemR * 2.2, rz * 0.62)]))
  const yB = y0 + hB
  const yT = Math.max(yB + 0.1, H * 0.78)
  const legX = stemR * 2.4 + Math.max(0.02, D * 0.22)
  const legW = Math.max(0.014, D * 0.16)
  const legT = Math.max(0.01, D * 0.09)
  k.cyl(body, stemR * 2.6, 0.02, [0, yB + 0.01, 0], 'y', 16)
  for (const s of [-1, 1]) k.box(body, [legW, yT - yB, legT], [s * legX, (yB + yT) / 2, 0])
  k.box(body, [legX * 2 + legW, legT * 1.6, legT * 2.2], [0, yT, 0])
  k.cyl(body, stemR * 2.5, legT * 3, [0, yT, 0], 'y', 16)
  k.cyl('stainless', stemR, H - yB, [0, (H + yB) / 2, 0], 'y', 12)
  const hw = Math.min(0.75, handwheelDia('gate', nps, rating))
  k.handwheel('handwheel', hw, [0, yT + legT * 1.5 + 0.01, 0], 'y', hw > 0.35 ? 6 : 4)
  // locked-open chain and padlock through the rim
  const r = hw / 2
  const yh = yT + legT * 1.5 + 0.01
  k.tube('galvanised', [[r * 0.7, yh, r * 0.7], [legX + legW, (yh + yB) / 2, legT], [legX + legW / 2, yB + 0.04, legT / 2]], 0.004, 4)
  k.box('brass', [0.035, 0.04, 0.015], [legX + legW + 0.01, (yh + yB) / 2 - 0.03, legT])
  return L
}

/** Gasket and stud bolts across two mating flanges whose faces meet at `pos` (flanges drawn separately). */
export function boltUp(k: Kit, nps: number, rating: Rating, pos: V3, axis: Axis) {
  const f = flangeDims(nps, rating)
  const v = axisVec(axis)
  gasket(k, nps, rating, pos, axis)
  const L = 2 * (f.thickness + f.raisedFaceHeight) + GASKET_SPIRAL_WOUND + f.boltDia * 3
  const start = new THREE.Vector3(...pos).addScaledVector(v, -L / 2).toArray() as V3
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, start, axis, f.boltDia, L, [f.boltDia * 0.95, L - f.boltDia * 0.95])
}

/** Bore lining inside a port flange (lib flanges have no inner hub surface), face at `face`, `axis` pointing out. */
export function portBore(k: Kit, nps: number, rating: Rating, face: V3, axis: Axis) {
  const f = flangeDims(nps, rating)
  const ri = (pipeOD(nps) / 2) * 0.88
  k.lathe('pipeBore', [[ri, 0.0005], [ri, -(f.hubLength + f.raisedFaceHeight + 0.01)]], face, axis, 24)
}
