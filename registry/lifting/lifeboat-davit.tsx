// Totally enclosed lifeboat (TEMPSC, SOLAS / LSA Code IV) stowed in twin gravity davits with falls, winch and embarkation platform.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { grating, handrail, member, tagPlate } from '../lib/parts'
import { signMaterial, textMaterial } from '../lib/textures'
import { bar, boxMM, ropeMaterial } from './_rigging'

export interface LifeboatDavitProps {
  /** certified persons */
  capacity?: number
  /** boat number painted on the canopy */
  tag?: string
  color?: string
}

export const defaults = {
  capacity: 50,
  tag: 'LB-1',
  color: '#f26a1b',
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function LifeboatDavit({ capacity = defaults.capacity, tag = defaults.tag, color = defaults.color, ...group }: LifeboatDavitProps & GroupProps) {
  const data = useKit((k) => build(k, capacity, tag, color), [capacity, tag, color])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default LifeboatDavit

function boatDims(capacity: number) {
  const Lb = clamp(5.5 + capacity * 0.045, 6, 11)
  const B = clamp(0.33 * Lb + 0.3, 2.3, 3.8)
  const Dh = 0.42 * B
  const Hc = 0.6 * B
  const yK = 0.25 - Dh
  const zb = 0.75 + B / 2
  return { Lb, B, Dh, Hc, yK, yG: yK + Dh, zb, xh: Lb / 2 - 0.95 }
}
type BD = ReturnType<typeof boatDims>

// half-beam, keel depth and sheer along the boat (u: 0 stern … 1 bow)
function station(b: BD, u: number) {
  const t = u < 0.45 ? (0.45 - u) / 0.45 : (u - 0.45) / 0.55
  const e = u < 0.45 ? 3.2 : 1.9
  const w = (b.B / 2) * Math.pow(Math.max(0, 1 - Math.pow(t, e)), 0.55)
  const sheer = u > 0.45 ? 0.3 * t * t : 0.1 * t * t
  const yG = b.yG + sheer
  const D = b.Dh * (1 - 0.45 * Math.pow(t, 2.5)) + sheer
  const Hc = b.Hc * Math.pow(Math.max(0, 1 - Math.pow(t, 3.2)), 0.5)
  return { x: -b.Lb / 2 + u * b.Lb, w, yG, D, Hc }
}

const se = (a: number, n: number) => Math.sign(a) * Math.pow(Math.abs(a), 2 / n)

// Loft a closed hull or canopy surface over stations; ring(φ) gives (z, y) per station.
function loft(k: Kit, mat: MatKey, b: BD, ring: (s: ReturnType<typeof station>, f: number) => [number, number], N = 48, M = 28) {
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= N; i++) {
    const u = 0.5 - 0.5 * Math.cos((i / N) * Math.PI)
    const s = station(b, u)
    for (let j = 0; j <= M; j++) {
      const [z, y] = ring(s, j / M)
      pos.push(s.x, y, z)
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j
      const c = a + M + 1
      idx.push(a, c, a + 1, c, c + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  k.add(mat, g)
}

function build(k: Kit, capacity: number, tag: string, color: string) {
  const b = boatDims(capacity)
  const hull = paint(color, { weather: 0.4 })
  const canopy = paint(color, { weather: 0.3, roughness: 0.4 })
  const white = paint('#eeeeea', { weather: 0.3 })
  const dav = paint('#d9dbd6', { weather: 1 })
  const dark: MatKey = 'castIron'
  const zb = b.zb

  // ---- boat: hull (superelliptic sections, keel rocker, sheer) and canopy (flattened dome)
  k.with(new THREE.Matrix4().makeTranslation(0, 0, zb), () => {
    loft(k, hull, b, (s, f) => {
      const p = -Math.PI / 2 + f * Math.PI
      return [s.w * se(Math.sin(p), 2.6), s.yG - s.D * Math.pow(Math.cos(p), 2 / 2.6)]
    })
    loft(k, canopy, b, (s, f) => {
      const p = f * Math.PI
      return [s.w * 0.97 * se(Math.cos(p), 2.4), s.yG + s.Hc * Math.pow(Math.sin(p), 2 / 2.4)]
    })
    // gunwale fender, boot-top band, keel, rudder, propeller nozzle
    for (const sz of [-1, 1]) {
      const pts: V3[] = []
      for (let i = 2; i <= 38; i++) {
        const s = station(b, i / 40)
        pts.push([s.x, s.yG - 0.04, sz * (s.w + 0.03)])
      }
      k.spline('rubberBlack', pts, 0.06, 8, 80)
      const lo: V3[] = []
      for (let i = 3; i <= 37; i++) {
        const s = station(b, i / 40)
        lo.push([s.x, s.yG - s.D * 0.55, sz * s.w * 0.93])
      }
      k.spline(white, lo, 0.035, 6, 80)
    }
    const s0 = station(b, 0.08)
    const keel: V3[] = []
    for (let i = 2; i <= 37; i++) {
      const s = station(b, i / 40)
      keel.push([s.x, s.yG - s.D - 0.02, 0])
    }
    k.spline(hull, keel, 0.07, 8, 60)
    boxMM(k, white, [-b.Lb / 2 - 0.12, b.yK - 0.05, -0.025], [-b.Lb / 2 + 0.25, s0.yG - 0.35, 0.025])
    k.lathe(dark, [[0.26, 0], [0.3, 0.02], [0.3, 0.28], [0.27, 0.3], [0.23, 0.3], [0.23, 0]], [-b.Lb / 2 + 0.55, b.yK + 0.3, 0], '-x', 24)
    // coxswain cupola aft, windows, hatches, boarding doors, release hooks, grab rail, markings
    const cs = station(b, 0.3)
    const yTop = cs.yG + cs.Hc
    k.rbox(canopy, [1.0, 0.55, 0.95], 0.18, [cs.x, yTop + 0.12, 0])
    k.rbox('glass', [1.02, 0.22, 0.97], 0.1, [cs.x, yTop + 0.25, 0])
    k.cyl(white, 0.05, 0.45, [cs.x - 0.25, yTop + 0.6, 0], 'y', 8)
    k.sphere('lampLens', 0.06, [cs.x - 0.25, yTop + 0.85, 0], undefined, 10)
    for (const u of [0.62, 0.84]) {
      const s = station(b, u)
      k.rbox(canopy, [0.75, 0.1, 0.65], 0.04, [s.x, s.yG + s.Hc + 0.02, 0])
      k.rbox('rubberBlack', [0.78, 0.03, 0.68], 0.012, [s.x, s.yG + s.Hc - 0.02, 0])
    }
    for (const sz of [-1, 1]) {
      // surface frame on the canopy (ph: 0 gunwale … π/2 crown) or hull side (p: 0 keel … π/2 gunwale)
      const frame = (pt: (a: number) => [number, number], a: number, x: number) => {
        const [z1, y1] = pt(a - 0.02)
        const [z2, y2] = pt(a + 0.02)
        const [z, y] = pt(a)
        const t = new THREE.Vector3(0, y2 - y1, sz * (z2 - z1)).normalize()
        const n = new THREE.Vector3(0, -t.z * sz, t.y * sz).multiplyScalar(sz).normalize()
        if (n.z * sz < 0) n.negate()
        return { p: new THREE.Vector3(x, y, sz * z), n, t }
      }
      const cpt = (s: ReturnType<typeof station>) => (ph: number): [number, number] => [s.w * 0.97 * se(Math.cos(ph), 2.4), s.yG + s.Hc * Math.pow(Math.max(0, Math.sin(ph)), 2 / 2.4)]
      const hpt = (s: ReturnType<typeof station>) => (p: number): [number, number] => [s.w * se(Math.sin(p), 2.6), s.yG - s.D * Math.pow(Math.max(0, Math.cos(p)), 2 / 2.6)]
      const onFace = (mat: MatKey, f: ReturnType<typeof frame>, w: number, h: number, off: number) => {
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(f.t, f.n), f.t, f.n))
        k.add(mat, new THREE.PlaneGeometry(w, h), new THREE.Matrix4().compose(f.p.clone().addScaledVector(f.n, off), q, new THREE.Vector3(1, 1, 1)))
      }
      for (let i = 0; i < 7; i++) {
        const s = station(b, 0.2 + i * 0.1)
        const f = frame(cpt(s), Math.PI * 0.3, s.x)
        k.add('glass', new THREE.CircleGeometry(0.11, 18), new THREE.Matrix4().compose(f.p.clone().addScaledVector(f.n, 0.012), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.n), new THREE.Vector3(1, 1, 1)))
        k.torus('rubberBlack', 0.115, 0.012, f.p.clone().addScaledVector(f.n, 0.008).toArray() as V3, f.n.toArray() as V3, 6, 20)
      }
      const sd = station(b, 0.5)
      const ph0 = Math.asin(Math.pow(0.05, 1.2))
      const ph1 = Math.asin(Math.pow(0.62, 1.2))
      const [za, ya] = cpt(sd)(ph0)
      const [ze, ye] = cpt(sd)(ph1)
      const fd = frame(cpt(sd), (ph0 + ph1) / 2, sd.x)
      const dh = Math.hypot(ze - za, ye - ya)
      onFace('rubberBlack', fd, 0.98, dh + 0.06, 0.03)
      onFace(canopy, fd, 0.9, dh, 0.034)
      const fh = frame(cpt(sd), (ph0 + ph1) / 2 - 0.05, sd.x + 0.36)
      k.box(dark, [0.04, 0.12, 0.05], fh.p.clone().addScaledVector(fh.n, 0.06).toArray() as V3)
      const st = station(b, 0.47)
      const pText = Math.acos(Math.pow(0.32 / st.D, 1.3))
      onFace(textMaterial(`${tag}   ${capacity} P`, '#ffffff', '#111111', 768, 128), { ...frame(hpt(st), pText, st.x), t: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, sz) }, 1.1, 0.18, 0.03)
      for (const u of [0.15, 0.85]) {
        const s = station(b, u)
        onFace(white, frame(cpt(s), Math.PI * 0.36, s.x), 0.3, 0.08, 0.008)
      }
      const rail: V3[] = []
      for (let i = 0; i <= 12; i++) {
        const s = station(b, 0.18 + i * 0.055)
        const ph = Math.PI * 0.42
        rail.push([s.x, s.yG + s.Hc * Math.pow(Math.sin(ph), 2 / 2.4) + 0.06, sz * s.w * 0.97 * se(Math.cos(ph), 2.4)])
      }
      k.tube('stainless', rail, 0.016, 6, 0.2)
    }
    for (const sx of [-1, 1]) {
      const s = station(b, 0.5 + (sx * b.xh) / b.Lb)
      const yt = s.yG + s.Hc
      // on-load release hook: housing with hydrostatic interlock cable, upturned tongue holding the fall ring
      boxMM(k, dark, [sx * b.xh - 0.14, yt - 0.05, -0.1], [sx * b.xh + 0.14, yt + 0.06, 0.1])
      boxMM(k, dark, [sx * b.xh - 0.05, yt + 0.06, -0.035], [sx * b.xh + 0.05, yt + 0.3, 0.035])
      k.add(dark, new THREE.TorusGeometry(0.065, 0.022, 8, 20, (3 * Math.PI) / 2).rotateZ(-sx * Math.PI / 2 - (sx > 0 ? Math.PI / 2 : 0)), new THREE.Matrix4().makeTranslation(sx * b.xh, yt + 0.375, 0))
      k.spline('cable', [[sx * b.xh, yt + 0.04, 0.1], [sx * b.xh * 0.8, yt + 0.02, 0.2], [sx * b.xh * 0.6, yt, 0.25]], 0.008, 6, 16)
    }
  })

  // ---- davits: deck frame, inclined track, cradle arm with head sheave; falls to the release hooks
  const rope = ropeMaterial()
  const capTop = (sx: number) => {
    const s = station(b, 0.5 + (sx * b.xh) / b.Lb)
    return s.yG + s.Hc + 0.27
  }
  const yHead = Math.max(capTop(-1), capTop(1)) + 1.1
  const xw = -b.xh + 0.85
  for (const sx of [-1, 1]) {
    const x = sx * b.xh
    const zP = 0.15
    const yTrack = yHead - 0.6
    member(k, [x, 0.13, -2.7], [x, 0.13, zP + 0.15], 'HEB 260', dav)
    member(k, [x, 0.26, zP], [x, yTrack - 0.2, zP], 'HEB 260', dav, [0, 0, 1])
    bar(k, dav, [x, 0.26, -2.45], [x, yTrack, zP], 0.26, 0.24, [0, 1, 0])
    bar(k, dav, [x, 0.26, -1.2], [x, yTrack * 0.55, zP], 0.12, 0.12)
    boxMM(k, dav, [x - 0.2, 0, -2.75], [x + 0.2, 0.025, zP + 0.3])
    for (const z of [-2.6, -1.2, zP + 0.15]) for (const dx of [-0.14, 0.14]) k.hex('nut', 0.04, 0.025, [x + dx, 0.04, z])
    // cradle arm resting on the track top: twin plates from the track to the head over the boat
    const head: V3 = [x, yHead, zb]
    const heel: V3 = [x, yTrack - 0.55, -0.55]
    for (const dx of [-0.13, 0.13]) {
      bar(k, dav, [x + dx, heel[1], heel[2]], [x + dx, head[1], head[2] - 0.15], 0.03, 0.42)
      bar(k, dav, [x + dx, heel[1], heel[2]], [x + dx, yTrack + 0.45, zP + 0.2], 0.03, 0.3)
    }
    bar(k, dav, [x, yTrack + 0.45, zP + 0.2], [x, head[1] - 0.25, head[2] - 0.6], 0.29, 0.06)
    for (const z of [heel[2] + 0.1, zP - 0.15]) k.cyl(dark, 0.11, 0.3, [x, (z === heel[2] + 0.1 ? heel[1] : yTrack + 0.05) - 0.02, z], 'x', 16)
    k.cyl(dark, 0.22, 0.12, head, 'x', 22)
    k.cyl(dark, 0.04, 0.34, head, 'x', 10)
    // fall: head sheave → fall block → release hook; wire back along the arm to the winch
    const hookTop = capTop(sx) - 0.02
    const blk: V3 = [x, hookTop + 0.45, zb]
    k.rod(rope, [x, yHead, zb + 0.22], [x, blk[1] + 0.12, zb + 0.08], 0.014, 6)
    k.rod(rope, [x, yHead, zb - 0.22], [x, blk[1] + 0.12, zb - 0.08], 0.014, 6)
    k.rbox(dark, [0.12, 0.3, 0.26], 0.03, blk)
    k.torus('galvanised', 0.07, 0.02, [x, hookTop + 0.15, zb], 'x', 8, 16)
    k.rod('galvanised', [x, blk[1] - 0.15, zb], [x, hookTop + 0.22, zb], 0.02, 8)
    const guide: V3 = [x, heel[1] + 0.32, heel[2] + 0.1]
    k.rod(rope, [x, yHead + 0.22, zb - 0.05], guide, 0.012, 6)
    // both wires run to the winch beside the aft davit; the forward one overhead along the cross-tie
    if (sx > 0) k.rod(rope, guide, [-x, guide[1], guide[2]], 0.012, 6)
    else k.rod(dav, [x, guide[1] - 0.2, guide[2]], [-x, guide[1] - 0.2, guide[2]], 0.05, 10)
    k.rod(rope, [-b.xh, guide[1], guide[2] + (sx > 0 ? 0.04 : -0.04)], [xw + sx * 0.2, 1.05, -2.05], 0.012, 6)
    k.cyl(dark, 0.12, 0.08, [x, heel[1] + 0.2, heel[2] + 0.1], 'x', 14)
    // station sign
    k.plane(signMaterial('muster', `LIFEBOAT ${tag}`), 0.26, 0.19, [x, 1.8, zP + 0.132])
    if (tag) tagPlate(k, `${tag}-D${sx > 0 ? 'F' : 'A'}`, [x, 1.55, zP + 0.131], 'z', 0.22)
  }
  // ---- davit winch with brake lever, crank and motor
  k.with(new THREE.Matrix4().makeTranslation(xw, 0, 0), () => {
  boxMM(k, dav, [-0.7, 0, -2.4], [0.7, 0.12, -1.7])
  for (const sx of [-1, 1]) boxMM(k, dav, [sx * 0.42 - 0.03, 0.12, -2.35], [sx * 0.42 + 0.03, 1.0, -1.75])
  k.cyl(dark, 0.22, 0.78, [0, 0.8, -2.05], 'x', 24)
  k.cyl(rope, 0.25, 0.7, [0, 0.8, -2.05], 'x', 24)
  for (const sx of [-1, 1]) k.cyl(dark, 0.32, 0.03, [sx * 0.36, 0.8, -2.05], 'x', 28)
  k.cyl('motorPaint', 0.16, 0.42, [-0.68, 0.8, -2.05], 'x', 20)
  k.rbox('machineryGreen', [0.25, 0.3, 0.3], 0.03, [0.6, 0.8, -2.05])
  bar(k, 'actuatorRed', [0.72, 0.8, -2.05], [0.75, 1.55, -2.5], 0.04, 0.04)
  k.sphere('actuatorRed', 0.09, [0.75, 1.55, -2.5], undefined, 12)
  bar(k, dark, [0.74, 0.8, -1.9], [0.78, 0.8, -1.6], 0.03, 0.03)
  })

  // ---- embarkation platform: cantilevered grating from the deck edge to the boat door, rails with a gate gap
  const pz0 = 0.25
  const pz1 = zb - b.B / 2 - 0.1
  const px = Math.min(1.1, b.xh - 0.4)
  grating(k, [0, 0, (pz0 + pz1) / 2], 2 * px, pz1 - pz0)
  for (const sx of [-1, 1]) member(k, [sx * (px - 0.05), -0.13, pz0 - 0.4], [sx * (px - 0.05), -0.13, pz1], 'UPN 200', dav, [0, 1, 0])
  member(k, [-px, -0.13, pz1 - 0.04], [px, -0.13, pz1 - 0.04], 'UPN 200', dav)
  for (const sx of [-1, 1]) handrail(k, [[sx * (px - 0.02), 0, pz0], [sx * (px - 0.02), 0, pz1 - 0.02]])
  handrail(k, [[-b.xh + 0.3, 0, pz0 - 0.02], [-0.55, 0, pz0 - 0.02]])
  handrail(k, [[0.55, 0, pz0 - 0.02], [b.xh - 0.3, 0, pz0 - 0.02]])
  for (const y of [0.55, 1.05]) k.rod('actuatorYellow', [-0.55, y, pz0 - 0.02], [0.55, y - 0.08, pz0 - 0.02], 0.008, 6)
}
