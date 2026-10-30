/**
 * Crew-change / cargo helicopter (medium twin, AW139 class): low-poly, merged per material, never pickable.
 * WORLD coordinates. Lofted fuselage with cockpit glazing, cabin windows, sponsons and wheels, engine cowling,
 * tail boom, fin, stabiliser; a five-blade main rotor and a four-blade tail rotor that spin in useFrame (blades
 * blur into a disc at flight rpm).
 *
 * Motion follows the helicopter leg of the spares logistics (sim/spares.ts `useSpares.getState().heli`):
 *   idle      → hidden (finishes a departure first if one is on screen)
 *   inbound   → cruise descent from the south, approach from the south-east (clear of the LQ telecom tower),
 *               flare, hover and touchdown on the LQ helideck (model/site.ts LQ.helideck)
 *   landed    → on deck, rotors running down to ground idle (quick turnaround)
 *   outbound  → spool up, lift to the hover, pedal turn, transition and climb-out to the south
 * As the supply vessel, a display timeline chases the leg forward only (≥ ~16 s for an approach even at 60×),
 * so a fast clock never makes it pop. Mount next to the vessel in Surroundings.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Batches, bar, box, boxMinMax, tube, type V3 } from '../structure/batch'
import { envMat, envTime, noRaycast } from './envShared'
import { LQ } from '../../model/site'
import { LQ_HELI_Y } from './lqQuarters'
import { useSpares } from '../../sim/spares'
import type { LogisticsLeg } from '../../sim/assetTypes'
import { chaseTimeline, legProgress, simNowSmooth } from './logisticsMotion'

type K = 'white' | 'blue' | 'glass' | 'dark' | 'grey' | 'red' | 'green' | 'beacon'

// ================================================================= model (local: +x nose, +y up from the wheels, +z starboard)
/** x, half-width, bottom, top */
const STATIONS: [number, number, number, number][] = [
  [5.7, 0.12, 1.05, 1.3],
  [5.3, 0.45, 0.85, 1.7],
  [4.7, 0.75, 0.72, 2.05],
  [3.9, 0.95, 0.65, 2.32],
  [3.0, 1.05, 0.62, 2.45],
  [2.0, 1.1, 0.6, 2.5],
  [0, 1.1, 0.6, 2.5],
  [-2.0, 1.05, 0.65, 2.45],
  [-2.8, 0.9, 0.9, 2.4],
  [-3.5, 0.6, 1.4, 2.5],
  [-4.4, 0.38, 2.02, 2.72],
  [-6.5, 0.3, 2.14, 2.74],
  [-8.6, 0.24, 2.26, 2.76],
  [-9.9, 0.16, 2.4, 2.78],
]
const RING = 16
const N_SE = 2.6 // super-ellipse exponent (boxy-round section)
const se = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 2 / N_SE)

function fuselage(B: Batches<K>) {
  // one ring per station; each quad's material from where it sits: cockpit glazing, blue belly band, white
  const P = STATIONS.map(([x, w, yb, yt]) => {
    const yc = (yb + yt) / 2
    const hh = (yt - yb) / 2
    const out: V3[] = []
    for (let i = 0; i <= RING; i++) {
      const a = (i / RING) * Math.PI * 2
      out.push([x, yc + hh * se(Math.sin(a)), w * se(Math.cos(a))])
    }
    return out
  })
  const matOf = (x: number, j: number): K => {
    const a = ((j + 0.5) / RING) * Math.PI * 2
    const s = Math.sin(a)
    if (x > 3.0 && x < 5.4 && s > 0.15 && Math.abs(Math.cos(a)) < 0.92) return 'glass'
    if (x > -3 && s < -0.35) return 'blue'
    return 'white'
  }
  const per = new Map<K, { pos: number[]; idx: number[] }>()
  for (let i = 0; i < P.length - 1; i++)
    for (let j = 0; j < RING; j++) {
      const k = matOf((P[i][0][0] + P[i + 1][0][0]) / 2, j)
      let g = per.get(k)
      if (!g) per.set(k, (g = { pos: [], idx: [] }))
      const n = g.pos.length / 3
      // stations run nose → tail (−x); ring angle runs +z → +y → −z → −y, so (i, j) (i+1, j) (i+1, j+1) faces outward
      g.pos.push(...P[i][j], ...P[i + 1][j], ...P[i + 1][j + 1], ...P[i][j + 1])
      g.idx.push(n, n + 2, n + 1, n, n + 3, n + 2)
    }
  for (const [k, g] of per) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3))
    geo.setIndex(g.idx)
    geo.computeVertexNormals()
    B.get(k).add(geo, new THREE.Matrix4())
    geo.dispose()
  }
  // nose cap and tail cap
  for (const [i, k] of [[0, 'white'], [STATIONS.length - 1, 'white']] as [number, K][]) {
    const [x, w, yb, yt] = STATIONS[i]
    box(B.get(k), [x, (yb + yt) / 2, 0], [0.06, yt - yb, w * 2])
  }
}

