/**
 * Vertical pressure vessel (compressor suction scrubber).
 * Local frame: origin at deck level on the vessel axis, axis along +Y,
 * bottom tangent line at y = elevation.
 *
 * Outside: shell + 2:1 heads with wall thickness, weld seams, nozzle pads, skirt (access
 * opening with sleeve + doubler, base ring, anchor chairs, vents) or legs, side manway with
 * davit, lifting lugs, nameplate, top platform with grating, toe plate, handrail and caged
 * ladder, maintenance davit.
 * Inside: vane-type inlet distributor, mesh pad, axial cyclone deck (instanced), downcomer,
 * vortex breaker, liquid volume.
 *
 * levels.liquid is read as a fraction of T/T above the bottom tangent line.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { VerticalVessel } from '../../model/types'
import { pipeOD } from '../../model/catalog'
import { materials } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import {
  Instances,
  Parts,
  PartMeshes,
  UP,
  V,
  T,
  addCagedLadder,
  addManway,
  addNozzlePads,
  addVortexBreaker,
  arcTube,
  basisM,
  box,
  clamp,
  conformPad,
  frame,
  headProfile,
  hexNut,
  lathe,
  liftingLug,
  liquidMaterial,
  localNozzles,
  prep,
  ring,
  rod,
  seamRing,
  vesselProfile,
  vesselProjector,
  type LocalNozzle,
} from './vesselParts'

const dirOf = (a: number) => V(Math.cos(a), 0, Math.sin(a))
/** lathe phi for an azimuth a (direction (cos a, 0, sin a)) */
const phiOf = (a: number) => Math.PI / 2 - a
const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

/** Azimuth (of 16 candidates) furthest from the given ones. */
function freeAzimuth(taken: number[], prefer = Math.PI) {
  let best = prefer
  let score = -1
  for (let i = 0; i < 16; i++) {
    const a = prefer + (i * Math.PI) / 8
    const s = taken.length ? Math.min(...taken.map((t) => angDist(a, t))) : Math.PI
    if (s > score + 1e-6) {
      score = s
      best = a
    }
  }
  return best
}

interface Built {
  parts: Parts
  cyclone: { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[] } | null
}

