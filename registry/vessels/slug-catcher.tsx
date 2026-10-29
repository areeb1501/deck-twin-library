// Finger-type slug catcher: inlet header splitting into parallel fingers, upper separation fingers with downcomers to sloped storage fingers, gas risers to a gas header, liquid header. ASME B31.8, ASME B16.5.
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, member, tagPlate, weldBead } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { holeR, pipeSkin, type Hole } from './_vessel'

export interface SlugCatcherProps {
  fingers?: number
  fingerNps?: number
  /** storage finger length, m */
  length?: number
  /** storage finger fall away from the inlet, % */
  slope?: number
  inletNps?: number
  gasNps?: number
  liquidNps?: number
  rating?: Rating
  tag?: string
}

export const defaults = {
  fingers: 4,
  fingerNps: 36,
  length: 36,
  slope: 1,
  inletNps: 24,
  gasNps: 20,
  liquidNps: 10,
  rating: 600 as Rating,
  tag: 'SC-100',
}

type P = typeof defaults

function layout(p: P) {
  const n = Math.max(2, Math.round(p.fingers))
  const OD = pipeOD(p.fingerNps)
  const pitch = OD * 2.3
  const zs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch)
  const L = p.length
  const s = p.slope / 100
  const xL0 = 1.2
  const yL0 = 0.6 + OD / 2 + (L - xL0) * s
  const yL = (x: number) => yL0 - (x - xL0) * s
  const yU = yL0 + OD + 0.7
  const xU1 = Math.max(8, L * 0.4)
  const hNps = Math.min(48, Math.max(p.inletNps, p.fingerNps) + 6) // headers a size up so the finger tees stay clear of the header sides
  const hOD = pipeOD(hNps)
  const gOD = pipeOD(p.gasNps)
  const rNps = Math.min(p.gasNps, 16)
  const xR = xU1 - OD
  const yG = yU + OD / 2 + 1.6
  const zEnd = zs[n - 1] + pitch * 0.6
  const fl = (nps: number) => flangeDims(nps, p.rating).hubLength + flangeDims(nps, p.rating).raisedFaceHeight
  const inletFace: V3 = [-hOD / 2 - 1.6, yU, 0]
  const gasFace: V3 = [xR, yG, zEnd + 1.2]
  const lOD = hOD
  const liqFace: V3 = [L + lOD / 2 + 1.4, yL(L), 0]
  return { n, OD, pitch, zs, L, s, xL0, yL0, yL, yU, xU1, hOD, gOD, rNps, xR, yG, zEnd, fl, inletFace, gasFace, liqFace, lOD }
}

export function ports(props: SlugCatcherProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const G = layout(p)
  return [
    port('inlet', 'Inlet', G.inletFace, [-1, 0, 0], p.inletNps, p.rating),
    port('gas', 'Gas outlet', G.gasFace, [0, 0, 1], p.gasNps, p.rating),
    port('liquid', 'Liquid outlet', G.liqFace, [1, 0, 0], p.liquidNps, p.rating),
  ]
}

