// Offshore pedestal crane (diesel-hydraulic, lattice boom) after API 2C / EN 13852-1: pedestal, slew bearing, machinery house, cab, A-frame, luffing tackle, hook block and boom rest.
import * as THREE from 'three'
import { useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { grating, handrail, ladder, tagPlate } from '../lib/parts'
import { ACCESS } from '../lib/standards'
import { gratingMaterial, louvreMaterial, textMaterial } from '../lib/textures'
import { Rope, bar, boxMM, craneYellow, hazardPanel, hook, ropeMaterial } from './_rigging'

export interface PedestalCraneProps {
  /** lattice boom length, foot pin to head, m */
  boomLength?: number
  /** slew, deg, counter-clockwise from above; 0 = boom along +X */
  slew?: number
  /** boom angle above horizontal, deg */
  luff?: number
  /** hook block below the boom-head sheaves, m */
  hook?: number
  /** slew bearing seat above the deck, m */
  pedestalHeight?: number
  /** safe working load, t (nameplate and boom marking) */
  swl?: number
  boomRest?: boolean
  tag?: string
}

export const defaults = {
  boomLength: 36,
  slew: 0,
  luff: 42,
  hook: 14,
  pedestalHeight: 10,
  swl: 25,
  boomRest: true,
  tag: 'CR-01',
}

const DEG = Math.PI / 180
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

type Dims = ReturnType<typeof dims>

function dims(boomLength: number, pedestalHeight: number) {
  const L = clamp(boomLength, 15, 70)
  const k = clamp(0.62 + L / 100, 0.82, 1.1)
  const yB = clamp(pedestalHeight, 5, 25)
  const yD = yB + 0.95
  const foot = 2.9
  const yFoot = yD + 0.8
  const fA = -0.5
  const yA = yD + 8.6 * clamp(L / 32, 0.78, 1)
  const taper = 5.5 * Math.min(1, L / 32 + 0.2)
  const bodyW = 1.9 * k
  const st = [
    { t: 0, w: Math.max(2.2 * k, 1.6), d: 0.35 },
    { t: taper, w: bodyW, d: bodyW },
    { t: L - taper, w: bodyW, d: bodyW },
    { t: L, w: 1.0, d: 0.9 },
  ]
  // boom rest station and the drooped rest angle (rest top kept ≥ 1.2 m above the deck)
  const tRest = 0.62 * L
  const dRest = sectionAt(st, tRest).d
  const restLuff = -Math.min(7 * DEG, Math.asin(clamp((yFoot - dRest / 2 - 1.4) / tRest, -0.5, 0.99)))
  return {
    L, k, yB, yTT: yB + 0.25, yD, foot, yFoot, fA, yA, st, tRest, restLuff,
    tip: { t: L + 0.75, n: -0.05 },
    lug: { t: L - 0.15, n: 0.55 },
    aux: { t: L + 2.7, n: 0.78 },
    guide: { t: 0.9, n: 0.85 },
    uHub: [fA + 0.35, yA - 0.72] as [number, number],
    lead: [fA, yA + 0.68] as [number, number],
    // sheave radii: pitch diameter ≥ 18 × rope diameter (API 2C 7.4.1.1, 44 mm rope)
    rLead: 0.42,
    rGuide: 0.42,
    rBlock: 0.42,
    rAux: 0.38,
    yR: yD + 3.3,
    sheaveR: 0.5,
  }
}

function sectionAt(st: { t: number; w: number; d: number }[], t: number) {
  for (let i = 0; i < st.length - 1; i++)
    if (t <= st[i + 1].t) {
      const u = (t - st[i].t) / (st[i + 1].t - st[i].t)
      return { w: st[i].w + (st[i + 1].w - st[i].w) * u, d: st[i].d + (st[i + 1].d - st[i].d) * u }
    }
  return st[st.length - 1]
}

/** boom frame (t along, n normal) → slewing frame (x, y) at luff (rad) */
function bp(D: Dims, luff: number, t: number, n: number): [number, number] {
  const c = Math.cos(luff)
  const s = Math.sin(luff)
  return [D.foot + t * c - n * s, D.yFoot + t * s + n * c]
}

export function PedestalCrane({ boomLength = defaults.boomLength, slew = defaults.slew, luff = defaults.luff, hook: hookDrop = defaults.hook, pedestalHeight = defaults.pedestalHeight, swl = defaults.swl, boomRest = defaults.boomRest, tag = defaults.tag, ...group }: PedestalCraneProps & GroupProps) {
  const D = useMemo(() => dims(boomLength, pedestalHeight), [boomLength, pedestalHeight])
  const base = useKit((k) => buildBase(k, D, boomRest, swl, tag), [D, boomRest, swl, tag])
  const slewing = useKit((k) => buildSlewing(k, D, swl, tag), [D, swl, tag])
  const boom = useKit((k) => buildBoom(k, D), [D])
  const block = useKit((k) => buildHookBlock(k, swl), [swl])
  const spreader = useKit((k) => buildSpreader(k), [])
  const ball = useKit((k) => buildBall(k), [])
  const a2b = useKit((k) => buildA2B(k), [])
  const rig = useMemo(() => rigging(D, clamp(luff, D.restLuff / DEG, 78) * DEG, hookDrop), [D, luff, hookDrop])
  const rope = ropeMaterial()
  return (
    <group {...group}>
      <KitMesh data={base} />
      <group rotation={[0, slew * DEG, 0]}>
        <KitMesh data={slewing} />
        <group position={[D.foot, D.yFoot, 0]} rotation={[0, 0, rig.luff]}>
          <KitMesh data={boom} />
        </group>
        {rig.ropes.map(([a, b, r], i) => (
          <Rope key={i} a={a} b={b} r={r} material={rope} />
        ))}
        <group position={rig.spreader} quaternion={rig.spreaderQ}>
          <KitMesh data={spreader} />
        </group>
        <group position={rig.block}>
          <KitMesh data={block} />
        </group>
        <group position={rig.a2b}>
          <KitMesh data={a2b} />
        </group>
        <group position={rig.ball}>
          <KitMesh data={ball} />
        </group>
      </group>
    </group>
  )
}

export default PedestalCrane

// Moving ropes in the slewing frame: hoist lead, luffing tackle + pendants, main falls.
function rigging(D: Dims, luff: number, hookDrop: number) {
  const ropes: [V3, V3, number][] = []
  const R = 0.022
  const [gx, gy] = bp(D, luff, D.guide.t, D.guide.n + D.rGuide)
  for (const s of [-1, 1]) ropes.push([[D.lead[0] + D.rLead, D.lead[1], s * 0.95], [gx, gy, s * 0.25], R])
  const U = new THREE.Vector3(D.uHub[0], D.uHub[1], 0)
  const [lx, ly] = bp(D, luff, D.lug.t, D.lug.n)
  const P = new THREE.Vector3(lx, ly, 0)
  const dir = P.clone().sub(U).normalize()
  const nrm = new THREE.Vector3(-dir.y, dir.x, 0)
  const S = U.clone().lerp(P, 0.3)
  for (let i = 0; i < 6; i++) {
    const z = -0.45 + 0.18 * i
    const o = i % 2 ? 1 : -1
    const a = U.clone().addScaledVector(nrm, o * D.rBlock)
    const b = S.clone().addScaledVector(nrm, o * D.rBlock)
    ropes.push([[a.x, a.y, z], [b.x, b.y, z], R])
  }
  for (const s of [-1, 1]) {
    const a = S.clone().addScaledVector(dir, 0.45)
    ropes.push([[a.x, a.y, s * 0.62], [P.x, P.y, s * 0.5], 0.035])
  }
  const [tx, ty] = bp(D, luff, D.tip.t, D.tip.n)
  const hb = ty - Math.max(2.6, hookDrop)
  for (const z of [-0.22, 0.22]) for (const dx of [-D.sheaveR, D.sheaveR]) ropes.push([[tx + dx, ty, z], [tx + dx, hb, z], R])
  const [sx2, sy2] = bp(D, luff, D.tip.t + 0.3, -0.48)
  const a2b: V3 = [tx + D.sheaveR, ty - 1.5, -0.22]
  ropes.push([[sx2, sy2, -0.38], [a2b[0], a2b[1] + 0.2, -0.36], 0.008])
  const [ax, ay] = bp(D, luff, D.aux.t, D.aux.n)
  return {
    luff,
    ropes,
    spreader: S.toArray() as V3,
    spreaderQ: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
    block: [tx, hb, 0] as V3,
    a2b,
    ball: [ax + D.rAux, ay, 0] as V3,
  }
}

// ---------------------------------------------------------------- pedestal + boom rest (static)
function buildBase(k: Kit, D: Dims, withRest: boolean, swl: number, tag: string) {
  const Y = craneYellow()
  const dark: MatKey = 'castIron'
  const kk = D.k
  const yB = D.yB
  const P = {
    rCan: 1.45 * kk,
    rShaft: 1.25 * kk,
    rTop: 1.75 * kk,
    rFlange: 1.95 * kk,
    rBear: 1.8 * kk,
    hCan: yB * 0.283,
    hCone: yB * 0.358,
    hShaft: yB - 1.2,
    hTop: yB - 0.2,
    ring: yB - 2.2,
  }
  const rAt = (y: number) => (y < P.hCan ? P.rCan : y < P.hCone ? P.rCan + ((P.rShaft - P.rCan) * (y - P.hCan)) / (P.hCone - P.hCan) : y < P.hShaft ? P.rShaft : P.rShaft + ((P.rTop - P.rShaft) * (y - P.hShaft)) / (P.hTop - P.hShaft))
  const polar = (t: number, r: number, y: number): V3 => [r * Math.cos(t), y, -r * Math.sin(t)]
  const ring = (mat: MatKey, rTop: number, rBot: number, y0: number, y1: number, seg = 40) => k.cyl(mat, rBot, y1 - y0, [0, (y0 + y1) / 2, 0], 'y', seg, rTop)

  // base flange (underside on the deck), bolt ring, stiffened can, cone, shaft, flared top, top flange
  const rBase = P.rCan + 0.28
  ring(Y, rBase, rBase, 0, 0.07, 48)
  k.boltCircle('boltXylan', 'nut', 32, rBase - 0.12, [0, 0, 0], 'y', 0.036, 0.14, [0.09])
  ring(Y, P.rCan, P.rCan, 0.07, P.hCan)
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) * (Math.PI / 8)
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.26, 0), new THREE.Vector2(0, Math.min(0.9, P.hCan * 0.5))])
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t)
    k.extrude(Y, sh, 0.03, new THREE.Matrix4().compose(new THREE.Vector3(...polar(t, P.rCan - 0.01, 0.07)).add(new THREE.Vector3(Math.sin(t), 0, Math.cos(t)).multiplyScalar(-0.015)), q, new THREE.Vector3(1, 1, 1)))
  }
  ring(Y, P.rCan + 0.06, P.rCan + 0.06, P.hCan - 0.06, P.hCan + 0.06)
  ring(Y, P.rShaft, P.rCan, P.hCan, P.hCone)
  ring(Y, P.rShaft, P.rShaft, P.hCone, P.hShaft)
  ring(Y, P.rShaft + 0.05, P.rShaft + 0.05, (P.hCone + P.hShaft) / 2, (P.hCone + P.hShaft) / 2 + 0.1)
  ring(Y, P.rTop, P.rShaft, P.hShaft, P.hTop)
  ring(Y, P.rFlange, P.rFlange, P.hTop, yB, 56)
  k.boltCircle('boltXylan', 'nut', 48, P.rFlange - 0.09, [0, P.hTop - 0.1, 0], 'y', 0.03, 0.12, [0.03])
  // slew bearing outer ring with the external gear
  ring(dark, P.rBear, P.rBear, yB, D.yTT, 56)
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2
    k.box(dark, [0.06, 0.2, 0.08], polar(t, P.rBear + 0.035, yB + 0.12), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t))
  }
  ring('rubberBlack', P.rCan + 0.004, P.rCan + 0.004, 0.9, 1.0)
  // pedestal door, nameplate, SWL plate, tag
  const td = 112 * DEG
  const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), td + Math.PI / 2)
  const dIn = new THREE.Vector3(...polar(td, 1, 0)).setY(0)
  k.box('galvanised', [0.85, 1.95, 0.05], polar(td, P.rShaft + 0.01, P.ring + 1.05), dq)
  k.box(dark, [0.08, 0.12, 0.05], new THREE.Vector3(...polar(td + 0.22 / P.rShaft, P.rShaft + 0.05, P.ring + 1.05)).toArray() as V3, dq)
  const plate = (y: number, text: string, w: number, h: number, bg: string, fg: string) => {
    const p = new THREE.Vector3(...polar(15 * DEG, rAt(y) + 0.012, y))
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(15 * DEG), 0, -Math.sin(15 * DEG)))
    k.box('stainless', [w + 0.03, h + 0.03, 0.006], p.toArray() as V3, q)
    k.plane(textMaterial(text, bg, fg, 512, Math.round((512 * h) / w)), w, h, p.addScaledVector(dIn.set(Math.cos(15 * DEG), 0, -Math.sin(15 * DEG)), 0.0035).toArray() as V3, q)
  }
  plate(1.55, `SWL ${swl} t`, 0.9, 0.3, '#f4f4ef', '#111111')
  if (tag) tagPlate(k, tag, polar(-15 * DEG, rAt(1.55) + 0.003, 1.55), [Math.cos(15 * DEG), 0, Math.sin(15 * DEG)], 0.36)

  // ladders and rest platforms (≤ 6 m flights, ISO 14122-4), ring platform under the slew bearing
  const rl = P.rCan + 0.22
  const n = Math.max(1, Math.ceil(P.ring / ACCESS.ladder.maxFlight))
  const lv = Array.from({ length: n + 1 }, (_, i) => (P.ring * i) / n)
  const ang = (i: number) => (i - 1) * 52 * DEG
  const annulus = (y: number, r0: number, r1: number, a0: number, a1: number) => {
    const g = new THREE.RingGeometry(r0, r1, Math.max(6, Math.round(((a1 - a0) * r1) / 0.4)), 1, a0, a1 - a0)
    g.rotateX(-Math.PI / 2)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.3, pos.getZ(i) / 0.3)
    k.add(gratingMaterial(), g, new THREE.Matrix4().makeTranslation(0, y, 0))
    k.lathe('galvanised', [[r1 - 0.006, y - 0.1], [r1, y - 0.1], [r1, y], [r1 - 0.006, y]], [0, 0, 0], 'y', 48, a0 + Math.PI / 2, a1 - a0)
  }
  const arcRail = (y: number, r: number, a0: number, a1: number) => {
    const m = Math.max(2, Math.ceil((r * (a1 - a0)) / 0.5))
    handrail(k, Array.from({ length: m + 1 }, (_, i) => polar(a0 + ((a1 - a0) * i) / m, r, y)))
  }
  const brackets = (y: number, r1: number, a0: number, a1: number, m: number) => {
    for (let i = 0; i <= m; i++) {
      const t = a0 + ((a1 - a0) * i) / m
      bar(k, Y, polar(t, rAt(y - 0.09), y - 0.09), polar(t, r1, y - 0.09), 0.08, 0.14)
      k.rod(Y, polar(t, rAt(y - 0.95), y - 0.95), polar(t, r1 - 0.45, y - 0.15), 0.035, 6)
    }
  }
  for (let i = 1; i <= n; i++) {
    const t = ang(i)
    ladder(k, polar(t, rl, lv[i - 1]), lv[i], [Math.cos(t), 0, -Math.sin(t)], { mat: 'galvanised' })
    for (let y = lv[i - 1] + 1.2; y < lv[i] - 0.3; y += 2.4)
      for (const sd of [-0.2, 0.2]) {
        const tt = t + sd / rl
        bar(k, 'galvanised', polar(tt, rAt(y) - 0.02, y), polar(tt, rl, y), 0.06, 0.06)
      }
    if (i < n) {
      const y = lv[i]
      const a0 = t + 14 * DEG
      const a1 = ang(i + 1) + 20 * DEG
      const r1 = rl + 1.05
      annulus(y, rAt(y) + 0.02, r1, a0, a1)
      arcRail(y, r1 - 0.04, a0, a1)
      handrail(k, [polar(a1, rAt(y) + 0.06, y), polar(a1, r1 - 0.04, y)])
      brackets(y, r1, a0, a1, 2)
    }
  }
  {
    const y = P.ring
    const tn = ang(n)
    const notch = 12 * DEG
    const rRing = rl + 1.45
    annulus(y, rAt(y) + 0.02, rRing, tn + notch, tn - notch + Math.PI * 2)
    annulus(y, rl + 0.8, rRing, tn - notch, tn + notch)
    arcRail(y, rRing - 0.04, 0, Math.PI * 2)
    brackets(y, rRing, tn + notch + 0.1, tn - notch - 0.1 + Math.PI * 2, 10)
  }

  if (withRest) buildRest(k, D, Y)
}

