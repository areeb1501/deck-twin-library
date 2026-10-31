// Piping fittings and specials, line types, connectors and annotations.
const { B, W, svg, p, c, r, t, thin, dash, bow, arrow, farrow, lineSample, cat, S } = require('./lib.cjs')

const STD_F = 'ISO 10628-2 (groups 24-25, fittings and piping) / PIP PIC001'
const STD_L = 'ISA 5.1-2009/2022 (instrument line symbols)'
const STD_P = 'ISO 10628-2 (group 25) / PIP PIC001 (line conventions)'
const STD_K = 'PIP PIC001 / ISO 10628-1 (diagram rules) / company legend practice'

cat('fittings', 'Piping fittings and specials')
cat('lines', 'Lines and signals')
cat('connectors', 'Connectors, boundaries and annotations')

// ---------- fittings ----------
S({ id: 'reducer-concentric', name: 'Concentric reducer', cat: 'fittings', std: STD_F, component: 'reducer', physical: true, tags: [],
  drawn: 'A symmetric trapezoid in the line: tall at the large end and short at the small end, with both pipe centrelines in line.',
  meaning: 'Size change on vertical lines, or where the centreline must stay put. The sizes are written beside it (e.g. 8"x6"). In plant.json the assembler inserts reducers automatically when port sizes differ.',
  variants: ['Some legends use a plain triangle', 'Swages (small bore, threaded or socket-weld) are drawn the same'],
  svg: svg(120, 60, p('M4 30H40M88 30H116') + p('M40 14v32l48-10V24z')) })

S({ id: 'reducer-eccentric-fot', name: 'Eccentric reducer, flat on top (FOT)', cat: 'fittings', std: STD_F, component: 'reducer', physical: true, tags: [],
  drawn: 'A trapezoid with a flat top edge and a sloped bottom edge, so the two pipe centrelines are offset. Often marked "FOT".',
  meaning: 'Eccentric reducer with the flat side up. Standard on pump suctions so no vapour pocket can form. Sizes are written beside it.',
  variants: ['The flat side may be marked only by the text FOT, with a concentric-looking symbol'],
  svg: svg(120, 70, p('M4 30H40M88 23H116') + p('M40 14v32l48-14V14z') + t(64, 64, 11, 'FOT')) })

S({ id: 'reducer-eccentric-fob', name: 'Eccentric reducer, flat on bottom (FOB)', cat: 'fittings', std: STD_F, component: 'reducer', physical: true, tags: [],
  drawn: 'A trapezoid with a flat bottom edge and a sloped top, centrelines offset. Often marked "FOB".',
  meaning: 'Eccentric reducer with the flat side down. Used on pipe racks to keep the bottom of pipe level, and on lines that must drain.',
  variants: ['Marked only by the text FOB on some legends'],
  svg: svg(120, 70, p('M4 30H40M88 37H116') + p('M40 14v32h48V28z') + t(64, 64, 11, 'FOB')) })

const flanges = (x1, x2, y = 70, h = 20) => p(`M${x1} ${y - h}V${y + h}M${x2} ${y - h}V${y + h}`)
S({ id: 'spectacle-blind-open', name: 'Spectacle blind, open (spacer in line)', cat: 'fittings', std: STD_F + ' / ASME B16.48', component: 'spectacle-blind', physical: true, tags: ['SB'],
  drawn: 'A figure-8 between two flange bars: the open ring sits on the pipe, and the solid (filled) blank sits off the line.',
  meaning: 'Spectacle blind in the open position: flow passes through the ring. It is turned to the closed position for positive isolation during maintenance. Maps to the spectacle-blind component.',
  variants: ['Some legends write "NO" (normally open) beside it', 'Spectacle blinds in plant isolations are often marked NO / NC', 'The offset form (figure-8 beside the flange pair on a short stem) means the same thing: see spectacle-blind-offset'],
  svg: svg(140, 100, p('M4 70H136') + flanges(60, 80) + c(70, 70, 11, W) + p('M4 70H59M81 70H136') + p('M70 59V38') + c(70, 26, 12, B)) })

S({ id: 'spectacle-blind-closed', name: 'Spectacle blind, closed (blank in line)', cat: 'fittings', std: STD_F + ' / ASME B16.48', component: 'spectacle-blind', physical: true, tags: ['SB'],
  drawn: 'A figure-8 between two flange bars: the solid (filled) blank sits on the pipe, and the open ring is off the line.',
  meaning: 'Spectacle blind in the closed position: positive isolation, nothing passes. Typical on spare connections, start-up lines and vessel isolations.',
  variants: ['Some legends write "NC" beside it', 'A filled circle without a ring is a spade (line blank)', 'The offset form (figure-8 beside the flange pair on a short stem) means the same thing: see spectacle-blind-offset'],
  svg: svg(140, 100, p('M4 70H60M80 70H136') + flanges(60, 80) + c(70, 70, 11, B) + p('M70 59V38') + c(70, 26, 12)) })

S({ id: 'spectacle-blind-offset', name: 'Spectacle blind, offset figure-8 (drawn beside the flanges)', cat: 'fittings', std: STD_F + ' / ASME B16.48', component: 'spectacle-blind', physical: true, tags: ['SB'],
  drawn: 'A flange pair (two short bars) on the line, with a figure-8 drawn off to one side and joined to the flanges by a short stem. The circle next to the stem is the half installed in the line; the far circle is the spare half. The blank half may be filled, hatched or drawn as concentric circles; the ring half is a plain open circle.',
  meaning: 'Spectacle blind between the flanges, drawn beside the line so the pipe stays unbroken. Open ring next to the stem = open (NO); blank next to the stem = closed (NC). The line size (e.g. 4") is usually written beside it. Maps to the spectacle-blind component with state set from the half next to the stem.',
  variants: ['Some legends draw both halves as plain circles and write NO / NC beside it', 'Look-alike: a plain flange pair has no figure-8; do not drop the blind', 'Look-alike: a single open circle on a stem at a flange pair is a spacer ring; a single solid paddle is a spade'],
  svg: svg(150, 120, p('M110 4V116') + p('M92 52H128M92 68H128') + c(68, 60, 9) + p('M77 60H92') + c(38, 60, 13) + c(38, 60, 8) + c(38, 60, 3)) })

