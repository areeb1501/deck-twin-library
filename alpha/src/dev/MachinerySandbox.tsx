/**
 * Machinery sandbox: /?sandbox=machinery[&focus=valves|psv|instruments|pump|compressor|chem|module|manifold|all]
 */
import { SandboxCanvas } from './SandboxCanvas'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { ValveModel } from '../scene/equipment/Valve'
import { InstrumentModel } from '../scene/equipment/Instrument'
import * as THREE from 'three'
import type { InstrumentType, ValveType } from '../model/types'
import { materials, setXray } from '../three/materials'
import { pipeOD } from '../model/catalog'
import { nozzle } from '../model/geom'
import type { ChemSkid, CompressorPackage, Manifold, Module, PumpPackage } from '../model/types'
import { ModuleModel } from '../scene/equipment/Module'
import { ChemSkidModel } from '../scene/equipment/ChemSkid'
import { CompressorPackageModel } from '../scene/equipment/CompressorPackage'
import { ManifoldModel } from '../scene/equipment/Manifold'
import { PumpPackageModel } from '../scene/equipment/PumpPackage'

const VALVES: ValveType[] = ['gate', 'globe', 'ball', 'check', 'butterfly', 'control', 'esdv', 'bdv', 'psv', 'needle']
const SIZES = [2, 6, 10]

const FOCUS: Record<string, { camera: [number, number, number]; target: [number, number, number] }> = {
  all: { camera: [30, 22, 50], target: [6, 0, 14] },
  valves: { camera: [10, 6, 34], target: [10, 0.8, 24] },
  psv: { camera: [19, 2.2, 27], target: [17.6, 0.9, 24] },
  pump: { camera: [3.2, 2.2, 3.4], target: [0, 0.7, 0] },
  manifold: { camera: [16.5, 3.6, 17.5], target: [12, 1.0, 11.6] },
  compressor: { camera: [19, 6, 9], target: [12, 1.2, 0] },
  chem: { camera: [-3.2, 3.4, 4.6], target: [-7, 1.0, 0] },
  module: { camera: [-1, 5, 22], target: [-9, 1.5, 11] },
  combos: { camera: [11, 4, 35], target: [11, 1, 28.5] },
  instruments: { camera: [5, 2.2, 35.5], target: [5, 1.2, 32] },
  bridle: { camera: [17.5, 2.2, 34], target: [14.6, 1.4, 32] },
}

// ---------------------------------------------------------------- sample equipment records (module level)
function mkPump(tag: string, position: [number, number, number], rotationY: number, stages: number, kw: number): PumpPackage {
  const p: PumpPackage = {
    kind: 'pumpPackage', tag, name: 'Sample pump', system: 'oilExport', position, rotationY, stages, motorKw: kw,
    baseplate: [3.4, 1.25], nozzles: [], design: {},
  }
  p.nozzles.push(nozzle(p, 'N1', 'Suction', [1.05, 0.8, 0], [1, 0, 0], 8, 0.25))
  p.nozzles.push(nozzle(p, 'N2', 'Discharge', [0.65, 1.15, 0], [0, 1, 0], 6, 0.25))
  return p
}
const PUMP_A = mkPump('P-1500A', [0, 0, 0], 0, 2, 450)
const PUMP_B = mkPump('P-1500B', [0, 0, -3.5], Math.PI * 0.75, 1, 90)

const MANIFOLD: Manifold = {
  kind: 'manifold', tag: 'M-1000', name: 'Production / Test Manifold', system: 'production',
  position: [12, 0, 12], rotationY: 0, slots: 4, length: 4.2,
  headers: [
    { name: 'Production header', nps: 12, y: 1.1, z: 0 },
    { name: 'Test header', nps: 6, y: 1.1, z: -1.0 },
  ],
  nozzles: [], design: {},
}
MANIFOLD.nozzles.push(nozzle(MANIFOLD, 'N1', 'Production header outlet', [2.1, 1.1, 0], [1, 0, 0], 12, 0.3, 600))
MANIFOLD.nozzles.push(nozzle(MANIFOLD, 'N2', 'Test header outlet', [2.1, 1.1, -1.0], [1, 0, 0], 6, 0.3, 600))

