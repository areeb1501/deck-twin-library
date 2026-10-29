// Machinery vibration probes on a bearing: X-Y proximity probes in API 670 external housings, or stud-mounted accelerometers, wired to a proximitor junction box on a pipe stand. Sizes typical.
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import type { Port } from '../lib/ports'
import { addV, cable, pipeStand, standBracket, tag as tagPlate } from './_parts'

export type ProbeKind = 'proximity' | 'accelerometer'

export interface VibrationProbeProps {
  /** proximity: non-contact eddy-current probes reading shaft movement; accelerometer: casing vibration */
  kind?: ProbeKind
  /** two probes: X-Y at ±45° (proximity) or vertical + horizontal (accelerometer) */
  pair?: boolean
  /** outer radius of the bearing housing the probes mount on, m */
  housingRadius?: number
  /** shaft centreline above deck, m */
  shaftHeight?: number
  /** junction box distance out from the housing surface (+Z), m */
  jbOffset?: number
  /** draw a pedestal bearing and shaft stub; turn off when mounting on a machine's own bearing housing */
  pedestal?: boolean
  tag?: string
}

export const defaults = { kind: 'proximity' as ProbeKind, pair: true, housingRadius: 0.16, shaftHeight: 0.45, jbOffset: 0.5, pedestal: true, tag: 'VE-1001' }

export function ports(): Port[] {
  return []
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
}

function pedestalBearing(k: Kit, R: number, H: number) {
  const W = 0.18
  k.box('castIron', [W + 0.16, 0.03, 2 * R + 0.12], [0, -H + 0.015, 0])
  k.box('machineryGreen', [W, H - 0.03, 1.5 * R], [0, -H / 2 + 0.015, 0])
  k.cyl('machineryGreen', R, W, [0, 0, 0], 'x', 48)
  k.box('machineryGreen', [W + 0.01, 0.014, 2 * R + 0.07], [0, 0, 0])
  for (const sz of [-1, 1]) {
    k.hex('nut', 0.03, 0.016, [0, 0.015, sz * (R + 0.02)], 'y')
    k.cyl('boltXylan', 0.008, 0.05, [0, 0.01, sz * (R + 0.02)], 'y', 10)
    for (const sx of [-1, 1]) k.hex('nut', 0.03, 0.016, [sx * (W / 2 + 0.05), -H + 0.038, sz * (R + 0.02)], 'y')
  }
  k.cyl('machined', R * 0.35, 0.7, [0, 0, 0], 'x', 40)
  for (const sx of [-1, 1]) k.cyl('rubberBlack', R * 0.45, 0.018, [sx * (W / 2 + 0.009), 0, 0], 'x', 32)
}

/** API 670 external probe housing on the bearing surface along `d`. Returns the conduit exit point. */
function proximityHousing(k: Kit, base: V3, d: V3): V3 {
  const at = (s: number) => addV(base, d, s)
  k.cyl('stainless', 0.024, 0.012, at(0.006), d, 24)
  k.hex('stainless', 0.046, 0.016, at(0.02), d)
  k.cyl('plasticGrey', 0.028, 0.07, at(0.063), d, 28)
  k.cyl('plasticGrey', 0.031, 0.014, at(0.105), d, 28)
  k.hex('stainless', 0.03, 0.014, at(0.119), d)
  k.cyl('stainless', 0.012, 0.022, at(0.137), d, 16)
  return at(0.148)
}

/** Stud-mounted top-exit accelerometer with a 2-pin MIL-C-5015 connector and boot. Returns the cable exit point. */
function accelerometer(k: Kit, base: V3, d: V3): V3 {
  const at = (s: number) => addV(base, d, s)
  k.cyl('stainless', 0.016, 0.004, at(0.002), d, 20)
  k.hex('stainless', 0.024, 0.008, at(0.008), d)
  k.cyl('stainless', 0.0125, 0.048, at(0.036), d, 24)
  k.cyl('stainless', 0.0085, 0.012, at(0.066), d, 16)
  k.cyl('rubberBlack', 0.0095, 0.024, at(0.084), d, 16, 0.006)
  return at(0.096)
}