S({ id: 'spade', name: 'Spade (line blank)', cat: 'fittings', std: STD_F + ' / ASME B16.48', physical: true, tags: [],
  drawn: 'A single solid blank between two flange bars with a short handle tab sticking out, and no ring.',
  meaning: 'Removable paddle blank: positive isolation for large sizes, where a spectacle blind would be too heavy. No dedicated component; spectacle-blind is the closest.',
  variants: ['Often drawn the same as a closed spectacle blind and labelled "SPADE"'],
  svg: svg(140, 100, p('M4 70H60M80 70H136') + flanges(60, 80) + c(70, 70, 11, B) + p('M70 59V40') + r(64, 28, 12, 12)) })

S({ id: 'spacer', name: 'Spacer (ring spacer)', cat: 'fittings', std: STD_F + ' / ASME B16.48', physical: true, tags: [],
  drawn: 'A single open ring between two flange bars with a short handle tab, and no blank.',
  meaning: 'The ring that is fitted in place of a spade when the line is in service. No dedicated component.',
  variants: ['Usually drawn together with a spade, one of them in the line'],
  svg: svg(140, 100, p('M4 70H136') + flanges(60, 80) + c(70, 70, 11, W) + p('M4 70H59M81 70H136') + p('M70 59V40') + r(64, 28, 12, 12)) })

S({ id: 'blind-flange', name: 'Blind flange', cat: 'fittings', std: STD_F + ' / ASME B16.5', component: 'blind-flange', physical: true, tags: [],
  drawn: 'The pipe ends at a flange bar followed by a thicker solid bar.',
  meaning: 'Bolted blind on the end of a line or a spare nozzle. Maps to the blind-flange component.',
  variants: ['Some legends draw two parallel bars with the outer one thicker', 'Look-alike: pipe cap (a small half-round at the end, welded)'],
  svg: svg(100, 60, p('M4 30H70') + p('M70 12V48') + r(75, 12, 7, 36, B)) })

S({ id: 'flange-pair', name: 'Flanged joint', cat: 'fittings', std: STD_F + ' / ASME B16.5', component: 'flanged-joint', physical: true, tags: [],
  drawn: 'Two short parallel bars across the pipe, close together.',
  meaning: 'Bolted flange connection, usually shown only where it matters: equipment nozzles, spool breaks, spec breaks and maintenance breaks. Maps to the flanged-joint component.',
  variants: ['A single bar is a flange face at an equipment nozzle', 'Look-alike: union has a shorter third bar in the middle', 'Look-alike: a flange pair with a figure-8 drawn beside it on a short stem is a spectacle blind (spectacle-blind-offset), not a plain joint'],
  svg: svg(120, 60, p('M4 30H56M64 30H116') + p('M56 14V46M64 14V46')) })

S({ id: 'pipe-cap', name: 'Pipe cap', cat: 'fittings', std: STD_F + ' / ASME B16.9', physical: true, tags: [],
  drawn: 'The pipe ends in a small half-round (a "D").',
  meaning: 'Welded or threaded cap closing a pipe end: dead legs, future connections, header ends. No dedicated component.',
  variants: ['Threaded plugs are drawn as a small filled triangle or square at the end', 'Look-alike: blind flange (bars, not a half-round)'],
  svg: svg(100, 60, p('M4 30H70') + p('M70 18V42a12 12 0 0 0 0-24')) })

S({ id: 'union', name: 'Union', cat: 'fittings', std: STD_F, physical: true, tags: [],
  drawn: 'Two short bars across the pipe with a shorter third bar between them.',
  meaning: 'Threaded union, used on small-bore lines (instrument air, chemical injection, tubing) to allow disconnection. No dedicated component.',
  variants: ['Legends differ: some show "||" with a small gap, others write "U"', 'Hammer (wing) unions on well-test and temporary lines map to the hammer-union component; threaded small-bore unions are part of small-bore-fitting work'],
  svg: svg(120, 60, p('M4 30H52M68 30H116') + p('M52 16V44M68 16V44') + p('M60 22V38')) })

S({ id: 'flexible-hose', component: 'flexible-hose', name: 'Flexible hose', cat: 'fittings', std: STD_F, physical: true, tags: ['FH'],
  drawn: 'A wavy line between two short end bars.',
  meaning: 'Flexible hose or hose assembly: loading hoses, temporary connections, vibrating equipment hook-ups, and HPU or chemical hoses. Maps to the flexible-hose component.',
  variants: ['Some legends draw a loop or a zig-zag', 'Bunkering and loading hoses may carry a breakaway coupling mark'],
  svg: svg(120, 60, p('M4 30H28M100 30H116') + p('M28 18V42M100 18V42') + p('M28 30c6-12 18-12 24 0s18 12 24 0 18-12 24 0')) })

S({ id: 'expansion-joint', component: 'expansion-joint', name: 'Expansion joint (bellows)', cat: 'fittings', std: STD_F, physical: true, tags: ['EJ'],
  drawn: 'A zig-zag bellows drawn above and below the pipe between two flange bars.',
  meaning: 'Metallic or rubber bellows that absorbs thermal movement or vibration: exhaust ducts, seawater pump discharges and flare headers. Maps to the expansion-joint component.',
  variants: ['Rubber expansion joints may be drawn as a bulged section'],
  svg: svg(120, 60, p('M4 30H36M84 30H116') + p('M36 12V48M84 12V48') + p('M36 20l6-6 6 6 6-6 6 6 6-6 6 6 6-6 6 6M36 40l6 6 6-6 6 6 6-6 6 6 6-6 6 6 6-6')) })

