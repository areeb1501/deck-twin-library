// Manual pedestal (pipe) davit crane after EN 13852-1 / EN 13157: socketed base plate, slewing gooseneck mast and jib, hand winch, sheaves, wire rope and hook.
import * as THREE from 'three'
import { useMemo } from 'react'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { pipeOD, pipeWall } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { Rope, bar, boxMM, craneYellow, hook, ropeMaterial } from './_rigging'

export interface DavitCraneProps {
  /** outreach from the mast axis to the hook, m */
  reach?: number
  /** jib centreline above the deck, m */
  height?: number
  /** slew, deg, counter-clockwise from above; 0 = jib along +X */
  slew?: number
  /** hook below the jib-tip sheave, m */
  hook?: number
  /** safe working load, t */
  swl?: number
  tag?: string
}

export const defaults = {
  reach: 1.6,
  height: 2.6,
  slew: 0,
  hook: 1.4,
  swl: 0.5,
  tag: 'DC-101',
}

const DEG = Math.PI / 180
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function dims(reach: number, height: number, swl: number) {
  const nps = swl <= 0.5 ? 6 : swl <= 1 ? 8 : swl <= 2 ? 10 : 12
  const od = pipeOD(nps)
  const rM = od / 2
  const R = 2.5 * od
  const h = clamp(height, 1.8, 6)
  const reachC = clamp(reach, R + 0.45, 6)
  const rt = 0.08
  const xTip = reachC - rt
  const rg = 0.1
  const xr = -(rM + 0.05)
  return { nps, od, rM, R, h, reach: reachC, rt, xTip, rg, xr, xg: xr + rg, yg: h + rt - rg, yRope: h + rt, socketH: 0.6, yWinch: 1.1 }
}
type D = ReturnType<typeof dims>

export function DavitCrane({ reach = defaults.reach, height = defaults.height, slew = defaults.slew, hook: drop = defaults.hook, swl = defaults.swl, tag = defaults.tag, ...group }: DavitCraneProps & GroupProps) {
  const D = useMemo(() => dims(reach, height, swl), [reach, height, swl])
  const base = useKit((k) => buildBase(k, D, swl, tag), [D, swl, tag])
  const mast = useKit((k) => buildMast(k, D, swl), [D, swl])
  const hk = useKit((k) => buildHook(k, swl), [swl])
  const yHook = D.h - clamp(drop, 0.3, D.h + 20)
  const xr = D.xTip + D.rt
  return (
    <group {...group}>
      <KitMesh data={base} />
      <group rotation={[0, slew * DEG, 0]}>
        <KitMesh data={mast} />
        <Rope a={[xr, D.h, 0]} b={[xr, yHook + 0.1, 0]} r={0.006} material={ropeMaterial()} />
        <group position={[xr, yHook, 0]}>
          <KitMesh data={hk} />
        </group>
      </group>
    </group>
  )
}

export default DavitCrane

function buildBase(k: Kit, D: D, swl: number, tag: string) {
  const Y = craneYellow()
  const rs = D.rM + 0.035
  const bp = Math.max(0.5, rs * 2 + 0.25)
  boxMM(k, Y, [-bp / 2, 0, -bp / 2], [bp / 2, 0.03, bp / 2])
  k.pipe(Y, [0, 0.03, 0], [0, D.socketH, 0], rs * 2, 0.012, 32)
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    const sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(bp / 2 * Math.SQRT2 - rs - 0.06, 0), new THREE.Vector2(0, D.socketH * 0.6)])
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
    const o = new THREE.Vector3(Math.cos(a) * rs, 0.03, Math.sin(a) * rs).add(new THREE.Vector3(0, 0, -0.006).applyQuaternion(q))
    k.extrude(Y, sh, 0.012, new THREE.Matrix4().compose(o, q, new THREE.Vector3(1, 1, 1)))
  }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p: V3 = [sx * (bp / 2 - 0.06), 0.03, sz * (bp / 2 - 0.06)]
      k.cyl('stainless', 0.025, 0.004, [p[0], 0.032, p[2]], 'y', 14)
      k.hex('nut', 0.042, 0.024, [p[0], 0.046, p[2]])
      k.cyl('boltXylan', 0.011, 0.07, [p[0], 0.06, p[2]], 'y', 8)
    }
  // socket head ring with the slew-lock pin
  k.cyl(Y, rs + 0.03, 0.03, [0, D.socketH - 0.015, 0], 'y', 32)
  k.cyl('castIron', 0.012, 0.08, [-(rs + 0.015), D.socketH + 0.02, 0], 'y', 8)
  k.rod('actuatorRed', [-(rs + 0.015), D.socketH + 0.06, 0], [-(rs + 0.1), D.socketH + 0.06, 0], 0.008, 6)
  // SWL + tag plates on the socket
  const q = new THREE.Quaternion()
  k.box('stainless', [0.2, 0.08, 0.003], [0, D.socketH * 0.55, rs + 0.002], q)
  k.plane(textMaterial(`SWL ${swl} t`, '#f4f4ef', '#111111', 256, 96), 0.18, 0.065, [0, D.socketH * 0.55, rs + 0.0037])
  if (tag) tagPlate(k, tag, [0, D.socketH * 0.3, rs + 0.001], 'z', 0.16)
}

