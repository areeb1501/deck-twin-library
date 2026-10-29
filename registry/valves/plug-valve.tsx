// Lubricated taper plug valve: short-pattern body, bolted cover, sealant fitting, wrench or worm gear. API 599 / API 6D, ASME B16.10.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, handwheelDia, type Rating } from '../lib/standards'
import * as THREE from 'three'
import { bore, clamp, classK, dims, endFlange, flowArrow, plateText, plug, punchX, revolveX, useKit2 } from './_body'
import { wormGear } from './_operators'

export interface PlugValveProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** auto: wrench up to NPS 6, gear above */
  operator?: 'auto' | 'wrench' | 'gear'
  /** 0 closed … 1 open (quarter turn) */
  open?: number
  body?: MatKey
  tag?: string
}

export const defaults = { nps: 4, rating: 300 as Rating, operator: 'auto' as 'auto' | 'wrench' | 'gear', open: 1, body: 'valveBody' as MatKey, tag: '' }

export function ports(p: PlugValveProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const L = faceToFace('plug', nps, rating)
  return [port('A', 'End A', [-L / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'End B', [L / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function PlugValve(props: PlugValveProps & GroupProps) {
  const { nps, rating, operator, open, body, tag, ...group } = { ...defaults, ...props }
  const gear = operator === 'gear' || (operator === 'auto' && nps > 6)
  const [fixed, moving] = useKit2((k, mv) => build(k, mv, nps, rating, gear, body, tag), [nps, rating, gear, body, tag])
  return (
    <group {...group}>
      <KitMesh data={fixed} />
      <KitMesh data={moving} rotation-y={-(1 - clamp(open, 0, 1)) * (Math.PI / 2)} />
    </group>
  )
}

export default PlugValve

function build(k: Kit, mv: Kit, nps: number, rating: Rating, gear: boolean, M: MatKey, tag: string) {
  const L = faceToFace('plug', nps, rating)
  const d = dims(nps, rating, L)
  const { D, f, xf, ri } = d
  const rn = Math.max(D / 2 * 1.1, (f.hubDia / 2) * 0.94)
  for (const s of [-1, 1] as const) endFlange(k, d, s, rn, ri, M)
  const Rp = Math.min(D * 0.62 + 0.015, xf * 0.9)
  revolveX(k, M, ri, [[rn, -xf - 0.004], [rn * 1.04, -Rp * 0.7], [rn * 1.04, Rp * 0.7], [rn, xf + 0.004]], d.seg)
  // tapered plug chamber about Y
  const yb = -Math.max(Rp * 1.05, f.od / 2 * 0.92)
  const yt = Math.max(Rp * 1.15, f.od / 2 * 1.08)
  // tapered plug chamber about Y, opened where the bore passes (the neck covers the cut edge)
  const hole = (ri + rn) / 2
  k.add(M, punchX(new THREE.CylinderGeometry(Rp * 1.02, Rp * 0.86, yt - yb, 72, 40), hole, new THREE.Matrix4().makeTranslation(0, (yt + yb) / 2, 0)))
  for (const s of [-1, 1]) {
    k.box(M, [0.006 + D * 0.03, yt - rn * 1.05, Rp * 0.5], [s * Rp * 0.55, (yt + rn * 1.05) / 2, Rp * 0.62])
    k.box(M, [0.006 + D * 0.03, -rn * 1.05 - yb, Rp * 0.5], [s * Rp * 0.55, (yb - rn * 1.05) / 2, Rp * 0.62])
  }
  // taper plug with its port (turns with the stem)
  const rpl = Rp * 0.8
  const rport = ri * 0.82
  mv.add('machined', punchX(new THREE.CylinderGeometry(rpl * 1.04, rpl * 0.9, yt - yb - 0.01, 64, 40), rport * 1.02, new THREE.Matrix4().makeTranslation(0, (yt + yb) / 2, 0)))
  bore(mv, rport, -rpl * 0.98, rpl * 0.98, 24)
  bore(k, ri, -L / 2, -rpl * 1.0)
  bore(k, ri, rpl * 1.0, L / 2)
  // bolted top cover with gland, bottom cover with adjusting screw
  const bd = clamp(f.boltDia * 0.8, 0.01, 0.03)
  const tc = Math.max(0.014, D * 0.1)
  const rc = Rp * 1.12
  k.cyl(M, rc, tc, [0, yt + tc / 2, 0], 'y', d.seg)
  k.boltCircle('boltXylan', 'nut', nps >= 6 ? 8 : 6, rc - bd * 1.4, [0, yt - Rp * 0.12, 0], 'y', bd, tc + Rp * 0.12 + bd * 1.6, [tc + Rp * 0.12 + bd * 1.1])
  k.cyl(M, rc * 0.92, Rp * 0.12, [0, yt - Rp * 0.06, 0], 'y', d.seg)
  const rg = Math.max(0.02, D * 0.2)
  const yg = yt + tc
  k.cyl(M, rg, Math.max(0.02, D * 0.15), [0, yg + Math.max(0.01, D * 0.075), 0], 'y', 24)
  const ys = yg + Math.max(0.02, D * 0.15)
  // bolted gland: flange plate and two gland studs, side sealant injection fitting on the body
  k.box(M, [rg * 3.2, 0.012, rg * 1.3], [0, ys - 0.006, 0])
  for (const s of [-1, 1]) {
    k.rod('boltXylan', [s * rg * 1.3, yg - 0.005, 0], [s * rg * 1.3, ys + 0.02, 0], Math.max(0.004, bd * 0.4), 8)
    k.hex('nut', bd * 0.9, bd * 0.5, [s * rg * 1.3, ys + bd * 0.25, 0])
  }
  const zf = Rp * 0.98
  k.cyl(M, Math.max(0.01, D * 0.06), 0.02, [-Rp * 0.35, Rp * 0.55, zf], 'z', 12)
  k.hex('brass', Math.max(0.016, D * 0.08), 0.014, [-Rp * 0.35, Rp * 0.55, zf + 0.016], 'z')
  k.sphere('brass', Math.max(0.008, D * 0.035), [-Rp * 0.35, Rp * 0.55, zf + 0.028], undefined, 10)
  k.cyl(M, Rp * 0.9, Math.max(0.012, D * 0.08), [0, yb - Math.max(0.006, D * 0.04), 0], 'y', d.seg)
  plug(k, M, [0, yb - Math.max(0.012, D * 0.08), 0], '-y', Math.max(0.014, D * 0.09))
  // stop collar with two stop lugs (open / closed)
  k.box(M, [rg * 0.5, 0.014, rg * 0.5], [rg * 1.3, ys + 0.007, 0])
  k.box(M, [rg * 0.5, 0.014, rg * 0.5], [0, ys + 0.007, rg * 1.3])
  tagPlate(k, tag || plateText(nps, rating), [0, Rp * 0.25, Rp * 0.99 + 0.003], 'z', clamp(Rp * 0.9, 0.05, 0.14))
  flowArrow(k, 'stainless', [0, -Rp * 0.45, Rp * 0.92], clamp(Rp * 0.9, 0.04, 0.2))
  // stem with square head and sealant (lubricant) fitting on top
  const stemR = Math.max(0.01, D * 0.09)
  mv.cyl('stainless', stemR, ys - yt + 0.03, [0, (ys + yt) / 2, 0], 'y', 12)
  if (gear) {
    const g = clamp((0.08 + D * 0.6) * classK(rating), 0.14, 0.6)
    const top = wormGear(k, mv, ys, g, handwheelDia('plug', nps, rating), M, Math.max(f.od / 2, Rp * 1.2) + 0.08)
    k.hex('brass', 0.03, 0.02, [g * 0.35, top - 0.05, -g * 0.35])
    k.sphere('brass', 0.014, [g * 0.35, top - 0.035, -g * 0.35], undefined, 10)
  } else {
    const sq = stemR * 2.2
    mv.box('stainless', [sq, sq * 0.9, sq], [0, ys + sq * 0.45, 0])
    const wl = clamp(0.25 + 0.1 * nps, 0.3, 0.9)
    const h = sq * 1.2
    const yw = ys + sq * 0.9
    mv.box('handwheel', [sq * 2, h, sq * 2], [0, yw + h / 2, 0])
    mv.box('handwheel', [wl, h * 0.5, Math.max(0.022, wl * 0.06)], [wl / 2, yw + h * 0.6, 0])
    mv.cyl('handwheel', Math.max(0.014, wl * 0.03), wl * 0.3, [wl * 0.82, yw + h * 0.6, 0], 'x', 12)
    mv.hex('brass', sq * 1.1, sq * 0.6, [0, yw + h + sq * 0.3, 0])
    mv.sphere('brass', sq * 0.4, [0, yw + h + sq * 0.7, 0], undefined, 10)
  }
}