S({ id: 'strainer-y', name: 'Y-strainer', cat: 'fittings', std: STD_F, component: 'y-strainer', physical: true, tags: ['S', 'STR'],
  drawn: 'A leg slanting down from the pipe at about 45°, with a dashed screen line inside and a cap at its end.',
  meaning: 'Permanent in-line strainer protecting pumps, control valves and meters. Often has a DP gauge across it. Maps to the y-strainer component.',
  variants: ['Some legends draw a plain diagonal line with a dashed screen', 'A blow-off valve may be drawn on the cap'],
  svg: svg(120, 80, p('M4 30H116') + p('M50 30L72 64M64 30L86 64') + p('M68 68H90') + p('M57 32L79 64', dash('4 3') + ' ' + thin(1.6))) })

S({ id: 'strainer-basket', name: 'Basket (T-type) strainer', cat: 'fittings', std: STD_F, component: 'basket-strainer', physical: true, tags: ['S', 'STR'],
  drawn: 'A rectangle hanging below the line with a cover bar on top and a dashed U (the basket) inside.',
  meaning: 'Large-capacity strainer for pump suctions and seawater systems. Duplex units have two baskets and a changeover. T-type strainers are drawn the same way. Maps to the basket-strainer component.',
  variants: ['Duplex: two baskets side by side with a 3-way changeover valve', 'Some legends draw a circle with a dashed screen'],
  svg: svg(120, 80, p('M4 22H40M80 22H116') + p('M36 14H84') + p('M40 14V68H80V14') + p('M48 22V58H72V22', dash('4 3') + ' ' + thin(1.6))) })

S({ id: 'strainer-temporary', name: 'Temporary (cone) strainer', cat: 'fittings', std: STD_F, physical: true, tags: ['TS'],
  drawn: 'A dashed cone (triangle) pointing downstream inside the pipe, just downstream of a flange pair.',
  meaning: 'Start-up strainer fitted between flanges for commissioning and removed afterwards. Usually marked "temporary" or "TS". No dedicated component; normally not modelled.',
  variants: ['Some legends use a dashed rectangle', 'Witch-hat strainers point the cone upstream'],
  svg: svg(120, 60, p('M4 30H116') + p('M38 14V46M46 14V46') + p('M46 16L92 30L46 44', dash('5 3') + ' ' + thin(1.8))) })

S({ id: 'steam-trap', component: 'steam-trap', name: 'Steam trap', cat: 'fittings', std: STD_F, physical: true, tags: ['ST', 'TR'],
  drawn: 'A small circle on the line with "T" inside.',
  meaning: 'Lets condensate out of a steam line or tracer while holding steam back. Seen at the end of steam tracers and on steam-line drip legs. Maps to the steam-trap component.',
  variants: ['ISO-style legends draw a square on its corner with a filled dot', 'Some write "ST" next to a small square'],
  svg: svg(120, 60, p('M4 30H46M74 30H116') + c(60, 30, 14) + t(60, 35, 14, 'T')) })

S({ id: 'sight-glass', component: 'sight-glass', name: 'Sight glass (sight flow indicator)', cat: 'fittings', std: STD_F, physical: true, tags: ['SG', 'FG'], isa: ['FG'],
  drawn: 'Two concentric circles on the line (a viewing window).',
  meaning: 'In-line window to see that liquid is flowing: pump seal flush, lube oil, chemical injection. ISA calls it FG (flow glass). Maps to the sight-glass component.',
  variants: ['Some legends draw a circle with two short vertical bars', 'ISA style: a bubble with FG', 'A level gauge glass on a vessel is LG, not this'],
  svg: svg(120, 60, p('M4 30H44M76 30H116') + c(60, 30, 16) + c(60, 30, 8)) })

S({ id: 'restriction-orifice', component: 'restriction-orifice', name: 'Restriction orifice', cat: 'fittings', std: STD_F + ' / ISA 5.1 (FO)', physical: true, tags: ['RO', 'FO'], isa: ['FO', 'RO'],
  drawn: 'An orifice plate between two flange bars (a bar across the pipe with a gap in the middle), labelled "RO" or with an FO bubble.',
  meaning: 'Fixed plate that limits flow: after blowdown valves, on minimum-flow lines and on purge connections. It is not a meter, so there are no dp taps. Maps to the restriction-orifice component.',
  variants: ['Multi-stage ROs are drawn as several plates in series', 'Look-alike: orifice flow element (FE) has dp tap lines to a transmitter'],
  svg: svg(120, 72, p('M4 30H116') + p('M52 12V48M68 12V48') + p('M60 14V26M60 34V46', thin(3)) + t(60, 66, 12, 'RO')) })

S({ id: 'insulating-joint', component: 'insulating-joint', name: 'Insulating joint (monolithic)', cat: 'fittings', std: STD_F + ' / ISO 15589-1 (cathodic protection)', physical: true, tags: ['IJ'],
  drawn: 'A short rectangle on the line with diagonal hatching inside, sometimes labelled "IJ".',
  meaning: 'Electrically isolates a pipeline (cathodic protection) from the plant. Seen on risers, export lines and at battery limits. Maps to the insulating-joint component.',
  variants: ['Insulating flange kits: a flange pair with a thick bar between them', 'Some legends draw two flange bars with a small gap'],
  svg: svg(120, 60, p('M4 30H44M76 30H116') + r(44, 18, 32, 24) + p('M48 42l16-24M60 42l16-24M44 30l8-12', thin(1.6))) })

S({ id: 'drain-funnel', component: 'drain-hub', name: 'Drain funnel (tundish)', cat: 'fittings', std: STD_F, physical: true, tags: ['OD', 'TD'],
  drawn: 'A drain line ending in the open, just above a V-shaped funnel that leads down to the open drain.',
  meaning: 'Open drain hub with a visible air break. It collects hydrocarbon-free or open drains into the open-drain system. Maps to the drain-hub component.',
  variants: ['Some legends draw a cup or a small triangle', 'Hazardous open drains must be sealed; look for a seal loop or a P-trap under it'],
  svg: svg(100, 90, p('M50 4V28') + p('M30 38L46 56H54L70 38') + p('M50 56V86')) })

