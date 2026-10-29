import { svg, T, P, C, R, FILL, WHITE, THIN, DASH } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001 (piping)'
const ISOM = 'ISO 6412 / isometric convention (fittings are not shown individually on P&IDs)'
export default {
  'pipe-spool': {
    svg: svg('0 0 180 60', P('M4 30h172') + P('M20 18v24M26 18v24M154 18v24M160 18v24')),
    e: {
      standard: ISO,
      drawn: 'A solid line labelled with its line number (size-service-number-class-insulation, e.g. 8"-PG-2101-D6A-N); flanged joints appear as short double bars across the line. Insulation is marked by the H / IH suffix or a dashed outline along the line.',
      notes: 'Process lines are thick solid; utility and minor lines thinner; instrument signal lines are dashed (electrical) or with hash marks (pneumatic). Each line number between two nozzles becomes one spool run.',
      datasheet: { form: 'Line list / piping class (ASME B31.3, B36.10)', fields: { 'Nominal size': 'nps', 'Wall schedule': 'schedule', 'Flange rating (from class)': 'rating', 'End connection': 'ends', Insulation: 'insulated', 'Service code': 'service' } },
    },
  },
  elbow: {
    svg: svg('0 0 110 110', P('M4 90h46a40 40 0 0 0 40-40V4')),
    e: {
      standard: ISOM,
      drawn: 'On P&IDs a change of direction is just a corner in the line; elbows are only drawn on isometrics and GA drawings, as a bend or a corner with a short tick at each weld.',
      notes: 'Take the angle and radius (LR / SR) from the isometric or the piping class, not the P&ID. Treat a P&ID corner as an elbow only when building a 3D route.',
      datasheet: { form: 'Piping class / isometric bill of materials (ASME B16.9)', fields: { 'Nominal size': 'nps', 'Wall schedule': 'schedule', 'Angle': 'angle', 'Radius (LR / SR)': 'radius', 'End connection': 'ends', 'Flange rating': 'rating', 'Service code': 'service' } },
    },
  },
  tee: {
    svg: svg('0 0 140 90', P('M4 70h132M70 70V6') + C(70, 70, 6, FILL)),
    e: {
      standard: ISO,
      drawn: 'A branch line meeting a run line; a dot at the junction confirms a connection (lines crossing without a dot or with a gap / hop are not connected).',
      notes: 'Reducing tees are shown by the different line sizes of run and branch. Crossing lines without a dot are not a tee. On isometrics the tee is drawn with weld ticks.',
      datasheet: { form: 'Piping class / isometric bill of materials (ASME B16.9)', fields: { 'Run size': 'nps', 'Branch size': 'branchNps', 'Wall schedule': 'schedule', 'End connection': 'ends', 'Flange rating': 'rating', 'Service code': 'service' } },
    },
  },
  reducer: {
    svg: svg('0 0 140 70', P('M4 35h40M96 35h40') + P('M44 15v40l52-12V27z')),
    e: {
      standard: ISO,
      drawn: 'A trapezoid in the line, the large end facing the larger pipe, with the two sizes written beside it (e.g. 8"×6"). Eccentric reducers have one flat side, noted FOT (flat on top) or FOB (flat on bottom).',
      notes: 'A size change at a valve or pump nozzle is often shown only by the size note. Eccentric FOT reducers sit on pump suctions.',
      datasheet: { form: 'Piping class / isometric bill of materials (ASME B16.9)', fields: { 'Large end size': 'nps', 'Small end size': 'smallNps', 'Wall schedule': 'schedule', 'Type (concentric / eccentric)': 'kind', 'Flat side': 'flat', 'End connection': 'ends', 'Flange rating': 'rating', 'Service code': 'service' } },
    },
  },
  'flanged-joint': {
    svg: svg('0 0 140 70', P('M4 35h56M80 35h56') + P('M60 12v46M80 12v46')),
    e: {
      standard: ISO,
      drawn: 'Two short parallel bars across the line (a flange pair), sometimes with a gap between them; at a nozzle only one bar is drawn against the equipment.',
      notes: 'Two bars with a filled or open paddle between them, or with a figure-8 drawn beside them on a short stem, is a spectacle blind or spade (not a plain joint); two bars with taps and an FE tag is an orifice flange pair. Spec breaks (class changes) are marked at a flange with the two class codes.',
      datasheet: { form: 'Piping class (ASME B16.5 / B16.47 flanges, B16.20 gaskets)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', 'Wall schedule': 'schedule', ...{ 'Tag number': 'tag' } } },
    },
  },
  'blind-flange': {
    svg: svg('0 0 110 70', P('M4 35h60') + P('M64 12v46') + R(70, 10, 8, 50, FILL)),
    e: {
      standard: ISO,
      drawn: 'A line ending in a flange bar followed by a thicker solid bar (or a filled half-circle cap): a blinded end or spare connection.',
      notes: 'A single solid bar across the line between two flange bars is a spade / blind in the line; a figure-8 is a spectacle blind. A line ending with a plain dome is a pipe cap (welded), not a blind.',
      datasheet: { form: 'Piping class (ASME B16.5 / B16.47)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', 'Wall schedule': 'schedule', 'Tag number': 'tag' } },
    },
  },
  'spectacle-blind': {
    svg: svg('0 0 140 120', P('M4 70h50M86 70h50') + P('M54 50v40M86 50v40') + C(70, 70, 12, FILL) + P('M70 58V34') + C(70, 22, 12)),
    e: {
      standard: ISO,
      drawn: 'A figure-8 drawn across the line between two flange bars: one circle filled (solid blind) and one open (spacer ring). The filled half on the line means the line is blinded (normally closed); the open half on the line means it is open.',
      tags: ['SB', 'SP'],
      notes: 'Note NO / NC (or SO / SC) beside it for the normal position. Many legends draw the figure-8 beside the flange pair on a short stem instead of across the line: the circle next to the stem is the half in the line (open ring = open, blank = closed), and the blank may be hatched or drawn as concentric circles. A single filled paddle is a spade; a single open ring is a spacer.',
      datasheet: { form: 'Piping class / special item datasheet (ASME B16.48)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', 'Normal position (NO / NC)': 'state', 'Include flanges': 'flanges' } },
    },
  },
  'y-strainer': {
    svg: svg('0 0 140 100', P('M4 30h132') + P('M44 30l26 44h16L60 30') + P('M52 32l26 42', DASH + ' ' + THIN) + P('M78 74v18')),
    e: {
      standard: ISO,
      drawn: 'A Y-shaped leg slanting down from the line with a dashed line inside it for the screen, sometimes tagged SP / Y-STR with a blow-down valve on the end of the leg.',
      tags: ['SP', 'Y', 'STR'],
      isa: ['PDI (across)'],
      notes: 'A basket or temporary cone strainer is drawn as a box or cone in the line with a dashed screen. A PDI / PDT across it monitors blockage.',
      datasheet: { form: 'Special piping item datasheet (ASME B16.34)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', 'Screen mesh': 'mesh', 'Blow-down valve': 'blowdown' } },
    },
  },
}
