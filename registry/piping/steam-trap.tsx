// Steam trap: thermodynamic disc trap or ball-float & thermostatic trap with integral strainer, blowdown, test valve and screwed or ASME B16.5 flanged ends.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall, type Rating } from '../lib/standards'
import { endFlange, flangeLen, hexRing, nptTpi, pipeStub, seg, thread } from './_flanges'

export type SteamTrapKind = 'thermodynamic' | 'float'

export interface SteamTrapProps {
  kind?: SteamTrapKind
  /** nominal size, inches (1/2–2) */
  nps?: number
  ends?: 'flanged' | 'screwed'
  rating?: Rating
  /** integral Y-type strainer with blowdown valve */
  strainer?: boolean
  /** downstream test valve */
  testValve?: boolean
  tag?: string
}

export const defaults = { kind: 'thermodynamic' as SteamTrapKind, nps: 0.75, ends: 'flanged' as const, rating: 300 as Rating, strainer: true, testValve: true, tag: 'ST-101' }

/** typical face-to-face: screwed body length, flanged length. */
function dims(p: SteamTrapProps) {
  const o = { ...defaults, ...p }
  const nps = Math.min(Math.max(o.nps, 0.5), 2)
  const od = pipeOD(nps)
  const fl = o.kind === 'float'
  const body = fl ? 0.13 + od * 1.6 : 0.06 + od * 0.9
  const L = o.ends === 'flanged' ? Math.max(body + 2 * flangeLen(nps, o.rating) + 0.03, fl ? 0.25 : 0.15) : body
  return { ...o, nps, od, fl, body, L }
}

export function ports(p: SteamTrapProps = {}): Port[] {
  const d = dims(p)
  const r = d.ends === 'flanged' ? d.rating : undefined
  return [port('A', 'Inlet (steam / condensate)', [-d.L / 2, 0, 0], [-1, 0, 0], d.nps, r), port('B', 'Outlet (condensate)', [d.L / 2, 0, 0], [1, 0, 0], d.nps, r)]
}

