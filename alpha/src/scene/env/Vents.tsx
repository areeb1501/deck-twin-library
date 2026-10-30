/**
 * Cold vent stacks (model/vents.ts: VS-A300 on Alpha's weather deck, VS-R300 on RP) and their plumes,
 * plus a faint exhaust plume over each running gas turbine (GT-8100A/B) and the flame arrestors /
 * insect screens at the ends of the LQ tank vent goosenecks (lines *-TV-93x1-*).
 *
 * Plume: drifting translucent puffs from the tip, sized and thickened with the stack's flow
 * (sim/cranes.ts ventFlow ← process.vent), carried downwind (knobs.wind) and bent over with speed.
 * Below ~2 m/s the vented gas behaves as a dense gas: the puffs sag and fall back, then slump along
 * the deck. The turbine exhaust is hot and buoyant. ALL emitters share ONE THREE.Points (one draw
 * call); particles live in typed arrays updated in useFrame without allocations.
 * WORLD coordinates (mounted in Surroundings).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Batches, boxMinMax, tube } from '../structure/batch'
import { envMat } from './envShared'
import { VENTS, type VentStack } from '../../model/vents'
import { ALPHA_DECK, RP } from '../../model/site'
import type { GasTurbineGenerator, PlanRect, Plant } from '../../model/types'
import { usePlantStore } from '../../state/plantStore'
import { isRunning } from '../../state/sim'
import { ventFlow, ventVelocity, windNow } from '../../sim/cranes'

const WY = 28
const noRay = () => null

// ---------------------------------------------------------------- stack geometry (static, one mesh)

function buildStacks(stacks: VentStack[], plant: Plant) {
  type K = 'galv' | 'dark' | 'white' | 'yellow' | 'red'
  const B = new Batches<K>()
  for (const v of stacks) {
    const x = v.x
    const z = v.z
    const y0 = WY + v.y
    const y1 = y0 + v.height
    const r = v.od / 2
    // base plate + flanged inlet tee (vent header)
    boxMinMax(B.get('dark'), [x - 0.6, y0, z - 0.6], [x + 0.6, y0 + 0.04, z + 0.6])
    tube(B.get('galv'), [x, y0, z], [x, y1, z], r, 14, false)
    // inlet stub from the west (the vent header lands on its flange at x − 0.6)
    tube(B.get('galv'), [x - 0.6, y0 + 1.2, z], [x, y0 + 1.2, z], r * 0.8, 12, false)
    tube(B.get('dark'), [x - 0.6, y0 + 1.2, z], [x - 0.52, y0 + 1.2, z], r * 0.8 + 0.06, 14, false)
    for (let k = 1; k * 4.5 < v.height; k++) tube(B.get('dark'), [x, y0 + k * 4.5, z], [x, y0 + k * 4.5 + 0.06, z], r + 0.05, 14, false) // spool flanges
    // tapered 3-leg lattice support tower to 80 % of the height
    const top = y0 + v.height * 0.8
    const legs = [Math.PI, Math.PI / 3, -Math.PI / 3] // one leg west, two east (inside a deck-edge corner)
    const at = (a: number, y: number): [number, number, number] => {
      const u = (y - y0) / (top - y0)
      const rr = 1.0 * (1 - u) + (r + 0.25) * u
      return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]
    }
    for (const a of legs) tube(B.get('galv'), at(a, y0), at(a, top), 0.06, 6, true)
    const tiers = Math.max(3, Math.round(v.height * 0.8 / 3.5))
    for (let t = 0; t <= tiers; t++) {
      const y = y0 + ((top - y0) * t) / tiers
      for (let i = 0; i < 3; i++) {
        tube(B.get('galv'), at(legs[i], y), at(legs[(i + 1) % 3], y), 0.035, 5, true)
        if (t < tiers) tube(B.get('galv'), at(legs[i], y), at(legs[(i + 1) % 3], y + (top - y0) / tiers), 0.03, 5, true)
        tube(B.get('galv'), at(legs[i], y), [x, y, z], 0.025, 4, true) // guide bracket
      }
    }
    // tip: flame arrestor / molecular seal housing, white-red day marking, aviation light
    tube(B.get('dark'), [x, y1 - 1.0, z], [x, y1 - 0.2, z], r + 0.1, 16, false)
    tube(B.get('white'), [x, y1 - 3.0, z], [x, y1 - 2.0, z], r + 0.012, 14, false)
    tube(B.get('red'), [x, y1 - 2.0, z], [x, y1 - 1.0, z], r + 0.012, 14, false)
    tube(B.get('red'), [x + r + 0.12, y1 - 0.6, z], [x + r + 0.12, y1 - 0.4, z], 0.07, 8, false)
  }
  // LQ tank vents: flame arrestor (diesel) / insect-screen cap (potable water) at the gooseneck outlets
  for (const l of plant.lines) {
    const m = /-TV-93(\d)1-/.exec(l.tag)
    if (!m || l.route.length < 2) continue
    const e = l.route[l.route.length - 1]
    const p = l.route[l.route.length - 2]
    const d = [e[0] - p[0], e[1] - p[1], e[2] - p[2]]
    const n = Math.hypot(d[0], d[1], d[2]) || 1
    const end: [number, number, number] = [e[0], e[1] + WY, e[2]]
    const back = (s: number): [number, number, number] => [end[0] - (d[0] / n) * s, end[1] - (d[1] / n) * s, end[2] - (d[2] / n) * s]
    const diesel = m[1] === '3'
    tube(B.get(diesel ? 'dark' : 'galv'), back(diesel ? 0.32 : 0.12), end, diesel ? 0.11 : 0.075, 14, false)
    if (diesel) tube(B.get('yellow'), back(0.2), back(0.12), 0.115, 14, false) // arrestor element band
  }
  const COL: Record<K, string> = { galv: '#9ba2a6', dark: '#3d4347', white: '#ececea', yellow: '#e2b21a', red: '#b9261c' }
  const geos = B.buildAll().map(({ key, geometry }) => {
    const c = new THREE.Color(COL[key])
    const n = geometry.getAttribute('position').count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
    geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return geometry
  })
  if (!geos.length) return null
  const g = mergeGeometries(geos)
  for (const x of geos) x.dispose()
  g?.computeBoundingSphere()
  return g
}

// ---------------------------------------------------------------- plume particles

interface Emitter {
  kind: 'vent' | 'exhaust'
  tag: string
  /** tip, world */
  p: THREE.Vector3
  /** slot range in the particle pool */
  i0: number
  n: number
  /** deck the plume can slump onto (world y) and its plan rect (deck-local x/z) */
  floor: number
  rect: PlanRect
  color: THREE.Color
  acc: number
  vent?: VentStack
}