S({ id: 'hose-connection', component: 'utility-station', name: 'Hose connection', cat: 'fittings', std: STD_F, physical: true, tags: ['HC', 'UC'],
  drawn: 'A small isolation valve on a branch that ends in a coupling (a short block with ridges), often marked "HC".',
  meaning: 'Utility hose connection (utility station: air, nitrogen, water or steam) or a flushing / steam-out connection. A utility station (several hose drops on one post) maps to the utility-station component; a lone hose connection is listed, not modelled.',
  variants: ['Quick-connect couplings may be drawn as a small triangle', 'Utility stations are often one symbol with a list of services'],
  svg: svg(120, 60, p('M4 30H30') + bow(44, 30, { w: 14, h: 9 }) + p('M58 30H72') + p('M72 22v16l14-3V25z') + p('M92 24v12M98 24v12', thin(1.6)) + t(98, 54, 11, 'HC')) })

S({ id: 'vent-capped', name: 'Vent with cap', cat: 'fittings', std: STD_F, physical: true, tags: ['VT'],
  drawn: 'A short branch rising from the line with a small isolation valve and a cap (half-round) on top.',
  meaning: 'High-point vent for hydrotest and commissioning: valve plus cap or blind. Usually ¾" and not modelled.',
  variants: ['The end may carry a blind flange or a plug instead of a cap', 'Vents to atmosphere on hydrocarbon lines need a cap or plug, so check the line class'],
  svg: svg(100, 90, p('M4 80H96') + p('M50 80V56') + p('M42 32h16l-8 12zM42 56h16l-8-12z') + p('M50 32V20') + p('M40 20a10 10 0 0 1 20 0z')) })

S({ id: 'drain-plugged', name: 'Drain with plug', cat: 'fittings', std: STD_F, physical: true, tags: ['DR'],
  drawn: 'A short branch going down from the line with a small isolation valve and a solid plug (filled square) at the end.',
  meaning: 'Low-point drain for hydrotest and maintenance: valve plus plug. Usually ¾" and not modelled.',
  variants: ['Drains to the closed drain system are drawn connected to the CD header instead'],
  svg: svg(100, 90, p('M4 10H96') + p('M50 10V34') + p('M42 34h16l-8 12zM42 58h16l-8-12z') + p('M50 58V70') + r(43, 70, 14, 10, B)) })

S({ id: 'sample-point', name: 'Sample connection', cat: 'fittings', std: STD_F + ' / ISA 5.1', physical: true, tags: ['SC', 'SP'], isa: ['AX', 'SP'],
  drawn: 'A small branch from the line with a needle or isolation valve, ending in an open end over a small bottle; sometimes a box labelled "SC" or a sample cooler.',
  meaning: 'Manual sample point for lab analysis (oil-in-water, BS&W, H2S, glycol). Closed-loop samplers return to the process. Listed, not modelled.',
  variants: ['ISA style: a bubble with AX or SP', 'Closed sample systems are drawn as a box with in and return lines'],
  svg: svg(100, 100, p('M4 10H96') + p('M50 10V30') + p('M43 30h14l-7 10zM43 50h14l-7-10z') + p('M50 50V64') + p('M40 70h20v24H40zM44 70v-4h12v4')) })

S({ id: 'spec-break', name: 'Piping specification break', cat: 'fittings', std: STD_P, physical: false, tags: [],
  drawn: 'A short bar across the line with the two piping class codes written on either side of it (e.g. A1A | D6A).',
  meaning: 'Where the piping class (material and pressure rating) changes, usually at a valve or a flange. Not a physical item, but it gives the rating on each side. Use it for each line\'s spec.',
  variants: ['Some legends use a small diamond or a "Z" across the line', 'Often sits right next to the last valve rated for the higher class'],
  svg: svg(120, 56, p('M4 36H116') + p('M60 22V50', thin(3)) + t(34, 22, 11, 'A1A') + t(86, 22, 11, 'D6A')) })

S({ id: 'mark-insulation', name: 'Insulation mark', cat: 'fittings', std: STD_P, physical: false, tags: [],
  drawn: 'A process line with thin dashed lines running parallel above and below it over the insulated length.',
  meaning: 'The line is insulated (heat conservation, personnel protection or cold). Most drawings show it only as the insulation code at the end of the line number, e.g. "-H" or "-PP". Set the line as insulated.',
  variants: ['Insulation codes: H heat conservation, C cold, PP personnel protection, AC acoustic, N none', 'Some legends hatch a short stretch of the line instead'],
  svg: lineSample(p('M8 20H192', thin(4)) + p('M40 11H160M40 29H160', dash('5 4') + ' ' + thin(1.4)) + p('M40 8V32M160 8V32', thin(1.4))) })

S({ id: 'mark-tracing-electric', name: 'Electric heat tracing mark', cat: 'fittings', std: STD_P, physical: false, tags: ['ET', 'EHT'],
  drawn: 'A process line with a thin zig-zag (resistor-like) line running beside it, marked "ET".',
  meaning: 'Electrically traced line to stop freezing, waxing or hydrates. A tracing circuit and controller exist. Shown in the insulation code as "ET". Note it on the line; it is not modelled as geometry.',
  variants: ['Many legends draw a plain dashed line alongside with "ET"', 'Self-regulating vs constant-wattage cable is only on the heat-tracing isometrics'],
  svg: svg(200, 44, p('M8 14H192', thin(4)) + p('M30 30l5-5 5 10 5-10 5 10 5-10 5 10 5-10 5 10 5-10 5 10 5-10 5 10 5-10 5 10 5-10 5 10 5-10 5 10 5-5', thin(1.4)) + t(168, 40, 12, 'ET')) })

