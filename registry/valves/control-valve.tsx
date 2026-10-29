// Globe control valve: cage-guided globe body, spring-diaphragm actuator, digital positioner, filter-regulator, tubing, travel indicator. IEC 60534 / ISA 75.08.01.
import { KitMesh, type GroupProps } from '../lib/mesh'
import type { Kit, MatKey } from '../lib/kit'
import { port, type Port } from '../lib/ports'
import { faceToFace, handwheelDia, type Rating } from '../lib/standards'
import { clamp, globeBody, plateText, useKit2 } from './_body'
import { airInlet, diaphragmActuator, filterRegulator, positioner, smallJB } from './_operators'

export interface ControlValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** plug travel, 0 closed … 1 open */
  open?: number
  body?: MatKey
  actuator?: MatKey
  tag?: string
}

export const defaults = { nps: 4, rating: 300 as Rating, open: 0.6, body: 'valveBody' as MatKey, actuator: 'actuatorBlue' as MatKey, tag: '' }

/** typical: rated travel for a cage-guided globe valve of this size, m */
export const travel = (nps: number) => clamp(0.0095 * nps + 0.01, 0.019, 0.102)

export function ports(p: ControlValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('control-globe', nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function ControlValve(props: ControlValveProps & GroupProps) {
  const { nps, rating, open, body, actuator, tag, ...group } = { ...defaults, ...props }
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, body, actuator, tag), [nps, rating, body, actuator, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} position-y={clamp(open, 0, 1) * travel(nps)} />
    </group>
  )
}

export default ControlValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, body: MatKey, A: MatKey, tag: string) {
  const L = faceToFace('control-globe', nps, rating)
  const g = globeBody(k, nps, rating, L, body, true, plateText(nps, rating))
  const { yB, stemR, D } = g
  const T = travel(nps)
  const Da = handwheelDia('control-globe', nps, rating)
  const H = clamp(0.15 + D * 0.6, 0.22, 0.42)
  // packing flange + studs, yoke lock nut
  k.cyl(body, stemR * 3.4, 0.012, [0, yB + 0.006, 0], 'y', 20)
  for (const s of [-1, 1]) k.rod('boltXylan', [s * stemR * 2.8, yB, 0], [s * stemR * 2.8, yB + 0.035, 0], Math.max(0.0035, stemR * 0.4), 6)
  const rY = Math.max(stemR * 4.2, D * 0.36, 0.045)
  k.hex('nut', rY * 2.3, H * 0.08, [0, yB + 0.012 + H * 0.04, 0])
  // cast yoke: base ring, two legs at ±Z (window faces ±X), top boss
  const legZ = rY * 1.35
  const legW = Math.max(0.03, rY * 0.55)
  const legT = Math.max(0.014, rY * 0.24)
  const y1 = yB + 0.012 + H * 0.08
  k.cyl(A, rY * 1.1, H * 0.1, [0, y1 + H * 0.05, 0], 'y', 28)
  k.box(A, [legW, H * 0.1, legZ * 2 + legT], [0, y1 + H * 0.05, 0])
  for (const s of [-1, 1]) k.box(A, [legW, H * 0.82, legT], [0, y1 + H * 0.1 + H * 0.41, s * legZ])
  const y0 = y1 + H
  k.cyl(A, rY * 1.15, H * 0.12, [0, y0 - H * 0.06, 0], 'y', 28)
  k.box(A, [legW, H * 0.12, legZ * 2 + legT], [0, y0 - H * 0.06, 0])
  const act = diaphragmActuator(k, y0, { Da, A, text: tag || 'AIR TO OPEN' })
  // stem, stem connector, travel pointer and magnet array (moving, drawn closed)
  const yc = y1 + H * 0.35
  mv.cyl('stainless', stemR, yc - yB + 0.04, [0, (yc + yB - 0.04) / 2, 0], 'y', 12)
  mv.cyl('stainless', stemR * 1.3, y0 - yc + 0.02, [0, (y0 + yc) / 2, 0], 'y', 12)
  mv.rbox('stainless', [stemR * 4.5, Math.max(0.03, H * 0.14), stemR * 3.2], 0.003, [0, yc, 0])
  for (const s of [-1, 1]) mv.cyl('nut', stemR * 0.45, stemR * 3.6, [s * stemR * 1.4, yc, 0], 'z', 6)
  mv.box('safetyYellow', [0.004, 0.004, legZ - legT / 2 - stemR], [legW / 2 + 0.004, yc, -(legZ - legT / 2 + stemR) / 2])
  mv.box('safetyYellow', [legW / 2 + 0.004, 0.004, 0.004], [legW / 4 + 0.002, yc, -stemR * 1.6])
  mv.box('nut', [stemR * 2.4, H * 0.12, 0.01], [0, yc, stemR * 1.6 + 0.005])
  // travel scale on the −Z leg
  k.box('stainless', [0.002, T * 1.4, legT * 0.9], [legW / 2 + 0.001, yc + T / 2, -legZ])
  for (let i = 0; i <= 4; i++) k.box('nut', [0.002, 0.0015, legT * (i % 2 ? 0.4 : 0.7)], [legW / 2 + 0.0025, yc + (T * i) / 4, -legZ + legT * 0.1])
  // positioner on the +Z leg, filter-regulator below-left, tubing, cable
  const zBack = legZ + legT / 2
  const py = y1 + H * 0.55
  k.box(body, [legW * 1.3, 0.05, 0.03], [0, py, zBack + 0.015])
  const pos = positioner(k, [0, py, zBack + 0.03])
  const zc = pos.zc
  const ax = -pos.w / 2 - 0.07
  const ay = py - pos.h * 0.55
  k.box(body, [0.03, 0.12, 0.012], [ax, ay + 0.07, zBack + 0.006])
  k.box(body, [0.03, 0.03, zc - zBack], [ax, ay + 0.12, (zc + zBack) / 2])
  filterRegulator(k, [ax, ay, zc], 0.18)
  const tr = 0.0045
  k.tube('tubing', [[ax, ay + 0.1, zc], [ax, py + 0.02, zc], [-pos.w / 2, py + 0.02, zc]], tr)
  const xo = pos.w * 0.3
  const zf = act.R * 0.8
  k.cyl('brass', 0.008, 0.03, [xo, act.yLower, zf], 'z', 8)
  k.tube('tubing', [[xo, py + pos.h / 2, zc], [xo, act.yLower - 0.04, zc], [xo, act.yLower - 0.04, zf + 0.04], [xo, act.yLower, zf + 0.04], [xo, act.yLower, zf + 0.012]], tr)
  k.tube('tubing', [[ax + 0.03, ay + 0.04, zc], [ax + 0.06, ay + 0.04, zc], [ax + 0.06, ay - 0.06, zc]], tr)
  airInlet(k, [ax + 0.06, ay - 0.06, zc])
  // positioner cable to a junction box on the back yoke leg
  const jz = -legZ - legT / 2 - 0.035
  k.box(body, [0.05, 0.03, 0.012], [0, py, -legZ - legT / 2 - 0.006])
  smallJB(k, [0, py, jz], 0.11, 0.12, 0.06, 2)
  k.spline('cable', [[pos.w / 2 + 0.03, py - pos.h * 0.25, zc], [pos.w / 2 + 0.08, py - pos.h * 0.45, zc - 0.02], [legW + 0.06, py - 0.12, 0], [0.022, py - 0.12, jz], [0.022, py - 0.072, jz]], 0.006, 6, 40)
}
