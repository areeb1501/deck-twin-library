// Outdoor live-tank SF6 circuit breaker: three poles of support and interrupter insulators on a common frame, spring operating mechanism cubicle. IEC 62271-100, IEC 62271-1.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { textMaterial } from '../lib/textures'
import { alu, cabinet, gradingRing, hv, pad, tubeColumn } from './_hv'
import { insulator, porcelain, silicone } from './_onshore'

export interface HvCircuitBreakerProps {
  /** rated voltage, kV */
  kv?: number
  insulation?: 'porcelain' | 'composite'
  tag?: string
}

export const defaults = { kv: 145, insulation: 'porcelain' as 'porcelain' | 'composite', tag: '' }

export function HvCircuitBreaker(props: HvCircuitBreakerProps & GroupProps) {
  const { kv, insulation, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, kv, insulation, tag), [kv, insulation, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HvCircuitBreaker

function build(k: Kit, kv: number, insulation: string, tag: string) {
  const d = hv(kv)
  const ins: MatKey = insulation === 'composite' ? silicone() : porcelain()
  const P = d.phase * 0.85
  const fy = d.sup
  const fh = 0.32
  // two support legs and the common base frame
  for (const s of [-1, 1]) tubeColumn(k, s * (P + 0.35), 0, fy, 0.273)
  k.box(cabinet(), [2 * P + 1.1, fh, 0.42], [0, fy + fh / 2, 0])
  for (const s of [-1, 1]) k.box(cabinet(), [0.02, fh, 0.42], [s * (P + 0.56), fy + fh / 2, 0])
  // spring operating mechanism cubicle under the frame (typical 1.08 × 1.02 × 0.49 m at 145 kV)
  const cw = 1.02
  const ch = 1.08
  const cy = fy - 0.15 - ch / 2
  k.rbox(cabinet(), [cw, ch, 0.49], 0.02, [-P + 0.34, cy, 0.05])
  k.box(cabinet(), [0.12, 0.15, 0.12], [-P + 0.34, fy - 0.075, 0])
  k.box(cabinet(), [cw - 0.08, ch - 0.08, 0.01], [-P + 0.34, cy, 0.3])
  k.box('stainless', [0.03, 0.15, 0.03], [-P + 0.34 + cw * 0.38, cy, 0.315])
  k.plane(textMaterial('O  I', '#1b1b1b', '#ffffff', 256, 128), 0.12, 0.06, [-P + 0.14, cy + 0.25, 0.306])
  k.cyl('glass', 0.05, 0.01, [-P + 0.49, cy + 0.25, 0.306], 'z', 20)
  k.box('plasticGrey', [0.6, 0.06, 0.4], [-P + 0.34, cy - ch / 2 - 0.03, 0.05])
  k.tube('cable', [[-P + 0.5, cy - ch / 2 - 0.06, 0.1], [-P + 0.5, 0.6, 0.15], [-P + 0.7, 0.02, 0.4]], 0.02)
  if (tag) tagPlate(k, tag, [-P + 0.34, cy - 0.35, 0.306], 'z', 0.2)
  // linkage rod along the frame front and the SF6 gas pipe between poles
  k.rod('stainless', [-P, fy + fh + 0.03, 0.18], [P, fy + fh + 0.03, 0.18], 0.012, 8)
  const two = d.kv >= 362
  for (let i = -1; i <= 1; i++) {
    const x = i * P
    const y0 = fy + fh
    // pole base with SF6 density monitor
    k.cyl(alu(), 0.2, 0.18, [x, y0 + 0.09, 0], 'y', 28)
    gauge(k, [x + 0.21, y0 + 0.1, 0.1], 'x', 0.1, 'bar', 10)
    k.tube('tubing', [[x, y0 + 0.02, -0.15], [x, y0 + 0.02, -0.25], [x + P * (i < 1 ? 1 : 0), y0 + 0.02, -0.25]], 0.006)
    const ys = y0 + 0.18
    insulator(k, [x, ys, 0], d.ins, d.r, ins)
    const yh = ys + d.ins
    if (!two) {
      // mechanism head with the lower terminal, interrupter insulator, top flange with the upper terminal
      k.rbox(alu(), [0.42, 0.34, 0.42], 0.05, [x, yh + 0.17, 0])
      pad(k, [x, yh + 0.17, -0.21], [0, 0, -1], 1.2)
      const yi = yh + 0.34
      const hi = d.ins * 0.8
      insulator(k, [x, yi, 0], hi, d.r * 1.55, ins)
      k.cyl(alu(), d.r * 2.2, 0.22, [x, yi + hi + 0.11, 0], 'y', 28)
      k.dome(alu(), d.r * 2.2, [x, yi + hi + 0.22, 0], 'y', Math.PI / 2, 0.4)
      pad(k, [x, yi + hi + 0.11, d.r * 2.2], [0, 0, 1], 1.2)
      if (d.ring) gradingRing(k, [x, yi + hi - 0.15, 0], d.r * 3.4, 'y', 0.035)
    } else {
      // T-head: two horizontal interrupters with grading capacitors and corona rings
      k.rbox(alu(), [0.5, 0.5, 0.6], 0.06, [x, yh + 0.25, 0])
      const hi = d.ins * 0.75
      for (const s of [-1, 1]) {
        insulator(k, [x, yh + 0.3, s * 0.3], hi, d.r * 1.5, ins, s > 0 ? 'z' : '-z')
        const zt = s * (0.3 + hi)
        k.cyl(alu(), d.r * 2.1, 0.3, [x, yh + 0.3, zt + s * 0.15], 'z', 28)
        pad(k, [x, yh + 0.3 + d.r * 2.1, zt + s * 0.15], [0, 1, 0], 1.3)
        k.rod(paint('#7d6e5c'), [x, yh + 0.75, s * 0.35], [x, yh + 0.75, zt], 0.07, 16)
        for (const z of [s * 0.35, zt]) k.rod(alu(), [x, yh + 0.75, z], [x, yh + 0.3 + d.r * 1.6, z], 0.02, 6)
        gradingRing(k, [x, yh + 0.3, zt + s * 0.05], d.r * 3.2, 'z', 0.04)
      }
    }
  }
}
