import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT, bubble } from './h.ts'
const IEC = 'IEC 60617 (single-line diagram)'
const LAY = 'Layout plan convention (plot plan / equipment layout)'
const tagF = { 'Tag number': 'tag' }
/** IEC circuit breaker on a vertical feeder at x from y0 to y1 (blade + cross on the fixed contact) */
const brk = (x: number, y0: number, y1: number) => P(`M${x} ${y0}v8M${x} ${y1}v-8L${x - 9} ${y0 + 11}`) + P(`M${x - 4} ${y0 + 4}l8 8M${x + 4} ${y0 + 4}l-8 8`, 'stroke-width="2"')
const door = (x: number, y: number, w: number, up = true) => P(`M${x} ${y}h${w}`, 'stroke="#fff" stroke-width="4"') + P(`M${x} ${y}V${up ? y - w : y + w}`) + P(`M${x} ${up ? y - w : y + w}A${w} ${w} 0 0 ${up ? 1 : 0} ${x + w} ${y}`, THIN)
export default {
  transformer: {
    svg: svg('0 0 80 130', P('M40 4v24M40 102v24') + C(40, 48, 22) + C(40, 82, 22)),
    e: {
      standard: IEC,
      drawn: 'Two overlapping circles (one per winding) on the single-line diagram, with the HV feeder above and the LV feeder below. Winding symbols (Δ, Y, Yn) and the MVA / kV rating are written beside it; a diagonal arrow through both circles marks an on-load tap changer.',
      tags: ['TR', 'T', 'TX'],
      notes: 'Two circles = two-winding transformer; three circles = three-winding. ANSI drawings show two facing coils instead. Two circles in a P&ID instrument context are not used, so this symbol is almost always electrical.',
      datasheet: { form: 'Transformer datasheet / rating plate (IEC 60076-1)', fields: { 'Rated power': 'mva', 'HV rated voltage': 'hvKv', 'LV rated voltage': 'lvKv', 'Cooling (ONAN / ONAF)': 'cooling', 'Terminations': 'terminations', 'On-load tap changer': 'oltc', ...tagF } },
    },
  },
  switchgear: {
    svg: svg('0 0 160 120', R(6, 6, 148, 108, DASH + ' ' + THIN) + P('M80 0v12') + brk(80, 12, 40) + P('M14 44h132', 'stroke-width="6"') + [40, 80, 120].map((x) => P(`M${x} 44v12`) + brk(x, 56, 84) + P(`M${x} 84v20M${x - 5} 98l5 8 5-8`)).join('')),
    e: {
      standard: IEC,
      drawn: 'Thick horizontal busbar with an incoming feeder and several outgoing feeders, each through a circuit breaker (a switch blade with a small × on the fixed contact) or contactor, often inside a dashed boundary with the board tag and voltage.',
      tags: ['SWG', 'SB', 'MCC', 'HV', 'LV'],
      notes: 'Breaker: × on the contact. Disconnector: a bar across the contact. Contactor (MCC starter): a half-circle on the contact. On layouts a switchgear line-up is a long rectangle divided into panels inside an E-house.',
      datasheet: { form: 'Switchgear / switchboard datasheet (IEC 62271-200 / IEC 61439)', fields: { 'Type (MV / LV / MCC)': 'kind', 'Number of panels': 'panels', 'Rated voltage': 'kv', ...tagF } },
    },
  },
  'e-house': {
    svg: svg('0 0 170 100', R(6, 6, 158, 88) + door(30, 94, 20) + door(126, 94, 20) + T(85, 56, 'E-HOUSE', 13)),
    e: {
      standard: LAY,
      drawn: 'Rectangle with door swings (quarter arcs at the openings) on the layout, labelled with the building tag (LER, E-house, MCC room). On a P&ID it appears only as a dashed boundary or an off-sheet reference.',
      tags: ['B', 'EH', 'LER'],
      notes: 'All buildings look alike on a plot plan: read the label. A rectangle with an AT bubble inside is an analyser-shelter; a small square with JB is a junction-box.',
      datasheet: { form: 'Modular building / E-house datasheet (IEC 62271-202; A60 fire rating)', fields: { Length: 'length', Width: 'width', Height: 'height', 'Cable cellar depth': 'cellar', Cladding: 'cladding', 'Main voltage': 'kv', ...tagF } },
    },
  },
  'local-control-station': {
    svg: svg('0 0 140 90', bubble(36, 34, 'HS', 22) + P('M58 34h28', DASH) + C(110, 34, 22) + T(110, 41, 'M', 18) + P('M110 56v20')),
    e: {
      standard: 'ISA 5.1 (hand switch bubble) / IEC 60617',
      drawn: 'Field bubble marked HS (hand switch) beside the motor it starts and stops, joined to it by a dashed electrical signal line; the bubble is often annotated START / STOP or L-O-R.',
      tags: ['LCS', 'HS'],
      isa: ['HS', 'HMS'],
      notes: 'HS bubbles with a horizontal bar are on the console, not in the field. Some P&IDs omit local stations entirely; they then appear only on the electrical layout as a small rectangle at the motor.',
      datasheet: { form: 'Local control station datasheet (IEC 60079-7, IEC 60947-5-1)', fields: { Enclosure: 'enclosure', Ammeter: 'ammeter', 'Selector (L-O-R)': 'selector', 'Emergency stop': 'estop', 'Ammeter range': 'amps', ...tagF } },
    },
  },
  'junction-box': {
    svg: svg('0 0 110 100', R(25, 10, 60, 54) + T(55, 43, 'JB', 18) + P('M40 64v32M55 64v32M70 64v32M85 36h22')),
    e: {
      standard: 'Instrument / electrical layout convention',
      drawn: 'Small square or rectangle labelled JB plus its number, with field cables entering from the bottom and a multicore leaving towards the control room.',
      tags: ['JB', 'JBE', 'JBI'],
      notes: 'Appears on instrument location plans, cable block diagrams and electrical layouts, not on P&IDs. An LCS is a similar small box at a motor with push-buttons.',
      datasheet: { form: 'Junction box datasheet (IEC 60079-7 / IEC 60529)', fields: { Size: 'size', 'Enclosure material': 'enclosure', 'Number of cable glands': 'glands', ...tagF } },
    },
  },
  'lighting-mast': {
    svg: svg('0 0 120 130', P('M60 34v90M40 124h40') + P('M28 34h64') + C(28, 20, 12) + C(92, 20, 12) + P('M20 12l16 16M36 12L20 28M84 12l16 16M100 12L84 28', 'stroke-width="2"')),
    e: {
      standard: 'IEC 60617 (lamp: circle with ×) / lighting layout convention',
      drawn: 'On lighting layouts: the lamp symbol (circle with ×) for each floodlight, drawn on a mast or pole with its mounting height noted; floodlights sometimes add an arrow or wedge for the aiming direction.',
      tags: ['LM', 'FL'],
      notes: 'Circle with × is the generic IEC lamp; a status beacon on F&G layouts uses a similar lamp with rays (alarm-beacon). Lighting is not shown on P&IDs.',
      datasheet: { form: 'Lighting mast / floodlight datasheet (EN 40-3, IEC 60598-2-5)', fields: { 'Mast style': 'style', 'Mounting height': 'height', 'Number of floodlights': 'count', 'Aiming tilt': 'tilt', 'Head access': 'access', ...tagF } },
    },
  },
  'analyser-shelter': {
    svg: svg('0 0 170 100', R(6, 6, 158, 88) + door(20, 94, 22) + door(128, 94, 22) + bubble(85, 46, 'AT', 20)),
    e: {
      standard: LAY + ' + ISA 5.1 analyser bubbles',
      drawn: 'Building rectangle with doors at each end on the layout. On the P&ID the analysers inside (AT / AE bubbles) are often drawn within a dashed boundary marked "analyser house" with sample and return lines to the process.',
      tags: ['AH', 'B'],
      isa: ['AT', 'AE', 'AIT'],
      notes: 'Look for sample lines (small-bore, often with a sample cooler) running to a boundary that contains several AT bubbles. A building with no analysers is an E-house or LER.',
      datasheet: { form: 'Analyser house datasheet (IEC 61285 / EEMUA 138)', fields: { Length: 'length', Width: 'width', Height: 'height', 'Analyser panels': 'panels', 'Calibration gas bottles': 'bottles', ...tagF } },
    },
  },
  'ups-battery-cabinet': {
    svg: svg('0 0 180 110', P('M4 30h22') + R(26, 10, 40, 40) + P('M26 50l40-40') + T(38, 28, '~', 14) + T(56, 46, '=', 14) + P('M66 30h48') + R(114, 10, 40, 40) + P('M114 50l40-40') + T(126, 28, '=', 14) + T(144, 46, '~', 14) + P('M154 30h22') + P('M90 30v40') + P('M78 70h24', 'stroke-width="3"') + P('M84 78h12', 'stroke-width="5"') + P('M78 86h24', 'stroke-width="3"') + P('M84 94h12', 'stroke-width="5"') + P('M90 94v12')),
    e: {
      standard: IEC,
      drawn: 'Rectifier (square with a diagonal, ~ above and = below) feeding a DC link with a battery (pairs of long and short parallel lines), then an inverter (= / ~), often with a static bypass switch drawn around them, inside a UPS boundary.',
      tags: ['UPS', 'BAT', 'DB'],
      notes: 'Square with a diagonal is the IEC converter: ~ / = is a rectifier or charger, = / ~ an inverter, ~ / ~ a frequency converter (VFD). Battery alone (long and short lines) is a DC battery bank.',
      datasheet: { form: 'UPS datasheet (IEC 62040-3, batteries IEC 60896-21)', fields: { 'Rated output': 'kva', 'Battery cabinets': 'batteryCabinets', ...tagF } },
    },
  },
  'vfd-cabinet': {
    svg: svg('0 0 90 160', P('M45 4v22') + R(15, 26, 60, 60) + P('M15 86l60-60') + T(32, 52, '~', 18) + T(58, 78, '~', 18) + P('M45 86v28') + C(45, 132, 20) + T(45, 139, 'M', 18)),
    e: {
      standard: IEC,
      drawn: 'IEC converter square with a diagonal and ~ on both sides (frequency converter), in the feeder to a motor (circle with M). On P&IDs the motor may carry an SC or VSD note, and the speed signal is an SC / SIC loop.',
      tags: ['VFD', 'VSD', 'U'],
      isa: ['SC', 'SIC', 'SY'],
      notes: '~ / ~ = frequency converter (VFD); ~ / = = rectifier; = / ~ = inverter. Soft starters are drawn as a box with a different note.',
      datasheet: { form: 'Variable speed drive datasheet (IEC 61800-4 / IEC 61800-5-1)', fields: { 'Rated motor power': 'kw', 'Rated voltage': 'kv', ...tagF } },
    },
  },
  'neutral-earthing-resistor': {
    svg: svg('0 0 80 140', P('M40 4v26') + R(28, 30, 24, 52) + P('M40 82v28') + P('M20 110h40M27 118h26M34 126h12')),
    e: {
      standard: IEC,
      drawn: 'Rectangle (IEC resistor) in the line from the transformer or generator star point down to the earth symbol (three shortening horizontal lines), often with a CT on the neutral.',
      tags: ['NER', 'R'],
      notes: 'IEC draws resistors as rectangles; ANSI drawings use a zig-zag. A rectangle in a neutral-to-earth connection is an NER; an earthing transformer is a zig-zag winding symbol instead.',
      datasheet: { form: 'Neutral earthing resistor datasheet (IEEE 32)', fields: { 'System voltage': 'kv', 'Rated current': 'amps', 'Rated time': 'seconds', 'Neutral entry': 'entry', ...tagF } },
    },
  },
  'navigation-aid': {
    svg: svg('0 0 120 120', C(60, 40, 14) + P('M60 54v56M44 110h32') + P('M60 8v10M60 62v0M28 40h10M82 40h10M37 17l7 7M83 17l-7 7M37 63l7-7M83 63l-7-7', THIN)),
    e: {
      standard: LAY + '; IALA R0139 marking',
      drawn: 'On layouts: a lantern (circle) with light rays at the platform corners, labelled with its character (e.g. Mo(U) 15s, 10 nm) and a fog signal marked FOG or a horn outline.',
      tags: ['NAV', 'AtoN'],
      notes: 'Not on P&IDs. Obstruction lights on stacks and cranes are smaller red lamps; status beacons on F&G layouts are alarm-beacon.',
      datasheet: { form: 'Aids to navigation specification (IALA R0139)', fields: { Type: 'kind', 'Light colour': 'color', 'Nominal range': 'range', 'Mounting height': 'height', ...tagF } },
    },
  },
}
