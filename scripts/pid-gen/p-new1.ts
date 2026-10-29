import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT, bowtie, bowtieV, bubble } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const PKG = 'ISO 10628-2 / PIP PIC001 (package boundary with contents)'
const LAY = 'Layout plan convention (architectural / control room layout, ISO 11064)'
const tagF = { 'Tag number': 'tag' }
const box = (w: number, h: number) => R(4, 4, w - 8, h - 8, DASHDOT + ' stroke-width="2"')
const motor = (cx: number, cy: number, r = 16) => C(cx, cy, r) + T(cx, cy + 6, 'M', 15)
const chokeArrow = (cx: number, cy: number, s = 12) => P(`M${cx - s} ${cy + s}L${cx + s} ${cy - s}`) + P(`M${cx + s} ${cy - s}l-8 2 6 6z`, FILL)
const wave = (x0: number, y: number, n: number, w = 20) => P(`M${x0} ${y}` + Array.from({ length: n }, () => `c${w / 4}-5 ${w / 4 * 3}-5 ${w} 0`).join(''), THIN)
export default {
  'mud-pump': {
    svg: svg('0 0 150 120', C(56, 66, 26) + P('M56 92v24M56 40V24h40') + P('M44 52v28', 'stroke-width="5"') + P('M44 66h46') + C(104, 66, 12) + P('M104 66l8-8') + P('M96 24h50') + P('M106 24v-6a10 10 0 0 1 20 0v6')),
    e: {
      standard: ISO + ' (reciprocating pump) / API 7K mud system',
      drawn: 'Reciprocating pump symbol (circle with a piston and crank) on the mud system flow sheet, with a pulsation dampener (small dome) on the discharge going to the standpipe manifold and suction from the mud tanks; usually two or three pumps in parallel.',
      tags: ['MP', 'P'],
      notes: 'The dampener dome and the mud / standpipe service distinguish it from a process plunger pump (reciprocating-pump). Only on drilling flow sheets.',
      datasheet: { form: 'Mud pump datasheet (API 7K)', fields: { 'Number of cylinders': 'cylinders', 'Input power': 'kw', 'Drive type': 'drive', 'Suction size': 'suctionNps', 'Discharge size': 'dischargeNps', ...tagF } },
    },
  },
  'choke-manifold': {
    svg: svg('0 0 200 120', P('M4 60h96') + bowtie(28, 60, 10, 8) + bowtie(60, 60, 10, 8) + P('M90 24v72') + C(90, 60, 4, FILL) + P('M90 24h96M90 96h96M186 24v72M186 60h10') + bowtie(116, 24, 10, 8) + bowtie(150, 24, 10, 8) + chokeArrow(150, 24) + bowtie(116, 96, 10, 8) + bowtie(150, 96, 10, 8) + chokeArrow(150, 96)),
    e: {
      standard: 'API 16C / API RP 53 well-control schematic, ISO 10628-2 valves',
      drawn: 'From the BOP choke line: two gate valves into a cross or header, then parallel branches each with a gate valve and a choke (bow-tie with a diagonal arrow), rejoining to the mud-gas separator or flare; a straight-through bleed line in the middle on many manifolds.',
      tags: ['CM', 'CKM'],
      isa: ['HCV', 'PV', 'PI', 'PT'],
      notes: 'Production chokes on a tree are single valves; a choke manifold has several parallel choke branches with block valves. Only on well-control schematics.',
      datasheet: { form: 'Choke and kill manifold datasheet (API 16C)', fields: { 'Rated working pressure': 'psi', Bore: 'bore', 'Remote (hydraulic) chokes': 'remoteChokes', 'Manual chokes': 'manualChokes', ...tagF } },
    },
  },
  'shale-shaker': {
    svg: svg('0 0 180 110', R(20, 30, 140, 50) + P('M20 44l140 20', DASH) + P('M4 40h16') + P('M160 64l16 10v30') + P('M60 80v26M100 80v26') + C(90, 18, 10) + P('M84 12l12 12M96 12L84 24', 'stroke-width="2"')),
    e: {
      standard: 'Drilling mud system flow sheet convention (API RP 13C)',
      drawn: 'A box with a sloping dashed screen deck: returns from the flowline enter one end, cuttings leave off the low end of the screen, and the cleaned mud drops through to the tank below; vibrator motors drawn on the basket.',
      tags: ['SS', 'X'],
      notes: 'Dashed sloping screen = shaker. Desanders and desilters on the mud system are cyclones (cones); a degasser is a vessel.',
      datasheet: { form: 'Shale shaker datasheet (API RP 13C screens)', fields: { 'Screen panels': 'panels', Decks: 'decks', 'Deck angle': 'deckAngle', 'Feed size': 'feedNps', ...tagF } },
    },
  },
  'control-console': {
    svg: svg('0 0 200 120', P('M14 40l60-26h52l60 26-20 24-44-16H78L34 64z') + P('M30 40l46-18M84 22h32M124 22l46 18', 'stroke-width="4"') + C(54, 86, 12) + C(100, 80, 12) + C(146, 86, 12)),
    e: {
      standard: LAY,
      drawn: 'Plan view: a run of desk segments (straight, angled or curved) with the monitor line along the back edge and operator chairs as circles in front, laid out facing the video wall.',
      tags: ['CON', 'OWS'],
      notes: 'Only on control room layouts. A straight table with a chair is a desk; a grid of tiles on a wall is the video wall.',
      datasheet: { form: 'Control room layout / console specification (ISO 11064-3 / -4)', fields: { Segments: 'segments', Layout: 'layout', 'Segment angle': 'angle', 'Segment width': 'segmentWidth', Depth: 'depth', 'Sit-stand': 'sitStand', 'Desk height': 'deskHeight', 'Monitors per segment': 'monitorsPerSegment', 'Monitor rows': 'rows', 'Monitor size': 'monitorSize', ...tagF } },
    },
  },
  'video-wall': {
    svg: svg('0 0 190 110', [0, 1, 2, 3].flatMap((c) => [0, 1].map((r) => R(10 + c * 43, 10 + r * 34, 41, 32))).join('') + P('M10 84h172v18H10z') + P('M20 102v6M172 102v6')),
    e: {
      standard: LAY,
      drawn: 'Elevation: a grid of display tiles (rows × columns) on a frame with a base cabinet; in plan, a long thin rectangle along the CCR wall with the viewing distance to the consoles dimensioned.',
      tags: ['VW'],
      notes: 'Only on control room drawings.',
      datasheet: { form: 'Large-screen display specification (ISO 11064-4)', fields: { Rows: 'rows', Columns: 'cols', 'Tile diagonal': 'diagonal', 'Bezel width': 'bezel', Technology: 'technology', Mounting: 'mount', 'Bottom edge height': 'elevation', 'Video wall controller': 'controller', ...tagF } },
    },
  },
  door: {
    svg: svg('0 0 160 110', P('M4 90h40M116 90h40M4 100h40M116 100h40') + P('M44 90v10M116 90v10') + P('M44 90V18') + P('M44 18a72 72 0 0 1 72 72', THIN)),
    e: {
      standard: 'Architectural plan convention (door swing); IMO FTP Code fire ratings',
      drawn: 'Plan view: a gap in the wall with the door leaf drawn as a line at 90° and a quarter-circle arc for the swing; double doors have two leaves and arcs, sliding doors a leaf parallel to the wall. The fire rating (A60, H120) is noted on the door schedule.',
      tags: ['D', 'DR'],
      notes: 'Arc = hinged door; the hinge side is the arc centre. Blast doors are drawn thicker; roller shutters as a dashed line across the opening.',
      datasheet: { form: 'Door schedule (IMO FTP Code A60 / H120, EN 1125 / EN 1154 hardware)', fields: { Type: 'kind', 'Fire rating': 'fireRating', 'Clear width': 'width', 'Clear height': 'height', Handing: 'hand', Hardware: 'hardware', 'Vision panel': 'visionPanel', ...tagF } },
    },
  },
  window: {
    svg: svg('0 0 160 60', P('M4 20h40M116 20h40M4 40h40M116 40h40') + P('M44 20v20M116 20v20') + P('M44 26h72M44 34h72', THIN) + P('M44 30h72')),
    e: {
      standard: 'Architectural plan convention (window in wall); IMO FTP Code fire ratings',
      drawn: 'Plan view: the wall is interrupted and parallel thin lines across the opening show the glazing; sill height and fire / blast rating are on the window schedule.',
      tags: ['W', 'WN'],
      notes: 'A gap with an arc is a door; a gap with thin parallel lines is a window.',
      datasheet: { form: 'Window schedule (IMO FTP Code A60 / H120, ISO 3903)', fields: { Type: 'kind', 'Fire rating': 'fireRating', Width: 'width', Height: 'height', 'Sill height': 'sill', Panes: 'panes', Sunshade: 'sunshade', ...tagF } },
    },
  },
  room: {
    svg: svg('0 0 180 120', P('M74 114H6V6h168v108H96') + P('M74 106H14V14h152v92H96') + P('M74 106v8M96 106v8') + P('M74 106V84', THIN) + P('M74 84a22 22 0 0 1 22 22', THIN) + T(90, 62, 'CCR', 14)),
    e: {
      standard: LAY,
      drawn: 'Plan view: double-line walls enclosing the room with door and window openings and the room name and number written inside; raised floors noted RAF with the floor height.',
      tags: ['RM'],
      notes: 'Rooms are background for consoles, cabinets and furniture. A single building rectangle on a plot plan is an e-house or module.',
      datasheet: { form: 'Room data sheet (ISO 11064-3; EN 12825 raised floor)', fields: { Width: 'width', Depth: 'depth', 'Ceiling height': 'height', 'Wall thickness': 'wallThickness', 'Raised floor': 'raisedFloor', 'Raised floor height': 'floorHeight', Ceiling: 'ceiling', 'Cable tray': 'cableTray', 'Fire rating': 'fireRating', 'Room name': 'label', ...tagF } },
    },
  },
  'system-cabinet': {
    svg: svg('0 0 180 100', [0, 1, 2, 3].map((i) => R(10 + i * 40, 14, 40, 40)).join('') + [0, 1, 2, 3].map((i) => P(`M${10 + i * 40} 54a40 40 0 0 0 40 40`, THIN) + P(`M${10 + i * 40} 54v40`, THIN)).join('')),
    e: {
      standard: LAY + ' / equipment room layout',
      drawn: 'Plan view: a row of squares (cabinets) against a wall or back to back, with door swing arcs on the front and the system (DCS, SIS, F&G, marshalling) written on each; front and rear access clearances dashed.',
      tags: ['CAB', 'MC', 'SC'],
      notes: 'Only on equipment-room layouts. Switchgear line-ups look similar but are deeper and labelled with feeders.',
      datasheet: { form: 'Cabinet layout / system cabinet specification (IEC 61439, IEC 60297)', fields: { 'Number of cabinets': 'count', System: 'system', Width: 'width', Depth: 'depth', Height: 'height', 'Front door': 'door', 'Rear doors': 'rearDoors', 'Cable entry': 'cableEntry', ...tagF } },
    },
  },
  'operator-chair': {
    svg: svg('0 0 110 110', R(28, 34, 54, 50, 'rx="12"') + P('M24 34a31 18 0 0 1 62 0', 'stroke-width="5"') + P('M22 50v26M88 50v26')),
    e: {
      standard: LAY + ' (furniture)',
      drawn: 'Plan view: a rounded seat square with a curved backrest and armrests, placed at a console or desk; often just a circle.',
      notes: 'Furniture appears only on control room and office layouts.',
      datasheet: { form: 'Furniture schedule (EN 1335, BS 5459-2 24-hour use)', fields: { 'Seat height': 'seatHeight', Headrest: 'headrest', Armrests: 'arms' } },
    },
  },
  desk: {
    svg: svg('0 0 170 110', R(10, 10, 150, 56) + P('M30 20h40M90 20h40', 'stroke-width="4"') + C(85, 86, 14)),
    e: {
      standard: LAY + ' (furniture)',
      drawn: 'Plan view: a rectangle (desk or table) with monitors drawn as thick lines along the back edge and chairs as circles or seat shapes around it.',
      tags: ['DSK'],
      notes: 'A curved or angled run of desks with many monitors is a control-console.',
      datasheet: { form: 'Furniture schedule (EN 527-1)', fields: { Layout: 'layout', Width: 'width', Depth: 'depth', Monitors: 'monitors', Seats: 'seats', ...tagF } },
    },
  },
  'marine-loading-arm': {
    svg: svg('0 0 180 150', P('M30 146V98') + C(30, 90, 8) + P('M34 83L86 26') + C(92, 20, 8) + P('M98 26l52 70') + C(154, 102, 7) + P('M154 109v14M146 126h16M146 132h16M154 132v10') + R(4, 92, 18, 22) + P('M22 96l8-6', THIN)),
    e: {
      standard: ISO + ' / OCIMF loading arm convention',
      drawn: 'An articulated line from the jetty riser through swivel joints (small circles) at the base, apex and outboard end, ending in the emergency release coupling (two close bars with valves) and the ship manifold flange; a counterweight box on the inboard arm.',
      tags: ['LA', 'MLA'],
      isa: ['XV (ERS)', 'ZS'],
      notes: 'Swivels plus the ERS mark tell it from a hose. Truck loading arms are smaller and drawn with the truck outline.',
      datasheet: { form: 'Marine loading arm datasheet (OCIMF / EN 1474)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', 'Outreach': 'reach', 'Emergency release system': 'ers', 'Hydraulic operation': 'hydraulic', ...tagF } },
    },
  },
  'truck-loading-bay': {
    svg: svg('0 0 200 120', P('M4 24h22M46 24h14M100 24h14M142 24h20v44') + bowtie(36, 24, 10, 8) + R(60, 12, 40, 24) + T(80, 29, 'PD', 12) + bowtie(128, 24, 14, 9) + P('M128 24V4h12') + P('M110 70h76v28h-76z') + P('M110 76H86v22h24') + C(100, 104, 7) + C(170, 104, 7)),
    e: {
      standard: ISO + ' + ISA 5.1 metering / layout convention for the bay',
      drawn: 'Per bay: block valve, strainer, meter (FE / FQ, often PD), digital set-stop control valve and the loading arm or hose dropping to a road tanker outline; on the plot plan, lanes under a canopy rectangle.',
      tags: ['LB', 'TLB', 'X'],
      isa: ['FQ', 'FQIC', 'FV', 'XV'],
      notes: 'A meter run ending at a tanker outline is the clue. Marine loading uses articulated arms to a ship manifold instead.',
      datasheet: { form: 'Loading bay specification (API RP 1004 / EN 13083, API 2610)', fields: { 'Number of bays': 'bays', Product: 'product', 'Loading method': 'loading', 'Line size': 'nps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'hydraulic-power-unit': {
    svg: svg('0 0 200 130', box(200, 130) + P('M20 70v40h60V70') + P('M24 96h52', DASH + ' ' + THIN) + [100, 140].map((x) => C(x, 70, 14) + P(`M${x - 7} 62l7-10 7 10z`, FILL) + P(`M${x} 84v16h-${x - 50}V96`) + P(`M${x} 56V36`)).join('') + P('M100 36h96') + P('M170 36v12a8 8 0 0 0 0 0') + R(162, 48, 16, 34, 'rx="8"') + P('M162 62h16')),
    e: {
      standard: 'ISO 1219-1 fluid power symbols in a package boundary',
      drawn: 'Dash-dot package boundary with an open reservoir (U-shaped tank), hydraulic pumps (circle with a filled triangle pointing outward on the outlet), filters, accumulators (vertical capsules with a dividing line) and the HP / LP supply headers leaving as hydraulic lines.',
      tags: ['X', 'HPU', 'A'],
      isa: ['PT', 'LSL', 'PSL'],
      notes: 'ISO 1219 symbols (filled triangle in a circle = hydraulic pump; capsule with a line = accumulator) identify a hydraulic system. The WHCP sits downstream with one line per actuator.',
      datasheet: { form: 'Hydraulic power unit datasheet (ISO 4413 / API 6A control systems)', fields: { 'Reservoir volume': 'reservoir', 'Number of pumps': 'pumps', 'Pump motor power': 'kw', Accumulators: 'accumulators', 'Supply connection size': 'supplyNps', 'Supply rating': 'supplyRating', 'Return connection size': 'returnNps', ...tagF } },
    },
  },
  'nitrogen-generator': {
    svg: svg('0 0 220 130', box(220, 130) + P('M0 64h20') + P('M20 64l12-14 12 14-12 14z') + P('M20 64h24', DASH + ' ' + THIN) + P('M44 64h20') + [64, 100].map((x) => R(x, 30, 26, 68) + P(`M${x} 98l26-68`, DASH + ' ' + THIN)).join('') + P('M90 64h10M126 64h22') + P('M148 42a14 10 0 0 1 28 0v44a14 10 0 0 1-28 0z') + P('M176 64h44') + P('M77 30V12M113 30V12', THIN)),
    e: {
      standard: PKG,
      drawn: 'Dash-dot package boundary with air filters (diamond with a dashed line), an air heater, membrane modules (rectangles with a diagonal dashed membrane line, permeate vented to atmosphere) and a nitrogen receiver before the N2 outlet.',
      tags: ['X', 'A', 'NG'],
      isa: ['AT (O2)', 'PT', 'FT'],
      notes: 'Membrane modules with a vent line identify the generator; a nitrogen bottle rack is a gas-cylinder-quad. Often shown on the utilities P&ID as a single package box.',
      datasheet: { form: 'Nitrogen generator package datasheet (ISO 8573-1 feed air; ASME VIII-1 receiver)', fields: { 'Membrane modules': 'modules', 'Receiver diameter': 'receiverDiameter', 'Receiver height': 'receiverHeight', 'Design pressure': 'pressure', 'Air inlet size': 'airNps', 'N2 outlet size': 'n2Nps', ...tagF } },
    },
  },
  'hydrocyclone-package': {
    svg: svg('0 0 210 120', box(210, 120) + P('M30 30h140a12 30 0 0 1 0 60H30z') + [44, 62, 80].map((y) => P(`M34 ${y - 8}v16l130-8z`, THIN)).join('') + P('M0 60h30M60 90v26M182 60h28') + P('M100 30V4', '')),
    e: {
      standard: PKG + '; cyclone convention',
      drawn: 'Horizontal vessel(s) with cyclone liners drawn as long cones (or a single inverted cone, the generic cyclone symbol), produced water in at the inlet header, clean water out, and the oily reject to the reject header controlled by a PDV / PDIC ratio loop.',
      tags: ['X', 'A', 'HC'],
      isa: ['PDV', 'PDIC', 'PDT'],
      notes: 'Cones inside a vessel = hydrocyclones (or a desander if on the well stream with a sand accumulator). Reject-ratio control is the PDIC loop between inlet, outlet and reject.',
      datasheet: { form: 'Hydrocyclone package datasheet (ASME VIII-1)', fields: { 'Number of vessels': 'vessels', 'Vessel diameter': 'vesselDiameter', 'Vessel length': 'vesselLength', 'Design pressure': 'pressure', 'Inlet size': 'inletNps', 'Outlet size': 'outletNps', 'Reject size': 'rejectNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'compact-prover': {
    svg: svg('0 0 200 100', R(40, 34, 120, 32) + P('M90 34v32', 'stroke-width="6"') + P('M4 74h36v-8M196 74h-36v-8') + C(70, 24, 6) + C(130, 24, 6) + P('M70 30v4M130 30v4') + P('M160 50h20', THIN)),
    e: {
      standard: ISO + ' / API MPMS Ch. 4.2 prover convention',
      drawn: 'A horizontal flow tube with a piston (displacer) drawn inside and two detector switches on top marking the calibrated volume, connected by a prover loop with valves to the metering skid; often just a box labelled "prover".',
      tags: ['X', 'PRV', 'A'],
      isa: ['ZS (detector)', 'PT', 'TT'],
      notes: 'Piston in a tube with detector marks = compact prover; a long U-shaped pipe loop with spheres is a conventional ball prover.',
      datasheet: { form: 'Meter prover datasheet (API MPMS Ch. 4.2)', fields: { 'Connection size': 'nps', 'Flange rating': 'rating', 'Flow tube length': 'tubeLength', ...tagF } },
    },
  },
  'water-filter-package': {
    svg: svg('0 0 200 140', box(200, 140) + P('M0 24h190M10 120h190') + [40, 90, 140].map((x) => P(`M${x} 24v14M${x} 104v16`) + P(`M${x - 18} 48a18 10 0 0 1 36 0v46a18 10 0 0 1-36 0z`) + P(`M${x - 18} 62h36M${x - 18} 80h36`, DASH + ' ' + THIN)).join('')),
    e: {
      standard: PKG + ' (filter: vessel crossed by a dashed medium line)',
      drawn: 'Dash-dot package boundary with two to four vertical filter vessels in parallel between inlet and outlet headers, each crossed by dashed lines for the media bed, plus backwash and air-scour headers with butterfly valves.',
      tags: ['X', 'A', 'F'],
      isa: ['PDT', 'PDI', 'FT'],
      notes: 'Parallel identical filter vessels with backwash lines = multimedia filter package. A single cartridge housing is cartridge-filter.',
      datasheet: { form: 'Filter package datasheet (AWWA B100 / ASME VIII-1)', fields: { 'Number of filters': 'filters', 'Filter diameter': 'filterDiameter', 'Filter height': 'filterHeight', 'Design pressure': 'pressure', 'Header size': 'headerNps', 'Branch size': 'branchNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'hypochlorite-generator': {
    svg: svg('0 0 210 120', box(210, 120) + P('M0 80h30') + R(30, 64, 30, 32) + P('M60 80h16') + [76, 104].map((x) => R(x, 60, 24, 40) + P(`M${x + 8} 64v32M${x + 16} 64v32`, THIN)).join('') + P('M100 80h4M128 80h14') + P('M142 40v60h36V40') + P('M160 100v16h46') + R(84, 14, 34, 30) + P('M84 44l34-30') + T(94, 28, '~', 12) + T(110, 40, '=', 12) + P('M101 44v16', DASH + ' ' + THIN)),
    e: {
      standard: PKG + ' + IEC 60617 rectifier',
      drawn: 'Dash-dot package boundary with a seawater strainer, electrolyser cells (boxes with parallel electrode plates) fed from a DC rectifier (square with diagonal, ~ / =), a degassing tank venting hydrogen, and hypochlorite dosing out to the seawater caissons.',
      tags: ['X', 'A', 'CL'],
      isa: ['FT', 'FSL', 'AT (H2)'],
      notes: 'Electrolyser cells plus a rectifier identify it; a chemical-injection-skid has a tank and metering pumps instead.',
      datasheet: { form: 'Electrochlorination package datasheet (IEC 60146 rectifier)', fields: { 'Electrolyser cells': 'cells', 'Degassing tank diameter': 'tankDiameter', 'Degassing tank height': 'tankHeight', 'Seawater inlet size': 'seawaterNps', 'Hypochlorite outlet size': 'hypoNps', ...tagF } },
    },
  },
  'gas-turbine-compressor': {
    svg: svg('0 0 220 90', P('M10 22l30 12v22l-30 12z') + R(42, 38, 12, 14) + P('M56 34l30-12v46l-30-12z') + P('M48 4v34') + P('M86 45h28') + P('M114 12l60 18v30l-60 18z') + P('M124 0v15M164 0v27')),
    e: {
      standard: ISO,
      drawn: 'A gas turbine (narrowing trapezoid, combustor box with the fuel line, widening trapezoid) coupled by its shaft to a compressor trapezoid, wide end at suction; anti-surge recycle and blowdown lines around the compressor.',
      tags: ['K', 'C', 'GT'],
      notes: 'A compressor coupled to a motor circle with M is the motor-driven version (centrifugal-compressor). A turbine coupled to a G circle is a gas-turbine-generator.',
      datasheet: { form: 'API 616 gas turbine + API 617 compressor datasheets', fields: { 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', 'Turbine rated power': 'mw', 'Casing type': 'casing', 'Nozzle orientation': 'nozzles', ...tagF } },
    },
  },
  'progressive-cavity-pump': {
    svg: svg('0 0 170 90', R(20, 30, 90, 30, 'rx="15"') + P('M30 45c8-12 14-12 22 0s14 12 22 0 14-12 22 0', THIN) + P('M30 30V8M4 45h16') + P('M110 45h20') + motor(148, 45)),
    e: {
      standard: ISO,
      drawn: 'Rotary pump outline (a long rounded casing or circle) with a helical rotor drawn as a wavy line inside, suction into the top of the suction housing and discharge out of the end; driver on the shaft.',
      tags: ['P'],
      notes: 'Many legends use the general rotary PD pump symbol with "PC" or "progressive cavity" beside it. Used for viscous, sandy or shear-sensitive liquids (drains, sludge, crude transfer).',
      datasheet: { form: 'API 676 rotary pump datasheet', fields: { 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', 'Driver rated power': 'kw', 'Number of stages': 'stages', ...tagF } },
    },
  },
  'submersible-pump': {
    svg: svg('0 0 120 170', P('M8 34h104') + P('M44 26v138M76 26v138') + P('M38 26h44') + P('M60 26V14h52') + P('M60 34v82') + P('M50 116h20l4 14H46z') + C(60, 146, 12) + T(60, 151, 'M', 12) + P('M68 26v86', DASH + ' ' + THIN) + wave(4, 70, 5, 22)),
    e: {
      standard: ISO + ' (caisson / submersible pump convention)',
      drawn: 'A pump hanging in a caisson below sea level with the motor (circle with M) BELOW the pump bowls at the bottom of the string, the discharge riser going up to the top plate and a power cable alongside.',
      tags: ['P'],
      notes: 'Motor at the bottom = submersible; motor on top of the deck = vertical-turbine-pump (line shaft). Some legends draw only a pump circle in the caisson with "ESP" or "submersible" written.',
      datasheet: { form: 'Submersible pump datasheet (API 610 VS family)', fields: { 'Motor rated power': 'kw', 'Discharge size': 'dischargeNps', 'Flange rating': 'rating', 'Setting depth': 'depth', 'Caisson diameter': 'caissonDiameter', ...tagF } },
    },
  },
  'cooling-tower': {
    svg: svg('0 0 180 150', P('M20 40h140v90H20z') + P('M60 40V24h60v16') + P('M66 14v12l24-6zM114 14v12l-24-6z') + P('M20 70l140 30M20 100l140-30', THIN) + P('M20 64h140', DASH + ' ' + THIN) + P('M4 58h56') + P('M160 122h16') + P('M20 116h140', THIN)),
    e: {
      standard: ISO,
      drawn: 'A box (or tapering hyperbolic outline for natural draft) with a fan stack on top (propeller in a short cylinder), the hot-water distribution near the top, crossed lines for the fill, air inlets low on the sides and the cold-water basin at the bottom.',
      tags: ['CT', 'E'],
      notes: 'The fan on top plus fill and basin tell it from an air-cooled exchanger (tube bundle, no water basin). Onshore only.',
      datasheet: { form: 'Cooling tower datasheet (CTI STD-201 / ATC-105)', fields: { Cells: 'cells', 'Cell size': 'cellSize', 'Fan deck height': 'deckHeight', 'Hot-water inlet height': 'inletHeight', 'Fan motor power': 'kw', 'Inlet size': 'inletNps', 'Outlet size': 'outletNps', ...tagF } },
    },
  },
  'air-receiver': {
    svg: svg('0 0 120 170', P('M30 36a30 20 0 0 1 60 0v90a30 20 0 0 1-60 0z') + P('M4 116h26M90 52h26M60 16V4') + P('M36 140l-6 26M84 140l6 26')),
    e: {
      standard: ISO,
      drawn: 'Plain vertical capsule on legs with no internals, inlet low on one side, outlet high on the other, a PSV on top and an auto-drain at the bottom, on the instrument-air or nitrogen system.',
      tags: ['V', 'D', 'VA'],
      isa: ['PT', 'PI', 'PSV'],
      notes: 'An empty vertical vessel on an IA / UA / N2 line is a receiver; with a mesh pad and liquid outlet it is a vertical-separator.',
      datasheet: { form: 'Pressure vessel datasheet (ASME VIII-1)', fields: { Support: 'support', 'Inside diameter': 'diameter', 'Height T/T': 'height', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', ...tagF } },
    },
  },
  desander: {
    svg: svg('0 0 120 190', R(36, 20, 48, 30) + P('M36 50l18 40h12l18-40') + P('M4 30h32M60 20V4') + P('M60 90v8') + bowtieV(60, 108, 10, 7) + bowtieV(60, 132, 10, 7) + P('M60 142v6') + P('M38 160a22 12 0 0 1 44 0v12a22 12 0 0 1-44 0z')),
    e: {
      standard: ISO + ' (cyclone)',
      drawn: 'A cyclone (short cylinder over an inverted cone) with a tangential inlet on the side and the overflow out of the top, the underflow dropping through two isolation valves into a sand accumulator vessel below that is dumped periodically.',
      tags: ['V', 'DS', 'X'],
      isa: ['PDT', 'LT (sand)', 'XV (dump)'],
      notes: 'A cone over an accumulator on a well stream = desander. Produced-water hydrocyclones are horizontal multi-liner vessels without the accumulator.',
      datasheet: { form: 'Desander datasheet (ASME VIII-1; API 6A-class end connections)', fields: { 'Liner housing diameter': 'diameter', Height: 'height', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Inlet size': 'inletNps', 'Outlet size': 'outletNps', 'Sand dump size': 'sandNps', ...tagF } },
    },
  },
  'bullet-tank': {
    svg: svg('0 0 200 110', P('M40 20h120a30 30 0 0 1 0 60H40a30 30 0 0 1 0-60z') + P('M50 80l-8 24h30l-8-24M150 80l-8 24h30l-8-24') + P('M70 20V4M130 20V4M100 80v26')),
    e: {
      standard: ISO,
      drawn: 'Horizontal capsule with hemispherical or 2:1 heads standing on two saddles, liquid inlet and vapour balance on top and liquid outlet at the bottom; a deluge ring or water-spray line is often drawn around it.',
      tags: ['V', 'T', 'TK'],
      notes: 'A horizontal capsule with no internals or boot in LPG / NGL storage service is a bullet; separators show a weir, boot or mesh pad. Spheres are circles on legs.',
      datasheet: { form: 'Pressure storage datasheet (ASME VIII-1 / API 2510 / NFPA 58)', fields: { 'Head type': 'heads', Diameter: 'diameter', 'Length T/T': 'length', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', 'Vapour nozzle size': 'vapourNps', 'Deluge ring': 'deluge', ...tagF } },
    },
  },
  'slug-catcher': {
    svg: svg('0 0 220 130', P('M4 66h20V20v92') + [20, 56, 92].map((y) => P(`M24 ${y}h20l160 ${12}`)).join('') + [70, 140].map((x) => P(`M${x} 4v${16 + (x - 44) * 12 / 160}`)).join('') + P('M60 4h110') + P('M204 32v94h12')),
    e: {
      standard: ISO + ' (pipeline terminal)',
      drawn: 'An inlet header splitting into several parallel, slightly sloped long pipes (fingers), with gas risers from the top of the fingers to a gas header and the liquid draining to a liquid header at the low end.',
      tags: ['V', 'SC'],
      isa: ['LT', 'PT'],
      notes: 'Parallel sloped fingers between headers identify a finger slug catcher; a vessel-type slug catcher is drawn as a large horizontal separator.',
      datasheet: { form: 'Slug catcher datasheet (ASME B31.8)', fields: { 'Number of fingers': 'fingers', 'Finger size': 'fingerNps', 'Finger length': 'length', Slope: 'slope', 'Flange rating': 'rating', 'Inlet size': 'inletNps', 'Gas outlet size': 'gasNps', 'Liquid outlet size': 'liquidNps', ...tagF } },
    },
  },
}
