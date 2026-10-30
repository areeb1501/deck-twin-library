/**
 * Horizontal pressure vessel (3-phase / test separator, flare KO drum).
 * Local frame: origin at the vessel axis, mid T/T; axis along +X; deck at
 * y = -(elevation + id/2 + wall).
 *
 * Outside: shell + true 2:1 heads with wall thickness, weld seams, nozzle pads, welded
 * saddles with anchor bolts, 24" davit manway, lifting lugs, nameplate, water boots,
 * optional aluminium cladding.
 * Inside (section box / x-ray): inlet device, perforated calming baffles, overflow weir,
 * mesh pad or vane pack, vortex breakers, water / oil volumes.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { HorizontalVessel } from '../../model/types'
import { pipeOD } from '../../model/catalog'
import { NozzleNeck } from '../common/NozzleNeck'
import {
  Parts,
  PartMeshes,
  UP,
  V,
  T,
  addManway,
  addNozzlePads,
  addSaddle,
  addVortexBreaker,
  basisM,
  box,
  boxAt,
  clamp,
  clipStations,
  conformPad,
  frame,
  hStations,
  headProfile,
  lathe,
  liftingLug,
  liquidMaterial,
  liquidX,
  localNozzles,
  perforatedMaterial,
  rAtStations,
  ring,
  rod,
  seamRing,
  segmentPlate,
  toX,
  vesselProfile,
  vesselProjector,
  type LocalNozzle,
  type Prof,
  type Projector,
} from './vesselParts'

const T_INS = 0.05 // insulation thickness under the cladding

export function buildHorizontalVessel(eq: HorizontalVessel): Parts {
  const R = eq.id / 2
  const w = eq.wall
  const Ro = R + w
  const L = eq.tt
  const b = eq.id / 4
  const bo = b + w
  const yDeck = -(eq.elevation + Ro)
  const k = clamp(Ro / 1.8, 0.4, 1.4)
  const seg = Ro > 1.2 ? 96 : 72
  const ins = !!eq.insulated
  const Rc = Ro + T_INS
  const bc = bo + T_INS
  const p = new Parts()
  const noz = localNozzles(eq)
  const padT = clamp(w * 0.7, 0.012, 0.035)

  // ------------------------------------------------------------ shell + heads (thick wall)
  p.add('equipmentPaint', toX(lathe(vesselProfile(Ro, bo, -L / 2, L / 2, 40), seg)))
  p.add('vesselInner', toX(lathe(vesselProfile(R, b, -L / 2, L / 2, 40), seg)))
  p.add('vesselInner', toX(lathe(vesselProfile(Ro, bo, -L / 2, L / 2, 40), seg)))

  // saddle footprint (for cladding cut-outs)
  const sk = clamp(Ro / 1.8, 0.35, 1.4)
  const saddleHalf = Math.max(0.16, 0.3 * sk) / 2 + 0.05 * sk + 0.04

  // ------------------------------------------------------------ weld seams
  if (!ins) {
    const nC = Math.max(1, Math.round(L / 2.4))
    const xs = [-L / 2, L / 2]
    for (let i = 1; i < nC; i++) xs.push(-L / 2 + (i * L) / nC)
    for (const x of xs) p.add('equipmentPaint', toX(seamRing(Ro, x, 0.022 + 0.008 * k, 0.003, seg)))
    for (let i = 0; i < nC; i++) {
      const x0 = -L / 2 + (i * L) / nC
      const x1 = x0 + L / nC
      const th = ((i % 2 ? 1 : -1) * 38 * Math.PI) / 180
      const r = Ro + 0.0006
      p.add('equipmentPaint', box(x1 - x0, 0.004, 0.02, new THREE.Matrix4().makeRotationX(th).setPosition((x0 + x1) / 2, r * Math.cos(th), r * Math.sin(th))))
    }
  }

  // ------------------------------------------------------------ insulation cladding
  if (ins) {
    p.add('insulation', toX(lathe(headProfile(Rc, bc, -L / 2, -1, 32), seg)))
    p.add('insulation', toX(lathe(headProfile(Rc, bc, L / 2, 1, 32), seg)))
    const gaps = eq.saddles.map((s) => [s - saddleHalf, s + saddleHalf] as const).sort((a, c) => a[0] - c[0])
    const iv: [number, number, boolean, boolean][] = []
    let x = -L / 2
    let openStart = false
    for (const [g0, g1] of gaps) {
      if (g0 > x) iv.push([x, g0, openStart, true])
      x = g1
      openStart = true
    }
    if (x < L / 2) iv.push([x, L / 2, openStart, false])
    for (const [x0, x1, c0, c1] of iv) {
      const prof: Prof = []
      if (c0) prof.push([Ro, x0])
      prof.push([Rc, x0], [Rc, x1])
      if (c1) prof.push([Ro, x1])
      p.add('insulation', toX(lathe(prof, seg, 0, Math.PI * 2, 10)))
      // lap seams + stainless bands
      for (let xb = x0 + 0.3; xb < x1 - 0.1; xb += 0.6) {
        p.add('stainless', toX(ring(Rc - 0.0005, Rc + 0.0025, xb - 0.0095, xb + 0.0095, seg)))
      }
      for (let xl = x0 + 0.6; xl < x1 - 0.1; xl += 1.2) p.add('insulation', toX(seamRing(Rc, xl, 0.012, 0.0016, seg)))
    }
  }

  // ------------------------------------------------------------ saddles
  eq.saddles.forEach((xs, i) => addSaddle(p, xs, Ro, yDeck, { sliding: i > 0 }))

  // ------------------------------------------------------------ boots
  const mainProj = vesselProjector('x', V(), L / 2, Ro, bo)
  const projectors: Projector[] = [mainProj]
  const bootWall = Math.min(w, 0.025)
  for (const bt of eq.boots ?? []) {
    const rbo = bt.d / 2
    const rbi = rbo - bootWall
    const bbi = (2 * rbi) / 4
    const bbo = bbi + bootWall
    const yTip = -Ro - bt.l
    const yT = yTip + bbo
    const conform = (g: THREE.BufferGeometry, Rs: number, yTop: number, lift: number) => {
      const pos = g.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getY(i) - yTop) < 1e-6) {
          const z = pos.getZ(i)
          pos.setY(i, -Math.sqrt(Math.max(Rs * Rs - z * z, 0)) + lift)
        }
      }
      pos.needsUpdate = true
      return g
    }
    const yTopO = -Math.sqrt(Ro * Ro - rbo * rbo) + 0.012
    const yTopI = -Math.sqrt(R * R - rbi * rbi) + 0.003
    const outer = () => conform(lathe([...headProfile(rbo, bbo, yT, -1, 20), [rbo, yTopO]], 48), Ro, yTopO, 0.012)
    p.add('equipmentPaint', outer(), T(bt.x, 0, 0))
    p.add('vesselInner', outer(), T(bt.x, 0, 0))
    p.add('vesselInner', conform(lathe([...headProfile(rbi, bbi, yT, -1, 20), [rbi, yTopI]], 48), R, yTopI, 0.003), T(bt.x, 0, 0))
    if (ins) {
      const rc = rbo + T_INS
      const yTopC = -Math.sqrt(Rc * Rc - rc * rc) + 0.01
      p.add('insulation', conform(lathe([...headProfile(rc, bbo + T_INS, yT, -1, 20), [rc, yTopC]], 48), Rc, yTopC, 0.01), T(bt.x, 0, 0))
    } else {
      p.add('equipmentPaint', seamRing(rbo, yT, 0.02, 0.0028, 48), T(bt.x, 0, 0))
      p.add('equipmentPaint', conformPad(V(bt.x, -Ro, 0), V(0, -1, 0), rbo - 0.002, rbo + 0.1 * k, padT, mainProj, 48))
    }
    projectors.push(vesselProjector('y', V(bt.x, (yT + yTopO) / 2, 0), (yTopO - yT) / 2, rbo, bbo))
    // boot water
    const rl = rbi - 0.004
    const yW = -R + 0.02
    p.add(liquidMaterial('liquidWater'), lathe([...headProfile(rl, bbi - 0.004, yT, -1, 16), [rl, yW], [0, yW]], 40), T(bt.x, 0, 0))
  }

  // ------------------------------------------------------------ nozzle pads
  if (!ins) addNozzlePads(p, noz, projectors, padT)

  // ------------------------------------------------------------ manway (24", davit hinged)
  {
    const cands = [
      { base: V(-(L / 2 + bo), 0, 0), dir: V(-1, 0, 0) },
      { base: V(L / 2 + bo, 0, 0), dir: V(1, 0, 0) },
      ...[-0.3, 0.3, -0.12, 0.12, 0].map((f) => ({ base: V(f * L, Ro, 0), dir: UP.clone() })),
    ]
    const clear = (c: { base: THREE.Vector3 }) => Math.min(99, ...noz.map((l) => l.base.distanceTo(c.base) - pipeOD(l.n.nps) / 2))
    const pick = cands.find((c) => clear(c) > 0.85) ?? cands.reduce((a, c) => (clear(c) > clear(a) ? c : a))
    const neck = 0.22 + (ins ? T_INS + 0.06 : 0)
    const mw = addManway(p, pick.base, pick.dir, { neck })
    if (!ins) p.add('equipmentPaint', conformPad(pick.base, pick.dir, mw.od / 2, mw.od / 2 + 0.13, padT, mainProj, 56))
  }

  // ------------------------------------------------------------ lifting lugs
  {
    const topNoz = noz.filter((l) => l.dir.y > 0.5)
    for (const s of [-1, 1]) {
      let x = s * (L / 2 - 0.45 * k)
      for (let tries = 0; tries < 6 && topNoz.some((l) => Math.abs(l.base.x - x) < pipeOD(l.n.nps) / 2 + 0.25 * k); tries++) x -= s * 0.35 * k
      p.add('equipmentPaint', liftingLug(x, Ro - 0.01, k * (ins ? 1.25 : 1)))
      if (!ins) p.add('equipmentPaint', boxAt(0.34 * k, 0.014, 0.12 * k, x, Ro + 0.004, 0))
    }
  }

  // ------------------------------------------------------------ nameplate bracket
  {
    const xs = eq.saddles.length ? eq.saddles[0] + (eq.saddles[0] < 0 ? 1 : -1) * 0.9 * k : 0
    const n = V(0, -0.22, -1).normalize()
    const surf = (ins ? Rc : Ro) + 0.002
    const so = 0.07
    for (const dx of [-0.13, 0.13]) {
      p.add('equipmentPaint', box(0.03, so, 0.01, basisM(V(xs + dx, 0, 0).addScaledVector(n, surf + so / 2 - 0.004), V(1, 0, 0), n)))
    }
    p.add('equipmentPaint', box(0.4, 0.006, 0.27, basisM(V(xs, 0, 0).addScaledVector(n, surf + so), V(1, 0, 0), n)))
    p.add('nameplate', box(0.34, 0.003, 0.21, basisM(V(xs, 0, 0).addScaledVector(n, surf + so + 0.004), V(1, 0, 0), n)))
  }

  // ------------------------------------------------------------ internals
  addInternals(p, eq, noz, { R, w, L, b, bo, k })
  return p
}

function addInternals(
  p: Parts,
  eq: HorizontalVessel,
  noz: LocalNozzle[],
  d: { R: number; w: number; L: number; b: number; bo: number; k: number },
) {
  const { R, w, L, b, k } = d
  const has = (x: NonNullable<HorizontalVessel['internals']>[number]) => eq.internals?.includes(x) ?? false
  const find = (re: RegExp) => noz.find((l) => re.test(l.n.name))
  const inlet = find(/inlet/i)
  const gasOut = noz.find((l) => /gas|vapou?r/i.test(l.n.name) && /out/i.test(l.n.name))
  const oilOut = noz.find((l) => /(oil|liquid|condensate)/i.test(l.n.name) && /out/i.test(l.n.name))
  const sIn = inlet ? Math.sign(inlet.base.x) || -1 : -1
  /** distance from the inlet-end tangent line, positive downstream */
  const xiOf = (x: number) => L / 2 - sIn * x
  const xOf = (xi: number) => sIn * (L / 2 - xi)
  const innerProj = vesselProjector('x', V(), L / 2, R, b)

  const lv = eq.levels ?? {}
  const hW = lv.water ? -R + lv.water * 2 * R : null
  const hO = lv.oil && (!lv.water || lv.oil > lv.water) ? -R + lv.oil * 2 * R : null

  // ---------------- inlet device
  let xiInletEnd = 0.6
  if (has('inletDiverter') && inlet) {
    const od = pipeOD(inlet.n.nps)
    const ro = od / 2
    const ri = ro - 0.0127
    const f = inlet.dir.clone().negate()
    if (Math.abs(inlet.dir.x) > 0.7) {
      // axial inlet on a head: pipe extension + half-open pipe (slotted bottom) + end plate
      const P0 = inlet.base.clone().addScaledVector(f, w - 0.03)
      const Lp = 0.45 * k + 0.1
      const Lh = Math.min(1.5, 0.16 * L)
      const M = frame(P0, f, UP)
      p.add('internalsSteel', ring(ri, ro, 0, Lp, 32), M)
      p.add('internalsSteel', ring(ri, ro, Lp, Lp + Lh, 32, -Math.PI / 2, Math.PI), M)
      p.add('internalsSteel', ring(0, ro + 0.01, Lp + Lh, Lp + Lh + 0.012, 32, -Math.PI / 2, Math.PI), M)
      for (const t of [Lp + Lh * 0.3, Lp + Lh * 0.85]) {
        const q = P0.clone().addScaledVector(f, t).addScaledVector(UP, ro)
        const tt = innerProj(q, UP)
        if (tt !== null && tt > 0) p.add('internalsSteel', box(0.012, tt + 0.01, 0.08 * k, basisM(q.clone().addScaledVector(UP, tt / 2), f, UP)))
      }
      xiInletEnd = xiOf(P0.x + f.x * (Lp + Lh))
    } else {
      // shell inlet: short extension + concave half-pipe diverter box
      const P0 = inlet.base.clone().addScaledVector(f, w - 0.03)
      const Le = 0.18 + 0.1 * k
      p.add('internalsSteel', ring(ri, ro, 0, Le, 32), frame(P0, f))
      const rD = od * 1.0
      const len = od * 2.4
      let axis = new THREE.Vector3().crossVectors(f, V(1, 0, 0))
      if (axis.lengthSq() < 1e-4) axis = V(0, 0, 1)
      axis.normalize()
      const Cd = P0.clone().addScaledVector(f, Le + 0.3 * od)
      const M = frame(Cd, axis, f)
      p.add('internalsSteel', ring(rD, rD + 0.012, -len / 2, len / 2, 32, -Math.PI / 2, Math.PI), M)
      for (const s of [-1, 1]) {
        const y0 = s > 0 ? len / 2 : -len / 2 - 0.012
        p.add('internalsSteel', ring(0, rD + 0.012, y0, y0 + 0.012, 32, -Math.PI / 2, Math.PI), M)
        // hanger straps back to the shell
        const lat = new THREE.Vector3().crossVectors(axis, f).normalize()
        for (const sl of [-1, 1]) {
          const q = Cd.clone().addScaledVector(axis, s * (len / 2 - 0.04)).addScaledVector(lat, sl * rD)
          const tt = innerProj(q, f.clone().negate())
          if (tt !== null && tt > 0) p.add('internalsSteel', box(0.06 * k, tt + 0.01, 0.01, basisM(q.clone().addScaledVector(f, -tt / 2), axis, f)))
        }
      }
      xiInletEnd = xiOf(inlet.base.x) + len / 2
    }
  }

  // ---------------- overflow weir
  let xW: number | null = null
  let yWeir = hO !== null ? hO - 0.06 * R : -0.1 * R
  if (has('weir')) {
    const xiO = oilOut ? xiOf(oilOut.base.x) : 0.85 * L
    const xiW = clamp(xiO - 0.6 * k - (oilOut ? pipeOD(oilOut.n.nps) / 2 : 0), 0.55 * L, L - 0.3)
    xW = xOf(xiW)
    yWeir = Math.max(yWeir, (hW ?? -R) + 0.15 * R)
    p.add('internalsSteel', segmentPlate(R - 0.003, yWeir, 'below', 0.012), T(xW, 0, 0))
    const ch = 2 * Math.sqrt(Math.max(R * R - yWeir * yWeir, 0)) - 0.02
    p.add('internalsSteel', boxAt(0.07, 0.012, ch, xW + sIn * 0.04, yWeir - 0.006, 0))
  }

  // ---------------- liquids
  {
    const rl = R - 0.004
    const bl = b - 0.004
    const st = hStations(L, rl, bl, 22)
    const rAt = (x: number) => rAtStations(L, rl, bl, x)
    const xMin = -L / 2 - bl
    const xMax = L / 2 + bl
    const water = liquidMaterial('liquidWater')
    const oil = liquidMaterial('liquidOil')
    const body = (x0: number, x1: number, lo: number, hi: number, m: THREE.Material) => {
      if (x1 - x0 < 0.01) return
      p.add(m, liquidX(clipStations(st, x0, x1, rAt), lo, hi))
    }
    const layers = (x0: number, x1: number) => {
      if (hW !== null) body(x0, x1, -10, hW, water)
      if (hO !== null) body(x0, x1, hW !== null ? hW + 0.004 : -10, hO, oil)
    }
    if (xW !== null) {
      const up: [number, number] = sIn < 0 ? [xMin, xW - 0.008] : [xW + 0.008, xMax]
      const dn: [number, number] = sIn < 0 ? [xW + 0.008, xMax] : [xMin, xW - 0.008]
      layers(...up)
      const hB = -R + 0.45 * (yWeir + R)
      body(dn[0], dn[1], -10, hB, hO !== null ? oil : water)
    } else layers(xMin, xMax)
  }

  // ---------------- perforated calming baffles
  if (has('perforatedBaffle')) {
    const yTop = hO !== null ? Math.min(0.75 * R, hO + 0.3 * R) : 0.3 * R
    const xi1 = Math.max(0.18 * L, xiInletEnd + 0.4)
    const xis = [xi1, xi1 + Math.max(0.8, 0.1 * L)].filter((x) => x < (xW !== null ? xiOf(xW) - 0.5 : L - 1))
    const alpha = Math.acos(clamp(-yTop / R, -1, 1))
    const chord = 2 * Math.sqrt(Math.max(R * R - yTop * yTop, 0)) - 0.02
    for (const xi of xis) {
      const x = xOf(xi)
      p.add(perforatedMaterial(), segmentPlate(R - 0.006, yTop, 'below', 0), T(x, 0, 0))
      const off = 0.008 * -sIn
      p.add('internalsSteel', toX(ring(R - 0.06 * k, R - 0.002, -0.005, 0.005, 64, Math.PI / 2 - alpha, 2 * alpha)), T(x + off, 0, 0))
      p.add('internalsSteel', boxAt(0.01, 0.08 * k, chord, x + off, yTop - 0.04 * k, 0))
      // vertical stiffeners
      for (const z of [-0.33, 0.33]) {
        const zz = z * R
        const yb = -Math.sqrt(R * R - zz * zz) + 0.01
        p.add('internalsSteel', boxAt(0.01, yTop - yb, 0.06 * k, x + off, (yTop + yb) / 2, zz))
      }
    }
  }

  // ---------------- gas outlet station
  const xiG = gasOut ? (Math.abs(gasOut.dir.x) > 0.7 ? L - 0.6 : xiOf(gasOut.base.x)) : L - 0.8
  const xG = xOf(xiG)

  // ---------------- mesh pad under the gas outlet
  if (has('meshPad')) {
    const yt = 0.62 * R
    const th = 0.15 * clamp(k, 0.7, 1)
    const yb = yt - th
    const zh = Math.sqrt(R * R - yt * yt) - 0.01
    const Lm = clamp(0.4 * eq.id, 0.6, 1.4)
    p.add('meshPad', boxAt(Lm, th, 2 * zh, xG, (yt + yb) / 2, 0))
    for (const s of [-1, 1]) p.add('internalsSteel', segmentPlate(R - 0.003, yt, 'above', 0.008), T(xG + (s * (Lm + 0.008)) / 2, 0, 0))
    for (const z of [-0.6, 0, 0.6]) p.add('internalsSteel', boxAt(Lm, 0.05, 0.008, xG, yb - 0.025, z * zh))
    for (const s of [-0.6, 0.6]) p.add('internalsSteel', boxAt(0.008, 0.05, 2 * zh * 0.98, xG + (s * Lm) / 2, yb - 0.025, 0))
    for (let i = 0; i < 4; i++) p.add('internalsSteel', boxAt(0.008, 0.02, 2 * zh, xG - Lm / 2 + (Lm * (i + 0.5)) / 4, yt + 0.01, 0))
  }

  // ---------------- vane pack (chevron demister) upstream of the gas outlet
  if (has('vanePack')) {
    const xv = xOf(xiG - 1.0 * k - 0.2)
    const yBot = Math.max((hO ?? -R) + 0.18 * R, -0.2 * R)
    const yTop = 0.8 * R
    const hw = Math.sqrt(R * R - yTop * yTop) - 0.02
    const dv = 0.26 * clamp(k, 0.6, 1)
    p.add('internalsSteel', segmentPlate(R - 0.003, yBot, 'above', 0.008, [-hw, yBot + 0.004, hw, yTop]), T(xv, 0, 0))
    const hh = yTop - yBot
    const yc = (yTop + yBot) / 2
    p.add('internalsSteel', boxAt(dv, 0.008, 2 * hw, xv, yTop + 0.004, 0))
    p.add('internalsSteel', boxAt(dv, 0.008, 2 * hw, xv, yBot - 0.004, 0))
    for (const s of [-1, 1]) p.add('internalsSteel', boxAt(dv, hh, 0.008, xv, yc, s * hw))
    const sp = 0.035
    const nSeg = 4
    const amp = 0.011
    const segL = dv / nSeg
    const ang = Math.atan2(2 * amp, segL)
    const len = Math.hypot(segL, 2 * amp)
    for (let z = -hw + sp / 2; z < hw - sp / 4; z += sp) {
      for (let j = 0; j < nSeg; j++) {
        const xc = xv - dv / 2 + segL * (j + 0.5)
        const m = new THREE.Matrix4().makeRotationY(j % 2 ? ang : -ang).setPosition(xc, yc, z)
        p.add('internalsSteel', box(len, hh, 0.0015, m))
      }
    }
  }

  // ---------------- vortex breakers on bottom outlets
  if (has('vortexBreaker')) {
    for (const l of noz) {
      if (l.dir.y > -0.7 || l.n.nps < 3) continue
      const inBoot = l.base.y < -(R + w) - 0.03
      const inside = l.base.clone().addScaledVector(l.dir, -(inBoot ? Math.min(w, 0.025) : w))
      addVortexBreaker(p, inside, UP, pipeOD(l.n.nps))
    }
  }

  // ---------------- liquid-side distributor rod (sand jetting header) along the bottom
  if (has('perforatedBaffle') && eq.id >= 2.4) {
    const y = -R + 0.12
    const x0 = xOf(Math.max(1.0, xiInletEnd))
    const x1 = xOf(xW !== null ? xiOf(xW) - 0.4 : L - 1.0)
    p.add('internalsSteel', rod(V(Math.min(x0, x1), y, -0.25 * R), V(Math.max(x0, x1), y, -0.25 * R), 0.03, 12))
    for (let x = Math.min(x0, x1) + 0.6; x < Math.max(x0, x1) - 0.3; x += 1.2) {
      p.add('internalsSteel', rod(V(x, -R + 0.02, -0.25 * R), V(x, y, -0.25 * R), 0.008, 6))
    }
  }
}

export function HorizontalVesselModel({ eq }: { eq: HorizontalVessel }) {
  const entries = useMemo(() => buildHorizontalVessel(eq).build(), [eq])
  return (
    <group>
      <PartMeshes entries={entries} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}
