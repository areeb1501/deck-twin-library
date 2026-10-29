// Flanged swing check valve: bolted cover, hinge-pin bosses, cast flow arrow, optional external lever and counterweight. API 6D / BS 1868, ASME B16.10.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { faceToFace, type Rating } from '../lib/standards'
import { barrel, bore, clamp, dims, endFlange, flowArrow, ovalJoint, plateText, plug, revolveX, useKit2 } from './_body'
import { tagPlate } from '../lib/parts'

export interface SwingCheckValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** external lever and counterweight on the hinge shaft */
  counterweight?: boolean
  /** disc swing, 0 seated … 1 fully open (moves the counterweight lever) */
  open?: number
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 6, rating: 300 as Rating, counterweight: false, open: 0, body: 'valveBody' as MatKey, tag: '' }

export function ports(p: SwingCheckValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('swing-check', nps, rating)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

function hinge(nps: number, rating: Rating) {
  const d = dims(nps, rating, faceToFace('swing-check', nps, rating))
  const Rc = d.D * 0.72 + 0.015
  const rx = Math.min(Rc * 1.05, d.xf * 0.8)
  const rz = Rc * 0.86
  return { d, Rc, rx, rz, pivot: [-rx * 0.55, Rc * 0.62, 0] as [number, number, number] }
}

export function SwingCheckValve(props: SwingCheckValveProps & GroupProps) {
  const { nps, rating, counterweight, open, body, tag, ...group } = { ...defaults, ...props }
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, counterweight, body, tag), [nps, rating, counterweight, body, tag])
  const { pivot } = hinge(nps, rating)
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      {counterweight && (
        <group position={pivot} rotation-z={clamp(open, 0, 1) * 1.1}>
          <KitMesh data={moving} />
        </group>
      )}
    </group>
  )
}

export default SwingCheckValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, counterweight: boolean, M: MatKey, tag: string) {
  const { d, Rc, rx, rz, pivot } = hinge(nps, rating)
  const { D, f, xf, ri, L } = d
  const rn = Math.max(D / 2 * 1.1, (f.hubDia / 2) * 0.94)
  for (const s of [-1, 1] as const) endFlange(k, d, s, rn, ri, M)
  const a = Math.min(Rc * 1.6, xf * 1.1)
  revolveX(k, M, ri, [[rn, -xf - 0.004], ...barrel(Rc, a, -Math.min(xf, a * 0.98), Math.min(xf, a * 0.98), rn, 26), [rn, xf + 0.004]], d.seg + 8)
  bore(k, ri, -L / 2, -Rc * 0.62)
  bore(k, ri, Rc * 0.62, L / 2)
  k.disc('pipeBore', ri, [-Rc * 0.62, 0, 0], '-x', 20)
  k.disc('pipeBore', ri, [Rc * 0.62, 0, 0], 'x', 20)
  // disc chamber and bolted cover
  const yTop = Rc * 1.02
  const yc0 = Math.max(Rc * 0.3, ri * 1.08)
  k.add(M, new THREE.CylinderGeometry(1, 1, yTop - yc0, 40), new THREE.Matrix4().makeScale(rx, 1, rz).setPosition(0, (yTop + yc0) / 2, 0))
  const t = Math.max(0.01, D * 0.1)
  const bd = clamp(f.boltDia * 0.85, 0.01, 0.032)
  ovalJoint(k, M, yTop, rx + bd * 2.4, rz + bd * 2.4, t, nps >= 8 ? 16 : nps >= 4 ? 12 : 8, bd)
  k.sphere(M, 1, [0, yTop + t, 0], [rx * 0.85, Rc * 0.22, rz * 0.85], 32)
  if (nps >= 4) {
    const e = clamp(D * 0.25, 0.025, 0.08)
    k.cyl(M, e * 0.5, e * 0.6, [0, yTop + t + Rc * 0.2, 0], 'y', 12)
    k.torus('flangeSteel', e * 0.55, e * 0.16, [0, yTop + t + Rc * 0.2 + e * 0.8, 0], 'z', 8, 20)
  }
  // hinge-pin bosses with plugs both sides
  const bossR = Math.max(0.014, D * 0.13)
  const bossL = Math.max(0.025, D * 0.2)
  for (const s of [-1, 1]) {
    k.cyl(M, bossR, bossL + rz * 0.3, [pivot[0], pivot[1], s * (rz * 0.85 + bossL / 2)], 'z', 20)
    if (!(counterweight && s > 0)) k.hex('nut', bossR * 1.5, bossR * 0.5, [pivot[0], pivot[1], s * (rz * 1.0 + bossL + bossR * 0.25)], 'z')
  }
  flowArrow(k, 'stainless', [0, -Rc * 0.3, Rc * 0.94], clamp(Rc * 1.1, 0.05, 0.35))
  tagPlate(k, tag || plateText(nps, rating), [rx * 0.35, Rc * 0.62, rz + 0.003], 'z', clamp(rx * 0.7, 0.05, 0.14))
  plug(k, M, [0, -Rc * 0.95, 0], '-y', Math.max(0.012, D * 0.07))
  if (counterweight) {
    // shaft through a packed gland, lever arm downstream and a cast weight (moving about the hinge axis)
    const z0 = rz * 1.0 + bossL
    k.hex('nut', bossR * 1.6, bossR * 0.4, [pivot[0], pivot[1], z0 + bossR * 0.2], 'z')
    const arm = Math.max(0.18, D * 2.2)
    const zl = z0 + bossR * 0.9
    mv.cyl('stainless', bossR * 0.45, bossR * 1.4, [0, 0, z0 - pivot[2] + bossR * 0.4], 'z', 12)
    mv.box('handwheel', [bossR * 2.4, bossR * 2.4, bossR * 0.8], [0, 0, zl])
    mv.box('handwheel', [arm, bossR * 0.9, bossR * 0.6], [arm / 2, -bossR * 0.3, zl])
    const w = Math.max(0.05, D * 0.5)
    mv.cyl('castIron', w * 0.5, w * 0.8, [arm * 0.85, -bossR * 0.3, zl], 'z', 24)
  }
}
