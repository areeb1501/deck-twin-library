import { svg, T, P, C, R, FILL, WHITE, THIN, DASH } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const tagF = { 'Tag number': 'tag' }
const flame = (x: number, y: number) => P(`M${x} ${y}c-12-6-10-18 0-26c10 8 12 20 0 26z`)
export default {
  'shell-and-tube-exchanger': {
    svg: svg('0 0 200 100', R(14, 24, 30, 52) + P('M14 50h30') + P('M44 30h120a10 20 0 0 1 0 40H44z') + P('M44 42h112a8 8 0 0 1 0 16H44', THIN) + P('M29 24V6M29 76v18M150 30V12M64 70v18')),
    e: {
      standard: ISO + '; TEMA type designation',
      drawn: 'Horizontal shell (long rectangle or capsule) with the channel head at one end and the tube bundle drawn as a line or U inside; tube-side nozzles on the channel, shell-side nozzles on the shell. Many legends draw a circle with a zig-zag through it, or two interlocking circles, for any exchanger, with the TEMA type (AES, AEU, BEM, AKT) written beside it.',
      tags: ['E', 'HX'],
      notes: 'The tag letter E and the TEMA type confirm it. A shell with an enlarged dome and a weir is a kettle (AKT). A box with a fan is an air cooler; a frame with many plates is a plate exchanger; two pipes with a return bend is a hairpin.',
      datasheet: { form: 'TEMA shell-and-tube heat exchanger specification sheet (API 660)', fields: { 'TEMA type': 'tema', 'Shell inside diameter': 'diameter', 'Tube length': 'length', 'Tube passes': 'passes', 'Shells (stacked)': 'stacked', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Shell-side nozzle size': 'shellNps', 'Tube-side nozzle size': 'tubeNps', Insulation: 'insulated', ...tagF } },
    },
  },
  'air-cooled-exchanger': {
    svg: svg('0 0 180 130', R(20, 14, 140, 32) + P('M20 30l10-10 14 20 14-20 14 20 14-20 14 20 14-20 14 20 14-20 14 20 6-8', THIN) + P('M4 22h16M160 38h16') + P('M66 64v14l24-7zM114 64v14l-24-7z') + P('M90 46v54') + C(90, 112, 14) + T(90, 118, 'M', 14)),
    e: {
      standard: ISO + '; API 661',
      drawn: 'Rectangle (the finned-tube bundle, often with a zig-zag tube line inside) with a fan below it (forced draft) or above it (induced draft), drawn as a propeller or bow-tie on a shaft to a motor (circle with M); louvres as a row of slanted lines over the bundle.',
      tags: ['E', 'EA', 'AC', 'AE'],
      notes: 'The fan with its motor tells it from a shell-and-tube exchanger. The number of bays and fans is written beside it (e.g. 2 bays × 2 fans).',
      datasheet: { form: 'API 661 / ISO 13706 air-cooled heat exchanger datasheet', fields: { 'Number of bays': 'bays', 'Fans per bay': 'fansPerBay', 'Tube length': 'tubeLength', 'Bay width': 'bayWidth', 'Tube rows': 'rows', 'Draft type': 'draft', 'Tube passes': 'passes', Louvres: 'louvres', 'Header type': 'header', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', 'Flange rating': 'rating', 'Fan motor power': 'kw', ...tagF } },
    },
  },
  'plate-heat-exchanger': {
    svg: svg('0 0 170 100', R(36, 16, 10, 68, FILL) + P('M46 16h100v68H46') + [58, 70, 82, 94, 106, 118, 130].map((x) => P(`M${x} 20v60`, THIN)).join('') + P('M4 26h32M4 42h32M4 58h32M4 74h32')),
    e: {
      standard: ISO,
      drawn: 'Rectangle (the plate pack) crossed by several parallel lines (the plates), between a fixed frame plate and a pressure plate, with all four connections on the fixed frame end; some legends draw a box with a diagonal zig-zag.',
      tags: ['E', 'HX', 'PHE'],
      notes: 'Many parallel lines inside a compact box = plate exchanger. A solid block with channels is a PCHE.',
      datasheet: { form: 'Plate heat exchanger datasheet (API 662 / ISO 15547-1)', fields: { 'Connection size': 'nps', 'Flange rating': 'rating', 'Number of plates': 'plates', 'Plate pitch': 'pitch', ...tagF } },
    },
  },
  'flare-boom': {
    svg: svg('0 0 160 150', P('M6 140l112-90M16 146l110-90') + P('M14 136l8 6M38 116l8 6M62 96l8 6M86 76l8 6M110 56l8 6', THIN) + P('M122 54V36') + flame(122, 34) + P('M0 146h16')),
    e: {
      standard: ISO + ' (flare tip) / layout convention for the boom',
      drawn: 'On the flare P&ID: the flare header ending at a flare tip symbol (a short stack with a flame outline on top), with pilot gas and ignition lines; on layouts an inclined boom outline from the platform edge to the tip.',
      tags: ['FL', 'FB', 'X', 'M'],
      notes: 'Inclined boom = offshore flare boom; a vertical stack from grade is a flare-stack. A stack with no flame symbol is a cold vent.',
      datasheet: { form: 'Flare system datasheet (API 537, API 521 radiation)', fields: { 'Boom length': 'length', 'Boom angle': 'angle', 'Header size': 'headerNps', 'Flange rating': 'rating', 'Number of pilots': 'pilots', ...tagF } },
    },
  },
  'flare-stack': {
    svg: svg('0 0 100 160', P('M42 156V40M58 156V40') + R(36, 44, 28, 18) + P('M36 40h28') + flame(50, 36) + P('M28 156h44') + P('M4 140h38')),
    e: {
      standard: ISO + ' (flare tip)',
      drawn: 'A tall vertical stack with a flame outline at the tip and the flare header entering at the base, often with the molecular or velocity seal drawn as a bulge below the tip and pilot lines alongside.',
      tags: ['FS', 'X', 'M'],
      notes: 'With a flame at the top it is a flare; without one it is a cold vent stack. A ground flare is a box or fence enclosure with burners.',
      datasheet: { form: 'Flare system datasheet (API 537, API 521)', fields: { 'Stack height': 'height', 'Support type': 'support', 'Header size': 'headerNps', 'Flange rating': 'rating', 'Number of pilots': 'pilots', 'Purge seal type': 'seal', ...tagF } },
    },
  },
  'fired-heater': {
    svg: svg('0 0 140 160', R(30, 56, 80, 80) + P('M30 56l24-24h32l24 24') + P('M62 32V4h16v28') + P('M4 70h40v8l12 8-12 8 12 8-12 8 12 8-12 8h52', THIN) + P('M96 122h40') + P('M4 70h26', '') + [50, 70, 90].map((x) => P(`M${x - 6} 150l6-12 6 12`)).join('')),
    e: {
      standard: ISO + ' (furnace)',
      drawn: 'A box (radiant section) with a zig-zag process coil inside, burners drawn as small flames or triangles at the floor, a tapering convection section and a stack on top; the fuel gas line goes to the burners.',
      tags: ['H', 'F', 'B'],
      notes: 'Zig-zag coil inside a firebox with burners = fired heater. An electric heater has a resistance element and a terminal box; a TEG reboiler is a horizontal capsule with a fire tube.',
      datasheet: { form: 'API 560 / ISO 13705 fired heater datasheet', fields: { 'Radiant section diameter': 'diameter', 'Radiant height': 'radiantHeight', 'Stack height': 'stackHeight', 'Number of burners': 'burners', 'Number of passes': 'passes', 'Coil connection size': 'nps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'vent-stack': {
    svg: svg('0 0 100 150', P('M4 140h40V44') + R(32, 22, 24, 22) + P('M38 22v22M44 22v22M50 22v22', THIN) + P('M44 22V4M36 12l8-8 8 8')),
    e: {
      standard: ISO + ' (vent to atmosphere, flame arrester)',
      drawn: 'A line turning up into an open-ended stack with an arrow or "to atmosphere" at the top, often with a flame arrester (box with parallel lines) at or near the tip; labelled VENT or VS-.',
      tags: ['VS', 'V', 'X'],
      notes: 'No flame symbol: a cold vent. An open-ended small-bore line ending in a goose-neck or "TO ATM" is just a vent connection, not a stack.',
      datasheet: { form: 'Vent stack datasheet (API 521 dispersion, ISO 16852 flame arrester)', fields: { 'Stack height': 'height', 'Stack size': 'nps', 'Flange rating': 'rating', 'Support type': 'support', 'Flame arrester': 'arrestor', ...tagF } },
    },
  },
  'electric-heater': {
    svg: svg('0 0 200 100', R(10, 32, 30, 36) + P('M40 30h140a12 20 0 0 1 0 40H40z') + P('M44 50l8-10 10 20 10-20 10 20 10-20 10 20 10-20 10 20 10-20 10 20 10-20 8 10', THIN) + P('M150 30V10M70 70v20')),
    e: {
      standard: ISO + ' / IEC 60617 heating element',
      drawn: 'A horizontal shell with a resistance element (zig-zag) drawn inside it and a terminal box on the flange end; the power supply comes from a thyristor controller and the process inlet and outlet are on the shell.',
      tags: ['H', 'E', 'EH'],
      notes: 'The zig-zag element plus a terminal box tells it from a shell-and-tube exchanger. On P&IDs a TIC with a TY / thyristor box and a high-temperature trip (TSHH on the element) usually accompanies it.',
      datasheet: { form: 'Electric process heater datasheet (IEC 60079-7 / ASME VIII-1)', fields: { 'Rated power': 'kw', 'Nozzle size': 'nps', 'Flange rating': 'rating', 'Design pressure': 'pressure', Insulation: 'insulated', ...tagF } },
    },
  },
  'hairpin-exchanger': {
    svg: svg('0 0 200 110', P('M30 20h120M30 40h120M30 66h120M30 86h120') + P('M150 20a33 33 0 0 1 0 66M150 40a13 13 0 0 1 0 26') + P('M30 30h124a23 23 0 0 1 0 46H30', THIN) + P('M30 20v20M30 66v20') + P('M4 30h26M4 76h26M60 20V4M60 86v18')),
    e: {
      standard: ISO,
      drawn: 'Two parallel horizontal pipes (the legs) joined by a return bend at one end, an inner pipe shown running through both, tube-side connections at the open ends and shell-side nozzles on each leg.',
      tags: ['E', 'HX'],
      notes: 'The U-shaped double-pipe outline tells it from a shell-and-tube (single shell with a channel). Stacked hairpins in series are drawn as several hairpins joined by short lines.',
      datasheet: { form: 'Double-pipe exchanger datasheet (TEMA / ASME VIII-1)', fields: { 'Outer pipe size': 'shellNps', 'Inner pipe size': 'tubeNps', 'Leg length': 'length', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'printed-circuit-heat-exchanger': {
    svg: svg('0 0 180 120', R(40, 30, 100, 60) + [0, 16, 32, 48, 64, 80].map((d) => P(`M${46 + d} 86l20-52`, THIN)).join('') + P('M4 44h36M140 76h36') + P('M70 30V8M110 90v22') + P('M60 30a10 6 0 0 1 20 0M100 90a10 6 0 0 0 20 0', THIN)),
    e: {
      standard: ISO + ' (generic exchanger box); no specific PCHE symbol',
      drawn: 'Usually a generic heat-exchanger box or rectangle with crossing flow lines and four nozzles (hot side on the ends, cold side on the faces), tagged E- and noted "PCHE" or "compact / diffusion-bonded".',
      tags: ['E', 'HX'],
      notes: 'There is no standard PCHE symbol: rely on the note or the datasheet. Common in gas dehydration, compression aftercooling and dew-point control where space is tight.',
      datasheet: { form: 'Compact heat exchanger datasheet (ASME VIII-1)', fields: { 'Number of core blocks': 'blocks', 'Block length': 'length', 'Block width': 'width', 'Block height': 'height', 'Hot-side nozzle size': 'hotNps', 'Cold-side nozzle size': 'coldNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
}
