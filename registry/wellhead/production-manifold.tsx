// Production / test manifold skid: N well inlets, each diverted by two API 6D ball valves into a production or test header. ASME B31.3, B16.5, API 6D.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, flangedJoint, gasket, gauge, member, pipe, pipeRun, skid, tagPlate, weldCap } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { elbow90, faceToFace, flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { flangeBore, hollowBall, ring } from './_wellparts'

export interface ProductionManifoldProps {
  /** number of well inlet slots */
  slots?: number
  /** slot pitch along the headers, m */
  pitch?: number
  productionNps?: number
  testNps?: number
  /** well inlet / branch size */
  inletNps?: number
  rating?: Rating
  /** slot lined up to the test header (1-based, 0 = none) */
  testSlot?: number
  tag?: string
}

export const defaults = {
  slots: 6,
  pitch: 1.0,
  productionNps: 10,
  testNps: 6,
  inletNps: 4,
  rating: 900 as Rating,
  testSlot: 2,
  tag: 'M-1000',
}

type P = typeof defaults

const SKID = 'HEB 200'
const W = 2.4 // skid width, typical

function layout(p: P) {
  const n = Math.max(1, Math.round(p.slots))
  const top = 0.2 + 0.008 // HEB 200 + checker plate
  const Ls = n * p.pitch + 1.4
  const slotX = Array.from({ length: n }, (_, i) => -Ls / 2 + 0.6 + p.pitch * (i + 0.5))
  const yH = top + 0.55
  const zP = -0.6
  const zT = 0.15
  const zR = 0.85
  const zIn = W / 2 + 0.55
  const yIn = top + 0.45
  const fl = (nps: number) => flangeDims(nps, p.rating).hubLength + flangeDims(nps, p.rating).raisedFaceHeight
  const Lv = faceToFace('ball-full', p.inletNps, p.rating)
  const spool = 0.12
  const headers = [
    { id: 'production', nps: p.productionNps, z: zP },
    { id: 'test', nps: p.testNps, z: zT },
  ].map((h) => {
    const crown = yH + pipeOD(h.nps) / 2
    return { ...h, crown, yv: crown + spool + fl(p.inletNps) + Lv / 2 }
  })
  const yRun = Math.max(...headers.map((h) => h.yv)) + Lv / 2 + fl(p.inletNps) + spool + elbow90(p.inletNps) + 0.05
  const xOut = Ls / 2 + 0.35
  return { n, top, Ls, slotX, yH, zR, zIn, yIn, Lv, headers, yRun, xOut, fl }
}

export function ports(props: ProductionManifoldProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const L = layout(p)
  return [
    ...L.slotX.map((x, i) => port(`slot-${i + 1}`, `Well slot ${i + 1}`, [x, L.yIn, L.zIn], [0, 0, 1], p.inletNps, p.rating)),
    ...L.headers.map((h) => port(h.id, h.id === 'production' ? 'Production header outlet' : 'Test header outlet', [L.xOut, L.yH, h.z], [1, 0, 0], h.nps, p.rating)),
  ]
}

