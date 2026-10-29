// Fiscal metering skid: inlet / outlet headers, parallel meter runs (ultrasonic or turbine) with flow conditioners and DBB valves, prover header. API MPMS 5 / 4, ISO 17089, AGA 9.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { blindFlange, pipe, pipeRun, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SECTIONS, flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { addv, basketStrainer, blFlange, branchMouth, cableTray, padeyeShackles, reliefBody, smallValve, spoolJoint, earthBoss, gaugeTap, localPanel, pipeSupport, tempElement, transmitter, valve, valveSpan } from './_skid'

export interface MeteringSkidProps {
  /** parallel meter runs (duty + standby) */
  runs?: number
  meterType?: 'ultrasonic' | 'turbine'
  headerNps?: number
  runNps?: number
  rating?: Rating
  tag?: string
}

export const defaults = {
  runs: 3,
  meterType: 'ultrasonic' as 'ultrasonic' | 'turbine',
  headerNps: 10,
  runNps: 6,
  rating: 600 as Rating,
  tag: 'X-R150',
}

type P = typeof defaults

const SKID = 'HEB 220'
const BODY: MatKey = 'equipmentPaint'

function layout(p: P) {
  const N = Math.max(1, Math.min(6, Math.round(p.runs)))
  const D = pipeOD(p.runNps)
  const Dh = pipeOD(p.headerNps)
  const fr = flangeDims(p.runNps, p.rating)
  const Sb = valveSpan('ball', p.runNps, p.rating)
  const Lm = p.meterType === 'ultrasonic' ? Math.max(0.45, 3 * D) : Math.max(0.3, 2 * D)
  const jf = fr.hubLength + fr.raisedFaceHeight + 0.00225 // joint centre to weld end
  // run stations measured from the inlet header centreline (x = 0)
  const s: Record<string, number> = {}
  let x = Dh / 2 + 0.35
  s.iv = x + Sb / 2
  x += Sb
  const Ls = Math.max(0.45, 3.2 * D)
  s.stc = x + 0.12 + jf + Ls / 2
  x = s.stc + Ls / 2 + jf + 0.12
  s.fc = x + jf
  x = s.fc + jf
  s.m0 = x + 10 * D
  s.m1 = s.m0 + Lm
  s.tw = s.m1 + 3 * D
  s.tee = s.m1 + 5 * D + 0.1
  s.ov = s.tee + 0.45 + Sb / 2
  s.out = s.ov + Sb / 2 + 0.35 + Dh / 2
  const edge = 0.95
  const L = s.out + 2 * edge
  const xIn = -L / 2 + edge
  const st = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, xIn + v])) as Record<string, number>
  const sp = Math.max(1.05, fr.od + 0.7)
  // lanes from the back (-Z): inlet / outlet / prover lane, runs, prover return, header ends; then centred on the footprint
  const z0 = 0.05
  const zRun = Array.from({ length: N }, (_, i) => (i - (N - 1) / 2) * sp + z0)
  const zLane = zRun[0] - 0.75
  const zCap = zRun[N - 1] + 0.65
  const zRet = zRun[N - 1] + 0.4
  const W = zCap - zLane + 1.3
  const y0 = SECTIONS[SKID].d + 0.008
  const yp = y0 + 0.32
  const yr = yp + Sb + 0.35
  return { N, D, Dh, Lm, Ls, Sb, jf, L, W, xIn, xOut: st.out, st, zRun, zLane, zCap, zRet, y0, yp, yr }
}

export function ports(props: MeteringSkidProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const g = layout(p)
  return [
    port('inlet', 'Inlet', [-g.L / 2 - 0.05, g.yr, g.zLane], [-1, 0, 0], p.headerNps, p.rating),
    port('outlet', 'Outlet', [g.L / 2 + 0.05, g.yr, g.zLane], [1, 0, 0], p.headerNps, p.rating),
    port('prover-out', 'To prover', [g.L / 2 + 0.05, g.yp, g.zLane], [1, 0, 0], p.runNps, p.rating),
    port('prover-return', 'From prover', [g.L / 2 + 0.05, g.yp, g.zRet], [1, 0, 0], p.runNps, p.rating),
  ]
}

