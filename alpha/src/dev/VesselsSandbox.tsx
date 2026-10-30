/**
 * Vessels sandbox: /?sandbox=vessels            (sample records built here)
 *                  /?sandbox=vessels&set=plant  (the real records from model/plant.ts)
 * Buttons: section box (cuts z > 0), x-ray, camera focus. Shows renderer draw calls.
 * Dev hook: window.__cam([x,y,z],[tx,ty,tz]).
 */
import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SandboxCanvas } from './SandboxCanvas'
import { setSectionBox, setXray } from '../three/materials'
import { headDepth, headSurface, nozzle } from '../model/geom'
import { pipeOD } from '../model/catalog'
import type { Equipment, HorizontalVessel, PigTrap, ShellTube, VerticalVessel } from '../model/types'
import { plant } from '../model/plant'
import { HorizontalVesselModel } from '../scene/equipment/HorizontalVessel'
import { VerticalVesselModel } from '../scene/equipment/VerticalVessel'
import { ShellTubeModel } from '../scene/equipment/ShellTube'
import { PigTrapModel } from '../scene/equipment/PigTrap'

type VesselEq = HorizontalVessel | VerticalVessel | ShellTube | PigTrap

// ------------------------------------------------------------------ sample records
function samples(): VesselEq[] {
  const out: VesselEq[] = []

  // 3-phase separator, top inlet, boot, mesh pad
  {
    const v: HorizontalVessel = {
      kind: 'horizontalVessel',
      tag: 'V-9001',
      name: '3-Phase Separator (sample)',
      system: 'production',
      id: 3.6,
      tt: 12,
      wall: 0.045,
      elevation: 1.3,
      saddles: [-3.6, 3.6],
      boots: [{ x: 2.4, d: 0.9, l: 0.9 }],
      internals: ['inletDiverter', 'perforatedBaffle', 'weir', 'meshPad', 'vortexBreaker'],
      levels: { water: 0.3, oil: 0.55 },
      position: [0, 1.3 + 1.845, 0],
      rotationY: 0,
      nozzles: [],
      design: {},
    }
    const Ro = v.id / 2 + v.wall
    v.nozzles.push(nozzle(v, 'N1', 'Inlet', [-4.6, Ro, 0], [0, 1, 0], 16, 0.45))
    v.nozzles.push(nozzle(v, 'N2', 'Gas outlet', [4.9, Ro, 0], [0, 1, 0], 12, 0.45))
    v.nozzles.push(nozzle(v, 'N3', 'Oil outlet', [5.2, -Ro, 0], [0, -1, 0], 8, 0.4))
    v.nozzles.push(nozzle(v, 'N4', 'Water outlet (boot)', [2.4, -Ro - 0.55, -0.45], [0, 0, -1], 6, 0.3))
    v.nozzles.push(nozzle(v, 'N5', 'PSV connection', [3.0, Ro, 0], [0, 1, 0], 6, 0.35))
    for (const [id, y] of [['N6', 0.6], ['N7', -1.2]] as const) {
      v.nozzles.push(nozzle(v, id, 'LT bridle', [-1.0, y, -Math.sqrt(Ro * Ro - y * y)], [0, 0, -1], 2, 0.3))
    }
    v.nozzles.push(nozzle(v, 'N8', 'Drain', [-5.2, -Ro, 0], [0, -1, 0], 2, 0.3))
    out.push(v)
  }

  // insulated test separator, head inlet, vane pack
  {
    const v: HorizontalVessel = {
      kind: 'horizontalVessel',
      tag: 'V-9002',
      name: 'Test Separator (sample, insulated)',
      system: 'production',
      id: 1.8,
      tt: 6,
      wall: 0.028,
      elevation: 1.1,
      saddles: [-1.9, 1.9],
      internals: ['inletDiverter', 'perforatedBaffle', 'weir', 'vanePack', 'vortexBreaker'],
      levels: { water: 0.25, oil: 0.5 },
      insulated: true,
      position: [0, 1.1 + 0.928, 0],
      rotationY: 0,
      nozzles: [],
      design: {},
    }
    const Ro = v.id / 2 + v.wall
    const apex = v.tt / 2 + headDepth(v.id) + v.wall
    v.nozzles.push(nozzle(v, 'N1', 'Inlet', [-apex, 0, 0], [-1, 0, 0], 8, 0.5))
    v.nozzles.push(nozzle(v, 'N2', 'Gas outlet', [2.4, Ro, 0], [0, 1, 0], 6, 0.45))
    v.nozzles.push(nozzle(v, 'N3', 'Oil outlet', [2.7, -Ro, 0], [0, -1, 0], 4, 0.4))
    v.nozzles.push(nozzle(v, 'N4', 'Water outlet', [0.9, -Ro, 0], [0, -1, 0], 3, 0.4))
    v.nozzles.push(nozzle(v, 'N5', 'PSV connection', [1.0, Ro, 0], [0, 1, 0], 4, 0.4))
    out.push(v)
  }

  // vertical compressor suction scrubber on skirt
  {
    const v: VerticalVessel = {
      kind: 'verticalVessel',
      tag: 'V-9003',
      name: 'Suction Scrubber (sample)',
      system: 'gasCompression',
      id: 1.6,
      tt: 4.5,
      wall: 0.035,
      elevation: 1.8,
      support: 'skirt',
      internals: ['inletDiverter', 'meshPad', 'cyclones', 'vortexBreaker'],
      levels: { liquid: 0.16 },
      platform: true,
      position: [0, 0, 0],
      rotationY: 0,
      nozzles: [],
      design: {},
    }
    const r = v.id / 2 + v.wall
    const top = v.elevation + v.tt
    v.nozzles.push(nozzle(v, 'N1', 'Gas inlet', [-r, v.elevation + 2.0, 0], [-1, 0, 0], 12, 0.4))
    v.nozzles.push(nozzle(v, 'N2', 'Gas outlet', [0, top + headDepth(v.id) + v.wall, 0], [0, 1, 0], 10, 0.35))
    v.nozzles.push(nozzle(v, 'N3', 'Liquid outlet', [0, v.elevation - headDepth(v.id) - v.wall, 0], [0, -1, 0], 4, 0.4))
    v.nozzles.push(nozzle(v, 'N4', 'PSV connection', [0.45, top + headSurface(v.id, v.wall, 0.45), 0], [0, 1, 0], 4, 0.35))
    v.nozzles.push(nozzle(v, 'N5', 'LT upper', [r, v.elevation + 1.5, 0], [1, 0, 0], 2, 0.3))
    v.nozzles.push(nozzle(v, 'N6', 'LT lower', [r, v.elevation + 0.25, 0], [1, 0, 0], 2, 0.3))
    out.push(v)
  }

  // AES exchanger
  {
    const v: ShellTube = {
      kind: 'shellTube',
      tag: 'E-9004',
      name: 'Crude Cooler (sample AES)',
      system: 'oilExport',
      temaType: 'AES',
      shellOd: 0.9,
      length: 6,
      channelLength: 0.8,
      tubeCount: 420,
      tubeOd: 0.01905,
      elevation: 0.6,
      position: [0, 0.6 + 0.45, 0],
      rotationY: 0,
      nozzles: [],
      design: {},
    }
    const r = v.shellOd / 2
    const ch = -v.length / 2 - v.channelLength / 2
    v.nozzles.push(nozzle(v, 'N1', 'Shell inlet', [-2.3, r, 0], [0, 1, 0], 8, 0.35))
    v.nozzles.push(nozzle(v, 'N2', 'Shell outlet', [2.3, -r, 0], [0, -1, 0], 8, 0.3))
    v.nozzles.push(nozzle(v, 'N3', 'Channel inlet', [ch, r, 0], [0, 1, 0], 6, 0.3))
    v.nozzles.push(nozzle(v, 'N4', 'Channel outlet', [ch, -0.15, -Math.sqrt(r * r - 0.0225)], [0, 0, -1], 6, 0.3))
    v.nozzles.push(nozzle(v, 'N5', 'Shell vent', [2.6, r, 0], [0, 1, 0], 1, 0.2))
    out.push(v)
  }

  // 12" x 10" pig launcher
  {
    const v: PigTrap = {
      kind: 'pigTrap',
      tag: 'L-9005',
      name: 'Pig Launcher (sample 12x10)',
      system: 'oilExport',
      majorBarrelNps: 12,
      minorBarrelNps: 10,
      length: 4.0,
      elevation: 1.1,
      position: [0, 1.1, 0],
      rotationY: 0,
      nozzles: [],
      design: {},
    }
    const R = pipeOD(12) / 2
    v.nozzles.push(nozzle(v, 'N1', 'Outlet to pipeline', [-2.0, 0, 0], [-1, 0, 0], 10, 0.25, 600))
    v.nozzles.push(nozzle(v, 'N2', 'Kicker inlet', [0.9, R, 0], [0, 1, 0], 6, 0.3, 600))
    v.nozzles.push(nozzle(v, 'N3', 'Vent', [1.5, R, 0], [0, 1, 0], 2, 0.2, 600))
    v.nozzles.push(nozzle(v, 'N4', 'Drain', [1.2, -R, 0], [0, -1, 0], 2, 0.2, 600))
    v.nozzles.push(nozzle(v, 'N5', 'Balance line', [-0.4, R, 0], [0, 1, 0], 2, 0.2, 600))
    out.push(v)
  }
  return out
}

