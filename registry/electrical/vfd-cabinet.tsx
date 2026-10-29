// Variable frequency drive line-up: input / rectifier, DC link, inverter and control sections with louvred doors, roof extract fans and an operator keypad. IEC 61800-4/5-1.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { Rotors, fanRotor, type RotorSpec } from '../lib/rotors'
import { fanGuardMaterial, textMaterial } from '../lib/textures'
import { earthBoss, louvrePanel } from './_parts'
import { lamp, legendMaterial, relayFaceMaterial } from './_textures'

export interface VfdCabinetProps {
  /** drive rating, kW (sets the number of power sections) */
  kw?: number
  /** motor voltage, kV (0.69 LV, 3.3 / 6.6 / 11 MV) */
  kv?: number
  tag?: string
  /** spin the roof fans */
  running?: boolean
}

export const defaults = {
  kw: 2600,
  kv: 6.6,
  tag: 'VSD-2200',
  running: true,
}

const front = new THREE.Quaternion()

export function VfdCabinet({ running = true, ...rest }: VfdCabinetProps & GroupProps) {
  const { kw, kv, tag, ...group } = { ...defaults, ...rest }
  const b = useMemo(() => build({ kw, kv, tag }), [kw, kv, tag])
  useEffect(() => () => [b.built, b.fan].forEach((x) => x.geometry.dispose()), [b])
  return (
    <group {...group}>
      <KitMesh data={b.built} />
      <Rotors rotors={b.rotors} running={running} />
    </group>
  )
}

export default VfdCabinet

function build(p: Omit<typeof defaults, 'running'>) {
  const k = new Kit()
  const mv = p.kv > 1
  const CW = mv ? 1.0 : 0.6
  const CH = mv ? 2.5 : 2.2
  const CD = mv ? 1.2 : 0.6 // typical
  const powerSections = Math.max(1, Math.min(8, Math.ceil(p.kw / (mv ? 1200 : 250))))
  const names = ['CONTROL', mv ? 'INPUT / ISOLATION' : 'INPUT', ...Array.from({ length: powerSections }, (_, i) => `POWER ${i + 1}`), mv ? 'OUTPUT / BYPASS' : 'OUTPUT']
  const n = names.length
  const W = n * CW
  const yb = 0.1
  const body = paint('#cfd2cd', { metalness: 0.2, roughness: 0.45, clearcoat: 0.2, weather: 0 })
  const dark = paint('#3c4146', { metalness: 0.3, roughness: 0.5, clearcoat: 0, weather: 0 })
  k.box('structSteelDark', [W + 0.06, yb, CD], [0, yb / 2, 0])
  for (const s of [-1, 1]) k.box(body, [0.03, CH, CD], [s * (W / 2 + 0.015), yb + CH / 2, 0])
  earthBoss(k, [W / 2 + 0.03, yb + 0.15, -CD * 0.3], 'x')
  const fan = fanRotor('rubberBlack', 0.2, [0, 0, 0], 'y', 600, { blades: 7 })
  const rotors: RotorSpec[] = []
  const zf = CD / 2
  names.forEach((name, i) => {
    const xc = -W / 2 + CW * (i + 0.5)
    k.box(body, [CW - 0.004, CH, CD - 0.02], [xc, yb + CH / 2, -0.01])
    k.box(body, [CW - 0.02, CH - 0.02, 0.02], [xc, yb + CH / 2, zf + 0.01])
    for (const y of [0.3, CH / 2, CH - 0.3]) k.cyl('nut', 0.012, 0.08, [xc - CW / 2 + 0.012, yb + y, zf + 0.012], 'y', 8)
    // quarter-turn locks and a rotary door handle
    k.box('stainless', [0.03, 0.2, 0.035], [xc + CW / 2 - 0.08, yb + CH * 0.5, zf + 0.037])
    for (const y of [0.4, CH - 0.4]) k.cyl('nut', 0.012, 0.012, [xc + CW / 2 - 0.08, yb + y, zf + 0.026], 'z', 10)
    k.plane(legendMaterial(name, true), Math.min(0.5, CW * 0.7), 0.045, [xc, yb + CH - 0.12, zf + 0.0205], front)
    if (i === 0) {
      // control section: keypad / HMI, lamps, E-stop, local-remote, start-stop
      k.box(dark, [0.26, 0.2, 0.025], [xc, yb + 1.55, zf + 0.032])
      k.plane(relayFaceMaterial(), 0.22, 0.16, [xc, yb + 1.55, zf + 0.0446], front)
      ;(['white', 'green', 'amber', 'red'] as const).forEach((c, j) => {
        k.cyl('nut', 0.016, 0.014, [xc - 0.105 + j * 0.07, yb + 1.3, zf + 0.027], 'z', 12)
        k.cyl(lamp(c), 0.012, 0.012, [xc - 0.105 + j * 0.07, yb + 1.3, zf + 0.036], 'z', 12)
      })
      k.cyl('actuatorYellow', 0.04, 0.005, [xc, yb + 1.1, zf + 0.0225], 'z', 20)
      k.dome('actuatorRed', 0.026, [xc, yb + 1.1, zf + 0.026], 'z', Math.PI / 2, 0.6, 16)
      k.cyl('safetyGreen', 0.018, 0.02, [xc - 0.1, yb + 0.95, zf + 0.03], 'z', 14)
      k.cyl('actuatorRed', 0.018, 0.02, [xc + 0.1, yb + 0.95, zf + 0.03], 'z', 14)
    } else {
      // power sections: air intake louvres in the door, filter behind
      louvrePanel(k, CW * 0.7, 0.6, [xc, yb + 0.5, zf + 0.0205], front, '#cfd2cd')
      if (names[i].startsWith('POWER')) louvrePanel(k, CW * 0.7, 0.35, [xc, yb + 1.45, zf + 0.0205], front, '#cfd2cd')
      if (i === 1 && mv) k.plane(textMaterial(`DANGER ${p.kv} kV`, '#f4c414', '#111111', 256, 48), 0.3, 0.056, [xc, yb + 1.6, zf + 0.0205], front)
      // roof extract fan hood with guard and spinning impeller
      if (names[i].startsWith('POWER') || i === 1) {
        const y = yb + CH
        k.cyl(body, 0.26, 0.24, [xc, y + 0.12, -0.05], 'y', 32, undefined, true)
        k.cyl(body, 0.25, 0.24, [xc, y + 0.12, -0.05], 'y', 32, undefined, true)
        k.disc('rubberBlack', 0.25, [xc, y + 0.005, -0.05], 'y', 28)
        k.cyl('nut', 0.05, 0.08, [xc, y + 0.06, -0.05], 'y', 12)
        k.disc(fanGuardMaterial(), 0.255, [xc, y + 0.24, -0.05], 'y', 28)
        rotors.push({ ...fan, pos: [xc, y + 0.12, -0.05] })
      }
    }
  })
  // top cable boxes: incoming supply (control end) and motor cables (output end), with glands
  for (const x of [-W / 2 + CW / 2, W / 2 - CW / 2]) {
    k.box(body, [CW * 0.7, 0.3, CD * 0.4], [x, yb + CH + 0.15, -CD * 0.25])
    for (let c = 0; c < 3; c++) k.cyl('brass', 0.03, 0.05, [x - 0.15 + c * 0.15, yb + CH + 0.325, -CD * 0.25], 'y', 12)
  }
  tagPlate(k, p.tag, [-W / 2 + CW / 2, yb + CH - 0.22, zf + 0.0215], 'z', 0.16)
  return { built: k.build(), rotors, fan: fan.built }
}