export function SlugCatcher(props: SlugCatcherProps & GroupProps) {
  const { fingers, fingerNps, length, slope, inletNps, gasNps, liquidNps, rating, tag, ...group } = { ...defaults, ...props }
  const p = { fingers, fingerNps, length, slope, inletNps, gasNps, liquidNps, rating, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SlugCatcher

function build(k: Kit, p: P) {
  const G = layout(p)
  const { OD, zs, L, yL, yU, xU1, hOD, gOD, xR, yG, zEnd } = G
  const m = 'pipePaint'
  const dcNps = Math.max(8, Math.round(p.fingerNps / 3 / 2) * 2)
  const dcX = [L * 0.14, L * 0.28].filter((x) => x < xU1 - 2 * OD)
  const cap = (pos: V3, axis: V3, od: number) => {
    k.dome(m, od / 2, pos, axis, Math.PI / 2, 0.5, 32)
    k.dome('vesselInner', od / 2, pos, axis, Math.PI / 2, 0.5, 32)
  }
  // inlet header (along Z) with the inlet branch and one branch per finger
  const hz = zs[zs.length - 1] + G.pitch * 0.5
  pipeSkin(k, m, [0, yU, -hz], [0, yU, hz], hOD, [
    { p: [-hOD / 2, yU, 0], d: [-1, 0, 0], r: holeR(p.inletNps) },
    ...zs.map((z): Hole => ({ p: [hOD / 2, yU, z], d: [1, 0, 0], r: OD / 2 - 0.012 })),
  ], 48)
  for (const s of [-1, 1]) cap([0, yU, s * hz], [0, 0, s], hOD)
  const fi = G.fl(p.inletNps)
  pipeSkin(k, m, [-hOD * 0.4, yU, 0], [G.inletFace[0] + fi, yU, 0], pipeOD(p.inletNps))
  flange(k, p.inletNps, p.rating, G.inletFace, [-1, 0, 0], true)

  for (const z of zs) {
    // upper separation finger: header → gas riser, downcomers below
    pipeSkin(k, m, [hOD * 0.4, yU, z], [xU1, yU, z], OD, [
      ...dcX.map((x): Hole => ({ p: [x, yU - OD / 2, z], d: [0, -1, 0], r: holeR(dcNps) })),
      { p: [xR, yU + OD / 2, z], d: [0, 1, 0], r: holeR(G.rNps) },
    ], 48)
    cap([xU1, yU, z], [1, 0, 0], OD)
    // sloped storage finger
    const a: V3 = [G.xL0, yL(G.xL0), z]
    const b: V3 = [L + G.lOD * 0.4, yL(L), z]
    pipeSkin(k, m, a, b, OD, dcX.map((x): Hole => ({ p: [x, yL(x) + OD / 2, z], d: [0, 1, 0], r: holeR(dcNps) })), 48)
    cap(a, [-1, 0, -0.0], OD)
    for (let x = G.xL0 + 12; x < L; x += 12) weldBead(k, p.fingerNps, [x, yL(x), z], [1, 0, 0])
    for (const x of dcX) pipeSkin(k, m, [x, yU - OD * 0.4, z], [x, yL(x) + OD * 0.4, z], pipeOD(dcNps))
    pipeSkin(k, m, [xR, yU + OD * 0.4, z], [xR, yG - gOD * 0.4, z], pipeOD(G.rNps))
  }
  // gas header with outlet flange on +Z
  const gf = G.fl(p.gasNps)
  pipeSkin(k, m, [xR, yG, zs[0] - G.pitch * 0.5], [xR, yG, G.gasFace[2] - gf], gOD, zs.map((z): Hole => ({ p: [xR, yG - gOD / 2, z], d: [0, -1, 0], r: holeR(G.rNps) })), 40)
  cap([xR, yG, zs[0] - G.pitch * 0.5], [0, 0, -1], gOD)
  flange(k, p.gasNps, p.rating, G.gasFace, [0, 0, 1], true)
  // liquid header at the low end with the outlet branch
  const yLq = yL(L)
  pipeSkin(k, m, [L + G.lOD / 2, yLq, -hz], [L + G.lOD / 2, yLq, hz], G.lOD, [
    ...zs.map((z): Hole => ({ p: [L + G.lOD / 2 - G.lOD / 2, yLq, z], d: [-1, 0, 0], r: OD / 2 - 0.012 })),
    { p: [L + G.lOD, yLq, 0], d: [1, 0, 0], r: holeR(p.liquidNps) },
  ], 48)
  for (const s of [-1, 1]) cap([L + G.lOD / 2, yLq, s * hz], [0, 0, s], G.lOD)
  const lf = G.fl(p.liquidNps)
  pipeSkin(k, m, [L + G.lOD * 0.9, yLq, 0], [G.liqFace[0] - lf, yLq, 0], pipeOD(p.liquidNps))
  flange(k, p.liquidNps, p.rating, G.liqFace, [1, 0, 0], true)

  // supports: concrete sleepers with shoes under the storage fingers, steel portals under the upper fingers and gas header
  const zw = zEnd + 0.4
  for (let x = 3; x <= L - 1; x += 6) {
    const top = yL(x) - OD / 2 - 0.12
    k.box('concrete', [0.6, top, 2 * zw], [x, top / 2, 0])
    for (const z of zs) {
      k.box('structSteel', [0.4, 0.12, OD * 0.5], [x, top + 0.06, z])
      k.box('structSteel', [0.4, 0.02, 0.3], [x, top + 0.13, z])
    }
  }
  const portal = (x: number, yTop: number) => {
    const zc = [zs[0] - G.pitch / 2, ...zs.slice(1).map((z) => z - G.pitch / 2), zs[zs.length - 1] + G.pitch / 2]
    for (const z of zc) member(k, [x, 0, z], [x, yTop, z], 'HEA 200')
    member(k, [x, yTop + 0.1, zc[0] - 0.1], [x, yTop + 0.1, zc[zc.length - 1] + 0.1], 'HEA 200', 'structSteel', [0, 1, 0])
    for (const z of zs) k.box('structSteel', [0.3, yTop + 0.2 > 0 ? 0.1 : 0.1, OD * 0.45], [x, yTop + 0.25, z])
  }
  for (let x = 4.5; x < xU1 - 1; x += 7) if (!dcX.some((d) => Math.abs(d - x) < 0.8)) portal(x, yU - OD / 2 - 0.3)
  portal(1.0 + hOD / 2, yU - Math.max(hOD, OD) / 2 - 0.3)
  portal(xR + gOD, yG - gOD / 2 - 0.3)
  k.box('galvanised', [0.08, 1.4, 0.08], [-1.2, 0.7, -hz - 0.6])
  k.box('structSteel', [0.5, 0.18, 0.01], [-1.2, 1.3, -hz - 0.55])
  tagPlate(k, p.tag, [-1.2, 1.3, -hz - 0.544], 'z', 0.45)
}
