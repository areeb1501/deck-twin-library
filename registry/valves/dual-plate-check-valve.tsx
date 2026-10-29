// Dual-plate wafer check valve: wafer body, two spring-loaded half plates on a hinge pin, stop pin with body retainer plugs, lifting eye. API 594 Type A.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, flange, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { bore, clamp, companionFlanges, flowArrow, plateText, useKit2 } from './_body'

export interface DualPlateCheckValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** plate swing, 0 seated … 1 fully open (about 80°) */
  open?: number
  /** draw the pipe-side flanges, gaskets and through-studs (leave off inside a plant: the line supplies them) */
  companionFlanges?: boolean
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 6, rating: 300 as Rating, open: 0, companionFlanges: false, body: 'valveBody' as MatKey, tag: '' }

export function ports(p: DualPlateCheckValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('dual-plate-check', nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

function geo(nps: number, rating: Rating) {
  const L = faceToFace('dual-plate-check', nps, rating)
  const D = pipeOD(nps)
  const ri = D / 2 - pipeWall(nps, 'STD')
  const pinR = Math.max(0.004, D * 0.035)
  const xp = L / 2 - Math.max(pinR * 2.6, L * 0.3)
  return { L, D, ri, pinR, xp, t: Math.max(0.006, D * 0.06) }
}

export function DualPlateCheckValve(props: DualPlateCheckValveProps & GroupProps) {
  const { nps, rating, open, companionFlanges: cf, body, tag, ...group } = { ...defaults, ...props }
  const [fixed, plate] = useKit2((k, mv) => build(k, mv, nps, rating, cf, body, tag), [nps, rating, cf, body, tag])
  const { xp } = geo(nps, rating)
  const a = clamp(open, 0, 1) * THREE.MathUtils.degToRad(80)
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <group position={[xp, 0, 0]} rotation-y={a}>
        <KitMesh data={plate} />
      </group>
      <group position={[xp, 0, 0]} rotation-y={-a} scale={[1, 1, -1]}>
        <KitMesh data={plate} />
      </group>
    </group>
  )
}

export default DualPlateCheckValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, cf: boolean, M: MatKey, tag: string) {
  const { L, D, ri, pinR, xp, t } = geo(nps, rating)
  const f = flange(nps, rating)
  const Rw = f.boltCircle / 2 - f.boltDia * 0.62 - 0.003
  const rs = ri * 0.9
  // wafer body with machined gasket faces and seat
  k.lathe(M, [[rs, -L / 2 + 0.001], [Rw - 0.004, -L / 2 + 0.001], [Rw, -L / 2 + 0.005], [Rw, L / 2 - 0.005], [Rw - 0.004, L / 2 - 0.001], [ri, L / 2 - 0.001]], [0, 0, 0], 'x', nps >= 6 ? 48 : 32)
  for (const s of [-1, 1]) k.lathe('machined', [[f.raisedFace / 2, 0], [f.raisedFace / 2, 0.0004], [s > 0 ? ri : rs, 0.0004]], [s * (L / 2 - 0.0012), 0, 0], s > 0 ? 'x' : '-x', 40)
  k.lathe('machined', [[ri, xp - t - pinR], [rs, xp - t - pinR]], [0, 0, 0], 'x', 32)
  bore(k, rs, xp - t - pinR, -L / 2 + 0.002, 32)
  bore(k, ri, xp - t - pinR, L / 2)
  // centre rib of the seat, hinge pin and stop pin with their retainer plugs
  k.box(M, [0.004, rs * 2, Math.max(0.006, D * 0.05)], [xp - t - pinR - 0.002, 0, 0])
  k.cyl('stainless', pinR, ri * 2 + 0.004, [xp, 0, 0], 'y', 12)
  const xs = Math.min(L / 2 - pinR * 1.6, xp + ri * 0.5)
  k.cyl('stainless', pinR * 1.1, ri * 2 + 0.004, [xs, 0, 0], 'y', 12)
  for (const s of [-1, 1]) for (const x of [xp, xs]) k.hex('nut', pinR * 3.2, pinR * 1.2, [x, s * (Rw + pinR * 0.5), 0], 'y')
  // lifting eye, nameplate, flow arrow
  if (nps >= 4) {
    const e = clamp(D * 0.22, 0.02, 0.07)
    k.cyl(M, e * 0.45, e * 0.6, [-L * 0.2, Rw + e * 0.3, 0], 'y', 12)
    k.torus('flangeSteel', e * 0.55, e * 0.15, [-L * 0.2, Rw + e * 1.1, 0], 'x', 8, 20)
  }
  const pw = clamp(L * 0.8, 0.04, 0.12)
  const ang = Math.asin(0.32)
  tagPlate(k, tag || plateText(nps, rating), [0, Rw * 0.32, Rw * Math.cos(ang) + 0.002], [0, 0.32, Math.cos(ang)], pw)
  k.with(new THREE.Matrix4().makeRotationX(ang), () => flowArrow(k, 'stainless', [0, 0, Rw + 0.001], clamp(L * 0.75, 0.04, 0.3)))
  if (cf) companionFlanges(k, nps, rating, L)
  // one half plate (z > 0) in the pivot frame; the other is its mirror
  const pr = ri * 0.99
  const plate = new THREE.CylinderGeometry(pr, pr, t, 32, 1, false, 0, Math.PI)
  plate.rotateZ(Math.PI / 2)
  mv.add('stainless', plate, new THREE.Matrix4().makeTranslation(-t / 2 - pinR, 0, 0.002))
  for (const y of [-pr * 0.6, 0, pr * 0.6]) mv.box('stainless', [pinR * 2.2, pr * 0.16, pinR * 3], [-pinR * 0.6, y, pinR * 1.4])
  mv.box('stainless', [t * 0.5, pr * 1.2, Math.max(0.004, D * 0.03)], [-t * 0.2 - pinR, 0, pr * 0.5])
}
