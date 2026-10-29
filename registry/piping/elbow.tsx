// Butt-welding elbow 90° / 45° / 180° return, long or short radius, per ASME B16.9 with B16.25 weld bevels or welded WN flanges.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { elbow90, pipeOD, pipeWall, type Rating, type Schedule, type Service } from '../lib/standards'
import { LAND, SEG, bevelDepth, buttWeld, flangeLength, neg, portFlange, ringSheet, turn, type Ring } from './_piping'

export interface ElbowProps {
  nps?: number
  schedule?: Schedule
  /** bend angle, degrees */
  angle?: 90 | 45 | 180
  /** long radius (1.5 D) or short radius (1.0 D); 45° elbows are LR only */
  radius?: 'LR' | 'SR'
  ends?: 'butt-weld' | 'flanged'
  rating?: Rating
  /** direction end B turns towards; the fitting rotates only about +Y in a plant */
  turn?: 'up' | 'down' | 'side'
  /** firewater paints the fitting red */
  service?: Service | 'none'
}

export const defaults = {
  nps: 6,
  schedule: '40' as Schedule,
  angle: 90 as 90 | 45 | 180,
  radius: 'LR' as 'LR' | 'SR',
  ends: 'butt-weld' as 'butt-weld' | 'flanged',
  rating: 300 as Rating,
  turn: 'up' as 'up' | 'down' | 'side',
  service: 'none' as Service | 'none',
}

type P = typeof defaults

// Work point at the origin (tangent intersection) for 45/90; bend centre at the origin for the 180° return.
function geom(p: P) {
  const ang = p.angle === 180 ? 180 : p.angle === 45 ? 45 : 90
  // 45° and flanged 180° returns are LR only (SR return flanges would clash)
  const R = elbow90(p.nps, ang === 45 || (ang === 180 && p.ends === 'flanged') ? 'LR' : p.radius)
  const th = (ang * Math.PI) / 180
  const u = new THREE.Vector3(1, 0, 0)
  const v = new THREE.Vector3(...((p.turn === 'down' ? [0, -1, 0] : p.turn === 'side' ? [0, 0, 1] : [0, 1, 0]) as V3))
  const dB = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(v, Math.sin(th))
  let a: THREE.Vector3
  let b: THREE.Vector3
  if (ang === 180) {
    a = v.clone().multiplyScalar(-R)
    b = v.clone().multiplyScalar(R)
  } else {
    const T = R * Math.tan(th / 2)
    a = u.clone().multiplyScalar(-T)
    b = dB.clone().multiplyScalar(T)
  }
  const fl = p.ends === 'flanged' ? flangeLength(p.nps, p.rating) : 0
  const pa = a.clone().addScaledVector(u, -fl)
  const pb = b.clone().addScaledVector(dB, fl)
  const t = (x: THREE.Vector3) => x.toArray() as V3
  return { R, th, u: t(u), v: t(v), dB: t(dB), a: t(a), b: t(b), pa: t(pa), pb: t(pb) }
}

export function ports(props: ElbowProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const g = geom(p)
  const r = p.ends === 'flanged' ? p.rating : undefined
  return [port('A', 'End A', g.pa, neg(g.u), p.nps, r), port('B', 'End B', g.pb, g.dB.map((x) => Math.round(x * 1e6) / 1e6) as V3, p.nps, r)]
}

export function Elbow(props: ElbowProps & GroupProps) {
  const { nps, schedule, angle, radius, ends, rating, turn, service, ...group } = { ...defaults, ...props }
  const p = { nps, schedule, angle, radius, ends, rating, turn, service } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Elbow

function build(k: Kit, p: P) {
  const g = geom(p)
  const mat: MatKey = p.service === 'firewater' ? 'firewaterRed' : 'pipePaint'
  const od = pipeOD(p.nps)
  const wall = pipeWall(p.nps, p.schedule)
  const flanged = p.ends === 'flanged'
  // bevelled ends: shorten the arc by the bevel depth and finish each end with a machined bevel ring
  const h = flanged ? 0 : Math.min(bevelDepth(p.nps, p.schedule), g.R * g.th * 0.1)
  const d = h / g.R
  const u = new THREE.Vector3(...g.u)
  const v = new THREE.Vector3(...g.v)
  const C = new THREE.Vector3(...g.a).addScaledVector(v, g.R)
  const at = (s: number) => C.clone().addScaledVector(v, -g.R * Math.cos(s)).addScaledVector(u, g.R * Math.sin(s))
  const w = new THREE.Vector3().crossVectors(u, v)
  const n = SEG(p.nps)
  const ang = turn(n)
  const ro = od / 2
  const ri = ro - wall
  // rings in the plane normal to the bend: e1 points away from the bend centre, e2 is the bend-plane normal
  const ring = (s: number, r: number): Ring => ({ c: at(s).toArray() as V3, e1: at(s).sub(C).divideScalar(g.R).toArray() as V3, e2: w.toArray() as V3, r })
  const N = Math.max(10, Math.round((g.th / (Math.PI / 2)) * 28))
  const along = (s0: number, s1: number, r: number) => Array.from({ length: N + 1 }, (_, i) => ring(s0 + ((s1 - s0) * i) / N, r))
  ringSheet(k, mat, along(d, g.th - d, ro), ang, 'out')
  ringSheet(k, 'pipeBore', along(0, g.th, ri), ang, 'in')
  if (!flanged) {
    ringSheet(k, 'machined', [ring(d, ro), ring(0, ri + LAND)], ang, 'computed', neg(g.u))
    ringSheet(k, 'machined', [ring(0, ri + LAND), ring(0, ri)], ang, 'computed', neg(g.u))
    ringSheet(k, 'machined', [ring(g.th - d, ro), ring(g.th, ri + LAND)], ang, 'computed', g.dB)
    ringSheet(k, 'machined', [ring(g.th, ri + LAND), ring(g.th, ri)], ang, 'computed', g.dB)
  }
  if (flanged) {
    portFlange(k, p.nps, p.rating, g.pa, neg(g.u), { bore: od / 2 - wall })
    portFlange(k, p.nps, p.rating, g.pb, g.dB, { bore: od / 2 - wall })
    buttWeld(k, p.nps, g.a, g.u)
    buttWeld(k, p.nps, g.b, g.dB)
  }
}
