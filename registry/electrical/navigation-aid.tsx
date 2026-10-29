// Offshore platform aid to navigation: marine lantern (Fresnel drum) and electronic fog signal on a pedestal with control box. IALA R0139, IALA E-200.
import * as THREE from 'three'
import { Kit, type MatKey } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { junctionBox, tagPlate } from '../lib/parts'
import { textMaterial } from '../lib/textures'
import { cableGland, earthBoss } from './_parts'

export interface NavigationAidProps {
  kind?: 'lantern' | 'foghorn' | 'combined'
  /** lantern colour: white main light, yellow secondary / significant peripheral structure, red obstruction */
  color?: 'white' | 'yellow' | 'red'
  /** nominal range, nautical miles (sets the lantern size) */
  range?: number
  /** pedestal height, m */
  height?: number
  lit?: boolean
  tag?: string
}

export const defaults = {
  kind: 'combined' as 'lantern' | 'foghorn' | 'combined',
  color: 'white' as 'white' | 'yellow' | 'red',
  range: 10,
  height: 1.2,
  lit: true,
  tag: 'NAV-01',
}

export function NavigationAid(props: NavigationAidProps & GroupProps) {
  const { kind, color, range, height, lit, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { kind, color, range, height, lit, tag }), [kind, color, range, height, lit, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default NavigationAid

function build(k: Kit, p: typeof defaults) {
  const G: MatKey = 'galvanised'
  const yellowBody = paint('#e5b114', { roughness: 0.4, clearcoat: 0.4 })
  const H = Math.min(4, Math.max(0.6, p.height))
  // pedestal: tube on a base plate with gussets and anchors, top plate
  k.box(G, [0.4, 0.02, 0.4], [0, 0.01, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.03, 0.016, [sx * 0.15, 0.028, sz * 0.15])
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    k.box(G, [0.012, 0.14, 0.1], [Math.cos(a) * 0.12, 0.09, Math.sin(a) * 0.12], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2))
  }
  k.cyl(G, 0.07, H - 0.02, [0, 0.02 + (H - 0.02) / 2, 0], 'y', 20)
  k.cyl(G, 0.2, 0.02, [0, H + 0.01, 0], 'y', 28)
  earthBoss(k, [0.07, 0.25, 0], 'x')
  // control / monitoring box (flash sync, remote alarm) on the pedestal, cable to deck
  junctionBox(k, [0, 0.75, 0.07], 'z', [0.26, 0.3, 0.14], 'stainless')
  k.plane(textMaterial('AtoN CONTROL', '#1f4e9a', '#ffffff', 256, 48), 0.18, 0.034, [0, 0.82, 0.212], new THREE.Quaternion())
  k.spline('cable', [[0, 0.58, 0.14], [0, 0.3, 0.16], [0.05, 0.04, 0.3], [0.4, 0.02, 0.45]], 0.01, 6, 16)
  tagPlate(k, p.tag, [0, 0.45, 0.071], 'z', 0.12)

  const y = H + 0.02
  if (p.kind !== 'foghorn') {
    // marine lantern: base, Fresnel drum (stacked prism rings), lamp, cap with bird spikes and lightning finial
    const R = Math.min(0.3, 0.1 + p.range * 0.012)
    const hL = R * 1.6
    const xL = p.kind === 'combined' ? -0.08 : 0
    const hex = { white: '#fff4dc', yellow: '#ffd23a', red: '#ff3b2e' }[p.color]
    const lens: MatKey = p.lit ? paint(hex, { emissive: hex, emissiveIntensity: 1.8, roughness: 0.1, metalness: 0, clearcoat: 1, weather: 0 }) : paint(hex, { roughness: 0.08, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.6, weather: 0 })
    k.cyl(yellowBody, R * 0.9, 0.14, [xL, y + 0.07, 0], 'y', 32)
    k.cyl('nut', R * 0.95, 0.02, [xL, y + 0.15, 0], 'y', 32)
    const n = 7
    for (let i = 0; i < n; i++) {
      const yi = y + 0.16 + (i + 0.5) * (hL / n)
      const bulge = 1 - Math.abs(i - (n - 1) / 2) * 0.06
      k.cyl(lens, R * bulge, hL / n - 0.004, [xL, yi, 0], 'y', 40, R * bulge * 0.97)
    }
    k.cyl('nut', R * 0.95, 0.02, [xL, y + 0.17 + hL, 0], 'y', 32)
    k.dome(yellowBody, R * 0.95, [xL, y + 0.18 + hL, 0], 'y', Math.PI / 2, 0.35, 32)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      k.rod('stainless', [xL + Math.cos(a) * R * 0.5, y + 0.2 + hL + R * 0.2, Math.sin(a) * R * 0.5], [xL + Math.cos(a) * R * 0.75, y + 0.36 + hL + R * 0.2, Math.sin(a) * R * 0.75], 0.003, 4)
    }
    k.rod('stainless', [xL, y + 0.2 + hL + R * 0.3, 0], [xL, y + 0.6 + hL, 0], 0.006, 6)
    cableGland(k, [xL + R * 0.9, y + 0.07, 0], 'x', 0.018)
  }
  if (p.kind !== 'lantern') {
    // electronic fog signal: stacked horn emitters facing outward on a frame, driver box beneath
    const x0 = p.kind === 'combined' ? 0.45 : 0
    k.box(G, [0.5, 0.02, 0.2], [x0 / 2 + 0.05, y + 0.01, 0])
    k.rbox(paint('#d9dbd6', { roughness: 0.4 }), [0.3, 0.25, 0.22], 0.02, [x0, y + 0.145, 0])
    const horn = paint('#2c2f33', { roughness: 0.5 })
    for (let r = 0; r < 2; r++)
      for (const s of [-1, 1]) {
        const yy = y + 0.36 + r * 0.2
        k.cyl(horn, 0.05, 0.12, [x0, yy, s * 0.08], s > 0 ? 'z' : '-z', 16, 0.09, true)
        k.cyl(horn, 0.05, 0.08, [x0, yy, s * 0.02], 'z', 14)
        k.disc('rubberBlack', 0.088, [x0, yy, s * 0.14 - s * 0.005], s > 0 ? '-z' : 'z', 18)
      }
    // open frame: four corner angles and a top plate
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(G, [0.025, 0.48, 0.025], [x0 + sx * 0.11, y + 0.51, sz * 0.03])
    k.box(G, [0.25, 0.012, 0.09], [x0, y + 0.756, 0])
    cableGland(k, [x0, y + 0.02, 0.11], 'z', 0.016)
  }
}
