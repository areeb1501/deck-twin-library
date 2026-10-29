// Straight guard-rail run after ISO 14122-3: Ø48.3 posts at ≤ 1.5 m on anchored base plates, top rail at 1.1 m, knee rail, 100 mm toe plate, end returns and an optional self-closing gate.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { ACCESS } from '../lib/standards'
import { anchorBolt, gate, RAIL, railRun } from './_steel'

export interface HandrailProps {
  /** overall run along X, m (includes the gate) */
  length?: number
  /** top rail height, m */
  height?: number
  /** self-closing gate at the +X end */
  gate?: boolean
  gateWidth?: number
  /** end returns towards -Z, m (0 = none) */
  returns?: number
  toePlate?: boolean
  finish?: 'painted' | 'galvanised'
}

export const defaults = {
  length: 6,
  height: ACCESS.handrail.height as number,
  gate: true,
  gateWidth: 0.7,
  returns: 0.3,
  toePlate: true,
  finish: 'painted' as 'painted' | 'galvanised',
}

type P = typeof defaults

export function Handrail(props: HandrailProps & GroupProps) {
  const { length, height, gate: hasGate, gateWidth, returns, toePlate, finish, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { length, height, gate: hasGate, gateWidth, returns, toePlate, finish }), [length, height, hasGate, gateWidth, returns, toePlate, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Handrail

function posts(a: number, b: number) {
  const n = Math.max(1, Math.ceil((b - a) / RAIL.maxPost))
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
}

function build(k: Kit, p: P) {
  const mat: MatKey = p.finish === 'galvanised' ? 'galvanised' : 'safetyYellow'
  const L = Math.max(0.5, p.length)
  const g = p.gate ? Math.min(Math.max(0.5, p.gateWidth), L - 0.4) : 0
  const x0 = -L / 2
  const x1 = L / 2 - g
  const o = { top: p.height, knee: Math.min(ACCESS.handrail.kneeRail, p.height / 2), toe: p.toePlate, mat, basePlates: false }
  railRun(k, [x0, 0, 0], [x1, 0, 0], o)
  const xs = posts(x0, x1)
  if (p.returns > 0.05) {
    railRun(k, [x0, 0, 0], [x0, 0, -p.returns], { ...o, startPost: false })
    xs.push(x0)
    k.rod(mat, [x0, 0, -p.returns], [x0, p.height, -p.returns], RAIL.postR, 8)
    if (!p.gate) {
      railRun(k, [L / 2, 0, 0], [L / 2, 0, -p.returns], { ...o, startPost: false })
      k.rod(mat, [L / 2, 0, -p.returns], [L / 2, p.height, -p.returns], RAIL.postR, 8)
    }
  }
  if (p.gate) {
    // latch post at the far end of the opening
    k.rod(mat, [L / 2, 0, 0], [L / 2, p.height, 0], RAIL.postR, 8)
    k.sphere(mat, RAIL.railR * 1.15, [L / 2, p.height, 0], undefined, 8)
    xs.push(L / 2)
    gate(k, [x1, 0, 0], [L / 2, 0, 0], mat)
  }
  // base plates with four anchors under every post (returns included)
  const pts: [number, number][] = xs.map((x) => [x, 0])
  if (p.returns > 0.05) {
    pts.push([x0, -p.returns])
    if (!p.gate) pts.push([L / 2, -p.returns])
  }
  const seen = new Set<string>()
  for (const [x, z] of pts) {
    const key = `${x.toFixed(3)},${z.toFixed(3)}`
    if (seen.has(key)) continue
    seen.add(key)
    plate(k, x, z, mat)
  }
}

function plate(k: Kit, x: number, z: number, mat: MatKey) {
  k.box(mat, [0.12, 0.012, 0.12], [x, 0.006, z])
  for (const a of [-1, 1]) for (const b of [-1, 1]) anchorBolt(k, x + a * 0.042, 0.012, z + b * 0.042, 0.012)
}
