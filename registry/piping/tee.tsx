// Butt-welding tee, equal or reducing outlet: hollow parametric run and branch skins with a forged crotch fillet; ASME B16.9 run C and outlet M, B16.25 bevels or welded WN flanges.
import type { Kit, MatKey, Orient, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall, tee, type Rating, type Schedule, type Service } from '../lib/standards'
import { bevelDepth, bevelEnd, buttWeld, flangeLength, portFlange, sheet } from './_piping'

export interface TeeProps {
  /** run size, inches */
  nps?: number
  /** outlet size, inches (clamped to the run size) */
  branchNps?: number
  schedule?: Schedule
  ends?: 'butt-weld' | 'flanged'
  rating?: Rating
  /** direction of the outlet */
  branch?: 'up' | 'down' | 'side'
  /** firewater paints the fitting red */
  service?: Service | 'none'
}

export const defaults = {
  nps: 6,
  branchNps: 6,
  schedule: '40' as Schedule,
  ends: 'butt-weld' as 'butt-weld' | 'flanged',
  rating: 300 as Rating,
  branch: 'up' as 'up' | 'down' | 'side',
  service: 'none' as Service | 'none',
}

type P = typeof defaults

function geom(p: P) {
  const b = Math.min(p.branchNps, p.nps)
  const { run, branch } = b >= p.nps ? tee(p.nps) : tee(p.nps, b)
  const v: V3 = p.branch === 'down' ? [0, -1, 0] : p.branch === 'side' ? [0, 0, 1] : [0, 1, 0]
  // built with the outlet on +Y, then turned about X (the run axis is unchanged)
  const axis: Orient = p.branch === 'down' ? '-y' : p.branch === 'side' ? 'z' : 'y'
  const flR = p.ends === 'flanged' ? flangeLength(p.nps, p.rating) : 0
  const flB = p.ends === 'flanged' ? flangeLength(b, p.rating) : 0
  return { b, C: run, M: branch, v, axis, flR, flB }
}

export function ports(props: TeeProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const g = geom(p)
  const r = p.ends === 'flanged' ? p.rating : undefined
  const m = g.M + g.flB
  return [
    port('run-a', 'Run A', [-g.C - g.flR, 0, 0], [-1, 0, 0], p.nps, r),
    port('run-b', 'Run B', [g.C + g.flR, 0, 0], [1, 0, 0], p.nps, r),
    port('branch', 'Branch', [g.v[0] * m, g.v[1] * m, g.v[2] * m], g.v, g.b, r),
  ]
}