S({ id: 'mark-tracing-steam', name: 'Steam tracing mark', cat: 'fittings', std: STD_P, physical: false, tags: ['ST'],
  drawn: 'A process line with a thin dashed tracer line beside it, marked "ST", usually ending at a steam trap.',
  meaning: 'Steam- or hot-oil-traced line. Mostly onshore and in refineries; rare offshore. Note it on the line.',
  variants: ['Hot-water or glycol tracing: same, marked "WT" or "GT"', 'Jacketed lines are drawn differently (see the jacketed line)'],
  svg: svg(200, 44, p('M8 14H192', thin(4)) + p('M24 28H150', dash('8 5') + ' ' + thin(1.4)) + c(160, 28, 8, thin(1.6)) + t(160, 32, 10, 'T') + t(100, 42, 11, 'ST')) })

S({ id: 'slope-arrow', name: 'Slope (fall) mark', cat: 'fittings', std: STD_P, physical: false, tags: [],
  drawn: 'The word "SLOPE" or a ratio (e.g. 1:100) with an arrow along the line pointing downhill.',
  meaning: 'The line must fall continuously in the arrow direction: drains, flare headers and relief lines (no pockets). Affects routing, not components. Keep runs level or falling towards the drum.',
  variants: ['Some legends use a small right triangle above the line', '"No pockets" or "free draining" notes mean the same'],
  svg: svg(200, 44, p('M8 30H192', thin(2.5)) + p('M60 18H140', thin(1.6)) + p('M140 18l-10-5v10z', B) + t(100, 12, 10, 'SLOPE 1:100')) })

S({ id: 'flow-arrow', name: 'Flow direction arrow', cat: 'fittings', std: STD_P, physical: false, tags: [],
  drawn: 'A solid arrowhead on the line.',
  meaning: 'Direction of normal flow in the line. Use it to orient check valves and to decide which equipment is "from" and which is "to".',
  variants: ['Open-headed arrows are used for signal and relief flow on some legends'],
  svg: lineSample(p('M8 20H192', thin(2.5)) + p('M110 20l-18-9v18z', B)) })

S({ id: 'line-crossing', name: 'Line crossing (no connection)', cat: 'fittings', std: STD_P, physical: false, tags: [],
  drawn: 'Two lines crossing, with one broken (a small gap either side of the other line), or with a small hop (semicircle) over it.',
  meaning: 'The lines cross on paper only and are not connected. Do not make a tee here.',
  variants: ['Convention: the vertical line is usually the one broken', 'Older drawings use a hop (semicircle)', 'A plain cross with no dot is ambiguous: treat it as no connection unless there is a dot'],
  svg: svg(80, 80, p('M4 40H76') + p('M40 4V30M40 50V76')) })

S({ id: 'line-junction', name: 'Line junction (tee)', cat: 'fittings', std: STD_P, component: 'tee', physical: true, tags: [],
  drawn: 'A branch line meeting a run line in a T, with a solid dot at the junction.',
  meaning: 'Branch connection: a tee, or a welded branch fitting (olet). A welded branch outlet (weldolet, sockolet) maps to the olet component. In plant.json, model a tee with the tee component and connect the run ends and the branch port.',
  variants: ['The dot is often omitted on T junctions (a T cannot be a crossing)', 'Branch size may differ: reducing tee or olet'],
  svg: svg(80, 70, p('M4 50H76') + p('M40 50V6') + c(40, 50, 5, B)) })

S({ id: 'injection-quill', name: 'Injection quill / point', cat: 'fittings', std: STD_F + ' / company legend practice', physical: true, tags: ['IP', 'CI'],
  drawn: 'A small branch entering the pipe (often after a check valve), with its end bent inside the pipe and pointing downstream.',
  meaning: 'Chemical injection point: corrosion inhibitor, scale inhibitor, methanol, demulsifier, biocide. The supply comes from the chemical injection package. Listed, not modelled; the package is chemical-injection-skid.',
  variants: ['Often drawn only as a small line ending in a dot or an arrow on the main line, with the chemical name', 'A check valve and a double block on the branch are typical'],
  svg: svg(120, 70, p('M4 30H116M4 54H116') + p('M60 4V42H80', thin(2)) + p('M76 38l4 4-4 4', thin(2))) })

S({ id: 'corrosion-probe', name: 'Corrosion probe / coupon', cat: 'fittings', std: 'Company legend practice (ISA-style bubble)', physical: true, tags: ['CP', 'CC', 'CE'], isa: [],
  drawn: 'A short access fitting on top of the line with a small box or bubble marked "CP" (probe) or "CC" (coupon), and a probe tip into the flow.',
  meaning: 'Corrosion monitoring point: an ER/LPR probe or a weight-loss coupon in a high-pressure access fitting. Listed, not modelled.',
  variants: ['Legends vary: a diamond, a box or a circle with CC/CP/CE', 'Sand probes are drawn similarly, marked SP or SE'],
  svg: svg(120, 70, p('M4 50H116') + p('M60 50V34') + r(46, 10, 28, 24) + t(60, 27, 12, 'CP') + p('M60 50V58', thin(2))) })

S({ id: 'vent-atmosphere', name: 'Vent to atmosphere (gooseneck)', cat: 'fittings', std: STD_F, physical: true, tags: ['VA', 'TV'],
  drawn: 'A line rising and turning back down at the top (a gooseneck or bent open end), sometimes with "ATM" written beside it.',
  meaning: 'Open vent to a safe location: instrument-air and nitrogen relief, tank vents and utility PSV outlets. For hydrocarbons, cold vents go to a vent stack instead.',
  variants: ['A plain open end with "TO ATM"', 'A mesh or bird screen may be drawn at the end'],
  svg: svg(100, 90, p('M4 80H40V26a12 12 0 0 1 24 0V40') + p('M58 40l6 10 6-10', thin(1.6)) + t(80, 72, 11, 'ATM')) })

