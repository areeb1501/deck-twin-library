// Lit windsock: tilting galvanised mast on a gusseted base plate, swivel head with mouth hoop, banded orange/white sock that stiffens with wind speed, floodlights and red obstruction lamp. ICAO Annex 14, CAP 437.
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { Kit, sweepGeometry } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { pipeOD } from '../lib/standards'
import { deg } from './_fg'

export interface WindsockProps {
  /** mast height to the swivel, m */
  height?: number
  /** direction the wind blows FROM, degrees clockwise from north (-Z) */
  windFrom?: number
  /** m/s; the sock is horizontal from about 12 m/s */
  windSpeed?: number
  /** sock length, m */
  length?: number
  lit?: boolean
  /** internal floodlight in the head (CAP 437 style) or two external floodlights on a cross-arm */
  lighting?: 'internal' | 'external'
  /** band colour with white */
  colour?: 'orange' | 'red'
  flutter?: boolean
  tag?: string
}

export const defaults = { height: 4, windFrom: 270, windSpeed: 8, length: 1.2, lit: true, lighting: 'internal' as 'internal' | 'external', colour: 'orange' as 'orange' | 'red', flutter: true, tag: 'WS-01' }

const ORANGE = paint('#ff5a14', { roughness: 0.75, side: THREE.DoubleSide })
const WHITE = paint('#f2f2ee', { roughness: 0.75, side: THREE.DoubleSide })
const RED = paint('#d81e1e', { roughness: 0.75, side: THREE.DoubleSide })
const RED_LAMP = paint('#ff2a1a', { emissive: '#ff2a1a', emissiveIntensity: 1.6, roughness: 0.2 })
const MAST_R = pipeOD(3) / 2
const MOUTH = 0.45 // swivel axis to the mouth hoop, m

class Part extends THREE.Curve<THREE.Vector3> {
  c: THREE.Curve<THREE.Vector3>
  a: number
  b: number
  constructor(c: THREE.Curve<THREE.Vector3>, a: number, b: number) {
    super()
    this.c = c
    this.a = a
    this.b = b
  }
  getPoint(t: number, out = new THREE.Vector3()) {
    return this.c.getPoint(this.a + (this.b - this.a) * t, out)
  }
}

export function Windsock(props: WindsockProps & GroupProps) {
  const { height, windFrom, windSpeed, length, lit, lighting, colour, flutter, tag, ...group } = { ...defaults, ...props }
  const H = Math.max(2, height)
  const mast = useKit((k) => buildMast(k, H, lit, lighting, tag), [H, lit, lighting, tag])
  const sock = useKit((k) => buildSock(k, Math.max(0, windSpeed), Math.max(1, length), lit && lighting === 'internal', colour), [windSpeed, length, lit, lighting, colour])
  const f = deg(windFrom)
  const yaw = Math.atan2(-Math.cos(f), -Math.sin(f)) // turns +X onto the downwind direction
  const inner = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!inner.current) return
    const w = flutter ? (0.03 + 0.012 * windSpeed) * Math.sin(clock.elapsedTime * (2.6 + 0.35 * windSpeed)) : 0
    inner.current.rotation.set(0, w, w * 0.4)
  })
  return (
    <group {...group}>
      <KitMesh data={mast} />
      <group position={[0, H, 0]} rotation-y={yaw}>
        <group ref={inner}>
          <KitMesh data={sock} />
        </group>
      </group>
    </group>
  )
}

export default Windsock

function buildMast(k: Kit, H: number, lit: boolean, lighting: 'internal' | 'external', tag: string) {
  // base plate, anchor bolts, gussets
  const B = 0.4
  k.box('galvanised', [B, 0.02, B], [0, 0.01, 0])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.cyl('galvanised', 0.011, 0.07, [sx * 0.15, 0.045, sz * 0.15], 'y', 8)
      k.hex('nut', 0.036, 0.018, [sx * 0.15, 0.029, sz * 0.15], 'y')
    }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    const sh = new THREE.Shape().moveTo(0, 0).lineTo(0.13, 0).lineTo(0, 0.25).closePath()
    k.extrude('galvanised', sh, 0.01, new THREE.Matrix4().compose(new THREE.Vector3(MAST_R, 0.02, -0.005).applyQuaternion(q), q, new THREE.Vector3(1, 1, 1)))
  }
  // tilting hinge: stub, cheek plates, pivot and locking bolts
  const yh = 0.7
  k.cyl('galvanised', MAST_R, yh - 0.02, [0, 0.02 + (yh - 0.02) / 2, 0], 'y', 24)
  for (const s of [-1, 1]) {
    k.box('galvanised', [0.012, 0.42, 0.16], [s * (MAST_R + 0.006), yh, 0])
    k.cyl('boltXylan', 0.01, 2 * MAST_R + 0.06, [0, yh + s * 0.15, 0], 'x', 8)
    for (const sx of [-1, 1]) k.hex('nut', 0.03, 0.014, [sx * (MAST_R + 0.025), yh + s * 0.15, 0], 'x')
  }
  k.cyl('galvanised', MAST_R, H - yh - 0.08, [0, yh + (H - yh - 0.08) / 2, 0], 'y', 24)
  // swivel bearing housing
  k.cyl('castIron', MAST_R + 0.02, 0.1, [0, H - 0.05, 0], 'y', 24)
  k.cyl('galvanised', MAST_R + 0.03, 0.012, [0, H - 0.1, 0], 'y', 24)
  // floodlights on a cross-arm below the head, aimed up at the sock
  const ya = H - 0.45
  if (lighting === 'external') k.box('galvanised', [1.0, 0.05, 0.05], [0, ya, 0])
  for (const s of lighting === 'external' ? [-1, 1] : []) {
    const x = s * 0.48
    k.box('galvanised', [0.03, 0.08, 0.03], [x, ya + 0.065, 0])
    k.with(new THREE.Matrix4().makeTranslation(x, ya + 0.15, 0).multiply(new THREE.Matrix4().makeRotationZ(-s * 0.5)), () => {
      k.rbox('castIron', [0.16, 0.12, 0.2], 0.015, [0, 0, 0])
      k.box(lit ? 'lampLens' : 'glass', [0.13, 0.004, 0.17], [0, 0.062, 0])
      for (let i = 0; i < 5; i++) k.box('castIron', [0.16, 0.025, 0.004], [0, -0.02, -0.08 + i * 0.04])
    })
  }
  // junction box and conduit
  k.rbox('stainless', [0.16, 0.2, 0.1], 0.01, [0, 1.3, MAST_R + 0.05])
  k.cyl('cable', 0.012, H - 1.6, [0.04, 1.4 + (H - 1.6) / 2, MAST_R + 0.012], 'y', 8)
  tagPlate(k, tag, [0, 1.1, MAST_R + 0.002], 'z', 0.1)
}

