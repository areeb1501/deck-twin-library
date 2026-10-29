// SVG helpers for P&ID symbols (match seed style).
export const svg = (vb: string, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none" stroke="#111" stroke-width="2.5" stroke-linejoin="round">${inner}</svg>`
export const T = (x: number, y: number, s: string, size = 14, w = 'bold') =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${w}" text-anchor="middle" fill="#111" stroke="none">${s}</text>`
export const P = (d: string, extra = '') => `<path d="${d}"${extra ? ' ' + extra : ''}/>`
export const C = (cx: number, cy: number, r: number, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${extra ? ' ' + extra : ''}/>`
export const R = (x: number, y: number, w: number, h: number, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${extra ? ' ' + extra : ''}/>`
export const FILL = 'fill="#111"'
export const WHITE = 'fill="#fff"'
export const DASH = 'stroke-dasharray="6 4"'
export const DASHDOT = 'stroke-dasharray="12 4 2 4"'
export const THIN = 'stroke-width="1.6"'
/** ISA field bubble: plain circle with letters */
export const bubble = (cx: number, cy: number, s: string, r = 18) =>
  C(cx, cy, r, WHITE) + T(cx, cy + (s.length > 3 ? 4 : 5), s, s.length > 3 ? 10.5 : s.length > 2 ? 12 : 14)
/** bow-tie valve body centred at (cx, cy), half-length a, half-height b, horizontal */
export const bowtie = (cx: number, cy: number, a = 30, b = 16, extra = '') =>
  P(`M${cx - a} ${cy - b}v${2 * b}L${cx} ${cy}zM${cx + a} ${cy - b}v${2 * b}L${cx} ${cy}z`, extra)
/** vertical bow-tie */
export const bowtieV = (cx: number, cy: number, a = 14, b = 8, extra = '') =>
  P(`M${cx - b} ${cy - a}h${2 * b}L${cx} ${cy}zM${cx - b} ${cy + a}h${2 * b}L${cx} ${cy}z`, extra)
/** handwheel stem with T */
export const wheel = (cx: number, cy: number, top = 22) => P(`M${cx} ${cy}V${top}M${cx - 12} ${top}h24`)
/** standard inline valve frame: stubs on y=50, body 30..90 */
export const stubs = (y = 50, x0 = 4, x1 = 30, x2 = 90, x3 = 116) => P(`M${x0} ${y}h${x1 - x0}M${x2} ${y}h${x3 - x2}`)
