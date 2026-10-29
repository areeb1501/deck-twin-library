import { svg, T, P, C, R, FILL, WHITE, THIN, DASH } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const tagF = { 'Tag number': 'tag' }
const motor = (cx: number, cy: number, r = 18) => C(cx, cy, r) + T(cx, cy + 6, 'M', 16)
/** seed-style centrifugal pump circle at (cx, cy) r 26 */
const pump = (cx: number, cy: number) => C(cx, cy, 26) + P(`M${cx} ${cy - 26}h36M${cx - 56} ${cy}h30`) + P(`M${cx - 10} ${cy - 12}l22 12-22 12z`)
export default {
  'centrifugal-pump': {
    e: {
      standard: ISO,
      drawn: 'Circle with the discharge leaving tangentially from the top, suction entering the centre from the side. Often a small triangle inside pointing to the discharge, and a base line or two short legs under it.',
      tags: ['P'],
      notes: 'P&IDs rarely show the API 610 type. OH2, OH3, BB3 and VS pumps can all appear as this circle: read the datasheet or the title (e.g. "multistage", "vertical inline", "caisson"). A circle with a piston or crank inside is a reciprocating pump; an arrow through the symbol means variable capacity (metering pump).',
      datasheet: { form: 'API 610 centrifugal pump datasheet', fields: { 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', 'Driver rated power': 'kw', 'Number of stages': 'stages', ...tagF } },
    },
  },
  'between-bearings-pump': {
    svg: svg('0 0 170 100', pump(60, 55) + P('M86 55h40') + motor(146, 55) + P('M36 81l-8 14h60l-8-14', THIN)),
    e: {
      standard: ISO,
      drawn: 'Same centrifugal pump circle (tangential discharge, side suction), here with the driver drawn as a circle with M on the shaft. High-head water injection or export duty, often noted "multistage" or "BB3".',
      tags: ['P'],
      notes: 'The symbol does not show between-bearings or multistage construction; pick this component when the title, datasheet or duty says multistage / BB3 / high head (e.g. water injection, pipeline booster). Otherwise use centrifugal-pump.',
      datasheet: { form: 'API 610 centrifugal pump datasheet (BB3)', fields: { 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', 'Driver rated power': 'kw', 'Number of stages': 'stages', 'Lube oil console (API 614)': 'lubeConsole', ...tagF } },
    },
  },
  'vertical-inline-pump': {
    svg: svg('0 0 120 120', C(60, 80, 24) + P('M4 80h32M84 80h32') + P('M50 68l22 12-22 12z') + P('M60 56V40') + motor(60, 22)),
    e: {
      standard: ISO,
      drawn: 'Pump circle with suction and discharge on the same straight centreline through the casing (in-line), and the motor drawn above it on a vertical shaft.',
      tags: ['P'],
      notes: 'Many legends draw it as the normal centrifugal pump circle; the in-line nozzles and vertical motor are the clue when shown. Confirm OH3 / "vertical in-line" on the datasheet.',
      datasheet: { form: 'API 610 centrifugal pump datasheet (OH3)', fields: { 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', 'Driver rated power': 'kw', ...tagF } },
    },
  },
  'vertical-turbine-pump': {
    svg: svg('0 0 120 160', motor(60, 18, 14) + P('M60 32v10') + R(44, 42, 32, 18) + P('M76 52h40') + P('M8 66h104') + P('M46 66v84M74 66v84') + P('M60 60v68') + P('M52 128h16l4 16H48z') + P('M10 98c8-5 12 5 20 0s12 5 20 0', THIN) + P('M70 98c8-5 12 5 20 0s12 5 20 0', THIN)),
    e: {
      standard: ISO + ' (vertical / caisson pump convention)',
      drawn: 'Pump set drawn vertically: motor (circle with M) on top, discharge head with a side outlet at deck level, and a long column hanging down into a caisson or sump with the pump bowls at the bottom, often below a sea-level mark.',
      tags: ['P'],
      notes: 'Seawater lift and firewater pumps on offshore platforms are this type. A diesel driver box instead of M means diesel-firewater-pump. Some legends draw only a pump circle with "VS1" or "caisson" written beside it.',
      datasheet: { form: 'API 610 vertical pump datasheet (VS1)', fields: { 'Driver rated power': 'kw', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', 'Setting depth': 'depth', 'Caisson diameter': 'caissonDiameter', 'Number of stages': 'stages', ...tagF } },
    },
  },
  'diesel-firewater-pump': {
    svg: svg('0 0 170 100', pump(60, 55) + P('M86 55h28') + R(114, 37, 50, 36) + T(139, 61, 'DE', 15) + P('M36 81l-8 14h60l-8-14', THIN)),
    e: {
      standard: ISO + '; NFPA 20 fire pump',
      drawn: 'Pump symbol (or vertical caisson pump) coupled to a rectangle marked D, DE or "diesel" for the engine driver, on a firewater (FW) line feeding the ring main, often inside a dashed pump-house boundary.',
      tags: ['P', 'FWP'],
      notes: 'Same pump circle as any centrifugal pump: the diesel driver box, the FW line service and the firewater pump title decide it. An electric firewater (jockey) pump has M instead of DE.',
      datasheet: { form: 'Fire pump datasheet (NFPA 20, API 610 VS1 / BB1)', fields: { 'Pump type': 'pumpType', 'Driver rated power': 'kw', 'Discharge nozzle size': 'dischargeNps', 'Suction nozzle size': 'suctionNps', 'Flange rating': 'rating', 'Setting depth': 'depth', 'Caisson diameter': 'caissonDiameter', 'Number of stages': 'stages', ...tagF } },
    },
  },
  'reciprocating-pump': {
    svg: svg('0 0 130 110', C(56, 55, 26) + P('M56 81v25M56 29V4') + P('M44 40v30', 'stroke-width="5"') + P('M44 55h46') + C(104, 55, 12) + P('M104 55l8-8')),
    e: {
      standard: ISO,
      drawn: 'Pump circle with a piston (a short thick bar) and rod inside, the rod leaving to a crank; suction in at the bottom and discharge out at the top, often with pulsation dampeners drawn as small domes on both lines.',
      tags: ['P'],
      notes: 'A piston, plunger or crank inside the circle marks positive displacement. An adjustable-stroke arrow through it means a metering pump. Legends vary: some use a rectangle with a piston instead of a circle.',
      datasheet: { form: 'API 674 reciprocating pump datasheet', fields: { 'Number of plungers': 'plungers', 'Driver rated power': 'kw', 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Suction flange rating': 'suctionRating', 'Discharge flange rating': 'rating', ...tagF } },
    },
  },
  'metering-pump': {
    svg: svg('0 0 120 100', C(60, 50, 24) + P('M4 50h32M84 50h32') + P('M54 30c-8 12-8 28 0 40') + P('M36 80L82 22') + P('M82 22l-10 3 6 6z', FILL)),
    e: {
      standard: ISO,
      drawn: 'Small pump circle with a curved diaphragm line inside and a diagonal arrow through it (adjustable capacity), on a chemical injection (CI) line, usually inside a chemical injection package boundary.',
      tags: ['P'],
      notes: 'The diagonal arrow (variable stroke) and the small CI / MI line size tell it from a centrifugal pump. Several identical heads in a row inside a dashed box = a chemical-injection-skid.',
      datasheet: { form: 'API 675 controlled-volume pump datasheet', fields: { 'Suction connection size': 'suctionNps', 'Discharge connection size': 'dischargeNps', 'Suction flange rating': 'suctionRating', 'Discharge flange rating': 'rating', 'Driver rated power': 'kw', 'Stroke length setting': 'stroke', ...tagF } },
    },
  },
  'centrifugal-compressor': {
    svg: svg('0 0 170 90', P('M30 10L90 28v34L30 80z') + P('M40 0v13M80 0v25') + P('M90 45h30') + motor(140, 45, 20)),
    e: {
      standard: ISO,
      drawn: 'Trapezoid (wide end = suction, narrow end = discharge) with the driver on the shaft: a circle with M for a motor, or a gas turbine drawn as a second, reversed trapezoid. Anti-surge recycle and a recycle valve usually loop from discharge back to suction.',
      tags: ['K', 'C'],
      notes: 'Trapezoid = dynamic compressor. A trapezoid narrowing the other way, coupled to a generator or compressor, is a turbine (or an expander). A rectangle with a piston is a reciprocating compressor; two meshing rotors mean a screw compressor.',
      datasheet: { form: 'API 617 centrifugal compressor datasheet', fields: { 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', 'Driver rated power': 'mw', 'Casing type': 'casing', 'Nozzle orientation': 'nozzles', 'Driver type': 'driver', ...tagF } },
    },
  },
  'reciprocating-compressor': {
    svg: svg('0 0 150 100', R(20, 28, 64, 44) + P('M50 28v44', 'stroke-width="6"') + P('M50 50h56') + C(120, 50, 14) + P('M120 50l9-9') + P('M34 28V4M70 72v24')),
    e: {
      standard: ISO,
      drawn: 'Cylinder (rectangle) with a piston and rod inside, the rod running to a crank; suction usually into the top and discharge out of the bottom, with suction and discharge pulsation bottles drawn as small horizontal vessels on each nozzle.',
      tags: ['K', 'C'],
      notes: 'Multi-stage machines show one cylinder per stage with interstage coolers and scrubbers between them. A trapezoid is a centrifugal compressor.',
      datasheet: { form: 'API 618 reciprocating compressor datasheet', fields: { 'Number of throws': 'throws', 'Cylinder bore': 'bore', 'Driver rated power': 'kw', 'Suction nozzle size': 'suctionNps', 'Discharge nozzle size': 'dischargeNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'screw-compressor': {
    svg: svg('0 0 160 100', R(20, 24, 80, 52, 'rx="8"') + C(48, 50, 16) + C(72, 50, 16) + P('M40 24V4M80 76v20') + P('M100 50h20') + motor(138, 50)),
    e: {
      standard: ISO,
      drawn: 'Casing outline with two meshing rotors (two overlapping circles or intermeshing helices) inside, driver on the shaft. Packaged instrument-air or gas-boost units are usually shown inside a dashed package boundary with the oil separator and cooler.',
      tags: ['K', 'C'],
      notes: 'Two rotors = rotary screw (or lobe) compressor. A trapezoid is centrifugal; a piston in a cylinder is reciprocating. Oil-free air packages (instrument-air-package) use the same compressor symbol inside a larger package.',
      datasheet: { form: 'API 619 rotary-type positive displacement compressor datasheet', fields: { 'Driver rated power': 'kw', Service: 'service', 'Acoustic enclosure': 'enclosure', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'gas-turbine-generator': {
    svg: svg('0 0 200 90', P('M20 18l40 14v26l-40 14z') + R(62, 36, 16, 18) + P('M80 32l40-14v54l-40-14z') + P('M70 4v32') + P('M100 18V4') + P('M120 45h22') + C(164, 45, 22) + T(164, 51, 'G', 18)),
    e: {
      standard: ISO + ' (turbine) / IEC 60617 (generator)',
      drawn: 'Gas turbine drawn as a narrowing trapezoid (compressor), a small combustor box with the fuel line into it, and a widening trapezoid (turbine) with the exhaust leaving, coupled by the shaft to a circle with G (generator).',
      tags: ['GT', 'G', 'TG'],
      notes: 'On electrical single-line diagrams only the generator circle with G and ~ appears. A turbine coupled to a compressor instead of G is a turbine-driven compressor (centrifugal-compressor with driver gas-turbine). A box marked DE with G is a diesel generator.',
      datasheet: { form: 'API 616 gas turbine datasheet (+ IEC 60034-3 generator)', fields: { 'Rated output': 'mw', 'Fuel system': 'fuel', 'Fuel gas connection size': 'fuelNps', 'Flange rating': 'rating', 'Exhaust stack height': 'stackHeight', ...tagF } },
    },
  },
  'diesel-generator': {
    svg: svg('0 0 170 90', R(10, 25, 64, 40) + T(42, 51, 'DE', 16) + P('M74 45h30') + C(128, 45, 24) + T(128, 47, 'G', 18) + P('M120 59c3-4 5-4 8 0s5 4 8 0', 'stroke-width="2"')),
    e: {
      standard: 'IEC 60617 (generator) / layout and P&ID convention for the engine',
      drawn: 'Rectangle for the diesel engine (marked D or DE) coupled to a circle with G and ~ for the alternator. On P&IDs it appears with its diesel (DF) supply line from a day tank and an exhaust line.',
      tags: ['G', 'EDG', 'DG'],
      notes: 'G with a turbine trapezoid is a gas-turbine-generator. DE coupled to a pump is a diesel-firewater-pump.',
      datasheet: { form: 'Generating set datasheet (ISO 8528 / ISO 3046, NFPA 110)', fields: { 'Rated output (kWe)': 'kw', Enclosure: 'enclosure', 'Fuel connection size': 'fuelNps', ...tagF } },
    },
  },
  'electric-motor': {
    svg: svg('0 0 120 90', C(50, 45, 32) + T(50, 46, 'M', 22) + T(50, 66, '3~', 13) + P('M82 45h34')),
    e: {
      standard: 'IEC 60617 (motor) / ISA 5.1',
      drawn: 'Circle with M (IEC: M with 3~ underneath for a three-phase AC motor), drawn coupled to the driven machine on P&IDs and hanging from a feeder on single-line diagrams.',
      tags: ['M', 'PM', 'KM'],
      notes: 'Circle with G is a generator. A circle with M on top of a valve stem is a motor actuator (MOV), not a separate motor. A circle with M inside a square is used by some legends for a motor-driven package.',
      datasheet: { form: 'Electric motor datasheet (IEC 60034-1 / IEC 60072)', fields: { 'Rated power': 'kw', 'Number of poles': 'poles', 'Anti-condensation heater': 'heater', 'Terminal box position': 'terminalBox', ...tagF } },
    },
  },
  'centrifugal-fan': {
    svg: svg('0 0 130 100', C(56, 56, 28) + P('M56 28h50M84 56V44h22') + P('M106 28v16') + C(56, 56, 7) + P('M56 49c10-8 18-4 20 4M63 56c8 10 4 18-4 20M56 63c-10 8-18 4-20-4M49 56c-8-10-4-18 4-20', THIN)),
    e: {
      standard: ISO,
      drawn: 'Circle (scroll) with a wide rectangular outlet duct leaving tangentially and curved blades or a hub drawn inside; inlet through the centre. Axial fans are drawn as a propeller (bow-tie) inside a circle or duct.',
      tags: ['F', 'K', 'EF', 'SF'],
      notes: 'Looks like a pump but the outlet is a wide duct and it sits on HVAC ducting (often drawn double-line) rather than a pipe. Air cooler fans are part of air-cooled-exchanger.',
      datasheet: { form: 'Fan datasheet (AMCA 99 / ISO 13349)', fields: { 'Impeller diameter': 'wheelDiameter', 'Motor rated power': 'kw', 'Discharge orientation': 'outlet', ...tagF } },
    },
  },
}
