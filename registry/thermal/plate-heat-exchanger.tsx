// Gasketed plate-and-frame heat exchanger: fixed frame plate with four connections, plate pack, pressure plate, tie bolts, carrying and guide bars, support column. EN 13445 / ASME VIII, ASME B16.5.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { liftingLug, member, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { nozzleStandout, pipeOD, type Rating } from '../lib/standards'
import { clamp, earthBoss, openNozzle } from './_thermal'

export interface PlateHeatExchangerProps {
  /** connection size, also sets the plate size */
  nps?: number
  rating?: Rating
  /** number of plates in the pack */
  plates?: number
  /** plate pitch (plate + compressed gasket), m */
  pitch?: number
  tag?: string
  paint?: MatKey
}

export const defaults = {
  nps: 6,
  rating: 150 as Rating,
  plates: 160,
  pitch: 0.0036,
  tag: 'E-300',
  paint: 'motorPaint' as MatKey,
}

type P = typeof defaults

// typical plate envelope (width, height) for a connection size, after common M/T-series frames
const PLATE: [number, number, number][] = [
  [2, 0.32, 0.75],
  [3, 0.4, 0.95],
  [4, 0.48, 1.1],
  [6, 0.62, 1.6],
  [8, 0.78, 2.0],
  [10, 0.98, 2.4],
  [12, 1.15, 2.7],
  [16, 1.3, 3.0],
]

function dims(p: P) {
  const row = PLATE.find((r) => r[0] >= p.nps) ?? PLATE[PLATE.length - 1]
  const pw = row[1]
  const ph = row[2]
  const db = clamp(0.012 + 0.03 * pw, 0.024, 0.052) // tightening bolt
  const fw = pw + 6 * db
  const fh = ph + 0.32
  const tF = clamp(0.04 + 0.09 * pw, 0.06, 0.18)
  const tP = tF * 0.85
  const pack = Math.max(10, Math.round(p.plates)) * p.pitch
  const open = 0.35 + 0.3 * pack // free bar length to slide plates out
  const tc = 0.18
  const len = tF + pack + tP + open + tc
  const x0 = -len / 2 // fixed frame front face
  const xA = x0 + tF // pack starts
  const xB = xA + pack
  const xPP = xB + tP
  const xC = x0 + len - tc / 2 // column centre
  const yFoot = 0.22
  const yc = yFoot + fh / 2
  const so = nozzleStandout(p.nps, p.rating)
  const ox = 0.05 + pipeOD(p.nps) * 0.5
  const pz = pw / 2 - ox
  const py = ph / 2 - ox
  return { pw, ph, db, fw, fh, tF, tP, pack, x0, xA, xB, xPP, xC, tc, yFoot, yc, so, pz, py }
}

const CONN = [
  ['hot-in', 'Hot side inlet', 1, 1],
  ['hot-out', 'Hot side outlet', 1, -1],
  ['cold-in', 'Cold side inlet', -1, -1],
  ['cold-out', 'Cold side outlet', -1, 1],
] as const

export function ports(props: PlateHeatExchangerProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return CONN.map(([id, label, sz, sy]) => port(id, label, [d.x0 - d.so, d.yc + sy * d.py, sz * d.pz], [-1, 0, 0], p.nps, p.rating))
}

