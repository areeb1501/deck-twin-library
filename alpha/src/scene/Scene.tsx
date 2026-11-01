/**
 * The 3D viewport: sky/ocean/jacket (world frame) + the production deck group at EL +28 m
 * holding structure, equipment, piping, instruments and flow. Handles picking, section box,
 * x-ray, outline of the selection, camera presets and fly-to.
 */
import { Canvas, advance, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import CameraControlsImpl from 'camera-controls'
import { LabelProjector } from '../ui/labels'
import { EffectComposer, N8AO, Outline, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { isAlphaField, usePlantStore } from '../state/plantStore'
import { plantRenderer } from './customPlant'
import type { PickData } from '../model/types'
import { DECK_WORLD_Y, useStore, type CameraPreset } from '../state/store'
import { setSectionBox, setXray } from '../three/materials'
import { buildPiping } from './piping/build'
import { footprints } from '../model/footprint'
import { Piping } from './piping/Piping'
import { FlowParticles } from './piping/FlowParticles'
import { EquipmentLayer } from './EquipmentLayer'
import { DeckStructure } from './structure/DeckStructure'
import { GradePad } from './structure/GradePad'
import { NozzleMarkers } from '../ui/builder/NozzleMarkers'
import { WalkDriver, leaveWalk } from './Walk'
import { CraneCabDriver } from './CraneCab'
import { Workers } from './Workers'
import { CctvRenderer } from './CctvRenderer'
import { InspectionUnits } from './InspectionUnits'
import { InspectionRecorder } from './InspectionRecorder'
import { CorrosionTint } from './CorrosionTint'
import { IsolationOverlay } from './IsolationOverlay'
import { FireGasOverlay } from './FireGasOverlay'
import { FgCoverageOverlay } from './FgCoverageOverlay'
import { HazardAreaOverlay } from './HazardAreaOverlay'
import { GasCloud } from './GasCloud'
import { DeckLights } from './env/DeckLights'
import { AdaptiveQuality } from './perf/AdaptiveQuality'
import { DetailCull } from './perf/DetailCull'
import { StaticBatcher } from './perf/StaticBatcher'
import { QUALITY, useQuality } from './perf/quality'
import { patchN8AO } from './perf/n8aoFix'
// perf: the plant re-renders on select / hover; keep its big static children from re-rendering with it
const FireGasMounts = memo(FireGasMountsRaw)
import { requestShadows, shadowTick } from './perf/shadows'
import { holdFrames, releaseFrames } from './perf/bootGate'
import { FireGasMounts as FireGasMountsRaw } from './FireGasMounts'
import { useSim } from '../state/sim'
import { bootDone, bootStage } from '../ui/bootLoader'
import { EyeProjector } from '../ui/Eyes'
import type { ComponentType } from 'react'

// environment modules are resolved by name so the app runs while they are being built
const envMods = import.meta.glob('./env/*.tsx', { eager: true }) as Record<string, Record<string, unknown>>
function envGet<P>(name: string, fallback: ComponentType<P>): ComponentType<P> {
  for (const m of Object.values(envMods)) if (m[name]) return m[name] as ComponentType<P>
  return fallback
}
const Surroundings = envGet<{ upperDeck?: boolean }>('Surroundings', () => null)
const Ocean = envGet<object>('Ocean', () => null)
const SkyAndLights = envGet<object>('SkyAndLights', () => (
  <>
    <color attach="background" args={['#9fb6c8']} />
    <hemisphereLight args={['#dfe9f2', '#5b5f63', 1.0]} />
    <directionalLight position={[60, 90, 40]} intensity={2.5} />
  </>
))

const noRaycast = () => null
/** longest the loader stays up after the first frame, whatever the batcher is doing */
const BOOT_CAP_MS = 12_000
// the walkthrough person (scene/Avatar.tsx), resolved by name so the scene runs without it
const avatarMod = import.meta.glob('./Avatar.tsx', { eager: true }) as Record<string, Record<string, unknown>>
const Avatar = (Object.values(avatarMod)[0]?.Avatar ?? (() => null)) as ComponentType<object>
/** onshore plants keep the same world height so camera presets & section box still apply */
const GRADE_Y = DECK_WORLD_Y
const DEBUG = new URLSearchParams(location.search)

/** Disable raycasting for a subtree (structure, environment) so picks go through it. */
function NoPick({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    const apply = () => ref.current?.traverse((o) => ((o as THREE.Mesh).raycast = noRaycast))
    apply()
    const id = setInterval(apply, 1500) // children may mount lazily
    const stop = setTimeout(() => clearInterval(id), 12000)
    return () => {
      clearInterval(id)
      clearTimeout(stop)
    }
  }, [])
  return <group ref={ref}>{children}</group>
}

function findPick(o: THREE.Object3D | null, instanceId?: number): PickData | null {
  if (o && instanceId !== undefined && o.userData.instanceTags) {
    const tag = o.userData.instanceTags[instanceId]
    if (tag) return { tag, kind: o.userData.instanceKind }
  }
  while (o) {
    if (o.userData?.pick) return o.userData.pick as PickData
    o = o.parent
  }
  return null
}

const PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number]; ceiling?: boolean }> = {
  overview: { pos: [92, 58, 112], target: [0, 31, 0] },
  deck: { pos: [31, 34.5, 27], target: [-4, 30, -3] },
  plan: { pos: [6, 104, 46], target: [0, 28, 0], ceiling: false },
  rack: { pos: [-29, 34.5, 4.5], target: [6, 33.5, -0.5] },
  separator: { pos: [-1.5, 35.5, -21], target: [-12.5, 30.8, -10] },
  compressor: { pos: [-2, 33, 17], target: [4.5, 30, 7] },
  underdeck: { pos: [36, 22, 44], target: [0, 27, 0] },
  field: { pos: [-188, 186, 150], target: [-26, 6, -34] }, // all five platforms: WI, WHP-N, RP, Alpha, LQ
  whp: { pos: [58, 46, -118], target: [12, 28, -74] },
  bridgeN: { pos: [12, 29.7, -22.5], target: [12, 29.5, -60] },
  rp: { pos: [-48, 50, 18], target: [-84, 28, -14] },
  wi: { pos: [52, 48, -110], target: [11, 29, -142] },
  rig: { pos: [88, 84, -80], target: [3, 64, -13] },
  wellbay: { pos: [14, 23, -2], target: [3, 21, -13] },
  lq: { pos: [52, 46, 112], target: [8, 34, 72] },
  bridge: { pos: [6, 29.7, 16], target: [6, 29.5, 40] },
}

