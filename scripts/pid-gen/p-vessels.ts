import { svg, T, P, C, R, FILL, WHITE, THIN, DASH } from './h.ts'
const ISO = 'ISO 10628-2 / PIP PIC001'
const tagF = { 'Tag number': 'tag' }
export default {
  'horizontal-separator': {
    e: {
      standard: ISO,
      drawn: 'Horizontal capsule (rectangle with semi-elliptical ends). A 3-phase separator shows a weir plate inside and a water boot below; a 2-phase separator a mesh pad at the gas outlet; a KO drum is plain.',
      tags: ['V', 'D', 'VA', 'VD'],
      notes: 'Vertical capsule = vertical-separator. Long capsule with closure door at one end = pig-launcher. A horizontal capsule with filter elements and a lower sump barrel = filter-separator.',
      datasheet: { form: 'Pressure vessel datasheet (ASME VIII-1; API 12J)', fields: { Service: 'service', 'Inside diameter': 'diameter', 'Length T/T': 'length', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Inlet nozzle size': 'inletNps', 'Gas outlet size': 'gasNps', 'Liquid outlet size': 'liquidNps', Insulation: 'insulated', ...tagF } },
    },
  },
  'vertical-separator': {
    svg: svg('0 0 120 170', P('M30 34a30 20 0 0 1 60 0v100a30 20 0 0 1-60 0z') + P('M30 44l6 8 6-8 6 8 6-8 6 8 6-8 6 8 6-8 6 8 6-8', THIN) + P('M30 36h60M30 52h60', THIN) + P('M60 14V2M60 154v14M4 96h26')),
    e: {
      standard: ISO,
      drawn: 'Vertical capsule (tall rectangle with elliptical heads) with a mesh pad or vane pack drawn as a hatched band near the top, gas outlet at the top, inlet on the side and liquid outlet at the bottom; scrubbers are tall and slim.',
      tags: ['V', 'D', 'VG', 'VD'],
      notes: 'A taller capsule with trays or packing is a column; one with cartridges and a tube sheet is a cartridge filter. Scrubbers, KO drums and inlet separators all use this symbol: the internals and service decide.',
      datasheet: { form: 'Pressure vessel datasheet (ASME VIII-1; API 12J)', fields: { Support: 'support', 'Inside diameter': 'diameter', 'Height T/T': 'height', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Inlet nozzle size': 'inletNps', 'Gas outlet size': 'gasNps', 'Liquid outlet size': 'liquidNps', Insulation: 'insulated', ...tagF } },
    },
  },
  column: {
    svg: svg('0 0 110 210', P('M30 30a25 16 0 0 1 50 0v150a25 16 0 0 1-50 0z') + [44, 60, 76, 92, 108, 124, 140, 156, 172].map((y, i) => P(i % 2 ? `M80 ${y}h-36` : `M30 ${y}h36`)).join('') + P('M55 14V2M55 196v12M4 120h26M106 46H80')),
    e: {
      standard: ISO,
      drawn: 'Tall vertical capsule with trays drawn as short horizontal lines alternating from the left and right walls (segmental trays), or a section with crossed diagonals for packing; overhead at the top, bottoms at the bottom, feed and reflux on the side.',
      tags: ['T', 'C', 'V'],
      notes: 'Alternating tray lines or an X-crossed packed bed = column (TEG contactor, absorber, stabiliser). A shorter vessel with only a mesh pad is a vertical-separator.',
      datasheet: { form: 'Column / tower datasheet (ASME VIII-1; tray or packing sheet)', fields: { Internals: 'internals', 'Inside diameter': 'diameter', 'Height T/T': 'height', 'Number of sections': 'sections', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Feed nozzle size': 'feedNps', 'Overhead nozzle size': 'overheadNps', 'Bottoms nozzle size': 'bottomsNps', 'Reflux nozzle size': 'refluxNps', Insulation: 'insulated', ...tagF } },
    },
  },
  'filter-separator': {
    svg: svg('0 0 200 120', P('M26 20h134a16 20 0 0 1 0 40H26z') + P('M22 16v48', 'stroke-width="6"') + [40, 52, 64, 76, 88].map((x) => P(`M${x} 28v24`, DASH + ' ' + THIN)).join('') + P('M100 20v40') + P('M130 24l6 8-6 8 6 8-6 8', THIN) + P('M70 92h70a8 8 0 0 1 0 16H70a8 8 0 0 1 0-16z') + P('M80 60v32M150 60v32') + P('M40 20V4M150 20V4M110 108v10')),
    e: {
      standard: ISO,
      drawn: 'Horizontal vessel with filter elements (dashed vertical lines) in the first section, a vane or mesh pack in the second, a smaller liquid sump barrel below joined by downcomers, and a quick-opening closure (thick bar) at the filter end.',
      tags: ['V', 'F', 'S'],
      notes: 'The second barrel underneath and the filter elements distinguish it from a horizontal separator. A vertical housing with cartridges is a cartridge-filter.',
      datasheet: { form: 'Filter-separator datasheet (ASME VIII-1; API 12J)', fields: { 'Inside diameter': 'diameter', 'Length T/T': 'length', 'Sump diameter': 'sumpDiameter', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', 'Drain size': 'drainNps', Insulation: 'insulated', ...tagF } },
    },
  },
  'cartridge-filter': {
    svg: svg('0 0 120 170', P('M30 30h60v90a30 18 0 0 1-60 0z') + P('M24 26h72', 'stroke-width="5"') + P('M30 96h60') + [42, 54, 66, 78].map((x) => P(`M${x} 40v52`, DASH + ' ' + THIN)).join('') + P('M4 108h26M90 60h26M60 138v14') + P('M34 124l-6 44M86 124l6 44')),
    e: {
      standard: ISO + ' (filter: vessel with a dashed filter medium line)',
      drawn: 'Vertical housing on legs with a tube sheet line and the cartridges as dashed lines (or a single dashed line across for the filter medium), a quick-opening or bolted closure at the top, and a PDI / PDT across inlet and outlet.',
      tags: ['F', 'FS', 'V'],
      isa: ['PDI', 'PDT'],
      notes: 'ISO and PIP draw any filter as a vessel crossed by a dashed line; coalescers add "COALESCER". A horizontal vessel with a sump barrel is a filter-separator; a Y in the line is a y-strainer.',
      datasheet: { form: 'Filter / coalescer datasheet (ASME VIII-1)', fields: { 'Closure type': 'closure', 'Inside diameter': 'diameter', 'Height T/T': 'height', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', ...tagF } },
    },
  },
  'storage-tank': {
    svg: svg('0 0 170 140', P('M20 40l65-20 65 20v90H20z') + P('M20 40h130', THIN) + P('M120 28V8h46M4 112h16M150 120h16M85 130v8') + P('M10 130h150')),
    e: {
      standard: ISO,
      drawn: 'Flat-bottomed vertical rectangle on grade with a shallow cone (triangle) or dome roof, inlet near the top, outlet near the bottom; floating-roof tanks show the roof as a line inside the shell. Breather / PVRV and emergency vents sit on the roof.',
      tags: ['T', 'TK'],
      notes: 'Flat bottom on grade = atmospheric tank (API 650); a capsule with elliptical heads = pressure vessel. A circle on legs is a sphere.',
      datasheet: { form: 'API 650 storage tank datasheet', fields: { 'Roof type': 'roof', Diameter: 'diameter', 'Shell height': 'height', 'Specific gravity': 'gravity', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', 'Drain size': 'drainNps', ...tagF } },
    },
  },
  'spherical-tank': {
    svg: svg('0 0 160 150', C(80, 60, 50) + P('M30 60v86M130 60v86M52 101v45M108 101v45') + P('M20 146h120') + P('M80 10V0M80 110v16h30')),
    e: {
      standard: ISO,
      drawn: 'A circle standing on legs that touch it at the equator, with top and bottom nozzles; often with a water-spray (deluge) ring drawn around it.',
      tags: ['T', 'TK', 'V'],
      notes: 'Circle on legs = sphere. A circle on its own in a line could be a pump or an instrument bubble: check for legs and size.',
      datasheet: { form: 'Pressure storage datasheet (ASME VIII-1 / API 2510)', fields: { Diameter: 'diameter', 'Design pressure': 'pressure', 'Flange rating': 'rating', 'Number of legs': 'legs', 'Inlet nozzle size': 'inletNps', 'Outlet nozzle size': 'outletNps', 'Leg fireproofing': 'fireproofing', 'Deluge ring': 'deluge', ...tagF } },
    },
  },
}