function details(B: Batches<K>) {
  const W = B.get('white')
  const D = B.get('dark')
  // cabin windows (both sides) and the sliding door outline
  for (const s of [1, -1]) {
    for (const x0 of [-1.9, -0.6, 0.7, 2.0]) boxMinMax(B.get('glass'), [x0, 1.45, s > 0 ? 1.06 : -1.1], [x0 + 0.95, 1.95, s > 0 ? 1.1 : -1.06])
    boxMinMax(D, [-0.75, 0.75, s > 0 ? 1.1 : -1.12], [-0.7, 2.3, s > 0 ? 1.12 : -1.1])
    // sponson with the main wheel under it
    boxMinMax(B.get('blue'), [-1.7, 0.55, s > 0 ? 1.0 : -1.7], [0.6, 1.25, s > 0 ? 1.7 : -1.0])
    tube(D, [-0.9, 0.31, s * 1.22], [-0.9, 0.31, s * 1.62], 0.31, 14, false)
    tube(B.get('grey'), [-0.9, 0.31, s * 1.2], [-0.9, 0.31, s * 1.64], 0.14, 10, false)
    // horizontal stabiliser
    boxMinMax(W, [-8.6, 2.48, s > 0 ? 0.2 : -1.7], [-7.9, 2.58, s > 0 ? 1.7 : -0.2])
    // nav lights (green starboard, red port) on the stabiliser tips
    box(B.get(s > 0 ? 'green' : 'red'), [-8.25, 2.6, s * 1.72], [0.12, 0.1, 0.08])
  }
  // nose wheel
  tube(D, [3.6, 0.22, -0.12], [3.6, 0.22, 0.12], 0.22, 12, false)
  tube(B.get('grey'), [3.6, 0.22, 0], [3.5, 0.7, 0], 0.05, 6, false)
  // engine cowling, intakes, exhausts
  boxMinMax(W, [-2.4, 2.4, -0.75], [1.6, 3.12, 0.75])
  boxMinMax(W, [-2.1, 3.12, -0.55], [1.2, 3.25, 0.55])
  for (const s of [1, -1]) {
    boxMinMax(D, [1.0, 2.6, s > 0 ? 0.74 : -0.78], [1.55, 3.0, s > 0 ? 0.78 : -0.74])
    tube(D, [-2.2, 2.85, s * 0.55], [-2.75, 2.95, s * 0.75], 0.17, 10, false)
  }
  // mast and hub
  tube(B.get('grey'), [0.35, 3.1, 0], [0.35, 3.85, 0], 0.16, 10, false)
  tube(D, [0.35, 3.82, 0], [0.35, 4.08, 0], 0.42, 14, false)
  // fin (swept) with the tail-rotor gearbox, tail skid
  bar(B.get('blue'), [-9.45, 2.55, 0], [-10.15, 4.25, 0], 0.14, 0.95, [1, 0, 0])
  tube(D, [-9.95, 3.35, 0.05], [-9.95, 3.35, 0.3], 0.13, 10, false)
  tube(B.get('grey'), [-9.6, 2.4, 0], [-9.75, 1.95, 0], 0.035, 6, false)
  // antennas, beacon
  tube(D, [-3.6, 2.6, 0], [-3.9, 3.05, 0], 0.03, 4, false)
  box(B.get('beacon'), [-1.4, 3.32, 0], [0.18, 0.12, 0.18])
  box(B.get('beacon'), [-0.6, 0.55, 0], [0.18, 0.1, 0.18])
}

const R_MAIN = 6.9
const HUB_Y = 3.98
function mainRotor() {
  const B = new Batches<'blade'>()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const m = new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation((R_MAIN + 0.4) / 2, 0, 0)).multiply(new THREE.Matrix4().makeScale(R_MAIN - 0.4, 0.06, 0.55))
    B.get('blade').add(new THREE.BoxGeometry(1, 1, 1), m)
  }
  return B.buildAll()[0].geometry
}
function tailRotor() {
  const B = new Batches<'blade'>()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const m = new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeTranslation(0.7, 0, 0)).multiply(new THREE.Matrix4().makeScale(1.3, 0.2, 0.04))
    B.get('blade').add(new THREE.BoxGeometry(1, 1, 1), m)
  }
  return B.buildAll()[0].geometry
}

