// Emergency telephone: Ex d industrial telephone (handset on hook, armoured cord, keypad, emergency button) in a GRP acoustic hood on a stanchion or wall, or a floor-standing acoustic booth, with a call beacon and ISO 7010 E004 sign. IEC 60079-1, ISO 7010, EN 54-23.
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit, mat4, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { POLE_R, cable, canvasMat, poleStanchion, polePlate, stopPlug, wallPlate } from './_fg'
import { GRP_INNER, phonePictogram, safetySign, shell } from './_detectors'

export type HoodColour = 'yellow' | 'red' | 'orange'

export interface EmergencyTelephoneProps {
  /** hood: acoustic hood on a stanchion or wall; booth: walk-in acoustic booth; none: telephone only */
  enclosure?: 'hood' | 'booth' | 'none'
  /** hood and telephone-only: stanchion or wall */
  mount?: 'pole' | 'wall'
  colour?: HoodColour
  /** handset centre above the deck, m */
  height?: number
  beacon?: boolean
  /** beacon flashing (incoming call) */
  ringing?: boolean
  sign?: boolean
  tag?: string
}

export const defaults = { enclosure: 'hood' as 'hood' | 'booth' | 'none', mount: 'pole' as 'pole' | 'wall', colour: 'yellow' as HoodColour, height: 1.5, beacon: true, ringing: true, sign: true, tag: 'TEL-0201' }

const HOOD: Record<HoodColour, string> = { yellow: '#e5b114', red: '#b3221b', orange: '#e8641c' }
const BODY: MatKey = paint('#5d6670', { metalness: 0.35, roughness: 0.45, clearcoat: 0.3 })
const FOAM: MatKey = paint('#3a3d40', { metalness: 0, roughness: 1, weather: 0 })
const KEY: MatKey = paint('#d8d8d2', { metalness: 0.1, roughness: 0.5 })
// hood overall (typical GRP acoustic hood): 0.79 W × 0.74 H × 0.56 D
const HW = 0.79
const HH = 0.74
const HD = 0.56

