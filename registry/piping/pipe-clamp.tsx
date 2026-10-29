// Pipe clamps per MSS SP-58: two-bolt (Type 4) and three-bolt (Type 3) hanger clamps on a rod with weldless eye nut, and a riser clamp bearing on steel.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member } from '../lib/parts'
import { inch, pipeOD, pipeWall } from '../lib/standards'

export type ClampType = 'two-bolt' | 'three-bolt' | 'riser'

export interface PipeClampProps {
  type?: ClampType
  nps?: number
  /** hanger rod length from the clamp to the steel above, m (two- and three-bolt) */
  rod?: number
  /** draw a length of the pipe for context */
  pipe?: boolean
  finish?: 'galvanised' | 'painted'
}

export const defaults = { type: 'three-bolt' as ClampType, nps: 6, rod: 0.6, pipe: false, finish: 'galvanised' as 'galvanised' | 'painted' }

export function PipeClamp({ type = defaults.type, nps = defaults.nps, rod = defaults.rod, pipe = defaults.pipe, finish = defaults.finish, ...group }: PipeClampProps & GroupProps) {
  const data = useKit((k) => build(k, type, nps, Math.max(0.15, rod), pipe, finish === 'galvanised' ? 'galvanised' : 'structSteel'), [type, nps, rod, pipe, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PipeClamp

// typical strap, bolt and rod sizes by pipe size (vendor tables, light series)
function sizes(nps: number) {
  const t = nps <= 2 ? 0.005 : nps <= 6 ? 0.008 : nps <= 12 ? 0.01 : 0.0125
  const w = nps <= 2 ? 0.032 : nps <= 8 ? 0.05 : 0.065
  const bd = nps <= 2 ? 0.0127 : nps <= 6 ? 0.019 : nps <= 12 ? 0.022 : 0.025
  const rd = nps <= 2 ? 0.0095 : nps <= 6 ? 0.0159 : nps <= 12 ? 0.0222 : 0.0254
  return { t, w, bd, rd }
}

/** One strap half on the +u side: ear up to `top`, half ring round the pipe, ear down to -`bot`. Shape in (u, v), gap between ears 2·g. */
function strapShape(ro: number, t: number, g: number, top: number, bot: number) {
  const s = new THREE.Shape()
  const ao = Math.asin(Math.min((g + t) / (ro + t), 0.99))
  const ai = Math.asin(Math.min(g / ro, 0.99))
  s.moveTo(g + t, top)
  s.lineTo(g + t, (ro + t) * Math.cos(ao))
  s.absarc(0, 0, ro + t, Math.PI / 2 - ao, -Math.PI / 2 + ao, true)
  s.lineTo(g + t, -bot)
  s.lineTo(g, -bot)
  s.lineTo(g, -ro * Math.cos(ai))
  s.absarc(0, 0, ro, -Math.PI / 2 + ai, Math.PI / 2 - ai, false)
  s.lineTo(g, top)
  s.closePath()
  return s
}

function bolt(k: Kit, mat: MatKey, y: number, x: number, g: number, t: number, d: number, axis: 'z' = 'z') {
  const L = 2 * (g + t) + d * 2.4
  k.cyl(mat, d / 2, L, [x, y, 0], axis, 10)
  k.hex(mat, d * 1.9, d * 0.7, [x, y, -(g + t + d * 0.35)], axis)
  k.hex(mat, d * 1.9, d * 0.85, [x, y, g + t + d * 0.43], axis)
}

function build(k: Kit, type: ClampType, nps: number, rodL: number, showPipe: boolean, mat: MatKey) {
  const od = pipeOD(nps)
  const ro = od / 2 + 0.001
  const { t, w, bd, rd } = sizes(nps)
  if (type === 'riser') return riser(k, nps, ro, showPipe, mat)
  const g = type === 'three-bolt' ? Math.max(bd * 0.75, inch(0.53)) : bd * 0.6
  // three-bolt: long upper ears with a load bolt and a spacer bolt; two-bolt: short ears, load bolt just above the pipe
  const top = type === 'three-bolt' ? ro + Math.max(0.07, od * 0.45) : ro + bd * 2.6
  const bot = ro + bd * 2.4
  const yLoad = top - bd * 1.4
  const m = (sx: number) => new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, sx), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(-w / 2, 0, 0)
  for (const sx of [-1, 1]) k.extrude(mat, strapShape(ro, t, g, top, bot), w, m(sx), 40)
  bolt(k, mat, yLoad, 0, g, t, bd)
  bolt(k, mat, -(ro + bd * 1.2), 0, g, t, bd)
  if (type === 'three-bolt') bolt(k, mat, ro + bd * 1.3, 0, g, t, bd)
  // weldless eye nut on the load bolt, hanger rod with lock nut, welded lug on a short beam above
  k.torus(mat, bd * 0.95, bd * 0.38, [0, yLoad, 0], 'z', 8, 20)
  const yEye = yLoad + bd * 1.3
  k.box(mat, [rd * 2.4, rd * 2.6, Math.min(2 * g - 0.002, rd * 2)], [0, yEye + rd * 1.3, 0])
  const yTop = yEye + rd * 2.6 + rodL
  k.cyl(mat, rd / 2, rodL + 0.04, [0, yEye + rd * 2.6 + (rodL - 0.04) / 2, 0], 'y', 10)
  k.hex('nut', rd * 1.9, rd * 0.9, [0, yEye + rd * 3.1, 0])
  k.hex('nut', rd * 1.9, rd * 0.9, [0, yTop - 0.06, 0])
  k.box(mat, [0.07, 0.07, 0.012], [0, yTop - 0.035, 0])
  k.cyl(mat, rd * 0.8, 0.014, [0, yTop - 0.045, 0], 'z', 12)
  member(k, [0, yTop + 0.1, -0.25], [0, yTop + 0.1, 0.25], 'IPE 200', 'structSteel', [0, 1, 0])
  if (showPipe) k.pipe('pipePaint', [-0.6, 0, 0], [0.6, 0, 0], od, pipeWall(nps, 'STD'))
}

/** Riser clamp: two bent bars bolted across a vertical pipe, ears bearing on two support beams. */
function riser(k: Kit, nps: number, ro: number, showPipe: boolean, mat: MatKey) {
  const od = pipeOD(nps)
  const t = nps <= 4 ? 0.008 : nps <= 8 ? 0.0125 : 0.016
  const h = nps <= 4 ? 0.05 : 0.065
  const bd = nps <= 4 ? 0.0127 : nps <= 12 ? 0.016 : 0.02
  const A = od + inch(9.5)
  const g = bd * 0.6
  // bar shape in plan (u = x along the bar, v = z), mirrored for the second bar
  const s = new THREE.Shape()
  const ao = Math.acos(Math.min((g + t) / (ro + t), 0.99))
  const ai = Math.acos(Math.min(g / ro, 0.99))
  s.moveTo(-A / 2, g)
  s.lineTo(-ro * Math.sin(ai), g)
  s.absarc(0, 0, ro, Math.PI / 2 + ai, Math.PI / 2 - ai, true)
  s.lineTo(A / 2, g)
  s.lineTo(A / 2, g + t)
  s.lineTo((ro + t) * Math.sin(ao), g + t)
  s.absarc(0, 0, ro + t, Math.PI / 2 - ao, Math.PI / 2 + ao, false)
  s.lineTo(-A / 2, g + t)
  s.closePath()
  for (const sz of [-1, 1]) {
    // shape v maps to ±Z; the extrusion runs through the bar depth h along Y
    k.extrude(mat, s, h, new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, sz), new THREE.Vector3(0, -sz, 0)).setPosition(0, (sz * h) / 2, 0), 40)
  }
  for (const sx of [-1, 1]) {
    const x = sx * (A / 2 - bd * 1.8)
    k.cyl(mat, bd / 2, 2 * (g + t) + bd * 2.4, [x, 0, 0], 'z', 10)
    k.hex(mat, bd * 1.9, bd * 0.7, [x, 0, -(g + t + bd * 0.35)], 'z')
    k.hex(mat, bd * 1.9, bd * 0.85, [x, 0, g + t + bd * 0.43], 'z')
    // ears bear on short channel supports
    const xs = sx * (A / 2 - 0.035)
    member(k, [xs, -h / 2 - 0.05, -0.18], [xs, -h / 2 - 0.05, 0.18], 'UPN 100', 'structSteel', [0, 1, 0])
  }
  if (showPipe) k.pipe('pipePaint', [0, -0.7, 0], [0, 0.7, 0], od, pipeWall(nps, 'STD'))
}