/** Head in the swivel frame: +X downwind. Frame, hoop, obstruction lamp and the sock. */
function buildSock(k: Kit, speed: number, L: number, lamp: boolean, colour: 'orange' | 'red') {
  const r0 = 0.3 * Math.min(1.5, Math.max(0.6, L / 2.4))
  k.cyl('galvanised', MAST_R + 0.012, 0.12, [0, 0.06, 0], 'y', 24)
  k.cyl('galvanised', 0.014, 0.4, [0, 0.32, 0], 'y', 10)
  k.dome('castIron', 0.05, [0, 0.52, 0], 'y', Math.PI / 2, 1, 16)
  k.cyl('castIron', 0.05, 0.03, [0, 0.505, 0], 'y', 16)
  k.cyl(RED_LAMP, 0.04, 0.08, [0, 0.6, 0], 'y', 16)
  k.dome(RED_LAMP, 0.04, [0, 0.64, 0], 'y', Math.PI / 2, 0.6, 16)
  const yc = 0.12 + r0
  // frame arms from the swivel to the mouth hoop, hoop in the YZ plane
  for (const [y, z] of [[yc + r0, 0], [yc - r0, 0], [yc, r0], [yc, -r0]] as [number, number][]) k.rod('galvanised', [0.03, y > yc ? 0.3 : 0.08, 0], [MOUTH, y, z], 0.01, 8)
  k.torus('galvanised', r0 + 0.008, 0.012, [MOUTH, yc, 0], 'x', 8, 36)
  k.rod('galvanised', [0, 0.1, 0], [MOUTH, yc, 0], 0.015, 8)
  // internal floodlight on the head spar, shining into the mouth
  k.cyl('castIron', 0.045, 0.1, [MOUTH - 0.1, yc, 0], 'x', 20)
  k.disc(lamp ? 'lampLens' : 'glass', 0.04, [MOUTH - 0.0495, yc, 0], 'x', 20)
  k.rod('galvanised', [MOUTH - 0.1, yc - 0.045, 0], [MOUTH - 0.1, 0.1, 0], 0.01, 8)
  // sock centreline: bends down progressively as the wind drops
  const stiff = Math.min(1, speed / 12)
  const droop = (1 - stiff) * 1.25 + 0.04
  const pts: THREE.Vector3[] = []
  const p = new THREE.Vector3(MOUTH, yc, 0)
  const n = 10
  for (let i = 0; i <= n; i++) {
    pts.push(p.clone())
    const a = droop * Math.pow(i / n, 1.4)
    p.add(new THREE.Vector3(Math.cos(a), -Math.sin(a), 0).multiplyScalar(L / n))
  }
  const c = new THREE.CatmullRomCurve3(pts)
  const bands = L <= 1.5 ? 3 : 5 // short helideck socks are colour/white/colour
  for (let i = 0; i < bands; i++) {
    const a = i / bands
    const b = (i + 1) / bands
    const rad = (t: number): [number, number] => {
      const r = r0 * (1 - 0.5 * (a + (b - a) * t)) * (1 - (1 - stiff) * 0.25 * (a + (b - a) * t))
      return [r, r]
    }
    k.add(i % 2 ? WHITE : colour === 'red' ? RED : ORANGE, sweepGeometry(new Part(c, a, b), rad, 8, 24))
  }
  // stitched seam rings at band joints
  for (let i = 1; i < bands; i++) {
    const t = i / bands
    const q = c.getPoint(t)
    const d = c.getTangent(t)
    k.torus('castIron', r0 * (1 - 0.5 * t) * (1 - (1 - stiff) * 0.25 * t), 0.004, [q.x, q.y, q.z], [d.x, d.y, d.z], 4, 28)
  }
}
