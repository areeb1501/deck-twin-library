// Flanged gate valve: flexible wedge, bolted bonnet, outside screw & yoke, rising stem, handwheel or bevel gear. API 600, ASME B16.10.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { faceToFace, pipeOD, type Rating } from '../lib/standards'
import { clamp, gateBody, gateWedge, osyYoke, plateText, useKit2 } from './_body'

export interface GateValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  operator?: 'handwheel' | 'gear'
  /** stem travel, 0 closed … 1 open */
  open?: number
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 6, rating: 300 as Rating, operator: 'handwheel' as const, open: 1, body: 'valveBody' as MatKey, tag: '' }

/** typical: gate stroke equals the bore */
const stroke = (nps: number) => Math.max(0.03, pipeOD(nps) * 0.95)

export function ports(p: GateValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('gate', nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function GateValve({ nps = defaults.nps, rating = defaults.rating, operator = defaults.operator, open = defaults.open, body = defaults.body, tag = defaults.tag, ...group }: GateValveProps & GroupProps) {
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, operator, body, tag), [nps, rating, operator, body, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} position-y={-(1 - clamp(open, 0, 1)) * stroke(nps)} />
    </group>
  )
}

export default GateValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, operator: 'handwheel' | 'gear', M: MatKey, tag: string) {
  const L = faceToFace('gate', nps, rating)
  const g = gateBody(k, nps, rating, L, M, tag || plateText(nps, rating))
  const { yB, stemR, D } = g
  const T = stroke(nps)
  const yk = osyYoke(k, M, yB, D, stemR, Math.max(0.1, 0.06 + D * 1.6))
  let top: number
  if (operator === 'gear') {
    const gb = Math.max(0.12, D * 0.9)
    const y = yk.top
    k.rbox(M, [gb, gb * 0.7, gb * 0.8], gb * 0.08, [0, y + gb * 0.35, 0])
    k.cyl(M, gb * 0.22, gb * 0.7, [0, y + gb * 0.3, gb * 0.6], 'z', 16)
    k.handwheel('handwheel', Math.max(0.3, gb * 2.2), [0, y + gb * 0.3, gb * 1.0], 'z', 5)
    // stem protector over the rising stem
    const y0 = y + gb * 0.7
    top = y0 + T + 0.04
    k.cyl('stainless', stemR * 1.8, top - y0 + 0.02, [0, (top + y0) / 2 + 0.01, 0], 'y', 14, undefined, true)
    k.disc('stainless', stemR * 1.8, [0, top + 0.02, 0], 'y', 14)
  } else {
    const hw = Math.min(0.75, Math.max(0.14, 0.1 + D * 1.25))
    k.handwheel('handwheel', hw, [0, yk.top + 0.01, 0], 'y', hw > 0.35 ? 6 : 4)
    k.hex('nut', stemR * 3.2, stemR * 1.4, [0, yk.top + 0.01 + hw * 0.07, 0])
    top = yk.top + 0.04 + T
  }
  // rising stem and wedge (drawn open)
  gateWedge(mv, D, g.ri, T)
  const ys = T + g.ri
  mv.cyl('stainless', stemR, top - ys, [0, (top + ys) / 2, 0], 'y', 12)
  mv.cyl('stainless', stemR * 1.15, 0.006, [0, top, 0], 'y', 12)
}
