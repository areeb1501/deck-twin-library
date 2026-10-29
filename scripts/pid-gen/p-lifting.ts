import { svg, T, P, C, R, FILL, WHITE, THIN, DASH, DASHDOT } from './h.ts'
const LAY = 'Layout plan convention (lifting / materials-handling study)'
const tagF = { 'Tag number': 'tag' }
export default {
  'pedestal-crane': {
    svg: svg('0 0 160 160', C(80, 80, 72, DASH + ' ' + THIN) + C(80, 80, 14) + C(80, 80, 20, THIN) + P('M80 80l52-30') + P('M126 46l10 2-4 8') + C(132, 50, 3, FILL)),
    e: {
      standard: LAY + '; API Spec 2C',
      drawn: 'Plan view: the pedestal as a circle at the crane position with the maximum (and minimum) working radius drawn as large dashed circles around it, the boom as a line, and laydown areas and lift paths inside the radius; tagged CR- with SWL at radius.',
      tags: ['CR', 'K', 'CRN'],
      notes: 'The large dashed reach circle is the clue. A small post with a short jib and no reach study is a davit-crane. Not on P&IDs, except a diesel or hydraulic utility tie-in.',
      datasheet: { form: 'Offshore crane datasheet (API Spec 2C / EN 13852-1)', fields: { 'Boom length': 'boomLength', 'Pedestal height': 'pedestalHeight', 'Safe working load': 'swl', 'Boom rest': 'boomRest', ...tagF } },
    },
  },
  'shipping-container': {
    svg: svg('0 0 180 90', R(10, 15, 160, 60) + P('M10 15l160 60M170 15L10 75', THIN) + P('M164 15v60', 'stroke-width="4"')),
    e: {
      standard: LAY,
      drawn: 'Plan view: a rectangle at the ISO footprint (10, 20 or 40 ft) in a laydown area, often with a diagonal cross meaning "laydown / temporary", the door end marked by a thicker line, and its size written inside.',
      tags: ['CNT', 'CONT'],
      notes: 'Laydown areas are rectangles with a cross or hatch; a container is one sized like an ISO box. Baskets are open and smaller; tote tanks are near-square.',
      datasheet: { form: 'Offshore container certificate / specification (DNV 2.7-1, ISO 668)', fields: { Size: 'size', Marking: 'marking', 'Lifting set': 'liftingSet', ...tagF } },
    },
  },
  'cargo-basket': {
    svg: svg('0 0 160 130', P('M20 70h120v50H20z') + P('M20 70l30 50M50 70l30 50M80 70l30 50M110 70l30 50', THIN) + P('M20 70L80 10l60 60') + C(80, 10, 4, FILL)),
    e: {
      standard: LAY,
      drawn: 'Elevation: an open-topped frame with mesh sides hanging from a four-leg sling set to a master link; in plan, a long rectangle in the laydown area.',
      tags: ['BSK', 'CB'],
      notes: 'Open top and mesh sides tell it from a closed container. Not on P&IDs.',
      datasheet: { form: 'Offshore container certificate (DNV 2.7-1 / EN 12079-1)', fields: { Length: 'length', Width: 'width', Height: 'height', 'Safe working load': 'swl', 'Lifting set': 'liftingSet', ...tagF } },
    },
  },
  'monorail-hoist': {
    svg: svg('0 0 180 120', P('M10 20h160', 'stroke-width="5"') + P('M10 6v28M170 6v28') + C(80, 30, 6) + C(100, 30, 6) + R(76, 38, 28, 22) + P('M90 60v36') + P('M90 96c0 10 12 10 12 0', 'stroke-width="3"')),
    e: {
      standard: LAY,
      drawn: 'Plan view: a dash-dot or thick line along the runway beam labelled "monorail, SWL x t" from the equipment it serves to the drop or laydown zone; in elevation a beam with a trolley, hoist block and hook.',
      tags: ['MR', 'HST', 'HO'],
      notes: 'Shown on mechanical handling and layout drawings over pumps, compressors and exchangers that need lifting. Not on P&IDs.',
      datasheet: { form: 'Hoist and runway datasheet (EN 14492-2 / FEM 9.511)', fields: { 'Runway length': 'length', 'Beam height': 'height', 'Safe working load': 'swl', ...tagF } },
    },
  },
  'lifeboat-davit': {
    svg: svg('0 0 180 110', P('M14 60c20 30 132 30 152 0z') + P('M30 60c10-26 110-26 120 0') + P('M40 60V20h16M140 60V20h-16') + P('M56 20l6 20M124 20l-6 20', THIN) + R(80, 30, 20, 12)),
    e: {
      standard: LAY + ' (lifesaving appliance plan); SOLAS LSA Code',
      drawn: 'On escape and lifesaving plans: a boat outline (pointed or rounded ends) at the muster station, under davit arms, with its capacity (e.g. 50 P) written inside; often marked TEMPSC.',
      tags: ['LB', 'TEMPSC'],
      notes: 'Liferafts are drawn as small circles or canisters. Never on P&IDs.',
      datasheet: { form: 'Lifeboat and davit certificate / schedule (SOLAS LSA Code IV/4.6, VI/6.1)', fields: { 'Certified capacity (persons)': 'capacity', ...tagF } },
    },
  },
  'tote-tank': {
    svg: svg('0 0 130 130', R(15, 15, 100, 100) + P('M15 15l100 100', THIN) + R(30, 30, 70, 70, 'rx="14"') + P('M30 104h20M80 104h20', 'stroke-width="5"')),
    e: {
      standard: LAY + ' / P&ID (temporary chemical supply)',
      drawn: 'Layout: a near-square frame with the tank outline inside, in the chemical laydown; on P&IDs a small vessel or "tote" box with a hose connection to the chemical injection skid suction.',
      tags: ['T', 'TT', 'IBC'],
      notes: 'A permanent chemical tank is part of the chemical-injection-skid. Totes are temporary, hose-connected supplies.',
      datasheet: { form: 'Portable tank certificate (DNV 2.7-1 / EN 12079-1)', fields: { Capacity: 'volume', 'Lifting set': 'liftingSet', ...tagF } },
    },
  },
  'davit-crane': {
    svg: svg('0 0 140 140', P('M40 132V40a24 24 0 0 1 24-24h50') + P('M114 16v34') + P('M108 50h12M114 50c0 10-10 10-10 4', THIN) + P('M28 132h24') + P('M40 70l22-50', THIN)),
    e: {
      standard: LAY,
      drawn: 'Elevation: a post curving into a short jib with a hook; in plan, a small circle with a short reach radius (dashed) over the item it serves, labelled with SWL.',
      tags: ['DV', 'DAV', 'CR'],
      notes: 'Small reach circle (a few metres) versus the large reach of a pedestal crane. Not on P&IDs.',
      datasheet: { form: 'Davit datasheet (EN 13852-1 / EN 13157)', fields: { 'Outreach': 'reach', 'Height under hook': 'height', 'Safe working load': 'swl', ...tagF } },
    },
  },
  'gas-cylinder-quad': {
    svg: svg('0 0 130 130', R(10, 10, 110, 110) + [32, 54, 76, 98].flatMap((x) => [32, 54, 76, 98].map((y) => C(x, y, 9))).join('')),
    e: {
      standard: LAY + ' / P&ID (bottle rack)',
      drawn: 'Layout: a square frame filled with small circles (the cylinders). On P&IDs a bottle rack is drawn as one or more small capsules joined to a manifold with a regulator (PCV) on the outlet.',
      tags: ['X', 'N2', 'QD'],
      notes: 'Nitrogen back-up racks and calibration gas bottles use the same drawing; read the gas. A nitrogen generator package is a separate item.',
      datasheet: { form: 'Cylinder bundle certificate (EN 12079-1 / ISO 10961)', fields: { 'Number of cylinders': 'count', Gas: 'gas', 'Lifting set': 'liftingSet', ...tagF } },
    },
  },
}
