/**
 * Valve position flags: one instanced mesh (1 draw call) over the operators of the actuated valves.
 *
 *   - green = open, red = closed (colour blends with travel), blinking while the valve strokes
 *   - amber, blinking = the simulation reports the valve stuck (`fault: 'stuck'`)
 *   - quarter-turn valves (ESDV / BDV / ball / butterfly): the flag turns with the ball — along the
 *     pipe = open, across = closed; linear valves (control / gate / globe) keep it along the pipe
 *
 * Shown on every ESD / blowdown / actuated on-off valve, and on any other valve while the simulation
 * operates it (`valves[tag]`). Valves the sim doesn't list sit in their `normally` position.
 * DECK-LOCAL (mounted inside Piping). Reads the simulation in useFrame only.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BuiltPiping } from '../piping/build'
import type { Valve } from '../../model/types'
import { defaultActuator, valveGeometry } from '../equipment/Valve'
import { simValve } from './simRead'

const QUARTER = new Set<Valve['type']>(['ball', 'butterfly', 'esdv', 'bdv'])
const POWERED = new Set<NonNullable<Valve['actuator']>>(['pistonSpring', 'electric', 'diaphragm'])

/** ESD / blowdown / powered on-off valves always carry a flag */
function isActuatedOnOff(v: Valve, nps: number) {
  if (v.type === 'esdv' || v.type === 'bdv') return true
  return (v.type === 'ball' || v.type === 'butterfly') && POWERED.has(v.actuator ?? defaultActuator(v.type, nps))
}

const RED = new THREE.Color(1.0, 0.07, 0.04)
const GREEN = new THREE.Color(0.02, 0.62, 0.1) // (ACES tone mapping pales brighter greens)
const AMBER = new THREE.Color(1.0, 0.55, 0.0)
const _c = new THREE.Color()
const _m = new THREE.Matrix4()
const _r = new THREE.Matrix4()
const _s = new THREE.Matrix4()
const _y = new THREE.Vector3(0, 1, 0)
const square = (t: number, hz: number) => (Math.sin(t * Math.PI * 2 * hz) >= 0 ? 1 : 0)

interface Item {
  tag: string
  normally: 'open' | 'closed'
  quarter: boolean
  always: boolean
  /** placement × anchor (flag base above the operator) */
  base: THREE.Matrix4
  size: number
  u: number
}

function flagGeometry() {
  // mast + paddle (along local X = the pipe axis) + hub, unit size: paddle 1 m long
  const mast = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8).translate(0, 0.11, 0)
  const paddle = new THREE.BoxGeometry(1, 0.26, 0.07).translate(0, 0.33, 0)
  const hub = new THREE.CylinderGeometry(0.09, 0.09, 0.3, 12).translate(0, 0.33, 0)
  const g = mergeGeometries([mast.toNonIndexed(), paddle.toNonIndexed(), hub.toNonIndexed()])!
  for (const x of [mast, paddle, hub]) x.dispose()
  return g
}

export function ValveFlags({ built }: { built: BuiltPiping }) {
  const items = useMemo<Item[]>(
    () =>
      built.valves
        .filter((p) => p.valve.type !== 'psv' && p.valve.type !== 'check')
        .map((p) => {
          const v = p.valve
          const geo = valveGeometry(v.type, p.nps, 300, v.actuator)
          const base = new THREE.Matrix4().compose(p.pos, p.quat, new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(...geo.flagAt))
          return {
            tag: v.tag,
            normally: v.normally,
            quarter: QUARTER.has(v.type),
            always: isActuatedOnOff(v, p.nps),
            base,
            size: THREE.MathUtils.clamp(geo.opSize * 0.8, 0.22, 0.55),
            u: v.normally === 'closed' ? 0 : 1,
          }
        }),
    [built],
  )
  const mesh = useMemo(() => {
    const g = flagGeometry()
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    const im = new THREE.InstancedMesh(g, m, Math.max(1, items.length))
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, items.length) * 3), 3)
    im.frustumCulled = false
    im.raycast = () => null
    im.name = 'ValveFlags'
    im.count = items.length
    return im
  }, [items])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )

  const update = (t: number, dt: number) => {
    items.forEach((it, i) => {
      const sv = simValve(it.tag)
      const shown = it.always || !!sv
      const target = sv && Number.isFinite(sv.pos) ? THREE.MathUtils.clamp(sv.pos, 0, 1) : it.normally === 'closed' ? 0 : 1
      it.u += (target - it.u) * Math.min(1, dt * 6)
      if (Math.abs(target - it.u) < 1e-3) it.u = target
      if (!shown) {
        mesh.setMatrixAt(i, _m.makeScale(0, 0, 0))
        return
      }
      _r.makeRotationAxis(_y, it.quarter ? -(1 - it.u) * (Math.PI / 2) : 0)
      _s.makeScale(it.size, it.size, it.size)
      mesh.setMatrixAt(i, _m.copy(it.base).multiply(_r).multiply(_s))
      // colour: stuck → amber blink; else red → green with travel, blinking while it strokes
      const cmdTarget = sv ? (sv.cmd === 'closed' ? 0 : 1) : target
      const stroking = sv && !sv.fault && Math.abs(cmdTarget - sv.pos) > 0.02 && sv.pos > 0.005 && sv.pos < 0.995
      if (sv?.fault === 'stuck') _c.copy(AMBER).multiplyScalar(0.35 + 0.85 * square(t, 1.5))
      else {
        _c.copy(RED).lerp(GREEN, it.u)
        if (stroking) _c.multiplyScalar(0.4 + 0.6 * square(t, 2.5))
      }
      mesh.setColorAt(i, _c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  // (useFrame runs before each render, so the first frame is posed too; instanceColor exists from the
  // start so the shader compiles with per-instance colours)
  useFrame((state, dt) => update(state.clock.elapsedTime, Math.min(dt, 0.1)))

  return items.length ? <primitive object={mesh} /> : null
}
