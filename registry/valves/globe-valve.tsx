// Flanged globe valve: bulb body, bolted bonnet, outside screw & yoke, rising stem, handwheel or bevel gear. BS 1873 / API 623, ASME B16.10.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { faceToFace, handwheelDia, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { clamp, globeBody, osyYoke, plateText, useKit2 } from './_body'

export interface GlobeValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** auto: bevel gear from NPS 10 */
  operator?: 'auto' | 'handwheel' | 'gear'
  /** disc lift, 0 closed … 1 open */
  open?: number
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 4, rating: 300 as Rating, operator: 'auto' as 'auto' | 'handwheel' | 'gear', open: 1, body: 'valveBody' as MatKey, tag: '' }

/** typical: full lift is a quarter of the seat bore */
const lift = (nps: number) => Math.max(0.012, (pipeOD(nps) / 2 - pipeWall(nps, '80')) * 0.5)

export function ports(p: GlobeValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('globe', nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function GlobeValve(props: GlobeValveProps & GroupProps) {
  const { nps, rating, operator, open, body, tag, ...group } = { ...defaults, ...props }
  const gear = operator === 'gear' || (operator === 'auto' && nps >= 10)
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, gear, body, tag), [nps, rating, gear, body, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} position-y={-(1 - clamp(open, 0, 1)) * lift(nps)} />
    </group>
  )
}

export default GlobeValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, gear: boolean, body: MatKey, tag: string) {
  const L = faceToFace('globe', nps, rating)
  const g = globeBody(k, nps, rating, L, body, false, tag || plateText(nps, rating))
  const { yB, stemR, D } = g
  const y = osyYoke(k, body, yB, D, stemR, Math.max(0.1, 0.06 + D * 1.3)).top
  const hw = handwheelDia('globe', nps, rating)
  let top: number
  if (gear) {
    const gb = clamp(D * 0.8, 0.14, 0.4)
    k.rbox(body, [gb, gb * 0.7, gb * 0.8], gb * 0.08, [0, y + gb * 0.35, 0])
    k.cyl(body, gb * 0.22, gb * 0.7, [0, y + gb * 0.3, gb * 0.6], 'z', 16)
    k.handwheel('handwheel', Math.max(0.35, hw), [0, y + gb * 0.3, gb * 1.0], 'z', 5)
    top = y + gb * 0.7 + lift(nps) + 0.03
    k.cyl('stainless', stemR * 1.8, top - y - gb * 0.7 + 0.02, [0, (top + y + gb * 0.7) / 2 + 0.01, 0], 'y', 14, undefined, true)
    k.disc('stainless', stemR * 1.8, [0, top + 0.02, 0], 'y', 14)
  } else {
    k.handwheel('handwheel', hw, [0, y + 0.01, 0], 'y', hw > 0.35 ? 6 : 5)
    k.hex('nut', stemR * 3.2, stemR * 1.4, [0, y + 0.01 + hw * 0.07, 0])
    top = y + 0.02 + hw * 0.07 + lift(nps) + 0.02
  }
  mv.cyl('stainless', stemR, top - yB, [0, (top + yB) / 2, 0], 'y', 12)
  mv.cyl('stainless', stemR * 1.12, 0.006, [0, top, 0], 'y', 12)
}