// Braced 4-leg boom rest under the parked boom (slew 0, along +X).
function buildRest(k: Kit, D: Dims, Y: MatKey) {
  const sec = sectionAt(D.st, D.tRest)
  const [fr, yc] = bp(D, D.restLuff, D.tRest, -sec.d / 2)
  const chordR = 0.095 * Math.sqrt(D.k)
  const padTop = yc - chordR
  const beamTop = padTop - 0.12
  const yTop = beamTop - 0.4
  const half = Math.max(0.95, sec.w / 2 + 0.4)
  const lf = [fr - 0.75, fr + 0.75]
  const ls = [-half, half]
  for (const f of lf)
    for (const s of ls) {
      boxMM(k, Y, [f - 0.12, 0.04, s - 0.12], [f + 0.12, yTop, s + 0.12])
      boxMM(k, Y, [f - 0.3, 0, s - 0.3], [f + 0.3, 0.04, s + 0.3])
      for (const dx of [-0.2, 0.2]) for (const dz of [-0.2, 0.2]) k.hex('nut', 0.05, 0.03, [f + dx, 0.055, s + dz])
    }
  boxMM(k, Y, [fr - 0.25, yTop, -half - 0.25], [fr + 0.25, beamTop, half + 0.25])
  for (const s of ls) boxMM(k, Y, [lf[0] - 0.12, yTop - 0.3, s - 0.1], [lf[1] + 0.12, yTop, s + 0.1])
  const pad = sec.w / 2
  for (const sg of [-1, 1]) {
    boxMM(k, 'rubberBlack', [fr - 0.3, beamTop, sg * pad - 0.2], [fr + 0.3, padTop, sg * pad + 0.2])
    bar(k, Y, [fr, beamTop, sg * (pad + 0.27)], [fr, beamTop + 0.65, sg * (pad + 0.47)], 0.4, 0.05, [0, 0, 1])
  }
  const tiers = [0.3, yTop / 3, (2 * yTop) / 3, yTop - 0.3]
  const faces: [number, number, number, number][] = [
    [lf[0], ls[0], lf[1], ls[0]],
    [lf[0], ls[1], lf[1], ls[1]],
    [lf[0], ls[0], lf[0], ls[1]],
    [lf[1], ls[0], lf[1], ls[1]],
  ]
  if (yTop > 1.2)
    for (let i = 0; i < 3; i++)
      for (const [f0, s0, f1, s1] of faces) {
        k.rod(Y, [f0, tiers[i], s0], [f1, tiers[i + 1], s1], 0.05, 6)
        k.rod(Y, [f1, tiers[i], s1], [f0, tiers[i + 1], s0], 0.05, 6)
        if (i > 0) boxMM(k, Y, [Math.min(f0, f1) - 0.06, tiers[i] - 0.06, Math.min(s0, s1) - 0.06], [Math.max(f0, f1) + 0.06, tiers[i] + 0.06, Math.max(s0, s1) + 0.06])
      }
  const yP = padTop - 2.0
  if (yP > 2.2) {
    const pf0 = lf[1] + 0.12
    const pf1 = lf[1] + 1.0
    grating(k, [(pf0 + pf1) / 2, yP, 0], pf1 - pf0, 2 * half)
    for (const s of ls) {
      boxMM(k, Y, [lf[1], yP - 0.2, s - 0.06], [pf1, yP - 0.03, s + 0.06])
      k.rod(Y, [lf[1], yP - 1.0, s], [pf1 - 0.1, yP - 0.12, s], 0.04, 6)
    }
    boxMM(k, Y, [pf1 - 0.06, yP - 0.2, -half], [pf1, yP - 0.03, half])
    const ld = Math.min(0.5, half - 0.45)
    handrail(k, [[pf0, yP, -half + 0.03], [pf1 - 0.03, yP, -half + 0.03], [pf1 - 0.03, yP, ld - 0.38]])
    handrail(k, [[pf1 - 0.03, yP, ld + 0.38], [pf1 - 0.03, yP, half - 0.03], [pf0, yP, half - 0.03]])
    ladder(k, [pf1 + 0.12, 0, ld], yP, [1, 0, 0], { mat: 'galvanised' })
  }
}