export function EmergencyTelephone(props: EmergencyTelephoneProps & GroupProps) {
  const { enclosure, mount, colour, height, beacon, ringing, sign, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(1, height)
  const data = useKit((k) => build(k, enclosure, mount, colour, h, beacon, sign, tag), [enclosure, mount, colour, h, beacon, sign, tag])
  const lensMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff3020', emissive: '#ff2a1a', emissiveIntensity: 0, roughness: 0.15, transparent: true, opacity: 0.88 }), [])
  useEffect(() => () => lensMat.dispose(), [lensMat])
  const lens = useKit((k) => {
    if (!beacon) return
    const p = beaconAt(enclosure, mount, h)
    k.cyl(lensMat, 0.04, 0.08, [p[0], p[1] + 0.04, p[2]], 'y', 24)
    k.dome(lensMat, 0.04, [p[0], p[1] + 0.08, p[2]], 'y', Math.PI / 2, 0.5, 20)
  }, [lensMat, enclosure, mount, h, beacon])
  useFrame(({ clock }) => {
    lensMat.emissiveIntensity = ringing ? ((clock.elapsedTime * 1.5) % 1 < 0.25 ? 2.2 : 0.1) : 0.05
  })
  return (
    <group {...group}>
      <KitMesh data={data} />
      <KitMesh data={lens} shadows={false} />
    </group>
  )
}

export default EmergencyTelephone

/** Lens base position for each enclosure. */
function beaconAt(enclosure: 'hood' | 'booth' | 'none', mount: 'pole' | 'wall', h: number): V3 {
  const zf = mount === 'pole' ? POLE_R + 0.01 : 0.008
  if (enclosure === 'booth') return [0, 2.32 + 0.07, 0.45]
  if (enclosure === 'hood') return [0.26, h + 0.32 + 0.07 + 0.01, zf + 0.3]
  return [0, h + 0.27 + 0.07, zf + 0.06]
}

function keyMat() {
  return canvasMat('tel-keys', 192, 256, (g) => {
    g.fillStyle = '#2a2f35'
    g.fillRect(0, 0, 192, 256)
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']
    keys.forEach((t, i) => {
      const x = 22 + (i % 3) * 56
      const y = 18 + Math.floor(i / 3) * 60
      g.fillStyle = '#d8d8d2'
      g.beginPath()
      g.roundRect(x, y, 44, 46, 8)
      g.fill()
      g.fillStyle = '#1a1d20'
      g.font = 'bold 28px Arial, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(t, x + 22, y + 24)
    })
  })
}

/** Ex d telephone, back on z = 0, handset centre at the origin. Returns the gland tail. */
function telephone(k: Kit): V3 {
  const W = 0.28
  const H = 0.36
  const D = 0.12
  const yc = -0.05
  k.rbox(BODY, [W, H, D * 0.75], 0.014, [0, yc, D * 0.375])
  k.rbox(BODY, [W + 0.016, H + 0.016, 0.014], 0.006, [0, yc, D * 0.75 + 0.007])
  k.rbox(BODY, [W - 0.01, H - 0.01, D * 0.2], 0.012, [0, yc, D * 0.86])
  for (const sx of [-1, 1]) for (const sy of [-1, 0, 1]) k.cyl('stainless', 0.006, 0.006, [sx * (W / 2 + 0.002), yc + sy * (H / 2 - 0.02), D * 0.76 + 0.009], 'z', 8)
  const zF = D * 0.96
  // handset cradle (hook) on the upper face, handset with ear and mouth cups
  k.box(BODY, [0.07, 0.24, 0.03], [-0.07, 0.04, zF + 0.015])
  k.box('stainless', [0.012, 0.02, 0.02], [-0.07, 0.165, zF + 0.025])
  const zh = zF + 0.05
  k.rbox('rubberBlack', [0.05, 0.2, 0.032], 0.012, [-0.07, 0.04, zh])
  for (const s of [-1, 1]) {
    k.cyl('rubberBlack', 0.033, 0.03, [-0.07, 0.04 + s * 0.1, zh - 0.004], 'z', 24)
    k.disc('castIron', 0.024, [-0.07, 0.04 + s * 0.1, zh + 0.0115], 'z', 20)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      k.disc('pipeBore', 0.003, [-0.07 + Math.cos(a) * 0.012, 0.04 + s * 0.1 + Math.sin(a) * 0.012, zh + 0.0118], 'z', 6)
    }
  }
  // armoured stainless cord looping down to its gland
  const pts: V3[] = []
  for (let i = 0; i <= 40; i++) {
    const t = i / 40
    pts.push([-0.12 - Math.sin(t * Math.PI) * 0.03 + Math.cos(t * 60) * 0.006, -0.06 - t * 0.12, zh - 0.01 + Math.sin(t * 60) * 0.006 - t * 0.02])
  }
  k.spline('tubing', [[-0.07, -0.06, zh - 0.01], ...pts, [-0.11, -0.19, zF - 0.01]], 0.0035, 6, 160)
  k.hex('stainless', 0.02, 0.012, [-0.11, -0.2, zF - 0.01], 'z')
  // keypad, emergency button, volume, ringer grille
  k.add(keyMat(), new THREE.PlaneGeometry(0.09, 0.12), mat4([0.06, 0.03, zF + 0.0005]))
  k.cyl('actuatorRed', 0.02, 0.012, [0.06, -0.08, zF + 0.006], 'z', 24)
  k.torus(KEY, 0.022, 0.003, [0.06, -0.08, zF + 0.002], 'z', 6, 24)
  for (let i = 0; i < 5; i++) k.box('pipeBore', [0.08, 0.004, 0.002], [0.06, 0.13 - i * 0.009 + 0.0, zF + 0.0005])
  k.box('nameplate', [0.08, 0.025, 0.002], [0.06, -0.16, zF + 0.001])
  // cable entries under
  k.hex('brass', 0.03, 0.016, [0.07, yc - H / 2 - 0.008, D * 0.4], 'y')
  stopPlug(k, [-0.07, yc - H / 2 - 0.004, D * 0.4], '-y')
  return [0.07, yc - H / 2 - 0.03, D * 0.4]
}