export function ProductionManifold(props: ProductionManifoldProps & GroupProps) {
  const { slots, pitch, productionNps, testNps, inletNps, rating, testSlot, tag, ...group } = { ...defaults, ...props }
  const p = { slots, pitch, productionNps, testNps, inletNps, rating, testSlot, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ProductionManifold

/** Full-bore trunnion ball valve between flanged joints at yc ± Lv/2 (flow vertical), gear operator facing +Z. */
function ballValve(k: Kit, nps: number, rating: Rating, c: V3, Lv: number, open: boolean) {
  const f = flangeDims(nps, rating)
  const D = pipeOD(nps)
  for (const s of [-1, 1]) flangedJoint(k, nps, rating, [c[0], c[1] + (s * Lv) / 2, c[2]], 'y')
  const Rb = Math.max(f.od * 0.5, D * 1.05)
  const inner = Lv - 2 * (f.hubLength + f.raisedFaceHeight)
  const rB = D / 2 - pipeWall(nps, '80')
  k.at([c[0], c[1] - Lv / 2, c[2]], undefined, () => {
    ring(k, 'valveBody', D * 0.62, rB, f.hubLength, Lv - f.hubLength, 28)
    hollowBall(k, 'valveBody', Rb, Math.min(1, inner / (2 * Rb) + 0.25), rB, Lv / 2)
  })
  // body joint bolting (two-piece body)
  k.around(8, Rb * 0.92, [c[0], c[1] - Rb * 0.25, c[2]], 'y', (q) => k.hex('nut', f.boltDia * 1.6, f.boltDia * 0.8, q, 'y'))
  k.at([c[0], c[1] - Rb * 0.25, c[2]], undefined, () => ring(k, 'valveBody', Rb, D * 0.62, -f.boltDia * 0.7, f.boltDia * 0.7, 28, false))
  // trunnion bosses, drain / vent plugs
  k.cyl('valveBody', Rb * 0.32, Rb * 0.3, [c[0], c[1], c[2] - Rb * 0.95], 'z', 16)
  k.hex('brass', 0.022, 0.018, [c[0] + Rb * 0.9, c[1] + Rb * 0.2, c[2]], 'x')
  // stem extension, gearbox, handwheel facing the operator (+Z)
  const z0 = c[2] + Rb * 0.85
  k.cyl('valveBody', Rb * 0.35, 0.08, [c[0], c[1], z0 + 0.04], 'z', 18)
  k.cyl('valveBody', Rb * 0.42, 0.02, [c[0], c[1], z0 + 0.09], 'z', 18)
  const gb = Math.max(0.12, D * 1.0)
  k.rbox('actuatorBlue', [gb * 1.1, gb * 0.9, gb * 0.6], gb * 0.06, [c[0], c[1], z0 + 0.1 + gb * 0.3])
  k.cyl('actuatorBlue', gb * 0.16, gb * 0.35, [c[0] + gb * 0.75, c[1], z0 + 0.1 + gb * 0.3], 'x', 14)
  k.handwheel('handwheel', Math.max(0.25, gb * 2.2), [c[0] + gb * 0.95, c[1], z0 + 0.1 + gb * 0.3], 'x', 5)
  // position indicator: green open, red closed
  const ind = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), open ? 0 : Math.PI / 2)
  k.box(open ? 'safetyGreen' : 'actuatorRed', [0.025, gb * 0.7, 0.012], [c[0], c[1], z0 + 0.1 + gb * 0.6 + 0.006], ind)
}

/** Dual-plate check between a flange facing -Z at z1 and one facing +Z at z2, with gaskets and through-studs. */
function waferCheck(k: Kit, nps: number, rating: Rating, x: number, y: number, z1: number, z2: number) {
  const f = flangeDims(nps, rating)
  const g = 0.0045
  flange(k, nps, rating, [x, y, z1], '-z')
  flange(k, nps, rating, [x, y, z2], 'z')
  const rB = pipeOD(nps) / 2 - pipeWall(nps, '80')
  k.at([x, y, z1 - g], '-z', () => {
    k.lathe('valveBody', [[rB, 0], [f.boltCircle / 2 - f.boltDia * 0.7, 0], [f.boltCircle / 2 - f.boltDia * 0.7, z1 - z2 - 2 * g], [rB, z1 - z2 - 2 * g]], [0, 0, 0], 'y', 32)
    k.lathe('pipeBore', [[rB, z1 - z2 - 2 * g], [rB, 0]], [0, 0, 0], 'y', 24)
    // hinge pin and the two half plates seen down the bore
    k.box('internalsSteel', [0.012, 2 * rB, 0.012], [0, (z1 - z2) / 2, 0], 'x')
  })
  for (const zz of [z1 - g / 2, z2 + g / 2]) gasket(k, nps, rating, [x, y, zz], 'z', g)
  k.box('nameplate', [0.05, 0.002, Math.max(0.02, (z1 - z2) * 0.6)], [x, y + f.boltCircle / 2 - f.boltDia * 0.7 + 0.001, (z1 + z2) / 2])
  const span = 2 * (f.thickness + f.raisedFaceHeight) + (z1 - z2) + f.boltDia * 3
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [x, y, (z1 + z2) / 2 - span / 2], 'z', f.boltDia, span, [f.boltDia * 0.95, span - f.boltDia * 0.95])
}

