// Linear-motion shale shaker (API RP 13C screens): spring-mounted basket, pretensioned panels, twin vibrator motors, possum-belly feeder, underflow pan.
import * as THREE from 'three'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, junctionBox, liftingLug, member, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { meshGuardMaterial } from '../lib/textures'
import { pipeOD, pipeWall } from '../lib/standards'

export interface ShaleShakerProps {
  /** screen panels along the main deck */
  panels?: number
  /** stacked screen decks (1 = single deck, 2–3 add scalping decks) */
  decks?: number
  /** deck angle of the inclined panels, degrees */
  deckAngle?: number
  /** feed flange, inches */
  feedNps?: number
  color?: string
  tag?: string
  /** vibrate the basket */
  running?: boolean
}

export const defaults = { panels: 4, decks: 1, deckAngle: 5, feedNps: 10, color: '#2f7d4f', tag: 'SS-101', running: true }

type P = typeof defaults

// typical 4-panel unit: 3.3 × 2.0 m footprint, 1.17 × 0.66 m panels (≈ 3.1 m² screen), weir 0.84 m
function layout(p: Omit<P, 'tag' | 'running' | 'color'>) {
  const np = Math.max(2, Math.min(6, Math.round(p.panels)))
  const pl = 0.66
  const bw = 1.17
  const xB0 = -1.0
  const xB1 = xB0 + np * pl + 0.04
  const xF = xB0 - 0.66
  const L = xB1 - xF
  const W = 2.03
  const yd0 = 0.52
  const yWeir = 0.84
  const feed: V3 = [xF - 0.22, 0.42, 0]
  return { np, pl, bw, xB0, xB1, xF, L, W, yd0, yWeir, feed, cx: (xF + xB1) / 2 }
}

export function ports(props: ShaleShakerProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [port('feed', 'Feed (flowline)', [l.feed[0] - l.cx, l.feed[1], l.feed[2]], [-1, 0, 0], p.feedNps, 150)]
}

export function ShaleShaker({ tag = defaults.tag, ...rest }: ShaleShakerProps & GroupProps) {
  const { panels, decks, deckAngle, feedNps, color, running, ...group } = { ...defaults, ...rest }
  const out = useMemo(() => build({ panels, decks, deckAngle, feedNps, color, tag, running }), [panels, decks, deckAngle, feedNps, color, tag])
  useEffect(() => () => [out.fixed, out.basket].forEach((b) => b.geometry.dispose()), [out])
  const g = useRef<THREE.Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!g.current) return
    if (!running) return void g.current.position.set(0, 0, 0)
    t.current += Math.min(dt, 0.05) * 2 * Math.PI * 22
    const s = Math.sin(t.current) * 0.004
    g.current.position.set(out.dir[0] * s, out.dir[1] * s, 0)
  })
  return (
    <group {...group}>
      <KitMesh data={out.fixed} />
      <group ref={g}>
        <KitMesh data={out.basket} />
      </group>
    </group>
  )
}

export default ShaleShaker

