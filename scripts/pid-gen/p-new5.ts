import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, bowtieV } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const tagF = { 'Tag number': 'tag' }
const sea = P('M10 112h180', THIN) + P('M20 112l-8 8M50 112l-8 8M80 112l-8 8M110 112l-8 8M140 112l-8 8M170 112l-8 8', THIN)
export default {
  'subsea-manifold': {
    svg: svg('0 0 200 125', R(20, 10, 160, 92, DASH + ' ' + THIN) + P('M30 40h140M30 70h140') + [60, 100, 140].map((x) => P(`M${x} 102V86h-10V40M${x} 86h10V70`) + bowtieV(x - 10, 56, 7, 5) + bowtieV(x + 10, 78, 5, 4)).join('') + P('M170 40h26M170 70h26') + sea),
    e: {
      standard: 'Subsea P&ID / field layout convention (API 17P)',
      drawn: 'Subsea P&ID: a dashed structure boundary containing production and test headers with each well slot (jumper hub) branching to both headers through its own subsea valves, and header outlets to the flowlines; on field layouts a rectangle with the wells radiating to it.',
      tags: ['SM', 'MF'],
      notes: 'Same branching logic as a topsides production-manifold, but inside a subsea structure boundary with hubs instead of flanges. A single-hub structure at a pipeline end is a PLET.',
      datasheet: { form: 'Subsea manifold datasheet (API 17P / API 17D)', fields: { 'Number of well slots': 'slots', 'Slot (jumper) size': 'slotNps', 'Header size': 'headerNps', 'Flange rating': 'rating', ...tagF } },
    },
  },
  'umbilical-termination-assembly': {
    svg: svg('0 0 200 125', R(70, 20, 100, 70, DASH + ' ' + THIN) + P('M4 70c20 0 30-12 66-12') + P('M4 78c20 0 30-12 66-12') + R(70, 50, 14, 24, FILL) + P('M84 40h60M84 56h60M84 72h60', THIN) + P('M84 64h60', 'stroke-dasharray="3 3" stroke-width="1.6"') + [40, 56, 72].map((y) => C(150, y, 5)).join('') + sea),
    e: {
      standard: 'Subsea control system schematic / field layout convention (API 17E)',
      drawn: 'On subsea control schematics: the umbilical (a thick double line or bundle) ending at a termination head inside a dashed structure, fanning out to hydraulic, chemical and electrical couplers that connect by flying leads to trees and manifolds.',
      tags: ['UTA', 'SUTU'],
      notes: 'A structure where the umbilical bundle splits into many small hydraulic / electrical lines is a UTA or SUTU; one carrying production pipework is a manifold or PLET.',
      datasheet: { form: 'Umbilical termination datasheet (API 17E / ISO 13628-5)', fields: { 'Umbilical outside diameter': 'umbilicalOd', 'Hydraulic / chemical couplers': 'couplers', 'Electrical connectors': 'electrical', ...tagF } },
    },
  },
  'packaged-boiler': {
    svg: svg('0 0 200 120', P('M40 30h120a14 30 0 0 1 0 60H40a14 30 0 0 1 0-60z') + P('M44 50h100M44 60h100M44 70h100', THIN) + P('M150 30V4h16v26') + R(6, 46, 26, 28) + P('M32 60h8') + P('M18 74v14l-6 8h12l-6-8', THIN) + P('M100 30V14h40M80 90v20')),
    e: {
      standard: ISO + ' (boiler / fired steam generator)',
      drawn: 'A horizontal shell (capsule) with fire tubes drawn as parallel lines inside, a burner box with the fuel line on the front end, a flue stack on top, steam outlet from the top and feedwater inlet; often inside a package boundary with the feedwater pumps.',
      tags: ['BLR', 'H'],
      notes: 'Shell with tubes plus burner and stack = fire-tube boiler. A fired heater is a vertical firebox with a process coil; a TEG reboiler is a smaller fire-tube capsule inside a regeneration package.',
      datasheet: { form: 'Steam boiler datasheet (EN 12953 / ASME Section I)', fields: { 'Steam output': 'steam', 'Design pressure': 'pressure', 'Flange rating': 'rating', Fuel: 'fuel', 'Access platform': 'platform', ...tagF } },
    },
  },
  'oily-water-separator': {
    svg: svg('0 0 200 110', P('M10 20v76h180V20') + P('M70 30l20 40M86 30l20 40M102 30l20 40M118 30l20 40', THIN) + P('M10 36h40', DASH + ' ' + THIN) + P('M50 20v56M150 30v66') + P('M4 30h20M190 70h10M160 40h30v-30') + P('M60 96v10')),
    e: {
      standard: ISO + ' (open separator / interceptor)',
      drawn: 'An open rectangular basin (no top line) with inclined parallel plates drawn as slanted lines in the middle, an inlet chamber with a baffle, an oil skimmer or weir to the oil outlet, a sludge draw-off at the bottom and the clean water outlet over a weir at the far end.',
      tags: ['V', 'T', 'X'],
      notes: 'Slanted plate pack in an open basin = CPI / plate interceptor. A closed horizontal vessel with weirs is a separator; produced water offshore uses hydrocyclones and degassers instead.',
      datasheet: { form: 'Oil-water separator datasheet (API 421)', fields: { 'Design flow': 'flow', Construction: 'construction', 'Inlet size': 'inletNps', 'Oil outlet size': 'oilNps', 'Flange rating': 'rating', Covers: 'covers', ...tagF } },
    },
  },
  'expansion-joint': {
    svg: svg('0 0 160 80', P('M4 40h36M120 40h36') + P('M40 22v36M120 22v36') + P('M40 22l8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8M40 58l8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8')),
    e: {
      standard: ISO + ' (compensator / bellows)',
      drawn: 'A short section of the line drawn with a zig-zag (convoluted) outline between two flange bars; tie rods, hinges or gimbals are noted as EJ type, often tagged EJ or XJ.',
      tags: ['EJ', 'XJ'],
      notes: 'Zig-zag outline in the line = bellows; a flexible hose is drawn as a wavy line. Found on exhaust ducts, cooling water, compressor and turbine connections.',
      datasheet: { form: 'Expansion joint datasheet (EJMA)', fields: { 'Joint type': 'kind', 'Nominal size': 'nps', 'Flange rating': 'rating', Convolutions: 'convolutions', 'Internal liner': 'liner', 'External cover': 'cover' } },
    },
  },
  'breathing-apparatus-cabinet': {
    svg: svg('0 0 120 130', R(20, 10, 80, 110) + P('M42 92V52a18 18 0 0 1 36 0v40z') + P('M52 40V30h16v10') + T(60, 78, 'BA', 14)),
    e: {
      standard: 'Safety equipment layout convention; ISO 7010 sign',
      drawn: 'Safety equipment layouts: a cabinet rectangle with a BA mark or a cylinder outline, located at muster points, the CCR and H2S-risk areas, with the number of sets noted.',
      tags: ['BA', 'SCBA'],
      notes: 'Only on safety equipment plans. A cabinet with a cross is a first-aid station; a cabinet with FE is an extinguisher.',
      datasheet: { form: 'Safety equipment schedule (EN 137 / SOLAS FSS Code ch. 3)', fields: { 'Number of sets': 'sets', Mounting: 'mount', Colour: 'colour', 'ISO 7010 sign': 'sign', ...tagF } },
    },
  },
  'first-aid-station': {
    svg: svg('0 0 120 120', R(16, 16, 88, 88) + P('M50 36h20v14h14v20H70v14H50V70H36V50h14z')),
    e: {
      standard: 'Safety equipment layout convention; ISO 7010 sign',
      drawn: 'Safety equipment layouts: a square with a cross (the first-aid sign) at the station, with a stretcher noted where provided.',
      tags: ['FA'],
      notes: 'Only on safety equipment plans. The cross outline distinguishes it from other cabinets.',
      datasheet: { form: 'Safety equipment schedule (ISO 7010, EN 13976 stretchers)', fields: { Stretcher: 'stretcher', Mounting: 'mount', 'ISO 7010 sign': 'sign', ...tagF } },
    },
  },
  'lifejacket-box': {
    svg: svg('0 0 140 110', R(16, 30, 108, 64) + P('M12 30h116', 'stroke-width="5"') + P('M50 44l20 6 20-6v34l-20 8-20-8z') + P('M70 50v36', THIN)),
    e: {
      standard: 'Lifesaving appliance plan convention; SOLAS LSA Code, ISO 7010 sign',
      drawn: 'Escape and lifesaving plans: a box (rectangle) with a lifejacket outline or LJ mark at each muster station and lifeboat embarkation point, with the number of jackets stored written beside it.',
      notes: 'Only on lifesaving appliance plans. A ring is a lifebuoy (life-ring); a boat outline is a lifeboat.',
      datasheet: { form: 'Lifesaving appliance schedule (SOLAS LSA Code 2.2)', fields: { 'Number of lifejackets': 'capacity', Colour: 'colour', ...tagF } },
    },
  },
}