function build(k: Kit, p: P) {
  const L = layout(p)
  const b = p.inletNps
  const bOd = pipeOD(b)
  const yTop = skid(k, L.Ls, W, SKID)

  // headers: weld cap at -X, flanged outlet at +X, saddle supports on the skid
  for (const h of L.headers) {
    const od = pipeOD(h.nps)
    const x0 = -L.Ls / 2 + 0.25
    const fl = L.fl(h.nps)
    pipe(k, [x0, L.yH, h.z], [L.xOut - fl + 0.002, L.yH, h.z], h.nps, 'pipePaint', 'XS')
    weldCap(k, h.nps, [x0, L.yH, h.z], '-x')
    flange(k, h.nps, p.rating, [L.xOut, L.yH, h.z], 'x', true)
    flangeBore(k, h.nps, p.rating, [L.xOut, L.yH, h.z], 'x', 'XS')
    for (let x = x0 + 0.35; x < L.xOut - fl - 0.2; x += Math.max(1.6, p.pitch * 2)) {
      const xs = x + p.pitch / 2
      if (xs > L.xOut - fl - 0.2) break
      const yb = L.yH - od / 2
      k.box('structSteel', [0.25, 0.02, od * 0.75], [xs, yb - 0.012, h.z])
      k.box('structSteel', [0.015, yb - 0.022 - yTop, od * 0.5], [xs, (yb - 0.022 + yTop) / 2, h.z])
      k.box('structSteel', [0.22, yb - 0.022 - yTop, 0.015], [xs, (yb - 0.022 + yTop) / 2, h.z])
      k.box('structSteel', [0.3, 0.015, od * 0.8], [xs, yTop + 0.0075, h.z])
      k.torus('boltXylan', od / 2 + 0.01, 0.008, [xs, L.yH, h.z], 'x', 6, 24, Math.PI)
      for (const s of [-1, 1]) k.hex('nut', 0.03, 0.02, [xs, yb - 0.03, h.z + s * (od / 2 + 0.01)])
    }
    // header PT and PG near the outlet
    for (const [dx, isPT] of [[-0.5, true], [-0.8, false]] as const) {
      const xg = L.xOut - fl + dx
      const yg = L.yH + od / 2
      k.pipe('stainless', [xg, yg - 0.01, h.z], [xg, yg + 0.1, h.z], 0.027, 0.004, 12)
      k.box('valveBody', [0.05, 0.05, 0.05], [xg, yg + 0.13, h.z])
      if (isPT) {
        k.cyl('actuatorBlue', 0.035, 0.1, [xg, yg + 0.21, h.z], 'y', 16)
        k.rbox('actuatorBlue', [0.1, 0.09, 0.09], 0.012, [xg, yg + 0.3, h.z])
      } else gauge(k, [xg, yg + 0.24, h.z], 'z', 0.1, 'bar', 160)
    }
    // header drain and vent bosses
    k.cyl('pipePaint', 0.03, 0.12, [x0 + 0.15, L.yH - od / 2 - 0.05, h.z], 'y', 12)
    k.hex('brass', 0.05, 0.03, [x0 + 0.15, L.yH - od / 2 - 0.12, h.z], 'y')
  }

  const zMin = Math.min(...L.headers.map((h) => h.z))
  const R = elbow90(b)
  L.slotX.forEach((x, i) => {
    const toTest = i + 1 === p.testSlot
    // inlet: flange facing +Z, horizontal stub, elbow up, rise, elbow over the headers, drop into the production header
    const flIn = L.fl(b)
    flange(k, b, p.rating, [x, L.yIn, L.zIn], 'z', true)
    flangeBore(k, b, p.rating, [x, L.yIn, L.zIn], 'z')
    const far = L.headers.find((h) => h.z === zMin)!
    const dropTop = (yv: number) => yv + L.Lv / 2 + L.fl(b)
    // dual-plate wafer check valve on the inlet (stops back-flow from the headers into a shut-in well)
    const Lc = faceToFace('dual-plate-check', b, p.rating)
    const z1 = L.zIn - 2 * flIn - 0.08
    const z2 = z1 - Lc
    pipe(k, [x, L.yIn, L.zIn - flIn + 0.002], [x, L.yIn, z1 + flIn - 0.002], b, 'pipePaint', '80')
    waferCheck(k, b, p.rating, x, L.yIn, z1, z2)
    pipeRun(k, [[x, L.yIn, z2 - flIn + 0.002], [x, L.yIn, L.zR], [x, L.yRun, L.zR], [x, L.yRun, far.z], [x, dropTop(far.yv) - 0.002, far.z]], b, { schedule: '80' })
    for (const h of L.headers) {
      if (h.z !== zMin) {
        // forged tee on the run, straight drop
        k.cyl('pipePaint', (bOd / 2) * 1.12, bOd * 1.4, [x, L.yRun, h.z], 'z', 20)
        k.cyl('pipePaint', (bOd / 2) * 1.12, bOd * 0.7, [x, L.yRun - bOd * 0.35, h.z], 'y', 20)
        pipe(k, [x, L.yRun, h.z], [x, dropTop(h.yv) - 0.002, h.z], b, 'pipePaint', '80')
      }
      const open = h.id === 'test' ? toTest : !toTest
      ballValve(k, b, p.rating, [x, h.yv, h.z], L.Lv, open)
      pipe(k, [x, h.crown - 0.004, h.z], [x, h.yv - L.Lv / 2 - L.fl(b) + 0.002, h.z], b, 'pipePaint', '80')
      // sweepolet on the header crown
      k.cyl('pipePaint', (bOd / 2) * 1.4, 0.07, [x, h.crown + 0.01, h.z], 'y', 24, (bOd / 2) * 1.05)
    }
    // riser PG + PT on the inlet riser, facing the operator
    const yg = L.yIn + R + 0.35
    k.pipe('stainless', [x + bOd / 2 - 0.005, yg, L.zR], [x + bOd / 2 + 0.07, yg, L.zR], 0.021, 0.003)
    gauge(k, [x + bOd / 2 + 0.11, yg, L.zR], 'z', 0.1, 'bar', 160)
    const yt = yg + 0.3
    k.pipe('stainless', [x + bOd / 2 - 0.005, yt, L.zR], [x + bOd / 2 + 0.07, yt, L.zR], 0.021, 0.003)
    k.cyl('actuatorBlue', 0.035, 0.1, [x + bOd / 2 + 0.11, yt, L.zR], 'y', 16)
    k.rbox('actuatorBlue', [0.1, 0.09, 0.09], 0.012, [x + bOd / 2 + 0.11, yt + 0.09, L.zR])
    k.disc('glass', 0.03, [x + bOd / 2 + 0.11, yt + 0.09, L.zR + 0.046], 'z', 20)
    tagPlate(k, `SLOT ${i + 1}`, [x, L.yIn + R + 0.65, L.zR + bOd / 2 + 0.004], 'z', 0.12)
    // riser guide
    k.torus('boltXylan', bOd / 2 + 0.008, 0.007, [x, L.yIn + R + 0.9, L.zR], 'y', 6, 20)
  })

  // riser guide beam and run support portal
  const xa = L.slotX[0] - p.pitch / 2 + 0.1
  const xb = L.slotX[L.slotX.length - 1] + p.pitch / 2 - 0.1
  const yg = L.yIn + R + 0.9
  const zb = L.zR - bOd / 2 - 0.06
  member(k, [xa - 0.1, yg, zb], [xb + 0.1, yg, zb], 'UPN 100', 'structSteelDark')
  for (const xx of [xa, xb]) {
    member(k, [xx, yTop, zb], [xx, yg + 0.05, zb], 'HEA 100', 'structSteelDark')
    k.box('structSteelDark', [0.2, 0.015, 0.2], [xx, yTop + 0.0075, zb])
  }
  for (const x of L.slotX) k.box('structSteelDark', [0.05, 0.05, L.zR - zb - bOd / 2], [x, yg, (L.zR - bOd / 2 + zb) / 2])
  const yr = L.yRun - bOd / 2
  const zr = (L.zR + L.headers[1].z) / 2 + 0.05
  member(k, [xa - 0.1, yr - 0.05, zr], [xb + 0.1, yr - 0.05, zr], 'HEA 100', 'structSteelDark')
  for (const xx of [xa - 0.1, xb + 0.1]) {
    member(k, [xx, yTop, zr], [xx, yr - 0.1, zr], 'HEA 100', 'structSteelDark')
    k.box('structSteelDark', [0.2, 0.015, 0.2], [xx, yTop + 0.0075, zr])
  }
  for (const x of L.slotX) k.torus('boltXylan', bOd / 2 + 0.008, 0.007, [x, L.yRun, zr], 'z', 6, 20, Math.PI)
  tagPlate(k, p.tag, [-L.Ls / 2 + 0.3, yTop + 0.35, W / 2 + 0.004], 'z', 0.3)
  member(k, [-L.Ls / 2 + 0.3, yTop, W / 2 - 0.05], [-L.Ls / 2 + 0.3, yTop + 0.5, W / 2 - 0.05], 'L50x50x5', 'galvanised')
}
