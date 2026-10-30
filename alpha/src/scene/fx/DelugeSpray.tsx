/**
 * Deluge water spray from the spray-nozzle pipes (`PipeLine.sprayNozzles`). DECK-LOCAL (mounted inside
 * Piping with the built piping). Two draw calls for every nozzle on the plant: a translucent spray cone
 * per nozzle (instanced, streaks scrolling in the shader) and droplets (one THREE.Points) flying on a
 * GPU-side ballistic path. Nothing is uploaded per frame except while a system is switching on / off.
 *
 * A spray pipe discharges when the deluge valve feeding it is open:
 *   - an actuated valve on the spray pipe itself or on its feeder (`from.line`) — DV-N2851 on WHP-N,
 *     XV-9011 / XV-9012 on Alpha — that the simulation operates, with pos > 0.5; or, if the simulation
 *     doesn't operate any of them,
 *   - its fire zone's deluge flag (`fg[zoneAt(nozzle)].deluge`).
 * Spray strength follows the firewater ring pressure (`process.fwPressure`) when it is modelled.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { BuiltPiping } from '../piping/build'
import type { Plant, Valve } from '../../model/types'
import { zoneAt } from '../../sim/fg'
import { defaultActuator } from '../equipment/Valve'
import { fwPressure, simValve, zoneDeluge } from './simRead'

/** droplets per nozzle */
const PER = 110
const POWERED = new Set<NonNullable<Valve['actuator']>>(['pistonSpring', 'electric', 'diaphragm'])

const vert = /* glsl */ `
attribute vec3 aDir;
attribute float aSeed;
attribute float aOn;
uniform float uTime;
uniform float uPx;
varying float vA;
float h1(float n) { return fract(sin(n * 91.345) * 43758.5453); }
void main() {
  float on = aOn;
  // a droplet lives T seconds, then re-emits at the nozzle
  float T = 0.75;
  float life = fract(uTime / T + aSeed);
  float t = life * T;
  // random direction inside a wide cone about the nozzle axis
  vec3 d = normalize(aDir);
  vec3 a = normalize(abs(d.y) < 0.9 ? cross(d, vec3(0.0, 1.0, 0.0)) : cross(d, vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(d, a);
  float ang = h1(aSeed * 13.1) * 6.2832;
  float spread = sqrt(h1(aSeed * 7.7)) * 0.75;
  vec3 dir = normalize(d + (a * cos(ang) + b * sin(ang)) * spread);
  float v0 = mix(4.5, 7.5, h1(aSeed * 3.3)) * mix(0.35, 1.0, on);
  vec3 p = position + dir * v0 * t + vec3(0.0, -4.9, 0.0) * t * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.04, 0.26, life) * (0.6 + 0.8 * h1(aSeed * 5.1));
  gl_PointSize = on > 0.001 ? max(1.5, size * uPx / max(0.5, -mv.z)) : 0.0;
  vA = on * (1.0 - smoothstep(0.55, 1.0, life)) * smoothstep(0.0, 0.06, life);
}`

