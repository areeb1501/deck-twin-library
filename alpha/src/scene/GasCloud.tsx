/**
 * Live gas clouds and fires from the simulation's incidents (deck-local; mount inside the deck group).
 *  - gasRelease: the dispersion model's cloud (sim/fg.ts cloudShape). Dense gas hugs the deck, so
 *    it is drawn as half-ellipsoids from the deck plate: the 20 % LEL fringe, the LFL envelope and the
 *    rich core, plus drifting haze particles. Drawn back-face and depth-write off, so it still reads
 *    from inside the cloud while walking.
 *  - fire: flickering flame cones sized by Heskestad's flame height, a glow, a point light and a
 *    smoke plume leaning downwind.
 * Shapes follow the incident's current rate and age every frame without React re-renders.
 */
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { usePlant } from '../state/plantStore'
import { cloudShape, downwind, flameHeight, S_LOW } from '../sim/fg'
import { getLive, getWind, useIncidents } from '../sim/fg/live'
import type { Incident } from '../sim/types'

const noPick = () => null
const HEMI = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2)
const gasMat = (color: string, opacity: number, side: THREE.Side) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side, toneMapped: false })
const GAS = {
  fringe: gasMat('#e6ef8a', 0.07, THREE.DoubleSide),
  lfl: gasMat('#d4e157', 0.14, THREE.DoubleSide),
  core: gasMat('#c0ca33', 0.2, THREE.DoubleSide),
}
const N_HAZE = 260

/** small deterministic PRNG (render stays pure) */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let seedSeq = 1

/** soft round puff sprite for the haze (shared) */
let puffTex: THREE.Texture | null = null
function puff() {
  if (puffTex) return puffTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  puffTex = new THREE.CanvasTexture(c)
  return puffTex
}

