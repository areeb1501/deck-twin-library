// Flanged double-window flow sight glass: hollow forged body, opposed borosilicate windows in bolted square retainers, optional flapper indicator. Typical vendor face-to-face, B16.5 flanges.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { inch, pipeOD, type Rating } from '../lib/standards'
import { boreOf, flangeLength, portFlange } from './_piping'

export interface SightGlassProps {
  nps?: number
  rating?: Rating
  indicator?: 'none' | 'flapper'
  /** flapper deflection, 0 no flow … 1 full flow */
  flow?: number
  body?: MatKey
}

export const defaults = { nps: 4, rating: 150 as Rating, indicator: 'flapper' as 'none' | 'flapper', flow: 0.5, body: 'valveBody' as MatKey }

// typical: double-window flanged sight glass face-to-face (inches), class 150 and 300
const FF150: [number, number][] = [[0.5, 5], [1, 5.63], [1.5, 6.75], [2, 7.88], [3, 9.38], [4, 11], [6, 14.25], [8, 16.13]]
const FF300: [number, number][] = [[0.5, 5.5], [1, 6.25], [1.5, 7.5], [2, 8.63], [3, 11], [4, 13.25], [6, 21.38], [8, 23]]
const lerp = (t: [number, number][], x: number) => {
  if (x <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) if (x <= t[i][0]) return t[i - 1][1] + ((t[i][1] - t[i - 1][1]) * (x - t[i - 1][0])) / (t[i][0] - t[i - 1][0])
  return t[t.length - 1][1] * (x / t[t.length - 1][0])
}
function length(nps: number, rating: Rating) {
  const a = inch(rating <= 150 ? lerp(FF150, nps) : lerp(FF300, nps) * (rating <= 300 ? 1 : 1.2))
  return Math.max(a, 2 * flangeLength(nps, rating) + pipeOD(nps) * 1.1)
}

export function ports(p: SightGlassProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = length(nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function SightGlass({ nps = defaults.nps, rating = defaults.rating, indicator = defaults.indicator, flow = defaults.flow, body = defaults.body, ...group }: SightGlassProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, body), [nps, rating, body])
  const fl = useKit((k) => flapper(k, nps), [nps])
  const D = pipeOD(nps)
  return (
    <group {...group}>
      <KitMesh data={data} />
      {indicator === 'flapper' && (
        <group position={[-D * 0.25, D * 0.5, 0]} rotation-z={-Math.min(Math.max(flow, 0), 1) * 0.9}>
          <KitMesh data={fl} />
        </group>
      )}
    </group>
  )
}

export default SightGlass

const rect = (w: number, h: number, hole?: number) => {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2).lineTo(w / 2, h / 2).lineTo(-w / 2, h / 2).closePath()
  if (hole) {
    const p = new THREE.Path()
    p.absarc(0, 0, hole, 0, Math.PI * 2, true)
    s.holes.push(p)
  }
  return s
}
// extrude a shape lying in the plane (u, v) by depth along n, starting at `at`
const plate = (k: Kit, mat: MatKey, s: THREE.Shape, depth: number, at: V3, u: V3, v: V3, n: V3) =>
  k.extrude(mat, s, depth, new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(...v), new THREE.Vector3(...n)).setPosition(...at), 32)

function build(k: Kit, nps: number, rating: Rating, mat: MatKey) {
  const D = pipeOD(nps)
  const L = length(nps, rating)
  const fl = flangeLength(nps, rating)
  const bore = boreOf(nps, '40')
  for (const s of [-1, 1]) portFlange(k, nps, rating, [(s * L) / 2, 0, 0], [s, 0, 0], { mat, bore })
  // hollow body: two end walls with the bore, two window walls, top and bottom
  const Lb = L - 2 * fl
  const H = D * 1.25 + 0.02
  const W = D * 1.15 + 0.02
  const t = Math.max(0.01, D * 0.11)
  const rg = Math.min(Lb / 2 - t - 0.008, H / 2 - t - 0.004) * 0.92
  for (const s of [-1, 1]) {
    plate(k, mat, rect(W, H, bore), t, [s > 0 ? Lb / 2 - t : -Lb / 2, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0])
    plate(k, mat, rect(Lb - 2 * t, H, rg), t, [0, 0, s > 0 ? W / 2 - t : -W / 2], [1, 0, 0], [0, 1, 0], [0, 0, 1])
    k.box(mat, [Lb - 2 * t, t, W - 2 * t], [0, s * (H / 2 - t / 2), 0])
  }
  // windows: glass seated on the window wall, gasket, square retainer with four bolts
  const sq = 2 * rg + Math.max(0.035, D * 0.3)
  const tr = Math.max(0.012, D * 0.1)
  const bd = Math.max(0.008, Math.min(0.02, D * 0.09))
  for (const s of [-1, 1]) {
    const z0 = s * (W / 2)
    k.lathe('gasket', [[rg, -0.001], [rg + 0.008, -0.001], [rg + 0.008, 0.001], [rg, 0.001], [rg, -0.001]], [0, 0, z0 + s * 0.001], 'z', 40)
    k.cyl('glass', rg + 0.006, 0.012, [0, 0, z0 + s * 0.008], 'z', 40)
    plate(k, mat, rect(sq, sq, rg * 0.92), tr, [0, 0, s > 0 ? z0 + 0.002 : z0 - 0.002 - tr], [1, 0, 0], [0, 1, 0], [0, 0, 1])
    for (const cx of [-1, 1])
      for (const cy of [-1, 1]) {
        const p: V3 = [cx * (sq / 2 - bd * 1.3), cy * (sq / 2 - bd * 1.3), z0 + s * (0.002 + tr)]
        k.hex('nut', bd * 1.8, bd * 0.8, [p[0], p[1], p[2] + s * bd * 0.4], 'z')
        k.cyl('boltXylan', bd / 2, bd * 0.6, [p[0], p[1], p[2] + s * bd * 1.0], 'z', 8)
      }
  }
  // hinge bosses for the flapper pin, cast flow arrow and tag on top
  for (const s of [-1, 1]) k.cyl(mat, D * 0.08, 0.01, [-D * 0.25, D * 0.5, s * (W / 2 - t - 0.005)], 'z', 12)
  k.cyl('stainless', D * 0.03, W - 2 * t, [-D * 0.25, D * 0.5, 0], 'z', 8)
  const arrow = new THREE.Shape()
  const a = Math.min(Lb * 0.5, D * 0.9)
  arrow.moveTo(-a / 2, -0.008).lineTo(a / 4, -0.008).lineTo(a / 4, -0.018).lineTo(a / 2, 0).lineTo(a / 4, 0.018).lineTo(a / 4, 0.008).lineTo(-a / 2, 0.008).closePath()
  plate(k, mat, arrow, 0.003, [0, H / 2, -W * 0.2], [1, 0, 0], [0, 0, 1], [0, 1, 0])
  tagPlate(k, `${nps}" CL${rating}`, [0, H / 2 + 0.0008, W * 0.22], 'y', Math.min(0.08, Lb * 0.4))
}

/** Hinged flapper hanging from its pin, swings downstream (+X) with flow. */
function flapper(k: Kit, nps: number) {
  const D = pipeOD(nps)
  const h = D * 0.85
  k.box('stainless', [0.003, h, D * 0.7], [0, -h / 2, 0])
  k.cyl('stainless', D * 0.045, D * 0.72, [0, 0, 0], 'z', 10)
}
