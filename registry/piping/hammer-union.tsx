// Hammer union: Fig 1502 wing union for well testing and temporary flowlines; male sub with three-lug wing nut, female sub with ACME thread and lip seal, butt-weld ends.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall } from '../lib/standards'
import { BEVEL_TAN, LAND, buttWeld, hammerSpan, hammerUnion, pipeStub, seg } from './_flanges'

export interface HammerUnionProps {
  /** nominal size, inches (1–6) */
  nps?: number
  /** butt-welded pup joints each side, m */
  stub?: number
  /** figure stamped on the nut */
  figure?: '1502' | '602' | '2002'
}

export const defaults = { nps: 2, stub: 0, figure: '1502' as const }

/** typical: weld-end taper from the sub body to the pipe OD. */
const taper = (nps: number) => pipeOD(nps) * 0.5

function span(nps: number, stub: number) {
  const { xm, xf } = hammerSpan(nps)
  const c = (xm + xf) / 2
  const t = taper(nps) + Math.max(0, stub)
  return { jx: -c, xa: xm - c - t, xb: xf - c + t }
}

export function ports(p: HammerUnionProps = {}): Port[] {
  const { nps, stub } = { ...defaults, ...p }
  const s = span(nps, stub)
  return [port('A', 'Male end', [s.xa, 0, 0], [-1, 0, 0], nps), port('B', 'Female end', [s.xb, 0, 0], [1, 0, 0], nps)]
}

export function HammerUnion({ nps = defaults.nps, stub = defaults.stub, figure = defaults.figure, ...group }: HammerUnionProps & GroupProps) {
  const data = useKit((k) => build(k, Math.min(Math.max(nps, 1), 6), Math.max(0, stub), figure), [nps, stub, figure])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HammerUnion

function build(k: Kit, nps: number, stub: number, figure: string) {
  const s = span(nps, stub)
  const u = hammerUnion(k, s.jx, nps, 'valveBody', `FIG ${figure}`)
  const ro = pipeOD(nps) / 2
  const ri = ro - pipeWall(nps, '160')
  const t = taper(nps)
  const bev = Math.max(0, ro - ri - LAND) * BEVEL_TAN
  const n = seg(u.rBody * 2)
  // weld-end tapers with B16.25 bevels
  for (const [x, d] of [[u.xm, -1], [u.xf, 1]] as const) {
    const e = x + d * t
    k.lathe('valveBody', d < 0 ? [[ro, e + bev], [ro, e + t * 0.3], [u.rBody, x]] : [[u.rBody, x], [ro, e - t * 0.3], [ro, e - bev]], [0, 0, 0], 'x', n)
    k.lathe('machined', d < 0 ? [[ri, e], [ri + LAND, e], [ro, e + bev]] : [[ro, e - bev], [ri + LAND, e], [ri, e]], [0, 0, 0], 'x', n)
    k.lathe('pipeBore', d < 0 ? [[ri, x], [ri, e]] : [[ri, e], [ri, x]], [0, 0, 0], 'x', n)
    if (stub > 0) {
      pipeStub(k, [e, 0, 0], [d, 0, 0], stub, nps, '160', 'open', 'bevel')
      buttWeld(k, [e, 0, 0], [1, 0, 0], ro, ro - ri)
    }
  }
}