const COMPRESSOR: CompressorPackage = {
  kind: 'compressorPackage', tag: 'K-2200', name: 'Export Gas Compressor', system: 'gasCompression',
  skid: [11, 4], motorKw: 6500, position: [12, 0, 0], rotationY: 0, nozzles: [], design: {},
}
COMPRESSOR.nozzles.push(nozzle(COMPRESSOR, 'N1', 'Suction', [3.4, 2.55, 0], [0, 1, 0], 10, 0.35, 600))
COMPRESSOR.nozzles.push(nozzle(COMPRESSOR, 'N2', 'Discharge', [2.2, 2.55, 0], [0, 1, 0], 8, 0.35, 900))

const CHEM: ChemSkid = {
  kind: 'chemSkid', tag: 'C-1700', name: 'Chemical Injection Package', system: 'utilities',
  skid: [3.4, 2.6], tanks: 3, position: [-7, 0, 0], rotationY: 0.4, nozzles: [], design: {},
}
CHEM.nozzles.push(nozzle(CHEM, 'N1', 'Injection outlet', [1.7, 1.45, 1.18], [1, 0, 0], 1, 0.15, 600))

const LER: Module = {
  kind: 'module', tag: 'B-9100', name: 'Local Equipment Room (LER)', system: 'utilities',
  size: [9, 3.8, 7], position: [-9, 0, 11], rotationY: 0, nozzles: [], design: {},
}

/** Equipment is wrapped exactly the way the lead does it: position + rotationY. */
function Placed({ eq, children }: { eq: { position: [number, number, number]; rotationY: number }; children: React.ReactNode }) {
  return (
    <group position={eq.position} rotation-y={eq.rotationY}>
      {children}
    </group>
  )
}

/** The (type, nps, actuator) combinations the plant actually uses, at z = 28.5. */
const COMBOS: { t: ValveType; nps: number; a?: NonNullable<import('../model/types').Valve['actuator']>; out?: number }[] = [
  { t: 'gate', nps: 8, a: 'gear' },
  { t: 'ball', nps: 6, a: 'electric' },
  { t: 'butterfly', nps: 4, a: 'electric' },
  { t: 'butterfly', nps: 8, a: 'gear' },
  { t: 'esdv', nps: 12, a: 'pistonSpring' },
  { t: 'ball', nps: 3, a: 'lever' },
  { t: 'ball', nps: 6, a: 'gear' },
  { t: 'control', nps: 4, a: 'diaphragm' },
  { t: 'gate', nps: 3, a: 'handwheel' },
  { t: 'psv', nps: 4, out: 6 },
  { t: 'psv', nps: 3 },
]
function ComboRow() {
  return (
    <group position={[0, 0, 28.5]}>
      {COMBOS.map((c, i) => (
        <group key={i} position={[i * 2.2, c.t === 'psv' ? 0.6 : 1.0, 0]}>
          <ValveModel type={c.t} nps={c.nps} actuator={c.a} outletNps={c.out} rating={c.t === 'esdv' ? 600 : 300} />
        </group>
      ))}
    </group>
  )
}

const INSTRUMENTS: InstrumentType[] = ['PT', 'PI', 'PDT', 'PG', 'TT', 'TG', 'FT', 'AT', 'FD', 'GD', 'OGD', 'HD', 'SD', 'MAC']
const BRIDLE_Q = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)),
)

