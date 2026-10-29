// Pipe support on a steel T-post: resting shoe, guide, line stop / anchor, U-bolt, dummy leg or trunnion, with base plate, anchors and earthing boss. Typical MSS SP-58 / vendor-standard proportions.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member } from '../lib/parts'
import { NPS_SIZES, SECTIONS, elbow90, pipeOD, pipeWall } from '../lib/standards'
import { cladding, insulationThickness } from './_piping'

export type SupportType = 'shoe' | 'guide' | 'anchor' | 'u-bolt' | 'dummy-leg' | 'trunnion'

export interface PipeSupportProps {
  type?: SupportType
  /** supported pipe size, inches */
  nps?: number
  /** bottom of pipe elevation above the deck, m */
  height?: number
  /** insulated line: 150 mm shoe instead of 100 mm */
  insulated?: boolean
  /** draw a length of the supported pipe for context (the plant draws the real line) */
  pipe?: boolean
}

export const defaults = { type: 'shoe' as SupportType, nps: 6, height: 1, insulated: false, pipe: false }

export function PipeSupport({ type = defaults.type, nps = defaults.nps, height = defaults.height, insulated = defaults.insulated, pipe = defaults.pipe, ...group }: PipeSupportProps & GroupProps) {
  const data = useKit((k) => build(k, type, nps, Math.max(0.3, height), insulated, pipe), [type, nps, height, insulated, pipe])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PipeSupport

const smaller = (nps: number) => [...NPS_SIZES].reverse().find((s) => s < nps) ?? nps

function build(k: Kit, type: SupportType, nps: number, H: number, insulated: boolean, showPipe: boolean) {
  const od = pipeOD(nps)
  const ro = od / 2
  const sec = nps <= 3 ? 'HEB 100' : nps <= 8 ? 'HEB 140' : nps <= 16 ? 'HEB 180' : 'HEB 240'
  const S = SECTIONS[sec]
  const yc = H + ro
  const hasShoe = type === 'shoe' || type === 'guide' || type === 'anchor'
  // typical shoe: 100 mm bottom-of-pipe to bottom-of-shoe (150 mm insulated), 300 / 450 / 600 mm long
  const hs = insulated ? 0.15 : 0.1
  const Ls = nps <= 10 ? 0.3 : nps <= 18 ? 0.45 : 0.6
  const bs = nps <= 10 ? 0.1 : nps <= 18 ? 0.2 : 0.25
  const pad = 0.006
  let beamTop = hasShoe ? H - hs : H - pad
  const leg = smaller(nps)
  const rl = pipeOD(leg) / 2
  if (type === 'dummy-leg') beamTop = H - pad
  if (type === 'trunnion') beamTop = H - 0.25
  const tee = type !== 'trunnion'
  const Lb = Math.max(0.4, od + (insulated ? 2 * insulationThickness(nps) : 0) + 0.3)

  // post with base plate, stiffeners, anchors and an earthing boss
  const tp = 0.02
  const bp = Math.max(0.3, S.b + 0.14)
  k.box('structSteel', [bp, tp, bp], [0, tp / 2, 0])
  const yPostTop = tee ? beamTop - S.d - 0.015 : beamTop - 0.02
  member(k, [0, tp, 0], [0, yPostTop, 0], sec, 'structSteel', [1, 0, 0])
  for (const s of [-1, 1]) k.box('structSteel', [0.012, 0.12, (bp - S.tw) / 2 - 0.01], [0, tp + 0.06, s * ((bp + S.tw) / 4)])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * (bp / 2 - 0.045), tp, sz * (bp / 2 - 0.045)]
      k.cyl('galvanised', 0.035, 0.004, [p[0], tp + 0.002, p[2]], 'y', 16)
      k.hex('nut', 0.03, 0.016, [p[0], tp + 0.012, p[2]])
      k.cyl('galvanised', 0.008, 0.04, [p[0], tp + 0.02, p[2]], 'y', 8)
    }
  k.box('stainless', [0.05, 0.03, 0.006], [S.b / 2 + 0.003 + 0.002, 0.25, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
  k.hex('nut', 0.02, 0.01, [S.b / 2 + 0.012, 0.25, 0], 'x')
  if (tee) {
    k.box('structSteel', [S.b + 0.04, 0.015, S.b + 0.04], [0, yPostTop + 0.0075, 0])
    member(k, [0, beamTop - S.d / 2, -Lb / 2], [0, beamTop - S.d / 2, Lb / 2], sec, 'structSteel', [0, 1, 0])
    for (const s of [-1, 1]) k.box('structSteel', [S.b, S.d - 2 * S.tf, 0.012], [0, beamTop - S.d / 2, s * (Lb / 2 - 0.006)])
  } else k.box('structSteel', [S.b + 0.06, 0.02, S.b + 0.06], [0, yPostTop + 0.01, 0])

  if (hasShoe) shoe(k, ro, H, Ls, bs, beamTop, type)
  if (type === 'u-bolt') {
    k.box('stainless', [0.12, pad, Math.min(od, 0.2)], [0, beamTop + pad / 2, 0])
    const d = nps <= 4 ? 0.012 : nps <= 10 ? 0.016 : 0.02
    const R = ro + d / 2 + 0.002
    const yLo = beamTop - S.tf - 0.035
    const arc: V3[] = Array.from({ length: 17 }, (_, i) => [0, yc + R * Math.sin((i / 16) * Math.PI), R * Math.cos((i / 16) * Math.PI)] as V3)
    k.tube('galvanised', [[0, yLo, R], ...arc, [0, yLo, -R]], d / 2, 8, 0.002)
    for (const s of [-1, 1]) for (const y of [beamTop + pad + d * 0.45, beamTop - S.tf - d * 0.45]) k.hex('nut', d * 1.8, d * 0.9, [0, y, s * R])
  }
  if (type === 'dummy-leg') {
    // leg welded to the elbow back, continuing the horizontal run onto the support; capped end
    const xv = -(Math.max(ro, 0.1) + 0.2)
    const R = elbow90(nps)
    const yl = H + rl
    const x0 = xv - R * 0.55
    k.pipe('pipePaint', [x0, yl, 0], [0.25, yl, 0], rl * 2, pipeWall(leg, 'STD'))
    k.cyl('pipePaint', rl, 0.01, [0.255, yl, 0], 'x', 32)
    k.box('stainless', [0.25, pad, rl * 1.6], [0, beamTop + pad / 2, 0])
    if (showPipe) {
      k.pipe('pipePaint', [-1.2, yc, 0], [xv - R, yc, 0], od, pipeWall(nps, 'STD'))
      k.bend('pipePaint', [xv - R, yc, 0], [1, 0, 0], [0, -1, 0], R, od)
      k.pipe('pipePaint', [xv, yc - R, 0], [xv, Math.max(0.2, yc - R - 0.8), 0], od, pipeWall(nps, 'STD'))
    }
  }
  if (type === 'trunnion') {
    // trunnion stub welded under the base elbow, resting on a loose bearing plate on the post cap
    const R = elbow90(nps)
    const yTop = yc + R * 0.75
    const yBot = beamTop + 0.032
    k.pipe('pipePaint', [0, yBot, 0], [0, yTop, 0], rl * 2, pipeWall(leg, 'STD'))
    k.box('structSteel', [rl * 2 + 0.06, 0.016, rl * 2 + 0.06], [0, yBot - 0.008, 0])
    k.box('stainless', [rl * 2 + 0.03, 0.006, rl * 2 + 0.03], [0, yBot - 0.019, 0])
    for (const s of [-1, 1]) k.box('structSteel', [0.012, 0.06, rl * 2 + 0.1], [s * (rl + 0.05), beamTop + 0.03, 0])
    if (showPipe) {
      k.pipe('pipePaint', [-1.2, yc, 0], [-R, yc, 0], od, pipeWall(nps, 'STD'))
      k.bend('pipePaint', [-R, yc, 0], [1, 0, 0], [0, 1, 0], R, od)
      k.pipe('pipePaint', [0, yc + R, 0], [0, yc + R + 0.8, 0], od, pipeWall(nps, 'STD'))
    }
  }
  if (showPipe && type !== 'dummy-leg' && type !== 'trunnion') {
    k.pipe('pipePaint', [-0.7, yc, 0], [0.7, yc, 0], od, pipeWall(nps, 'STD'))
    if (insulated) {
      const g = hasShoe ? Ls / 2 + 0.02 : 0.08
      cladding(k, [-0.7, yc, 0], [1, 0, 0], 0.7 - g, nps)
      cladding(k, [g, yc, 0], [1, 0, 0], 0.7 - g, nps)
    }
  }
}

/** Welded T-shoe: curved cradle plate, web, base plate and end stiffeners; guides, stops or anchor welds by type. */
function shoe(k: Kit, ro: number, H: number, Ls: number, bs: number, beamTop: number, type: SupportType) {
  const t = 0.01
  const yc = H + ro
  k.lathe('structSteel', [[ro + t, -Ls / 2], [ro + t, Ls / 2], [ro, Ls / 2], [ro, -Ls / 2], [ro + t, -Ls / 2]], [0, yc, 0], 'x', 32, Math.PI / 2 - Math.PI / 3, (2 * Math.PI) / 3)
  const yb = beamTop + 0.016
  const yTopWeb = yc - Math.sqrt(Math.max(ro * ro - 0.006 * 0.006, 0)) - t * 0.5
  k.box('structSteel', [Ls, yTopWeb - yb, 0.012], [0, (yTopWeb + yb) / 2, 0])
  k.box('structSteel', [Ls, 0.012, bs], [0, beamTop + 0.006 + 0.004, 0])
  for (const s of [-1, 1]) k.box('structSteel', [0.01, yTopWeb - yb - 0.01, bs * 0.9], [s * (Ls / 2 - 0.005), (yTopWeb + yb) / 2, 0])
  // PTFE slide pad under resting and guided shoes
  if (type !== 'anchor') k.box('plasticGrey', [Ls + 0.02, 0.004, bs + 0.02], [0, beamTop + 0.002, 0])
  else k.box('structSteel', [Ls + 0.01, 0.004, bs + 0.01], [0, beamTop + 0.002, 0])
  const gap = 0.003
  if (type === 'guide' || type === 'anchor') {
    // L75x75x8 guide angles bolted to the beam flange, 3 mm clear of the shoe base
    for (const s of [-1, 1]) {
      const z = s * (bs / 2 + gap + 0.04)
      k.box('galvanised', [Ls * 0.6, 0.008, 0.075], [0, beamTop + 0.004, z])
      k.box('galvanised', [Ls * 0.6, 0.06, 0.008], [0, beamTop + 0.038, s * (bs / 2 + gap + 0.004)])
      for (const dx of [-Ls * 0.18, Ls * 0.18]) k.hex('nut', 0.024, 0.012, [dx, beamTop + 0.014, z + s * 0.015])
    }
  }
  if (type === 'anchor') {
    // line stops at both ends of the shoe, welded to the beam
    for (const s of [-1, 1]) {
      const x = s * (Ls / 2 + gap + 0.006)
      k.box('structSteel', [0.012, 0.06, bs + 0.02], [x, beamTop + 0.03, 0])
      k.box('structSteel', [0.012, 0.04, 0.012], [x + s * 0.012, beamTop + 0.02, 0])
    }
  }
}