// ---------- lines ----------
const ln = (o = '') => p('M8 20H192', o)
const every = (from, to, step, f) => { let s = ''; for (let x = from; x <= to; x += step) s += f(x); return s }
S({ id: 'line-process-main', name: 'Main process line', cat: 'lines', std: STD_P, physical: true, tags: [],
  drawn: 'A heavy (thick) solid line, with a line number written along it (e.g. 8"-PG-1101-D6A-N).',
  meaning: 'Main process pipe. Each one becomes a plant.json line between equipment ports or battery limits. Read size, service, sequence number, class and insulation from the line number.',
  variants: ['Line weight is the only difference from secondary lines; some CAD exports lose it', 'Line-number order differs by company (size-service-number-class-insulation is common)'],
  svg: lineSample(ln(thin(5))) })

S({ id: 'line-process-secondary', name: 'Secondary / minor process or utility line', cat: 'lines', std: STD_P, physical: true, tags: [],
  drawn: 'A medium-weight solid line, thinner than main process lines, with its own line number.',
  meaning: 'Utility, minor process or small-bore line: drains, vents, chemical injection, fuel gas, air. Model it if it is a numbered line between modelled items.',
  variants: ['Some companies draw utilities in a medium weight and instrument process connections thin'],
  svg: lineSample(ln(thin(2.5))) })

S({ id: 'line-future', name: 'Future line', cat: 'lines', std: STD_P, physical: false, tags: [],
  drawn: 'A heavy line made of long dashes, often marked "FUTURE".',
  meaning: 'Planned but not part of this scope. Do not model it; at most, leave a blinded tie-in.',
  variants: ['Some legends use a dash-dot line', 'Future equipment is drawn dashed too'],
  svg: lineSample(ln(thin(4) + ' ' + dash('16 8'))) })

S({ id: 'line-existing', name: 'Existing line', cat: 'lines', std: STD_P, physical: true, tags: [],
  drawn: 'A screened (gray or lighter) line, sometimes labelled "EXISTING" or with a note, on brownfield drawings.',
  meaning: 'Existing pipe that this project does not change. Model it only if the existing plant is in scope.',
  variants: ['Monochrome prints may show existing lines as thin, or hatched, or with an "E" in the line number', 'Check the legend: some brownfield sets reverse this and screen the new work'],
  svg: lineSample(p('M8 20H192', 'stroke="#999" stroke-width="4"')) })

S({ id: 'line-demolished', name: 'Demolished / to be removed line', cat: 'lines', std: STD_P, physical: false, tags: [],
  drawn: 'A line with short diagonal hatch marks (or crosses) along it, often labelled "TO BE REMOVED" or "DEMOLISH".',
  meaning: 'Pipe to be removed in this project. Do not model it.',
  variants: ['Some legends use × crosses (do not confuse with the thin capillary line)', 'Removed equipment is cross-hatched or crossed out'],
  svg: lineSample(ln(thin(3)) + every(20, 180, 20, (x) => p(`M${x} 30l8-20`, thin(1.8)))) })

S({ id: 'line-instrument-supply', name: 'Instrument supply / process connection', cat: 'lines', std: STD_L, physical: true, tags: [],
  drawn: 'A thin solid line from a process line or vessel to an instrument bubble (or from a supply header).',
  meaning: 'Impulse line from the process to an instrument, or an instrument supply (air, power). It shows where the instrument is mounted. Not a numbered process line.',
  variants: ['ISA 5.1-2009 also uses a plain thin line for "undefined signal"', 'Supply type may be written on it: AS (air supply), ES (electric), NS (nitrogen), HS (hydraulic)'],
  svg: lineSample(ln(thin(1.6))) })

S({ id: 'line-pneumatic', name: 'Pneumatic signal', cat: 'lines', std: STD_L, physical: false, tags: [],
  drawn: 'A thin line with pairs of short diagonal slashes (//) at intervals.',
  meaning: 'Air signal, e.g. from an I/P or positioner to an actuator, or an instrument-air signal to a pneumatic controller. Not modelled.',
  variants: ['Older drawings (ISA 1984) used the same // marks', 'Some legends use three slashes for electric (pre-1984)'],
  svg: lineSample(ln(thin(1.6)) + every(30, 170, 46, (x) => p(`M${x} 28l6-16M${x + 7} 28l6-16`, thin(1.6)))) })

S({ id: 'line-hydraulic', name: 'Hydraulic signal', cat: 'lines', std: STD_L, physical: false, tags: [],
  drawn: 'A thin line with small "L" marks at intervals.',
  meaning: 'Hydraulic signal or power: wellhead control panel to SSV and SCSSV actuators, HPU lines. Not modelled, but it identifies hydraulic actuators.',
  variants: ['Hydraulic supply lines may also be drawn as process lines with the HYD service code'],
  svg: lineSample(ln(thin(1.6)) + every(34, 170, 46, (x) => p(`M${x} 8V28H${x + 9}`, thin(1.6)))) })

S({ id: 'line-electric', name: 'Electric signal', cat: 'lines', std: STD_L, physical: false, tags: [],
  drawn: 'A thin dashed line.',
  meaning: 'Analog (4-20 mA) or discrete electrical signal between instruments, DCS, PLC and SIS. It shows the loop, not a cable route. Not modelled.',
  variants: ['ISA 1984 drew electric signals as a dashed line too; very old drawings use ///', 'Some legends draw binary (on/off) electric signals with a different dash pattern'],
  svg: lineSample(ln(thin(1.6) + ' ' + dash('9 5'))) })

S({ id: 'line-capillary', name: 'Capillary tube (filled system)', cat: 'lines', std: STD_L, physical: true, tags: [],
  drawn: 'A thin line with small × marks at intervals.',
  meaning: 'Filled capillary: a thermal system bulb to its gauge or regulator, or a diaphragm seal to a transmitter. Part of the instrument; not modelled separately.',
  variants: ['Do not confuse with demolished lines (heavy, hatched) on brownfield drawings'],
  svg: lineSample(ln(thin(1.4)) + every(30, 170, 35, (x) => p(`M${x} 14l10 12M${x + 10} 14l-10 12`, thin(1.4)))) })

