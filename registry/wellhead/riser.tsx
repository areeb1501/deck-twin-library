// Export / import riser top section: riser pipe below deck with jacket clamps and splash-zone sheathing, deck hang-off, insulating joint, riser ESDV, 5D bend to a topside flange. API RP 2RD / API 6D / ASME B31.4-B31.8.
import type { Kit, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, gasket, gauge, member, tagPlate, weldBead } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { ballValve, flangeBore, frame } from './_wellparts'

export interface RiserProps {
  nps?: number
  rating?: Rating
  /** riser length below the deck, m (geometry runs down to y = -length) */
  length?: number
  /** deck height above mean sea level, m (places the splash-zone sheathing) */
  airGap?: number
  /** riser emergency shutdown valve above the hang-off */
  esdv?: boolean
  /** monolithic insulating joint */
  insulatingJoint?: boolean
  /** horizontal topside run after the bend, m */
  run?: number
  tag?: string
}

export const defaults = {
  nps: 12,
  rating: 600 as Rating,
  length: 20,
  airGap: 18,
  esdv: true,
  insulatingJoint: true,
  run: 1.2,
  tag: 'ESDV-R101',
}

type P = typeof defaults

const COAT = paint('#4a4f45', { metalness: 0.2, roughness: 0.7 }) // FBE / 3LPE riser coating
const IJ_BAND = paint('#2f5fa8', { metalness: 0.2, roughness: 0.5 })

function layout(p: P) {
  const D = pipeOD(p.nps)
  const f = flangeDims(p.nps, p.rating)
  const fl = f.hubLength + f.raisedFaceHeight
  const Lv = faceToFace('ball-full', p.nps, p.rating)
  const yIJ0 = 0.45
  const Lij = p.insulatingJoint ? Math.max(0.8, 2.6 * D) : 0
  const yIJ1 = yIJ0 + Lij
  const yV0 = yIJ1 + (p.insulatingJoint ? 0.15 : 0.2) + fl
  const yV1 = p.esdv ? yV0 + Lv : yV0
  const R = 5 * D // 5D piggable bend, typical
  const yB = yV1 + fl + 0.15
  const yH = yB + R
  const xP = R + p.run + fl
  return { D, f, fl, Lv, yIJ0, yIJ1, Lij, yV0, yV1, R, yB, yH, xP }
}

export function ports(props: RiserProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const L = layout(p)
  return [port('topside', 'Topside flange', [L.xP, L.yH, 0], [1, 0, 0], p.nps, p.rating)]
}

