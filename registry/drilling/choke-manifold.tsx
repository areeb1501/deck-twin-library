// Drilling choke & kill manifold (API 16C / API 6A): studded-cross header, double-valved choke branches, remote and manual chokes, bypass, buffer chamber.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, junctionBox, liftingLug, skid, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import type { Rating } from '../lib/standards'
import { G, angleChoke, apiFlange, apiGate, apiGateLength, apiJoint, apiStuddedFace, chokeDims, flowFrame, needleValve, type ApiFlange, type Psi } from './_drill'

export interface ChokeManifoldProps {
  /** working pressure, psi */
  psi?: Psi
  /** branch nominal bore, inches (API 6A size) */
  bore?: number
  /** hydraulic (remote) chokes */
  remoteChokes?: number
  /** manual adjustable chokes */
  manualChokes?: number
  /** block, spool and buffer chamber paint */
  color?: string
  tag?: string
}

export const defaults = { psi: 10000 as Psi, bore: 3.0625, remoteChokes: 2, manualChokes: 1, color: '#c25b28', tag: 'CM-101' }

type P = typeof defaults

const asme = (psi: Psi): Rating => (psi <= 5000 ? 1500 : 2500)

function layout(p: Omit<P, 'tag' | 'color'>) {
  const nr = Math.max(0, Math.min(3, Math.round(p.remoteChokes)))
  const nm = Math.max(0, Math.min(3, Math.round(p.manualChokes)))
  const kinds: ('hydraulic' | 'handwheel' | 'bypass')[] = [...Array(nr).fill('hydraulic'), ...Array(nm).fill('handwheel'), 'bypass']
  const nb = kinds.length
  const dU = apiFlange(p.bore, p.psi)
  const dI = apiFlange(4.0625, p.psi)
  const dO = apiFlange(4.0625, 5000)
  const Lg = apiGateLength(dU.bore, p.psi)
  const LgI = apiGateLength(dI.bore, p.psi)
  const LgO = apiGateLength(dO.bore, 5000)
  const ch = chokeDims(dU, dU)
  const pitch = 0.85
  const zs = kinds.map((_, i) => (i - (nb - 1) / 2) * pitch)
  const mid = Math.floor((nb - 1) / 2)
  const bh = Math.max(dI.od, dU.od) * 1.02
  const skidTop = 0.208
  const Rc = 0.24 // typical buffer chamber OD 480 mm
  const yC = skidTop + 0.16 + Rc
  const yT = yC + Rc + 0.08
  const yU = yT + Lg + ch.outlet
  const xU0 = 0
  const xc0 = xU0 + bh / 2 + Lg + ch.inlet
  const x00 = xU0 - bh / 2 - 2 * LgI
  const xMax = xc0 + ch.B / 2 + 0.95
  const off = -(x00 - 0.2 + xMax) / 2
  const xU = xU0 + off
  const xc = xc0 + off
  const x0 = x00 + off
  const zC = zs[nb - 1] + pitch * 0.6
  const neck = 0.22
  const zPort = zC + neck + LgO
  return { kinds, nb, dU, dI, dO, Lg, LgI, LgO, ch, pitch, zs, mid, bh, skidTop, Rc, yC, yT, yU, xU, xc, x0, zC, neck, zPort, L: xMax - x00 + 0.2, W: 2 * zPort - 0.1 }
}

export function ports(props: ChokeManifoldProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [
    port('inlet', 'Inlet (choke line)', [l.x0, l.yU, l.zs[l.mid]], [-1, 0, 0], 4, asme(p.psi)),
    port('outlet-1', 'Outlet to mud-gas separator', [l.xc, l.yC, l.zPort], [0, 0, 1], 4, 1500),
    port('outlet-2', 'Outlet to shakers', [l.xc, l.yC, -l.zPort], [0, 0, -1], 4, 1500),
  ]
}

