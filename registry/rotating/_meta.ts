import { defineMeta } from '../meta'

export default defineMeta([
  {
    name: 'centrifugal-pump',
    title: 'Centrifugal pump (API 610 OH2)',
    file: 'centrifugal-pump.tsx',
    export: 'CentrifugalPump',
    description: 'Overhung, centreline-mounted end-suction pump with volute casing, bearing housing, spacer coupling under a mesh guard and a TEFC motor on a drain-rim baseplate. Includes an API Plan 53A seal reservoir and a local control station. Motor frame from IEC 60072 for the rated power.',
    standards: ['API 610 (OH2)', 'API 682 Plan 53A', 'IEC 60034 / 60072', 'ASME B16.5'],
    vendors: ['Flowserve', 'Sulzer', 'KSB', 'Ruhrpumpen', 'Baker Hughes', 'ITT Goulds'],
    tags: ['pump', 'export pump', 'transfer', 'rotating'],
    anchor: 'base',
    params: [
      { key: 'suctionNps', label: 'Suction', type: 'nps', min: 2, max: 16 },
      { key: 'dischargeNps', label: 'Discharge', type: 'nps', min: 1.5, max: 12 },
      { key: 'rating', label: 'Class', type: 'rating' },
      { key: 'kw', label: 'Motor power', type: 'number', min: 5, max: 1500, step: 5, unit: 'kW' },
      { key: 'stages', label: 'Stages', type: 'number', min: 1, max: 4, step: 1 },
      { key: 'baseLength', label: 'Baseplate length', type: 'number', min: 1.6, max: 5, step: 0.1, unit: 'm' },
      { key: 'baseWidth', label: 'Baseplate width', type: 'number', min: 0.7, max: 2, step: 0.05, unit: 'm' },
      { key: 'running', label: 'Running', type: 'bool' },
      { key: 'tag', label: 'Tag', type: 'text' },
    ],
    preview: { tag: 'P-101A' },
  },
])
