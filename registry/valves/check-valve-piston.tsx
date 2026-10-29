// Piston (lift) check valve: globe-pattern body, guided piston disc under a bolted cover, cast flow arrow. BS 1868 / API 602 style, ASME B16.10 globe face-to-face.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { faceToFace, type Rating } from '../lib/standards'
import { clamp, globeBody, plateText, plug, useKit2 } from './_body'

export interface CheckValvePistonProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 2, rating: 600 as Rating, body: 'valveBody' as MatKey, tag: '' }

export function ports(p: CheckValvePistonProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('globe', nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function CheckValvePiston(props: CheckValvePistonProps & GroupProps) {
  const { nps, rating, body, tag, ...group } = { ...defaults, ...props }
  const [fixed] = useKit2((k) => build(k, nps, rating, body, tag), [nps, rating, body, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
    </group>
  )
}

export default CheckValvePiston

function build(k: Kit, nps: number, rating: Rating, M: MatKey, tag: string) {
  const L = faceToFace('globe', nps, rating)
  const g = globeBody(k, nps, rating, L, M, false, tag || plateText(nps, rating, 'LIFT CHECK'), false)
  const { yB, Rg, D, rj } = g
  // domed cover over the piston guide, centre boss with plug, lifting eye on larger sizes
  const rd = rj * 0.74
  const sy = clamp((Rg * 0.5) / rd, 0.25, 0.6)
  k.sphere(M, rd, [0, yB, 0], [1, sy, 1], 36)
  const yc = yB + rd * sy
  plug(k, M, [0, yc - 0.004, 0], 'y', Math.max(0.012, D * 0.12))
  if (nps >= 4) k.torus('flangeSteel', D * 0.15, D * 0.035, [rd * 0.45, yc - D * 0.08, 0], 'x', 8, 20)
}