export function Riser(props: RiserProps & GroupProps) {
  const { nps, rating, length, airGap, esdv, insulatingJoint, run, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, length, airGap, esdv, insulatingJoint, run, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Riser

function clamp(k: Kit, y: number, D: number, jx: number) {
  const r = D / 2
  const h = Math.max(0.3, D * 1.2)
  k.cyl('rubberBlack', r + 0.012, h + 0.04, [0, y, 0], 'y', 40)
  k.cyl('structSteelDark', r + 0.035, h, [0, y, 0], 'y', 40)
  // split-clamp bolting lugs on ±Z
  for (const s of [-1, 1]) {
    k.box('structSteelDark', [0.03, h * 0.9, 0.16], [-0.02, y, s * (r + 0.1)])
    k.box('structSteelDark', [0.03, h * 0.9, 0.16], [0.02, y, s * (r + 0.1)])
    for (const dy of [-0.3, 0, 0.3]) {
      k.cyl('boltXylan', 0.012, 0.14, [0, y + dy * h, s * (r + 0.12)], 'x', 8)
      for (const sx of [-1, 1]) k.hex('nut', 0.04, 0.022, [sx * 0.05, y + dy * h, s * (r + 0.12)], 'x')
    }
  }
  // bracket arm back to the jacket member stub (-X)
  k.box('structSteelDark', [jx - r - 0.03, h * 0.6, 0.03], [-(r + jx) / 2 - 0.015, y, 0])
  k.box('structSteelDark', [jx - r - 0.03, 0.03, 0.3], [-(r + jx) / 2 - 0.015, y + h * 0.3, 0])
  k.box('structSteelDark', [jx - r - 0.03, 0.03, 0.3], [-(r + jx) / 2 - 0.015, y - h * 0.3, 0])
  k.cyl('structSteel', 0.36, h + 2.4, [-jx - 0.33, y, 0], 'y', 32)
}

function build(k: Kit, p: P) {
  const L = layout(p)
  const { D, R } = L
  const wall = pipeWall(p.nps, 'XS')
  const nps = p.nps
  const jx = D / 2 + 0.55

  // riser below deck: coated pipe, clamps, splash-zone sheathing
  const y0 = -Math.max(1, p.length)
  k.pipe(COAT, [0, y0, 0], [0, -0.35, 0], D, wall, 40)
  for (let y = -3; y > y0 + 1; y -= 6) clamp(k, y, D, jx)
  const sz0 = Math.max(y0, -p.airGap - 3)
  const sz1 = Math.min(-0.6, -p.airGap + 5)
  if (sz1 > sz0 + 0.5) {
    k.cyl('rubberBlack', D / 2 + 0.016, sz1 - sz0, [0, (sz0 + sz1) / 2, 0], 'y', 40)
    for (const y of [sz0, sz1]) k.cyl('stainless', D / 2 + 0.02, 0.06, [0, y, 0], 'y', 40)
  }

  // hang-off: deck plate and beams, forged collar, split clamp with bolts
  k.box('deckPlate', [1.4, 0.025, 1.4], [0, -0.0125, 0])
  for (const s of [-1, 1]) member(k, [-0.9, -0.15, s * (D / 2 + 0.18)], [0.9, -0.15, s * (D / 2 + 0.18)], 'HEB 240', 'structSteelDark')
  k.pipe(COAT, [0, -0.36, 0], [0, L.yIJ0 + 0.002, 0], D, wall, 40)
  k.cyl('flangeSteel', D / 2 + 0.06, 0.14, [0, 0.07, 0], 'y', 40)
  k.cyl('flangeSteel', D / 2 + 0.11, 0.035, [0, 0.0175, 0], 'y', 40)
  k.around(12, D / 2 + 0.085, [0, 0.035, 0], 'y', (q) => {
    k.cyl('boltXylan', 0.012, 0.09, [q[0], 0.06, q[2]], 'y', 8)
    k.hex('nut', 0.04, 0.022, [q[0], 0.046, q[2]])
  })
  for (const s of [-1, 1]) {
    k.box('flangeSteel', [0.16, 0.12, 0.03], [s * (D / 2 + 0.1), 0.2, 0.025])
    k.box('flangeSteel', [0.16, 0.12, 0.03], [s * (D / 2 + 0.1), 0.2, -0.025])
    k.cyl('boltXylan', 0.014, 0.14, [s * (D / 2 + 0.12), 0.2, 0], 'z', 8)
  }
  k.cyl('flangeSteel', D / 2 + 0.03, 0.16, [0, 0.21, 0], 'y', 40)
  // riser ID plate
  tagPlate(k, `${nps}" RISER`, [0, 0.21, D / 2 + 0.031], 'z', 0.2)

  // monolithic insulating joint: two forged hubs with the insulation band between
  if (p.insulatingJoint) {
    const ro = D / 2 + Math.max(0.04, D * 0.18)
    weldBead(k, nps, [0, L.yIJ0, 0], 'y')
    weldBead(k, nps, [0, L.yIJ1, 0], 'y')
    k.lathe('equipmentPaint', [[D / 2 - wall, L.yIJ0], [D / 2, L.yIJ0], [ro, L.yIJ0 + L.Lij * 0.18], [ro, L.yIJ0 + L.Lij * 0.44], [D / 2 - wall, L.yIJ0 + L.Lij * 0.44]], [0, 0, 0], 'y', 48)
    k.lathe('equipmentPaint', [[D / 2 - wall, L.yIJ0 + L.Lij * 0.56], [ro, L.yIJ0 + L.Lij * 0.56], [ro, L.yIJ0 + L.Lij * 0.82], [D / 2, L.yIJ1], [D / 2 - wall, L.yIJ1]], [0, 0, 0], 'y', 48)
    k.cyl(IJ_BAND, ro + 0.006, L.Lij * 0.14, [0, L.yIJ0 + L.Lij * 0.5, 0], 'y', 48)
    k.cyl('cable', 0.006, 0.12, [ro + 0.02, L.yIJ0 + L.Lij * 0.5, 0], 'y', 6)
    k.box('nameplate', [0.16, 0.1, 0.003], [0, L.yIJ0 + L.Lij * 0.3, ro + 0.002])
  }
  // spool up to the ESDV
  k.pipe('pipePaint', [0, L.yIJ1 - 0.002, 0], [0, L.yV0 - L.fl + 0.002, 0], D, wall, 40)
  flange(k, nps, p.rating, [0, L.yV0 - 0.0045, 0], 'y')
  gasket(k, nps, p.rating, [0, L.yV0 - 0.00225, 0], 'y')
  if (p.esdv) {
    k.with(frame([0, L.yV0, 0], [0, 1, 0], [0, 0, 1]), () => ballValve(k, nps, p.rating, L.Lv, 'actuator', true, true, p.tag))
    flange(k, nps, p.rating, [0, L.yV1 + 0.0045, 0], '-y')
    gasket(k, nps, p.rating, [0, L.yV1 + 0.00225, 0], 'y')
  } else {
    flange(k, nps, p.rating, [0, L.yV0 + 0.0045, 0], '-y', true)
  }
  // riser pressure gauge and transmitter on the topside spool, operator side (+Z)
  {
    const yg = L.yV1 + L.fl + 0.08
    for (const [a, isPT] of [[0.35, false], [-0.35, true]] as const) {
      const n: V3 = [Math.sin(a), 0, Math.cos(a)]
      const b: V3 = [n[0] * D / 2, yg, n[2] * D / 2]
      const e: V3 = [n[0] * (D / 2 + 0.12), yg, n[2] * (D / 2 + 0.12)]
      k.rod('flangeSteel', [b[0] * 0.95, yg, b[2] * 0.95], e, 0.02, 12)
      k.box('valveBody', [0.06, 0.06, 0.06], [n[0] * (D / 2 + 0.15), yg, n[2] * (D / 2 + 0.15)])
      const t: V3 = [n[0] * (D / 2 + 0.15), yg + 0.06, n[2] * (D / 2 + 0.15)]
      if (isPT) {
        k.cyl('actuatorBlue', 0.035, 0.1, [t[0], t[1] + 0.05, t[2]], 'y', 16)
        k.rbox('actuatorBlue', [0.1, 0.09, 0.09], 0.012, [t[0], t[1] + 0.14, t[2]])
      } else {
        k.rod('stainless', t, [t[0], t[1] + 0.08, t[2]], 0.008, 8)
        gauge(k, [t[0], t[1] + 0.14, t[2]], 'z', 0.12, 'bar', p.rating >= 900 ? 250 : 160)
      }
    }
  }
  // 5D bend and topside run to the flange
  k.pipe('pipePaint', [0, L.yV1 + L.fl - 0.002, 0], [0, L.yB + 0.002, 0], D, wall, 40)
  weldBead(k, nps, [0, L.yB, 0], 'y')
  k.bend('pipePaint', [0, L.yB, 0], [0, 1, 0], [1, 0, 0], R, D, Math.PI / 2, wall)
  weldBead(k, nps, [R, L.yH, 0], 'x')
  k.pipe('pipePaint', [R - 0.002, L.yH, 0], [L.xP - L.fl + 0.002, L.yH, 0], D, wall, 40)
  flange(k, nps, p.rating, [L.xP, L.yH, 0], 'x', true)
  flangeBore(k, nps, p.rating, [L.xP, L.yH, 0], 'x', 'XS')
  // pipe support under the topside run
  {
    const x = R + p.run * 0.45
    const yb = L.yH - D / 2
    k.pipe('structSteel', [x, 0.02, 0], [x, yb - 0.02, 0], 0.219, 0.008, 24)
    k.box('structSteel', [0.35, 0.02, 0.35], [x, 0.01, 0])
    k.box('structSteel', [0.3, 0.02, D * 0.8], [x, yb - 0.01, 0])
    k.torus('boltXylan', D / 2 + 0.01, 0.009, [x, L.yH, 0], 'x', 6, 28, Math.PI)
  }
}