export function SteamTrap({ kind = defaults.kind, nps = defaults.nps, ends = defaults.ends, rating = defaults.rating, strainer = defaults.strainer, testValve = defaults.testValve, tag = defaults.tag, ...group }: SteamTrapProps & GroupProps) {
  const data = useKit((k) => build(k, { kind, nps, ends, rating, strainer, testValve, tag }), [kind, nps, ends, rating, strainer, testValve, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SteamTrap

const BODY = 'stainless'

function build(k: Kit, p: SteamTrapProps) {
  const d = dims(p)
  const { nps, od, L, body } = d
  const ro = od / 2
  const ri = ro - pipeWall(nps, '80')
  const xb = body / 2
  const hubR = ro * 1.35
  const n = 32
  const M = d.fl ? 'castIron' : BODY
  // end hubs: screwed (female NPT in a hex-flatted boss) or socket for the flange neck
  for (const s of [-1, 1]) {
    const x0 = s * xb
    if (d.ends === 'screwed') {
      const pitch = 0.0254 / nptTpi(nps)
      const Lt = Math.min(body * 0.22, 0.6 * od)
      hexRing(k, hubR * 2.0, ro + pitch * 0.9, [x0, 0, 0], [-s, 0, 0], body * 0.18, M)
      k.lathe('machined', [[ro + pitch * 0.9, 0], ...thread(ro - pitch * 0.5, ro - pitch * 0.5 - Lt / 32, 0.002, Lt, pitch, true)], [x0, 0, 0], [-s, 0, 0], n)
      k.lathe('pipeBore', [[ri, Lt], [ri, body * 0.4]], [x0, 0, 0], [-s, 0, 0], n)
    } else {
      k.lathe(M, [[hubR, 0], [hubR, body * 0.22]], [x0, 0, 0], [-s, 0, 0], n)
      k.lathe(M, [[ri, 0], [hubR, 0]].reverse() as [number, number][], [x0, 0, 0], [-s, 0, 0], n)
      k.lathe('pipeBore', [[ri, 0], [ri, body * 0.4]].reverse() as [number, number][], [x0, 0, 0], [-s, 0, 0], n)
      const fl = endFlange(k, nps, d.rating, [s * L / 2, 0, 0], [s, 0, 0], '80')
      const gap = L / 2 - fl - xb
      if (gap > 0) pipeStub(k, [s * xb, 0, 0], [s, 0, 0], gap, nps, '80', 'open', 'open')
    }
  }
  if (d.fl) floatBody(k, d, xb, hubR)
  else tdBody(k, d, hubR)
  // integral strainer leg: screen pointing down and downstream, cap and blowdown valve
  if (d.strainer) {
    const dir = new THREE.Vector3(d.fl ? -0.5 : 0.5, -1, 0).normalize()
    const len = d.fl ? body * 0.45 : body * 0.55
    const base: V3 = d.fl ? [-xb * 0.7, -hubR * 0.4, 0] : [-xb * 0.25, -hubR * 0.4, 0]
    const end = new THREE.Vector3(...base).addScaledVector(dir, len)
    k.rod(M, base, end.toArray() as V3, hubR * 0.75, 20)
    const D = dir.toArray() as V3
    k.hex('nut', hubR * 1.9, hubR * 0.5, end.clone().addScaledVector(dir, hubR * 0.25).toArray() as V3, D)
    const bv = end.clone().addScaledVector(dir, hubR * 0.55)
    k.cyl('brass', hubR * 0.22, hubR * 0.6, bv.toArray() as V3, D, 12)
    k.box('actuatorRed', [hubR * 1.6, hubR * 0.12, hubR * 0.3], bv.clone().addScaledVector(dir, hubR * 0.3).add(new THREE.Vector3(hubR * 0.7, 0, 0)).toArray() as V3)
  }
  // test valve on the outlet: small piston valve discharging downwards, T-handle up
  if (d.testValve) {
    const x = xb * 0.62
    const top = hubR * 1.05
    k.cyl(BODY, hubR * 0.32, hubR * 0.5, [x, top, 0], 'y', 16)
    k.rbox(BODY, [hubR * 0.9, hubR * 0.7, hubR * 0.7], hubR * 0.1, [x, top + hubR * 0.55, 0])
    k.cyl(BODY, hubR * 0.16, hubR * 0.7, [x + hubR * 0.6, top + hubR * 0.45, 0], [0.7, -0.7, 0], 10)
    k.rod('stainless', [x, top + hubR * 0.9, 0], [x, top + hubR * 1.6, 0], hubR * 0.08, 8)
    k.rod('handwheel', [x - hubR * 0.6, top + hubR * 1.6, 0], [x + hubR * 0.6, top + hubR * 1.6, 0], hubR * 0.09, 8)
  }
  if (d.tag) tagPlate(k, d.tag, [0, 0, hubR + 0.003], 'z', Math.min(0.08, body * 0.5))
  // cast flow arrow on the body side
  k.box(paint('#2b3035'), [body * 0.35, 0.003, 0.0015], [0, -hubR * 0.55, hubR + 0.001])
  k.cyl(paint('#2b3035'), 0.006, 0.012, [body * 0.19, -hubR * 0.55, hubR + 0.001], [1, 0, 0], 3)
}

/** Thermodynamic trap: forged body, disc chamber under a screwed cap with insulating cover. */
function tdBody(k: Kit, d: ReturnType<typeof dims>, hubR: number) {
  const { body } = d
  k.rbox(BODY, [body * 0.62, hubR * 2.1, hubR * 2.1], hubR * 0.25, [0, 0, 0])
  const capR = hubR * 1.25
  const y0 = hubR * 1.0
  k.lathe(BODY, [[capR * 0.92, y0 - 0.004], [capR, y0], [capR, y0 + hubR * 0.9], [capR * 0.9, y0 + hubR * 1.15], [0, y0 + hubR * 1.15]], [0, 0, 0], 'y', 40)
  k.hex(BODY, capR * 2.2 * 0.6, hubR * 0.3, [0, y0 + hubR * 1.27, 0], 'y')
}

/** Ball-float & thermostatic trap: cast chamber below the line, bolted cover, air vent boss, drain plug. */
function floatBody(k: Kit, d: ReturnType<typeof dims>, xb: number, hubR: number) {
  const { body } = d
  const Rc = body * 0.36
  const cy = -Rc * 0.55
  const depth = body * 0.5
  const n = seg(Rc * 2)
  // chamber (axis Z) with a cover flange and bolts on the +Z face
  k.cyl('castIron', Rc, depth, [0, cy, -depth * 0.1], 'z', n)
  k.cyl('castIron', Rc * 1.12, depth * 0.14, [0, cy, depth * 0.45], 'z', n)
  k.cyl('castIron', Rc * 1.12, depth * 0.1, [0, cy, -depth * 0.55], 'z', n)
  const nb = 8
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + Math.PI / nb
    k.hex('nut', Rc * 0.16, Rc * 0.08, [Math.cos(a) * Rc * 1.0, cy + Math.sin(a) * Rc * 1.0, depth * 0.56], 'z')
  }
  // inlet / outlet bosses joining the line to the chamber
  for (const s of [-1, 1]) k.rod('castIron', [s * xb, 0, 0], [s * Rc * 0.55, cy * 0.4, 0], hubR * 0.95, 16)
  // thermostatic air vent capsule boss on top, drain plug underneath
  k.cyl('castIron', hubR * 0.7, hubR * 0.9, [-Rc * 0.35, cy + Rc * 0.95, 0], 'y', 16)
  k.hex('nut', hubR * 1.2, hubR * 0.3, [-Rc * 0.35, cy + Rc * 0.95 + hubR * 0.55, 0], 'y')
  k.hex('nut', hubR * 1.0, hubR * 0.3, [0, cy - Rc - hubR * 0.1, 0], 'y')
}
