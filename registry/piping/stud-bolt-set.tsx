// Flange stud-bolt set per ASME B16.5 bolting tables: ASTM A193 B7 threaded studs with chamfered ends, two A194 2H heavy hex nuts each, optional coating.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { GASKET_SPIRAL_WOUND, flange as flangeDims, studLength, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'

export type Coating = 'ptfe-blue' | 'hot-dip' | 'black' | 'zinc-nickel'

export interface StudBoltSetProps {
  nps?: number
  rating?: Rating
  coating?: Coating
  /** as installed on the bolt circle (joint), or laid out in a row */
  layout?: 'joint' | 'row'
}

export const defaults = { nps: 6, rating: 300 as Rating, coating: 'ptfe-blue' as Coating, layout: 'joint' as 'joint' | 'row' }

const COAT: Record<Coating, string> = { 'ptfe-blue': '#27427a', 'hot-dip': '#a9adb0', black: '#1f2124', 'zinc-nickel': '#c9cbb8' }

export function StudBoltSet({ nps = defaults.nps, rating = defaults.rating, coating = defaults.coating, layout = defaults.layout, ...group }: StudBoltSetProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, coating, layout), [nps, rating, coating, layout])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default StudBoltSet

// UNC threads per inch by nominal diameter (8-UN from 1")
const TPI: [number, number][] = [[0.5, 13], [0.625, 11], [0.75, 10], [0.875, 9]]
const pitch = (d: number) => 0.0254 / (TPI.find(([dia]) => d <= (dia + 0.06) * 0.0254)?.[1] ?? 8)

/** One stud along +X centred at the origin: threaded body as a lathe with a real thread profile, 45° chamfered ends. */
function stud(k: Kit, mat: MatKey, d: number, L: number) {
  const p = pitch(d)
  const r = d / 2
  const rr = r - p * 0.54
  const ch = p * 1.2
  const prof: [number, number][] = [[0, -L / 2], [rr, -L / 2], [r, -L / 2 + ch]]
  for (let y = -L / 2 + ch; y < L / 2 - ch - p; y += p) prof.push([r, y + p * 0.12], [rr, y + p * 0.5], [r, y + p * 0.88])
  prof.push([r, L / 2 - ch], [rr, L / 2], [0, L / 2])
  k.lathe(mat, prof, [0, 0, 0], 'x', 10)
}

/** A194 2H heavy hex nut: across flats 1.5d + 1/8", height d, washer face against the flange, chamfered outer face with the grade mark. */
function nut(k: Kit, mat: MatKey, d: number, x: number, out: 1 | -1) {
  const af = 1.5 * d + 0.0032
  const ac = af / Math.cos(Math.PI / 6)
  k.hex(mat, ac * 0.985, d * 0.92, [x, 0, 0], 'x')
  k.cyl(mat, af * 0.48, d * 0.05, [x - out * d * 0.485, 0, 0], 'x', 24)
  k.cyl(mat, out > 0 ? af * 0.5 : af * 0.44, d * 0.03, [x + out * d * 0.475, 0, 0], 'x', 24, out > 0 ? af * 0.44 : af * 0.5)
  k.plane(textMaterial('2H', COAT_TXT, '#f2f2f2', 64, 64), af * 0.24, af * 0.24, [x + out * (d * 0.492), af * 0.3, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (out * Math.PI) / 2))
}
const COAT_TXT = '#222831'

function build(k: Kit, nps: number, rating: Rating, coating: Coating, layout: 'joint' | 'row') {
  const f = flangeDims(nps, rating)
  const d = f.boltDia
  const L = studLength(nps, rating)
  const mat: MatKey = coating === 'ptfe-blue' ? 'boltXylan' : paint(COAT[coating], { metalness: 0.6, roughness: 0.4, clearcoat: 0, weather: 0 })
  // nut positions for a made-up RF joint: grip = two flanges + faces + gasket, nut height = d
  const grip = 2 * (f.thickness + f.raisedFaceHeight) + GASKET_SPIRAL_WOUND
  const xn = grip / 2 + d * 0.46
  const place = (fn: () => void, pos: THREE.Vector3) => k.with(new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z), fn)
  const each = (pos: THREE.Vector3) =>
    place(() => {
      stud(k, mat, d, L)
      nut(k, mat, d, -xn, -1)
      nut(k, mat, d, xn, 1)
      k.disc(textMaterial('B7', '#3a3f45', '#f2f2f2', 64, 64), d * 0.32, [L / 2 + 0.0003, 0, 0], 'x', 16)
    }, pos)
  for (let i = 0; i < f.bolts; i++) {
    if (layout === 'row') each(new THREE.Vector3(0, d / 2 + d * 0.9, (i - (f.bolts - 1) / 2) * d * 3.2))
    else {
      const a = Math.PI / f.bolts + (i / f.bolts) * Math.PI * 2
      each(new THREE.Vector3(0, -Math.sin(a) * (f.boltCircle / 2), Math.cos(a) * (f.boltCircle / 2)))
    }
  }
}
