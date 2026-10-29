// Ex d hazardous-area CCTV camera, fixed or PTZ, 316L stainless with sunshield and wiper, on a pole or wall bracket with an Ex e junction box. IEC 60079-1, ATEX / IECEx.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, type Built } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { junctionBox, tagPlate } from '../lib/parts'
import { labelMaterial } from './_textures'

export interface CctvCameraProps {
  kind?: 'fixed' | 'ptz'
  mount?: 'pole' | 'wall'
  /** camera base above the deck, m (pole height, or bracket height on the wall plane z = 0) */
  height?: number
  /** pan about the vertical, degrees (0 looks along +Z) */
  pan?: number
  /** tilt, degrees (negative looks down) */
  tilt?: number
  wiper?: boolean
  junctionBox?: boolean
  tag?: string
}

export const defaults = {
  kind: 'ptz' as 'fixed' | 'ptz',
  mount: 'pole' as 'pole' | 'wall',
  height: 3.5,
  pan: 25,
  tilt: -12,
  wiper: true,
  junctionBox: true,
  tag: 'CCTV-01',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function CctvCamera(props: CctvCameraProps & GroupProps) {
  const { kind, mount, height, pan, tilt, wiper, junctionBox: jb, tag, ...group } = { ...defaults, ...props }
  const b = useMemo(() => build({ kind, mount, height, wiper, junctionBox: jb, tag }), [kind, mount, height, wiper, jb, tag])
  useEffect(() => () => [b.base, b.yoke, b.head].forEach((x) => x.geometry.dispose()), [b])
  return (
    <group {...group}>
      <KitMesh data={b.base} />
      <group position={b.panAt} rotation={[0, (pan * Math.PI) / 180, 0]}>
        <KitMesh data={b.yoke} />
        <group position={b.tiltAt} rotation={[(-clamp(tilt, -90, 40) * Math.PI) / 180, 0, 0]}>
          <KitMesh data={b.head} />
        </group>
      </group>
    </group>
  )
}

export default CctvCamera

const steel = () => paint('#c6cacd', { metalness: 0.88, roughness: 0.22, clearcoat: 0, weather: 0.3 }) // 316L electropolished
const shield = () => paint('#d8dbdd', { metalness: 0.8, roughness: 0.3, clearcoat: 0, weather: 0.3, side: THREE.DoubleSide })

/** Camera head along +Z, optical axis on the origin: flameproof barrel, bolted window flange, sunshield, wiper, rear gland. */
function head(R: number, L: number, wiper: boolean, tag: string): Built {
  const k = new Kit()
  const S = steel()
  const z0 = -L * 0.45
  const z1 = L * 0.55
  k.cyl(S, R, L - 0.06, [0, 0, (z0 + z1) / 2], 'z', 32)
  // front and rear flameproof flanges with socket-head bolts
  for (const [z, s] of [[z1 - 0.02, 1], [z0 + 0.015, -1]] as const) {
    k.cyl(S, R + 0.014, 0.03, [0, 0, z], 'z', 32)
    k.around(8, R + 0.006, [0, 0, z + s * 0.016], 'z', (p) => k.cyl('nut', 0.005, 0.006, p, 'z', 8), Math.PI / 8)
  }
  k.disc('rubberBlack', R * 0.8, [0, 0, z1 - 0.004], 'z', 28)
  k.disc('glass', R * 0.78, [0, 0, z1 - 0.003], 'z', 28)
  k.disc(paint('#0d1012', { metalness: 0.2, roughness: 0.1, weather: 0 }), R * 0.35, [0, 0, z1 - 0.012], 'z', 24)
  // rear cable gland and armoured cable
  k.cyl('brass', 0.016, 0.05, [0, -R * 0.4, z0 - 0.02], 'z', 12)
  k.spline('cable', [[0, -R * 0.4, z0 - 0.045], [0, -R * 0.6, z0 - 0.11], [0, -R - 0.08, z0 - 0.12]], 0.008, 6, 16)
  // sunshield on standoffs
  const sh = new THREE.CylinderGeometry(R + 0.04, R + 0.04, L + 0.08, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84)
  k.add(shield(), sh, new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 0, (z0 + z1) / 2 + 0.03)))
  for (const z of [z0 + 0.08, z1 - 0.08]) k.box(S, [0.02, 0.04, 0.02], [0, R + 0.02, z])
  // wiper motor bump and blade
  if (wiper) {
    k.rbox(S, [0.05, 0.035, 0.05], 0.01, [0, R + 0.012, z1 - 0.03])
    k.box('rubberBlack', [0.008, R * 1.5, 0.008], [R * 0.15, R * 0.15, z1 + 0.006], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5))
  }
  // Ex marking and tag
  k.plane(labelMaterial('Ex db IIC T6 Gb', '#c8ccd0', '#111111', 512, 96), 0.1, 0.019, [R + 0.0005, 0, (z0 + z1) / 2 - 0.04], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
  tagPlate(k, tag, [-R - 0.001, 0, (z0 + z1) / 2 - 0.03], '-x', 0.08)
  return k.build()
}

