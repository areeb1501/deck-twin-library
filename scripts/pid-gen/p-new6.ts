import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT, bowtie, bowtieV } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const IEC = 'IEC 60617 (single-line diagram)'
const LAY = 'Layout plan convention'
const tagF = { 'Tag number': 'tag' }
const chokeArrow = (cx: number, cy: number, s = 14) => P(`M${cx - s} ${cy + s}L${cx + s} ${cy - s}`) + P(`M${cx + s} ${cy - s}l-9 2 7 7z`, FILL)
const earth = (x: number, y: number) => P(`M${x} ${y - 10}v10M${x - 14} ${y}h28M${x - 9} ${y + 6}h18M${x - 4} ${y + 12}h8`)
const sea = (y: number, w = 150) => P(`M6 ${y}h${w}`, THIN) + Array.from({ length: Math.floor(w / 26) }, (_, i) => P(`M${16 + i * 26} ${y}l-8 8`, THIN)).join('')
export default {
  'subsea-tree': {
    svg: svg('0 0 160 190', R(10, 6, 140, 156, DASH + ' ' + THIN) + R(40, 140, 40, 20) + P('M60 140V22') + bowtieV(60, 120, 12, 9) + P('M51 120H38') + R(20, 112, 18, 16) + bowtieV(60, 92, 12, 9) + P('M51 92H38') + R(20, 84, 18, 16) + P('M60 66h94') + bowtie(88, 66, 12, 9) + P('M88 57V44') + R(80, 30, 16, 14) + bowtie(122, 66, 12, 9) + chokeArrow(122, 66) + bowtieV(60, 40, 10, 8) + R(52, 12, 16, 8) + sea(176)),
    e: {
      standard: 'API 17D subsea P&ID convention, drawn like the surface tree (ISO 10628-2 valves)',
      drawn: 'Same valve stack as a surface tree, but every valve is actuated (small actuator boxes), it sits inside a dashed subsea boundary above the seabed line, and an annulus line and SCSSV control line run alongside. Production master (PMV), production wing (PWV) and the subsea choke sit on the side outlet to the flowline or jumper.',
      tags: ['XT', 'SXT', 'W'],
      isa: ['XV', 'PT', 'TT'],
      notes: 'A dashed subsea boundary, seabed line and all-actuated valves distinguish it from a surface christmas-tree. PMV / PWV / AMV / AWV are subsea valve tags, not ISA letter codes.',
      datasheet: { form: 'Subsea tree datasheet (API 17D / ISO 13628-4)', fields: { 'Production outlet size': 'productionNps', 'Annulus outlet size': 'annulusNps', 'Subsea choke': 'choke', ...tagF } },
    },
  },
  'pipe-handling-catwalk': {
    svg: svg('0 0 200 110', R(20, 34, 150, 40) + P('M20 54h150', DASHDOT + ' ' + THIN) + P('M30 14h130M30 22h130M30 86h130M30 94h130', THIN) + P('M170 54h26M186 46l10 8-10 8')),
    e: {
      standard: LAY + ' (drill floor / pipe deck layout)',
      drawn: 'Drill-floor and pipe-deck layouts: a long rectangle with the trough centreline aimed at the V-door, pipe racks drawn as parallel lines along both sides, and an arrow towards the drill floor.',
      tags: ['CW'],
      notes: 'Only on drilling layouts, never on P&IDs.',
      datasheet: { form: 'Pipe-handling equipment datasheet (API 7K)', fields: { 'Catwalk length': 'length', 'Drill floor height': 'floorHeight', 'Maximum pipe OD': 'pipeOd', ...tagF } },
    },
  },
  'cement-unit': {
    svg: svg('0 0 210 130', R(4, 4, 202, 122, DASHDOT + ' stroke-width="2"') + P('M20 30h44v60H20z') + P('M24 50h36', DASH + ' ' + THIN) + [100, 150].map((x) => C(x, 70, 20) + P(`M${x - 8} 58v24`, 'stroke-width="4"') + P(`M${x - 8} 70h28`) + P(`M${x} 50V24`) + P(`M${x} 90v14H42V90`)).join('') + P('M100 24h106')),
    e: {
      standard: ISO + ' (package boundary; reciprocating pumps)',
      drawn: 'On well-service schematics: a dash-dot skid boundary with displacement / mixing tanks and two reciprocating (triplex) pump symbols discharging into a common high-pressure line to the cement head or standpipe.',
      tags: ['CU', 'X'],
      notes: 'Twin reciprocating pumps on a skid with displacement tanks = cement unit; a single mud pump with a dampener is a mud-pump. Usually on temporary well-service layouts rather than process P&IDs.',
      datasheet: { form: 'Cementing unit datasheet (API 7K pumps, DNV 2.7-3 skid)', fields: { 'Pump driver power': 'kw', 'Displacement tank capacity': 'tankBbl', 'Discharge rating': 'dischargeRating', ...tagF } },
    },
  },
  'coiled-tubing-unit': {
    svg: svg('0 0 200 150', C(50, 96, 38) + C(50, 96, 14) + P('M50 58C90 20 130 14 150 30') + P('M150 30a16 16 0 0 1 16 16') + R(150, 50, 32, 28) + P('M166 78v40') + R(154, 118, 24, 20) + P('M120 146h76', 'stroke-width="4"')),
    e: {
      standard: LAY + ' (well-intervention spread)',
      drawn: 'Well-intervention layouts: a reel (two concentric circles) with the tubing running over the gooseneck to the injector head (box) above the well-control stack on the well; the control cabin and power pack are rectangles beside the reel.',
      tags: ['CTU'],
      notes: 'Temporary equipment, not shown on process P&IDs. The stack below the injector is a well-control item (bop-stack).',
      datasheet: { form: 'Coiled tubing equipment datasheet (API RP 16ST, API 5ST tubing)', fields: { 'Tubing OD': 'tubingOd', 'Reel flange diameter': 'flangeDia', 'Reel core diameter': 'coreDia', ...tagF } },
    },
  },
  'bund-wall': {
    svg: svg('0 0 180 140', R(10, 10, 160, 120) + R(18, 18, 144, 104) + C(90, 70, 34, DASH + ' ' + THIN) + R(140, 100, 14, 14) + P('M154 107h26') + bowtie(170, 107, 7, 5)),
    e: {
      standard: LAY + ' (plot plan containment)',
      drawn: 'Plot plan: a double-line rectangle (the wall thickness) enclosing the tank outline, with the bund drain sump in a corner and a normally closed drain valve outside the wall; the bund capacity and wall height are noted.',
      tags: ['BW'],
      notes: 'A double-line enclosure around tanks = bund. On P&IDs only the bund drain line and its locked-closed valve appear.',
      datasheet: { form: 'Secondary containment design (NFPA 30 / EI 19, EN 1992-3)', fields: { Length: 'length', Width: 'width', 'Wall height': 'height', 'Wall thickness': 'thickness', 'Access stairs': 'stairs', 'Drain size': 'drainNps', ...tagF } },
    },
  },
  'perimeter-fence': {
    svg: svg('0 0 200 80', P('M4 50h70M126 50h70') + [24, 54, 146, 176].map((x) => P(`M${x - 5} 45l10 10M${x + 5} 45l-10 10`, THIN)).join('') + P('M74 50l40-30', 'stroke-width="3"') + P('M74 50a50 50 0 0 1 50 0', DASH + ' ' + THIN)),
    e: {
      standard: LAY + ' (site plan)',
      drawn: 'Site plan: a line with crosses at intervals (-x-x-) along the boundary, gates shown as a swing (leaf and arc) or a sliding leaf, with fence height and type noted.',
      tags: ['FNC'],
      notes: 'Only on site plans. The crosses distinguish it from a wall (solid double line) or a curb.',
      datasheet: { form: 'Fencing specification (BS 1722-10 / -12, ASTM F567)', fields: { 'Run length': 'length', Style: 'style', Height: 'height', Topping: 'topping', Gate: 'gate', 'Gate width': 'gateWidth', Finish: 'finish', ...tagF } },
    },
  },
  'hv-circuit-breaker': {
    svg: svg('0 0 80 120', P('M40 4v34M40 116V82L22 42') + P('M34 32l12 12M46 32L34 44', 'stroke-width="2.5"')),
    e: {
      standard: IEC + '; IEC 62271-100',
      drawn: 'Single-line: a switch blade (a line at an angle) with a small × on the fixed contact, in the feeder between busbar and line or transformer; often drawn inside a bay with disconnectors on either side.',
      tags: ['CB', 'QA'],
      notes: 'IEC symbols: × on the contact = circuit breaker; a bar across the contact = disconnector; a blade to the earth symbol = earthing switch. ANSI drawings use a square box with device number 52. QA / QB / QC are IEC 81346-2 class letters for breaker, disconnector and earthing switch.',
      datasheet: { form: 'HV circuit breaker datasheet (IEC 62271-100)', fields: { 'Rated voltage': 'kv', 'External insulation': 'insulation', ...tagF } },
    },
  },
  disconnector: {
    svg: svg('0 0 130 140', P('M40 4v34M40 136V82L22 42') + P('M32 38h16') + P('M40 18h50v12L76 64') + P('M82 70h16') + P('M90 70v38') + P('M76 108h28M81 114h18M86 120h8')),
    e: {
      standard: IEC + '; IEC 62271-102',
      drawn: 'Single-line: a switch blade with a short bar across the fixed contact (disconnector), usually next to an earthing switch drawn as a second blade going to the earth symbol (three shortening lines).',
      tags: ['QB', 'QC'],
      notes: 'Bar on the contact = disconnector (isolator, no load breaking); × = circuit breaker. Some drawings tag disconnectors DS. ANSI device numbers are 89 for the disconnector and 57 for the earthing switch.',
      datasheet: { form: 'HV disconnector datasheet (IEC 62271-102)', fields: { 'Rated voltage': 'kv', Style: 'style', 'External insulation': 'insulation', ...tagF } },
    },
  },
  'instrument-transformer': {
    svg: svg('0 0 150 130', P('M40 4v122') + C(40, 50, 14) + P('M54 50h22', THIN) + P('M110 4v20') + C(110, 38, 14) + C(110, 58, 14) + P('M110 72v14') + earth(110, 100)),
    e: {
      standard: IEC + '; IEC 61869',
      drawn: 'Single-line: a current transformer is a small circle threaded on the primary conductor (or a loop) with its secondary leads; a voltage transformer is a pair of small overlapping circles connected from the line to earth. A CVT adds a capacitor stack (two parallel plates) above the VT.',
      tags: ['CT', 'VT', 'CVT'],
      notes: 'Circle on the line = CT; two circles from line to earth = VT. Small overlapping circles in a feeder (not to earth) are a power transformer. CT also collides with cooling-tower tags on process drawings: context decides.',
      datasheet: { form: 'Instrument transformer datasheet (IEC 61869-2 / -3 / -5)', fields: { Type: 'kind', 'Rated voltage': 'kv', 'External insulation': 'insulation', ...tagF } },
    },
  },
  'surge-arrester': {
    svg: svg('0 0 80 140', P('M40 4v28') + R(26, 32, 28, 56) + P('M40 40v38') + P('M33 70l7 10 7-10', FILL) + P('M40 88v26') + earth(40, 124)),
    e: {
      standard: IEC + '; IEC 60099-4',
      drawn: 'Single-line: a rectangle (non-linear resistor) with an arrow inside pointing to earth, connected from the line to the earth symbol, usually at transformer terminals and line entries.',
      tags: ['SA', 'LA'],
      notes: 'Rectangle with an internal arrow to earth = surge arrester; a plain rectangle to earth on a neutral is a neutral earthing resistor. LA (lightning arrester) is an older name.',
      datasheet: { form: 'Surge arrester datasheet (IEC 60099-4)', fields: { 'System voltage': 'kv', 'Housing insulation': 'insulation', ...tagF } },
    },
  },
  'busbar-gantry': {
    svg: svg('0 0 200 100', P('M10 30h180', 'stroke-width="7"') + [50, 100, 150].map((x) => C(x, 30, 4, FILL) + P(`M${x} 34v60`)).join('') + P('M10 12v36M190 12v36', THIN)),
    e: {
      standard: IEC + ' (busbar); layout elevation for the gantry steel',
      drawn: 'Single-line: a thick horizontal line (busbar) with bay connections dropping from it at dots; on substation layouts and elevations the gantry is a pair of lattice columns with a girder carrying strain insulator strings and the bus conductors.',
      tags: ['BB', 'BUS'],
      notes: 'A thick line with feeders = busbar. Double-busbar stations show two parallel thick lines with a coupler bay between them.',
      datasheet: { form: 'Substation design basis (IEC 61936-1, IEC 60383 insulators)', fields: { 'Number of bays': 'bays', 'Rated voltage': 'kv', 'Gantry span': 'span', ...tagF } },
    },
  },
  'industrial-building': {
    svg: svg('0 0 190 120', R(10, 10, 170, 100) + P('M10 40h170M10 80h170M60 10v100M110 10v100M160 10v100', DASHDOT + ' stroke-width="1"') + P('M70 110h40', 'stroke="#fff" stroke-width="5"') + P('M70 110h40', DASH) + P('M140 110h16', 'stroke="#fff" stroke-width="5"') + P('M140 110V94a16 16 0 0 1 16 16', THIN)),
    e: {
      standard: LAY + ' (site plan / architectural plan)',
      drawn: 'Site or floor plan: a rectangle on the structural grid (dash-dot), with roller-shutter doors shown as dashed lines across openings and personnel doors as swing arcs; the building name and use are written inside.',
      tags: ['B', 'BLDG'],
      notes: 'Buildings are identified by label on plot plans; an E-house or analyser shelter is smaller and skid-based. Not on P&IDs.',
      datasheet: { form: 'Building specification (EN 1993-1-1 frame, EN 14509 cladding, EN 13241 doors)', fields: { Use: 'kind', Length: 'length', Width: 'width', 'Eaves height': 'eaves', 'Roof pitch': 'pitch', 'Roller doors': 'rollerDoors', 'Personnel doors': 'personnelDoors', ...tagF } },
    },
  },
  gatehouse: {
    svg: svg('0 0 200 120', R(20, 40, 40, 40) + P('M14 34h52v52H14z', THIN) + C(70, 60, 5) + P('M75 60h110', 'stroke-width="4"') + P('M100 18h70M100 102h70', DASH + ' ' + THIN) + P('M150 24h20M162 18l8 6-8 6M120 96h-20M108 90l-8 6 8 6', THIN)),
    e: {
      standard: LAY + ' (site plan)',
      drawn: 'Site plan: a small hut rectangle on a curbed island beside the lane, a boom barrier drawn as a thick line from a pivot across the lane, and lane direction arrows.',
      tags: ['GH'],
      notes: 'Only on site and security plans.',
      datasheet: { form: 'Barrier / gate specification (EN 12453, EN 13241)', fields: { 'Lane width': 'laneWidth', ...tagF } },
    },
  },
  'flexible-hose': {
    svg: svg('0 0 180 70', P('M4 35h26M150 35h26') + P('M30 20v30M150 20v30') + P('M30 35c10-14 20 14 30 0s20 14 30 0 20 14 30 0 20 14 30 0')),
    e: {
      standard: ISO + ' (flexible hose / connection)',
      drawn: 'A wavy (sinusoidal) line between two end connections, sometimes with "FH" or the hose type noted; drilling rotary hoses and loading hoses are drawn the same way.',
      tags: ['HOSE'],
      notes: 'Wavy line = flexible hose; a zig-zag outline = bellows expansion-joint. Some legends tag hoses FH, which clashes with fire hydrants.',
      datasheet: { form: 'Hose assembly datasheet (ISO 10380 / EN 14585-1; API 16C rotary)', fields: { 'Hose type': 'kind', 'Nominal size': 'nps', 'End rating': 'rating', 'Assembly length': 'length', 'Minimum bend radius': 'bendRadius' } },
    },
  },
  'hammer-union': {
    svg: svg('0 0 160 80', P('M4 40h62M94 40h62') + P('M66 22v36M94 22v36') + P('M80 26v28', 'stroke-width="4"') + P('M70 22l10-14 10 14M70 58l10 14 10-14', THIN)),
    e: {
      standard: ISO + ' (union) / well-testing temporary flowline convention',
      drawn: 'A union symbol (two short bars with a third bar between them) in the line, with the figure number (e.g. Fig 1502) noted; well-test and frac schematics show one at every temporary flowline joint.',
      tags: ['UN'],
      notes: 'A flanged joint has two bars only. Figure numbers are not interchangeable (1502 vs 602 vs 2002 pressure ratings), so read the note.',
      datasheet: { form: 'Temporary flowline equipment list (union figure number, API 6A service)', fields: { 'Nominal size': 'nps', 'Figure number': 'figure' } },
    },
  },
  'insulating-joint': {
    svg: svg('0 0 160 80', P('M4 40h62M94 40h62') + P('M66 16v48M94 16v48', 'stroke-width="4"') + P('M70 28l6 6-6 6 6 6-6 6M90 28l-6 6 6 6-6 6 6 6', THIN) + T(80, 78, 'IJ', 11)),
    e: {
      standard: ISO + ' / pipeline cathodic protection convention',
      drawn: 'Two heavy bars across the line with a gap and a zig-zag or hatch between them, labelled IJ or IK (insulating kit), at the boundary between a cathodically protected pipeline and topsides or plant piping.',
      tags: ['IJ', 'IK'],
      notes: 'Found where a pipeline or riser meets the plant. Plain double bars are an ordinary flanged joint; a monolithic IJ is a weld-in item, an insulating gasket kit is a flange pair with an IK note.',
      datasheet: { form: 'Insulating joint datasheet (ISO 15589-1, NACE SP0286)', fields: { Variant: 'variant', 'Nominal size': 'nps', 'Pressure class': 'rating', 'Pipe schedule': 'schedule', ...tagF } },
    },
  },
  'rupture-disc': {
    svg: svg('0 0 100 130', P('M50 126V76M50 54V4') + P('M28 76h44M28 54h44') + P('M32 70q18-20 36 0')),
    e: {
      standard: ISO + ' / ISA 5.1 (PSE)',
      drawn: 'A curved disc (arc) between two flange bars across the relief line, usually vertical with the inlet below, tagged PSE with the burst pressure; often fitted under a PSV with a pressure gauge or switch between them.',
      tags: ['RD', 'BD'],
      isa: ['PSE', 'PI', 'PSH'],
      notes: 'An arc between flange bars with no spring = rupture disc; a spring zig-zag = PSV. A disc under a PSV forms a combination device; the PI / PSH in the space between detects a leak or burst.',
      datasheet: { form: 'Rupture disc datasheet (ISO 4126-2 / API 520 Part I)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', 'Burst pressure': 'burst', 'Holder with flanges': 'flanges', 'Burst indicator': 'indicator', ...tagF } },
    },
  },
  'restriction-orifice': {
    svg: svg('0 0 140 90', P('M4 50h132') + P('M52 28v44M88 28v44') + P('M70 24v20M70 56v20', 'stroke-width="6"') + T(70, 16, 'RO', 12)),
    e: {
      standard: ISO + ' / ISA 5.1 (RO / FO)',
      drawn: 'A plate across the line (one bar, or a bar with the bore gap at the centre) between two flange bars, tagged RO or FO with the bore size, and no transmitter or taps; multi-stage ROs show several plates in a row.',
      tags: ['RO'],
      isa: ['FO', 'RO'],
      notes: 'With two taps to an FT bubble it is an orifice-flowmeter; without taps it is a restriction orifice. Common downstream of a BDV, in minimum-flow bypasses and on purge lines.',
      datasheet: { form: 'Restriction orifice datasheet (ASME MFC-14M / ISO 5167-2 plate geometry)', fields: { 'Line size': 'nps', 'Flange rating': 'rating', 'Number of stages': 'stages', 'Bore ratio (d/D)': 'beta', 'Supplied with flanges': 'flanges', ...tagF } },
    },
  },
  'steam-trap': {
    svg: svg('0 0 140 80', P('M4 40h46M90 40h46') + R(50, 20, 40, 40) + T(70, 47, 'T', 18)),
    e: {
      standard: ISO,
      drawn: 'A small square (or circle) in the condensate line marked T or ST, often preceded by a strainer and followed by a check valve and a test valve, at the low point of a steam line.',
      tags: ['ST'],
      notes: 'Box with T on a steam or condensate line = steam trap. Some legends tag traps TR, which clashes with transformer tags.',
      datasheet: { form: 'Steam trap datasheet (ISO 6704 / ISO 6554)', fields: { 'Trap type': 'kind', 'Nominal size': 'nps', 'End connection': 'ends', 'Pressure class': 'rating', 'Integral strainer': 'strainer', 'Test valve': 'testValve', ...tagF } },
    },
  },
  'drain-hub': {
    svg: svg('0 0 120 120', P('M20 20h80L68 64H52z') + P('M60 64v52') + P('M6 40h108', DASH + ' ' + THIN)),
    e: {
      standard: ISO + ' (funnel / tundish)',
      drawn: 'A funnel (V or trapezoid) open at the top with the drain pipe leaving the bottom to the open-drain (OD) header; drawn below the vents and drains of equipment that discharge into it.',
      tags: ['DH', 'TD'],
      notes: 'A funnel feeding an OD line = open drain hub or tundish. Closed drains (CD) are piped directly with no funnel.',
      datasheet: { form: 'Open drain item schedule (ISO 13702 / API RP 14C drain systems)', fields: { Type: 'kind', 'Outlet size': 'nps', Height: 'height', 'Bowl depth': 'depth', Cover: 'cover' } },
    },
  },
  'fire-blanket': {
    svg: svg('0 0 120 120', R(24, 14, 72, 86) + T(60, 64, 'FB', 18) + P('M40 100v14M80 100v14', 'stroke-width="5"')),
    e: {
      standard: 'Safety equipment layout convention; ISO 7010 sign',
      drawn: 'Safety equipment layouts: a small rectangle marked FB (fire blanket) on the wall of galleys, workshops and laboratories, sometimes with the pull tabs drawn below.',
      tags: ['FB'],
      notes: 'Only on safety equipment plans. FE marks an extinguisher; HR a hose reel.',
      datasheet: { form: 'Safety equipment schedule (EN 1869)', fields: { Size: 'size', Mounting: 'mount', 'Mounting height': 'height', 'ISO 7010 sign': 'sign', ...tagF } },
    },
  },
}
