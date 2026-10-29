import { svg, T, P, C, R, FILL, WHITE, bubble, THIN, DASH } from './h.ts'
const ISA = 'ISA 5.1 (field-mounted instrument bubble)'
const ISAF = 'ISA 5.1 (flow element + transmitter)'
const tagF = { 'Tag number': 'tag' }
const tap = (s: string) => svg('0 0 100 110', P('M4 96h92') + P('M50 96V60') + bubble(50, 40, s, 20))
const well = (s: string) => svg('0 0 100 110', P('M4 92h92M4 104h92') + P('M44 98V66M56 98V66M44 98a6 6 0 0 0 12 0') + bubble(50, 44, s, 20))
const inline = (inner: string, s = 'FT') => svg('0 0 120 110', P('M4 86h30M86 86h30') + inner + P('M60 70V50') + bubble(60, 30, s, 20))
export default {
  'pressure-transmitter': {
    svg: tap('PT'),
    e: {
      standard: ISA,
      drawn: 'Plain circle (field-mounted bubble) with PT, PIT or PT plus loop number, joined by a short solid process connection line to the pipe or vessel.',
      isa: ['PT', 'PIT', 'PE'],
      notes: 'A bubble with a horizontal bar across it is a DCS / control-room function (PIC, PI on the console), not a field device. PG / PI with no bar is a local gauge (pressure-gauge). PDT has two process connections (dp-transmitter). PST / PSH / PSL are switches (pressure-switch).',
      datasheet: { form: 'Pressure transmitter specification form (ISA-TR20.00.01)', fields: { 'Process connection rating': 'rating', 'Housing material / finish': 'housing', Sunshade: 'sunshade', ...tagF } },
    },
  },
  'dp-transmitter': {
    svg: svg('0 0 120 110', P('M4 96h112') + P('M34 96V60l12-8M86 96V60l-12-8') + bubble(60, 40, 'PDT', 20)),
    e: {
      standard: ISA,
      drawn: 'Field bubble with PDT (or PDIT, FT, LT) joined by two process connection lines, the high side and the low side, to two points on the pipe or vessel, e.g. either side of a filter, strainer or exchanger.',
      isa: ['PDT', 'PDIT', 'FT (with orifice)', 'LT (DP level)'],
      notes: 'Two impulse lines from one bubble = differential pressure. If the two taps straddle an orifice plate the loop is a flow measurement (orifice-flowmeter); if they are on the top and bottom of a vessel it is a DP level transmitter.',
      datasheet: { form: 'Differential pressure transmitter specification form (ISA-TR20.00.01)', fields: { 'Process connection rating': 'rating', 'Housing material / finish': 'housing', Sunshade: 'sunshade', ...tagF } },
    },
  },
  'orifice-flowmeter': {
    svg: svg('0 0 120 110', P('M4 86h112') + P('M56 70v32M64 70v32') + P('M40 86V58l11-10M80 86V58l-11-10') + bubble(60, 30, 'FT', 20)),
    e: {
      standard: 'ISA 5.1 (orifice plate in flanges, FE + FT)',
      drawn: 'Two short parallel bars across the line (the orifice flanges with the plate between them), tagged FE, with two taps to an FT or FIT bubble. Some legends draw a single bar, or a box around the line with a diagonal.',
      tags: ['FE'],
      isa: ['FE', 'FT', 'FIT', 'FO (restriction orifice)'],
      notes: 'With no transmitter and tag RO or FO it is a restriction orifice, not a meter. Venturi and flow nozzle are drawn as a converging / diverging outline instead. A flanged meter run with 10D / 5D straight lengths and a flow conditioner is still this element.',
      datasheet: { form: 'Orifice plate / flow element specification form (ISA-TR20.00.01; ISO 5167-2 calculation)', fields: { 'Line size': 'nps', 'Flange rating': 'rating', 'Beta ratio (d/D)': 'beta', 'Upstream straight length': 'upstream', 'Downstream straight length': 'downstream', ...tagF } },
    },
  },
  'coriolis-flowmeter': {
    svg: inline(R(34, 72, 52, 28) + P('M34 86h6c0 0 0 8 6 8h28c6 0 6-8 6-8h6')),
    e: {
      standard: ISAF + '; no agreed ISA element shape for Coriolis',
      drawn: 'Inline box on the line, often with a U or double-U loop drawn inside, joined to an FT / FIT bubble (integral transmitter). Frequently just a generic FE box with "CORIOLIS" or "MASS" written beside it.',
      tags: ['FE'],
      isa: ['FE', 'FT', 'FIT', 'FQT (totaliser)'],
      notes: 'ISA 5.1 has no dedicated Coriolis element, so legends differ; read the text beside the box, the instrument index or the datasheet for the technology. Common on chemical injection, condensate, fiscal liquid and test separator outlets.',
      datasheet: { form: 'Coriolis mass flowmeter specification form (ISA-TR20.00.01)', fields: { 'Line size': 'nps', 'Flange rating': 'rating', 'Installation orientation (tubes)': 'tubes', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
  'ultrasonic-flowmeter': {
    svg: inline(R(34, 72, 52, 28) + R(40, 66, 8, 6, FILL) + R(72, 100, 8, 6, FILL) + P('M44 72l32 28', DASH + ' ' + THIN)),
    e: {
      standard: ISAF + '; ultrasonic element varies by legend',
      drawn: 'Inline spool box with transducer marks on opposite sides and a diagonal acoustic path between them, joined to an FT bubble. Many legends just write "USM" or "UFM" beside a generic FE box.',
      tags: ['FE'],
      isa: ['FE', 'FT', 'FIT', 'FQ'],
      notes: 'Fiscal gas metering runs (AGA 9) are usually multipath ultrasonic; a clamp-on meter is drawn on the outside of the pipe with no break in the line. Check the technology in the instrument index.',
      datasheet: { form: 'Ultrasonic flowmeter specification form (ISA-TR20.00.01; AGA 9 / ISO 17089-1)', fields: { 'Line size': 'nps', 'Flange rating': 'rating', 'Number of acoustic paths': 'paths', 'Transducer shroud': 'shroud', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
  'magnetic-flowmeter': {
    svg: inline(R(34, 72, 52, 28) + T(60, 92, 'M', 16)),
    e: {
      standard: ISAF + '; magnetic element drawn as a box or circle with M',
      drawn: 'Inline box (or circle) on the line marked M, joined to an FT bubble. Some legends use a generic FE with "MAG" written beside it.',
      tags: ['FE'],
      isa: ['FE', 'FT', 'FIT'],
      notes: 'Only for conductive liquids (water, produced water, seawater, chemicals); a meter on a gas line is never a mag meter. A circle with M on a valve stem is a motor actuator, not a flowmeter.',
      datasheet: { form: 'Magnetic flowmeter specification form (ISA-TR20.00.01)', fields: { 'Line size': 'nps', 'Flange rating': 'rating', 'Liner material': 'liner', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
  'vortex-flowmeter': {
    svg: inline(R(34, 72, 52, 28) + P('M54 76v20l10-10z', FILL) + P('M70 82c4-3 8 3 12 0M70 92c4-3 8 3 12 0', THIN)),
    e: {
      standard: ISAF + '; vortex element varies by legend',
      drawn: 'Inline box with a small bluff-body triangle (the shedder bar) and wavy vortex lines downstream, joined to an FT bubble. Often a generic FE with "VORTEX" written beside it.',
      tags: ['FE'],
      isa: ['FE', 'FT', 'FIT'],
      notes: 'Used on steam, fuel gas, utility gas and clean liquids. Read the instrument index to confirm the technology when the legend only gives a generic flow element.',
      datasheet: { form: 'Vortex flowmeter specification form (ISA-TR20.00.01)', fields: { 'Line size': 'nps', 'Flange rating': 'rating', 'Extended (high-temperature) neck': 'neck', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
  'guided-wave-radar': {
    svg: svg('0 0 110 130', P('M4 64h30M4 110h30') + R(34, 50, 24, 74) + P('M46 50V40M46 50v66') + C(46, 116, 3, FILL) + bubble(46, 22, 'LT', 18)),
    e: {
      standard: ISA,
      drawn: 'LT / LIT field bubble on top of an external chamber (cage) bolted to the vessel by an upper and a lower connection, with a probe line hanging down inside the chamber; or the bubble sits directly on a vessel top nozzle.',
      isa: ['LT', 'LIT', 'LE'],
      notes: 'A bridle (vertical standpipe) carrying several instruments is common: the LT, an LG (magnetic-level-gauge) and LSHH / LSLL switches all hang off it. Non-contact radar uses the same LT bubble without a probe. Interface level is LT with the service written beside it.',
      datasheet: { form: 'Level transmitter specification form (ISA-TR20.00.01)', fields: { 'External chamber': 'chamber', 'Probe length': 'length', 'Process connection size': 'nps', 'Chamber size': 'chamberNps', 'Flange rating': 'rating', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
  'magnetic-level-gauge': {
    svg: svg('0 0 120 130', P('M4 30h34M4 110h34') + R(38, 16, 20, 106) + P('M48 16V8M48 122v6') + P('M58 60h18') + bubble(94, 60, 'LG', 18) + P('M42 70h12M42 80h12M42 90h12M42 100h12', THIN)),
    e: {
      standard: ISA,
      drawn: 'Tall narrow chamber beside the vessel with an upper and a lower side connection (isolation valves on each, vent on top, drain below), labelled with an LG or LI bubble.',
      tags: ['LG'],
      isa: ['LG', 'LI'],
      notes: 'Same chamber with a transmitter strapped on is LG plus LT on one bridle (set transmitter). A plain glass (reflex / transparent) gauge is drawn the same and is also tagged LG; check the datasheet.',
      datasheet: { form: 'Level gauge specification form (ISA-TR20.00.01)', fields: { 'Centre-to-centre': 'length', 'Process connection size': 'nps', 'Chamber size': 'chamberNps', 'Flange rating': 'rating', 'Clamp-on transmitter': 'transmitter', 'Level switches': 'switches', ...tagF } },
    },
  },
  'temperature-transmitter': {
    svg: well('TT'),
    e: {
      standard: ISA,
      drawn: 'TT or TIT field bubble joined to a thermowell (a short U-shaped pocket pushed into the pipe, sometimes tagged TW), on the pipe or vessel.',
      isa: ['TT', 'TIT', 'TE', 'TW'],
      notes: 'TE (element) plus TT (transmitter) of the same loop are one physical item. TI / TG with no transmitter is a dial thermometer (temperature-gauge). A TW bubble on its own is a spare or test thermowell.',
      datasheet: { form: 'Temperature transmitter + thermowell specification forms (ISA-TR20.00.01; ASME PTC 19.3 TW)', fields: { 'Thermowell flange size': 'nps', 'Flange rating': 'rating', 'Insertion length (U)': 'insertion', 'Lagging extension (T)': 'extension', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
  'pressure-gauge': {
    svg: tap('PI'),
    e: {
      standard: ISA,
      drawn: 'Field bubble marked PI (or PG on some legends) joined to the pipe by a short process line; no signal line leaves it, because it is a local dial.',
      tags: ['PG'],
      isa: ['PI', 'PG'],
      notes: 'Same bubble as a transmitter but with PI / PG and no signal line. A bubble with a bar through it reading PI is a console indication, not a gauge. PDI / PDG across a filter is a differential gauge.',
      datasheet: { form: 'Pressure gauge specification form (ISA-TR20.00.01; EN 837-1 / ASME B40.100)', fields: { 'Flange rating': 'rating', 'Dial size': 'dial', 'Range (max)': 'max', Siphon: 'siphon', ...tagF } },
    },
  },
  'temperature-gauge': {
    svg: well('TI'),
    e: {
      standard: ISA,
      drawn: 'Field bubble marked TI (or TG) on a thermowell pocket in the pipe; no signal line.',
      tags: ['TG'],
      isa: ['TI', 'TG', 'TW'],
      notes: 'Same as the temperature transmitter but with TI / TG. A test thermowell with no instrument is a TW bubble alone.',
      datasheet: { form: 'Bimetal thermometer + thermowell specification forms (ISA-TR20.00.01; ASME B40.200)', fields: { 'Thermowell flange size': 'nps', 'Flange rating': 'rating', 'Insertion length (U)': 'insertion', 'Lagging extension (T)': 'extension', 'Dial size': 'dial', 'Range (max)': 'max', ...tagF } },
    },
  },
  'level-switch': {
    svg: svg('0 0 120 110', P('M20 8v94', 'stroke-width="4"') + P('M20 56h44') + P('M20 50l-12 6 12 6', THIN) + bubble(84, 56, 'LSH', 20)),
    e: {
      standard: ISA,
      drawn: 'Field bubble with LS plus H / HH / L / LL (LSH, LSHH, LSLL) on a side connection of a vessel or bridle at the trip height. In a SIS it is often drawn with a diamond or hexagon tag for the logic it feeds.',
      isa: ['LSH', 'LSHH', 'LSL', 'LSLL', 'LS'],
      notes: 'S = switch, so the bubble has no transmitter letter T. Trip levels are written beside it in mm or %. Vibrating fork, float and displacer switches all use the same bubble.',
      datasheet: { form: 'Level switch specification form (ISA-TR20.00.01)', fields: { 'Process connection size': 'nps', 'Flange rating': 'rating', 'Insertion length': 'length', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
  'pressure-switch': {
    svg: tap('PSH'),
    e: {
      standard: ISA,
      drawn: 'Field bubble with PS plus H / HH / L / LL (PSH, PSHH, PSL, PSLL) on a short process connection, usually feeding a trip.',
      isa: ['PSH', 'PSHH', 'PSL', 'PSLL', 'PS'],
      notes: 'Switches have S as the function letter and no T. A PSV is a relief valve, not a switch: PSV has V for valve. PDSH across a filter is a differential pressure switch.',
      datasheet: { form: 'Pressure switch specification form (ISA-TR20.00.01)', fields: { 'Flange rating': 'rating', 'Housing material / finish': 'housing', ...tagF } },
    },
  },
}
