import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT } from './h.ts'
const LAY = 'Layout plan convention (structural / plot plan drawings)'
const tagF = { 'Tag number': 'tag' }
const wave = (x0: number, y: number, n: number, w = 20) => P(`M${x0} ${y}` + Array.from({ length: n }, () => `c${w / 4}-5 ${w / 4 * 3}-5 ${w} 0`).join(''), THIN)
export default {
  'deck-module': {
    svg: svg('0 0 170 120', R(10, 10, 150, 100) + P('M10 43h150M10 77h150M60 10v100M110 10v100', DASHDOT + ' ' + THIN) + [10, 160].flatMap((x) => [10, 110].map((y) => C(x, y, 7, WHITE))).join('')),
    e: {
      standard: LAY + '; ISO 19902',
      drawn: 'Plan view: the deck outline with dash-dot structural grid lines (rows and columns, e.g. A–D and 1–6) and circles at the jacket leg positions; deck elevations (EL +28.000 TOS) written in the corners.',
      tags: ['DECK'],
      notes: 'Not on P&IDs. Equipment layouts use this outline as the background; the grid labels locate equipment. A smaller framed rectangle with bracing is a module-frame.',
      datasheet: { form: 'Structural design basis / deck framing drawing (ISO 19902, NORSOK N-004)', fields: { 'Deck length': 'length', 'Deck width': 'width', 'Floor type': 'floor', 'Primary girder': 'primary', 'Secondary beam': 'secondary', 'Secondary spacing': 'secondarySpacing', 'Number of legs': 'legs', 'Leg spacing X': 'legSpanX', 'Leg spacing Z': 'legSpanZ', 'Leg diameter': 'legDiameter' } },
    },
  },
  'pipe-rack': {
    svg: svg('0 0 140 130', P('M20 126V10M120 126V10') + P('M20 50h100M20 92h100') + P('M10 126h20M110 126h20') + [40, 62, 86, 104].map((x) => C(x, 42, 7)).join('') + [36, 58, 84].map((x) => C(x, 84, 7)).join('')),
    e: {
      standard: LAY + ' (rack cross-section)',
      drawn: 'Cross-section: a portal frame (two posts and one or more tier beams) with the pipes drawn as circles resting on each tier; in plan, two parallel lines with the bent positions marked across them and the pipes as lines along the rack.',
      tags: ['PR', 'RACK'],
      notes: 'Not on P&IDs (lines there are schematic). Cable trays on the top tier appear as narrow rectangles. A single post with arms is a cable-tray support.',
      datasheet: { form: 'Pipe rack design drawing (PIP STC01015)', fields: { 'Number of bays': 'bays', 'Bay length': 'bayLength', 'Rack width': 'width', 'Number of tiers': 'tiers', 'First tier elevation': 'firstTier', 'Tier spacing': 'tierSpacing', 'Post section': 'post', 'Tier beam section': 'beam' } },
    },
  },
  stair: {
    svg: svg('0 0 100 150', R(20, 6, 60, 138) + [24, 40, 56, 72, 88, 104, 120].map((y) => P(`M20 ${y}h60`, THIN)).join('') + P('M50 132V22') + P('M42 32l8-12 8 12') + T(70, 24, 'UP', 11)),
    e: {
      standard: LAY + '; ISO 14122-3',
      drawn: 'Plan view: a rectangle filled with parallel tread lines and an arrow along it labelled UP (or DN), often with a break line halfway.',
      tags: ['ST'],
      notes: 'Rungs at close spacing with a circle around them is a caged ladder seen in plan. Not on P&IDs.',
    },
  },
  ladder: {
    svg: svg('0 0 100 150', P('M38 146V6M62 146V6') + [130, 112, 94, 76, 58, 40, 22].map((y) => P(`M38 ${y}h24`)).join('') + [24, 48, 72].map((y) => P(`M28 ${y}a22 10 0 0 0 44 0`, THIN)).join('') + P('M28 24v60M72 24v60', THIN)),
    e: {
      standard: LAY + '; ISO 14122-4',
      drawn: 'Elevation: two stiles with rungs and hoops of the safety cage; in plan, a short pair of lines with a semicircle (the cage) against the platform edge, labelled LADDER.',
      tags: ['LD'],
      notes: 'A stair has an inclined flight with an UP arrow; a ladder is vertical. Not on P&IDs.',
    },
  },
  'access-platform': {
    svg: svg('0 0 150 110', R(10, 20, 130, 60) + P('M10 20l20 20M30 20l20 20M50 20l20 20', THIN) + R(8, 18, 8, 8, FILL) + R(134, 18, 8, 8, FILL) + R(8, 74, 8, 8, FILL) + R(134, 74, 8, 8, FILL) + P('M66 80v26M84 80v26M66 88h18M66 98h18')),
    e: {
      standard: LAY + '; ISO 14122-2',
      drawn: 'Plan view: a rectangle (often partly hatched to show grating) with the leg positions marked at the corners and the ladder or stair access drawn at one edge, labelled with its top-of-grating elevation (TOG EL +…).',
      tags: ['PF', 'AP'],
      notes: 'On P&IDs an access platform is sometimes noted beside a valve as "accessible from platform", not drawn. A larger outline with grid lines is a deck-module.',
      datasheet: { form: 'Platform / access structure drawing (ISO 14122-2/3/4)', fields: { Length: 'length', Width: 'width', 'Top of grating height': 'height', Access: 'access', 'Leg section': 'leg', 'Frame section': 'frame' } },
    },
  },
  jacket: {
    svg: svg('0 0 140 160', P('M40 10L14 150M100 10l26 140') + P('M38 22h64M30 66h80M22 110h96M14 150h112') + P('M38 22l72 44M102 22L30 66M30 66l88 44M110 66L22 110M22 110l104 40M118 110L14 150', THIN) + wave(4, 40, 6, 22)),
    e: {
      standard: LAY + ' (structural elevation); ISO 19902 / API RP 2A',
      drawn: 'Elevation: a tapering (battered) frame from the seabed up to the deck with horizontal levels and X or K bracing, the sea level drawn as a wave line and the mudline at the bottom; in plan, circles at the leg positions.',
      tags: ['JKT'],
      notes: 'Not on P&IDs. Risers and conductors are drawn along the jacket face; the deck above is deck-module.',
      datasheet: { form: 'Jacket structural drawing / design basis (ISO 19902, API RP 2A-WSD)', fields: { 'Number of legs': 'legs', 'Water depth': 'waterDepth', 'Air gap': 'airGap', 'Leg spacing X (top)': 'spanX', 'Leg spacing Z (top)': 'spanZ', 'Leg batter': 'batter', 'Leg diameter': 'legDiameter', 'Bracing pattern': 'bracing', 'Conductors': 'conductors', 'Risers': 'risers', 'Riser size': 'riserNps', 'Riser rating': 'riserRating' } },
    },
  },
  bridge: {
    svg: svg('0 0 200 90', P('M14 20h172M14 64h172') + P('M14 64L36 20l22 44 22-44 22 44 22-44 22 44 22-44 22 44', THIN) + P('M14 64l-8 16h16zM186 64v0') + C(186, 72, 8)),
    e: {
      standard: LAY + ' (structural elevation)',
      drawn: 'Elevation: two horizontal chords joined by a zig-zag Warren truss, with a pinned support (triangle) at one end and a sliding support (roller circle) at the other; in plan, two parallel lines between the platform outlines labelled with the bridge name.',
      tags: ['BR'],
      notes: 'On P&IDs a bridge appears only as off-page arrows "via bridge to RP" on lines that cross it. The sliding end is what lets the platforms move relative to each other.',
      datasheet: { form: 'Bridge structural drawing (EN 1993-2)', fields: { Span: 'length', 'Walkway width': 'width', 'Truss depth': 'depth', 'Truss type': 'truss', 'Cable trays': 'cableTrays', 'Pipe shelf': 'pipeShelf', 'Walkway lights': 'lights' } },
    },
  },
  helideck: {
    svg: svg('0 0 140 140', P('M48 6h44l42 42v44l-42 42H48L6 92V48z') + C(70, 70, 34) + C(70, 70, 22) + P('M60 56v28M80 56v28M60 70h20', 'stroke-width="4"')),
    e: {
      standard: LAY + '; CAP 437 markings',
      drawn: 'Plan view: an octagon (or circle) with the touchdown / positioning circle and the letter H at the centre, the D-value and maximum mass written on it, plus the obstacle-free sector chevron.',
      tags: ['HD', 'HLD'],
      notes: 'The H in a circle on an octagon is unambiguous. The helicopter refuelling package and the windsock are separate items around it.',
      datasheet: { form: 'Helideck design specification (CAP 437)', fields: { 'D-value': 'dValue', 'Deck height': 'height', 'Maximum allowable mass': 'maxMass', 'Installation name': 'installation', 'Perimeter netting': 'netting', 'Lighting': 'lights' } },
    },
  },
  'steel-column': {
    svg: svg('0 0 110 110', R(10, 10, 90, 90, THIN) + P('M30 32h50M30 78h50M55 32v46', 'stroke-width="6"') + C(20, 20, 4) + C(90, 20, 4) + C(20, 90, 4) + C(90, 90, 4)),
    e: {
      standard: LAY + ' (structural plan / section)',
      drawn: 'Plan view at a grid intersection: the column section (an H or I shape, a square for SHS, a circle for CHS) on a square base plate with anchor bolt circles, tagged with its section size.',
      tags: ['C', 'COL'],
      notes: 'Not on P&IDs. On framing plans columns sit on the dash-dot grid; a beam is drawn as a single line between them with its section written along it.',
      datasheet: { form: 'Structural member schedule (EN 10365 / AISC 360)', fields: { Section: 'section', Height: 'height', 'Web orientation': 'web', 'Pedestal height': 'pedestal', 'Base plate size': 'plate', Finish: 'finish' } },
    },
  },
  'steel-beam': {
    svg: svg('0 0 180 70', P('M16 20h148M16 50h148') + P('M16 14v42M164 14v42', 'stroke-width="4"') + P('M90 20v30', THIN) + P('M6 35h6M168 35h6', THIN)),
    e: {
      standard: LAY + ' (structural elevation / framing plan)',
      drawn: 'Elevation: two parallel flange lines with end plates (or fin plates) at each end; on framing plans a single thick line between columns with the section (e.g. IPE 300, TOS EL +28.000) written along it.',
      tags: ['B', 'BM'],
      notes: 'Not on P&IDs. A beam drawn thicker on a plan is usually a primary girder.',
      datasheet: { form: 'Structural member schedule (EN 10365 / AISC 360)', fields: { Section: 'section', Length: 'length', 'Top of steel': 'topOfSteel', Connection: 'connection', Stiffeners: 'stiffeners', Finish: 'finish' } },
    },
  },
  'grating-panel': {
    svg: svg('0 0 160 100', R(10, 10, 140, 80) + [20, 30, 40, 50, 60, 70, 80].map((y) => P(`M10 ${y}h140`, THIN)).join('') + P('M40 10v80M80 10v80M120 10v80', 'stroke-width="1"')),
    e: {
      standard: LAY + ' (floor plan hatch)',
      drawn: 'Plan view: an area filled with close parallel lines (the bearing bar direction), sometimes a cross-hatch, with the panel outline; solid plate is drawn plain or with a checker-plate hatch.',
      tags: ['GR'],
      notes: 'Only on structural and layout drawings. The hatch direction shows the span direction of the bearing bars.',
      datasheet: { form: 'Grating schedule (EN ISO 14122-2 / ANSI/NAAMM MBG 531)', fields: { 'Panel length': 'length', 'Panel width': 'width', 'Bearing bar depth': 'depth', 'Bearing bar pitch': 'pitch', 'Kick plates': 'kickPlates', Finish: 'finish' } },
    },
  },
  handrail: {
    svg: svg('0 0 180 90', P('M10 16h160M10 50h160') + P('M10 16v66M60 16v66M110 16v66M160 16v66') + P('M10 76h160', 'stroke-width="4"')),
    e: {
      standard: LAY + ' (elevation); ISO 14122-3',
      drawn: 'Elevation: top rail and knee rail on posts with a toe plate at the bottom; on plans a line just inside the deck or platform edge with small post marks (or crosses), and a gate drawn as a short swing arc.',
      tags: ['HR'],
      notes: 'On plans it looks like a wall line; the post marks and the location at the edge identify it. Not on P&IDs.',
      datasheet: { form: 'Guard-rail detail (ISO 14122-3)', fields: { Length: 'length', 'Rail height': 'height', 'Self-closing gate': 'gate', 'Gate width': 'gateWidth', 'End returns': 'returns', 'Toe plate': 'toePlate', Finish: 'finish' } },
    },
  },
  'cable-tray': {
    svg: svg('0 0 140 130', P('M30 126V6M18 126h24') + [24, 64, 104].map((y) => P(`M30 ${y + 14}h90`) + P(`M48 ${y}v14h66V${y}`)).join('') + [24, 64, 104].map((y) => P(`M30 ${y + 6}l12 8`, THIN)).join('')),
    e: {
      standard: 'Electrical layout convention; IEC 61537',
      drawn: 'Cross-section: stacked open trays (U-channels) on cantilever arms from a post; on cable routing plans two parallel lines with the tray width and level (e.g. 600 W, TOT EL +3.2) and short diagonals or rung marks.',
      tags: ['CT'],
      notes: 'Only on electrical and instrument layouts. Two parallel lines with rungs in plan can be confused with a ladder; trays run along routes and carry width notes.',
      datasheet: { form: 'Cable tray schedule (IEC 61537 / NEMA VE 1)', fields: { 'Run length': 'length', 'Tray width': 'width', 'Number of tiers': 'tiers', 'Tier spacing': 'tierSpacing', 'Elevation': 'elevation', 'Support spacing': 'supportSpacing', Cover: 'cover', Material: 'material' } },
    },
  },
  caisson: {
    svg: svg('0 0 120 160', P('M10 30h100', 'stroke-width="4"') + P('M44 14v142M76 14v142') + P('M38 14h44') + P('M76 22h40') + wave(4, 80, 5, 22) + P('M44 156h6M70 156h6', THIN)),
    e: {
      standard: 'ISO 10628-2 / P&ID convention for deck-hung caissons',
      drawn: 'A long vertical pipe or open-bottom vessel hanging from the deck through the sea-level line, with the inlet or pump column entering at the top; labelled as seawater lift, firewater, disposal or sump caisson.',
      tags: ['CA', 'CAI', 'T'],
      notes: 'Pumps drawn inside it are vertical-turbine-pump or diesel-firewater-pump. A riser is a pipe line (with ESDV) that continues to a subsea pipeline, not an open-ended caisson.',
      datasheet: { form: 'Caisson datasheet / structural drawing (NORSOK P-001, ISO 19902)', fields: { 'Caisson size': 'nps', Length: 'length', 'Stick-up above deck': 'stickUp', 'Inlet nozzle size': 'inletNps', 'Vent nozzle size': 'ventNps', 'Flange rating': 'rating', 'Guide spacing': 'guideSpacing', Anodes: 'anodes' } },
    },
  },
  'module-frame': {
    svg: svg('0 0 170 120', R(10, 20, 150, 90) + P('M10 65h150') + P('M85 20v90') + P('M10 20l75 45M85 20L10 65M85 65l75 45M160 65L85 110', THIN) + C(14, 12, 5) + C(156, 12, 5)),
    e: {
      standard: LAY + ' (structural elevation); ISO 19901-6 lifting',
      drawn: 'Elevation: a rectangular frame with intermediate floor and X-bracing on the faces, padeyes at the top corners; on plot plans a module boundary rectangle with its tag and weight.',
      tags: ['MOD', 'M'],
      notes: 'On P&IDs a module or package boundary is a dash-dot rectangle around the equipment it carries.',
      datasheet: { form: 'Module structural drawing / weight report (ISO 19901-6, DNV-ST-N001)', fields: { Length: 'length', Width: 'width', Height: 'height', 'Base frame section': 'base', 'Column section': 'post', 'Roof beam section': 'roofBeam', 'Roof deck': 'roofDeck', Bracing: 'bracing', Padeyes: 'padeyes' } },
    },
  },
}