/** Instruments on an 8" sample pipe (along X, y = 1.0, z = 32) + LT/LG on a vertical vessel. */
function InstrumentRow() {
  const m = materials()
  const od = pipeOD(8)
  return (
    <group position={[0, 0, 32]}>
      <mesh material={m.pipePaint} position={[6, 1.0, 0]} rotation-z={Math.PI / 2} castShadow receiveShadow>
        <cylinderGeometry args={[od / 2, od / 2, 14, 32]} />
      </mesh>
      {INSTRUMENTS.map((t, i) => (
        <group key={t} position={[i * 1.4, 1.0 + od / 2, 0]}>
          <InstrumentModel type={t} hostOd={od} tag={`${t}-11${i}0`} />
        </group>
      ))}
      {/* vertical vessel stand-in for the bridle instruments */}
      <mesh material={m.equipmentPaint} position={[14, 1.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.8, 0.8, 3.2, 48]} />
      </mesh>
      {(['LT', 'LG'] as InstrumentType[]).map((t, i) => (
        <group key={t} position={[14 + 0.8 * Math.cos(i ? 0.5 : -0.5), 0.6, 0.8 * Math.sin(i ? 0.5 : -0.5)]} rotation-y={i ? -0.5 : 0.5}>
          <group quaternion={BRIDLE_Q}>
            <InstrumentModel type={t} hostOd={1.6} tag={`${t}-1120`} size={1.6} />
          </group>
        </group>
      ))}
    </group>
  )
}

function ValveRows() {
  return (
    <group position={[0, 0, 20]}>
      {SIZES.map((nps, row) =>
        VALVES.map((t, i) => {
          const n = t === 'needle' ? [0.5, 0.75, 1][row] : nps
          const y = t === 'psv' ? 0.6 : 1.0
          return (
            <group key={`${t}-${nps}`} position={[i * 2.2, y, row * 2.6]}>
              <ValveModel type={t} nps={n} open={row !== 1} />
              {t !== 'psv' && (
                <mesh material={materials().pipePaint} rotation-z={Math.PI / 2} position={[0, 0, 0]}>
                  <cylinderGeometry args={[pipeOD(n) / 2 * 0.98, pipeOD(n) / 2 * 0.98, 0.02, 16]} />
                </mesh>
              )}
            </group>
          )
        }),
      )}
    </group>
  )
}

/** Dev hook: window.__cam([x,y,z],[tx,ty,tz]) moves the camera without a reload. */
function CamHook() {
  const { camera, controls, invalidate, scene, gl } = useThree()
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__cam = (p: [number, number, number], t: [number, number, number]) => {
      camera.position.set(...p)
      const c = controls as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null
      c?.target.set(...t)
      c?.update()
      invalidate()
    }
    ;(window as unknown as Record<string, unknown>).__scene = scene
    ;(window as unknown as Record<string, unknown>).__gl = gl
    ;(window as unknown as Record<string, unknown>).__xray = setXray
  }, [camera, controls, invalidate, scene, gl])
  return null
}

export default function MachinerySandbox() {
  const focus = new URLSearchParams(location.search).get('focus') ?? 'all'
  let f = FOCUS[focus] ?? FOCUS.all
  // focus=v:<type>:<row>  (row 0/1/2 = 2"/6"/10") -> close-up of one valve
  if (focus.startsWith('v:')) {
    const [, t, r] = focus.split(':')
    const i = Math.max(0, VALVES.indexOf(t as ValveType))
    const row = Number(r ?? 1)
    const s = [0.8, 1.4, 2.2][row] ?? 1.4
    const tgt: [number, number, number] = [i * 2.2, (t === 'psv' ? 0.6 : 1.0) + s * 0.25, 20 + row * 2.6]
    f = { target: tgt, camera: [tgt[0] + s * 0.9, tgt[1] + s * 0.45, tgt[2] + s * 1.2] }
  }
  return (
    <SandboxCanvas camera={f.camera} target={f.target}>
      <ValveRows />
      <InstrumentRow />
      <ComboRow />
      <Placed eq={COMPRESSOR}><CompressorPackageModel eq={COMPRESSOR} /></Placed>
      <Placed eq={CHEM}><ChemSkidModel eq={CHEM} /></Placed>
      <Placed eq={LER}><ModuleModel eq={LER} /></Placed>
      <Placed eq={MANIFOLD}><ManifoldModel eq={MANIFOLD} /></Placed>
      <Placed eq={PUMP_A}><PumpPackageModel eq={PUMP_A} /></Placed>
      <Placed eq={PUMP_B}><PumpPackageModel eq={PUMP_B} /></Placed>
      <CamHook />
    </SandboxCanvas>
  )
}