export function MeteringSkid(props: MeteringSkidProps & GroupProps) {
  const { runs, meterType, headerNps, runNps, rating, tag, ...group } = { ...defaults, ...props }
  const p = { runs, meterType, headerNps, runNps, rating, tag } as P
  const data = useKit((k) => build(k, p), [runs, meterType, headerNps, runNps, rating, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default MeteringSkid

function build(k: Kit, p: P) {
  const g = layout(p)
  const { L, W, y0, yr, yp, D, Dh, st, zRun, zLane, zCap, zRet, xIn, xOut } = g
  const R = p.rating
  skid(k, L, W, SKID)
  padeyeShackles(k, L, W, y0)
  tagPlate(k, p.tag, [-L / 2 + 1.2, SECTIONS[SKID].d * 0.5, W / 2 + 0.002], 'z', 0.35)
  earthBoss(k, [L / 2 - 0.6, SECTIONS[SKID].d * 0.5, W / 2], [0, 0, 1])
  const fh = flangeDims(p.headerNps, R)
  const fr = flangeDims(p.runNps, R)
  const wh = fh.hubLength + fh.raisedFaceHeight
  const wr = fr.hubLength + fr.raisedFaceHeight

  // inlet: BL flange → elbow → header along +Z, blind-flanged end with drain
  const inW = blFlange(k, [-L / 2 - 0.05, yr, zLane], [-1, 0, 0], p.headerNps, R)
  pipeRun(k, [inW, [xIn, yr, zLane], [xIn, yr, zCap - wh]], p.headerNps)
  blindFlange(k, p.headerNps, R, flangeEnd(k, [xIn, yr, zCap - wh], [0, 0, 1], p.headerNps, R), [0, 0, 1])
  transmitter(k, [xIn - Dh / 2, yr + 0.05, zLane + 0.6], [-1, 0, 0], 0.12)
  tempElement(k, [xIn, yr, zLane + 0.95], [-1, 0, 0], Dh)
  gaugeTap(k, [xIn, yr + Dh / 2, zLane + 0.35], [0, 1, 0], 160, 0.1)
  // outlet header → elbow → BL flange
  const outW = blFlange(k, [L / 2 + 0.05, yr, zLane], [1, 0, 0], p.headerNps, R)
  pipeRun(k, [outW, [xOut, yr, zLane], [xOut, yr, zCap - wh]], p.headerNps)
  blindFlange(k, p.headerNps, R, flangeEnd(k, [xOut, yr, zCap - wh], [0, 0, 1], p.headerNps, R), [0, 0, 1])
  // sampler probe and densitometer loop on the outlet header
  k.cyl('stainless', 0.03, 0.25, [xOut, yr + Dh / 2 + 0.1, zLane + 0.55], 'y', 14)
  k.rbox('actuatorBlue', [0.2, 0.18, 0.16], 0.02, [xOut, yr + Dh / 2 + 0.3, zLane + 0.55])
  k.tube('tubing', [[xOut - Dh / 2, yr, zLane + 0.3], [xOut - Dh / 2 - 0.25, yr, zLane + 0.3], [xOut - Dh / 2 - 0.25, yr - 0.45, zLane + 0.3], [xOut - Dh / 2 - 0.25, yr - 0.45, zLane + 0.2]], 0.017, 10, 0.05)
  k.cyl('stainless', 0.06, 0.32, [xOut - Dh / 2 - 0.25, yr - 0.3, zLane + 0.3], 'y', 18)
  transmitter(k, [xOut + Dh / 2, yr + 0.05, zLane + 0.6], [1, 0, 0], 0.12)

  // prover header (under the runs): blind end at +Z, elbow at the lane, out to the BL
  const xT = st.tee
  const pW = blFlange(k, [L / 2 + 0.05, yp, zLane], [1, 0, 0], p.runNps, R)
  pipeRun(k, [pW, [xT, yp, zLane], [xT, yp, zCap - 0.1 - wr]], p.runNps)
  blindFlange(k, p.runNps, R, flangeEnd(k, [xT, yp, zCap - 0.1 - wr], [0, 0, 1], p.runNps, R), [0, 0, 1])
  // prover return into the outlet header from below (check + block valve)
  const rW = blFlange(k, [L / 2 + 0.05, yp, zRet], [1, 0, 0], p.runNps, R)
  const Sc = valveSpan('check', p.runNps, R)
  const xc = (xOut + L / 2) / 2 + 0.05
  pipe(k, rW, [xc + Sc / 2, yp, zRet], p.runNps)
  valve(k, 'check', [xc, yp, zRet], [-1, 0, 0], p.runNps, R)
  pipeRun(k, [[xc - Sc / 2, yp, zRet], [xOut, yp, zRet], [xOut, yr - Dh / 2 + 0.004, zRet]], p.runNps)
  branchMouth(k, [xOut, yr - Dh / 2 + 0.0035, zRet], [0, -1, 0], p.runNps)

  for (const [i, z] of zRun.entries()) {
    // branch off the inlet header, inlet block valve, flow conditioner
    pipe(k, [xIn + Dh / 2 - 0.004, yr, z], [st.iv - g.Sb / 2, yr, z], p.runNps)
    branchMouth(k, [xIn + Dh / 2 - 0.0035, yr, z], [1, 0, 0], p.runNps)
    valve(k, 'ball', [st.iv, yr, z], [1, 0, 0], p.runNps, R)
    pipe(k, [st.iv + g.Sb / 2, yr, z], [st.stc - g.Ls / 2 - g.jf, yr, z], p.runNps)
    basketStrainer(k, [st.stc, yr, z], p.runNps, R, g.Ls)
    pipe(k, [st.stc + g.Ls / 2 + g.jf, yr, z], [st.fc - g.jf, yr, z], p.runNps)
    spoolJoint(k, [st.fc, yr, z], [1, 0, 0], p.runNps, R)
    k.cyl('stainless', fr.raisedFace / 2 + 0.004, 0.012, [st.fc, yr, z], 'x', 28)
    k.box('stainless', [0.012, fr.od / 2 + 0.06, 0.07], [st.fc, yr + fr.od / 2 + 0.01, z])
    k.box(textMaterial('FC', '#d9dde0', '#111', 128, 128), [0.013, 0.05, 0.05], [st.fc, yr + fr.od / 2 + 0.05, z])
    // upstream straight, meter, downstream straight
    pipe(k, [st.fc + g.jf, yr, z], [st.m0 - g.jf, yr, z], p.runNps)
    spoolJoint(k, [st.m0, yr, z], [1, 0, 0], p.runNps, R)
    spoolJoint(k, [st.m1, yr, z], [1, 0, 0], p.runNps, R)
    meter(k, p, [(st.m0 + st.m1) / 2, yr, z], g.Lm - 2 * (wr + 0.00225), D)
    pipe(k, [st.m1 + g.jf, yr, z], [st.ov - g.Sb / 2, yr, z], p.runNps)
    tempElement(k, [st.tw, yr, z], [0, 1, 0], D)
    tempElement(k, [st.tw + 0.3, yr, z], [0, 1, 0], D)
    tempElement(k, [st.tw + 0.6, yr, z], [0, 0, 1], D) // test thermowell
    const xTrv = st.fc + (st.m0 - st.fc) * 0.3
    k.rod('stainless', [xTrv, yr + D / 2 - 0.005, z], [xTrv, yr + D / 2 + 0.08, z], 0.012, 10)
    reliefBody(k, [xTrv, yr + D / 2 + 0.1, z], [0, 1, 0], 0.018) // thermal relief
    smallValve(k, 'needle', [st.ov, yr - D * 0.95, z], [0, -1, 0], 0.008, [0, 0, 1]) // DBB body bleed
    transmitter(k, [st.m1 + D * 1.2, yr, z + D / 2], [0, 0, 1], 0.1)
    // prover tee (down) and outlet MOV into the outlet header
    const Sb = g.Sb
    k.cyl('pipePaint', D / 2 + 0.006, D * 1.6, [st.tee, yr, z], 'x', 28, undefined, true)
    branchMouth(k, [st.tee, yr - D / 2, z], [0, -1, 0], p.runNps)
    valve(k, 'ball', [st.ov, yr, z], [1, 0, 0], p.runNps, R, [0, 1, 0], 'valveBody', 1, 'mov')
    pipe(k, [st.ov + Sb / 2, yr, z], [xOut - Dh / 2 + 0.004, yr, z], p.runNps)
    branchMouth(k, [xOut - Dh / 2 + 0.0035, yr, z], [-1, 0, 0], p.runNps)
    const yv = (yr + yp) / 2
    pipe(k, [st.tee, yr - D / 2 + 0.004, z], [st.tee, yv + Sb / 2, z], p.runNps)
    valve(k, 'ball', [st.tee, yv, z], [0, -1, 0], p.runNps, R, [0, 0, 1], 'valveBody', 0, 'mov')
    pipe(k, [st.tee, yv - Sb / 2, z], [st.tee, yp + D / 2 - 0.004, z], p.runNps)
    branchMouth(k, [st.tee, yp + D / 2 - 0.0035, z], [0, 1, 0], p.runNps)
    // supports
    for (const x of [st.fc + (st.m0 - st.fc) * 0.5, st.m1 + 2.5 * D]) pipeSupport(k, [x, yr, z], D, y0, 'x')
    k.plane(textMaterial(`RUN ${i + 1}`, '#1b4f8a', '#ffffff', 256, 96), 0.22, 0.08, [st.iv - g.Sb / 2 - 0.15, yr + D / 2 + 0.07, z + 0.001])
  }
  for (const z of [zLane + 0.6, zCap - 0.4]) {
    pipeSupport(k, [xIn, yr, z], Dh, y0, 'z')
    pipeSupport(k, [xOut, yr, z], Dh, y0, 'z')
  }
  pipeSupport(k, [xT, yp, (zLane + zRun[0]) / 2], D, y0, 'z')
  pipeSupport(k, [xT, yp, zCap - 0.35], D, y0, 'z')

  // instrument cable tray: front riser, overhead run across the meters, local panel at the front
  const xTr = st.m1 + 0.45
  const yTr = yr + 0.95
  const zF = W / 2 - 0.25
  const zB = zRun[0] - 0.55
  for (const z of [zF, zB]) {
    k.box('galvanised', [0.08, yTr - y0, 0.08], [xTr, (yTr + y0) / 2 - 0.03, z])
    k.box('galvanised', [0.18, 0.012, 0.18], [xTr, y0 + 0.006, z])
    k.box('galvanised', [0.08, 0.05, 0.3], [xTr, yTr - 0.06, z])
  }
  cableTray(k, [[xTr, yTr - 0.035, zB], [xTr, yTr - 0.035, zF]], [1, 0, 0], 0.2, 3)
  const xP = xIn + 1.1
  const gl = localPanel(k, [xP, y0, W / 2 - 0.45], [0, 0, 1], { w: 0.7, h: 0.8, top: 1.9, title: 'METERING JB', buttons: 2 })
  cableTray(k, [[xP, gl[1] - 0.04, gl[2]], [xP, y0 + 0.25, gl[2]], [xP, y0 + 0.25, zF], [xTr - 0.1, y0 + 0.25, zF], [xTr - 0.1, yTr - 0.1, zF]], [1, 0, 0], 0.2, 3)
  for (const z of zRun) {
    const top = p.meterType === 'ultrasonic' ? yr + D * 0.75 + 0.33 : yr + D * 0.65 + 0.2
    const xm = (st.m0 + st.m1) / 2
    k.spline('cable', [[xTr, yTr - 0.02, z], [xTr - 0.15, yTr - 0.1, z], [xm + 0.12, top + 0.1, z], [xm + 0.05, top - 0.02, z]], 0.009, 6, 20)
  }
}

/** Weld-neck flange whose face is `len` past `weld` along `dir` (for blind-flanged header ends). Returns the face. */
function flangeEnd(k: Kit, weld: V3, dir: V3, nps: number, rating: Rating): V3 {
  const f = flangeDims(nps, rating)
  const face = addv(weld, dir, f.hubLength + f.raisedFaceHeight)
  blFlange(k, face, dir, nps, rating)
  return face
}

/** Meter body between its two flanges (body length `len`, centred at `c`, flow +X). */
function meter(k: Kit, p: P, c: V3, len: number, D: number) {
  const [x, y, z] = c
  const r = D / 2
  if (p.meterType === 'ultrasonic') {
    k.cyl(BODY, r * 1.35, len, c, 'x', 36)
    for (const s of [-1, 1]) k.cyl(BODY, r * 1.2, 0.04, [x + s * (len / 2 - 0.02), y, z], 'x', 36)
    // four chordal paths: transducer pairs on opposite sides, offset along the flow
    for (const h of [-0.62, -0.22, 0.22, 0.62])
      for (const s of [-1, 1]) {
        const a = Math.asin(h)
        const n = new THREE.Vector3(0, Math.sin(a), s * Math.cos(a))
        const b = new THREE.Vector3(x - s * len * 0.22, y, z).addScaledVector(n, r * 1.3)
        const t = b.clone().addScaledVector(n, 0.07)
        k.rod(BODY, b.toArray() as V3, t.toArray() as V3, 0.032, 12)
        k.cyl('stainless', 0.036, 0.03, t.toArray() as V3, n.toArray() as V3, 12)
        k.tube('tubing', [t.clone().addScaledVector(n, 0.015).toArray() as V3, [t.x, Math.max(t.y + 0.04, y + r * 1.4), t.z * 0.5 + z * 0.5], [x, y + r * 1.5 + 0.05, z]], 0.006, 6, 0.04)
      }
    // signal processing unit on a stem
    k.cyl(BODY, 0.035, 0.18, [x, y + r * 1.35 + 0.09, z], 'y', 14)
    k.rbox('aluminium', [0.24, 0.16, 0.2], 0.03, [x, y + r * 1.35 + 0.25, z])
    k.cyl('aluminium', 0.07, 0.03, [x, y + r * 1.35 + 0.25, z + 0.11], 'z', 20)
    k.disc('glass', 0.05, [x, y + r * 1.35 + 0.25, z + 0.126], 'z', 20)
    k.box('nameplate', [0.12, 0.07, 0.003], [x, y, z + r * 1.36])
  } else {
    k.cyl(BODY, r * 1.12, len, c, 'x', 32)
    k.cyl(BODY, r * 1.2, len * 0.3, c, 'x', 32)
    k.cyl(BODY, 0.03, r * 0.5, [x, y + r * 1.2 + r * 0.25, z], 'y', 12)
    k.hex('stainless', 0.05, 0.03, [x, y + r * 1.2 + r * 0.5, z])
    k.cyl('aluminium', 0.06, 0.14, [x, y + r * 1.2 + r * 0.5 + 0.1, z], 'y', 18)
    k.cyl('aluminium', 0.065, 0.02, [x, y + r * 1.2 + r * 0.5 + 0.18, z], 'y', 18)
    k.box('nameplate', [0.1, 0.06, 0.003], [x, y, z + r * 1.21])
  }
}
