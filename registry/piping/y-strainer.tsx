// Flanged cast Y-strainer: body with integral RF flanges, 45° screen leg, bolted screen cap and blowdown ball valve. ASME B16.5 / B16.34 body, typical globe face-to-face.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { inch, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { add, flangeLength, portFlange, sheet, smallBallValve, turn } from './_piping'

export interface YStrainerProps {
  nps?: number
  rating?: Rating
  /** screen mesh, shown on the nameplate */
  mesh?: number
  /** blowdown valve on the screen cap */
  blowdown?: boolean
  body?: MatKey
}

export const defaults = { nps: 6, rating: 300 as Rating, mesh: 40, blowdown: true, body: 'valveBody' as MatKey }

// typical: face-to-face A and centreline-to-cap B (inches) of flanged cast-steel Y-strainers in vendor tables
const A150: [number, number][] = [[0.5, 4.25], [1, 5.5], [1.5, 6.5], [2, 7.88], [3, 10], [4, 12.13], [6, 18.5], [8, 21.63], [10, 26], [12, 30.5], [16, 38]]
const A300: [number, number][] = [[0.5, 4.75], [1, 6], [1.5, 7.25], [2, 8.63], [3, 11.25], [4, 14.5], [6, 20], [8, 23.38], [10, 28.5], [12, 33], [16, 41]]
const B150: [number, number][] = [[0.5, 2.25], [1, 3.25], [2, 6], [4, 9.75], [6, 14.25], [8, 18], [10, 22.5], [16, 34]]
const lerp = (t: [number, number][], x: number) => {
  if (x <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (x - t[i - 1][0])) / (t[i][0] - t[i - 1][0])
  const [a, b] = [t[t.length - 2], t[t.length - 1]]
  return b[1] + ((b[1] - a[1]) * (x - b[0])) / (b[0] - a[0])
}
const classK = (r: Rating) => (r <= 300 ? 1 : 1 + 0.12 * ([600, 900, 1500, 2500].indexOf(r) + 1))
function length(nps: number, rating: Rating) {
  const a = inch(rating <= 150 ? lerp(A150, nps) : lerp(A300, nps) * classK(rating))
  // never shorter than the two flanges plus a body
  return Math.max(a, 2 * flangeLength(nps, rating) + pipeOD(nps) * 1.4)
}
const legLength = (nps: number, rating: Rating) => inch(lerp(B150, nps)) * (rating <= 150 ? 1 : 1.05 * classK(rating))