export function VibrationProbe({ kind = defaults.kind, pair = defaults.pair, housingRadius = defaults.housingRadius, shaftHeight = defaults.shaftHeight, jbOffset = defaults.jbOffset, pedestal = defaults.pedestal, tag = defaults.tag, ...group }: VibrationProbeProps & GroupProps) {
  const data = useKit(
    (k) => {
      const R = housingRadius
      const H = shaftHeight
      if (pedestal) pedestalBearing(k, R, H)

      const s = Math.SQRT1_2
      const dirs: V3[] = kind === 'proximity' ? (pair ? [[0, s, -s], [0, s, s]] : [[0, s, s]]) : pair ? [[0, 1, 0], [0, 0, 1]] : [[0, 1, 0]]

      const jbZ = R + jbOffset
      const jbY = 0.05
      const jbH = 0.26
      k.at([0, -H, jbZ], undefined, () => {
        const rs = pipeStand(k, H + jbY + 0.18)
        const front = standBracket(k, rs, H + jbY - jbH / 2 - 0.02, H + jbY + jbH / 2 + 0.02, -0.1, 0.1, [H + jbY - 0.08, H + jbY + 0.08])
        const z = front + 0.065
        k.rbox('stainless', [0.24, jbH, 0.12], 0.008, [0, H + jbY, z])
        k.box('stainless', [0.25, jbH + 0.01, 0.012], [0, H + jbY, z + 0.062])
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.cyl('nut', 0.006, 0.006, [sx * 0.105, H + jbY + sy * (jbH / 2 - 0.015), z + 0.07], 'z', 10)
        k.cyl('brass', 0.005, 0.01, [0.115, H + jbY - jbH / 2 + 0.03, z + 0.063], 'z', 10)
        tagPlate(k, tag, [0, H + jbY - 0.04, z + 0.07], 'z', 0.075)
      })

      const glandY = jbY - jbH / 2
      const glandZ = jbZ + 0.06 + 0.065 + 0.012
      const nG = dirs.length + 1
      const gx = (i: number) => (i - (nG - 1) / 2) * 0.055
      for (let i = 0; i < nG; i++) {
        k.hex('brass', 0.026, 0.012, [gx(i), glandY - 0.006, glandZ], 'y')
        k.cyl('brass', 0.011, 0.018, [gx(i), glandY - 0.021, glandZ], 'y', 14)
      }

      const r = kind === 'proximity' ? 0.011 : 0.0045
      const mat = kind === 'proximity' ? 'rubberBlack' : 'cable'
      dirs.forEach((dv, i) => {
        const d = norm(dv)
        const below = Math.abs(d[1]) < 0.1 ? 0.06 : 0
        const base: V3 = below ? [0, -below, Math.sign(d[2]) * Math.sqrt(R * R - below * below)] : [0, d[1] * R, d[2] * R]
        const exit = kind === 'proximity' ? proximityHousing(k, base, d) : accelerometer(k, base, d)
        const x = gx(i)
        const pts: V3[] = [exit, addV(exit, d, 0.06)]
        if (d[2] < 0.3) pts.push([x * 0.5, R + 0.14, R * 0.6])
        if (pts[1][2] < R + 0.15) pts.push([x, 0.02, R + 0.2])
        pts.push([x, glandY - 0.12, (R + glandZ) / 2 + 0.05], [x, glandY - 0.07, glandZ], [x, glandY - 0.03, glandZ])
        k.spline(mat, pts, r, 8, 64)
      })

      const xo = gx(nG - 1)
      cable(k, [[xo, glandY - 0.03, glandZ], [xo, glandY - 0.12, glandZ], [xo, -H + 0.25, glandZ + 0.08], [xo, -H + 0.04, glandZ + 0.22], [xo, -H + 0.007, glandZ + 0.45]])
    },
    [kind, pair, housingRadius, shaftHeight, jbOffset, pedestal, tag],
  )
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default VibrationProbe
