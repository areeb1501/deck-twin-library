// Figure-8 spectacle blind (ASME B16.48) between two weld-neck flanges, with spiral-wound gaskets, long studs and jack screws.
import * as THREE from 'three'
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, pipeOD, pipeWall, spectacleBlind, studLength, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { GAP, jointStuds, portFlange, spiralWound } from './_piping'

export interface SpectacleBlindProps {
  nps?: number
  rating?: Rating
  /** closed: solid paddle in the line; open: spacer ring in the line */
  state?: 'open' | 'closed'
  /** draw the flanges, gaskets and studs either side (the plant assembler draws its own mating flanges at A and B) */
  flanges?: boolean
}

export const defaults = { nps: 6, rating: 300 as Rating, state: 'closed' as 'open' | 'closed', flanges: true }

// Ports A and B are the two faces of the plate.
export function ports(p: SpectacleBlindProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const t = spectacleBlind(nps, rating).thickness
  return [port('A', 'Face A', [-t / 2, 0, 0], [-1, 0, 0], nps, rating), port('B', 'Face B', [t / 2, 0, 0], [1, 0, 0], nps, rating)]
}

export function SpectacleBlind({ nps = defaults.nps, rating = defaults.rating, state = defaults.state, flanges = defaults.flanges, ...group }: SpectacleBlindProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, state, flanges), [nps, rating, state, flanges])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SpectacleBlind

function build(k: Kit, nps: number, rating: Rating, state: 'open' | 'closed', flanges: boolean) {
  const sb = spectacleBlind(nps, rating)
  const f = flangeDims(nps, rating)
  const t = sb.thickness
  const R = sb.od / 2
  const bore = pipeOD(nps) / 2 - pipeWall(nps, 'STD')
  const seg = nps >= 6 ? 48 : 32
  const paddle = (y: number) => k.cyl('flangeSteel', R, t, [0, y, 0], 'x', seg)
  const spacer = (y: number) => k.lathe('flangeSteel', [[bore, -t / 2], [R, -t / 2], [R, t / 2], [bore, t / 2], [bore, -t / 2]], [0, y, 0], 'x', seg)
  const yOut = sb.centres
  if (state === 'closed') {
    paddle(0)
    spacer(yOut)
  } else {
    spacer(0)
    paddle(yOut)
  }
  // tie bar between the two ends, with the stamped size / class / material marking on its edge
  const y0 = R * 0.85
  const y1 = yOut - R * 0.85
  k.box('flangeSteel', [t, y1 - y0, sb.webWidth], [0, (y0 + y1) / 2, 0])
  const label = `${nps}" CL${rating} ${state === 'closed' ? 'BLIND' : 'SPACER'}`
  k.plane(textMaterial(label, '#8e9498', '#1d2023', 512, 96), sb.webWidth * 0.95, Math.min(y1 - y0, sb.webWidth) * 0.22, [t / 2 + 0.0006, (y0 + y1) / 2, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
  // painted end flash: red on the blind paddle, green on the spacer, visible from outside the joint
  const flash = (y: number, solid: boolean) => k.box(solid ? 'actuatorRed' : 'safetyGreen', [t + 0.001, Math.min(0.04, R * 0.3), sb.webWidth * 0.8], [0, y + R - Math.min(0.02, R * 0.15), 0])
  flash(yOut, state === 'open')

  if (!flanges) return
  for (const s of [-1, 1]) {
    portFlange(k, nps, rating, [s * (t / 2 + GAP), 0, 0], [-s, 0, 0], { studs: false, bore })
    spiralWound(k, nps, rating, [s * (t / 2 + GAP / 2), 0, 0], [1, 0, 0])
  }
  jointStuds(k, nps, rating, [0, 0, 0], [1, 0, 0], studLength(nps, rating) + t + GAP)
  // two jack screws through flange A at the 3 and 9 o'clock positions, clear of the bolt pattern
  const gap = t + 2 * GAP + 2 * f.raisedFaceHeight
  const xa = -(gap / 2 + f.thickness)
  const d = f.boltDia * 0.8
  for (const z of [-1, 1]) {
    const zz = (z * f.boltCircle) / 2
    k.hex('nut', d * 1.75, d * 0.7, [xa - d * 0.35, 0, zz], 'x')
    k.cyl('galvanised', d / 2, f.thickness + gap, [xa + (f.thickness + gap) / 2, 0, zz], 'x', 10)
  }
}