export function ports(p: YStrainerProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = length(nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function YStrainer({ nps = defaults.nps, rating = defaults.rating, mesh = defaults.mesh, blowdown = defaults.blowdown, body = defaults.body, ...group }: YStrainerProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, mesh, blowdown, body), [nps, rating, mesh, blowdown, body])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default YStrainer

function build(k: Kit, nps: number, rating: Rating, mesh: number, blowdown: boolean, mat: MatKey) {
  const D = pipeOD(nps)
  const L = length(nps, rating)
  const fl = flangeLength(nps, rating)
  const bore = D / 2 - pipeWall(nps, '40')
  for (const s of [-1, 1]) portFlange(k, nps, rating, [(s * L) / 2, 0, 0], [s, 0, 0], { mat, bore })
  // through-bore between the flanges (the body castings around it are closed shells)
  k.lathe('pipeBore', [[bore, L / 2 - fl], [bore, -L / 2 + fl]], [0, 0, 0], 'x', 32)
  k.cyl(mat, D * 0.56, L - 2 * fl + 0.01, [0, 0, 0], 'x', 32, undefined, true)
  // bulb: the part of an ellipsoid of revolution that stands proud of the neck, so nothing intrudes into the bore
  const rx = Math.min(L / 2 - fl - 0.004, D * 1.05)
  const ry = D * 0.68
  const rz = ry
  const rn = D * 0.56
  const x0 = rx * Math.sqrt(1 - (rn / ry) ** 2)
  const prof: [number, number][] = []
  for (let i = 0; i <= 24; i++) {
    const x = -x0 + (2 * x0 * i) / 24
    prof.push([ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)), x])
  }
  k.lathe(mat, prof, [0, 0, 0], 'x', 36)

  // screen leg, downstream and down at 45°
  const c = Math.SQRT1_2
  const d: V3 = [c, -c, 0]
  const rl = D * 0.6
  const tc = Math.max(0.012, D * 0.13)
  const g = 0.003
  const Ll = Math.max(D * 1.2, legLength(nps, rating) - g - tc - 0.012)
  // leg skin starts where its wall leaves the bore cylinder
  const e1: V3 = [c, c, 0]
  const legAng = turn(36)
  const s0 = (a: number) => {
    const q = bore * bore - (rl * Math.sin(a)) ** 2
    return q <= 0 ? 0 : Math.max(0, rl * Math.cos(a) + Math.sqrt(q) / c + 0.002)
  }
  const legPt = (sv: number, a: number): V3 => [0, 1, 2].map((i) => sv * d[i] + rl * (Math.cos(a) * e1[i] + Math.sin(a) * (i === 2 ? 1 : 0))) as V3
  sheet(k, mat, [legAng.map((a) => legPt(s0(a), a)), legAng.map((a) => legPt(Ll, a))], (_, j) => [c * Math.cos(legAng[j]), c * Math.cos(legAng[j]), Math.sin(legAng[j])])
  k.cyl(mat, rl * 1.08, Ll * 0.25, add([0, 0, 0], d, Ll * 0.86), d, 32, rl * 1.12, true)
  const rc = rl + Math.max(0.022, D * 0.27)
  const e = add([0, 0, 0], d, Ll)
  k.cyl(mat, rc, tc, add(e, d, -tc / 2), d, 40)
  k.lathe('gasket', [[rl * 0.85, 0], [rc - 0.004, 0], [rc - 0.004, g], [rl * 0.85, g], [rl * 0.85, 0]], e, d, 40)
  k.cyl(mat, rc, tc, add(e, d, g + tc / 2), d, 40)
  const bd = Math.max(0.008, Math.min(0.03, D * 0.075))
  const n = nps >= 8 ? 12 : nps >= 3 ? 8 : 4
  const studL = 2 * tc + g + bd * 2.2
  k.boltCircle('boltXylan', 'nut', n, rl + (rc - rl) * 0.55, add(e, d, -tc - bd * 1.1), d, bd, studL, [bd * 0.45, studL - bd * 0.45])

  // cover boss with blowdown nipple, quarter-turn valve and plug
  // typical blow-off: 1 in at NPS 2, 1-1/2 in at NPS 4, 2 in from NPS 6
  const bn = nps < 2 ? 0.5 : nps < 4 ? 1 : nps < 6 ? 1.5 : 2
  const bD = pipeOD(bn)
  const c0 = add(e, d, g + tc)
  k.cyl(mat, bD * 0.9, 0.012, add(c0, d, 0.006), d, 20)
  if (blowdown) {
    const nip = bD * 1.4 + 0.02
    k.cyl('galvanised', bD / 2, nip, add(c0, d, 0.012 + nip / 2), d, 16)
    const vl = bD * 2.6
    const vc = add(c0, d, 0.012 + nip + vl / 2)
    smallBallValve(k, bn, vc, d, [0, 0, 1])
    const tail = add(vc, d, vl / 2)
    k.cyl('galvanised', bD / 2, bD * 1.2, add(tail, d, bD * 0.6), d, 16)
    k.hex('nut', bD * 1.25, bD * 0.6, add(tail, d, bD * 1.4), d)
  } else k.hex('nut', bD * 1.25, bD * 0.6, add(c0, d, 0.012 + bD * 0.3), d)

  // drain boss with plug on the inlet side of the bulb
  const dr: V3 = [-rx * 0.45, -ry * 0.88, 0]
  k.cyl(mat, D * 0.11, D * 0.12, dr, 'y', 16)
  k.hex('nut', D * 0.16, D * 0.06, [dr[0], dr[1] - D * 0.08, 0], 'y')

  // cast flow arrow on both sides and a stamped nameplate on top
  for (const s of [-1, 1]) {
    const z = s * rz * 0.97
    k.box(mat, [rx * 0.8, D * 0.07, D * 0.06], [-rx * 0.1, 0, z])
    const head = new THREE.Shape()
    const hw = D * 0.14
    head.moveTo(0, -hw / 2)
    head.lineTo(hw * 0.9, 0)
    head.lineTo(0, hw / 2)
    head.closePath()
    k.extrude(mat, head, D * 0.06, new THREE.Matrix4().makeTranslation(rx * 0.3, 0, z - D * 0.03), 2)
  }
  tagPlate(k, `${nps}" CL${rating} ${mesh} MESH`, [0, ry * 0.98, 0], 'y', Math.max(0.05, D * 0.55))
}
