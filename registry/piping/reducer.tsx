// Butt-welding concentric or eccentric reducer, ASME B16.9 end-to-end length, B16.25 bevels or welded WN flanges.
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { NPS_SIZES, pipeOD, pipeWall, reducer, type Rating, type Schedule, type Service } from '../lib/standards'
import { SEG, bevelDepth, buttWeld, flangeLength, gridSurface, portFlange, straight } from './_piping'

export interface ReducerProps {
  /** large end, inches */
  nps?: number
  /** small end, inches (falls back to the next size down if not smaller than nps) */
  smallNps?: number
  schedule?: Schedule
  kind?: 'concentric' | 'eccentric'
  /** eccentric only: the flat side (flat on top keeps vapour out of pump suctions) */
  flat?: 'top' | 'bottom'
  ends?: 'butt-weld' | 'flanged'
  rating?: Rating
  /** firewater paints the fitting red */
  service?: Service | 'none'
}

export const defaults = {
  nps: 6,
  smallNps: 4,
  schedule: '40' as Schedule,
  kind: 'concentric' as 'concentric' | 'eccentric',
  flat: 'top' as 'top' | 'bottom',
  ends: 'butt-weld' as 'butt-weld' | 'flanged',
  rating: 300 as Rating,
  service: 'none' as Service | 'none',
}

type P = typeof defaults

function geom(p: P) {
  const small = p.smallNps < p.nps ? p.smallNps : (NPS_SIZES.filter((s) => s < p.nps).pop() ?? p.nps)
  const H = reducer(p.nps, small)
  const rL = pipeOD(p.nps) / 2
  const rS = pipeOD(small) / 2
  const ecc = p.kind === 'eccentric' ? (p.flat === 'bottom' ? -(rL - rS) : rL - rS) : 0
  const flanged = p.ends === 'flanged'
  return { small, H, rL, rS, ecc, flL: flanged ? flangeLength(p.nps, p.rating) : 0, flS: flanged ? flangeLength(small, p.rating) : 0 }
}

export function ports(props: ReducerProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const g = geom(p)
  const r = p.ends === 'flanged' ? p.rating : undefined
  return [port('A', 'Large end', [-g.H / 2 - g.flL, 0, 0], [-1, 0, 0], p.nps, r), port('B', 'Small end', [g.H / 2 + g.flS, g.ecc, 0], [1, 0, 0], g.small, r)]
}

export function Reducer(props: ReducerProps & GroupProps) {
  const { nps, smallNps, schedule, kind, flat, ends, rating, service, ...group } = { ...defaults, ...props }
  const p = { nps, smallNps, schedule, kind, flat, ends, rating, service } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Reducer

function build(k: Kit, p: P) {
  const g = geom(p)
  const mat: MatKey = p.service === 'firewater' ? 'firewaterRed' : 'pipePaint'
  const flanged = p.ends === 'flanged'
  const { H, rL, rS } = g
  const tL = pipeWall(p.nps, p.schedule)
  const tS = pipeWall(g.small, p.schedule)
  const hL = flanged ? 0 : bevelDepth(p.nps, p.schedule)
  const hS = flanged ? 0 : bevelDepth(g.small, p.schedule)
  const e = H * 0.12
  // smooth cone between short straight ends; built along local +Y, then laid on +X (local x maps to world -y)
  const prof = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - e) / (H - 2 * e)))
    return 0.5 - 0.5 * Math.cos(Math.PI * t)
  }
  const span = H - hL - hS
  const shell = (inner: boolean) => (s: number, f: number): V3 => {
    const y = hL + s * span
    const m = prof(y)
    const r = rL + (rS - rL) * m - (inner ? tL + (tS - tL) * m : 0)
    const yc = g.ecc === 0 ? 0 : Math.sign(g.ecc) * (rL - (rL + (rS - rL) * m))
    return [-yc + r * Math.sin(f), y, r * Math.cos(f)]
  }
  const nv = SEG(p.nps)
  gridSurface(k, mat, shell(false), 24, nv, [-H / 2, 0, 0], 'x')
  gridSurface(k, 'pipeBore', shell(true), 24, nv, [-H / 2, 0, 0], 'x', true)
  const B: V3 = [H / 2, g.ecc, 0]
  if (flanged) {
    portFlange(k, p.nps, p.rating, [-H / 2 - g.flL, 0, 0], [-1, 0, 0], { bore: rL - tL })
    portFlange(k, g.small, p.rating, [H / 2 + g.flS, g.ecc, 0], [1, 0, 0], { bore: rS - tS })
    buttWeld(k, p.nps, [-H / 2, 0, 0], [1, 0, 0])
    buttWeld(k, g.small, B, [1, 0, 0])
  } else {
    straight(k, mat, [-H / 2, 0, 0], [1, 0, 0], hL, p.nps, p.schedule, 'bevel', 'open')
    straight(k, mat, [H / 2 - hS, g.ecc, 0], [1, 0, 0], hS, g.small, p.schedule, 'open', 'bevel', nv)
  }
}