function isVessel(e: Equipment): e is VesselEq {
  return e.kind === 'horizontalVessel' || e.kind === 'verticalVessel' || e.kind === 'shellTube' || e.kind === 'pigTrap'
}

function extentX(e: VesselEq) {
  switch (e.kind) {
    case 'horizontalVessel':
      return e.tt + e.id / 2 + 2.5
    case 'verticalVessel':
      return e.id + 4
    case 'shellTube':
      return e.length + e.channelLength + 3
    case 'pigTrap':
      return e.length + 2.5
  }
}

function Model({ eq }: { eq: VesselEq }) {
  switch (eq.kind) {
    case 'horizontalVessel':
      return <HorizontalVesselModel eq={eq} />
    case 'verticalVessel':
      return <VerticalVesselModel eq={eq} />
    case 'shellTube':
      return <ShellTubeModel eq={eq} />
    case 'pigTrap':
      return <PigTrapModel eq={eq} />
  }
}

interface Slot {
  eq: VesselEq
  x: number
  y: number
}

function CamHook({ onCalls }: { onCalls: (n: number) => void }) {
  const { camera, controls, gl, invalidate, scene } = useThree()
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__cam = (p: [number, number, number], t: [number, number, number]) => {
      camera.position.set(...p)
      const c = controls as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null
      c?.target.set(...t)
      c?.update()
      invalidate()
    }
    // per-vessel draw-call estimate: one call per (visible mesh x material group)
    ;(window as unknown as Record<string, unknown>).__drawCalls = () => {
      const out: Record<string, number> = {}
      scene.traverse((o) => {
        const tag = o.userData?.tag as string | undefined
        if (!tag || o.userData?.kind !== 'equipment') return
        let n = 0
        o.traverse((m) => {
          const mesh = m as THREE.Mesh
          if (!mesh.isMesh || !mesh.visible) return
          n += Array.isArray(mesh.material) ? Math.max(1, mesh.geometry.groups.length) : 1
        })
        out[tag] = n
      })
      return out
    }
    const id = setInterval(() => onCalls(gl.info.render.calls), 500)
    return () => clearInterval(id)
  }, [camera, controls, gl, invalidate, onCalls, scene])
  return null
}