/** Beacon base, guard and cap at p (lens is a separate mesh). */
function beaconBase(k: Kit, p: V3) {
  const [x, y, z] = p
  k.cyl('actuatorRed', 0.05, 0.06, [x, y + 0.03 - 0.07, z], 'y', 24)
  k.cyl('actuatorRed', 0.054, 0.012, [x, y + 0.066 - 0.07, z], 'y', 24)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    k.rod('stainless', [x + Math.cos(a) * 0.046, y, z + Math.sin(a) * 0.046], [x + Math.cos(a) * 0.046, y + 0.11, z + Math.sin(a) * 0.046], 0.003, 6)
  }
  k.torus('stainless', 0.046, 0.003, [x, y + 0.11, z], 'y', 6, 24)
  k.cyl('stainless', 0.01, 0.01, [x, y + 0.115, z], 'y', 10)
}

/** GRP acoustic hood, back on z = 0, bottom edge at y = 0: back, tapered sides, top, front lip, foam lining; open front and bottom. */
function hood(k: Kit, mat: MatKey) {
  const t = 0.006
  const d0 = 0.32
  k.box(mat, [HW, HH, t], [0, HH / 2, t / 2])
  k.box(mat, [HW, t, HD], [0, HH - t / 2, HD / 2])
  k.box(mat, [HW, 0.06, t], [0, HH - 0.03, HD - t / 2])
  const sh = new THREE.Shape().moveTo(0, 0).lineTo(d0, 0).lineTo(HD, HH * 0.62).lineTo(HD, HH).lineTo(0, HH).closePath()
  for (const s of [-1, 1]) {
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(s * (HW / 2) + (s < 0 ? t : 0), 0, 0)
    k.extrude(mat, sh, t, m)
    // rolled front edge on the side panels
    k.rod(mat, [s * (HW / 2 - t / 2), 0, d0], [s * (HW / 2 - t / 2), HH * 0.62, HD], 0.008, 8)
  }
  // foam lining on the back and top
  k.box(FOAM, [HW - 0.04, HH - 0.06, 0.03], [0, HH / 2 - 0.01, t + 0.015])
  k.box(FOAM, [HW - 0.04, 0.03, HD - 0.08], [0, HH - t - 0.015, (HD - 0.08) / 2 + t + 0.03])
}