const frag = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA * 0.5;
  if (a < 0.003) discard;
  // blue-grey with a lighter rim: reads against white vessels and sky as well as the dark deck
  vec3 col = mix(vec3(0.42, 0.55, 0.68), vec3(0.85, 0.92, 1.0), smoothstep(0.2, 0.9, r));
  gl_FragColor = vec4(col, a * 1.25);
}`

const coneVert = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = fract(dot(instanceMatrix[3].xyz, vec3(0.731, 0.317, 0.513)));
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`
const coneFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float s = 1.0 - vUv.y; // 0 at the nozzle, 1 at the open end
  // streaks running out from the nozzle, broken up as they travel
  float n = noise(vec2(vUv.x * 42.0 + vSeed * 50.0, s * 5.0 - uTime * 7.0));
  float n2 = noise(vec2(vUv.x * 90.0, s * 9.0 - uTime * 11.0 + vSeed * 9.0));
  float streak = smoothstep(0.45, 0.85, n) * 0.7 + smoothstep(0.55, 0.9, n2) * 0.5;
  float fade = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.55, 1.0, s));
  float a = (0.10 + streak * 0.5) * fade;
  vec3 col = mix(vec3(0.55, 0.66, 0.78), vec3(0.92, 0.96, 1.0), streak);
  gl_FragColor = vec4(col, a);
}`

const SPRAY_L = 3.0
const SPRAY_R = 1.9
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _Y = new THREE.Vector3(0, 1, 0)

interface Group {
  /** actuated valves that feed this spray pipe */
  valves: string[]
  zone: string | null
  /** index range of the droplets */
  i0: number
  n: number
  /** nozzle (cone instance) index range */
  c0: number
  cn: number
  level: number
}

/** actuated valves on the spray line, else on its feeder line (one level up) */
function feedValves(built: BuiltPiping, lineTag: string): string[] {
  const actuatedOn = (tag: string) =>
    built.valves
      .filter((p) => p.valve.line === tag && p.valve.type !== 'psv' && p.valve.type !== 'check' && POWERED.has(p.valve.actuator ?? defaultActuator(p.valve.type, p.nps)))
      .map((p) => p.valve.tag)
  const own = actuatedOn(lineTag)
  if (own.length) return own
  const line = built.lines.find((l) => l.line.tag === lineTag)?.line
  const from = line && 'line' in line.from ? (line.from as { line: string }).line : null
  return from ? actuatedOn(from) : []
}

export function DelugeSpray({ built, plant }: { built: BuiltPiping; plant: Plant }) {
  const { geometry, groups, nozzles } = useMemo(() => {
    const pos: number[] = []
    const dir: number[] = []
    const seed: number[] = []
    const groups: Group[] = []
    const nozzles: { pos: THREE.Vector3; dir: THREE.Vector3 }[] = []
    for (const l of built.lines) {
      if (!l.sprays.length) continue
      const i0 = pos.length / 3
      const c0 = nozzles.length
      nozzles.push(...l.sprays)
      for (const s of l.sprays) {
        for (let k = 0; k < PER; k++) {
          pos.push(s.pos.x + s.dir.x * 0.12, s.pos.y + s.dir.y * 0.12, s.pos.z + s.dir.z * 0.12)
          dir.push(s.dir.x, s.dir.y, s.dir.z)
          seed.push(Math.random())
        }
      }
      const mid = l.sprays[Math.floor(l.sprays.length / 2)].pos
      const z = zoneAt(plant, [mid.x, Math.max(0, mid.y - 3), mid.z])
      groups.push({ valves: feedValves(built, l.line.tag), zone: z?.id ?? null, i0, n: pos.length / 3 - i0, c0, cn: l.sprays.length, level: 0 })
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3))
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
    g.setAttribute('aOn', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1))
    return { geometry: g, groups, nozzles }
  }, [built, plant])
  useEffect(() => () => geometry.dispose(), [geometry])
  const cones = useMemo(() => {
    // open cone, apex at the origin, opening along +Y (unit length / radius)
    const g = new THREE.ConeGeometry(1, 1, 20, 1, true).rotateX(Math.PI).translate(0, 0.5, 0)
    const m = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: coneVert, fragmentShader: coneFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    const im = new THREE.InstancedMesh(g, m, Math.max(1, nozzles.length))
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, _m.makeScale(0, 0, 0))
    im.frustumCulled = false
    im.raycast = () => null
    im.renderOrder = 3
    im.visible = false
    return im
  }, [nozzles])
  useEffect(
    () => () => {
      cones.geometry.dispose()
      ;(cones.material as THREE.Material).dispose()
    },
    [cones],
  )
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPx: { value: 600 } },
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  const pts = useRef<THREE.Points>(null)

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    mat.uniforms.uTime.value = state.clock.elapsedTime
    ;(cones.material as THREE.ShaderMaterial).uniforms.uTime.value = state.clock.elapsedTime
    const cam = state.camera as THREE.PerspectiveCamera
    // world size → pixels at unit distance
    mat.uniforms.uPx.value = (state.size.height * state.viewport.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 38) / 2)))
    const fw = fwPressure()
    const pressure = fw === undefined ? 1 : THREE.MathUtils.clamp((fw - 2) / 8, 0, 1)
    const on = geometry.getAttribute('aOn') as THREE.BufferAttribute
    let dirty = false
    let any = false
    for (const g of groups) {
      const sims = g.valves.map(simValve).filter((v) => !!v)
      const open = sims.length ? sims.some((v) => v!.pos > 0.5) : zoneDeluge(g.zone)
      const target = open ? pressure : 0
      if (g.level !== target) {
        // water arrives over ~1.5 s, drains a little slower
        g.level += (target - g.level) * Math.min(1, dt * (target > g.level ? 2 : 1.2))
        if (Math.abs(target - g.level) < 0.01) g.level = target
        for (let i = g.i0; i < g.i0 + g.n; i++) on.setX(i, g.level)
        // the cone grows out of the nozzle as the water arrives
        const k = g.level
        for (let c = g.c0; c < g.c0 + g.cn; c++) {
          const nz = nozzles[c]
          _q.setFromUnitVectors(_Y, nz.dir)
          cones.setMatrixAt(c, k > 0.001 ? _m.compose(nz.pos, _q, _s.set(SPRAY_R * k, SPRAY_L * k, SPRAY_R * k)) : _m.makeScale(0, 0, 0))
        }
        cones.instanceMatrix.needsUpdate = true
        dirty = true
      }
      if (g.level > 0) any = true
    }
    if (dirty) on.needsUpdate = true
    if (pts.current) pts.current.visible = any
    cones.visible = any
  })

  if (!groups.length) return null
  return (
    <>
      <primitive object={cones} />
      <points ref={pts} geometry={geometry} material={mat} frustumCulled={false} renderOrder={4} visible={false} raycast={() => null} />
    </>
  )
}
