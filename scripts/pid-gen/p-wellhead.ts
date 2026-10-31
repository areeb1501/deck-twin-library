import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT, bowtie, bowtieV } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const API = 'ISO 10628-2 / PIP PIC001 valves; API 6A / API RP 14C wellhead conventions'
const tagF = { 'Tag number': 'tag' }
const chokeArrow = (cx: number, cy: number, s = 18) => P(`M${cx - s} ${cy + s}L${cx + s} ${cy - s}`) + P(`M${cx + s} ${cy - s}l-9 2 7 7z`, FILL)
export default {
  'christmas-tree': {
    svg: svg('0 0 150 180', R(40, 148, 40, 26) + P('M60 148V22') + bowtieV(60, 126, 12, 9) + bowtieV(60, 98, 12, 9) + P('M51 98H38') + R(18, 90, 20, 16) + P('M60 72h86') + bowtie(88, 72, 12, 9) + bowtie(120, 72, 12, 9) + chokeArrow(120, 72, 14) + bowtieV(60, 46, 12, 9) + R(50, 12, 20, 10)),
    e: {
      standard: API,
      drawn: 'A vertical run of valves above the wellhead: lower master (manual), upper master (SSV, with an actuator box), a cross with the production wing valve (often actuated) and the choke (bow-tie with a diagonal arrow) on the side, and the swab valve and tree cap on top. The SCSSV is shown below the wellhead as a valve with a control-line note.',
      tags: ['XT', 'W', 'WH'],
      isa: ['SSV', 'USV', 'SCSSV', 'XV (wing)', 'PT', 'TT'],
      notes: 'A single vertical valve stack with a side wing and choke is a tree; a stack of boxes with rams is a BOP; a stack of spools with only annulus outlets is the wellhead housing. Injector trees have the wing on the injection line with the flow arrow into the well.',
      datasheet: { form: 'Wellhead and christmas tree datasheet (API 6A: PSL, PR, temperature and material class)', fields: { 'Rated working pressure': 'pressureRating', 'Tree bore': 'bore', 'Well type': 'wellType', 'Flowline size': 'flowlineNps', 'Flowline flange rating': 'flowlineRating', ...tagF } },
    },
  },
  'choke-valve': {
    svg: svg('0 0 120 130', P('M4 74h26M60 104v22') + P('M30 58v32l30-16zM44 104h32L60 74z') + chokeArrow(60, 74, 24) + P('M60 74V30M48 30h24')),
    e: {
      standard: API + ' (adjustable choke: valve body with a diagonal arrow)',
      drawn: 'An angle-body valve (side inlet, bottom outlet) or an in-line bow-tie with a diagonal arrow through it meaning adjustable restriction; a fixed (positive) choke has no arrow and a bean size note. Tagged HCV, PCV, FCV or CK.',
      tags: ['CK', 'HCV', 'FCV', 'PCV'],
      isa: ['HCV', 'HV', 'FV', 'PV'],
      notes: 'The diagonal arrow = variable choke. An angle body with a spring is a PSV, not a choke. A globe control valve with a dome actuator can also do choking duty; then it maps to the control-valve component.',
      datasheet: { form: 'Choke valve datasheet (API 6A)', fields: { 'Inlet bore': 'bore', 'Outlet bore': 'outletBore', 'Rated working pressure': 'pressureRating', Operator: 'operator', ...tagF } },
    },
  },
  'production-manifold': {
    svg: svg('0 0 190 140', P('M10 24h170M10 54h170') + P('M174 18l8 6-8 6M174 48l8 6-8 6', THIN) + [40, 95, 150].map((x) => P(`M${x - 12} 24v56h24V54`) + bowtieV(x - 12, 67, 8, 6) + bowtieV(x + 12, 67, 8, 6) + P(`M${x} 80v54`) + P(`M${x - 7} 114l7-12 7 12z`) + P(`M${x - 8} 100h16`)).join('') + [28, 83, 138].map((x) => C(x, 24, 3, FILL)).join('') + [52, 107, 162].map((x) => C(x, 54, 3, FILL)).join('')),
    e: {
      standard: API,
      drawn: 'Two (or three) parallel headers, production and test, with each well flowline arriving through a check valve and branching to every header through its own valve, so one well can be routed to test while the rest go to production.',
      tags: ['M', 'MF'],
      notes: 'The repeating slot pattern (one inlet, one valve per header) identifies it. A single header with branches is a plain header pipe. Test header size is usually smaller; HP / LP headers may both be present.',
      datasheet: { form: 'Manifold datasheet (ASME B31.3, API 6D valves)', fields: { 'Number of well slots': 'slots', 'Slot pitch': 'pitch', 'Production header size': 'productionNps', 'Test header size': 'testNps', 'Inlet size': 'inletNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'pig-launcher': {
    svg: svg('0 0 200 100', P('M24 24v52', 'stroke-width="7"') + R(30, 30, 80, 40) + P('M110 30l20 10v20l-20 10') + P('M130 50h66') + bowtie(160, 50, 14, 10) + P('M44 42h22a8 8 0 0 1 0 16H44z') + P('M90 30V10h94v40') + bowtie(140, 10, 10, 7) + P('M70 80h30M92 74l8 6-8 6', THIN)),
    e: {
      standard: ISO + ' / API 6D pig trap convention',
      drawn: 'An oversized barrel with a quick-opening closure (thick bar) at one end, a reducer to the pipeline size, the trap (isolation) valve on the pipeline, and a kicker (or bypass) line from the barrel around the trap valve; a pig signaller (XI / ZS) on the line. Receivers are drawn the same way, mirrored.',
      tags: ['L', 'PL', 'R', 'SCR'],
      isa: ['XI', 'ZS', 'PI'],
      notes: 'The closure, reducer and kicker line together identify it unambiguously. A plain horizontal capsule is a vessel. Launcher or receiver is decided by flow direction.',
      datasheet: { form: 'Pig trap datasheet (ASME VIII-1 / ASME B31.4 / B31.8)', fields: { Service: 'service', 'Pipeline size': 'nps', 'Flange rating': 'rating', 'Barrel length': 'length', 'Centreline elevation': 'elevation', 'Kicker size': 'kickerNps', ...tagF } },
    },
  },
  'bop-stack': {
    svg: svg('0 0 140 180', P('M44 10h52l12 34H32z') + R(28, 48, 84, 24) + R(28, 76, 84, 24) + P('M14 60h14M112 60h14M14 88h14M112 88h14') + R(46, 104, 48, 22) + P('M94 115h40M46 115H6') + bowtie(112, 115, 8, 6) + bowtie(26, 115, 8, 6) + R(28, 130, 84, 24) + P('M14 142h14M112 142h14') + P('M70 154v22M58 176h24')),
    e: {
      standard: API + '; API 16A / API 53 BOP schematic',
      drawn: 'A vertical stack of boxes: the annular preventer on top (tapered or rounded), ram preventers (rectangles with rams drawn from both sides, labelled pipe / blind / shear), and a drilling spool with the choke and kill lines and their valves leaving each side.',
      tags: ['BOP'],
      notes: 'Rams drawn as boxes with side rams distinguish a BOP from a christmas tree (bow-tie valves). Only on drilling or well-control schematics, not process P&IDs.',
      datasheet: { form: 'BOP stack datasheet (API 16A / API 53)', fields: { 'Bore': 'bore', 'Rated working pressure': 'pressureRating', 'Handling frame': 'handlingFrame', ...tagF } },
    },
  },
  riser: {
    svg: svg('0 0 120 180', P('M4 20h56v28') + bowtieV(60, 48, 12, 9) + P('M51 48H40') + R(22, 40, 18, 16) + P('M60 60v14M60 80v86') + P('M48 74h24M48 80h24') + P('M10 96h100', 'stroke-width="4"') + P('M10 130c6-5 12 5 18 0s12 5 18 0M74 130c6-5 12 5 18 0s12 5 18 0', THIN) + P('M52 160l8 14 8-14', FILL)),
    e: {
      standard: ISO + ' / pipeline P&ID convention',
      drawn: 'The topsides line turning down through the deck to sea level and below, with the riser ESDV (actuated valve with an S box) above the deck, an insulating joint (two close bars with a gap) and an off-page note "to / from subsea pipeline"; the sea level is often drawn as a wave line.',
      tags: ['RISER', 'R', 'SSIV'],
      isa: ['ESDV', 'PT', 'TT'],
      notes: 'An open-ended pipe hanging into the sea (pump or sump) is a caisson. Pipeline pig traps sit just upstream on the topsides.',
      datasheet: { form: 'Riser design basis / line list (API RP 2RD, ISO 13623)', fields: { 'Riser size': 'nps', 'Flange rating': 'rating', 'Length below deck': 'length', 'Air gap': 'airGap', 'Topsides ESDV': 'esdv', 'Insulating joint': 'insulatingJoint', ...tagF } },
    },
  },
  'wellhead-control-panel': {
    svg: svg('0 0 180 110', R(10, 14, 90, 82) + T(55, 61, 'WHCP', 16) + [32, 55, 78].map((y) => P(`M100 ${y}h76`) + `<text x="120" y="${y - 3}" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="#111" stroke="none">L</text><text x="150" y="${y - 3}" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="bold" text-anchor="middle" fill="#111" stroke="none">L</text>`).join('')),
    e: {
      standard: 'ISA 5.1 (panel; hydraulic signal lines marked L) / API RP 14C',
      drawn: 'A rectangle (local panel) labelled WHCP with hydraulic signal lines (marked with L) running to each well\'s SCSSV, SSV and wing valve actuators, and an ESD / fusible-loop input.',
      tags: ['X', 'WHCP', 'HPU'],
      notes: 'One hydraulic line per actuator per well. A box with only one hydraulic supply line is an HPU (hydraulic power unit), not the WHCP.',
      datasheet: { form: 'Wellhead control panel datasheet (API RP 14C / ISO 10418)', fields: { 'Number of wells': 'wells', 'Number of accumulators': 'accumulators', ...tagF } },
    },
  },
  'drilling-derrick': {
    svg: svg('0 0 160 170', P('M30 126L66 14h28l36 112') + R(64, 6, 32, 8) + P('M48 70h64M30 126h100') + P('M66 14l46 56M94 14L48 70M48 70l82 56M112 70L30 126', THIN) + R(22, 126, 116, 36)),
    e: {
      standard: 'Layout plan / elevation convention; API 4F',
      drawn: 'Elevation: a tall tapering lattice tower on a box substructure with the drill floor line between them and the crown block on top; in plan, the rig footprint rectangle with the well centre(s) marked as circles and slot numbers.',
      tags: ['DR', 'RIG'],
      notes: 'Never on process P&IDs except as a tie-in box (mud, cement, utilities). The BOP and wellhead below the floor are separate items.',
      datasheet: { form: 'Drilling structure datasheet (API 4F)', fields: { 'Derrick height': 'height', 'Drill floor size': 'floorSize', 'Drill floor height': 'floorHeight', ...tagF } },
    },
  },
  'wellhead-housing': {
    svg: svg('0 0 150 180', R(42, 22, 66, 8) + R(48, 30, 54, 36) + R(48, 66, 54, 36) + R(40, 102, 70, 40) + P('M48 84H20M102 84h28M40 122H12M110 122h28') + bowtie(30, 84, 8, 6) + bowtie(120, 84, 8, 6) + bowtie(24, 122, 8, 6) + bowtie(126, 122, 8, 6) + P('M60 142v34M90 142v34')),
    e: {
      standard: API,
      drawn: 'A stack of rectangles (casing head at the bottom, casing and tubing head spools above) on the conductor, each with side annulus outlets carrying gate valves and gauges; a blind flange or tree adapter on top.',
      tags: ['WH', 'W'],
      isa: ['PI (annulus)', 'PT (annulus)'],
      notes: 'Only annulus side outlets and no wing / choke means a wellhead without a tree (suspended well, or below a BOP). With a valve stack and choke on top it is a christmas-tree.',
      datasheet: { form: 'Wellhead datasheet (API 6A)', fields: { 'Rated working pressure': 'pressureRating', 'Top connection': 'top', ...tagF } },
    },
  },
}