export function Tee(props: TeeProps & GroupProps) {
  const { nps, branchNps, schedule, ends, rating, branch, service, ...group } = { ...defaults, ...props }
  const p = { nps, branchNps, schedule, ends, rating, branch, service } as P
  const data = useKit((k) => k.at([0, 0, 0], geom(p).axis, () => build(k, p)), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Tee

const NH = 24 // samples per half turn round the branch; the run hole and branch skins share them so the seams meet exactly
const phis = Array.from({ length: 2 * NH + 1 }, (_, j) => -Math.PI / 2 + (j * Math.PI) / NH)
const ys = (R: number, z: number) => Math.sqrt(Math.max(R * R - z * z, 0))

/**
 * Run cylinder of radius R along X from -xe to xe with a hole whose edge is (B cos φ, √(R²−z²), z = A sin φ).
 * Rows go round the run; each row is split into a left and a right strip that stop at the hole edge.
 */
function runSkin(k: Kit, mat: MatKey, R: number, B: number, A: number, xe: number, outward: boolean) {
  const thm = Math.asin(Math.min(A / R, 1))
  const rows: { th: number; xb: number }[] = []
  for (let j = 0; j <= NH; j++) rows.push({ th: Math.asin((A * Math.sin(phis[j])) / R), xb: B * Math.cos(phis[j]) })
  const nb = 32
  for (let i = 1; i < nb; i++) rows.push({ th: thm + (i * (2 * Math.PI - 2 * thm)) / nb, xb: 0 })
  rows.push({ th: 2 * Math.PI - thm, xb: 0 })
  const pt = (x: number, th: number): V3 => [x, R * Math.cos(th), R * Math.sin(th)]
  const n = (i: number): V3 => (outward ? [0, Math.cos(rows[i].th), Math.sin(rows[i].th)] : [0, -Math.cos(rows[i].th), -Math.sin(rows[i].th)])
  sheet(k, mat, rows.map((r) => [pt(Math.max(r.xb, 0), r.th), pt(xe, r.th)]), (i) => n(i))
  sheet(k, mat, rows.map((r) => [pt(-xe, r.th), pt(-Math.max(r.xb, 0), r.th)]), (i) => n(i))
  return rows.map((r) => r.th)
}

function build(k: Kit, p: P) {
  const g = geom(p)
  const mat: MatKey = p.service === 'firewater' ? 'firewaterRed' : 'pipePaint'
  const flanged = p.ends === 'flanged'
  const R = pipeOD(p.nps) / 2
  const r = R - pipeWall(p.nps, p.schedule)
  const Rb = pipeOD(g.b) / 2
  const rb = Rb - pipeWall(g.b, p.schedule)
  const hR = flanged ? 0 : bevelDepth(p.nps, p.schedule)
  const hB = flanged ? 0 : bevelDepth(g.b, p.schedule)
  const xe = g.C - hR
  const top = g.M - hB

  // outer: run with a hole sized to the crotch fillet, fillet, outlet
  const rho = Rb * 0.3 * Math.min(1, (1.5 * Rb) / R)
  const Bo = Rb + rho
  const Ao = Math.min(Bo, R * 0.995)
  const ths = runSkin(k, mat, R, Bo, Ao, xe, true)
  const fillet: V3[][] = []
  for (let i = 0; i <= 8; i++) {
    const s = i / 8
    const rx = Rb + rho * (1 - s) * (1 - s)
    const rz = Math.min(rx, R * 0.995)
    fillet.push(phis.map((f) => [rx * Math.cos(f), ys(R, rz * Math.sin(f)) + rho * 0.85 * s, rz * Math.sin(f)] as V3))
  }
  sheet(k, mat, fillet, undefined, (_, j) => [Math.cos(phis[j]), 0.4, Math.sin(phis[j])])
  const ring = fillet[fillet.length - 1]
  sheet(k, mat, [ring, phis.map((f) => [Rb * Math.cos(f), top, Rb * Math.sin(f)] as V3)], (_, j) => [Math.cos(phis[j]), 0, Math.sin(phis[j])])

  // bore: run bore with a hole of the outlet bore, outlet bore from the intersection curve up
  const Ai = Math.min(rb, r * 0.9999)
  runSkin(k, 'pipeBore', r, rb, Ai, g.C, false)
  sheet(k, 'pipeBore', [phis.map((f) => [rb * Math.cos(f), ys(r, Ai * Math.sin(f)), Ai * Math.sin(f)] as V3), phis.map((f) => [rb * Math.cos(f), g.M, rb * Math.sin(f)] as V3)], (_, j) => [-Math.cos(phis[j]), 0, -Math.sin(phis[j])])

  if (flanged) {
    portFlange(k, p.nps, p.rating, [-g.C - g.flR, 0, 0], [-1, 0, 0], { bore: r })
    portFlange(k, p.nps, p.rating, [g.C + g.flR, 0, 0], [1, 0, 0], { bore: r })
    portFlange(k, g.b, p.rating, [0, g.M + g.flB, 0], [0, 1, 0], { bore: rb })
    buttWeld(k, p.nps, [-g.C, 0, 0], [1, 0, 0])
    buttWeld(k, p.nps, [g.C, 0, 0], [1, 0, 0])
    buttWeld(k, g.b, [0, g.M, 0], [0, 1, 0])
  } else {
    for (const s of [-1, 1]) bevelEnd(k, [s * g.C, 0, 0], [s, 0, 0], [0, 1, 0], [0, 0, 1], R, r, hR, ths)
    bevelEnd(k, [0, g.M, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], Rb, rb, hB, phis)
  }
}
