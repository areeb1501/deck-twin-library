// Local control station: Ex e push-button enclosure on a post with start / stop, L-O-R selector, ammeter and E-stop. IEC 60079-7, IEC 60947-5-1, IEC 60204-1.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member, tagPlate } from '../lib/parts'
import { cableGland, earthBoss } from './_parts'
import { ammeterMaterial, lamp, legendMaterial } from './_textures'

export interface LocalControlStationProps {
  /** enclosure centre above deck, m */
  height?: number
  enclosure?: 'stainless' | 'grp'
  ammeter?: boolean
  selector?: boolean
  estop?: boolean
  /** motor full-load current shown on the ammeter scale, A */
  amps?: number
  tag?: string
}

export const defaults = {
  height: 1.3,
  enclosure: 'stainless' as 'stainless' | 'grp',
  ammeter: true,
  selector: true,
  estop: true,
  amps: 100,
  tag: 'HS-1501A',
}

export function LocalControlStation(props: LocalControlStationProps & GroupProps) {
  const { height, enclosure, ammeter, selector, estop, amps, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { height, enclosure, ammeter, selector, estop, amps, tag }), [height, enclosure, ammeter, selector, estop, amps, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default LocalControlStation

const front = new THREE.Quaternion()

function build(k: Kit, p: typeof defaults) {
  const box: MatKey = p.enclosure === 'grp' ? 'plasticGrey' : 'stainless'
  const rows = [p.ammeter && 'A', p.selector && 'S', 'B', p.estop && 'E'].filter(Boolean) as string[]
  const W = 0.24
  const H = 0.08 + rows.length * 0.115
  const D = 0.14
  const yc = Math.max(H / 2 + 0.5, p.height)
  const zb = 0.025 // post front face
  const zf = zb + 0.02 + D // enclosure front face

  // post: UPN 100 on a base plate with four anchor bolts, cap plate
  const top = yc + H / 2 + 0.12
  member(k, [0, 0.015, -0.025], [0, top, -0.025], 'UPN 100', 'galvanised', [0, 0, 1])
  k.box('galvanised', [0.25, 0.015, 0.25], [0, 0.0075, -0.025])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.cyl('boltXylan', 0.008, 0.05, [sx * 0.09, 0.035, -0.025 + sz * 0.09], 'y', 8)
      k.hex('nut', 0.026, 0.012, [sx * 0.09, 0.021, -0.025 + sz * 0.09])
    }
  k.box('galvanised', [0.12, 0.008, 0.07], [0, top + 0.004, -0.025])
  // mounting plate and enclosure with a rain hood
  k.box('galvanised', [W + 0.06, H + 0.1, 0.008], [0, yc, zb + 0.004])
  k.rbox(box, [W, H, D], 0.012, [0, yc, zb + 0.008 + D / 2])
  k.rbox(box, [W - 0.01, H - 0.01, 0.012], 0.006, [0, yc, zf + 0.004])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.cyl('stainless', 0.008, 0.008, [sx * (W / 2 - 0.018), yc + sy * (H / 2 - 0.018), zf + 0.014], 'z', 10)
  k.box(box, [W + 0.08, 0.006, D + 0.1], [0, yc + H / 2 + 0.04, zb + D / 2 + 0.05], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.18))
  for (const s of [-1, 1]) k.box(box, [0.006, 0.05, D + 0.08], [s * (W / 2 + 0.03), yc + H / 2 + 0.02, zb + D / 2 + 0.04])

  const z = zf + 0.01
  let y = yc + H / 2 - 0.04 - 0.0575
  for (const r of rows) {
    if (r === 'A') {
      k.box('rubberBlack', [0.1, 0.1, 0.02], [0, y + 0.005, z + 0.01])
      k.plane(ammeterMaterial(p.amps), 0.088, 0.088, [0, y + 0.005, z + 0.0205], front)
      k.box('glass', [0.09, 0.09, 0.004], [0, y + 0.005, z + 0.024])
      k.cyl('nut', 0.012, 0.012, [0.085, y + 0.03, z + 0.006], 'z', 12)
      k.cyl(lamp('green'), 0.009, 0.01, [0.085, y + 0.03, z + 0.016], 'z', 12)
    } else if (r === 'S') {
      k.cyl('nut', 0.024, 0.02, [0, y, z + 0.01], 'z', 16)
      k.box('rubberBlack', [0.012, 0.045, 0.024], [0, y, z + 0.032], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5))
      for (const [t, dx] of [['L', -0.05], ['O', 0], ['R', 0.05]] as [string, number][]) k.plane(legendMaterial(t, true), 0.022, 0.014, [dx, y + 0.038, z + 0.001], front)
      k.plane(legendMaterial('LOCAL - OFF - REMOTE'), 0.15, 0.018, [0, y - 0.042, z + 0.001], front)
    } else if (r === 'B') {
      for (const [dx, mat, txt] of [[-0.055, 'safetyGreen', 'START'], [0.055, 'actuatorRed', 'STOP']] as [number, MatKey, string][]) {
        k.cyl('nut', 0.026, 0.015, [dx, y + 0.008, z + 0.0075], 'z', 18)
        k.cyl(mat, 0.019, 0.018, [dx, y + 0.008, z + 0.024], 'z', 18)
        if (txt === 'STOP') {
          k.cyl('nut', 0.027, 0.02, [dx, y + 0.008, z + 0.016], 'z', 18, undefined, true) // shroud
          // lock-off stop: padlock hasp with a padlock fitted
          k.box('stainless', [0.012, 0.03, 0.025], [dx + 0.034, y + 0.008, z + 0.0125])
          k.box('safetyYellow', [0.024, 0.026, 0.012], [dx + 0.034, y - 0.018, z + 0.03])
          k.torus('stainless', 0.008, 0.002, [dx + 0.034, y - 0.002, z + 0.03], 'z', 4, 12, Math.PI)
        }
        k.plane(legendMaterial(txt), 0.07, 0.018, [dx, y - 0.04, z + 0.001], front)
      }
    } else {
      k.cyl('actuatorYellow', 0.038, 0.006, [0, y, z + 0.003], 'z', 24)
      k.cyl('actuatorRed', 0.013, 0.025, [0, y, z + 0.018], 'z', 12)
      k.dome('actuatorRed', 0.026, [0, y, z + 0.03], 'z', Math.PI / 2, 0.55, 20)
      k.plane(legendMaterial('EMERGENCY STOP', true), 0.12, 0.016, [0, y - 0.048, z + 0.001], front)
    }
    y -= 0.115
  }
  // cable gland underneath, armoured cable down the post, Ex label, earth stud, tag plate
  const gz = zb + 0.008 + D / 2
  const end = cableGland(k, [0, yc - H / 2, gz], '-y', 0.022)
  k.spline('cable', [end, [0, end[1] - 0.15, gz - 0.03], [0, 0.4, 0.035], [0, 0.12, 0.04], [0.02, 0.02, 0.12]] as V3[], 0.011, 6, 30)
  for (let yy = 0.3; yy < yc - H / 2 - 0.15; yy += 0.35) k.box('rubberBlack', [0.06, 0.012, 0.03], [0, yy, 0.04])
  k.plane(legendMaterial('Ex eb IIC T6 Gb'), 0.08, 0.016, [0, yc - H / 2 + 0.018, zf + 0.011], front)
  earthBoss(k, [W / 2, yc - H / 2 + 0.03, zb + 0.06], 'x')
  // lid hinges, stainless breather / drain plug
  for (const yy of [yc - H * 0.3, yc + H * 0.3]) k.cyl('stainless', 0.008, 0.05, [-W / 2 - 0.006, yy, zf - 0.005], 'y', 8)
  k.cyl('stainless', 0.01, 0.02, [W * 0.3, yc - H / 2 - 0.01, zb + 0.008 + D * 0.7], 'y', 10)
  tagPlate(k, p.tag, [0, yc + H / 2 + 0.11, zb + 0.0015], 'z', 0.14)
}
