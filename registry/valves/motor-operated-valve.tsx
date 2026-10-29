// Motor-operated gate valve (MOV): wedge-gate body, bolted bonnet, yoke, multi-turn electric actuator with handwheel, local controls and stem cover. API 600, ISO 5210, ASME B16.10.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { faceToFace, flange, pipeOD, type Rating } from '../lib/standards'
import { clamp, gateBody, gateWedge, osyYoke, plateText, useKit2 } from './_body'
import { electricActuator } from './_operators'

export interface MotorOperatedValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** stem travel, 0 closed … 1 open */
  open?: number
  body?: MatKey
  actuator?: MatKey
  tag?: string
}

export const defaults = { nps: 8, rating: 300 as Rating, open: 1, body: 'valveBody' as MatKey, actuator: 'actuatorRed' as MatKey, tag: '' }

/** typical: gate stroke equals the bore */
const stroke = (nps: number) => Math.max(0.03, pipeOD(nps) * 0.95)
/** typical: actuator scale from valve size and class (thrust grows with bore area and pressure) */
const actScale = (nps: number, rating: Rating) => clamp(0.85 + pipeOD(nps) * 1.5 + (rating >= 600 ? 0.15 : 0), 0.85, 2)

export function ports(p: MotorOperatedValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('gate', nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function MotorOperatedValve(props: MotorOperatedValveProps & GroupProps) {
  const { nps, rating, open, body, actuator, tag, ...group } = { ...defaults, ...props }
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, body, actuator, tag), [nps, rating, body, actuator, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} position-y={-(1 - clamp(open, 0, 1)) * stroke(nps)} />
    </group>
  )
}

export default MotorOperatedValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, M: MatKey, A: MatKey, tag: string) {
  const L = faceToFace('gate', nps, rating)
  const g = gateBody(k, nps, rating, L, M, plateText(nps, rating))
  const { yB, stemR, D } = g
  const y = osyYoke(k, M, yB, D, stemR, Math.max(0.12, 0.08 + D * 1.4)).top
  const s = actScale(nps, rating)
  const f = flange(nps, rating)
  const act = electricActuator(k, y, s, A, tag || 'MOV')
  // stem cover tube with sight slot and vent cap
  const T = stroke(nps)
  const rc = Math.max(stemR * 2, 0.025)
  const y0 = act.top + 0.01
  const top = y0 + T + 0.06
  k.cyl(A, rc * 1.5, 0.02, [0, y0, 0], 'y', 20)
  k.cyl('stainless', rc, top - y0, [0, (top + y0) / 2, 0], 'y', 20)
  k.box('nut', [0.003, (top - y0) * 0.7, rc * 0.6], [rc * 0.98, (top + y0) / 2, 0])
  k.cyl('stainless', rc * 1.15, 0.015, [0, top + 0.0075, 0], 'y', 20)
  k.hex('brass', rc * 0.6, 0.012, [0, top + 0.02, 0])
  // rising stem: in the yoke window and up into the cover tube (drawn open)
  gateWedge(mv, D, g.ri, T)
  const ys = T + g.ri
  mv.cyl('stainless', stemR, top - 0.02 - ys, [0, (top - 0.02 + ys) / 2, 0], 'y', 12)
  mv.hex('nut', stemR * 3, stemR * 1.2, [0, y - Math.max(0.03, D * 0.2), 0])
  // earth boss on the body
  k.cyl('brass', 0.008, 0.02, [0, -f.od / 2 * 0.55, g.rz * 0.95], 'z', 8)
}
