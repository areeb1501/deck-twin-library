/**
 * Structure + environment sandbox: /?sandbox=structure
 * Query params: &ceiling=0 (hide upper deck plate/framing/trays), &upper=0 (hide weather-deck items),
 * &cam=aerial|deck|close (initial camera).
 */
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect } from 'react'
import * as THREE from 'three'
import { DeckStructure } from '../scene/structure/DeckStructure'
import { Surroundings } from '../scene/env/Surroundings'
import { Ocean } from '../scene/env/Ocean'
import { SkyAndLights } from '../scene/env/Sky'
import { DECK_WORLD_Y } from '../state/store'

const q = new URLSearchParams(location.search)
const CAMS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  aerial: { pos: [150, 95, 165], target: [0, 24, 0] },
  deck: { pos: [26, DECK_WORLD_Y + 1.7, 13], target: [-5, DECK_WORLD_Y + 2.5, 0] },
  close: { pos: [27.6, DECK_WORLD_Y + 1.6, 18.2], target: [29.5, DECK_WORLD_Y + 0.4, 19.8] },
}
const cam = CAMS[q.get('cam') ?? 'aerial'] ?? CAMS.aerial

/** Debug hook: window.__view(pos, target) moves the camera (deck-local y offset NOT applied). */
function DebugHandle() {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const w = window as unknown as { __get: unknown; __view: unknown }
    w.__get = get
    w.__view = (p: [number, number, number], t: [number, number, number]) => {
      const { camera, controls } = get()
      camera.position.set(...p)
      const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
      if (c) {
        c.target.set(...t)
        c.update()
      }
    }
  }, [get])
  return null
}

export default function StructureSandbox() {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: cam.pos, fov: 45, near: 0.2, far: 8000 }}
      gl={{ antialias: true, logarithmicDepthBuffer: false, localClippingEnabled: true } as THREE.WebGLRendererParameters}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
        ;(window as unknown as { __gl: THREE.WebGLRenderer }).__gl = gl
      }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <SkyAndLights />
      <Ocean />
      <Surroundings upperDeck={q.get('upper') !== '0'} />
      <group position={[0, DECK_WORLD_Y, 0]}>
        <DeckStructure ceiling={q.get('ceiling') !== '0'} />
      </group>
      <DebugHandle />
      <OrbitControls makeDefault target={cam.target} maxDistance={2500} />
    </Canvas>
  )
}
