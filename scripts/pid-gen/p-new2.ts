import { svg, T, P, C, R, FILL, WHITE, THIN, DASH } from './h.ts'
const FLG = 'ASME B16.5 flange types drawn in half-section (GA / isometric detail convention); on P&IDs every flange is a short bar'
const FG = 'F&G layout convention (NFPA 170 / ISO 7240-style plan symbols; legends vary by company)'
const tagF = { 'Tag number': 'tag' }
const pipe = (x1: number) => P(`M4 44h${x1 - 4}M4 76h${x1 - 4}`) + P(`M4 60h150`, 'stroke-dasharray="14 4 3 4" stroke-width="1.2"')
const flgFields = (extra: Record<string, string> = {}) => ({ 'Nominal size': 'nps', 'Pressure class': 'rating', ...extra, ...tagF })
export default {
  'weld-neck-flange': {
    svg: svg('0 0 160 120', pipe(50) + P('M50 44l36-14V8h16v104H86V90L50 76') + P('M48 40v8M48 72v8', THIN)),
    e: {
      standard: FLG,
      drawn: 'In section: a flange disc with a long tapered hub narrowing to the pipe wall and a butt weld at the hub end. On P&IDs only a short bar across the line; on isometrics a bar with a weld dot.',
      tags: ['WN'],
      notes: 'The flange type comes from the piping class, not the P&ID. The long taper identifies weld-neck; slip-on and socket-weld have short hubs; lap-joint has a loose ring on a stub end.',
      datasheet: { form: 'Piping class / flange bill of materials (ASME B16.5 / B16.47)', fields: flgFields({ Facing: 'facing', 'Bore (schedule)': 'schedule' }) },
    },
  },
  'slip-on-flange': {
    svg: svg('0 0 160 120', pipe(96) + P('M70 34h16V8h16v104H86V86H70z') + P('M64 44l6-6M64 76l6 6', 'stroke-width="2"') + P('M96 44v32', THIN)),
    e: {
      standard: FLG,
      drawn: 'In section: a flange with a short hub slid over the pipe, the pipe end set back from the face, with fillet welds inside the bore and at the hub. On P&IDs a short bar across the line.',
      tags: ['SO'],
      notes: 'Pipe passing into the flange bore with two fillet welds = slip-on. Weld-neck has a long tapered hub and one butt weld.',
      datasheet: { form: 'Piping class / flange bill of materials (ASME B16.5)', fields: flgFields({ Facing: 'facing', 'Pipe schedule': 'schedule' }) },
    },
  },
  'socket-weld-flange': {
    svg: svg('0 0 160 120', pipe(84) + P('M66 38h20V8h16v104H86V82H66z') + P('M84 44v32M84 50h18M84 70h18', THIN) + P('M60 44l6-6M60 76l6 6', 'stroke-width="2"')),
    e: {
      standard: FLG + '; ASME B16.11 socket',
      drawn: 'In section: a small-bore flange with a socket the pipe slides into against a shoulder (small gap at the bottom), and one fillet weld at the hub. On P&IDs a short bar on a small-bore (≤ 2") line.',
      tags: ['SW'],
      notes: 'Socket-weld is small-bore only (NPS ½–3). Threaded flanges show thread hatching in the bore instead of a weld.',
      datasheet: { form: 'Piping class / flange bill of materials (ASME B16.5, B16.11)', fields: flgFields({ Facing: 'facing', 'Pipe schedule': 'schedule' }) },
    },
  },
  'threaded-flange': {
    svg: svg('0 0 160 120', pipe(92) + P('M68 34h18V8h16v104H86V86H68z') + P('M70 44l4-4 4 4 4-4 4 4 4-4 4 4M70 76l4 4 4-4 4 4 4-4 4 4 4-4', 'stroke-width="1.6"')),
    e: {
      standard: FLG + '; ASME B1.20.1 NPT',
      drawn: 'In section: a flange with a short hub and thread marks (zig-zag) in the bore where the pipe screws in, sometimes with a seal weld. On P&IDs a short bar, usually on utility or small-bore lines.',
      tags: ['THD', 'SCRD'],
      notes: 'Zig-zag thread lines in the bore identify it. Most offshore hydrocarbon piping classes do not allow threaded joints; expect it on utility water or air.',
      datasheet: { form: 'Piping class / flange bill of materials (ASME B16.5, B1.20.1)', fields: flgFields({ Facing: 'facing', 'Pipe schedule': 'schedule', 'Seal weld': 'sealWeld' }) },
    },
  },
  'lap-joint-flange': {
    svg: svg('0 0 160 120', pipe(100) + R(100, 26, 6, 68) + R(80, 8, 18, 32) + R(80, 80, 18, 32)),
    e: {
      standard: FLG + '; MSS SP-43 stub end',
      drawn: 'In section: a stub end (pipe with a flared lap at the face) with a loose backing flange sitting behind the lap, not welded to the pipe. On P&IDs a short bar like any flange.',
      tags: ['LJ'],
      notes: 'The loose ring behind a lap identifies it. Used on stainless or alloy lines where the backing flange can be carbon steel, and where bolt holes must be lined up after welding.',
      datasheet: { form: 'Piping class / flange bill of materials (ASME B16.5, MSS SP-43)', fields: flgFields({ 'Stub-end schedule': 'schedule', 'Stub-end pattern': 'pattern', 'Backing flange material': 'backing' }) },
    },
  },
  'swivel-ring-flange': {
    svg: svg('0 0 160 120', pipe(60) + P('M60 44l20-8V22h20v76H80V84L60 76') + R(82, 8, 14, 104, 'stroke-width="2"') + P('M118 30a40 40 0 0 1 0 60', THIN) + P('M118 90l-2-10 8 4z', FILL)),
    e: {
      standard: FLG + '; MSS SP-44 / pipeline convention',
      drawn: 'In section: a weld hub carrying the gasket face with a separate loose ring that can rotate around it to align bolt holes; drawn with a curved arrow on some pipeline tie-in details. On P&IDs a flange bar, often at a riser or spool tie-in.',
      tags: ['SRF'],
      notes: 'Found at subsea and riser tie-ins where bolt-hole alignment is hard. On P&IDs it is indistinguishable from other flanges; read the tie-in detail.',
      datasheet: { form: 'Pipeline flange datasheet (ASME B16.5 drilling, MSS SP-44)', fields: flgFields({ Facing: 'facing', 'Pipe schedule': 'schedule' }) },
    },
  },
  olet: {
    svg: svg('0 0 160 110', P('M4 80h152M4 104h152') + P('M58 80l10-20h24l10 20') + P('M70 60V8M90 60V8') + P('M66 8h28', THIN)),
    e: {
      standard: 'ISO 10628-2 branch connection / MSS SP-97 (isometric detail)',
      drawn: 'On P&IDs a branch is a line meeting another line with a dot (like a tee); on isometrics a branch outlet is a small saddle-shaped boss on the run pipe with the branch rising from it, noted WOL, SOL, TOL, NOL, EOL or LOL.',
      tags: ['WOL', 'SOL', 'TOL', 'NOL', 'EOL', 'LOL'],
      notes: 'P&IDs do not distinguish an olet from a tee: the piping class branch table decides (small branches off large runs are olets). Instrument connections and vents and drains are usually olets.',
      datasheet: { form: 'Piping class branch table / bill of materials (MSS SP-97)', fields: { 'Olet type': 'kind', 'Run size': 'runNps', 'Branch size': 'nps', 'Run schedule': 'runSchedule', 'Branch schedule': 'schedule', 'Pressure class': 'pressureClass', 'Branch end': 'end' } },
    },
  },
  'basket-strainer': {
    svg: svg('0 0 140 120', P('M4 40h40M96 40h40') + P('M44 20h52v66a26 16 0 0 1-52 0z') + P('M52 30v50a18 10 0 0 0 36 0V30', DASH + ' ' + THIN) + P('M40 14h60', 'stroke-width="4"')),
    e: {
      standard: 'ISO 10628-2 / PIP PIC001 (strainer: body with a dashed screen)',
      drawn: 'A pot-shaped body in the line (inlet and outlet near the top) with a dashed U-shaped basket inside and a bolted cover on top; often a PDI / PDT across it.',
      tags: ['SP', 'STR', 'BS'],
      isa: ['PDI', 'PDT'],
      notes: 'A Y-shaped leg is a y-strainer; a cone in the line is a temporary strainer. Twin (duplex) basket strainers are two pots with a changeover valve.',
      datasheet: { form: 'Strainer datasheet (ASME VIII-1 / ASME B31.3)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', 'Screen mesh': 'mesh', 'Cover davit': 'davit', ...tagF } },
    },
  },
  'pipe-support': {
    svg: svg('0 0 120 130', C(60, 36, 24) + R(44, 60, 32, 10) + P('M50 60l10-10 10 10', THIN) + P('M24 78h72M60 78v46M40 124h40') + P('M24 70h72', 'stroke-width="4"')),
    e: {
      standard: 'Piping support convention (isometric / GA support marks); MSS SP-58',
      drawn: 'On isometrics and GAs: a mark at the support point with its type code (shoe, guide G, line stop LS, anchor A, dummy leg DL, trunnion) and number; in section, the pipe resting on a shoe on a steel member or post.',
      tags: ['PS', 'SH', 'G', 'A', 'DL'],
      notes: 'Not on P&IDs. An anchor is often drawn as a cross on the pipe; a guide as two short bars either side; a shoe as a small rectangle under the pipe.',
      datasheet: { form: 'Pipe support schedule (MSS SP-58 / ASME B31.3)', fields: { 'Support type': 'type', 'Pipe size': 'nps', 'Support height': 'height', 'Insulated line': 'insulated' } },
    },
  },
  'sight-glass': {
    svg: svg('0 0 140 80', P('M4 40h40M96 40h40') + P('M44 24v32M96 24v32') + C(70, 40, 18) + P('M62 32l12 16', 'stroke-width="3"') + C(62, 32, 2.5, FILL)),
    e: {
      standard: 'ISO 10628-2 / ISA 5.1 (flow glass, FG)',
      drawn: 'A circle in the line between two flange bars, often with a small flapper or ball drawn inside, tagged FG (flow glass / sight flow indicator).',
      tags: ['FG', 'SG'],
      isa: ['FG'],
      notes: 'A circle in the line tagged FG is a sight glass; an LG on a vessel is a level gauge; a circle with M is a mag meter or motor.',
      datasheet: { form: 'Sight flow indicator datasheet (ASME B16.5 / B31.3)', fields: { 'Nominal size': 'nps', 'Flange rating': 'rating', Indicator: 'indicator' } },
    },
  },
  'toxic-gas-detector': {
    svg: svg('0 0 120 100', C(60, 50, 30) + T(60, 58, 'T', 22) + T(60, 98, 'H2S', 12, 'normal')),
    e: {
      standard: FG + '; ISA 5.1 AT tag',
      drawn: 'F&G layout: a gas-detector symbol (circle, sometimes a triangle) with T, TOX or the gas (H2S, CO, SO2) and the ppm set points written beside it; on C&E charts an AT bubble.',
      tags: ['GDT', 'GD', 'TGD'],
      isa: ['AT', 'AIT', 'GD'],
      notes: 'Same family as point-gas-detector: the gas name decides. Flammable detectors read % LEL; toxic detectors read ppm.',
      datasheet: { form: 'Toxic gas detector datasheet (IEC 60079-29-1 / EN 45544)', fields: { 'Target gas': 'gas', Mounting: 'mount', 'Mounting height': 'height', 'Splash guard': 'splashGuard', ...tagF } },
    },
  },
  'acoustic-gas-leak-detector': {
    svg: svg('0 0 140 100', C(40, 50, 26) + T(40, 58, 'U', 22) + P('M76 34a24 24 0 0 1 0 32M88 24a38 38 0 0 1 0 52M100 14a52 52 0 0 1 0 72', THIN)),
    e: {
      standard: FG + '; ISA TR84.00.07 mapping practice',
      drawn: 'F&G layout: a detector symbol marked U, UGLD or AGLD with its detection radius (a dashed circle, typically 5–20 m) drawn around it; sound-wave arcs on some legends.',
      tags: ['UGLD', 'AGLD', 'GD'],
      notes: 'Large coverage circles centred on a detector are ultrasonic (acoustic); flame detectors show a cone; open-path detectors a beam line.',
      datasheet: { form: 'Ultrasonic gas leak detector datasheet (IEC 60079-1 / -11)', fields: { Mounting: 'mount', 'Mounting height': 'height', 'Array head': 'array', ...tagF } },
    },
  },
  'hydrogen-detector': {
    svg: svg('0 0 120 100', C(60, 50, 30) + T(60, 58, 'G', 22) + T(60, 98, 'H2', 12, 'normal')),
    e: {
      standard: FG,
      drawn: 'F&G or HVAC layout: a gas-detector symbol with H2 written beside it, placed at the ceiling high point of battery rooms, UPS rooms and electrolyser enclosures; on C&E charts an AT bubble with the % LEL set points.',
      tags: ['GDH', 'GD'],
      isa: ['AT', 'GD'],
      notes: 'Hydrogen detectors sit at ceiling level (H2 is lighter than air); hydrocarbon point detectors in process areas are usually lower.',
      datasheet: { form: 'Gas detector datasheet (IEC 60079-29-1; IEC 62485-2 battery rooms)', fields: { Mounting: 'mount', 'Drop rod length': 'drop', 'Mounting height': 'height', 'Sensor type': 'sensor', 'Collector cone': 'collector', ...tagF } },
    },
  },
  'aspirating-smoke-detector': {
    svg: svg('0 0 200 90', R(6, 30, 44, 40) + T(28, 55, 'ASD', 12) + P('M50 40h144') + [80, 116, 152, 188].map((x) => C(x, 40, 3, FILL) + P(`M${x} 40v10`, THIN)).join('')),
    e: {
      standard: FG + '; EN 54-20',
      drawn: 'A detector box marked ASD (or VESDA) with a sampling pipe running across the ceiling plan and the sampling holes marked as dots or short ticks along it.',
      tags: ['ASD', 'SD', 'VESDA'],
      notes: 'A pipe line with sampling holes from a box = aspirating system; point smoke detectors are individual circles with S.',
      datasheet: { form: 'Aspirating smoke detector design (EN 54-20)', fields: { 'Unit mounting height': 'height', 'Pipe height': 'pipeHeight', 'Pipe length': 'length', 'Hole spacing': 'spacing', Branches: 'branches', ...tagF } },
    },
  },
  'beam-smoke-detector': {
    svg: svg('0 0 200 80', R(6, 24, 32, 32) + T(22, 47, 'B', 14) + R(162, 24, 32, 32) + P('M162 24l32 32M194 24l-32 32', THIN) + P('M38 36h124M38 44h124', DASH + ' ' + THIN)),
    e: {
      standard: FG + '; EN 54-12',
      drawn: 'A transceiver symbol at one end and a reflector (square with a cross) at the other, joined by a beam line (often double-headed or a pair of lines) across a large open space.',
      tags: ['BSD', 'SD'],
      notes: 'Reflector at one end (no receiver electronics) = reflective beam smoke detector. A transmitter / receiver pair with a single beam on a process area is an open-path gas detector.',
      datasheet: { form: 'Beam smoke detector datasheet (EN 54-12)', fields: { Mounting: 'mount', 'Beam length': 'separation', 'Mounting height': 'height', ...tagF } },
    },
  },
  'pa-loudspeaker': {
    svg: svg('0 0 140 100', R(20, 38, 20, 24) + P('M40 38l40-26v76L40 62')),
    e: {
      standard: 'IEC 60617 (loudspeaker) / PA-GA layout convention',
      drawn: 'IEC loudspeaker: a small rectangle with a flared trumpet (trapezoid) opening from it, drawn at each speaker position on the PA/GA layout with its power tap (e.g. 15 W) and aiming direction.',
      tags: ['LS', 'SPK', 'PA'],
      notes: 'An alarm sounder is drawn as a bell or horn; a combined beacon and sounder is alarm-beacon. PA loudspeakers carry a wattage note.',
      datasheet: { form: 'PA/GA loudspeaker datasheet (EN 54-24, IEC 60079-1)', fields: { Style: 'style', Mounting: 'mount', 'Mounting height': 'height', 'Aiming tilt': 'tilt', 'Aiming pan': 'pan', 'Power tap': 'power', ...tagF } },
    },
  },
  'emergency-light': {
    svg: svg('0 0 180 70', R(10, 22, 160, 26) + P('M10 22l12 26M168 22l-12 26', THIN) + R(80, 28, 20, 14, FILL)),
    e: {
      standard: 'IEC 60617 luminaire / lighting layout convention (EN 1838)',
      drawn: 'Lighting layout: the luminaire outline (a long rectangle for a linear fitting, a circle for a bulkhead) with a filled mark, a cross or E for the emergency / self-contained battery version and the duration (e.g. 3 h) beside it.',
      tags: ['EL', 'EM'],
      notes: 'The filled mark or E distinguishes emergency fittings from normal luminaires on the same drawing. Escape signs are drawn separately (escape-sign).',
      datasheet: { form: 'Emergency luminaire schedule (IEC 60598-2-22, EN 1838)', fields: { Style: 'style', Mounting: 'mount', 'Mounting height': 'height', Length: 'length', ...tagF } },
    },
  },
  'escape-sign': {
    svg: svg('0 0 180 90', R(6, 10, 168, 70) + R(16, 22, 34, 48) + P('M28 70V34h12v36', THIN) + P('M70 45h80M136 32l14 13-14 13')),
    e: {
      standard: 'ISO 7010 / ISO 3864-1 (safety signs), escape plan convention',
      drawn: 'On escape route plans: a small sign rectangle showing the ISO 7010 emergency exit or assembly point symbol with a direction arrow, at each change of direction along the escape route; route arrows drawn along the walkways.',
      tags: ['ES', 'SIGN'],
      notes: 'Only on escape and safety plans. Muster / assembly points use the square E007-type sign; exits use the rectangular sign with an arrow.',
      datasheet: { form: 'Safety sign schedule (ISO 7010, ISO 3864-1, ISO 16069)', fields: { 'Sign symbol': 'symbol', 'Direction arrow': 'arrow', Lighting: 'lighting', Mounting: 'mount', 'Mounting height': 'height', Legend: 'legend', ...tagF } },
    },
  },
}