function Rig({ root }: { root: React.RefObject<THREE.Group | null> }) {
  const controls = useRef<CameraControls>(null)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const focus = useStore((s) => s.focus)
  const preset = useStore((s) => s.preset)
  const sectionAround = useStore((s) => s.sectionAround)
  const flyTo = useStore((s) => s.flyTo)
  const walk = useStore((s) => s.walk)
  const craneCab = useStore((s) => s.craneCab)
  const wasWalking = useRef(false)
  useEffect(() => {
    // a preset / fly-to that ended the walk runs its own transition right after this effect
    if (wasWalking.current && !walk && controls.current) leaveWalk(controls.current)
    wasWalking.current = walk
  }, [walk])

  useEffect(() => {
    if (flyTo && controls.current) controls.current.setLookAt(...flyTo.position, ...flyTo.target, true)
  }, [flyTo])

  // mouse: drag orbits, Shift + drag pans (replaces right-drag pan), wheel zooms
  useEffect(() => {
    const A = CameraControlsImpl.ACTION
    const c = controls.current
    if (!c) return
    c.mouseButtons.right = A.NONE
    const set = (shift: boolean) => {
      c.mouseButtons.left = shift ? A.TRUCK : A.ROTATE
    }
    const down = (e: KeyboardEvent) => e.key === 'Shift' && set(true)
    const up = (e: KeyboardEvent) => e.key === 'Shift' && set(false)
    const blur = () => set(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const boxOf = (tag: string) => {
    const box = new THREE.Box3()
    root.current?.traverse((o) => {
      if (o.userData?.pick?.tag === tag) box.expandByObject(o)
    })
    return box
  }

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const p = PRESETS.overview
    c.setLookAt(...p.pos, ...p.target, false)
    // dev: the demo-video recorder (video/) drives the camera directly; checks query the scene graph
    if (import.meta.env.DEV) Object.assign(window, { __controls: c, __scene: scene })
  }, [scene])

  useEffect(() => {
    if (!preset || !controls.current) return
    const p = PRESETS[preset.name]
    useStore.getState().setLayer('ceiling', p.ceiling ?? true)
    controls.current.setLookAt(...p.pos, ...p.target, true)
  }, [preset])

  useEffect(() => {
    if (!focus || !controls.current || useStore.getState().walk) return // the walker handles "walk to"
    const box = boxOf(focus.tag)
    if (box.isEmpty()) return
    const c = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3()).length()
    const dist = THREE.MathUtils.clamp(size * 1.25, 2.2, 40)
    // keep the current viewing direction, but never look from below the deck or from too high
    const dir = camera.position.clone().sub(c).normalize()
    dir.y = THREE.MathUtils.clamp(dir.y, 0.12, 0.6)
    dir.normalize()
    const pos = c.clone().addScaledVector(dir, dist)
    controls.current.setLookAt(pos.x, pos.y, pos.z, c.x, c.y, c.z, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus])

  useEffect(() => {
    if (!sectionAround) return
    const box = boxOf(sectionAround.tag)
    if (box.isEmpty()) return
    const c = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const toCam = camera.position.clone().sub(c)
    // keep a generous neighbourhood (deck plate included) and slice the item open along its
    // long horizontal axis, removing the half that faces the camera
    const pad = 6
    const min: [number, number, number] = [box.min.x - pad, Math.min(box.min.y - DECK_WORLD_Y, 0) - 0.6, box.min.z - pad]
    const max: [number, number, number] = [box.max.x + pad, box.max.y - DECK_WORLD_Y + 1.5, box.max.z + pad]
    if (size.x >= size.z) {
      if (toCam.z > 0) max[2] = c.z
      else min[2] = c.z
    } else {
      if (toCam.x > 0) max[0] = c.x
      else min[0] = c.x
    }
    useStore.getState().setSection({ enabled: true, min, max })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionAround])

  return (
    <>
    {walk && <WalkDriver controls={controls} root={root} />}
    {craneCab && !walk && <CraneCabDriver controls={controls} />}
    <CameraControls
      ref={controls}
      enabled={!walk && !craneCab}
      makeDefault
      minDistance={0.6}
      maxDistance={900}
      dollyToCursor
      smoothTime={0.35}
      draggingSmoothTime={0.08}
    />
    </>
  )
}

function Effects({ selectedObjs }: { selectedObjs: THREE.Object3D[] }) {
  const viewMode = useStore((s) => s.viewMode)
  const section = useStore((s) => s.section.enabled)
  const ao = useQuality((s) => QUALITY.ao[s.level])
  // perf: the outline stays mounted — with an empty selection it renders nothing (OutlineEffect.update
  // skips its depth / mask passes), and mounting it on select recompiled the effect shader (~1 s hitch)
  return (
    <EffectComposer autoClear={false} multisampling={0}>
      <N8AO ref={patchN8AO} enabled={ao && viewMode === 'shaded' && !section} halfRes aoRadius={1.3} distanceFalloff={0.6} intensity={3} quality="medium" />
      <Outline selection={selectedObjs} edgeStrength={3.2} visibleEdgeColor={0xffffff} hiddenEdgeColor={0x000000} xRay={false} blur pulseSpeed={0} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

function Plant() {
  const root = useRef<THREE.Group>(null)
  const layers = useStore((s) => s.layers)
  const viewMode = useStore((s) => s.viewMode)
  const section = useStore((s) => s.section)
  const selected = useStore((s) => s.selected)
  const select = useStore((s) => s.select)
  const hover = useStore((s) => s.hover)
  const plant = usePlantStore((s) => s.plant)
  const Custom = plant.custom && plantRenderer(plant.custom.renderer)
  // a custom renderer draws its own pipes: the plant's lines stay as data for the tree and the inspector
  const built = useMemo(() => buildPiping(plant.custom ? { ...plant, lines: [], valves: [], instruments: [] } : plant), [plant])
  const solid = useMemo(() => footprints(plant.equipment), [plant])
  const offshore = (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha'
  const [selObjs, setSelObjs] = useState<THREE.Object3D[]>([])
  const cullRoots = useMemo(() => [root], [])

  useLayoutEffect(() => setXray(viewMode === 'xray'), [viewMode])
  // with the weather deck hidden, everything that rises into it is cut cleanly at ceiling level
  const ceilingCut = offshore && !layers.ceiling
  useLayoutEffect(() => {
    const max: [number, number, number] = [...section.max]
    const min: [number, number, number] = section.enabled ? [...section.min] : [-1e4, -1e4, -1e4]
    if (!section.enabled) max.splice(0, 3, 1e4, 1e4, 1e4)
    if (ceilingCut) max[1] = Math.min(max[1], 9.45)
    setSectionBox(section.enabled || ceilingCut, min, max, DECK_WORLD_Y)
  }, [section, ceilingCut])

  useEffect(() => {
    if (!selected) return setSelObjs([])
    const out: THREE.Object3D[] = []
    // let new children mount first
    const id = requestAnimationFrame(() => {
      root.current?.traverse((o) => {
        if (o.userData?.pick?.tag === selected.tag) o.traverse((c) => (c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh && out.push(c))
      })
      setSelObjs(out)
    })
    return () => cancelAnimationFrame(id)
  }, [selected])

  const lastHover = useRef<string | null>(null)
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const p = findPick(e.object, e.instanceId)
    const key = p ? p.tag : null
    if (key !== lastHover.current) {
      lastHover.current = key
      hover(p)
      document.body.style.cursor = p ? 'pointer' : ''
    }
  }
  const onOut = () => {
    lastHover.current = null
    hover(null)
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return
    e.stopPropagation()
    // a door leaf: open / close it instead of selecting the building
    const door = e.object.userData?.door as { tag: string; id: string } | undefined
    if (door) return useSim.getState().toggleDoor(`${door.tag}/${door.id}`)
    const p = findPick(e.object, e.instanceId)
    if (p) select(p)
  }

  const flowVisible = layers.flow && (viewMode === 'xray' || section.enabled)

  return (
    <>
      <Rig root={root} />
      <DetailCull roots={cullRoots} />
      <StaticBatcher root={root} />
      <LabelProjector equipment={plant.equipment} worldY={offshore ? DECK_WORLD_Y : GRADE_Y} />
      {!DEBUG.has('nofx') && <Effects selectedObjs={selObjs} />}
      <group position={[0, offshore ? DECK_WORLD_Y : GRADE_Y, 0]}>
        {layers.structure && (
          <NoPick>
            {offshore ? <DeckStructure solidAreas={solid} ceiling={layers.ceiling} /> : plant.deck.site !== 'none' && <GradePad plant={plant} />}
          </NoPick>
        )}
        <group ref={root} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick}>
          {Custom ? layers.equipment && <Custom plant={plant} /> : layers.equipment && <EquipmentLayer equipment={plant.equipment} />}
          <Piping built={built} />
          {layers.instruments && <FireGasMounts built={built} />}
        </group>
        <FlowParticles key={plant.name + plant.lines.length} built={built} visible={flowVisible} />
        <NozzleMarkers />
        <IsolationOverlay built={built} />
        <FireGasOverlay built={built} />
        <FgCoverageOverlay built={built} />
        <HazardAreaOverlay />
        <GasCloud />
        <EyeProjector built={built} />
      </group>
    </>
  )
}

/**
 * ?tick: drive frames with a timer (rAF is paused while the page is hidden, e.g. during
 * automated checks) and expose window.__snap(name) which renders a frame and saves it via
 * the dev server (see vite.config.ts).
 */
let glRef: THREE.WebGLRenderer | null = null
if (import.meta.env.DEV) Object.assign(window, { __store: useStore, __plantStore: usePlantStore })
if (DEBUG.has('tick')) {
  const w = window as unknown as Record<string, unknown>
  w.__snap = async (name: string, quality = 0.85) => {
    if (!glRef) return 'no-gl'
    advance(performance.now())
    const url = glRef.domElement.toDataURL('image/jpeg', quality)
    await fetch(`/__snap?name=${encodeURIComponent(name)}`, { method: 'POST', body: url })
    return url.length
  }
  setInterval(() => glRef && advance(performance.now()), 150)
}

/**
 * The sun is static and the plant only changes on user action, so the shadow map is re-rendered
 * on demand (a few frames after any change) instead of every frame — roughly halves GPU work.
 */
function ShadowOnDemand() {
  const gl = useThree((s) => s.gl)
  const layers = useStore((s) => s.layers)
  const section = useStore((s) => s.section)
  const viewMode = useStore((s) => s.viewMode)
  const plant = usePlantStore((s) => s.plant)
  const first = useRef(true)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    // perf: time-based settle window (perf/shadows.ts) — materials / lazy mounts settle over the first seconds
    requestShadows(first.current ? 6000 : 2500)
    first.current = false
  }, [gl, layers, section, viewMode, plant])
  useFrame(() => {
    if (shadowTick(performance.now())) gl.shadowMap.needsUpdate = true
  })
  return null
}

/** after the first full frame, rest the renderer behind the loader until the batcher finishes, with a cap in case it doesn't */
function BootWatch() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const seen = useRef(false)
  useFrame(() => {
    if (seen.current) return
    seen.current = true
    bootStage('Preparing the view')
    const batching = !DEBUG.has('nobatch') && gl.extensions.has('WEBGL_multi_draw')
    // this first frame still draws everything: skipping it saves little and leaves the first x-ray click to pay for it
    requestAnimationFrame(() => batching && holdFrames(camera))
    setTimeout(() => {
      releaseFrames()
      requestAnimationFrame(() => requestAnimationFrame(bootDone))
    }, batching ? BOOT_CAP_MS : 400)
  })
  return null
}

