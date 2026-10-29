import { svg, P, C, THIN } from './h.ts'
const LAY = 'Layout plan convention (structural elevations, plot plans)'
const wave = (x0: number, y: number, n: number, w = 20) => P(`M${x0} ${y}` + Array.from({ length: n }, () => `c${w / 4}-5 ${w / 4 * 3}-5 ${w} 0`).join(''), THIN)
export default {
  ocean: {
    svg: svg('0 0 140 100', P('M58 16h24l-12 18z') + P('M30 40h80') + wave(10, 56, 6) + wave(10, 72, 6) + wave(10, 88, 6)),
    e: {
      standard: LAY + '; metocean design basis',
      drawn: 'Elevation: the mean sea level (MSL) or LAT line marked with an inverted triangle and its elevation (EL +0.000), with wave lines below it; jacket and riser drawings dimension the air gap and water depth from it.',
      notes: 'Not on P&IDs. Metocean data (significant wave height, wind speed) comes from the project design basis.',
      datasheet: { form: 'Metocean design basis', fields: { 'Significant wave height (Hs)': 'waveHeight', 'Wind speed (10 m)': 'wind' } },
    },
  },
  sky: {
    svg: svg('0 0 120 100', C(60, 50, 16) + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r = (a * Math.PI) / 180
      const c = Math.cos(r)
      const s = Math.sin(r)
      return P(`M${(60 + c * 24).toFixed(1)} ${(50 + s * 24).toFixed(1)}L${(60 + c * 34).toFixed(1)} ${(50 + s * 34).toFixed(1)}`)
    }).join('')),
    e: {
      standard: 'Not drawn',
      drawn: 'Not drawn on P&IDs or layouts. Plot plans only carry a north arrow; sun path or lighting studies are separate reports.',
      notes: 'Scene lighting for the 3D model, not plant equipment.',
    },
  },
}