export function buildVerticalVessel(eq: VerticalVessel): Built {
  const R = eq.id / 2
  const w = eq.wall
  const Ro = R + w
  const b = eq.id / 4
  const bo = b + w
  const tt = eq.tt
  const e0 = eq.elevation
  const e1 = e0 + tt
  const k = clamp(Ro / 0.9, 0.5, 1.6)
  const seg = 72
  const p = new Parts()
  const noz = localNozzles(eq)
  const has = (x: NonNullable<VerticalVessel['internals']>[number]) => eq.internals?.includes(x) ?? false
  const padT = clamp(w * 0.7, 0.012, 0.03)
  const az = (v: THREE.Vector3) => Math.atan2(v.z, v.x)
  const sideNoz = noz.filter((l) => Math.abs(l.dir.y) < 0.5)

  // ------------------------------------------------------------ shell + heads
  p.add('equipmentPaint', lathe(vesselProfile(Ro, bo, e0, e1, 36), seg))
  p.add('vesselInner', lathe(vesselProfile(R, b, e0, e1, 36), seg))
  p.add('vesselInner', lathe(vesselProfile(Ro, bo, e0, e1, 36), seg))
  {
    const nC = Math.max(1, Math.round(tt / 2.4))
    const ys = [e0, e1]
    for (let i = 1; i < nC; i++) ys.push(e0 + (i * tt) / nC)
    for (const y of ys) p.add('equipmentPaint', seamRing(Ro, y, 0.022, 0.003, seg))
    for (let i = 0; i < nC; i++) {
      const y0 = e0 + (i * tt) / nC
      const a = (i % 2 ? 0.6 : -0.9) + Math.PI
      const d = dirOf(a)
      p.add('equipmentPaint', box(0.02, tt / nC, 0.004, basisM(V(0, y0 + tt / nC / 2, 0).addScaledVector(d, Ro + 0.0006), V(-d.z, 0, d.x), UP)))
    }
  }
  const proj = vesselProjector('y', V(0, (e0 + e1) / 2, 0), tt / 2, Ro, bo)
  addNozzlePads(p, noz, [proj], padT)

  // ------------------------------------------------------------ layout azimuths
  const takenSide = sideNoz.map((l) => az(l.dir))
  const aLadder = freeAzimuth(takenSide, Math.PI)
  const aManway = freeAzimuth([...takenSide, aLadder, aLadder + 0.3, aLadder - 0.3], aLadder + Math.PI / 2)
  const aOpening = freeAzimuth([aLadder, aManway, ...takenSide], aLadder + Math.PI)

  // ------------------------------------------------------------ support
  if (eq.support === 'skirt') {
    const ts = Math.max(0.012, w * 0.75)
    const yBR = 0.03
    const D = clamp(0.5 * k, 0.4, 0.6)
    const yc = clamp(yBR + 0.15 + D / 2, D / 2 + 0.1, Math.max(D / 2 + 0.1, e0 - 0.12 - D / 2))
    const hasOpening = e0 > D + 0.25
    if (hasOpening) {
      const dlt = (D / 2) / Ro
      p.add('equipmentPaint', ring(Ro - ts, Ro, yBR, yc - D / 2, seg))
      p.add('equipmentPaint', ring(Ro - ts, Ro, yc + D / 2, e0, seg))
      p.add('equipmentPaint', ring(Ro - ts, Ro, yc - D / 2, yc + D / 2, seg, phiOf(aOpening) + dlt, Math.PI * 2 - 2 * dlt))
      const dO = dirOf(aOpening)
      const P = V(0, yc, 0).addScaledVector(dO, Ro)
      p.add('equipmentPaint', ring(D / 2 - 0.012, D / 2, -ts - 0.03, 0.11, 40), frame(P, dO))
      p.add('equipmentPaint', conformPad(P, dO, D / 2, (D / 2) * 1.5, 0.012, vesselProjector('y', V(0, e0 / 2, 0), e0 / 2, Ro, 0), 40))
    } else p.add('equipmentPaint', ring(Ro - ts, Ro, yBR, e0, seg))
    // vents near the skirt top
    if (e0 > 0.6) {
      for (let i = 0; i < 4; i++) {
        const d = dirOf(aOpening + Math.PI / 4 + (i * Math.PI) / 2)
        p.add('equipmentPaint', ring(0.03, 0.037, -ts - 0.01, 0.05, 16), frame(V(0, e0 - 0.18, 0).addScaledVector(d, Ro), d))
      }
    }
    // base ring + anchor chairs
    p.add('equipmentPaint', ring(Ro - ts - 0.08, Ro + 0.11, 0, yBR, seg))
    const nB = Ro > 0.6 ? 8 : 4
    const hc = Math.min(0.26, Math.max(0.12, e0 * 0.4))
    for (let i = 0; i < nB; i++) {
      const a = aOpening + ((i + 0.5) / nB) * Math.PI * 2
      const d = dirOf(a)
      const lat = V(-d.z, 0, d.x)
      for (const s of [-1, 1]) {
        p.add('equipmentPaint', box(0.1, hc, 0.016, basisM(V(0, yBR + hc / 2, 0).addScaledVector(d, Ro + 0.05).addScaledVector(lat, s * 0.065), d, UP)))
      }
      p.add('equipmentPaint', box(0.11, 0.022, 0.16, basisM(V(0, yBR + hc + 0.011, 0).addScaledVector(d, Ro + 0.055), d, UP)))
      const bp = V(0, 0, 0).addScaledVector(d, Ro + 0.06)
      p.add('nut', rod(V(bp.x, 0, bp.z), V(bp.x, yBR + hc + 0.022 + 0.07, bp.z), 0.012, 8))
      p.add('nut', hexNut(V(bp.x, yBR + hc + 0.022 + 0.02, bp.z), UP, 0.036, 0.024))
    }
  } else {
    // four pipe legs with pads and base plates
    const lr = clamp(0.06 * k, 0.05, 0.11)
    for (let i = 0; i < 4; i++) {
      const a = aLadder + Math.PI / 4 + (i * Math.PI) / 2
      const d = dirOf(a)
      const c = V(0, 0, 0).addScaledVector(d, Ro + lr - 0.004)
      const yTop = e0 + 0.35
      p.add('equipmentPaint', rod(V(c.x, 0.02, c.z), V(c.x, yTop, c.z), lr, 20))
      p.add('equipmentPaint', box(0.3 * k, 0.022, 0.3 * k, T(c.x, 0.011, c.z)))
      p.add('equipmentPaint', conformPad(V(0, e0 + 0.1, 0).addScaledVector(d, Ro), d, 0, lr * 2.2, 0.012, proj, 24))
      const lat = V(-d.z, 0, d.x)
      for (const s of [-1, 1]) {
        const bp = c.clone().addScaledVector(lat, s * 0.1 * k)
        p.add('nut', rod(V(bp.x, 0, bp.z), V(bp.x, 0.09, bp.z), 0.01, 8))
        p.add('nut', hexNut(V(bp.x, 0.036, bp.z), UP, 0.03, 0.02))
      }
    }
  }

  // ------------------------------------------------------------ manway (side)
  {
    const yM = e0 + clamp(0.35 * tt, 0.8, tt - 1.0)
    const d = dirOf(aManway)
    const base = V(0, yM, 0).addScaledVector(d, Ro)
    const mw = addManway(p, base, d, { neck: 0.24 })
    p.add('equipmentPaint', conformPad(base, d, mw.od / 2, mw.od / 2 + 0.13, padT, proj, 48))
  }

  // ------------------------------------------------------------ lifting lugs on the top head
  {
    const r = 0.55 * Ro
    const ys = e1 + bo * Math.sqrt(1 - (r * r) / (Ro * Ro))
    for (const s of [-1, 1]) {
      const a = aLadder + Math.PI / 2 + (s > 0 ? 0 : Math.PI)
      const d = dirOf(a)
      const pt = d.clone().multiplyScalar(r)
      if (noz.some((l) => Math.hypot(l.base.x - pt.x, l.base.z - pt.z) < pipeOD(l.n.nps) / 2 + 0.2)) continue
      const g = liftingLug(0, 0, k * 0.8)
      g.applyMatrix4(basisM(V(pt.x, ys - 0.02, pt.z), d, UP))
      p.add('equipmentPaint', g)
    }
  }

  // ------------------------------------------------------------ nameplate (on the shell, operator side)
  {
    const d = dirOf(aLadder + 0.45)
    const y = e0 + 0.55
    const lat = V(-d.z, 0, d.x)
    for (const s of [-1, 1]) p.add('equipmentPaint', box(0.03, 0.01, 0.07, basisM(V(0, y, 0).addScaledVector(d, Ro + 0.035).addScaledVector(lat, s * 0.13), lat, UP)))
    p.add('equipmentPaint', box(0.4, 0.27, 0.006, basisM(V(0, y, 0).addScaledVector(d, Ro + 0.072), lat, UP)))
    p.add('nameplate', box(0.34, 0.21, 0.003, basisM(V(0, y, 0).addScaledVector(d, Ro + 0.076), lat, UP)))
  }

  // ------------------------------------------------------------ platform, handrail, caged ladder, davit
  if (eq.platform) {
    const yP = e1 - 0.15
    const rIn = Ro + 0.06
    const rOut = Ro + 0.95
    const span = (100 * Math.PI) / 180
    p.add('grating', ring(rIn, rOut, yP - 0.03, yP, 64, phiOf(aLadder + span), 2 * span))
    p.add('structSteel', ring(rOut - 0.006, rOut, yP, yP + 0.1, 64, phiOf(aLadder + span), 2 * span))
    const rRail = rOut - 0.03
    const n = Math.max(3, Math.ceil((2 * span * rRail) / 1.4))
    const angles = Array.from({ length: n + 1 }, (_, i) => aLadder - span + (2 * span * i) / n)
    const gap = 0.32 / rRail
    for (const a of angles) {
      const d = dirOf(a)
      // bracket beam + knee brace + shell clip
      p.add('structSteel', box(rOut - Ro, 0.1, 0.05, basisM(V(0, yP - 0.08, 0).addScaledVector(d, (Ro + rOut) / 2), d, UP)))
      p.add('structSteel', rod(V(0, yP - 0.85, 0).addScaledVector(d, Ro + 0.02), V(0, yP - 0.12, 0).addScaledVector(d, rOut - 0.12), 0.022, 8))
      p.add('structSteel', box(0.012, 0.95, 0.14, basisM(V(0, yP - 0.5, 0).addScaledVector(d, Ro + 0.006), d, UP)))
      if (angDist(a, aLadder) < gap * 0.9) continue
      const q = d.clone().multiplyScalar(rRail)
      p.add('safetyYellow', rod(V(q.x, yP, q.z), V(q.x, yP + 1.1, q.z), 0.024, 10))
    }
    for (const y of [yP + 1.1, yP + 0.55]) {
      const tr = y > yP + 1 ? 0.024 : 0.017
      p.add('safetyYellow', arcTube(V(0, y, 0), V(1, 0, 0), V(0, 0, 1), rRail, aLadder - span, aLadder - gap, tr))
      p.add('safetyYellow', arcTube(V(0, y, 0), V(1, 0, 0), V(0, 0, 1), rRail, aLadder + gap, aLadder + span, tr))
      for (const a of [aLadder - span, aLadder + span]) {
        const d = dirOf(a)
        p.add('safetyYellow', rod(V(0, y, 0).addScaledVector(d, Ro + 0.12), V(0, y, 0).addScaledVector(d, rRail), tr, 8))
      }
    }
    for (const a of [aLadder - span, aLadder + span]) {
      const q = dirOf(a).multiplyScalar(Ro + 0.12)
      p.add('safetyYellow', rod(V(q.x, yP, q.z), V(q.x, yP + 1.1, q.z), 0.024, 10))
    }
    // self-closing gate across the ladder opening
    {
      const d0 = dirOf(aLadder - gap).multiplyScalar(rRail - 0.05)
      const d1 = dirOf(aLadder + gap).multiplyScalar(rRail - 0.05)
      for (const y of [yP + 0.5, yP + 1.0]) p.add('safetyYellow', rod(V(d0.x, y, d0.z), V(d1.x, y, d1.z), 0.016, 8))
      p.add('safetyYellow', rod(V(d0.x, yP + 0.45, d0.z), V(d0.x, yP + 1.05, d0.z), 0.018, 8))
    }
    // caged ladder
    const dL = dirOf(aLadder)
    const rL = rOut + 0.05
    addCagedLadder(p, 'safetyYellow', V(0, 0, 0).addScaledVector(dL, rL), dL, yP, rL - Ro)
    // maintenance davit over the top head
    {
      const a = aLadder + span * 0.7
      const d = dirOf(a)
      const m = d.clone().multiplyScalar(Ro + 0.28)
      const yTop = e1 + bo + 1.3
      p.add('safetyYellow', ring(0.06, 0.075, yP, yP + 0.35, 20), T(m.x, 0, m.z))
      p.add('safetyYellow', rod(V(m.x, yP, m.z), V(m.x, yTop, m.z), 0.05, 16))
      const tip = V(m.x, yTop, m.z).addScaledVector(d, -(Ro + 0.28) * 0.95)
      p.add('safetyYellow', rod(V(m.x, yTop - 0.03, m.z), tip, 0.045, 12))
      p.add('safetyYellow', rod(V(m.x, yTop - 0.55, m.z), V(m.x, yTop - 0.04, m.z).addScaledVector(d, -(Ro + 0.28) * 0.4), 0.025, 8))
      p.add('nut', rod(tip.clone().addScaledVector(UP, -0.04), tip.clone().addScaledVector(UP, -0.45), 0.006, 6))
      p.add('nut', arcTube(tip.clone().addScaledVector(UP, -0.5), d, UP, 0.035, -Math.PI * 0.2, Math.PI * 1.3, 0.008, 12))
    }
  }

  // ------------------------------------------------------------ internals
  const cyclone = addInternals(p, eq, noz, { R, w, b, e0, e1, k, has })
  return { parts: p, cyclone }
}

