// Shared SVG helpers for the Deck Twin P&ID symbol library generator (lives outside the repo on purpose).
const F = 'font-family="Arial, Helvetica, sans-serif"'
const B = 'fill="#111"'
const W = 'fill="#fff"'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none" stroke="#111" stroke-width="2.5" stroke-linejoin="round">${body}</svg>`
const p = (d, a = '') => `<path d="${d}"${a ? ' ' + a : ''}/>`
const c = (cx, cy, r, a = '') => `<circle cx="${cx}" cy="${cy}" r="${r}"${a ? ' ' + a : ''}/>`
const r = (x, y, w, h, a = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${a ? ' ' + a : ''}/>`
const e = (cx, cy, rx, ry, a = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${a ? ' ' + a : ''}/>`
const t = (x, y, size, txt, o = {}) =>
  `<text x="${x}" y="${y}" ${F} font-size="${size}" font-weight="${o.w || 'bold'}" text-anchor="${o.a || 'middle'}" fill="#111" stroke="none">${esc(txt)}</text>`
const thin = (sw = 1.6) => `stroke-width="${sw}"`
const dash = (pat = '6 4') => `stroke-dasharray="${pat}"`

// valve body: two triangles tip to tip, centred on (cx, cy)
function bow(cx, cy, o = {}) {
  const w = o.w ?? 30, h = o.h ?? 16
  const L = o.fl ? B : o.wl ? W : ''
  const R = o.fr ? B : o.wr ? W : ''
  return p(`M${cx - w} ${cy - h}v${2 * h}L${cx} ${cy}z`, L) + p(`M${cx + w} ${cy - h}v${2 * h}L${cx} ${cy}z`, R)
}
// pipe stubs either side of a bow-tie
const stubs = (cx, cy, w = 30, x0 = 4, x1 = 116) => p(`M${x0} ${cy}H${cx - w}M${cx + w} ${cy}H${x1}`)
// in-line valve on a 120-wide canvas
const valve = (cy, o = {}) => stubs(60, cy, o.w ?? 30) + bow(60, cy, o)
// stem from body centre up to y, with optional handwheel bar
const stem = (cx, cy, top, wheel = false) => p(`M${cx} ${cy}V${top}` + (wheel ? `M${cx - 12} ${top}h24` : ''))
// diaphragm dome actuator sitting on y (dome above)
const dome = (cx, y, rr = 22) => p(`M${cx - rr} ${y}h${2 * rr}a${rr} ${rr} 0 0 0-${2 * rr} 0z`)
// flow arrow (open head) along a line
const arrow = (x0, y, x1, sw = 1.8) => p(`M${x0} ${y}H${x1}M${x1 - 8} ${y - 6}l8 6-8 6`, thin(sw))
const farrow = (x, y, dir = 1, s = 9) => p(`M${x} ${y}l${-dir * s * 1.6} ${-s * 0.75}v${s * 1.5}z`, B)

// ISA 5.1 bubble. shape: circle | dcs | plc | computer. loc: field | primary | aux | behind
function bubble(cx, cy, o = {}) {
  const R = o.r ?? 20, shape = o.shape || 'circle', loc = o.loc || 'field'
  let s = ''
  let half = R
  if (shape === 'circle') s += c(cx, cy, R, W)
  if (shape === 'dcs') s += r(cx - R, cy - R, 2 * R, 2 * R, W) + c(cx, cy, R)
  if (shape === 'plc') s += r(cx - R, cy - R, 2 * R, 2 * R, W) + p(`M${cx} ${cy - R}L${cx + R} ${cy}L${cx} ${cy + R}L${cx - R} ${cy}z`)
  if (shape === 'computer') {
    half = R * 1.15
    s += p(`M${cx - half} ${cy}L${cx - R * 0.58} ${cy - R}H${cx + R * 0.58}L${cx + half} ${cy}L${cx + R * 0.58} ${cy + R}H${cx - R * 0.58}z`, W)
  }
  if (loc === 'primary') s += p(`M${cx - half} ${cy}H${cx + half}`)
  if (loc === 'aux') s += p(`M${cx - half} ${cy - 2.5}H${cx + half}M${cx - half} ${cy + 2.5}H${cx + half}`, thin(1.8))
  if (loc === 'behind') s += p(`M${cx - half} ${cy}H${cx + half}`, dash('4 3'))
  const fs = o.fs ?? (o.top && o.top.length > 3 ? 11 : 13)
  if (loc !== 'field' && o.top) {
    s += t(cx, cy - 5, fs - 1, o.top)
    if (o.bot) s += t(cx, cy + 15, 10, o.bot, { w: 'normal' })
  } else if (o.top) {
    if (o.bot) { s += t(cx, cy - 2, fs, o.top) + t(cx, cy + 12, 10, o.bot, { w: 'normal' }) }
    else s += t(cx, cy + fs * 0.36, fs, o.top)
  }
  return s
}

// horizontal line sample, 200 x 40
const lineSample = (body) => svg(200, 40, body)

const defs = []
const cats = []
function cat(id, title) { cats.push({ id, title }) }
function S(o) { defs.push(o) }

module.exports = { F, B, W, esc, svg, p, c, r, e, t, thin, dash, bow, stubs, valve, stem, dome, arrow, farrow, bubble, lineSample, defs, cats, cat, S }
