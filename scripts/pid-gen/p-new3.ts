import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT, bowtie, bowtieV } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const FG = 'F&G / safety layout convention (NFPA 170 / ISO 7240-style plan symbols; legends vary by company)'
const LAY = 'Layout plan convention (control room / instrument layout)'
const tagF = { 'Tag number': 'tag' }
const motor = (cx: number, cy: number, r = 14) => C(cx, cy, r) + T(cx, cy + 5, 'M', 13)
export default {
  'mud-tank': {
    svg: svg('0 0 190 140', P('M14 40v86h162V40') + P('M95 40v86', THIN) + [54, 136].map((x) => motor(x, 22) + P(`M${x} 36v70M${x - 14} 106h28`) + P(`M${x - 14} 100l14 6-14 6M${x + 14} 100l-14 6 14 6`, THIN)).join('') + P('M14 70h162', DASH + ' ' + THIN) + P('M4 116h10M176 116h10')),
    e: {
      standard: ISO + ' (open tank with agitators) / API RP 13C mud system',
      drawn: 'An open-topped rectangular tank divided into compartments, each with an agitator (motor M on a shaft with impeller blades) and the mud level dashed; suction to the mud pumps and returns from the shakers.',
      tags: ['MT', 'T', 'PIT'],
      isa: ['LT (pit volume)', 'LI'],
      notes: 'Open top plus agitators = mud pit. A closed process vessel is drawn as a capsule. Pit volume totaliser (PVT) level transmitters sit on each compartment.',
      datasheet: { form: 'Mud tank datasheet (API RP 13C)', fields: { Length: 'length', Width: 'width', Height: 'height', Compartments: 'compartments', 'Agitator motor power': 'agitatorKw', 'Suction size': 'suctionNps', 'Return size': 'returnNps', ...tagF } },
    },
  },
  plet: {
    svg: svg('0 0 200 110', R(30, 20, 150, 64, DASH + ' ' + THIN) + P('M4 52h70') + bowtie(90, 52, 14, 10) + C(90, 52, 6, WHITE) + P('M104 52h40') + P('M144 36v32M152 36v32', 'stroke-width="4"') + P('M144 40l8 12-8 12') + P('M10 96h180', THIN) + P('M20 96l-8 8M50 96l-8 8M80 96l-8 8M110 96l-8 8M140 96l-8 8M170 96l-8 8', THIN)),
    e: {
      standard: 'Subsea field layout / subsea P&ID convention (API 17P)',
      drawn: 'On subsea P&IDs: the pipeline ending at a structure (dashed boundary) with an isolation valve and a connection hub (clamp or collet connector, drawn as a pair of thick bars or a hub outline) for the spool or jumper; on field layouts a small rectangle at the pipeline end.',
      tags: ['PLET', 'PLEM'],
      notes: 'A PLEM is the same arrangement with several hubs or a manifold header. Topsides pig traps and risers are separate items.',
      datasheet: { form: 'Subsea structure datasheet (API 17P / API 17D)', fields: { 'Pipeline size': 'nps', 'Flange rating': 'rating', 'Hub orientation': 'hubOrientation', 'Hub cap': 'hubCap', ...tagF } },
    },
  },
  'wall-display': {
    svg: svg('0 0 160 100', P('M10 6v88', 'stroke-width="6"') + P('M10 46h20') + R(30, 16, 110, 62) + R(38, 24, 94, 46, THIN)),
    e: {
      standard: LAY,
      drawn: 'Control room or equipment-room layout: a thin rectangle on the wall (plan) or a framed screen on a bracket (elevation), labelled with its size and content.',
      tags: ['DSP', 'LSD'],
      notes: 'A single screen; a grid of tiles is the video wall.',
      datasheet: { form: 'Display specification (ISO 11064-4)', fields: { 'Screen size': 'size', Mounting: 'mount', Style: 'style', 'Mounting height': 'elevation', ...tagF } },
    },
  },
  'cctv-camera': {
    svg: svg('0 0 180 100', R(10, 38, 50, 24) + P('M60 42l14-6v28l-14-6') + P('M74 50l100-36M74 50l100 36', DASH + ' ' + THIN) + P('M30 62v30M18 92h24')),
    e: {
      standard: 'Security / telecom layout convention (camera with field of view)',
      drawn: 'Telecom layout: a camera symbol (small box with a lens) with its field-of-view wedge drawn dashed in the direction it looks; PTZ cameras marked PTZ with a full circle of coverage.',
      tags: ['CAM', 'CCTV'],
      notes: 'A wedge from a camera box is the CCTV view; a wedge from a circle with F is a flame detector cone. Not on P&IDs.',
      datasheet: { form: 'CCTV camera datasheet (IEC 60079-1, IEC 60529)', fields: { Type: 'kind', Mounting: 'mount', 'Mounting height': 'height', Wiper: 'wiper', 'Junction box': 'junctionBox', ...tagF } },
    },
  },
  'fire-alarm-panel': {
    svg: svg('0 0 120 140', R(16, 10, 88, 120) + R(26, 20, 68, 24, THIN) + T(60, 37, 'F&amp;G', 13) + [56, 70, 84, 98, 112].map((y) => C(36, y, 4) + P(`M48 ${y}h40`, THIN)).join('')),
    e: {
      standard: FG + '; EN 54-2',
      drawn: 'On F&G block diagrams and room layouts: a rectangle labelled FACP, F&G or ESD with the zones it serves; detectors and call points are wired to it in loops.',
      tags: ['FACP', 'FGP', 'ESDP'],
      notes: 'An F&G or ESD mimic panel in the CCR; the logic itself is in the system cabinets (system-cabinet).',
      datasheet: { form: 'Fire alarm control panel datasheet (EN 54-2 / IEC 61511)', fields: { 'Panel type': 'panel', Mounting: 'mount', Zones: 'zones', 'Mounting height': 'elevation', ...tagF } },
    },
  },
  'pipeline-valve-station': {
    svg: svg('0 0 200 120', P('M4 50h192', 'stroke-width="4"') + P('M4 54l8 8M34 54l8 8M150 54l8 8M180 54l8 8', THIN) + P('M4 90h70M126 90h70') + bowtie(100, 90, 26, 14) + C(100, 90, 8, WHITE) + P('M100 82V36') + R(84, 14, 32, 22) + P('M140 90V26h20') + bowtieV(140, 66, 8, 6)),
    e: {
      standard: ISO + ' / pipeline P&ID convention (ASME B31.8)',
      drawn: 'A mainline ball valve below the grade line with its stem extended up to an above-grade actuator (rectangle: gas-over-oil or electric), and blowdown / bypass branches rising to their own valves; often within a fenced compound outline.',
      tags: ['BVS', 'MLV', 'SDV'],
      isa: ['XV', 'SDV', 'PT', 'ZS'],
      notes: 'The grade line with a buried valve and stem extension identifies it. Topsides ESDVs are esd-valve.',
      datasheet: { form: 'Pipeline valve datasheet (API 6D / ISO 14313) + actuator sheet', fields: { 'Nominal size': 'nps', 'Pressure class': 'rating', 'Actuator type': 'actuator', 'Depth of cover': 'cover', ...tagF } },
    },
  },
  'utility-station': {
    svg: svg('0 0 170 140', P('M10 14h150') + [40, 85, 130].map((x) => P(`M${x} 14v84`) + bowtieV(x, 44, 10, 7) + P(`M${x - 7} 74h14l-7 10z`, FILL) + P(`M${x - 8} 98h16l-8 14z`) + P(`M${x} 112v14`)).join('')),
    e: {
      standard: ISO + ' (utility station / hose connections)',
      drawn: 'A group of utility drops (plant air UA, utility water UW, nitrogen N) each with an isolation valve, a check valve and a hose connection (small triangle or coupling) at the end, boxed or noted "US-xx" on the utility P&ID.',
      tags: ['US', 'UST'],
      notes: 'Usually shown once in detail on a typical sheet and then as a small labelled circle or box at each location on layouts.',
      datasheet: { form: 'Utility station schedule (NORSOK L-002, ISO 14726 colour codes)', fields: { 'Plant air': 'air', 'Utility water': 'water', Nitrogen: 'nitrogen', ...tagF } },
    },
  },
  gasket: {
    svg: svg('0 0 140 80', P('M4 40h52M84 40h52') + P('M56 12v56M84 12v56') + R(66, 16, 8, 48, FILL)),
    e: {
      standard: 'Piping class item (ASME B16.20 / B16.21); not drawn on P&IDs',
      drawn: 'Not drawn on P&IDs; on isometrics and joint details it is the thin element between two flange faces (a filled strip in section), called up in the bill of materials by type (SW, RTJ, sheet).',
      tags: ['GSK'],
      notes: 'Type follows the piping class: spiral-wound for RF flanges, RTJ ring for ring-joint flanges (high pressure), sheet for FF / low-pressure utility.',
      datasheet: { form: 'Piping class / gasket specification (ASME B16.20 / B16.21)', fields: { 'Nominal size': 'nps', 'Pressure class': 'rating', 'Gasket type': 'type', 'Winding material': 'winding', Filler: 'filler', 'Ring type (RTJ)': 'ring', Thickness: 'thickness' } },
    },
  },
  'stud-bolt-set': {
    svg: svg('0 0 160 120', R(46, 10, 22, 100) + R(92, 10, 22, 100) + P('M24 30h112M24 90h112') + R(32, 22, 12, 16, WHITE) + R(116, 22, 12, 16, WHITE) + R(32, 82, 12, 16, WHITE) + R(116, 82, 12, 16, WHITE) + P('M4 60h152', 'stroke-dasharray="14 4 3 4" stroke-width="1.2"')),
    e: {
      standard: 'Piping class item (ASME B16.5 bolting, ASTM A193 / A194); not drawn on P&IDs',
      drawn: 'Not drawn on P&IDs; in joint details, studs are lines through both flanges with a hex nut at each end, specified in the bill of materials by number, diameter and length.',
      tags: ['STUD'],
      notes: 'Quantity and size come from ASME B16.5 tables for the NPS and class; coating from the piping or coating specification.',
      datasheet: { form: 'Piping class / bolting specification (ASME B16.5, ASTM A193 B7 / A194 2H)', fields: { 'Nominal size': 'nps', 'Pressure class': 'rating', Coating: 'coating' } },
    },
  },
  'emergency-telephone': {
    svg: svg('0 0 120 120', R(16, 16, 88, 88) + P('M36 50a26 18 0 0 1 48 0', 'stroke-width="6"') + R(26, 46, 18, 10, FILL) + R(76, 46, 18, 10, FILL) + R(34, 64, 52, 28) + C(46, 74, 2, FILL) + C(60, 74, 2, FILL) + C(74, 74, 2, FILL) + C(46, 84, 2, FILL) + C(60, 84, 2, FILL) + C(74, 84, 2, FILL)),
    e: {
      standard: 'Telecom layout convention; ISO 7010 sign',
      drawn: 'Telecom or escape layout: a telephone symbol (box with a handset) at the phone position, labelled EMERGENCY or with its extension; booths and acoustic hoods noted.',
      tags: ['TEL', 'ET'],
      notes: 'Only on telecom and escape layouts. A box with only a push-button is a manual call point.',
      datasheet: { form: 'Telephone station datasheet (IEC 60079-1)', fields: { Enclosure: 'enclosure', Mounting: 'mount', Colour: 'colour', 'Mounting height': 'height', 'Ringing beacon': 'beacon', 'ISO 7010 sign': 'sign', ...tagF } },
    },
  },
  'fire-hydrant': {
    svg: svg('0 0 140 140', P('M50 100V40a20 14 0 0 1 40 0v60') + P('M50 58H30M90 58h20M30 50v16M110 50v16') + P('M10 100h120', 'stroke-width="4"') + P('M70 100v28H8', DASH + ' ' + THIN)),
    e: {
      standard: FG + '; NFPA 24 / EN 14384',
      drawn: 'Fire-protection layouts: a hydrant symbol (a circle with outlet stubs, or a pillar with two side outlets) on the underground firewater main, tagged H or FH; on the firewater P&ID a branch off the ring with an isolation valve.',
      tags: ['FH', 'H', 'HYD'],
      notes: 'A riser with a nozzle barrel is a fire monitor; a reel is a hose reel. Pillar hydrants are onshore; offshore uses hose stations and monitors on the ring main.',
      datasheet: { form: 'Fire hydrant datasheet (AWWA C502 / EN 14384)', fields: { 'Inlet size': 'nps', 'Pressure class': 'rating', Outlets: 'outlets', 'Bury depth': 'bury', ...tagF } },
    },
  },
  'deluge-nozzle': {
    svg: svg('0 0 120 120', P('M10 14h100') + P('M60 14v40') + P('M50 54h20l-6 14h-8z') + P('M56 68l-30 46M60 68v46M64 68l30 46', DASH + ' ' + THIN)),
    e: {
      standard: 'Fire-protection layout / isometric convention (NFPA 15 / NFPA 13)',
      drawn: 'On deluge layouts and isometrics: a short drop from the deluge pipe ending in a nozzle (small open cone or triangle) with its spray pattern; closed sprinkler heads are a circle with a dot. The nozzle type and K-factor are tabulated.',
      tags: ['NZ', 'SP'],
      notes: 'Open nozzle (no bulb) = deluge; a sprinkler head (bulb) is drawn as a filled circle or circle with a dot. On P&IDs a deluge network is one line after the deluge valve with "nozzles" noted.',
      datasheet: { form: 'Water-spray nozzle schedule (NFPA 15 / NFPA 13)', fields: { 'Head type': 'kind', 'Connection size': 'nps', 'Pressure class': 'rating', 'Drop length': 'drop', 'Spray angle': 'angle', 'Bulb temperature rating': 'temperature', ...tagF } },
    },
  },
}