// ================================================================= flight path
const D: V3 = [LQ.helideck.x, LQ_HELI_Y + 0.02, LQ.helideck.z]
const FAR: V3 = [-700, 420, 3900]
const APP = { x: 90, y: 30, z: 165 } // approach gate offset from the deck (south-east, clear of the telecom tower)
const G: V3 = [D[0] + APP.x, D[1] + APP.y, D[2] + APP.z]
const H_APP = Math.atan2(APP.z, -APP.x) // nose towards the deck
const DEP: [number, number] = [0.45, 0.89] // departure direction (plan), south-east, away from the tower
const H_DEP = Math.atan2(-DEP[1], DEP[0])
const T_DEP: V3 = [D[0] + DEP[0] * 130, D[1] + 50, D[2] + DEP[1] * 130]
const IN: V3[] = [FAR, [-250, 380, 2400], [250, 160, 700], G]
const OUT: V3[] = [T_DEP, [200, 250, 900], [-300, 400, 2600], FAR]
const HIDE_BEYOND = 3800

const bez3 = (p: V3[], u: number): V3 => {
  const v = 1 - u
  const a = v * v * v
  const b = 3 * v * v * u
  const c = 3 * v * u * u
  const d = u * u * u
  return [0, 1, 2].map((i) => a * p[0][i] + b * p[1][i] + c * p[2][i] + d * p[3][i]) as V3
}
const headingOf = (p: V3[], u: number) => {
  const a = bez3(p, Math.max(0, u - 0.003))
  const b = bez3(p, Math.min(1, u + 0.003))
  return Math.atan2(-(b[2] - a[2]), b[0] - a[0])
}
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

interface HeliPose {
  p: V3
  h: number
  pitch: number
  rpm: number
}
function heliPose(s: number): HeliPose {
  if (s < 0.62) {
    const u = s / 0.62
    const h = headingOf(IN, u)
    return { p: bez3(IN, u), h: h + wrapA(H_APP - h) * sm(0.8, 1, u), pitch: -0.07, rpm: 1 }
  }
  if (s < 0.9) {
    const r = (s - 0.62) / 0.28
    const k = 1 - Math.pow(1 - r, 2.2) // decelerate to the hover
    const hover: V3 = [D[0], D[1] + 5, D[2]]
    return { p: lerp3(G, hover, k), h: H_APP, pitch: -0.04 + 0.2 * sm(0.45, 0.85, r) - 0.16 * sm(0.85, 1, r), rpm: 1 }
  }
  if (s < 1) {
    const r = (s - 0.9) / 0.1
    return { p: [D[0], D[1] + 5 * (1 - sm(0, 1, r)), D[2]], h: H_APP, pitch: 0, rpm: 1 }
  }
  if (s < 2) return { p: D, h: H_APP, pitch: 0, rpm: 1 - 0.62 * sm(1.0, 1.3, s) }
  if (s < 2.2) {
    const rpm = 0.38 + 0.62 * sm(2.0, 2.07, s)
    const lift = sm(2.08, 2.2, s)
    return { p: [D[0], D[1] + 6 * lift, D[2]], h: H_APP + wrapA(H_DEP - H_APP) * sm(2.12, 2.2, s), pitch: 0, rpm }
  }
  if (s < 2.45) {
    const r = (s - 2.2) / 0.25
    const k = r * r // accelerate away
    return { p: lerp3([D[0], D[1] + 6, D[2]], T_DEP, k), h: H_DEP, pitch: -0.15 * sm(0, 0.3, r), rpm: 1 }
  }
  const u = Math.min(1, (s - 2.45) / 0.55)
  const h = headingOf(OUT, u)
  return { p: bez3(OUT, u), h: H_DEP + wrapA(h - H_DEP) * sm(0, 0.15, u), pitch: -0.1, rpm: 1 }
}

/** materials driven per frame (cached by name in envMat) */
const bladeMaterial = () => envMat('heliBlades', { color: '#1e2022', roughness: 0.5, metalness: 0.3, transparent: true, opacity: 1 }, { underwater: false })
const discMaterial = () => envMat('heliRotorDisc', { color: '#15171a', roughness: 1, metalness: 0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }, { underwater: false })
const beaconMaterial = () => envMat('heliBeacon', { color: '#ff2a1a', emissive: '#ff1a08', emissiveIntensity: 0.2, roughness: 0.3 })

const RATE_HELI = (ph: number) => (ph === 0 ? 1 / 16 : ph === 1 ? 1 / 5 : 1 / 14)
function heliTarget(leg: LogisticsLeg, now: number) {
  const p = legProgress(leg, now) * 0.999
  switch (leg.state) {
    case 'inbound':
      return p
    case 'landed':
      return 1 + p
    case 'outbound':
      return 2 + p
    default:
      return 3
  }
}