/** simulated field workers (on by default on the Alpha field — Toolbar → Workers) */
function FieldWorkers() {
  const on = useStore((s) => s.workers)
  const alpha = usePlantStore((s) => isAlphaField(s.plant))
  return on && alpha ? <Workers /> : null
}

/** simulated inspection units and their bay (off until an Inspect action turns them on) */
function Inspections() {
  const on = useStore((s) => s.inspection)
  const alpha = usePlantStore((s) => isAlphaField(s.plant))
  if (!on || !alpha) return null
  return (
    <>
      <InspectionUnits />
      <InspectionRecorder />
      <CorrosionTint />
    </>
  )
}

function WalkAvatar() {
  const show = useStore((s) => s.walk && s.walkView === 'third')
  return show ? <Avatar /> : null
}

export function Scene() {
  const layers = useStore((s) => s.layers)
  const viewMode = useStore((s) => s.viewMode)
  const offshore = usePlantStore((s) => (s.plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha')
  const select = useStore((s) => s.select)
  return (
    <Canvas
      frameloop={DEBUG.has('tick') ? 'never' : 'always'}
      shadows="percentage"
      dpr={[1, 1.75]}
      camera={{ fov: 38, near: 0.1, far: 12000, position: [92, 58, 112] }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl, scene, camera }) => {
        gl.localClippingEnabled = true
        glRef = gl
        if (import.meta.env.DEV) Object.assign(window, { __scene: scene, __gl: gl, __camera: camera })
      }}
      onPointerMissed={(e) => {
        if ((e as MouseEvent).type === 'click') select(null)
      }}
    >
      <BootWatch />
      <ShadowOnDemand />
      <AdaptiveQuality />
      <Suspense fallback={null}>
        {DEBUG.has('nosky') ? <><color attach="background" args={['#9fb6c8']} /><hemisphereLight args={['#fff', '#555', 2]} /></> : <SkyAndLights />}
        {!DEBUG.has('nosky') && <DeckLights />}
        {layers.environment && offshore && !DEBUG.has('noenv') && (
          <NoPick>
            <Ocean />
            <Surroundings upperDeck={layers.ceiling && viewMode !== 'xray'} />
          </NoPick>
        )}
        <Plant />
        {/* after Plant (which holds the walker) so the person draws this frame's pose */}
        <WalkAvatar />
        <FieldWorkers />
        <Inspections />
        {offshore && <CctvRenderer />}
      </Suspense>
    </Canvas>
  )
}