function build(k: Kit, enclosure: 'hood' | 'booth' | 'none', mount: 'pole' | 'wall', colour: HoodColour, h: number, beacon: boolean, sign: boolean, tag: string) {
  const grp = paint(HOOD[colour] ?? HOOD.yellow, { metalness: 0.05, roughness: 0.42, clearcoat: 0.45 })
  const signMat = () => safetySign('E004', '#237f52', ['EMERGENCY', 'TELEPHONE'], phonePictogram)
  if (enclosure === 'booth') {
    const W = 1.0
    const H = 2.3
    const D = 0.9
    // plinth, booth shell open at the front, roof overhang, inner light, telephone on the back wall
    k.box('galvanised', [W + 0.04, 0.08, D + 0.04], [0, 0.04, D / 2])
    k.at([0, 0.08, 0], undefined, () => shell(k, grp, W, H - 0.08, D, 0.012, 0, GRP_INNER))
    k.box(grp, [W + 0.1, 0.05, D + 0.12], [0, H + 0.025, D / 2 + 0.02])
    k.box(FOAM, [W - 0.06, 1.0, 0.03], [0, 1.6, 0.027])
    k.box('lampLens', [0.3, 0.02, 0.08], [0, H - 0.03, 0.4])
    let g: V3 = [0, 0, 0]
    k.at([0, h, 0.042], undefined, () => (g = telephone(k)))
    cable(k, [[g[0], g[1] + h, g[2] + 0.042], [g[0], 0.4, 0.06], [g[0], 0.1, 0.03]], 0.0065)
    if (beacon) beaconBase(k, beaconAt('booth', mount, h))
    // fascia over the opening carrying the sign and tag
    k.box(grp, [W - 0.024, 0.36, 0.012], [0, H - 0.18, D - 0.006])
    if (sign) {
      k.box('stainless', [0.56, 0.28, 0.004], [-0.08, H - 0.18, D + 0.002])
      k.plane(signMat(), 0.55, 0.27, [-0.08, H - 0.18, D + 0.0045])
    }
    tagPlate(k, tag, [0.36, H - 0.18, D + 0.001], 'z', 0.1)
    return
  }
  // stanchion or wall plate; hood bottom 0.42 m below the handset
  const yb = h - 0.42
  const hooded = enclosure === 'hood'
  let zf: number
  if (mount === 'pole') {
    poleStanchion(k, hooded ? yb + HH - 0.02 : h + 0.32)
    zf = hooded ? polePlate(k, yb + HH / 2, 0.3, HH - 0.06) : polePlate(k, h + 0.02, 0.3, 0.6)
  } else zf = hooded ? wallPlate(k, yb + HH / 2, 0.36, HH - 0.06) : wallPlate(k, h + 0.02, 0.36, 0.6)
  const zt = enclosure === 'hood' ? zf + 0.04 : zf
  if (enclosure === 'hood') {
    k.at([0, yb, zf], undefined, () => hood(k, grp))
    // hood fixings through the back, telephone on a spacer frame in the hood
    for (const sx of [-1, 1]) for (const yy of [0.2, HH - 0.12]) k.hex('nut', 0.018, 0.008, [sx * 0.11, yb + yy, zf + 0.04], 'z')
    k.box('stainless', [0.3, 0.42, 0.034], [0, h - 0.05, zf + 0.023])
    if (beacon) {
      const p = beaconAt('hood', mount, h)
      k.box('stainless', [0.12, 0.01, 0.12], [p[0], p[1] - 0.075, p[2]])
      beaconBase(k, p)
    }
    if (sign) {
      // sign on two angle feet bolted to the hood roof
      const ys = yb + HH + 0.16
      const zs = zf + 0.08
      k.box('stainless', [0.5, 0.25, 0.004], [-0.08, ys, zs])
      k.plane(signMat(), 0.49, 0.245, [-0.08, ys, zs + 0.0025])
      for (const sx of [-0.25, 0.09]) {
        k.box('stainless', [0.03, 0.06, 0.004], [sx, yb + HH + 0.03, zs - 0.004])
        k.box('stainless', [0.03, 0.004, 0.05], [sx, yb + HH + 0.002, zs - 0.027])
        k.hex('nut', 0.012, 0.005, [sx, yb + HH + 0.006, zs - 0.035], 'y')
      }
    }
  } else if (beacon) {
    const p = beaconAt('none', mount, h)
    k.box('stainless', [0.12, 0.01, 0.12], [0, p[1] - 0.075, p[2]])
    k.box('stainless', [0.12, 0.08, 0.008], [0, p[1] - 0.11, zf + 0.004])
    beaconBase(k, p)
  }
  let g: V3 = [0, 0, 0]
  k.at([0, h, zt], undefined, () => (g = telephone(k)))
  const gp: V3 = [g[0], g[1] + h, g[2] + zt]
  const xc = mount === 'pole' ? -(POLE_R + 0.007) : 0.2
  const zc = mount === 'pole' ? 0 : 0.015
  cable(k, [gp, [gp[0], gp[1] - 0.06, gp[2]], [xc * 0.5 + 0.03, gp[1] - 0.25, (gp[2] + zc) / 2], [xc, gp[1] - 0.45, zc], [xc, 0.2, zc], [xc + (mount === 'pole' ? -0.2 : 0), 0.03, zc + (mount === 'pole' ? 0 : 0.2)]])
  const ty = enclosure === 'hood' ? Math.max(0.3, yb - 0.25) : Math.max(0.3, h - 0.55)
  if (mount === 'pole') tagPlate(k, tag, [0, ty, polePlate(k, ty, 0.13, 0.11) + 0.001], 'z', 0.1)
  else tagPlate(k, tag, [-0.2, ty, 0.009], 'z', 0.1)
}