export function Helicopter() {
  const ref = useRef<THREE.Group>(null)
  const main = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const geo = useMemo(() => {
    const B = new Batches<K>()
    fuselage(B)
    details(B)
    return { body: B.buildAll(), main: mainRotor(), tail: tailRotor(), disc: new THREE.CircleGeometry(R_MAIN, 40).rotateX(-Math.PI / 2) }
  }, [])
  useEffect(
    () => () => {
      for (const p of geo.body) p.geometry.dispose()
      geo.main.dispose()
      geo.tail.dispose()
      geo.disc.dispose()
    },
    [geo],
  )
  const mats = useMemo<Record<K, THREE.Material>>(
    () => ({
      white: envMat('heliWhite', { color: '#eef0ec', roughness: 0.35, metalness: 0.15 }),
      blue: envMat('heliBlue', { color: '#1d4f91', roughness: 0.4, metalness: 0.2 }),
      glass: envMat('heliGlass', { color: '#1a2630', roughness: 0.08, metalness: 0.5 }),
      dark: envMat('heliDark', { color: '#2a2d30', roughness: 0.5, metalness: 0.4 }),
      grey: envMat('heliGrey', { color: '#8d9398', roughness: 0.4, metalness: 0.6 }),
      red: envMat('heliNavRed', { color: '#ff2a1a', emissive: '#ff1a08', emissiveIntensity: 2, roughness: 0.3 }),
      green: envMat('heliNavGreen', { color: '#2aff6a', emissive: '#18ff50', emissiveIntensity: 2, roughness: 0.3 }),
      beacon: beaconMaterial(),
    }),
    [],
  )
  const st = useRef({ init: false, s: 0, lastH: Number.NaN, roll: 0, rotA: 0, rotT: 0 })

  useFrame((_, dtRaw) => {
    const g = ref.current
    if (!g) return
    const dt = Math.min(dtRaw, 0.1)
    const S = st.current
    const leg = useSpares.getState().heli
    const active = !!leg && (leg.state === 'inbound' || leg.state === 'landed' || leg.state === 'outbound')
    const tgt = leg ? heliTarget(leg, simNowSmooth()) : 3
    if (!S.init) {
      S.init = true
      S.s = tgt >= 3 ? 0 : tgt
    }
    S.s = chaseTimeline(S.s, tgt, dt, RATE_HELI)
    const shown = active || S.s > 1e-6
    const pose = heliPose(S.s)
    g.visible = shown && Math.hypot(pose.p[0], pose.p[2]) < HIDE_BEYOND
    if (!g.visible) {
      S.lastH = Number.NaN
      return
    }
    // bank into turns from the heading rate
    const hRate = Number.isNaN(S.lastH) || dt <= 0 ? 0 : wrapA(pose.h - S.lastH) / dt
    S.lastH = pose.h
    const airborne = S.s < 0.97 || S.s > 2.1
    const want = airborne ? Math.max(-0.35, Math.min(0.35, -hRate * 0.6)) : 0
    S.roll += (want - S.roll) * (1 - Math.exp(-dt / 0.6))
    g.position.set(pose.p[0], pose.p[1], pose.p[2])
    g.rotation.set(S.roll, pose.h, pose.pitch, 'YXZ')
    // rotors: wall-clock spin, blades blur into a disc at flight rpm
    const w = pose.rpm * Math.PI * 2 * 3.2
    S.rotA = (S.rotA + w * dt) % (Math.PI * 2)
    S.rotT = (S.rotT + w * 5.2 * dt) % (Math.PI * 2)
    if (main.current) main.current.rotation.y = S.rotA
    if (tail.current) tail.current.rotation.z = S.rotT
    const blur = sm(0.5, 1, pose.rpm)
    bladeMaterial().opacity = 1 - 0.55 * blur
    discMaterial().opacity = 0.26 * blur
    beaconMaterial().emissiveIntensity = Math.sin(envTime.value * 9) > 0.6 ? 3 : 0.2
  })
  return (
    <group ref={ref} visible={false} name="Helicopter">
      {geo.body.map(({ key, geometry }) => (
        <mesh key={key} geometry={geometry} material={mats[key]} castShadow={false} receiveShadow={false} raycast={noRaycast} />
      ))}
      <group ref={main} position={[0.35, HUB_Y, 0]}>
        <mesh geometry={geo.main} material={bladeMaterial()} raycast={noRaycast} />
        <mesh geometry={geo.disc} material={discMaterial()} raycast={noRaycast} renderOrder={2} />
      </group>
      <group ref={tail} position={[-9.95, 3.35, 0.36]}>
        <mesh geometry={geo.tail} material={bladeMaterial()} raycast={noRaycast} />
      </group>
    </group>
  )
}

export default Helicopter