function addInternals(
  p: Parts,
  eq: VerticalVessel,
  noz: LocalNozzle[],
  c: { R: number; w: number; b: number; e0: number; e1: number; k: number; has: (x: NonNullable<VerticalVessel['internals']>[number]) => boolean },
): Built['cyclone'] {
  const { R, w, b, e0, e1, k, has } = c
  const inlet = noz.find((l) => /inlet/i.test(l.n.name))
  const yL = e0 + clamp(eq.levels?.liquid ?? 0, 0.002, 0.9) * (e1 - e0)

  // liquid
  if (eq.levels?.liquid) {
    const rl = R - 0.004
    p.add(liquidMaterial('liquidOil'), lathe([...headProfile(rl, b - 0.004, e0, -1, 24), [rl, yL], [0, yL]], 64, 0, Math.PI * 2, 30))
  }

  // inlet vane distributor (Schoepentoeter style)
  if (has('inletDiverter') && inlet && Math.abs(inlet.dir.y) < 0.5) {
    const od = pipeOD(inlet.n.nps)
    const f = V(-inlet.dir.x, 0, -inlet.dir.z).normalize()
    const s = V(-f.z, 0, f.x)
    const P0 = inlet.base.clone().addScaledVector(f, w - 0.01)
    const Ld = 1.45 * R
    const h = 1.3 * od
    const wE = 1.15 * od
    const wN = 0.2 * od
    const sh = new THREE.Shape()
    sh.moveTo(0, -wE / 2)
    sh.lineTo(Ld, -wN / 2)
    sh.lineTo(Ld, wN / 2)
    sh.lineTo(0, wE / 2)
    sh.lineTo(0, -wE / 2)
    const zf = new THREE.Vector3().crossVectors(f, s)
    for (const sy of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false })
      g.translate(0, 0, -0.004)
      p.add('internalsSteel', g, new THREE.Matrix4().makeBasis(f, s, zf).setPosition(P0.clone().addScaledVector(UP, (sy * h) / 2)))
    }
    p.add('internalsSteel', box(0.008, h, wN + 0.01, basisM(P0.clone().addScaledVector(f, Ld), f, UP)))
    const vl = 0.12 + 0.25 * od
    const va = (40 * Math.PI) / 180
    for (let j = 0; j < 6; j++) {
      const u = Ld * (0.1 + 0.15 * j)
      const half = (wE + (wN - wE) * (u / Ld)) / 2
      for (const sd of [-1, 1]) {
        const vd = f.clone().multiplyScalar(Math.cos(va)).addScaledVector(s, sd * Math.sin(va))
        const ctr = P0.clone()
          .addScaledVector(f, u)
          .addScaledVector(s, sd * (half + (vl / 2) * Math.sin(va) - 0.01))
        p.add('internalsSteel', box(vl, h, 0.005, basisM(ctr, vd, UP)))
      }
    }
    // inlet stub through the wall
    p.add('internalsSteel', ring(od / 2 - 0.0127, od / 2, -0.02, 0.06, 32), frame(inlet.base.clone().addScaledVector(f, w), f))
  }

  // vortex breakers on bottom outlets
  if (has('vortexBreaker')) {
    for (const l of noz) {
      if (l.dir.y > -0.7 || l.n.nps < 2) continue
      addVortexBreaker(p, l.base.clone().addScaledVector(UP, w), UP, pipeOD(l.n.nps))
    }
  }

  // mesh pad / cyclone deck stack below the outlet
  const both = has('meshPad') && has('cyclones')
  const yMesh = both ? e1 - 0.95 * clamp(k, 0.8, 1.2) : e1 - 0.45
  const yDeck = e1 - 0.32
  if (has('meshPad')) {
    const th = 0.15
    p.add('meshPad', ring(0, R - 0.006, yMesh, yMesh + th, 64))
    p.add('internalsSteel', ring(R - 0.05, R - 0.0015, yMesh - 0.012, yMesh, 64))
    for (const z of [-0.4, 0.4]) {
      const zz = z * R
      const l = 2 * Math.sqrt(R * R - zz * zz) - 0.01
      p.add('internalsSteel', box(l, 0.07, 0.01, T(0, yMesh - 0.035 - 0.012, zz)))
    }
    for (const t of [-0.5, 0, 0.5]) {
      const tt = t * R
      const l = 2 * Math.sqrt(R * R - tt * tt) - 0.02
      p.add('internalsSteel', box(l, 0.012, 0.006, T(0, yMesh + th + 0.006, tt)))
      p.add('internalsSteel', box(0.006, 0.012, l, T(tt, yMesh + th + 0.006, 0)))
    }
  }
  if (has('vanePack')) {
    const yv = has('meshPad') ? yMesh - 0.5 : e1 - 0.5
    const hw = 0.62 * R
    const hh = 0.3
    for (const s of [-1, 1]) {
      p.add('internalsSteel', box(2 * hw, hh, 0.008, T(0, yv, s * hw)))
      p.add('internalsSteel', box(0.008, hh, 2 * hw, T(s * hw, yv, 0)))
    }
    for (let x = -hw + 0.02; x < hw; x += 0.035) {
      for (let j = 0; j < 4; j++) {
        const zc = -hw + (2 * hw * (j + 0.5)) / 4
        const m = new THREE.Matrix4().makeRotationY(j % 2 ? 0.35 : -0.35).setPosition(x, yv, zc)
        p.add('internalsSteel', box(0.0015, hh, (2 * hw) / 4 / Math.cos(0.35), m))
      }
    }
  }
  let cyclone: Built['cyclone'] = null
  if (has('cyclones')) {
    p.add('internalsSteel', ring(0, R - 0.0015, yDeck - 0.014, yDeck, 72))
    p.add('internalsSteel', ring(R - 0.05, R - 0.0015, yDeck - 0.03, yDeck - 0.014, 72))
    // downcomer (seal pipe) to below the liquid level, opposite the inlet
    const aD = inlet ? Math.atan2(-inlet.dir.z, -inlet.dir.x) : 0
    const dd = dirOf(aD).multiplyScalar(R - 0.08)
    const rD = 0.045
    p.add('internalsSteel', ring(rD - 0.006, rD, yL - 0.15, yDeck + 0.02, 24), T(dd.x, 0, dd.z))
    // cyclone tube geometry (axis Y, deck at y = 0)
    const geos: THREE.BufferGeometry[] = []
    const rt = 0.048
    geos.push(ring(rt - 0.004, rt, -0.34, 0.13, 18))
    geos.push(ring(0.028, rt + 0.006, 0.13, 0.15, 18))
    geos.push(rod(V(0, -0.33, 0), V(0, -0.18, 0), 0.012, 8))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(0.6))
      m.setPosition(Math.cos(a) * rt * 0.5, -0.25, -Math.sin(a) * rt * 0.5)
      geos.push(box(0.002, 0.07, rt * 0.9, m))
    }
    const geometry = mergeGeometries(geos.map(prep))!
    const matrices: THREE.Matrix4[] = []
    const pitch = 0.15
    const lim = R - 0.085
    for (let ix = -Math.ceil(lim / pitch); ix <= Math.ceil(lim / pitch); ix++) {
      for (let iz = -Math.ceil(lim / pitch); iz <= Math.ceil(lim / pitch); iz++) {
        const x = ix * pitch + (iz % 2 ? pitch / 2 : 0)
        const z = iz * pitch * 0.866
        if (Math.hypot(x, z) > lim) continue
        if (Math.hypot(x - dd.x, z - dd.z) < rD + rt + 0.03) continue
        matrices.push(new THREE.Matrix4().makeTranslation(x, yDeck, z))
      }
    }
    cyclone = { geometry, matrices }
  }
  return cyclone
}

export function VerticalVesselModel({ eq }: { eq: VerticalVessel }) {
  const built = useMemo(() => {
    const b = buildVerticalVessel(eq)
    return { entries: b.parts.build(), cyclone: b.cyclone }
  }, [eq])
  return (
    <group>
      <PartMeshes entries={built.entries} />
      {built.cyclone && <Instances geometry={built.cyclone.geometry} material={materials().internalsSteel} matrices={built.cyclone.matrices} />}
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}