S({ id: 'line-guided-em', name: 'Guided electromagnetic or sonic signal', cat: 'lines', std: STD_L, physical: false, tags: [],
  drawn: 'A thin solid line with small sine-wave marks on it at intervals.',
  meaning: 'Signal carried along a guide: fibre optic, or a guided-wave radar probe (signal down the rod). Not modelled.',
  variants: ['Some legends draw guided signals as a solid line with small loops', 'The exact mark varies between editions and company legends; check the legend'],
  svg: lineSample(ln(thin(1.4)) + every(30, 160, 44, (x) => p(`M${x} 20c3-11 7-11 10 0s7 11 10 0`, thin(1.6)))) })

S({ id: 'line-unguided-em', name: 'Unguided electromagnetic, radio or sonic signal', cat: 'lines', std: STD_L, physical: false, tags: [],
  drawn: 'A free sine wave with no straight line under it.',
  meaning: 'Wireless or through-the-air signal: radio and WirelessHART transmitters, non-contact radar, nuclear level gauges, light and sound. Not modelled.',
  variants: ['Wireless instruments may also be marked "W" or have an antenna mark on the bubble'],
  svg: lineSample(p('M8 20' + 'c6-16 14-16 20 0s14 16 20 0'.repeat(1) + 's14-16 20 0s14 16 20 0'.repeat(4) + 's14-16 20 0', thin(1.8))) })

S({ id: 'line-data-link', name: 'Data link / software link', cat: 'lines', std: STD_L, physical: false, tags: [],
  drawn: 'A thin line with small open circles on it at intervals.',
  meaning: 'Internal system or communication link: software connections inside the DCS (e.g. a cascade setpoint) or a bus between systems (DCS to PLC, Modbus, fieldbus). Not modelled.',
  variants: ['ISA 5.1-2009 separates shared-system links from fieldbus links with different marks; many legends use filled dots or diamonds for fieldbus', 'Very old drawings: o-o-o meant "software or data link" only'],
  svg: lineSample(ln(thin(1.4)) + every(28, 172, 24, (x) => c(x, 20, 4, W + ' ' + thin(1.4)))) })

S({ id: 'line-mechanical-link', name: 'Mechanical link', cat: 'lines', std: STD_L, physical: false, tags: [],
  drawn: 'A thin line with a small open circle at each end (pivots).',
  meaning: 'Mechanical connection between devices: a float to a valve, interlocked PSV changeover valves, or a key interlock. Not modelled; note the interlock.',
  variants: ['Legends differ: some draw a plain line with "MECH. LINK", others a dashed line with circles', 'Key interlocks are often shown as a dashed line with a key symbol or "KI"'],
  svg: lineSample(p('M14 20H186', thin(1.6)) + c(10, 20, 4, W) + c(190, 20, 4, W)) })

S({ id: 'line-heat-traced', name: 'Heat-traced line', cat: 'lines', std: STD_P, physical: true, tags: [],
  drawn: 'A heavy process line with a thin dashed line running alongside it.',
  meaning: 'The process line is traced (electric or steam). The tracer type is in the insulation code (ET/ST) or a tag on the tracer. Set the line as insulated.',
  variants: ['See the electric and steam tracing marks for the lettered forms'],
  svg: lineSample(p('M8 16H192', thin(4)) + p('M8 28H192', thin(1.4) + ' ' + dash('6 4'))) })

S({ id: 'line-jacketed', name: 'Jacketed line', cat: 'lines', std: STD_P, physical: true, tags: [],
  drawn: 'A heavy process line with a thin outer line on both sides, closed at the ends (a pipe inside a pipe).',
  meaning: 'Jacketed pipe: a heating medium flows in the outer jacket (sulphur, wax and heavy oil). Rare offshore. Model only the inner pipe and note the jacket.',
  variants: ['Some legends draw a double line only over the jacketed length'],
  svg: lineSample(p('M8 20H192', thin(4)) + p('M30 9H170V31H30z', thin(1.6))) })

// ---------- connectors ----------
S({ id: 'offpage-to', name: 'Off-page connector, outgoing', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'The line ends at the flat side of a pentagon (an arrow-shaped box) that points away in the flow direction. The destination drawing number and the service or equipment, e.g. "TO PID-102 / V-2100", are written inside or beside it (left blank here).',
  meaning: 'The line continues on another sheet. If that sheet is in the job, join the two halves into one line (same line number). Otherwise end the line at a battery limit in plant.json ({ at, label: "TO …" }).',
  variants: ['Some legends use an arrow with the text above, or a rectangle with an arrowhead', 'Instrument signals use smaller connectors, often a circle with a letter or a hexagon'],
  svg: svg(200, 50, p('M4 25H110') + p('M110 10H168L186 25L168 40H110z')) })

S({ id: 'offpage-from', name: 'Off-page connector, incoming', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'A pentagon at the start of the line, pointing into the line in the flow direction, with "FROM PID-…" and the source text inside or beside it (left blank here).',
  meaning: 'The line comes from another sheet. Join it to the matching outgoing connector if that sheet is in scope; otherwise start the line at a battery limit ({ at, label: "FROM …" }).',
  variants: ['Some legends point both connector types to the right regardless of direction; read the TO/FROM text'],
  svg: svg(200, 50, p('M14 10H72L90 25L72 40H14z') + p('M90 25H196')) })

S({ id: 'utility-connector', name: 'Utility connector', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'A small rounded box at a line end with the utility code inside (e.g. N2, IA, UA, PW, FG).',
  meaning: 'Utility supply or return from the utility distribution sheets, without the full off-page reference. End the line at a battery limit labelled with the utility.',
  variants: ['Some legends use an ellipse, a flag or a hexagon', 'Utility stations (hose connections) carry a list of codes'],
  svg: svg(200, 50, r(10, 10, 60, 30, 'rx="15"') + t(40, 30, 14, 'N2') + p('M70 25H196')) })

