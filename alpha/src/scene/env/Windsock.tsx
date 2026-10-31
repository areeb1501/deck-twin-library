/**
 * Windsocks: one on each helideck (Alpha, LQ) and one by the crane pedestal on WHP-N, RP and WI. The
 * sock points downwind (knobs.wind blows FROM `from`), hangs limp in a calm and stiffens to horizontal
 * at ~ 12 m/s, fluttering a little. Two draw calls in total: the masts (one merged mesh) and the socks
 * (one InstancedMesh, orange / white bands as vertex colours). WORLD coordinates.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { envMat } from './envShared'
import { HELIDECK } from './topsides'
import { LQ_HELI_Y } from './lqQuarters'
import { CRANE_BY_TAG } from '../../model/cranes'
import { LQ } from '../../model/site'
import { windNow } from '../../sim/cranes'

const WY = 28
/** helideck vertex to the corner of the net's outer rail, m */
const NET_RAIL = 1.86
const noRay = () => null

interface Sock {
  /** mast foot, world */
  x: number
  y: number
  z: number
  mast: number
  alpha: boolean
}

function socks(upperDeck: boolean): Sock[] {
  const out: Sock[] = []
  // Alpha helideck: on the safety net's outer rail, NE corner (platform side, outside the obstacle-free sector)
  const a = (-22.5 * Math.PI) / 180
  if (upperDeck) out.push({ x: HELIDECK.x + (HELIDECK.r + NET_RAIL) * Math.cos(a), y: HELIDECK.y, z: HELIDECK.z + (HELIDECK.r + NET_RAIL) * Math.sin(a), mast: 2.6, alpha: true })
  const b = (202.5 * Math.PI) / 180
  out.push({ x: LQ.helideck.x + (LQ.helideck.r + NET_RAIL) * Math.cos(b), y: LQ_HELI_Y, z: LQ.helideck.z + (LQ.helideck.r + NET_RAIL) * Math.sin(b), mast: 2.6, alpha: false })
  // deck masts beside the crane pedestals (outboard corner, clear of the slewing house)
  for (const [tag, dx, dz] of [
    ['CR-N1', 2.3, -2.2],
    ['CR-R1', -2.3, -2.2],
    ['CR-W1', 2.3, -2.2],
  ] as const) {
    const c = CRANE_BY_TAG.get(tag)
    if (c) out.push({ x: c.x + dx, y: WY + c.deckY, z: c.z + dz, mast: 6, alpha: false })
  }
  return out
}

const SOCK_L = 2.4
function sockGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const bands = 5
  const orange = new THREE.Color('#ff5a14')
  const white = new THREE.Color('#f2f2ee')
  for (let i = 0; i < bands; i++) {
    const r0 = 0.32 - (0.15 * i) / bands
    const r1 = 0.32 - (0.15 * (i + 1)) / bands
    const g = new THREE.CylinderGeometry(r1, r0, SOCK_L / bands, 12, 1, i < bands - 1)
    g.rotateZ(-Math.PI / 2) // axis along +x (mouth at x = 0)
    g.translate(((i + 0.5) * SOCK_L) / bands, 0, 0)
    const c = i % 2 ? white : orange
    const n = g.getAttribute('position').count
    const col = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    parts.push(g.index ? g.toNonIndexed() : g)
  }
  const hoop = new THREE.TorusGeometry(0.33, 0.02, 6, 16).rotateY(Math.PI / 2).toNonIndexed()
  const grey = new THREE.Color('#3d4347')
  const hn = hoop.getAttribute('position').count
  hoop.setAttribute('color', new THREE.BufferAttribute(new Float32Array(hn * 3).map((_, k) => [grey.r, grey.g, grey.b][k % 3]), 3))
  hoop.deleteAttribute('uv')
  for (const p of parts) p.deleteAttribute('uv')
  const g = mergeGeometries([...parts, hoop])!
  parts.forEach((p) => p.dispose())
  hoop.dispose()
  return g
}

function mastGeometry(list: Sock[]) {
  const parts: THREE.BufferGeometry[] = []
  const grey = new THREE.Color('#b8bec1')
  for (const s of list) {
    const m = new THREE.CylinderGeometry(0.04, 0.06, s.mast, 8).translate(s.x, s.y + s.mast / 2, s.z).toNonIndexed()
    const arm = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6).translate(s.x, s.y + s.mast + 0.17, s.z).toNonIndexed()
    for (const g of [m, arm]) {
      g.deleteAttribute('uv')
      const n = g.getAttribute('position').count
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, k) => [grey.r, grey.g, grey.b][k % 3]), 3))
      parts.push(g)
    }
  }
  const g = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  return g
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YZX')
const _p = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)

export function Windsocks({ upperDeck = true }: { upperDeck?: boolean }) {
  const list = useMemo(() => socks(upperDeck), [upperDeck])
  const material = useMemo(() => envMat('craneVertexColour', { color: '#ffffff', vertexColors: true, roughness: 0.55, metalness: 0.25 }), [])
  const mast = useMemo(() => mastGeometry(list), [list])
  const inst = useMemo(() => {
    const m = new THREE.InstancedMesh(sockGeometry(), material, list.length)
    m.castShadow = true
    m.frustumCulled = false
    m.raycast = noRay
    return m
  }, [list, material])
  useEffect(
    () => () => {
      mast.dispose()
      inst.geometry.dispose()
    },
    [mast, inst],
  )
  const st = useMemo(() => ({ droop: 1.2 }), [])
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const t = state.clock.elapsedTime
    const w = windNow()
    // stiffness 0 (limp) … 1 (horizontal) by ~12 m/s
    const stiff = Math.min(1, Math.max(0, w.speed / 12))
    const droopT = (1 - stiff) * 1.25 + 0.04
    st.droop += (droopT - st.droop) * Math.min(1, dt * 1.5)
    // downwind heading in plan: wind FROM `from` (0 = north = −z, clockwise) blows towards from + 180
    const th = (w.from * Math.PI) / 180
    const dx = -Math.sin(th)
    const dz = Math.cos(th)
    const yaw = Math.atan2(-dz, dx) // rotation about +y that turns +x onto (dx, dz)
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      const flutter = (0.03 + 0.012 * w.speed) * Math.sin(t * (2.6 + 0.35 * w.speed) + i * 1.7)
      _e.set(0, yaw + flutter, -st.droop + flutter * 0.5)
      _q.setFromEuler(_e)
      _m.compose(_p.set(s.x, s.y + s.mast + 0.33, s.z), _q, _one)
      inst.setMatrixAt(i, _m)
    }
    inst.instanceMatrix.needsUpdate = true
  })
  return (
    <group name="Windsocks">
      <mesh geometry={mast} material={material} castShadow raycast={noRay} />
      <primitive object={inst} />
    </group>
  )
}

export default Windsocks
