/**
 * Animated flow inside the pipes. Particles travel along each line's smoothed centreline,
 * offset radially inside the bore, coloured by service. They are only visible when the
 * shells are see-through (x-ray) or cut by the section box — exactly the "look inside the
 * pipe" moment. Liquids move slowly in a dense lower band, gas streams fast and sparse.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { BuiltPiping } from './build'
import { SERVICE } from '../../model/catalog'
import { registerMaterial } from '../../three/materials'
import { useSim } from '../../state/sim'

const SPEED: Record<string, number> = {
  gas: 6, flare: 3.5, multiphase: 2.2, oil: 1.4, water: 1.2, cooling: 1.6, firewater: 0.6, chemical: 0.5, drain: 0.4, instrumentAir: 4,
}
const LIQUID = new Set(['oil', 'water', 'multiphase', 'cooling', 'firewater', 'chemical', 'drain'])

interface P {
  line: number
  u: number
  r: number
  a: number
  s: number
}

const mat = registerMaterial(
  // unlit so the service colour reads clearly inside dark bores
  new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  'internal',
)

/** Lines that carry no flow in normal operation: blocked by a normally-closed valve, or relief discharges. */
function stagnant(built: BuiltPiping) {
  const out = new Set<string>()
  for (const v of built.valves) if (v.valve.normally === 'closed') out.add(v.valve.line)
  return out
}

export function FlowParticles({ built, visible }: { built: BuiltPiping; visible: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const { parts, count, colors } = useMemo(() => {
    const parts: P[] = []
    const colors: THREE.Color[] = []
    const still = stagnant(built)
    built.lines.forEach((b, li) => {
      if (still.has(b.line.tag)) return
      const L = b.pathLen[b.pathLen.length - 1]
      const liquid = LIQUID.has(b.line.service)
      const density = liquid ? 7 : 3.2 // per metre
      const n = Math.min(900, Math.floor(L * density * Math.min(1.6, Math.max(0.5, b.bore * 8))))
      const c = new THREE.Color(SERVICE[b.line.service].flow)
      for (let k = 0; k < n; k++) {
        // liquids settle in the lower part of horizontal pipes
        const rr = Math.sqrt(Math.random()) * b.bore * 0.72
        parts.push({ line: li, u: Math.random() * L, r: rr, a: Math.random() * Math.PI * 2, s: 0.75 + Math.random() * 0.5 })
        colors.push(c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12))
      }
    })
    return { parts, count: parts.length, colors }
  }, [built])

  const geo = useMemo(() => new THREE.SphereGeometry(1, 8, 6), [])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }), [])

  useFrame((_, dt) => {
    const mesh = ref.current
    if (!mesh || !visible) return
    const step = Math.min(dt, 0.05)
    const flow = useSim.getState().lineFlow
    for (let i = 0; i < count; i++) {
      const pt = parts[i]
      const b = built.lines[pt.line]
      const L = b.pathLen[b.pathLen.length - 1]
      // the simulated plant sets each line's flow: faster with throughput, stopped when it's zero
      const f = flow[b.line.tag] ?? 1
      if (f < 0.02) {
        tmp.m.makeScale(0, 0, 0)
        mesh.setMatrixAt(i, tmp.m)
        continue
      }
      pt.u = (pt.u + step * (SPEED[b.line.service] ?? 1) * pt.s * Math.min(1.6, Math.max(0.25, f))) % L
      // locate segment (binary search)
      const pl = b.pathLen
      let lo = 0
      let hi = pl.length - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (pl[mid] <= pt.u) lo = mid
        else hi = mid
      }
      const a = b.path[lo]
      const c = b.path[hi]
      const segL = pl[hi] - pl[lo] || 1
      tmp.p.copy(a).lerp(c, (pt.u - pl[lo]) / segL)
      tmp.t.copy(c).sub(a).normalize()
      // radial offset in the pipe cross-section
      tmp.n.set(0, 1, 0)
      if (Math.abs(tmp.t.y) > 0.9) tmp.n.set(1, 0, 0)
      tmp.b.crossVectors(tmp.t, tmp.n).normalize()
      tmp.n.crossVectors(tmp.b, tmp.t).normalize()
      const liquid = LIQUID.has(b.line.service)
      let ang = pt.a
      if (liquid && Math.abs(tmp.t.y) < 0.5) ang = Math.PI + (pt.a - Math.PI) * 0.45 // fill lower part
      tmp.p.addScaledVector(tmp.n, Math.cos(ang) * pt.r).addScaledVector(tmp.b, Math.sin(ang) * pt.r)
      const size = Math.min(0.055, b.bore * (liquid ? 0.2 : 0.13))
      // stretch along flow for a motion-blur feel
      tmp.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp.t)
      tmp.s.set(size, size * (liquid ? 1.8 : 3.2), size)
      tmp.m.compose(tmp.p, tmp.q, tmp.s)
      mesh.setMatrixAt(i, tmp.m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={(m) => {
        ref.current = m
        if (m && !m.userData.colored) {
          colors.forEach((c, i) => m.setColorAt(i, c))
          ;(m.instanceColor as THREE.InstancedBufferAttribute | null)?.addUpdateRange(0, colors.length * 3)
          m.userData.colored = true
        }
      }}
      args={[geo, mat, count]}
      visible={visible}
      frustumCulled={false}
    />
  )
}