const N_VENT = 220
const N_GT = 60

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uPx;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aAlpha > 0.0 ? clamp(aSize * uPx / max(-mv.z, 0.1), 1.0, 256.0) : 0.0;
  vAlpha = aAlpha;
  vColor = aColor;
}`
const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float a = vAlpha * (1.0 - r2) * (0.6 + 0.4 * (1.0 - r2));
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

function gtStackTops(plant: Plant): { tag: string; p: THREE.Vector3 }[] {
  const out: { tag: string; p: THREE.Vector3 }[] = []
  for (const e of plant.equipment) {
    if (e.kind !== 'gasTurbineGenerator') continue
    const g = e as GasTurbineGenerator
    const lx = g.skid[0] / 2 - 2.0
    const c = Math.cos(g.rotationY)
    const s = Math.sin(g.rotationY)
    out.push({ tag: g.tag, p: new THREE.Vector3(g.position[0] + lx * c, WY + g.position[1] + g.enclosureHeight + g.stackHeight + 0.3, g.position[2] - lx * s) })
  }
  return out
}

function usePlume(stacks: VentStack[], plant: Plant, upperDeck: boolean) {
  return useMemo(() => {
    const emitters: Emitter[] = []
    let n = 0
    for (const v of stacks) {
      const onAlpha = v.platform === 'Alpha'
      emitters.push({ kind: 'vent', tag: v.tag, vent: v, p: new THREE.Vector3(v.x, WY + v.y + v.height + 0.1, v.z), i0: n, n: N_VENT, floor: onAlpha ? WY + 10 : WY, rect: onAlpha ? ALPHA_DECK : RP.deck, color: new THREE.Color('#c9d0d4'), acc: 0 })
      n += N_VENT
    }
    if (upperDeck)
      for (const g of gtStackTops(plant)) {
        emitters.push({ kind: 'exhaust', tag: g.tag, p: g.p, i0: n, n: N_GT, floor: WY + 10, rect: ALPHA_DECK, color: new THREE.Color('#c9cdd0'), acc: 0 })
        n += N_GT
      }
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(n * 3)
    const size = new Float32Array(n)
    const alpha = new Float32Array(n)
    const color = new Float32Array(n * 3)
    for (const e of emitters) for (let i = e.i0; i < e.i0 + e.n; i++) color.set([e.color.r, e.color.g, e.color.b], i * 3)
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    const mat = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 600 } }, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.renderOrder = 6
    points.raycast = noRay
    const sim = { vel: new Float32Array(n * 3), age: new Float32Array(n).fill(1e9), life: new Float32Array(n).fill(1), s0: new Float32Array(n), a0: new Float32Array(n), live: 0 }
    return { emitters, points, geo, pos, size, alpha, sim, n }
  }, [stacks, plant, upperDeck])
}

// cheap deterministic noise for the turbulence (no Math.random churn)
let seed = 12345
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

export function Vents({ upperDeck = true }: { upperDeck?: boolean }) {
  const plant = usePlantStore((s) => s.plant)
  const stacks = useMemo(() => VENTS.filter((v) => upperDeck || v.platform !== 'Alpha'), [upperDeck])
  const material = useMemo(() => envMat('craneVertexColour', { color: '#ffffff', vertexColors: true, roughness: 0.55, metalness: 0.25 }), [])
  const geometry = useMemo(() => buildStacks(stacks, plant), [stacks, plant])
  useEffect(() => () => geometry?.dispose(), [geometry])
  const plume = usePlume(stacks, plant, upperDeck)
  useEffect(
    () => () => {
      plume.geo.dispose()
      ;(plume.points.material as THREE.Material).dispose()
    },
    [plume],
  )

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const { emitters, pos, size, alpha, sim } = plume
    const cam = state.camera as THREE.PerspectiveCamera
    ;(plume.points.material as THREE.ShaderMaterial).uniforms.uPx.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 38) / 2)))
    const w = windNow()
    const th = (w.from * Math.PI) / 180
    const wx = -Math.sin(th) * w.speed
    const wz = Math.cos(th) * w.speed
    const dense = Math.min(1, Math.max(0, (2.5 - w.speed) / 2))
    let live = 0
    for (const e of emitters) {
      // ---- emission
      let rate = 0
      let exitV = 0
      let a0 = 0
      let s0 = 0.5
      let life = 7
      if (e.kind === 'vent' && e.vent) {
        const q = ventFlow(e.tag)
        if (q > 0.004) {
          const k = Math.log10(1 + q / 0.05) // 0.3 at the TEG still, ~2.9 at riser blowdown
          rate = Math.min(26, 5 + 9 * k)
          exitV = Math.min(9, 1.2 + ventVelocity(e.vent, q) * 0.05)
          a0 = Math.min(0.8, 0.34 + 0.16 * k)
          s0 = 0.6 + 0.35 * k
          life = 7 + 3 * dense - Math.min(3, k)
        }
      } else if (isRunning(e.tag)) {
        rate = 7
        exitV = 9
        a0 = 0.1
        s0 = 1.2
        life = 3.5
      }
      e.acc += rate * dt
      while (e.acc >= 1) {
        e.acc -= 1
        // oldest slot of this emitter
        let best = e.i0
        let bestAge = -1
        for (let i = e.i0; i < e.i0 + e.n; i++) {
          const ai = sim.age[i] / sim.life[i]
          if (ai > bestAge) {
            bestAge = ai
            best = i
          }
          if (ai >= 1) break
        }
        const i = best
        const j = i * 3
        pos[j] = e.p.x + (rnd() - 0.5) * 0.2
        pos[j + 1] = e.p.y
        pos[j + 2] = e.p.z + (rnd() - 0.5) * 0.2
        sim.vel[j] = wx * 0.15
        sim.vel[j + 1] = e.kind === 'vent' ? exitV * (1 - 0.5 * dense) : exitV
        sim.vel[j + 2] = wz * 0.15
        sim.age[i] = 0
        sim.life[i] = life * (0.8 + 0.4 * rnd())
        sim.s0[i] = s0
        sim.a0[i] = a0
      }
      // ---- motion
      const hot = e.kind === 'exhaust'
      const vyT = hot ? 2.6 : 0.5 * (1 - dense) - 3.2 * dense
      const turb = 0.6 + 0.12 * w.speed
      const kH = Math.min(1, dt / 1.1)
      const kV = Math.min(1, dt / (hot ? 1.6 : 2.4 - 1.5 * dense))
      const grow = (hot ? 1.3 : 0.55) + 0.05 * w.speed
      for (let i = e.i0; i < e.i0 + e.n; i++) {
        if (sim.age[i] >= sim.life[i]) {
          if (alpha[i] !== 0) alpha[i] = 0
          continue
        }
        live++
        const j = i * 3
        sim.age[i] += dt
        const u = sim.age[i] / sim.life[i]
        sim.vel[j] += (wx - sim.vel[j]) * kH + (rnd() - 0.5) * turb * dt * 4
        sim.vel[j + 2] += (wz - sim.vel[j + 2]) * kH + (rnd() - 0.5) * turb * dt * 4
        sim.vel[j + 1] += (vyT - sim.vel[j + 1]) * kV + (rnd() - 0.5) * turb * dt * 2
        pos[j] += sim.vel[j] * dt
        pos[j + 1] += sim.vel[j + 1] * dt
        pos[j + 2] += sim.vel[j + 2] * dt
        // slump on the deck (dense gas), die at the sea surface
        const lx = pos[j]
        const lz = pos[j + 2]
        if (pos[j + 1] < e.floor + 0.4 && lx > e.rect.x0 && lx < e.rect.x1 && lz > e.rect.z0 && lz < e.rect.z1) {
          pos[j + 1] = e.floor + 0.4
          sim.vel[j + 1] = 0
          sim.vel[j] *= 1 + dt * 0.3
          sim.vel[j + 2] *= 1 + dt * 0.3
        } else if (pos[j + 1] < 0.5) sim.age[i] = sim.life[i]
        size[i] = sim.s0[i] + sim.age[i] * grow
        alpha[i] = sim.a0[i] * Math.min(1, sim.age[i] * 4) * (1 - u)
      }
    }
    if (live || sim.live) {
      plume.geo.attributes.position.needsUpdate = true
      plume.geo.attributes.aSize.needsUpdate = true
      plume.geo.attributes.aAlpha.needsUpdate = true
    }
    sim.live = live
  })

  return (
    <group name="Vents">
      {geometry && <mesh geometry={geometry} material={material} castShadow receiveShadow raycast={noRay} />}
      <primitive object={plume.points} />
    </group>
  )
}

export default Vents