// ---------------------------------------------------------------- slewing assembly (rotates about Y)
function buildSlewing(k: Kit, D: Dims, swl: number, tag: string) {
  const Y = craneYellow()
  const W = paint('#e8e9e4', { weather: 0.8 })
  const dark: MatKey = 'castIron'
  const blue: MatKey = 'motorPaint'
  const B = (f0: number, y0: number, s0: number, f1: number, y1: number, s1: number, mat: MatKey = Y) => boxMM(k, mat, [f0, y0, s0], [f1, y1, s1])
  const cylY = (mat: MatKey, f: number, s: number, y0: number, y1: number, r: number, seg = 16) => k.cyl(mat, r, y1 - y0, [f, (y0 + y1) / 2, s], 'y', seg)
  const cylS = (mat: MatKey, f: number, y: number, s0: number, s1: number, r: number, seg = 16) => k.cyl(mat, r, s1 - s0, [f, y, (s0 + s1) / 2], 'z', seg)
  const { yD, yTT, yR, fA, yA } = D
  const rBear = 1.8 * D.k
  const s0 = -Math.max(1.75, rBear + 0.05)

  k.boltCircle('boltXylan', 'nut', 48, rBear - 0.08, [0, yTT - 0.02, 0], 'y', 0.03, 0.1, [0.05])
  k.cyl(dark, rBear - 0.02, 0.06, [0, yTT - 0.03, 0], 'y', 56)
  k.cyl(Y, 1.65 * D.k, yD - 0.5 - yTT, [0, (yTT + yD - 0.5) / 2, 0], 'y', 48)
  B(-2.95, yD - 0.5, s0, 3.3, yD, 2.0)
  // two slew drives: pinion on the bearing gear, gearbox, hydraulic motor
  const rPin = rBear + 0.26
  for (const sg of [-1, 1]) {
    const f = rPin * Math.cos(36 * DEG)
    const s = sg * rPin * Math.sin(36 * DEG)
    cylY(dark, f, s, D.yB + 0.02, yTT - 0.02, 0.17, 14)
    cylY(dark, f, s, yTT, yD - 0.5, 0.22, 14)
    cylY(dark, f, s, yD, yD + 0.1, 0.22, 14)
    cylY(blue, f, s, yD + 0.1, yD + 0.62, 0.16, 14)
  }
  B(-2.95, yD - 0.3, 2.0, -0.02, yD - 0.02, 2.95)
  for (const f of [-2.0, -1.0]) B(f - 0.05, yD - 0.25, 2.0, f + 0.05, yD - 0.02, 2.85)

  // machinery house with louvres, doors, roof cooler, exhaust stack and luffing winch
  const H = { f0: -0.9, f1: 1.45, s0: -1.75, s1: 1.95 }
  B(H.f0, yD, H.s0, H.f1, yR, H.s1, W)
  B(H.f0 - 0.05, yR, H.s0 - 0.05, H.f1 + 0.05, yR + 0.08, H.s1 + 0.05, 'galvanised')
  const lv = louvreMaterial('#8c9196')
  for (const [f0, f1] of [[-0.65, 0.1], [0.35, 1.2]]) {
    B(f0 - 0.04, yD + 0.98, H.s0 - 0.03, f1 + 0.04, yD + 2.62, H.s0 - 0.002, dark)
    k.add(lv, new THREE.PlaneGeometry(f1 - f0, 1.6), new THREE.Matrix4().makeRotationY(Math.PI).setPosition((f0 + f1) / 2, yD + 1.8, H.s0 - 0.032))
  }
  k.add(lv, new THREE.PlaneGeometry(1.1, 1.2), new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(H.f0 - 0.006, yD + 2.0, -0.85))
  const sign = textMaterial(`SWL ${swl} t`, '#111111', '#f2c40f', 1024, 220)
  k.plane(sign, 2.2, 0.47, [0.3, yD + 2.95, H.s0 - 0.006], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
  B(-0.8, yD + 0.02, H.s1, -0.08, yD + 2.05, H.s1 + 0.03, 'galvanised')
  B(-0.25, yD + 1.0, H.s1 + 0.03, -0.15, yD + 1.06, H.s1 + 0.07, dark)
  B(H.f0 - 0.03, yD + 0.02, 0.4, H.f0, yD + 2.05, 1.15, 'galvanised')
  B(0.75, yR + 0.08, -1.35, 1.4, yR + 0.75, -0.2, W)
  for (const s of [-1.0, -0.52]) {
    cylY('rubberBlack', 1.075, s, yR + 0.75, yR + 0.78, 0.22, 18)
    k.disc(paint('#22252a'), 0.2, [1.075, yR + 0.785, s], 'y', 18)
  }
  k.cyl(dark, 0.24, 1.05, [-0.275, yR + 0.42, -1.2], 'x', 16)
  for (const f of [-0.6, 0.05]) B(f - 0.04, yR + 0.08, -1.42, f + 0.04, yR + 0.3, -0.98, dark)
  cylY(dark, -0.75, -1.2, yR + 0.42, yR + 2.3, 0.11, 12)
  cylY('rubberBlack', -0.75, -1.2, yR + 2.1, yR + 2.3, 0.125, 12)
  const yLw = yR + 0.62
  cylS(dark, 0.05, yLw, -0.5, 0.7, 0.4, 24)
  cylS(ropeMaterial(), 0.05, yLw, -0.45, 0.65, 0.44, 24)
  for (const s of [-0.55, 0.7]) cylS(Y, 0.05, yLw, s, s + 0.05, 0.56, 24)
  for (const s of [-0.68, 0.78]) B(-0.5, yR + 0.08, s, 0.6, yLw + 0.15, s + 0.1)
  cylS(dark, 0.05, yLw, 0.88, 1.05, 0.24, 14)
  cylS(blue, 0.05, yLw, 1.05, 1.4, 0.18, 14)

  // open winch bay: main and auxiliary hoist winches (drums across the house)
  const winch = (a: number, b: number, r: number, out: number): V3 => {
    const f = -1.6
    const y = yD + 0.95
    cylS(dark, f, y, a + 0.1, b - 0.1, r, 24)
    cylS(ropeMaterial(), f, y, a + 0.16, b - 0.16, r + 0.05, 24)
    for (const s of [a + 0.1, b - 0.14]) cylS(Y, f, y, s, s + 0.04, r + 0.17, 28)
    for (const s of [a, b - 0.1]) B(f - r - 0.3, yD, s, f + r + 0.3, y + 0.2, s + 0.1)
    const sm = out < 0 ? a : b
    cylS(dark, f, y, Math.min(sm, sm + out * 0.2), Math.max(sm, sm + out * 0.2), 0.3, 16)
    cylS(blue, f, y, Math.min(sm + out * 0.2, sm + out * 0.55), Math.max(sm + out * 0.2, sm + out * 0.55), 0.2, 14)
    return [f, y + r + 0.05, (a + b) / 2]
  }
  const mainDrum = winch(-1.2, 0.0, 0.45, -1)
  const auxDrum = winch(0.25, 1.35, 0.38, 1)
  // counterweight with hazard striping
  const CW = { f0: -2.95, f1: -2.3, y0: yD - 0.9, y1: yD + 1.0 }
  B(CW.f0, CW.y0, H.s0, CW.f1, CW.y1, H.s1)
  hazardPanel(k, [CW.f0, (CW.y0 + CW.y1) / 2, (H.s0 + H.s1) / 2], H.s1 - H.s0, CW.y1 - CW.y0, [-1, 0, 0])
  for (const sg of [-1, 1]) hazardPanel(k, [(CW.f0 + CW.f1) / 2, (CW.y0 + CW.y1) / 2, sg > 0 ? H.s1 : H.s0], CW.f1 - CW.f0, CW.y1 - CW.y0, [0, 0, sg])

  // walkway with handrail and the ladder down to the pedestal ring platform
  grating(k, [(-2.95 - 1.3) / 2, yD, 2.475], 1.65, 0.95)
  grating(k, [(-0.7 - 0.02) / 2, yD, 2.475], 0.68, 0.95)
  handrail(k, [[-2.93, yD, 2.02], [-2.93, yD, 2.93], [-0.05, yD, 2.93]])
  ladder(k, [-1.0, D.yB - 2.2, 2.2], yD, [0, 0, 1], { mat: 'galvanised', cage: false })

  // operator cab beside the boom foot
  const C = { f0: 0.0, f1: 2.5, s0: 1.98, s1: 3.1, y0: yD + 0.3, y1: yD + 2.75 }
  B(C.f0 + 0.1, yD - 0.3, C.s0, C.f1 - 0.1, C.y0, C.s1 - 0.05)
  B(C.f0, C.y0, C.s0, C.f1, C.y1, C.s1)
  B(C.f1, yD + 1.0, C.s0 + 0.1, C.f1 + 0.025, C.y1 - 0.12, C.s1 - 0.1, 'glass')
  B(C.f1, C.y0 + 0.12, C.s0 + 0.14, C.f1 + 0.025, yD + 0.88, C.s1 - 0.14, 'glass')
  B(C.f1, yD + 1.0, 2.52, C.f1 + 0.035, C.y1 - 0.12, 2.58)
  B(0.75, yD + 1.0, C.s1, C.f1 - 0.1, C.y1 - 0.12, C.s1 + 0.025, 'glass')
  B(1.55, yD + 1.0, C.s1, 1.62, C.y1 - 0.12, C.s1 + 0.035)
  B(H.f1 + 0.1, yD + 1.0, C.s0 - 0.025, C.f1 - 0.1, C.y1 - 0.12, C.s0, 'glass')
  B(1.25, C.y1, C.s0 + 0.12, C.f1 - 0.1, C.y1 + 0.025, C.s1 - 0.12, 'glass')
  bar(k, dark, [C.f1, C.y1 - 0.02, (C.s0 + C.s1) / 2], [C.f1 + 0.4, C.y1 - 0.16, (C.s0 + C.s1) / 2], 1.2, 0.03)
  for (const s of [2.25, 2.8]) bar(k, 'rubberBlack', [C.f1 + 0.04, yD + 1.08, s], [C.f1 + 0.04, yD + 1.95, s + 0.18], 0.02, 0.03, [1, 0, 0])
  B(C.f0 - 0.03, C.y0 + 0.03, 2.15, C.f0, yD + 2.45, 2.9, 'galvanised')
  B(C.f0 - 0.04, yD + 1.5, 2.3, C.f0 - 0.03, yD + 2.25, 2.75, 'glass')
  B(C.f0 - 0.08, yD + 1.25, 2.72, C.f0 - 0.03, yD + 1.3, 2.84, dark)
  B(0.1, C.y1, 2.1, 0.95, C.y1 + 0.38, 2.95, W)
  B(C.f0 - 0.6, yD, 2.1, C.f0, yD + 0.3, 2.85, 'galvanised')
  for (const z of [-0.8, 0.8]) B(H.f1, yD + 2.55, z - 0.2, H.f1 + 0.06, yD + 3.1, z + 0.2, dark)
  if (tag) k.plane(textMaterial(tag, '#111111', '#f2c40f', 512, 128), 1.0, 0.25, [1.25, yD + 0.65, C.s1 + 0.004])
  k.add(paint('#2b2f33'), new THREE.BoxGeometry(0.6, 0.9, 0.5), new THREE.Matrix4().makeTranslation(1.6, yD + 0.75, 2.55))

  // A-frame gantry: front legs from the house roof, back stays to the counterweight, crosshead
  const legS = [-1.6, 1.75]
  for (const s of legS) {
    bar(k, Y, [1.2, yR + 0.08, s], [fA, yA, s], 0.28, 0.28, [0, 0, 1])
    bar(k, Y, [-2.62, CW.y1, s], [fA, yA, s], 0.26, 0.26, [0, 0, 1])
    B(0.95, yR + 0.08, s - 0.22, 1.45, yR + 0.14, s + 0.22, dark)
    B(-2.9, CW.y1, s - 0.2, -2.35, CW.y1 + 0.06, s + 0.2, dark)
  }
  B(fA - 0.25, yA - 0.2, -1.85, fA + 0.25, yA + 0.2, 2.0)
  const tm = 0.49
  const fMid = 1.2 + (fA - 1.2) * tm
  const yMid = yR + 0.08 + (yA - yR - 0.08) * tm
  bar(k, Y, [fMid, yMid, legS[0]], [fMid, yMid, legS[1]], 0.16, 0.16)
  k.rod(Y, [1.2, yR + 0.08, legS[0]], [fMid, yMid, legS[1]], 0.06, 8)
  k.rod(Y, [1.2, yR + 0.08, legS[1]], [fMid, yMid, legS[0]], 0.06, 8)
  const fBk = -2.62 + (fA + 2.62) * 0.55
  const yBk = CW.y1 + (yA - CW.y1) * 0.55
  bar(k, Y, [fBk, yBk, legS[0]], [fBk, yBk, legS[1]], 0.16, 0.16)
  for (const s of legS) {
    B(fMid + 0.15, yMid + 0.3, s - 0.18, fMid + 0.35, yMid + 0.55, s + 0.18, dark)
    k.plane('lampLens', 0.3, 0.2, [fMid + 0.352, yMid + 0.425, s], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
  }
  k.cyl(dark, 0.09, 0.08, [fA, yA + 0.46, 0.2], 'y', 10)
  k.sphere(paint('#ff2a1a', { emissive: '#ff1a0a', emissiveIntensity: 1.6 }), 0.13, [fA, yA + 0.55, 0.2], undefined, 12)
  // hoist lead sheaves above the crosshead
  for (const s of [-0.95, 0.95]) {
    B(fA - 0.14, yA + 0.2, s - 0.12, fA + 0.14, D.lead[1] + 0.08, s - 0.09)
    B(fA - 0.14, yA + 0.2, s + 0.09, fA + 0.14, D.lead[1] + 0.08, s + 0.12)
    cylS(dark, D.lead[0], D.lead[1], s - 0.08, s + 0.08, D.rLead, 24)
    k.torus(ropeMaterial(), D.rLead, 0.022, [D.lead[0], D.lead[1], s], 'z', 6, 24, Math.PI)
    k.torus(Y, D.rLead + 0.07, 0.025, [D.lead[0], D.lead[1], s], 'z', 6, 24, Math.PI)
    k.cyl('stainless', 0.05, 0.3, [D.lead[0], D.lead[1], s], 'z', 10)
  }
  // upper luffing block under the crosshead
  const [uf, uy] = D.uHub
  cylS(dark, uf, uy, -0.55, 0.55, D.rBlock, 26)
  for (let i = 0; i < 6; i++) k.torus(ropeMaterial(), D.rBlock, 0.022, [uf, uy, -0.45 + 0.18 * i], 'z', 6, 26)
  for (const s of [-0.62, 0.57]) B(fA - 0.05, yA - 1.0, s, fA + 0.75, yA - 0.2, s + 0.05)
  // boom foot lugs + pin
  const w = Math.max(0.98, 1.1 * D.k)
  for (const sg of [-1, 1]) {
    B(D.foot - 0.5, yD, sg * w, D.foot + 0.4, D.yFoot + 0.3, sg * (w + 0.2))
    B(D.foot - 0.5, yD, sg * (w + 0.3), D.foot + 0.4, D.yFoot + 0.3, sg * (w + 0.5))
  }
  cylS(dark, D.foot, D.yFoot, -w - 0.55, w + 0.55, 0.11, 14)
  // fixed ropes: drums → lead sheaves, luffing winch → upper block
  const rm = ropeMaterial()
  k.rod(rm, mainDrum, [D.lead[0] - D.rLead, D.lead[1], -0.95], 0.022, 6)
  k.rod(rm, auxDrum, [D.lead[0] - D.rLead, D.lead[1], 0.95], 0.022, 6)
  k.rod(rm, [0.05, yLw + 0.44, 0.1], [uf, uy - D.rBlock, 0.1], 0.022, 6)
}

// ---------------------------------------------------------------- lattice boom (foot-pin frame, along +X)
function buildBoom(k: Kit, D: Dims) {
  const Y = craneYellow()
  const dark: MatKey = 'castIron'
  const { L, st } = D
  const B = (t: number, n: number, s: number): V3 => [t, n, s]
  const chordR = 0.095 * Math.sqrt(D.k)
  const CORN: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  const cp = (q: { t: number; w: number; d: number }, i: number) => B(q.t, (CORN[i][1] * q.d) / 2, (CORN[i][0] * q.w) / 2)
  for (let i = 0; i < 4; i++) for (let j = 0; j < st.length - 1; j++) k.pipe(Y, cp(st[j], i), cp(st[j + 1], i), 2 * chordR, 0.016, 16)
  const stations: { t: number; w: number; d: number }[] = []
  for (let j = 0; j < st.length - 1; j++) {
    const a = st[j]
    const e = st[j + 1]
    const nb = Math.max(1, Math.round((e.t - a.t) / (1.85 * Math.max(D.k, 0.7))))
    for (let q = 0; q < nb; q++) {
      const u = q / nb
      stations.push({ t: a.t + (e.t - a.t) * u, w: a.w + (e.w - a.w) * u, d: a.d + (e.d - a.d) * u })
    }
  }
  stations.push(st[st.length - 1])
  for (let j = 0; j < stations.length; j++) {
    const a = stations[j]
    for (let i = 0; i < 4; i++) k.rod(Y, cp(a, i), cp(a, (i + 1) % 4), 0.04, 6)
    if (j % 3 === 1) k.rod(Y, cp(a, 0), cp(a, 2), 0.035, 6)
    if (j === stations.length - 1) break
    const e = stations[j + 1]
    for (let i = 0; i < 4; i++) {
      const i2 = (i + 1) % 4
      if (j % 2 === 0) k.rod(Y, cp(a, i), cp(e, i2), 0.045, 6)
      else k.rod(Y, cp(a, i2), cp(e, i), 0.045, 6)
    }
  }
  // foot pin bosses
  for (const sg of [-1, 1]) k.cyl(Y, 0.2, 0.18, [0, 0, sg * (st[0].w / 2)], 'z', 18)
  // rope guide sheaves on the boom foot
  for (const s of [-0.25, 0.25]) {
    k.cyl(dark, D.rGuide, 0.14, [D.guide.t, D.guide.n, s], 'z', 24)
    k.torus(ropeMaterial(), D.rGuide, 0.022, [D.guide.t, D.guide.n, s], 'z', 6, 24, Math.PI)
    for (const ds of [-0.11, 0.11]) {
      bar(k, Y, [0.45, 0.2, s + ds], [D.guide.t, D.guide.n, s + ds], 0.03, 0.12)
      bar(k, Y, [1.2, 0.28, s + ds], [D.guide.t, D.guide.n, s + ds], 0.03, 0.12)
    }
  }
  // boom angle indicator facing the cab
  {
    const s = st[1].w / 2 + 0.19
    bar(k, Y, [3.0, 0.1, st[1].w / 2], [3.0, 0.1, s], 0.06, 0.06)
    k.cyl('equipmentPaint', 0.24, 0.04, [3.0, 0.1, s + 0.02], 'z', 20)
    bar(k, 'rubberBlack', [3.0, 0.1, s + 0.045], [3.0, -0.1, s + 0.045], 0.02, 0.025, [0, 0, 1])
  }
  // boom head: striped side plates, main sheaves, top plate, whip jib, anemometer, light
  for (const sg of [-1, 1]) {
    boxMM(k, Y, [L - 0.3, -0.55, sg * 0.51], [L + 1.05, 0.5, sg * 0.55])
    hazardPanel(k, [L + 0.375, -0.025, sg * 0.55], 1.35, 1.05, [0, 0, sg], 0.22)
  }
  boxMM(k, Y, [L - 0.3, 0.46, -0.51], [L + 0.7, 0.52, 0.51])
  for (const s of [-0.22, 0.22]) {
    k.cyl(dark, D.sheaveR, 0.16, [D.tip.t, D.tip.n, s], 'z', 28)
    k.torus(ropeMaterial(), D.sheaveR - 0.01, 0.025, [D.tip.t, D.tip.n, s], 'z', 6, 32)
  }
  k.cyl(dark, 0.08, 1.2, [D.tip.t, D.tip.n, 0], 'z', 10)
  for (const a of [Math.PI / 3, (2 * Math.PI) / 3]) k.cyl('galvanised', 0.02, 0.98, [D.tip.t + Math.cos(a) * (D.sheaveR + 0.07), D.tip.n + Math.sin(a) * (D.sheaveR + 0.07), 0], 'z', 8)
  // anti-two-block limit switch under the head (weight hangs on the hoist falls)
  boxMM(k, 'actuatorRed', [D.tip.t + 0.2, -0.6, -0.46], [D.tip.t + 0.4, -0.45, -0.3])
  k.rod(dark, [D.tip.t + 0.3, -0.45, -0.38], [D.tip.t + 0.3, -0.3, -0.48], 0.02, 6)
  // boom backstops (telescopic struts bearing on the house front at maximum boom angle)
  for (const sg of [-1, 1]) {
    const z = sg * 0.8
    const a: V3 = [4.4, sectionAt(st, 4.4).d / 2, z]
    const b: V3 = [1.55, 1.95, z]
    const m: V3 = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, z]
    k.rod(Y, a, m, 0.075, 12)
    k.rod('stainless', m, b, 0.05, 12)
    k.cyl('rubberBlack', 0.11, 0.08, b, [b[0] - a[0], b[1] - a[1], 0], 14)
  }
  // floodlights on the foot section lighting the hook
  for (const sg of [-1, 1]) {
    const p: V3 = [2.6, sectionAt(st, 2.6).d / 2 + 0.18, sg * 0.55]
    k.rod(dark, [p[0], p[1] - 0.18, p[2]], p, 0.025, 6)
    k.box(dark, [0.18, 0.26, 0.34], [p[0], p[1] + 0.1, p[2]])
    k.plane('lampLens', 0.3, 0.22, [p[0] + 0.091, p[1] + 0.1, p[2]], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
  }
  for (const sg of [-1, 1]) {
    bar(k, Y, [L + 0.3, 0.6, sg * 0.2], [L + 2.75, 0.78, sg * 0.2], 0.05, 0.36)
    bar(k, Y, [L + 0.95, -0.2, sg * 0.42], [L + 2.3, 0.62, sg * 0.2], 0.05, 0.14)
  }
  k.cyl(dark, D.rAux, 0.14, [D.aux.t, D.aux.n, 0], 'z', 24)
  k.torus(ropeMaterial(), D.rAux, 0.02, [D.aux.t, D.aux.n, 0], 'z', 6, 24, Math.PI / 2)
  k.cyl(dark, 0.05, 0.5, [D.aux.t, D.aux.n, 0], 'z', 10)
  {
    const b0: V3 = [L + 0.2, 0.52, -0.3]
    const top: V3 = [b0[0], b0[1] + 1.3, b0[2]]
    k.rod('galvanised', b0, top, 0.03, 6)
    k.rod('galvanised', [top[0], top[1], top[2] - 0.25], [top[0], top[1], top[2] + 0.25], 0.02, 6)
    const an: V3 = [top[0], top[1], top[2] - 0.25]
    k.rod(dark, an, [an[0], an[1] + 0.12, an[2]], 0.015, 6)
    for (let i = 0; i < 3; i++) {
      const t = (i / 3) * Math.PI * 2
      const tp: V3 = [an[0] + Math.cos(t) * 0.12, an[1] + 0.12, an[2] + Math.sin(t) * 0.12]
      k.rod(dark, [an[0], an[1] + 0.12, an[2]], tp, 0.008, 4)
      k.sphere('equipmentPaint', 0.035, tp, undefined, 8)
    }
    const lb: V3 = [L + 0.2, 0.52, 0.3]
    k.rod('galvanised', lb, [lb[0], lb[1] + 0.5, lb[2]], 0.03, 6)
    k.sphere(paint('#ff2a1a', { emissive: '#ff1a0a', emissiveIntensity: 1.6 }), 0.13, [lb[0], lb[1] + 0.62, lb[2]], undefined, 12)
  }
  // ropes along the boom: guide sheaves → head sheaves (main) / whip sheave (aux)
  const rm = ropeMaterial()
  k.rod(rm, [D.guide.t, D.guide.n + D.rGuide, -0.25], [D.tip.t, D.tip.n + D.sheaveR, -0.22], 0.022, 6)
  k.rod(rm, [D.guide.t, D.guide.n + D.rGuide, 0.25], [D.aux.t, D.aux.n + D.rAux, 0], 0.022, 6)
  // pendant lugs
  for (const sg of [-1, 1]) boxMM(k, Y, [L - 0.35, 0.45, sg * 0.5 - 0.04], [L + 0.05, 0.62, sg * 0.5 + 0.04])
  for (const sg of [-1, 1]) k.cyl(dark, 0.05, 0.14, [D.lug.t, D.lug.n, sg * 0.5], 'z', 10)
}

// ---------------------------------------------------------------- moving blocks
function buildHookBlock(k: Kit, swl: number) {
  const Y = craneYellow()
  const dark: MatKey = 'castIron'
  for (const sg of [-1, 1]) {
    boxMM(k, Y, [-0.62, -0.75, sg * 0.39], [0.62, 0.55, sg * 0.45])
    hazardPanel(k, [0, -0.1, sg * 0.45], 1.24, 1.3, [0, 0, sg], 0.22)
    k.cyl(dark, 0.5, 0.22, [0, 0, sg * 0.22], 'z', 28)
    k.torus(ropeMaterial(), 0.5, 0.022, [0, 0, sg * 0.22], 'z', 6, 32)
  }
  k.cyl(dark, 0.09, 1.0, [0, 0, 0], 'z', 12)
  for (const sg of [-1, 1]) k.hex('nut', 0.2, 0.06, [0, 0, sg * 0.48], 'z')
  boxMM(k, dark, [-0.35, -0.98, -0.39], [0.35, -0.75, 0.39])
  k.cyl(dark, 0.1, 0.4, [0, -1.15, 0], 'y', 14)
  const hs = clamp(0.16 + swl / 250, 0.17, 0.32)
  hook(k, [0, -1.35 - hs * 0.4, 0], hs, dark)
  k.box(textMaterial(`SWL ${swl} t`, '#f2c40f', '#111111', 256, 64), [0.5, 0.125, 0.004], [0, 0.3, 0.458])
}

function buildSpreader(k: Kit) {
  const Y = craneYellow()
  k.cyl('castIron', 0.42, 1.04, [0, 0, 0], 'z', 26)
  for (let i = 0; i < 6; i++) k.torus(ropeMaterial(), 0.42, 0.022, [0, 0, -0.45 + 0.18 * i], 'z', 6, 26)
  k.box(Y, [0.22, 0.22, 1.5], [0, 0.45, 0])
  for (const sg of [-1, 1]) k.box(Y, [1.0, 1.0, 0.05], [0, 0.15, sg * 0.58])
  k.cyl('stainless', 0.06, 1.3, [0, 0, 0], 'z', 10)
  // load cell (LMI) in the pendant equaliser
  k.cyl('actuatorBlue', 0.06, 0.28, [0, 0.72, 0.62], 'y', 12)
}

function buildBall(k: Kit) {
  const Y = craneYellow()
  k.rod(ropeMaterial(), [0, 0, 0], [0, -2.58, 0], 0.02, 6)
  k.sphere(Y, 0.32, [0, -2.9, 0], undefined, 18)
  k.cyl('rubberBlack', 0.325, 0.12, [0, -2.9, 0], 'y', 18)
  k.cyl('castIron', 0.05, 0.2, [0, -3.3, 0], 'y', 8)
  hook(k, [0, -3.55, 0], 0.1, 'castIron')
}

// Anti-two-block weight: split collar around one hoist fall, eye for the switch chain.
function buildA2B(k: Kit) {
  k.lathe('actuatorRed', [[0.035, -0.15], [0.12, -0.15], [0.12, 0.15], [0.035, 0.15], [0.035, -0.15]], [0, 0, 0], 'y', 20)
  k.torus('galvanised', 0.035, 0.008, [0, 0.19, -0.13], 'x', 6, 12)
  k.rod('galvanised', [0, 0.15, -0.1], [0, 0.17, -0.13], 0.008, 6)
}