S({ id: 'connector-on-sheet', name: 'On-sheet continuation', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'A line ending in an arrow at a small circle with a letter; the same letter appears where the line resumes on the same sheet.',
  meaning: 'The line jumps across the same drawing to avoid a long route. Treat both ends as one continuous line.',
  variants: ['A small circle with a letter can look like an instrument bubble; continuation letters are single letters and have no number'],
  svg: svg(150, 50, p('M4 25H100') + p('M100 25l-10-5v10z', B) + c(118, 25, 16) + t(118, 30, 15, 'A')) })

S({ id: 'tie-in', name: 'Tie-in point', cat: 'connectors', std: STD_K, physical: false, tags: ['TP', 'TI'],
  drawn: 'A bar across the line where new pipe joins existing pipe, with a leader to a hexagon or flag holding the tie-in number (e.g. TP-01).',
  meaning: 'Where new work connects to existing plant (hot-tap, cold cut, or flange break). In plant.json a tie-in is a battery limit: end the line with { at, label: "TIE-IN TP-01" }; it renders as a blinded end with a yellow band.',
  variants: ['Tie-in marks vary: hexagon, flag, circle with TI, or a diamond', 'Hot taps are often noted "HT"'],
  svg: svg(200, 70, p('M4 52H196') + p('M100 40V64', thin(3)) + p('M100 40V30') + p('M82 18L90 6H110L118 18L110 30H90z') + t(100, 22, 11, 'TP')) })

S({ id: 'battery-limit', name: 'Battery limit', cat: 'connectors', std: STD_K, physical: false, tags: ['BL'],
  drawn: 'A long dash-dot boundary line crossing the pipe, labelled "B.L." or "BATTERY LIMIT", often with the scope owner written on each side.',
  meaning: 'The edge of the modelled scope. In plant.json the line\'s from/to becomes a BatteryLimit object { at: [x, y, z], direction?, label? } instead of "TAG.port". It renders as a blinded end with a yellow band and the label. No component.',
  variants: ['Some legends draw a heavy dashed line with a flag', 'Package (vendor) boundaries look similar but enclose equipment'],
  svg: svg(160, 100, p('M4 60H156') + p('M80 6V94', thin(2) + ' ' + dash('14 4 3 4')) + t(110, 20, 13, 'B.L.')) })

S({ id: 'package-boundary', name: 'Package / vendor scope boundary', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'A dash-dot rectangle drawn around a group of equipment and piping, with the package tag and vendor written in a corner, and connections crossing its edge.',
  meaning: 'Everything inside is supplied as one package (skid), and its details may be on the vendor\'s P&IDs. Map the package to a package component (e.g. chemical-injection-skid, instrument-air-package) and the crossing lines to its ports.',
  variants: ['Some legends use long dashes or a double-dash-dot', 'Interface points on the boundary may carry small flags or "VI" (vendor interface) marks'],
  svg: svg(200, 110, r(30, 14, 140, 82, thin(2) + ' ' + dash('14 4 3 4')) + p('M4 55H48M152 55H196') + r(70, 36, 60, 38)) })

S({ id: 'interlock', name: 'Interlock / logic diamond', cat: 'connectors', std: 'ISA 5.1-2009 (binary logic)', physical: false, tags: ['I'],
  drawn: 'A diamond with "I" (or an interlock number) inside, with signal lines in and out.',
  meaning: 'Interlock or logic function, defined on the logic diagrams or the cause & effect chart: e.g. LAHH trips a pump and closes an ESDV. Not physical; use it to understand the shutdowns.',
  variants: ['The number inside refers to the logic or C&E sheet', 'ISA logic gates (AND/OR) may be drawn as boxes on the P&ID', 'SIS trips are often a diamond with "S" or "SIS"'],
  svg: svg(160, 60, p('M4 30H50M110 30H156', thin(1.6) + ' ' + dash('8 4')) + p('M80 6L104 30L80 54L56 30z') + t(80, 36, 16, 'I')) })

S({ id: 'note-marker', name: 'Note reference', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'A number inside a small hexagon (or a flag or box) with a leader to the item; the note itself is in the notes block.',
  meaning: 'Points to a drawing note: slopes, no pockets, vendor scope, minimum distances or hold items. Read the note; it often explains what the symbols cannot.',
  variants: ['Some companies use a flag or a circle; a hexagon with a number only is a note, while an ISA computer-function hexagon has tag letters'],
  svg: svg(120, 60, p('M14 30L24 14H52L62 30L52 46H24z') + t(38, 36, 16, '3') + p('M62 30H112', thin(1.4))) })

S({ id: 'hold-cloud', name: 'Hold / revision cloud', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'A scalloped (cloud) outline around part of the drawing, often with "HOLD" or a revision triangle.',
  meaning: 'The clouded part is on hold (unconfirmed) or changed in this revision. Treat the data inside as provisional and list it as an assumption.',
  variants: ['Holds may be written "HOLD 3" with a hold list', 'Revision clouds are paired with a revision triangle'],
  svg: svg(160, 90, (() => { const n = 14, cx = 80, cy = 45, rx = 66, ry = 34; let d = ''; const pt = (i) => [cx + rx * Math.cos((i / n) * 2 * Math.PI), cy + ry * Math.sin((i / n) * 2 * Math.PI)]; let [x0, y0] = pt(0); d += `M${x0.toFixed(1)} ${y0.toFixed(1)}`; for (let i = 1; i <= n; i++) { const [x, y] = pt(i); d += `A9 9 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}` } return p(d + 'z') })() + t(80, 51, 16, 'HOLD')) })

S({ id: 'revision-triangle', name: 'Revision marker', cat: 'connectors', std: STD_K, physical: false, tags: [],
  drawn: 'A small triangle with a revision number or letter inside, next to a change (often inside a cloud).',
  meaning: 'Marks what changed in that revision. Check the revision block to see whether the change is approved.',
  variants: ['Some companies use a circle or hexagon for revisions'],
  svg: svg(80, 70, p('M40 6L72 62H8z') + t(40, 54, 18, '2')) })