function build(p: P) {
  const l = layout(p)
  const { np, pl, bw, xB0, xB1, xF, W, yd0, yWeir } = l
  const k = new Kit()
  const b = new Kit()
  const C: MatKey = paint(p.color)
  const ang = (Math.max(-3, Math.min(8, p.deckAngle)) * Math.PI) / 180
  const nd = Math.max(1, Math.min(3, Math.round(p.decks)))
  const sx = -l.cx
  const zW = bw / 2 + 0.012
  // deck surface height along x (first panel flat, the rest inclined)
  const deckY = (x: number) => yd0 + Math.max(0, x - (xB0 + pl)) * Math.tan(ang)
  const wallTop = 0.34 + (nd - 1) * 0.22

  k.at([sx, 0, 0], undefined, () => {
    // base frame of channels with cross members and spring posts
    for (const s of [-1, 1]) member(k, [xF, 0.08, s * (W / 2 - 0.04)], [xB1, 0.08, s * (W / 2 - 0.04)], 'UPN 160', 'structSteelDark', [0, 1, 0])
    for (const x of [xF + 0.04, xB0 + 0.05, (xB0 + xB1) / 2 + 0.45, xB1 - 0.04]) member(k, [x, 0.08, -W / 2 + 0.08], [x, 0.08, W / 2 - 0.08], 'UPN 160', 'structSteelDark')
    for (const sxz of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sxz > 0 ? xB1 - 0.25 : xF + 0.25, 0.16, sz * (W / 2 - 0.02)], 'x', 1, 'structSteelDark')
    for (const x of [xB0 + 0.2, xB1 - 0.2])
      for (const s of [-1, 1]) {
        k.box('structSteelDark', [0.24, 0.12, 0.24], [x, 0.22, s * (zW + 0.2)])
        k.box('structSteelDark', [0.06, 0.12, 0.3], [x, 0.22, s * (zW + 0.2 + 0.0)])
      }

    // underflow pan: sloped floor to a centre trough with an outlet through the tank-top opening
    const px0 = xB0 + 0.05
    const px1 = xB1 - 0.08
    const xm = (px0 + px1) / 2
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? px0 : px1
      const len = Math.abs(xm - x0)
      const drop = 0.1
      k.box('galvanised', [Math.hypot(len, drop), 0.006, bw - 0.02], [(x0 + xm) / 2, 0.29, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), s * Math.atan2(drop, len)))
    }
    for (const s of [-1, 1]) k.box('galvanised', [px1 - px0, 0.22, 0.006], [xm, 0.3, s * (bw / 2 - 0.01)])
    for (const x of [px0, px1]) k.box('galvanised', [0.006, 0.22, bw - 0.02], [x, 0.3, 0])
    k.box('galvanised', [0.3, 0.16, 0.5], [xm, 0.16, 0])
    k.box('galvanised', [0.24, 0.16, 0.44], [xm, 0.04, 0])

    // possum belly feeder (fixed): weir box, mud level, inlet nozzle, bypass gate, flared apron onto the first panel
    const fx0 = xF + 0.02
    const fx1 = xB0 - 0.04
    const fW = bw + 0.1
    for (const s of [-1, 1]) k.box(C, [fx1 - fx0, yWeir - 0.16, 0.01], [(fx0 + fx1) / 2, (yWeir + 0.16) / 2, s * fW / 2])
    k.box(C, [0.01, yWeir - 0.16 + 0.12, fW], [fx0, (yWeir + 0.16 + 0.12) / 2, 0])
    k.box(C, [0.01, yWeir - 0.16, fW], [fx1, (yWeir + 0.16) / 2, 0])
    k.box(C, [fx1 - fx0, 0.01, fW], [(fx0 + fx1) / 2, 0.165, 0])
    k.box(C, [fx1 - fx0 + 0.04, 0.04, 0.04], [(fx0 + fx1) / 2, yWeir + 0.02, fW / 2 + 0.02])
    k.box(C, [fx1 - fx0 + 0.04, 0.04, 0.04], [(fx0 + fx1) / 2, yWeir + 0.02, -fW / 2 - 0.02])
    k.box(paint('#5b4733', { metalness: 0, roughness: 0.25, weather: 0 }), [fx1 - fx0 - 0.02, 0.005, fW - 0.02], [(fx0 + fx1) / 2, yWeir - 0.05, 0])
    // apron from the weir lip down onto the first panel
    const ax1 = xB0 + 0.06
    const ay1 = deckY(xB0) + 0.06
    k.box('stainless', [Math.hypot(ax1 - fx1, yWeir - ay1), 0.006, bw - 0.04], [(fx1 + ax1) / 2, (yWeir + ay1) / 2, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.atan2(yWeir - ay1, ax1 - fx1)))
    // feed nozzle and flange
    const f = l.feed
    const fl = flange(k, p.feedNps, 150, f, '-x', true)
    k.pipe(C, [fx0 + 0.02, f[1], 0], [f[0] + fl, f[1], 0], pipeOD(p.feedNps), pipeWall(p.feedNps))
    // bypass gate lever and its pivot on the side
    k.rod('stainless', [(fx0 + fx1) / 2, 0.26, -fW / 2 - 0.01], [(fx0 + fx1) / 2, 0.26, -fW / 2 - 0.08], 0.012, 8)
    k.rod('safetyYellow', [(fx0 + fx1) / 2, 0.26, -fW / 2 - 0.08], [(fx0 + fx1) / 2 + 0.25, 0.5, -fW / 2 - 0.08], 0.012, 8)
    for (const s of [-1, 1]) k.box('structSteelDark', [0.06, 0.16, 0.06], [(fx0 + fx1) / 2, 0.08, s * fW / 2])

    // motor starter panel on a post, cables to the motors
    const cx = xF + 0.35
    const cz = W / 2 - 0.12
    k.box('structSteelDark', [0.06, 1.2, 0.06], [cx, 0.76, cz])
    k.box('structSteelDark', [0.18, 0.02, 0.18], [cx, 0.17, cz])
    junctionBox(k, [cx, 1.05, cz + 0.03], 'z', [0.32, 0.4, 0.18], 'stainless')
    k.spline('cable', [[cx, 0.84, cz + 0.12], [cx + 0.4, 0.8, cz + 0.2], [0.4, 1.2, zW + 0.2], [0.42, 1.18, 0.4]], 0.012, 6, 30)

    tagPlate(k, p.tag, [xF + 0.9, 0.08, W / 2 + 0.002], 'z', 0.24)
    tagPlate(k, 'API RP 13C', [xF + 1.3, 0.08, W / 2 + 0.002], 'z', 0.2)
  })

  // ---- vibrating basket
  b.at([sx, 0, 0], undefined, () => {
    // side walls following the deck, with stiffeners, spring brackets and discharge lip
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape()
      sh.moveTo(xB0, deckY(xB0) - 0.12)
      sh.lineTo(xB0 + pl, deckY(xB0 + pl) - 0.12)
      sh.lineTo(xB1, deckY(xB1) - 0.12)
      sh.lineTo(xB1, deckY(xB1) + 0.12)
      sh.lineTo(xB0 + pl * 1.2, deckY(xB0 + pl * 1.2) + wallTop)
      sh.lineTo(xB0, deckY(xB0) + wallTop)
      sh.closePath()
      b.extrude(C, sh, 0.012, new THREE.Matrix4().makeTranslation(0, 0, s > 0 ? zW - 0.012 : -zW), 2)
      for (let i = 0; i <= np; i++) {
        const x = xB0 + 0.02 + i * pl
        const y0 = deckY(x) - 0.12
        const y1 = Math.min(deckY(x) + wallTop, i === np ? deckY(xB1) + 0.12 : 9)
        b.box(C, [0.05, y1 - y0, 0.04], [x, (y0 + y1) / 2, s * (zW + 0.02)])
      }
      b.box(C, [xB1 - xB0, 0.05, 0.05], [(xB0 + xB1) / 2, deckY((xB0 + xB1) / 2) - 0.1, s * (zW + 0.025)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang * 0.75))
      for (const x of [xB0 + 0.2, xB1 - 0.2]) {
        b.box(C, [0.28, 0.02, 0.32], [x, 0.44, s * (zW + 0.2)])
        b.box(C, [0.02, deckY(x) - 0.44, 0.3], [x, (deckY(x) + 0.44) / 2 - 0.06, s * (zW + 0.16)])
      }
    }
    // spring sets between basket brackets and base posts
    for (const x of [xB0 + 0.2, xB1 - 0.2])
      for (const s of [-1, 1])
        for (const dx of [-0.06, 0.06]) {
          const pts: V3[] = []
          for (let i = 0; i <= 96; i++) {
            const a = (i / 96) * Math.PI * 2 * 6
            pts.push([x + dx + Math.cos(a) * 0.045, 0.28 + (i / 96) * 0.15, s * (zW + 0.2) + Math.sin(a) * 0.045])
          }
          b.spline('actuatorRed', pts, 0.008, 6, 160)
        }
    // screen panels: frame, support grid, fine mesh; wedge clamps along the walls; then stacked scalping decks
    const screen = (x0: number, x1: number, y0: number, y1: number) => {
      const len = Math.hypot(x1 - x0, y1 - y0)
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(y1 - y0, x1 - x0))
      const c: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, 0]
      b.with(new THREE.Matrix4().compose(new THREE.Vector3(...c), q, new THREE.Vector3(1, 1, 1)), () => {
        for (const s of [-1, 1]) {
          b.box('galvanised', [len - 0.004, 0.03, 0.03], [0, -0.015, s * (bw / 2 - 0.015)])
          b.box('galvanised', [0.03, 0.03, bw - 0.004], [s * (len / 2 - 0.017), -0.015, 0])
        }
        for (let i = 1; i < 6; i++) b.box('galvanised', [0.008, 0.025, bw - 0.06], [-len / 2 + (len * i) / 6, -0.016, 0])
        for (let i = 1; i < 3; i++) b.box('galvanised', [len - 0.06, 0.025, 0.008], [0, -0.016, -bw / 2 + (bw * i) / 3])
        const g = new THREE.PlaneGeometry(len - 0.04, bw - 0.04)
        const uv = g.getAttribute('uv') as THREE.BufferAttribute
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * 16, uv.getY(i) * bw * 16)
        b.add(meshGuardMaterial('#d4d7d9'), g, new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 0.001, 0))
        for (const s of [-1, 1]) b.box('rubberBlack', [len - 0.02, 0.012, 0.02], [0, 0.006, s * (bw / 2 - 0.01)])
      })
    }
    for (let i = 0; i < np; i++) {
      const x0 = xB0 + 0.02 + i * pl
      const x1 = x0 + pl
      screen(x0, x1, deckY(x0), deckY(x1))
      for (const s of [-1, 1]) b.box('nut', [0.12, 0.06, 0.03], [x0 + pl / 2, deckY(x0 + pl / 2) + 0.04, s * (bw / 2 - 0.02)])
    }
    for (let d = 1; d < nd; d++) {
      const n = Math.max(2, np - d)
      for (let i = 0; i < n; i++) {
        const x0 = xB0 + 0.02 + i * pl
        const x1 = x0 + pl
        screen(x0, x1, deckY(x0) + d * 0.22 + 0.02, deckY(x1) + d * 0.22 + (x1 - x0) * Math.tan(ang * 0.5))
      }
    }
    // discharge lip and cuttings chute
    b.box('stainless', [0.22, 0.008, bw], [xB1 + 0.1, deckY(xB1) - 0.03, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.35))
    // motor beam (inclined for a 45° line of action relative to the deck) and two counter-rotating vibrator motors
    const xm = xB0 + np * pl * 0.48
    const ym = deckY(xm) + wallTop + 0.06
    const qb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -(Math.PI / 4 - ang))
    b.with(new THREE.Matrix4().compose(new THREE.Vector3(xm, ym, 0), qb, new THREE.Vector3(1, 1, 1)), () => {
      b.box(C, [0.36, 0.03, bw + 0.08], [0, 0, 0])
      b.box(C, [0.3, 0.16, 0.012], [0, -0.08, bw / 2 + 0.03])
      b.box(C, [0.3, 0.16, 0.012], [0, -0.08, -bw / 2 - 0.03])
      for (const s of [-1, 1]) {
        const z = s * 0.3
        b.box('motorPaint', [0.3, 0.05, 0.36], [0, 0.04, z])
        b.cyl('motorPaint', 0.13, 0.34, [0, 0.19, z], 'z', 32)
        for (let i = 0; i < 10; i++) b.box('motorPaint', [0.012, 0.03, 0.3], [Math.cos((i / 10) * Math.PI) * 0.135, 0.19 + Math.sin((i / 10) * Math.PI) * 0.135, z])
        for (const e of [-1, 1]) {
          b.cyl('motorPaint', 0.155, 0.1, [0, 0.19, z + e * 0.22], 'z', 32)
          b.cyl('motorPaint', 0.12, 0.02, [0, 0.19, z + e * 0.28], 'z', 32)
          b.around(6, 0.14, [0, 0.19, z + e * 0.27], e > 0 ? 'z' : '-z', (q) => b.hex('nut', 0.018, 0.01, q, e > 0 ? 'z' : '-z'))
        }
        b.rbox('motorPaint', [0.12, 0.06, 0.1], 0.01, [0, 0.34, z])
        for (const dx of [-0.11, 0.11]) for (const dz of [-0.13, 0.13]) b.hex('nut', 0.03, 0.02, [dx, 0.075, z + dz])
      }
    })
    // panel tensioning: jacking bolts along the walls; height-adjust jack at the discharge end
    for (const s of [-1, 1]) {
      b.cyl('stainless', 0.025, 0.14, [xB1 - 0.08, deckY(xB1) - 0.2, s * (zW + 0.04)], 'y', 12)
      b.hex('nut', 0.05, 0.03, [xB1 - 0.08, deckY(xB1) - 0.12, s * (zW + 0.04)])
    }
  })
  const dir = new THREE.Vector3(Math.cos(Math.PI / 4 + ang), Math.sin(Math.PI / 4 + ang), 0)
  return { fixed: k.build(), basket: b.build(), dir: [dir.x, dir.y, 0] as V3 }
}