/** haze particles: uniform in the unit upper hemisphere, denser near the deck */
function makeHaze() {
  const rnd = prng(seedSeq++ * 7919)
  const base = new Float32Array(N_HAZE * 3)
  for (let k = 0; k < N_HAZE; k++) {
    let x = 0
    let y = 0
    let z = 0
    do {
      x = rnd() * 2 - 1
      z = rnd() * 2 - 1
      y = Math.pow(rnd(), 1.8)
    } while (x * x + y * y + z * z > 1)
    base.set([x, y, z], k * 3)
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
  const mat = new THREE.PointsMaterial({ color: '#eef4b0', map: puff(), alphaTest: 0.01, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false })
  return { base, geo, mat, phase: Float32Array.from({ length: N_HAZE }, () => rnd()) }
}

/** advance the haze drift (wraps along the cloud's downwind axis) */
function driftHaze(h: ReturnType<typeof makeHaze>, dt: number, speed: number, a: number) {
  const arr = (h.geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
  const ph = h.phase
  for (let k = 0; k < N_HAZE; k++) {
    ph[k] = (ph[k] + (dt * (0.04 + 0.02 * speed)) / Math.max(1, a / 4)) % 1
    arr[k * 3] = ((h.base[k * 3] + 1 + ph[k] * 2) % 2) - 1
    arr[k * 3 + 1] = h.base[k * 3 + 1] * (0.9 + 0.1 * Math.sin((ph[k] + k) * 6.28))
    arr[k * 3 + 2] = h.base[k * 3 + 2]
  }
  h.geo.getAttribute('position').needsUpdate = true
}

const isGas = (i: Incident) => i.fault.kind === 'gasRelease'
const isFire = (i: Incident) => i.fault.kind === 'fire'
const posOf = (i: Incident) => i.pos ?? ('at' in i.fault ? i.fault.at : undefined)

export function GasCloud() {
  const incidents = useIncidents()
  const ids = incidents.filter((i) => (isGas(i) || isFire(i)) && posOf(i)).map((i) => `${i.fault.kind}:${i.id}`)
  const key = ids.join('|')
  const list = useMemo(() => (key ? key.split('|') : []).map((k) => k.split(':') as ['gasRelease' | 'fire', string]), [key])
  return (
    <group>
      {list.map(([kind, id]) => (kind === 'gasRelease' ? <Cloud key={id} id={id} /> : <Fire key={id} id={id} />))}
    </group>
  )
}

const find = (id: string) => (getLive().incidents ?? []).find((i) => i.id === id)

function Cloud({ id }: { id: string }) {
  const plant = usePlant()
  const offshore = (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha'
  const root = useRef<THREE.Group>(null)
  const fringe = useRef<THREE.Mesh>(null)
  const lfl = useRef<THREE.Mesh>(null)
  const core = useRef<THREE.Mesh>(null)
  const [haze] = useState(makeHaze)
  const hazeRef = useRef<THREE.Points>(null)

  useFrame((_, dt) => {
    const inc = find(id)
    const g = root.current
    if (!g) return
    const pos = inc && posOf(inc)
    const rate = inc ? (inc.rate ?? (inc.fault.kind === 'gasRelease' ? inc.fault.rateKgS : 0)) : 0
    if (!inc || !pos || rate <= 0.02) {
      g.visible = false
      return
    }
    const t = getLive().t ?? 0
    const sh = cloudShape({ pos, rateKgS: rate, age: Math.max(0, t - inc.at) }, getWind(), offshore)
    if (sh.R < 0.1) {
      g.visible = false
      return
    }
    g.visible = true
    // cloud frame: local +X downwind, origin on the deck plate under the ellipsoid centre
    g.position.set(sh.centre[0], sh.floor + 0.03, sh.centre[2])
    g.rotation.set(0, Math.atan2(-sh.dir[1], sh.dir[0]), 0)
    const h = sh.centre[1] - sh.floor
    const set = (m: THREE.Mesh | null, s: number) => m?.scale.set(sh.a * s, h + sh.c * s, sh.b * s)
    set(fringe.current, S_LOW)
    set(lfl.current, 1)
    set(core.current, 0.55)
    // haze drifts downwind through the cloud and wraps around
    const p = hazeRef.current
    if (p) {
      p.scale.set(sh.a * 1.15, h + sh.c, sh.b * 1.15)
      driftHaze(haze, dt, getWind().speed, sh.a)
    }
  })
  return (
    <group ref={root} visible={false}>
      <mesh ref={fringe} geometry={HEMI} material={GAS.fringe} raycast={noPick} renderOrder={6} />
      <mesh ref={lfl} geometry={HEMI} material={GAS.lfl} raycast={noPick} renderOrder={7} />
      <mesh ref={core} geometry={HEMI} material={GAS.core} raycast={noPick} renderOrder={8} />
      <points ref={hazeRef} geometry={haze.geo} material={haze.mat} raycast={noPick} renderOrder={9} />
    </group>
  )
}

const CONE = new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, 0.5, 0)
const add = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })
const solid = (color: string, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
const FIRE = {
  outer: solid('#e8400c', 0.8),
  mid: solid('#ff8a1c', 0.85),
  inner: add('#ffe9a0', 0.9),
  glow: add('#ff7a30', 0.18),
  smoke: new THREE.MeshBasicMaterial({ color: '#2b2b2e', transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }),
}
const GLOW = new THREE.SphereGeometry(1, 20, 12)
const SMOKE = new THREE.CylinderGeometry(1.6, 0.6, 1, 20, 1, true).translate(0, 0.5, 0)

function Fire({ id }: { id: string }) {
  const root = useRef<THREE.Group>(null)
  const lean = useRef<THREE.Group>(null)
  const flames = useRef<(THREE.Mesh | null)[]>([])
  const glow = useRef<THREE.Mesh>(null)
  const smoke = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const [seed] = useState(() => (seedSeq++ * 37.7) % 100)
  useFrame(({ clock }) => {
    const inc = find(id)
    const g = root.current
    if (!g) return
    const pos = inc && posOf(inc)
    if (!inc || !pos || inc.burning === false) {
      g.visible = false
      if (light.current) light.current.intensity = 0
      return
    }
    g.visible = true
    const mw = inc.rate ?? (inc.fault.kind === 'fire' ? inc.fault.sizeMW : 1)
    const H = flameHeight(mw)
    const D = Math.max(0.5, Math.sqrt((4 * (mw / 1.5)) / Math.PI))
    const t = clock.elapsedTime + seed
    g.position.set(pos[0], pos[1], pos[2])
    const w = getWind()
    const [dx, dz] = downwind(w)
    // lean downwind: rotate about the horizontal axis perpendicular to the wind
    const ang = Math.atan(w.speed / (w.speed + 4)) * 0.7
    lean.current?.quaternion.setFromAxisAngle(new THREE.Vector3(dz, 0, -dx).normalize(), ang)
    const fl = [1, 0.72, 0.45]
    const wid = [0.85, 0.62, 0.34]
    flames.current.forEach((m, k) => {
      if (!m) return
      const f = 1 + 0.12 * Math.sin(t * (9 + k * 3)) + 0.08 * Math.sin(t * (23 + k * 5))
      m.scale.set(D * wid[k] * (1 + 0.08 * Math.sin(t * 13 + k)), H * fl[k] * f * (k ? 1.05 : 1), D * wid[k] * (1 + 0.08 * Math.cos(t * 11 + k)))
      m.rotation.y = t * (0.6 + k * 0.3)
    })
    glow.current?.scale.setScalar(Math.max(D, H * 0.55))
    glow.current?.position.set(0, H * 0.35, 0)
    smoke.current?.scale.set(D * 0.8, H * 3, D * 0.8)
    smoke.current?.position.set(0, H * 0.85, 0)
    if (light.current) {
      light.current.position.set(0, H * 0.5, 0)
      light.current.intensity = (30 + 25 * Math.sqrt(mw)) * (1 + 0.15 * Math.sin(t * 17))
      light.current.distance = 12 + 10 * Math.sqrt(mw)
    }
  })
  return (
    <group ref={root} visible={false}>
      <group ref={lean}>
        {[FIRE.outer, FIRE.mid, FIRE.inner].map((m, k) => (
          <mesh key={k} ref={(el) => (flames.current[k] = el)} geometry={CONE} material={m} raycast={noPick} renderOrder={10 + k} />
        ))}
        <mesh ref={glow} geometry={GLOW} material={FIRE.glow} raycast={noPick} renderOrder={9} />
        <mesh ref={smoke} geometry={SMOKE} material={FIRE.smoke} raycast={noPick} renderOrder={8} />
      </group>
      <pointLight ref={light} color="#ff8a3d" intensity={0} distance={20} decay={1.6} />
    </group>
  )
}
