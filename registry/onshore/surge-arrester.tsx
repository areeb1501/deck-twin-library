// Station-class metal-oxide surge arrester on a support: stacked housed units, grading ring, insulating base, surge counter and earth lead. IEC 60099-4.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { dialMaterial } from '../lib/textures'
import { alu, gradingRing, hv, pad, tubeColumn } from './_hv'
import { earthLead, insulator, porcelain, silicone } from './_onshore'

export interface SurgeArresterProps {
  /** system voltage, kV */
  kv?: number
  insulation?: 'porcelain' | 'composite'
  tag?: string
}

export const defaults = { kv: 145, insulation: 'composite' as 'porcelain' | 'composite', tag: '' }

export function SurgeArrester(props: SurgeArresterProps & GroupProps) {
  const { kv, insulation, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, kv, insulation, tag), [kv, insulation, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SurgeArrester

function build(k: Kit, kv: number, insulation: string, tag: string) {
  const d = hv(kv)
  const ins: MatKey = insulation === 'composite' ? silicone() : porcelain()
  const y0 = tubeColumn(k, 0, 0, d.sup, 0.273, false)
  // insulating base: plate on four small post insulators, so the counter measures the leakage current
  k.box('galvanised', [0.45, 0.02, 0.45], [0, y0 + 0.01, 0])
  for (const a of [-1, 1]) for (const b of [-1, 1]) insulator(k, [a * 0.14, y0 + 0.02, b * 0.14], 0.12, 0.025, ins)
  const yb = y0 + 0.14
  k.cyl(alu(), 0.2, 0.04, [0, yb + 0.02, 0], 'y', 28)
  // stacked units, typical one per ~70 kV system voltage
  const n = d.kv >= 362 ? 4 : d.kv >= 200 ? 3 : d.kv >= 100 ? 2 : 1
  const hu = 0.95 + (d.ins * 0.35) / n
  let y = yb + 0.04
  for (let i = 0; i < n; i++) {
    insulator(k, [0, y, 0], hu, d.r * 1.1, ins)
    // pressure-relief vent ports at the unit ends
    for (const t of [0.05, hu - 0.05]) k.box(alu(), [0.06, 0.04, 0.05], [d.r * 1.35, y + t, 0])
    y += hu
    k.cyl(alu(), d.r * 1.5, 0.04, [0, y + 0.02, 0], 'y', 24)
    y += 0.04
  }
  pad(k, [0, y, 0], [0, 1, 0], 1.2)
  if (d.kv >= 100) {
    // grading ring hung from the top flange
    const R = 0.25 + 0.0015 * d.kv
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      k.rod(alu(), [0, y - 0.02, 0], [Math.cos(a) * R, y - 0.35, Math.sin(a) * R], 0.012, 6)
    }
    gradingRing(k, [0, y - 0.35, 0], R, 'y', 0.035)
  }
  // insulated earth lead to the surge counter on the column, counter earthed to grade
  const cz = 0.2
  k.spline(paint('#1e1f21'), [[0.12, yb + 0.02, 0.1], [0.18, yb - 0.1, 0.18], [0.12, y0 - 0.45, cz]], 0.012, 6, 20)
  k.cyl('galvanised', 0.11, 0.08, [0, y0 - 0.6, cz + 0.04], 'z', 28)
  k.disc(dialMaterial('bar', 10), 0.09, [0, y0 - 0.6, cz + 0.081], 'z', 28)
  k.disc('glass', 0.095, [0, y0 - 0.6, cz + 0.085], 'z', 28)
  k.box('galvanised', [0.08, 0.2, 0.06], [0, y0 - 0.6, cz - 0.03])
  k.spline(earthLead(), [[0, y0 - 0.7, cz], [0.05, y0 - 1.0, cz + 0.05], [0.1, 0.4, cz + 0.1], [0.25, 0.03, cz + 0.35]], 0.008, 6, 24)
  k.cyl('concrete', 0.14, 0.05, [0.25, 0.025, cz + 0.35], 'y', 16)
  if (tag) tagPlate(k, tag, [0, y0 - 0.85, 0.14], 'z', 0.14)
}
