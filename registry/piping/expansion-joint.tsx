// Metallic bellows expansion joint (EJMA): single, tied, hinged, gimbal or in-line pressure-balanced, with flanged ends, internal liner and external cover.
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { inch, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { bellows, flangeLen, inlineEnds, seg } from './_flanges'

export type ExpansionJointKind = 'single' | 'tied' | 'hinged' | 'gimbal' | 'pressure-balanced'

export interface ExpansionJointProps {
  kind?: ExpansionJointKind
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** convolutions per bellows */
  convolutions?: number
  /** internal flow liner (flow arrow points A to B) */
  liner?: boolean
  /** external bellows cover */
  cover?: boolean
}

export const defaults = { kind: 'tied' as ExpansionJointKind, nps: 8, rating: 150 as Rating, convolutions: 8, liner: true, cover: false }

/** typical EJMA proportions: convolution height and pitch from the bellows diameter. */
function dims(p: ExpansionJointProps) {
  const o = { ...defaults, ...p }
  const ro = pipeOD(o.nps) / 2
  const h = Math.min(Math.max(0.012 + 0.11 * ro * 2, 0.015), 0.09)
  const q = 0.75 * h + 0.004
  const n = Math.max(2, Math.round(o.convolutions))
  const cuff = Math.max(0.015, h * 0.6)
  const bl = n * q + 2 * cuff
  const neck = Math.max(0.06, ro * 0.7)
  const fl = flangeLen(o.nps, o.rating)
  const pb = o.kind === 'pressure-balanced'
  const mid = pb ? bl * 1.1 + 0.08 : 0
  const L = 2 * (fl + neck) + (pb ? 2 * bl + mid : bl)
  return { ...o, ro, h, q, n, cuff, bl, neck, fl, L, pb, mid }
}

export function ports(p: ExpansionJointProps = {}): Port[] {
  const d = dims(p)
  return [port('A', 'End A', [-d.L / 2, 0, 0], [-1, 0, 0], d.nps, d.rating), port('B', 'End B', [d.L / 2, 0, 0], [1, 0, 0], d.nps, d.rating)]
}

export function ExpansionJoint({ kind = defaults.kind, nps = defaults.nps, rating = defaults.rating, convolutions = defaults.convolutions, liner = defaults.liner, cover = defaults.cover, ...group }: ExpansionJointProps & GroupProps) {
  const data = useKit((k) => build(k, { kind, nps, rating, convolutions, liner, cover }), [kind, nps, rating, convolutions, liner, cover])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ExpansionJoint

function build(k: Kit, p: ExpansionJointProps) {
  const d = dims(p)
  const { ro, h, q, n, cuff, bl, L, nps } = d
  const wt = pipeWall(nps, 'STD')
  const ri = ro - wt
  const { xa, xb } = inlineEnds(k, nps, d.rating, L, d.neck)
  const t = 0.0012
  const rr = ro + t
  const segs = seg(ro * 2)
  // bellows, reinforcing collars over the cuffs
  const collar = (x: number, r = rr) => k.lathe('pipePaint', [[r, x - 0.012], [r + 0.006, x - 0.012], [r + 0.006, x + 0.012], [r, x + 0.012]], [0, 0, 0], 'x', segs)
  const spans: [number, number][] = []
  if (d.pb) {
    spans.push([xa, xa + bl], [xb - bl, xb])
    // intermediate spool with the larger balancing bellows on an annular chamber
    const x0 = xa + bl
    const x1 = xb - bl
    k.lathe('pipePaint', [[ri, x1], [ri, x0]], [0, 0, 0], 'x', segs)
    k.lathe('pipePaint', [[ro, x0], [ro, x1]], [0, 0, 0], 'x', segs)
    const Rc = ro + h * 1.4
    k.lathe('pipePaint', [[ro, x0 + 0.01], [Rc, x0 + 0.01], [Rc, x0 + 0.03]], [0, 0, 0], 'x', segs)
    k.lathe('pipePaint', [[Rc, x1 - 0.03], [Rc, x1 - 0.01], [ro, x1 - 0.01]], [0, 0, 0], 'x', segs)
    const nb = Math.max(2, Math.round((x1 - x0 - 0.06 - 2 * cuff) / q))
    bellows(k, x0 + 0.03, nb, (x1 - x0 - 0.06 - 2 * cuff) / nb, Rc, h, t, cuff)
  } else spans.push([xa, xb])
  for (const [a] of spans) {
    bellows(k, a, n, q, rr, h, t, cuff)
    collar(a + cuff * 0.5)
    collar(a + bl - cuff * 0.5)
  }
  // internal liner welded at the upstream end, free downstream
  if (d.liner)
    for (const [a, b] of spans) {
      const rl = ri - 0.0025
      k.lathe('stainless', [[ri, a - 0.03], [rl, a - 0.02], [rl, b + 0.01]], [0, 0, 0], 'x', segs)
      k.lathe('stainless', [[rl - 0.0015, b + 0.01], [rl - 0.0015, a - 0.02], [ri - 0.0015, a - 0.03]], [0, 0, 0], 'x', segs)
    }
  // external cover, attached at the A end
  if (d.cover)
    for (const [a, b] of spans) {
      const rc = rr + h + 0.008
      k.lathe('stainless', [[rr + 0.006, a + 0.004], [rc, a + 0.012], [rc, b - 0.006]], [0, 0, 0], 'x', segs)
      k.lathe('stainless', [[rc - 0.0015, b - 0.006], [rc - 0.0015, a + 0.012]], [0, 0, 0], 'x', segs)
    }
  const ROD = Math.min(inch(2), Math.max(inch(0.625), inch(0.5 + nps * 0.05)))
  const rRod = (d.pb ? ro + h * 1.4 + h : rr + h) + ROD * 1.6 + 0.01
  const lugX = [xa - d.neck * 0.45, xb + d.neck * 0.45]
  const kind = d.kind
  if (kind === 'tied' || kind === 'pressure-balanced') {
    const nr = nps <= 8 ? 2 : 4
    for (let i = 0; i < nr; i++) {
      const a = Math.PI / 2 + (i / nr) * Math.PI * 2 + (nr === 4 ? Math.PI / 4 : 0)
      const y = Math.sin(a)
      const z = Math.cos(a)
      for (const x of lugX) lug(k, x, a, ro, rRod, ROD)
      const xs = lugX[0] - ROD * 2.2
      const xe = lugX[1] + ROD * 2.2
      k.rod('galvanised', [xs, y * rRod, z * rRod], [xe, y * rRod, z * rRod], ROD / 2, 10)
      for (const x of lugX)
        for (const s of [-1, 1]) {
          const xn = x + s * (ROD * 0.75 + 0.003)
          k.hex('nut', ROD * 1.85, ROD * 0.9, [xn, y * rRod, z * rRod], 'x')
          // spherical washer face
          k.cyl('galvanised', ROD * 0.95, 0.003, [x + s * (ROD * 0.25 + 0.0015), y * rRod, z * rRod], 'x', 14)
        }
    }
  }
  if (kind === 'hinged') for (const s of [-1, 1]) hinge(k, s, [0, 0, 1], lugX, ro, rRod, ROD)
  if (kind === 'gimbal') {
    // gimbal ring with two hinge pairs at 90°: A side pins on ±Z, B side pins on ±Y
    const Rg = rRod + ROD * 0.5
    const w = ROD * 2.4
    k.lathe('pipePaint', [[Rg - w * 0.5, -w / 2], [Rg + w * 0.5, -w / 2], [Rg + w * 0.5, w / 2], [Rg - w * 0.5, w / 2], [Rg - w * 0.5, -w / 2]], [0, 0, 0], 'x', 48)
    for (const s of [-1, 1]) {
      gimbalArm(k, lugX[0], [0, 0, s], ro, Rg, ROD)
      gimbalArm(k, lugX[1], [0, s, 0], ro, Rg, ROD)
    }
  }
}

/** Gusseted tie-rod lug welded to the nipple at angle a (from +Y towards +Z), hole at radius rRod. */
function lug(k: Kit, x: number, a: number, ro: number, rRod: number, rod: number) {
  const y = Math.sin(a)
  const z = Math.cos(a)
  const th = rod * 1.1
  const r0 = ro - 0.002
  const r1 = rRod + rod * 1.3
  const mid = (r0 + r1) / 2
  k.box('pipePaint', [th, r1 - r0, rod * 2.6], [x, y * mid, z * mid], [0, y, z] as V3)
  // gussets on the far side
  const gx = x + (x < 0 ? 1 : -1) * th * 1.4
  k.box('pipePaint', [th * 2, (r1 - r0) * 0.55, th * 0.6], [gx, y * (r0 + (r1 - r0) * 0.28), z * (r0 + (r1 - r0) * 0.28)], [0, y, z] as V3)
}

/** Hinge pair on the +/-Z side: arms from both nipples overlapping at x = 0 with a pin along Z. */
function hinge(k: Kit, s: number, ax: V3, lugX: number[], ro: number, rH: number, rod: number) {
  const z = s * rH
  const th = rod * 0.9
  const hgt = rod * 3
  for (const [i, x] of lugX.entries()) {
    const zz = z + s * (i === 0 ? -th * 0.55 : th * 0.55)
    // arm from the nipple saddle out to the pin
    k.box('pipePaint', [Math.abs(x) + hgt * 0.5, hgt, th], [x / 2, 0, zz])
    k.box('pipePaint', [hgt * 0.8, hgt, Math.abs(zz) - ro + 0.002], [x, 0, (Math.abs(zz) + ro) / 2 * s])
  }
  k.cyl('stainless', rod * 0.55, th * 3.4, [0, 0, z], ax, 16)
  for (const t of [-1, 1]) k.cyl('nut', rod * 0.9, rod * 0.3, [0, 0, z + s * t * th * 1.7], ax, 6)
}

/** Gimbal arm from a nipple at x out to the ring along `dir` (unit Y or Z), with its pin. */
function gimbalArm(k: Kit, x: number, dir: V3, ro: number, Rg: number, rod: number) {
  const hgt = rod * 3
  const th = rod * 0.9
  const sz = dir[2] !== 0 ? 2 : 1
  const r = Rg - rod * 1.6
  const p = (v: number): V3 => (sz === 2 ? [x / 2, 0, v] : [x / 2, v, 0])
  const side = dir[sz]
  const size: V3 = sz === 2 ? [Math.abs(x) + hgt * 0.4, hgt, th] : [Math.abs(x) + hgt * 0.4, th, hgt]
  k.box('pipePaint', size, p(side * r))
  const post: V3 = sz === 2 ? [hgt * 0.8, hgt, r - ro] : [hgt * 0.8, r - ro, hgt]
  k.box('pipePaint', post, sz === 2 ? [x, 0, side * (r + ro) / 2] : [x, side * (r + ro) / 2, 0])
  const pin: V3 = sz === 2 ? [0, 0, side * (Rg - rod * 0.2)] : [0, side * (Rg - rod * 0.2), 0]
  k.cyl('stainless', rod * 0.55, rod * 3.6, pin, dir, 16)
}