function buildMast(k: Kit, D: D, swl: number) {
  const Y = craneYellow()
  const dark = 'castIron' as const
  const rope = ropeMaterial()
  const { od, R, h, rM } = D
  const wall = pipeWall(D.nps, 'XS')
  // slew bearing ring, mast, gooseneck bend, jib, knee brace
  k.cyl(dark, rM + 0.045, 0.04, [0, D.socketH + 0.02, 0], 'y', 32)
  k.pipe(Y, [0, D.socketH * 0.3, 0], [0, h - R, 0], od, wall, 28)
  k.bend(Y, [0, h - R, 0], [0, 1, 0], [1, 0, 0], R, od, Math.PI / 2, wall)
  k.pipe(Y, [R, h, 0], [D.xTip - 0.12, h, 0], od, wall, 28)
  k.disc(Y, rM, [D.xTip - 0.12, h, 0], 'x', 28)
  const kb = Math.max(0.6, (D.xTip - R) * 0.6 + R)
  k.rod(Y, [rM * 0.9, h - R - 0.7, 0], [kb, h - rM * 0.9, 0], od * 0.22, 12)
  // jib-tip cheek plates, sheave, wire wrap
  for (const sz of [-1, 1]) bar(k, Y, [D.xTip - 0.3, h, sz * 0.03], [D.xTip + 0.03, h, sz * 0.03], Math.max(od, 0.18), 0.01, [0, 0, 1])
  k.cyl(dark, D.rt, 0.035, [D.xTip, h, 0], 'z', 22)
  k.cyl('stainless', 0.012, 0.09, [D.xTip, h, 0], 'z', 8)
  k.torus(rope, D.rt, 0.006, [D.xTip, h, 0], 'z', 6, 18, Math.PI / 2)
  // guide sheave over the gooseneck on twin brackets
  for (const sz of [-1, 1]) bar(k, Y, [D.xg, D.yg, sz * 0.028], [0, h - R - 0.05, sz * 0.028], 0.1, 0.01, [0, 0, 1])
  k.cyl(dark, D.rg, 0.03, [D.xg, D.yg, 0], 'z', 22)
  k.cyl('stainless', 0.012, 0.08, [D.xg, D.yg, 0], 'z', 8)
  k.add(rope, new THREE.TorusGeometry(D.rg, 0.006, 6, 18, Math.PI / 2).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(D.xg, D.yg, 0))
  // hand winch on the back of the mast: clamp bands, side plates, drum, ratchet, pawl, crank
  const yw = D.yWinch
  const rd = 0.06 + swl * 0.02
  const xd = D.xr - rd - 0.008
  for (const y of [yw - 0.18, yw + 0.18]) k.torus(Y, rM + 0.008, 0.012, [0, y, 0], 'y', 6, 28)
  for (const sz of [-1, 1]) {
    boxMM(k, Y, [xd - rd - 0.08, yw - 0.22, sz * 0.11 - 0.006], [-rM * 0.6, yw + 0.22, sz * 0.11 + 0.006])
  }
  k.cyl(dark, rd, 0.2, [xd, yw, 0], 'z', 20)
  k.cyl(rope, rd + 0.008, 0.17, [xd, yw, 0], 'z', 20)
  for (const sz of [-1, 1]) k.cyl(Y, rd + 0.05, 0.008, [xd, yw, sz * 0.095], 'z', 24)
  k.cyl('stainless', 0.015, 0.34, [xd, yw, 0.03], 'z', 10)
  const nT = 16
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2
    k.box(dark, [0.02, 0.012, 0.012], [xd + Math.cos(a) * (rd + 0.04), yw + Math.sin(a) * (rd + 0.04), 0.125], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a))
  }
  k.cyl(dark, rd + 0.035, 0.012, [xd, yw, 0.125], 'z', 24)
  bar(k, dark, [xd - rd - 0.06, yw + 0.08, 0.125], [xd - rd - 0.03, yw + 0.035, 0.125], 0.012, 0.02, [0, 0, 1])
  bar(k, 'handwheel', [xd, yw, 0.2], [xd - 0.2, yw - 0.12, 0.2], 0.025, 0.015, [0, 0, 1])
  k.cyl('rubberBlack', 0.016, 0.12, [xd - 0.2, yw - 0.12, 0.26], 'z', 10)
  // wire: drum → guide sheave → along the jib → tip sheave
  k.rod(rope, [D.xr, yw, 0], [D.xr, D.yg, 0], 0.006, 6)
  k.rod(rope, [D.xg, D.yRope, 0], [D.xTip, D.yRope, 0], 0.006, 6)
  for (let x = R + 0.25; x < D.xTip - 0.3; x += 0.6) {
    for (const sz of [-1, 1]) boxMM(k, Y, [x - 0.02, h + rM - 0.01, sz * 0.03 - 0.004], [x + 0.02, D.yRope + 0.02, sz * 0.03 + 0.004])
    k.cyl('nut', 0.012, 0.064, [x, D.yRope + 0.014, 0], 'z', 8)
  }
}

function buildHook(k: Kit, swl: number) {
  const s = clamp(0.7 + swl * 0.3, 0.7, 1.5)
  k.cyl('castIron', 0.016 * s, 0.09, [0, 0.07, 0], 'y', 8)
  k.torus('galvanised', 0.025 * s, 0.006 * s, [0, 0.12, 0], 'z', 6, 14)
  k.cyl('castIron', 0.03 * s, 0.05 * s, [0, 0.0, 0], 'y', 12)
  hook(k, [0, -0.08 * s, 0], 0.035 * s, 'castIron')
}