const btn: React.CSSProperties = {
  font: '12px system-ui, sans-serif',
  padding: '6px 10px',
  margin: 2,
  border: '1px solid #445',
  borderRadius: 4,
  background: '#1d2430',
  color: '#e8edf3',
  cursor: 'pointer',
}

export default function VesselsSandbox() {
  const params = new URLSearchParams(location.search)
  const usePlant = params.get('set') === 'plant'
  const slots = useMemo<Slot[]>(() => {
    const list = usePlant ? plant.equipment.filter(isVessel) : samples()
    let x = 0
    return list.map((eq) => {
      const w = extentX(eq)
      const s = { eq, x: x + w / 2, y: eq.position[1] }
      x += w
      return s
    })
  }, [usePlant])
  const total = slots.length ? slots[slots.length - 1].x : 0
  const [section, setSection] = useState(params.get('section') === '1')
  const [xray, setXr] = useState(params.get('xray') === '1')
  const [calls, setCalls] = useState(0)

  useEffect(() => {
    setSectionBox(section, [-1e4, -1e4, -1e4], [1e4, 1e4, 0])
  }, [section])
  useEffect(() => {
    setXray(xray)
  }, [xray])

  const focus = (i: number) => {
    const cam = (window as unknown as { __cam?: (p: number[], t: number[]) => void }).__cam
    if (!cam) return
    if (i < 0) cam([total / 2, 16, 34], [total / 2, 1.5, 0])
    else {
      const s = slots[i]
      const w = extentX(s.eq)
      cam([s.x + w * 0.25, 2.5 + w * 0.25, w * 0.9 + 2], [s.x, 1.6, 0])
    }
  }

  return (
    <>
      <SandboxCanvas camera={[total / 2, 16, 34]} target={[total / 2, 1.5, 0]}>
        <CamHook onCalls={setCalls} />
        {slots.map((s) => (
          <group key={s.eq.tag} position={[s.x, s.y, 0]} rotation-y={s.eq.rotationY} userData={{ tag: s.eq.tag, kind: 'equipment' }}>
            <Model eq={s.eq} />
          </group>
        ))}
      </SandboxCanvas>
      <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 10, maxWidth: '70vw' }}>
        <button style={btn} onClick={() => setSection((v) => !v)}>
          Section z&gt;0: {section ? 'ON' : 'off'}
        </button>
        <button style={btn} onClick={() => setXr((v) => !v)}>
          X-ray: {xray ? 'ON' : 'off'}
        </button>
        <button style={btn} onClick={() => focus(-1)}>
          Wide
        </button>
        {slots.map((s, i) => (
          <button key={s.eq.tag} style={btn} onClick={() => focus(i)}>
            {s.eq.tag}
          </button>
        ))}
        <span style={{ ...btn, background: '#0008', border: 'none' }}>renderer calls (last frame, incl. shadows): {calls} · per-vessel: window.__drawCalls()</span>
      </div>
    </>
  )
}