export function ChokeManifold({ psi = defaults.psi, bore = defaults.bore, remoteChokes = defaults.remoteChokes, manualChokes = defaults.manualChokes, color = defaults.color, tag = defaults.tag, ...group }: ChokeManifoldProps & GroupProps) {
  const data = useKit((k) => build(k, { psi, bore, remoteChokes, manualChokes, color, tag }), [psi, bore, remoteChokes, manualChokes, color, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ChokeManifold

/** Run fn in a flow frame (local +Y along flow, +Z along the stem). */
const inFrame = (k: Kit, o: V3, flow: V3, stem: V3, fn: () => void) => k.with(flowFrame(o, flow, stem), fn)

function stand(k: Kit, x: number, z: number, yTop: number, y0: number, w = 0.14) {
  k.box('structSteelDark', [w, yTop - y0 - 0.02, w], [x, (yTop + y0) / 2 - 0.01, z])
  k.box('structSteelDark', [w + 0.12, 0.02, w + 0.12], [x, y0 + 0.01, z])
  k.box('structSteelDark', [w + 0.1, 0.02, w + 0.06], [x, yTop - 0.01, z])
}

function blind(k: Kit, d: ApiFlange, mat: MatKey) {
  // blind flange on a studded face at local y = 0, body above
  k.cyl(mat, d.od / 2, d.t, [0, G + d.t / 2, 0], 'y', 32)
  apiJoint(k, d, 0)
}

function build(k: Kit, p: P) {
  const l = layout(p)
  const { kinds, dU, dI, dO, Lg, LgI, LgO, ch, zs, mid, bh, skidTop, Rc, yC, yT, yU, xU, xc, x0, zC, neck, L, W } = l
  const M: MatKey = paint(p.color)
  const V: MatKey = 'valveBody'

  skid(k, L, W, 'HEB 200', 'structSteelDark')

  // upstream header: studded crosses on stands, flanged spools between, blind ends
  for (const z of zs) {
    k.rbox(M, [bh, bh, bh], 0.02, [xU, yU, z])
    stand(k, xU, z, yU - bh / 2, skidTop)
  }
  for (let i = 0; i < zs.length - 1; i++) {
    const a = zs[i] + bh / 2
    const b = zs[i + 1] - bh / 2
    inFrame(k, [xU, yU, a], [0, 0, 1], [0, 1, 0], () => {
      k.lathe(M, [[dU.bore * 0.0127, G], [dU.od / 2, G], [dU.od / 2, G + dU.t], [dU.od * 0.3, G + dU.t + 0.02], [dU.od * 0.3, b - a - G - dU.t - 0.02], [dU.od / 2, b - a - G - dU.t], [dU.od / 2, b - a - G], [dU.bore * 0.0127, b - a - G]], [0, 0, 0], 'y', 28)
      apiJoint(k, dU, 0)
      apiJoint(k, dU, b - a)
    })
  }
  for (const s of [-1, 1]) {
    const z = s > 0 ? zs[zs.length - 1] + bh / 2 : zs[0] - bh / 2
    inFrame(k, [xU, yU, z], [0, 0, s], [0, 1, 0], () => blind(k, dU, M))
  }
  // gauge and pressure transmitter on the header tops
  const zg = zs[mid]
  inFrame(k, [xU, yU + bh / 2, zg], [0, 1, 0], [0, 0, 1], () => {
    k.cyl(M, 0.05, 0.06, [0, 0.03, 0], 'y', 16)
  })
  const nv = needleValve(k, [xU, yU + bh / 2 + 0.06, zg], 'y')
  k.cyl('stainless', 0.012, 0.06, [nv[0], nv[1] + 0.03, nv[2]], 'y', 8)
  gauge(k, [nv[0], nv[1] + 0.12, nv[2] + 0.03], 'z', 0.15, 'bar', 1000)
  const zt = zs[Math.min(zs.length - 1, mid + 1)]
  k.cyl(M, 0.04, 0.06, [xU, yU + bh / 2 + 0.03, zt], 'y', 16)
  k.cyl('stainless', 0.025, 0.14, [xU, yU + bh / 2 + 0.13, zt], 'y', 14)
  k.rbox('stainless', [0.08, 0.1, 0.08], 0.012, [xU, yU + bh / 2 + 0.25, zt])

  // inlet: two gate valves into the middle cross
  const zi = zs[mid]
  const xi = xU - bh / 2
  for (let i = 0; i < 2; i++) {
    const o: V3 = [xi - i * LgI, yU, zi]
    inFrame(k, o, [-1, 0, 0], [0, 0, -1], () => {
      apiGate(k, dI, LgI, { kind: 'handwheel', D: 0.5 }, V)
      apiJoint(k, dI, 0)
    })
  }
  inFrame(k, [x0, yU, zi], [-1, 0, 0], [0, 0, 1], () => apiStuddedFace(k, dI, false))
  stand(k, xi - LgI, zi, yU - dI.od / 2, skidTop, 0.12)

  // branches: upstream gate, choke (or bypass target block), downstream gate into the buffer chamber
  const hoses: V3[] = []
  kinds.forEach((kind, i) => {
    const z = zs[i]
    inFrame(k, [xU + bh / 2, yU, z], [1, 0, 0], [0, 0, 1], () => {
      apiGate(k, dU, Lg, { kind: 'handwheel', D: 0.45 }, V)
      apiJoint(k, dU, 0)
      apiJoint(k, dU, Lg)
    })
    k.at([xc, yU, z], undefined, () => {
      if (kind === 'bypass') {
        // full-bore target block: blind target on the far side, outlet down
        const B = ch.B
        k.rbox(M, [B, B, B * 0.92], 0.02, [0, 0, 0])
        k.at([0, 0, 0], '-x', () => k.lathe(M, [[dU.bore * 0.0127, B / 2 - 0.01], [dU.od * 0.3, B / 2 - 0.01], [dU.od * 0.3, ch.inlet - dU.t - G], [dU.bore * 0.0127, ch.inlet - dU.t - G]], [0, 0, 0], 'y', 24))
        k.at([0, 0, 0], '-y', () => k.lathe(M, [[dU.bore * 0.0127, B / 2 - 0.01], [dU.od * 0.32, B / 2 - 0.01], [dU.od * 0.32, ch.outlet - dU.t - G], [dU.bore * 0.0127, ch.outlet - dU.t - G]], [0, 0, 0], 'y', 24))
        k.at([-ch.inlet, 0, 0], '-x', () => k.lathe(M, [[dU.bore * 0.0127, -G], [dU.od / 2, -G], [dU.od / 2, -G - dU.t], [dU.bore * 0.0127, -G - dU.t]].reverse() as [number, number][], [0, 0, 0], 'y', 28))
        k.at([0, -ch.outlet, 0], '-y', () => k.lathe(M, [[dU.bore * 0.0127, -G], [dU.od / 2, -G], [dU.od / 2, -G - dU.t], [dU.bore * 0.0127, -G - dU.t]].reverse() as [number, number][], [0, 0, 0], 'y', 28))
        k.cyl(M, B * 0.36, 0.05, [B / 2 + 0.025, 0, 0], 'x', 24)
        k.around(8, B * 0.3, [B / 2 + 0.055, 0, 0], 'x', (q) => k.hex('nut', 0.03, 0.02, q, 'x'), Math.PI / 8)
      } else {
        const r = angleChoke(k, dU, dU, kind, V)
        if (r.hose) hoses.push([xc + r.hose[0], yU + r.hose[1], z + r.hose[2]], [xc + r.hose[0], yU + r.hose[1], z - r.hose[2]])
      }
      k.at([-ch.inlet, 0, 0], '-x', () => apiJoint(k, dU, 0))
    })
    const yo = yU - ch.outlet
    inFrame(k, [xc, yo, z], [0, -1, 0], [0, 0, 1], () => {
      apiGate(k, dU, Lg, { kind: 'handwheel', D: 0.4 }, V)
      apiJoint(k, dU, 0)
      apiJoint(k, dU, Lg)
    })
    // chamber inlet boss
    k.cyl(M, dU.od * 0.36, yT - G - (yC + Rc * 0.8), [xc, (yT - G + yC + Rc * 0.8) / 2, z], 'y', 28)
    k.cyl(M, dU.od / 2, dU.t * 0.8, [xc, yT - G - dU.t * 0.4, z], 'y', 32)
  })

  // buffer chamber: heavy-wall shell with forged ends, saddles, drain, gauge, lifting lugs, data plate
  k.cyl(M, Rc, 2 * zC, [xc, yC, 0], 'z', 48)
  for (const s of [-1, 1]) {
    k.cyl(M, Rc + 0.03, 0.08, [xc, yC, s * (zC + 0.04)], 'z', 48)
    k.boltCircle('boltXylan', 'nut', 16, Rc - 0.01, [xc, yC, s * (zC - 0.02)], s > 0 ? 'z' : '-z', 0.03, 0.16, [0.14])
    // outlet neck, flange and the outlet isolation gate
    const zn = s * (zC + 0.08)
    inFrame(k, [xc, yC, zn], [0, 0, s], [0, 1, 0], () => {
      k.lathe(M, [[dO.bore * 0.0127, 0], [dO.od * 0.32, 0], [dO.od * 0.32, neck - 0.08 - dO.t - G], [dO.od / 2, neck - 0.08 - dO.t - G], [dO.od / 2, neck - 0.08 - G], [dO.bore * 0.0127, neck - 0.08 - G]], [0, 0, 0], 'y', 28)
      k.at([0, neck - 0.08, 0], undefined, () => {
        apiGate(k, dO, LgO, { kind: 'handwheel', D: 0.5 }, V)
        apiJoint(k, dO, 0)
        k.at([0, LgO, 0], undefined, () => apiStuddedFace(k, dO, false))
      })
    })
    stand(k, xc, s * (zC + 0.08 + neck - 0.08 + LgO / 2), yC - dO.od * 0.45, skidTop, 0.12)
  }
  for (const z of [-zC * 0.75, 0, zC * 0.75]) {
    const sh = new THREE.Shape()
    sh.moveTo(-Rc * 0.9, skidTop)
    sh.lineTo(Rc * 0.9, skidTop)
    sh.lineTo(Rc * 0.9, yC - Rc * 0.45)
    sh.absarc(0, yC, Rc + 0.012, -Math.PI / 2 + 1.1, -Math.PI / 2 - 1.1, true)
    sh.lineTo(-Rc * 0.9, skidTop)
    k.extrude('structSteelDark', sh, 0.025, new THREE.Matrix4().makeTranslation(xc, 0, z - 0.0125), 24)
    k.box('structSteelDark', [Rc * 2, 0.02, 0.2], [xc, skidTop + 0.01, z])
  }
  k.cyl(M, 0.04, 0.1, [xc, yC - Rc - 0.03, zs[0] - 0.3], 'y', 14)
  needleValve(k, [xc + 0.04, yC - Rc - 0.06, zs[0] - 0.3], 'x')
  k.cyl(M, 0.04, 0.07, [xc + Rc * 0.7, yC + Rc * 0.7, zs[mid] + 0.42], [1, 1, 0], 14)
  const gv = needleValve(k, [xc + Rc * 0.75, yC + Rc * 0.75, zs[mid] + 0.42], 'y')
  gauge(k, [gv[0], gv[1] + 0.09, gv[2]], 'x', 0.12, 'bar', 100)
  for (const s of [-1, 1]) liftingLug(k, [xc, yC + Rc - 0.01, s * zC * 0.5], 'z', 1.4, M)
  tagPlate(k, `BUFFER CHAMBER ${p.psi / 1000}K`, [xc + Rc + 0.002, yC, zs[0] + 0.3], 'x', 0.24)

  // hydraulic hoses from the remote chokes to the choke-panel junction plate
  if (hoses.length) {
    const jx = xc + ch.B / 2 + 0.8
    const jz = zs[0] - l.pitch * 0.55
    k.box('structSteelDark', [0.08, 1.2, 0.08], [jx, skidTop + 0.6, jz])
    k.box('structSteelDark', [0.2, 0.02, 0.2], [jx, skidTop + 0.01, jz])
    k.rbox('stainless', [0.12, 0.5, 0.4], 0.02, [jx - 0.1, skidTop + 1.0, jz])
    hoses.forEach((h, i) => {
      const yj = skidTop + 0.82 + (i % 6) * 0.06
      k.spline('rubberBlack', [h, [h[0], h[1] + 0.12, h[2]], [jx - 0.3, h[1] + 0.1, (h[2] + jz) / 2], [jx - 0.3, yj + 0.1, jz + 0.1 - (i % 4) * 0.05], [jx - 0.16, yj, jz + 0.1 - (i % 4) * 0.05]], 0.011, 8, 40)
    })
    junctionBox(k, [jx + 0.04, skidTop + 0.65, jz], 'x', [0.22, 0.22, 0.12])
  }

  tagPlate(k, p.tag, [0, 0.11, W / 2 + 0.002], 'z', 0.3)
  tagPlate(k, `API 16C  ${p.psi} PSI`, [xc, 0.11, W / 2 + 0.002], 'z', 0.3)
}
