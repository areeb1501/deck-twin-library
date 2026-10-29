import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT, bowtie, bubble } from './h.ts'
const PKG = 'ISO 10628-2 / PIP PIC001 (package boundary with contents)'
const tagF = { 'Tag number': 'tag' }
const box = (w: number, h: number) => R(4, 4, w - 8, h - 8, DASHDOT + ' stroke-width="2"')
const mpump = (cx: number, cy: number, r = 13) => C(cx, cy, r) + P(`M${cx - r + 2} ${cy + r - 2}L${cx + r - 2} ${cy - r + 2}`, THIN) + P(`M${cx + r - 2} ${cy - r + 2}l-7 1 5 5z`, FILL)
export default {
  'chemical-injection-skid': {
    svg: svg('0 0 200 130', box(200, 130) + P('M20 34a30 8 0 0 1 60 0v66H20z') + P('M50 100v12h130') + [100, 140].map((x) => P(`M${x} 112v-24`) + mpump(x, 75) + P(`M${x} 62V40`)).join('') + P('M100 40h96M140 40v-10h56', THIN)),
    e: {
      standard: PKG,
      drawn: 'Dash-dot package boundary containing a small storage tank, a suction header and one or more metering pumps (small circles with a diagonal arrow), with injection lines (CI / MI, ½"–1") leaving to the injection points, each with a check valve and isolation at the quill.',
      tags: ['C', 'X', 'A', 'CI'],
      notes: 'The chemical (demulsifier, corrosion inhibitor, scale inhibitor, methanol, biocide) is written on the tank or on the outgoing lines. Vendor packages are often a single box with only the battery-limit connections shown.',
      datasheet: { form: 'Chemical injection package datasheet (API 675 pumps)', fields: { 'Number of pumps': 'pumps', 'Tank diameter': 'tankDiameter', 'Tank height': 'tankHeight', 'Pump driver power': 'kw', 'Fill connection size': 'fillNps', 'Injection outlet size': 'outletNps', 'Outlet flange rating': 'outletRating', Chemical: 'chemical', Canopy: 'canopy', ...tagF } },
    },
  },
  'metering-skid': {
    svg: svg('0 0 200 130', box(200, 130) + P('M0 65h30M30 30v70M170 30v70M170 65h30') + [30, 65, 100].map((y) => P(`M30 ${y}h20M70 ${y}h20M150 ${y}h20`) + bowtie(60, y, 10, 7) + R(90, y - 9, 30, 18) + T(105, y + 4, 'FE', 10) + P(`M120 ${y}h10`) + bowtie(140, y, 10, 7)).join('')),
    e: {
      standard: PKG + '; ISA 5.1 FE / FQ',
      drawn: 'Dash-dot boundary with an inlet header and outlet header joined by parallel meter runs; each run has an inlet block valve, strainer, flow element (FE / FQ, ultrasonic or turbine) with PT and TT, and an outlet valve; a prover connection and sampler may be shown.',
      tags: ['X', 'A', 'FQ', 'M'],
      isa: ['FE', 'FT', 'FQI', 'FQ', 'PT', 'TT', 'AT (sampler / densitometer)'],
      notes: 'Parallel identical runs between two headers are the signature. A single flowmeter in a line is an instrument, not a metering skid; a compact prover (X-R155 type) is a separate box connected by the prover loop.',
      datasheet: { form: 'Fiscal metering system datasheet (API MPMS Ch. 4 / 5, AGA 9 / ISO 17089-1)', fields: { 'Number of meter runs': 'runs', 'Meter type': 'meterType', 'Header size': 'headerNps', 'Meter run size': 'runNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'instrument-air-package': {
    svg: svg('0 0 210 130', box(210, 130) + R(16, 46, 40, 34, 'rx="6"') + C(30, 63, 9) + C(42, 63, 9) + P('M56 63h18') + R(74, 30, 18, 66, 'rx="9"') + R(100, 30, 18, 66, 'rx="9"') + P('M118 63h20') + P('M138 40a16 10 0 0 1 32 0v50a16 10 0 0 1-32 0z') + P('M170 63h40')),
    e: {
      standard: PKG,
      drawn: 'Dash-dot package boundary containing an air compressor (screw symbol or generic compressor), a twin-tower desiccant dryer (two tall capsules side by side), filters, and the air receiver (vertical vessel) before the instrument-air (IA) header.',
      tags: ['X', 'A', 'K', 'IA'],
      isa: ['PT', 'PSLL', 'AT (dew point)'],
      notes: 'Two identical tall capsules side by side = dryer towers. Often only the package box with IA outlet and the receiver are shown on the utilities P&ID.',
      datasheet: { form: 'Instrument air package datasheet (ISO 8573-1 class, ISO 1217 capacity)', fields: { 'Compressor motor power': 'kw', 'Receiver diameter': 'receiverDiameter', 'Receiver height': 'receiverHeight', 'Design pressure': 'pressure', 'Outlet size': 'outletNps', ...tagF } },
    },
  },
  'teg-regeneration': {
    svg: svg('0 0 210 140', box(210, 140) + P('M30 80h120a18 18 0 0 1 0 36H30a18 18 0 0 1 0-36z') + P('M24 98h90M24 104h90', THIN) + P('M78 80V20h20v60') + P('M80 30h16M80 40h16M80 50h16M80 60h16', THIN) + P('M88 20V6') + P('M150 116v10h20') + C(182, 120, 10) + P('M192 120h16')),
    e: {
      standard: PKG,
      drawn: 'Dash-dot package boundary with a horizontal reboiler (capsule with a U-shaped fire tube drawn inside), a short packed still column standing on top of it with the vent to atmosphere, a surge drum and lean-glycol pumps; rich TEG in, lean TEG out to the contactor.',
      tags: ['X', 'A', 'C', 'TG'],
      notes: 'The reboiler with a fire-tube and a vertical still on top is the clue. The tall TEG contactor column itself is a separate item (column).',
      datasheet: { form: 'Glycol regeneration package datasheet (API 12GDU)', fields: { 'Reboiler diameter': 'reboilerDiameter', 'Reboiler length': 'reboilerLength', 'Still column diameter': 'stillDiameter', 'Exhaust stack height': 'stackHeight', 'Number of lean glycol pumps': 'pumps', 'Pump driver power': 'kw', 'Glycol connection size': 'glycolNps', 'Lean glycol rating': 'leanRating', ...tagF } },
    },
  },
}