function build(p: { kind: 'fixed' | 'ptz'; mount: 'pole' | 'wall'; height: number; wiper: boolean; junctionBox: boolean; tag: string }) {
  const base = new Kit()
  const yoke = new Kit()
  const S = steel()
  const galv = 'galvanised' as const
  const H = clamp(p.height, 1.5, 12)
  const ptz = p.kind === 'ptz'
  const R = ptz ? 0.07 : 0.062
  const L = ptz ? 0.36 : 0.42
  // mounting: pole with base plate and anchors, or a wall plate with a projecting arm
  let top: [number, number, number]
  if (p.mount === 'pole') {
    base.box(galv, [0.3, 0.02, 0.3], [0, 0.01, 0])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      base.cyl(galv, 0.01, 0.06, [sx * 0.11, 0.03, sz * 0.11], 'y', 8)
      base.hex('nut', 0.03, 0.015, [sx * 0.11, 0.028, sz * 0.11])
    }
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4
      base.box(galv, [0.008, 0.12, 0.06], [Math.cos(a) * 0.08, 0.08, Math.sin(a) * 0.08], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a))
    }
    base.cyl(galv, 0.057, H - 0.03, [0, 0.02 + (H - 0.03) / 2, 0], 'y', 24)
    base.cyl(galv, 0.1, 0.012, [0, H - 0.004, 0], 'y', 24)
    top = [0, H + 0.002, 0]
    if (p.junctionBox) {
      junctionBox(base, [0, 1.25, 0.06], 'z', [0.2, 0.25, 0.12], S)
      for (const y of [1.0, 1.15]) base.box(S, [0.14, 0.03, 0.01], [0, y + 0.2, 0.06])
      base.spline('cable', [[0.0, 1.25 + 0.145, 0.13], [0.0, 1.5, 0.08], [0.0, 2.0, 0.065], [0.0, H - 0.1, 0.065]], 0.008, 6, 30)
      for (let y = 1.7; y < H - 0.1; y += 0.5) base.torus(S, 0.062, 0.004, [0, y, 0], 'y', 6, 24)
    }
  } else {
    // wall plane at z = 0
    base.box(S, [0.2, 0.26, 0.012], [0, H - 0.05, 0.006])
    base.around(4, 0.1, [0, H - 0.05, 0.014], 'z', (q) => base.hex('nut', 0.016, 0.008, q, 'z'), Math.PI / 4)
    base.box(S, [0.06, 0.06, 0.36], [0, H + 0.02, 0.19])
    base.add(S, new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0, -0.2)]), { depth: 0.008, bevelEnabled: false }), new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(-0.004, H - 0.01, 0.012))
    base.box(S, [0.14, 0.012, 0.14], [0, H + 0.056, 0.32])
    top = [0, H + 0.062, 0.32]
    if (p.junctionBox) {
      junctionBox(base, [0, H - 0.6, 0], 'z', [0.2, 0.25, 0.12], S)
      base.spline('cable', [[0, H - 0.6 + 0.145, 0.06], [0, H - 0.3, 0.05], [0, H - 0.05, 0.08], [0, H + 0.0, 0.2], [0, H + 0.06, 0.3]], 0.008, 6, 24)
    }
  }
  base.add(S, new THREE.CylinderGeometry(0.06, 0.07, 0.03, 24), new THREE.Matrix4().makeTranslation(top[0], top[1] + 0.015, top[2]))
  const panAt: [number, number, number] = [top[0], top[1] + 0.03, top[2]]
  let tiltAt: [number, number, number]
  if (ptz) {
    // pan drive housing, U-yoke, tilt drive on the right arm
    yoke.cyl(S, 0.085, 0.12, [0, 0.06, 0], 'y', 32)
    yoke.cyl(S, 0.09, 0.012, [0, 0.126, 0], 'y', 32)
    const ay = 0.13 + R + 0.06
    for (const s of [-1, 1]) yoke.rbox(S, [0.035, ay + 0.03, 0.09], 0.012, [s * (R + 0.04), 0.13 + (ay + 0.03) / 2 - 0.015, 0])
    yoke.box(S, [2 * (R + 0.04) + 0.035, 0.02, 0.09], [0, 0.14, 0])
    yoke.cyl(S, 0.045, 0.06, [R + 0.09, ay, 0], 'x', 24)
    yoke.around(6, 0.035, [R + 0.121, ay, 0], 'x', (q) => yoke.cyl('nut', 0.004, 0.004, q, 'x', 6))
    tiltAt = [0, ay, 0]
  } else {
    // fixed: adjustable knuckle bracket
    yoke.cyl(S, 0.03, 0.08, [0, 0.04, 0], 'y', 16)
    yoke.box(S, [0.06, 0.03, 0.12], [0, 0.09, 0])
    tiltAt = [0, 0.1 + R + 0.01, 0]
    yoke.box(S, [0.02, R + 0.03, 0.08], [0.04, 0.09 + (R + 0.03) / 2, 0])
  }
  const h = head(R, L, p.wiper, p.tag)
  return { base: base.build(), yoke: yoke.build(), head: h, panAt, tiltAt }
}