export function PlateHeatExchanger(props: PlateHeatExchangerProps & GroupProps) {
  const { nps, rating, plates, pitch, tag, paint, ...group } = { ...defaults, ...props }
  const p = { nps, rating, plates, pitch, tag, paint } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PlateHeatExchanger

function build(k: Kit, p: P) {
  const d = dims(p)
  const P = p.paint
  const { pw, ph, fw, fh, tF, tP, yc, db } = d
  // fixed frame plate on its feet
  k.rbox(P, [tF, fh, fw], 0.02, [d.x0 + tF / 2, yc, 0])
  k.box(P, [tF + 0.32, 0.03, fw + 0.08], [d.x0 + tF / 2 + 0.06, 0.015, 0])
  for (const s of [-1, 1]) k.box(P, [tF + 0.2, d.yFoot, 0.03], [d.x0 + tF / 2 + 0.06, d.yFoot / 2 + 0.02, s * (fw / 2 - 0.05)])
  for (const s of [-1, 1]) for (const dx of [-0.08, 0.2]) k.hex('nut', 0.036, 0.02, [d.x0 + tF / 2 + dx, 0.04, s * (fw / 2 - 0.12)])
  for (const s of [-1, 1]) liftingLug(k, [d.x0 + tF / 2, yc + fh / 2, s * fw * 0.3], 'z', 0.9, P)
  // plate pack: stainless plates with black gasket lines between, chevron-pressed area not visible edge-on
  k.box('rubberBlack', [d.pack, ph - 0.012, pw - 0.012], [(d.xA + d.xB) / 2, yc, 0])
  const n = Math.round(d.pack / p.pitch)
  for (let i = 0; i < n; i++) {
    const x = d.xA + (i + 0.5) * p.pitch
    k.rbox('stainless', [Math.min(0.0012, p.pitch * 0.4), ph, pw], 0.03, [x, yc, 0], undefined, 1)
  }
  // movable pressure plate with roller on the carrying bar
  k.rbox(P, [tP, fh - 0.06, fw], 0.02, [d.xB + tP / 2, yc - 0.03, 0])
  const yBar = yc + ph / 2 + 0.07
  k.box(P, [tP * 0.8, 0.14, 0.1], [d.xB + tP / 2, yBar + 0.03, 0])
  k.cyl('castIron', 0.045, 0.06, [d.xB + tP / 2, yBar + 0.11, 0], 'z', 20)
  // carrying bar (top) and guide bar (bottom), stainless clad
  const xEnd = d.xC
  k.box('stainless', [xEnd - d.x0 - tF + 0.02, 0.12, 0.05], [(d.x0 + tF + xEnd) / 2, yBar + 0.12, 0])
  const yGuide = yc - ph / 2 - 0.05
  k.box('stainless', [xEnd - d.x0 - tF + 0.02, 0.06, 0.04], [(d.x0 + tF + xEnd) / 2, yGuide, 0])
  // support column with base plate
  const yTop = yBar + 0.2
  member(k, [xEnd, 0.025, 0], [xEnd, yTop, 0], 'HEB 160', P, [1, 0, 0])
  k.box(P, [0.3, 0.025, 0.3], [xEnd, 0.0125, 0])
  k.box(P, [0.22, 0.02, 0.22], [xEnd, yTop + 0.01, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.034, 0.018, [xEnd + sx * 0.1, 0.034, sz * 0.1])
  // tightening bolts in the side slots, nuts and washers at both plates
  const nb = 2 + Math.floor(ph / 0.55)
  const xb0 = d.x0 - 0.04
  const xb1 = d.xPP + 0.12 + 0.12 * d.pack
  for (const s of [-1, 1]) {
    const z = s * (pw / 2 + db * 1.7)
    for (let i = 0; i < nb; i++) {
      const y = yc - fh / 2 + 0.12 + ((fh - 0.3) * i) / (nb - 1)
      k.rod('boltXylan', [xb0, y, z], [xb1, y, z], db / 2, 10)
      for (const [x, dir] of [
        [d.x0, -1],
        [d.xPP, 1],
      ] as const) {
        k.cyl('flangeSteel', db * 1.25, 0.008, [x + dir * 0.004, y, z], 'x', 16)
        if (dir < 0) k.box('castIron', [db * 1.1, db * 2.4, db * 2.4], [x - 0.008 - db * 0.55, y, z]) // bearing box under the bolt head
        k.hex('nut', db * 1.9, dir < 0 ? db * 0.95 : db * 1.6, [x + dir * (0.008 + (dir < 0 ? db * 1.1 + db * 0.48 : db * 0.8)), y, z], 'x')
      }
      // plastic protection sleeve over the exposed thread behind the pressure plate
      const xs0 = d.xPP + 0.008 + db * 1.6
      k.cyl('plasticGrey', db * 0.75, xb1 - xs0 + 0.01, [(xs0 + xb1) / 2 + 0.005, y, z], 'x', 12)
    }
  }
  // four connections on the fixed frame plate, with port liners
  for (const [, , sz, sy] of CONN) {
    const base: V3 = [d.x0, yc + sy * d.py, sz * d.pz]
    openNozzle(k, { base, dir: [-1, 0, 0], nps: p.nps, rating: p.rating, standout: d.so, mat: 'stainless' })
    k.torus('rubberBlack', pipeOD(p.nps) / 2 + 0.012, 0.01, [d.x0 - 0.004, base[1], base[2]], 'x', 8, 32)
  }
  tagPlate(k, p.tag, [d.x0 + tF / 2, yc, fw / 2 + 0.001], 'z', 0.18)
  k.box('nameplate', [0.16, 0.1, 0.002], [d.x0 + tF / 2, yc - 0.14, fw / 2 + 0.001])
  earthBoss(k, [d.x0 + tF / 2, d.yFoot + 0.15, fw / 2 + 0.025], 'z')
}
