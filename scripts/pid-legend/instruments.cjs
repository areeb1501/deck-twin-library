// ISA 5.1 instrument bubbles and functions, primary elements and field instruments.
const { B, W, svg, p, c, r, t, thin, dash, bubble, cat, S } = require('./lib.cjs')

const STD_I = 'ISA 5.1-2009/2022 (general instrument and function symbols)'
const STD_E = 'ISA 5.1-2009/2022 (primary element symbols) / PIP PIC001'

cat('instruments', 'Instrument bubbles and functions (ISA 5.1)')
cat('primary-elements', 'Primary elements and field instruments')

// ---------- bubbles ----------
S({ id: 'isa-field', name: 'Field-mounted instrument (discrete)', cat: 'instruments', std: STD_I, physical: true, tags: [], isa: ['PI', 'PT', 'TT', 'LT', 'FT'],
  drawn: 'A plain circle with no horizontal line, containing the tag letters and usually the loop number.',
  meaning: 'A discrete instrument mounted in the field, on or next to the pipe or vessel: transmitters, gauges, switches and local controllers. These are the bubbles that map to physical instruments; read the letters to choose the component (PT → pressure-transmitter, PI → pressure-gauge, etc.).',
  variants: ['Bubble size varies; ISA suggests about 11 mm (7/16")', 'Wireless field instruments may carry a small antenna mark', 'Two touching circles = one device with two functions'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, top: 'PT', bot: '101' })) })

S({ id: 'isa-panel-primary', name: 'Instrument in main control room (primary location)', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['FIC', 'PIC', 'LIC', 'TIC', 'HS'],
  drawn: 'A circle with one solid horizontal line across the middle; letters above the line, loop number below.',
  meaning: 'A discrete (hardwired) instrument or function in the main control room, normally accessible to the operator: a panel indicator, controller or push-button. It is not on the plot; do not model it, but it shows which field instrument exists.',
  variants: ['On ISA 5.1-2009 drawings, solid bar = central/main control room', 'Circle-in-square with a bar = the same location but in the DCS'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, loc: 'primary', top: 'FIC', bot: '101' })) })

S({ id: 'isa-panel-auxiliary', name: 'Instrument on local / auxiliary panel', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['PIC', 'HS', 'XA'],
  drawn: 'A circle with two parallel horizontal lines across the middle (a double bar).',
  meaning: 'Instrument or function on a secondary or local panel accessible to the operator: a local control panel, package panel or LER panel. Not on the plot; the package or panel may be modelled as a building or skid.',
  variants: ['ISA 5.1-2009: double solid bar = secondary/local panel, normally accessible; double dashed bar = local, not normally accessible', 'Older drawings (1984): double bar = auxiliary location'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, loc: 'aux', top: 'PIC', bot: '102' })) })

S({ id: 'isa-behind-panel', name: 'Instrument behind the panel (not accessible)', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['FY', 'PY', 'TY'],
  drawn: 'A circle with a dashed horizontal line across the middle.',
  meaning: 'Function not normally accessible to the operator: behind the panel, in a marshalling cabinet or rack room (relays, converters, signal isolators). Not modelled.',
  variants: ['Circle-in-square with a dashed bar = a DCS function not shown to the operator (internal calculation)'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, loc: 'behind', top: 'FY', bot: '101' })) })

S({ id: 'isa-dcs', name: 'Shared display / shared control (DCS)', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['FIC', 'PIC', 'LIC', 'TIC', 'FI', 'PI', 'LI', 'TI'],
  drawn: 'A circle inside a square, with a solid horizontal line across, letters above and loop number below.',
  meaning: 'A function in the basic process control system (BPCS/DCS) shown on operator screens: indication, control, alarms. Software, not hardware on the plot. A PIC-101 in the DCS implies a field PT-101.',
  variants: ['No bar = a field-mounted shared display (e.g. a local HMI)', 'Dashed bar = DCS function the operator cannot see', 'ISA 5.1-2009 redefined circle-in-square as the BPCS whatever the hardware'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, shape: 'dcs', loc: 'primary', top: 'LIC', bot: '101' })) })

S({ id: 'isa-plc', name: 'PLC / alternate control system function', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['YIC', 'XC', 'HS'],
  drawn: 'A diamond inside a square, with a horizontal line across when operator-accessible.',
  meaning: 'A function in a PLC or other non-BPCS control system: package PLCs, sequence logic, compressor UCP. Software, not modelled.',
  variants: ['ISA 5.1-2009 lets the user assign diamond-in-square to either "alternate control system" or SIS; the drawing legend says which', 'Some old sources describe a triangle-in-square for PLCs; the standard shape is the diamond'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, shape: 'plc', loc: 'primary', top: 'YIC', bot: '101', fs: 11 })) })

S({ id: 'isa-sis', name: 'Safety instrumented system (SIS) function', cat: 'instruments', std: STD_I + ' / IEC 61511', physical: false, tags: [], isa: ['LSHH', 'PSHH', 'LZ', 'PZ', 'XS'],
  drawn: 'A diamond inside a square (with a bar when operator-accessible), carrying a trip function such as LSHH or PSHH. Many legends add "SIS" or a distinct colour or letter.',
  meaning: 'A trip or permissive in the safety instrumented system: PSD/ESD logic on independent SIL-rated hardware. Not physical. Each one implies dedicated field sensors (often LZT/PZT, or a second transmitter) and final elements (ESDV, BDV, motor trips).',
  variants: ['ISA 5.1-2009 introduced the diamond-in-square option for SIS. ISA describes the 2022 edition as a corrections release, and no change to this symbol was reported (the 2022 text was not checked)', 'Many operators mark SIS loops with Z (e.g. PZT, LZT, XZV) or a "S" prefix; this is company practice, not ISA', 'Some legends use a hexagon or a double-bordered diamond for the SIS and keep diamond-in-square for PLCs', 'A note such as CMS beside it puts the trip in the machinery protection / condition monitoring system (API 670 rack), not the process SIS: see cms-system'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, shape: 'plc', loc: 'primary', top: 'LSHH', bot: '101', fs: 10 })) })

S({ id: 'isa-computer', name: 'Computer function', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['FQ', 'UY', 'KY'],
  drawn: 'A hexagon (pointed left and right), with a horizontal line across when operator-accessible.',
  meaning: 'A function on a separate computer (supervisory or optimisation system, advanced process control, flow computer software, historian calculation). Not modelled.',
  variants: ['A hexagon with only a number and no letters is a note marker, not a computer function', 'Flow computers on metering skids are often drawn this way, with FQ'],
  svg: svg(100, 64, bubble(50, 32, { r: 22, shape: 'computer', loc: 'primary', top: 'FQ', bot: '101' })) })

S({ id: 'isa-multifunction', name: 'Multi-function instrument (touching bubbles)', cat: 'instruments', std: STD_I, physical: true, tags: [], isa: ['PIT', 'PSH', 'TT', 'TSH'],
  drawn: 'Two bubbles drawn touching side by side, each with its own letters, e.g. PIT and PSHH.',
  meaning: 'One physical device performing two functions (e.g. a transmitter with a built-in switch), or two functions in one housing. Model one instrument.',
  variants: ['Bubbles of different shapes may touch (a field device with its DCS function)'],
  svg: svg(120, 64, c(36, 32, 22, W) + t(36, 36.5, 12, 'PIT') + c(80, 32, 22, W) + t(80, 36.5, 11, 'PSHH')) })

S({ id: 'isa-function-block', name: 'Function block (computing / signal conversion)', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['FY', 'TY', 'PY'],
  drawn: 'A small square drawn beside a bubble (usually a Y relay or compute bubble) containing a math or conversion symbol: √, Σ, ×, ÷, I/P, f(x), >, <.',
  meaning: 'What the Y function does: square-root extraction (√), totalising (Σ), high or low select (> <), conversion (I/P). Not physical.',
  variants: ['Some legends put the symbol inside the bubble instead'],
  svg: svg(110, 64, c(40, 32, 22, W) + t(40, 37, 14, 'FY') + r(66, 18, 28, 28) + t(80, 39, 17, '√', { w: 'normal' })) })

S({ id: 'isa-alarm-annotation', name: 'Alarm and trip annotation', cat: 'instruments', std: STD_I, physical: false, tags: [], isa: ['H', 'HH', 'L', 'LL'],
  drawn: 'Small letters next to a bubble: H, HH, L, LL (or AH, AHH, AL, ALL), sometimes with a setpoint value.',
  meaning: 'The loop has alarms (H/L) or trips (HH/LL) at those points. HH and LL usually drive the cause & effect matrix. Not physical; record them as instrument alarm limits.',
  variants: ['ISA succeeding letters: A = alarm, S = switch/trip; H, L, M = high, low, middle', 'Trips are often in the SIS bubble (e.g. LSHH) instead of annotations'],
  svg: svg(110, 70, c(44, 38, 22, W) + t(44, 43, 13, 'LT') + t(80, 18, 11, 'HH') + t(80, 32, 11, 'H') + t(80, 52, 11, 'L') + t(80, 66, 11, 'LL')) })

S({ id: 'isa-letters', name: 'ISA 5.1 identification letters', cat: 'instruments', std: 'ISA 5.1-2009/2022 (Table 4.1, identification letters)', physical: false, tags: [], isa: [],
  drawn: 'Tag letters inside any bubble, e.g. "FIC" over "101": first letter = measured variable, following letters = functions.',
  meaning: 'FIRST LETTER (measured or initiating variable, with optional modifier): A analysis, B burner/combustion, C user\'s choice (often conductivity), D user\'s choice (often density), E voltage, F flow (modifier F ratio), G user\'s choice (often gauging/position), H hand, I current, J power, K time/schedule, L level, M user\'s choice (often moisture), N user\'s choice, O user\'s choice, P pressure/vacuum, Q quantity (modifier Q integrate/totalise), R radiation, S speed/frequency (modifier: S safety), T temperature, U multivariable, V vibration/machinery analysis, W weight/force, X unclassified, Y event/state/presence, Z position/dimension. First-letter modifiers: D differential, F ratio, J scan, K time rate of change, Q integrate/totalise, S safety, X/Y/Z axis. SUCCEEDING LETTERS: A alarm, B user\'s choice, C control, D differential (modifier), E sensor/primary element, G glass/gauge/viewing device, H high, I indicate, K control station, L light or low, M middle/momentary, N user\'s choice, O orifice/restriction, P point (test connection), Q integrate, R record, S switch, T transmit, U multifunction, V valve/damper/louvre, W well (thermowell), X unclassified, Y relay/compute/convert, Z driver/actuator/final control element. Examples: PT pressure transmitter, PDT differential-pressure transmitter, FE flow element, FIC flow indicating controller, LSHH level switch high-high, TW thermowell, PSV pressure safety valve, XV on/off valve, HS hand switch, ZSO position switch open, AT analyser transmitter, FQ totaliser, LG level gauge.',
  variants: ['Company standards fill the user\'s-choice letters differently (C, D, G, M, N, O)', 'Some companies put Z after the first letter for SIS loops (PZT); that is not ISA', 'Loop numbers may include an area or unit prefix, e.g. 20-PT-1101'],
  svg: svg(100, 64, bubble(50, 32, { r: 24, top: 'FIC', bot: '101' })) })

// ---------- primary elements ----------
const PIPE = (y = 96) => p(`M4 ${y}H116`)
const tx = (letters, line = true, y2 = 84) => bubble(60, 32, { r: 20, top: letters }) + (line ? p(`M60 52V${y2}`, thin(1.6)) : '')
const wall2 = p('M4 84H116M4 108H116')
const inlineBox = (inner) => p('M4 96H38M82 96H116') + r(38, 82, 44, 28) + inner

S({ id: 'fe-orifice-plate', name: 'Orifice plate flow element with dp transmitter', cat: 'primary-elements', std: STD_E, component: 'orifice-flowmeter', physical: true, tags: ['FE', 'FT'], isa: ['FE', 'FT', 'FIT'],
  drawn: 'An orifice plate between a flange pair on the line (a bar across the pipe with a gap in the middle for the bore), with two impulse lines from the flange taps up to an FT bubble.',
  meaning: 'Differential-pressure flow measurement. FE is the plate in its orifice-flange pair and FT is the dp cell. Fiscal and allocation meters, gas flow to flare and fuel. Model one item (orifice-flowmeter) for the FE+FT pair.',
  variants: ['Simplified form: two short bars across the line with an FE bubble', 'A restriction orifice (RO) looks the same but has no taps', 'Orifice fittings (senior / dual-chamber) are drawn as a box labelled with the type'],
  svg: svg(120, 112, PIPE() + p('M48 82V110M72 82V110') + p('M60 84V92M60 100V108', thin(3.5)) + p('M52 82V48M68 82V48', thin(1.6)) + bubble(60, 32, { r: 20, top: 'FT' })) })

S({ id: 'fe-venturi', name: 'Venturi tube', cat: 'primary-elements', std: STD_E, physical: true, tags: ['FE'], isa: ['FE'],
  drawn: 'The line narrows through a short throat and widens again (converging and diverging lines either side of the pipe), with an FE bubble above.',
  meaning: 'Low-loss dp flow element for large water and gas lines and multiphase meters (venturi + gamma). No dedicated component; orifice-flowmeter is the nearest dp meter.',
  variants: ['Some legends draw it as a box with "V"', 'Multiphase flow meters (MPFM) combine a venturi with a gamma densitometer box'],
  svg: svg(120, 112, p('M4 96H30M90 96H116') + p('M30 84L48 91H64L90 84M30 108L48 101H64L90 108') + tx('FE', true, 91)) })

S({ id: 'fe-flow-nozzle', name: 'Flow nozzle', cat: 'primary-elements', std: STD_E, physical: true, tags: ['FE'], isa: ['FE'],
  drawn: 'A flange pair with two curved lines inside the pipe converging downstream (the nozzle profile), and an FE bubble.',
  meaning: 'Dp flow element for high-velocity steam and gas. No dedicated component.',
  variants: ['Often only a box with "FN" or the same symbol as an orifice with "NOZZLE"'],
  svg: svg(120, 112, wall2 + p('M44 78V114M52 78V114') + p('M52 84q16 0 20 9M52 108q16 0 20-9') + tx('FE', true, 78)) })

S({ id: 'fe-pitot', name: 'Pitot tube', cat: 'primary-elements', std: STD_E, physical: true, tags: ['FE'], isa: ['FE'],
  drawn: 'A probe from an FE bubble into the pipe, bent into an L whose open end faces upstream.',
  meaning: 'Point-velocity flow probe. Rare on process lines, used for testing and ducts. No dedicated component.',
  variants: ['Some legends draw a small open-ended hook symbol without a bubble'],
  svg: svg(120, 112, wall2 + p('M60 52V96H44', thin(2.2)) + bubble(60, 32, { r: 20, top: 'FE' })) })

S({ id: 'fe-averaging-pitot', name: 'Averaging pitot (multiport probe)', cat: 'primary-elements', std: STD_E, physical: true, tags: ['FE'], isa: ['FE'],
  drawn: 'A bar across the full pipe bore with several small holes (dots) on its upstream face, under an FE bubble.',
  meaning: 'Multi-port averaging pitot (Annubar type). Used on large gas lines and flare headers because the pressure loss is low. No dedicated component.',
  variants: ['Often drawn like a pitot tube with "AVG" or the vendor name'],
  svg: svg(120, 112, wall2 + r(56, 82, 8, 28, W) + c(54, 89, 1.8, B) + c(54, 96, 1.8, B) + c(54, 103, 1.8, B) + tx('FE', true, 82)) })

S({ id: 'fe-magnetic', name: 'Electromagnetic flowmeter', cat: 'primary-elements', std: STD_E, component: 'magnetic-flowmeter', physical: true, tags: ['FE', 'FT'], isa: ['FE', 'FIT'],
  drawn: 'An in-line rectangle on the pipe with "M" inside, under an FT/FIT bubble.',
  meaning: 'Magnetic flowmeter for conductive liquids only: seawater, produced water, water injection, chemicals. Not for hydrocarbons or gas. Maps to the magnetic-flowmeter component.',
  variants: ['Some legends write "MAG" or draw two coil arcs either side of the pipe'],
  svg: svg(120, 112, inlineBox(t(60, 102, 16, 'M')) + tx('FIT', true, 82)) })

S({ id: 'fe-vortex', name: 'Vortex flowmeter', cat: 'primary-elements', std: STD_E, component: 'vortex-flowmeter', physical: true, tags: ['FE', 'FT'], isa: ['FE', 'FIT'],
  drawn: 'An in-line rectangle with a small triangle (the bluff body) and a wavy vortex trail behind it, under an FT bubble.',
  meaning: 'Vortex-shedding meter for steam, gas and clean liquids: utilities, fuel gas, instrument air. Maps to the vortex-flowmeter component.',
  variants: ['Some legends write "VOR" or "VORTEX" in the box'],
  svg: svg(120, 112, inlineBox(p('M46 88v16l8-8z', B) + p('M58 96c4-6 8-6 10 0s6 6 10 0', thin(1.6))) + tx('FT', true, 82)) })

S({ id: 'fe-turbine', name: 'Turbine flowmeter', cat: 'primary-elements', std: STD_E, physical: true, tags: ['FE', 'FT'], isa: ['FE', 'FQ'],
  drawn: 'An in-line rectangle with a small rotor (a hub with blades) inside, under an FT or FQ bubble.',
  meaning: 'Turbine meter for clean light liquids: fiscal oil metering (with a prover), diesel, chemicals. No single-meter component; fiscal runs are metering-skid.',
  variants: ['Some legends write "T" or "TUR" in the box', 'Helical turbine meters on fiscal skids are drawn the same'],
  svg: svg(120, 112, inlineBox(c(60, 96, 4, B) + p('M60 96l10-9M60 96l-10 9M60 96l9 9M60 96l-9-9', thin(1.8))) + tx('FT', true, 82)) })

S({ id: 'fe-positive-displacement', name: 'Positive displacement flowmeter', cat: 'primary-elements', std: STD_E, physical: true, tags: ['FE', 'FQ'], isa: ['FQ', 'FQI'],
  drawn: 'An in-line rectangle with two small touching ovals or circles (meshing rotors) inside, often with an FQ (totaliser) bubble.',
  meaning: 'Oval-gear or rotary PD meter for viscous liquids, chemical dosing and diesel transfer. Counts volume directly. No dedicated component.',
  variants: ['Some legends write "PD" in the box'],
  svg: svg(120, 112, inlineBox(e2(52, 96) + e2(68, 96)) + tx('FQ', true, 82)) })
function e2(x, y) { return `<ellipse cx="${x}" cy="${y}" rx="8" ry="10" stroke-width="2"/>` }

S({ id: 'fe-ultrasonic', name: 'Ultrasonic flowmeter', cat: 'primary-elements', std: STD_E, component: 'ultrasonic-flowmeter', physical: true, tags: ['FE', 'FT'], isa: ['FE', 'FIT', 'FQ'],
  drawn: 'Two small transducers on opposite sides of the pipe, offset along it, with a dashed diagonal sound path between them, under an FT bubble.',
  meaning: 'Transit-time ultrasonic meter: fiscal gas metering (multipath), flare gas and large liquid lines. Maps to the ultrasonic-flowmeter component.',
  variants: ['Some legends draw a box with "US" or "UT"', 'Clamp-on meters are drawn outside the pipe wall'],
  svg: svg(120, 120, wall2 + r(38, 76, 12, 8, W) + r(70, 108, 12, 8, W) + p('M44 84L76 108', thin(1.6) + ' ' + dash('5 3')) + p('M60 52V64H44V76', thin(1.6)) + bubble(60, 32, { r: 20, top: 'FT' })) })

S({ id: 'fe-coriolis', name: 'Coriolis mass flowmeter', cat: 'primary-elements', std: STD_E, component: 'coriolis-flowmeter', physical: true, tags: ['FE', 'FT'], isa: ['FE', 'FIT', 'FQ'],
  drawn: 'An in-line box on the pipe with a looped (U-shaped) tube inside, under an FT bubble.',
  meaning: 'Coriolis mass meter: condensate, oil allocation, chemicals and LACT/fiscal liquid service. It measures density too. Maps to the coriolis-flowmeter component.',
  variants: ['Some legends write "C" or "CORIOLIS" or "MASS" in the box'],
  svg: svg(120, 112, p('M4 96H34M86 96H116') + r(34, 76, 52, 34) + p('M34 96H44V84H76V96H86', thin(2)) + tx('FT', true, 76)) })

S({ id: 'fe-variable-area', name: 'Variable-area flowmeter (rotameter)', cat: 'primary-elements', std: STD_E, physical: true, tags: ['FI', 'FG'], isa: ['FI', 'FG'],
  drawn: 'A vertical tapered tube, wider at the top, with a small float inside; the flow enters at the bottom and leaves at the top.',
  meaning: 'Local flow indicator for purge gas, small utilities, seal flush and chemical injection. No dedicated component; usually not modelled.',
  variants: ['ISA style: an FI bubble on the line with "VA" or "ROTA"', 'Metal-tube rotameters with transmitters are tagged FIT'],
  svg: svg(120, 112, p('M4 106H60V100M60 52V46H116') + p('M53 100L46 52H74L67 100z') + p('M54 76h12l-6 9z', B)) })

S({ id: 'te-thermowell', name: 'Thermowell with temperature element / transmitter', cat: 'primary-elements', std: STD_E, component: 'temperature-transmitter', physical: true, tags: ['TW', 'TE', 'TT'], isa: ['TW', 'TE', 'TT', 'TIT'],
  drawn: 'A U-shaped pocket dipping into the line (the thermowell), with a line up to a TT or TE bubble.',
  meaning: 'Temperature measurement: a thermowell (TW), an element (TE, an RTD or thermocouple) and a transmitter (TT). Model one temperature-transmitter for the loop.',
  variants: ['Some legends draw the well as a short line into the pipe with a dot', 'A test thermowell (TW only, no TE) is for a portable probe; skip it', 'Some legends show a flanged thermowell connection as two short bars (a flange pair) on the branch to the bubble, with the connection size written beside it'],
  svg: svg(120, 112, PIPE() + p('M54 74V102a6 6 0 0 0 12 0V74', W) + p('M54 96H66', 'stroke="#fff" stroke-width="3"') + p('M54 74V102a6 6 0 0 0 12 0V74') + tx('TT', true, 74)) })

S({ id: 'tg-temperature-gauge', name: 'Local temperature gauge', cat: 'primary-elements', std: STD_E, component: 'temperature-gauge', physical: true, tags: ['TI', 'TG'], isa: ['TI'],
  drawn: 'A thermowell (U-shaped pocket in the line) with a TI bubble on it.',
  meaning: 'Bimetallic dial thermometer in a thermowell, read locally. Maps to the temperature-gauge component.',
  variants: ['Tagged TG on some legends', 'A dial (circle with a pointer) is sometimes drawn instead of a bubble'],
  svg: svg(120, 112, PIPE() + p('M54 96H66', 'stroke="#fff" stroke-width="3"') + p('M54 74V102a6 6 0 0 0 12 0V74') + tx('TI', true, 74)) })

S({ id: 'pi-pressure-gauge', name: 'Local pressure gauge', cat: 'primary-elements', std: STD_E, component: 'pressure-gauge', physical: true, tags: ['PI', 'PG'], isa: ['PI'],
  drawn: 'A PI (or PG) bubble on a thin impulse line from the pipe, often with a small root or isolation valve on the impulse line.',
  meaning: 'Bourdon-tube dial gauge read locally: pump discharges, filters and vessels. Maps to the pressure-gauge component.',
  variants: ['ISA tag is PI; many companies use PG', 'A gauge with a seal or snubber shows extra small symbols on the impulse line', 'A small box with a letter on the gauge branch (F, S, D, P) is a project-specific accessory such as a snubber, seal, filter or pulsation damper: read the drawing legend, then model the gauge only'],
  svg: svg(120, 112, PIPE() + p('M60 96V52', thin(1.6)) + p('M53 64h14l-7 9zM53 82h14l-7-9z', thin(1.6)) + bubble(60, 32, { r: 20, top: 'PI' })) })

S({ id: 'pt-pressure-transmitter', name: 'Pressure transmitter', cat: 'primary-elements', std: STD_E, component: 'pressure-transmitter', physical: true, tags: ['PT', 'PIT'], isa: ['PT', 'PIT', 'PZT'],
  drawn: 'A PT (or PIT) bubble on a thin impulse line from the pipe or vessel, with an electric (dashed) signal leaving to the DCS.',
  meaning: 'Electronic pressure transmitter feeding the DCS or SIS. Maps to the pressure-transmitter component.',
  variants: ['SIS transmitters are often PZT or carry an "S" suffix', 'Multivariable transmitters on flow loops may be tagged FT with P and T inputs'],
  svg: svg(120, 112, PIPE() + p('M60 96V52', thin(1.6)) + bubble(60, 32, { r: 20, top: 'PT' }) + p('M80 32H116', thin(1.6) + ' ' + dash('7 4'))) })

S({ id: 'pdt-dp-transmitter', name: 'Differential pressure transmitter', cat: 'primary-elements', std: STD_E, component: 'dp-transmitter', physical: true, tags: ['PDT', 'PDIT'], isa: ['PDT', 'PDIT', 'PDI'],
  drawn: 'A PDT bubble with two impulse lines: one to each side of a filter, strainer, exchanger or column section.',
  meaning: 'Differential pressure across equipment: filter or strainer fouling, scrubber dp, column flooding. Maps to the dp-transmitter component.',
  variants: ['A local dp gauge is PDI or PDG', 'Dp level transmitters are tagged LT (see the dp level entry)'],
  svg: svg(120, 112, p('M4 96H44M76 96H116') + r(44, 84, 32, 24) + p('M50 108L70 84', dash('4 3') + ' ' + thin(1.6)) + p('M30 96V32H38M90 96V32H82', thin(1.6)) + bubble(60, 32, { r: 22, top: 'PDT', fs: 12 })) })

S({ id: 'ps-pressure-switch', name: 'Pressure switch', cat: 'primary-elements', std: STD_E, component: 'pressure-switch', physical: true, tags: ['PS', 'PSH', 'PSL', 'PSHH', 'PSLL'], isa: ['PSH', 'PSL', 'PSHH', 'PSLL'],
  drawn: 'A bubble with PSH, PSL, PSHH or PSLL on an impulse line from the process.',
  meaning: 'Pressure switch giving a discrete alarm or trip. Old-style or package protection. Maps to the pressure-switch component.',
  variants: ['On modern plants the same letters often mean a trip point inside the DCS/SIS from a transmitter; then the bubble has a bar or a square', 'Packaged machines (lube oil, seal gas) still use real switches'],
  svg: svg(120, 112, PIPE() + p('M60 96V52', thin(1.6)) + bubble(60, 32, { r: 20, top: 'PSH', fs: 12 })) })

// vessel-side instruments: vessel wall on the left
const VW = p('M4 6H34V114H4', thin(3)) + p('M8 70H30', dash('5 3') + ' ' + thin(1.4)) + p('M15 63h8l-4 6z', thin(1.4))
S({ id: 'lg-gauge-glass', name: 'Level gauge glass', cat: 'primary-elements', std: STD_E, physical: true, tags: ['LG'], isa: ['LG'],
  drawn: 'A tall narrow rectangle beside the vessel, joined to it by two horizontal nozzles (top and bottom), with an LG bubble.',
  meaning: 'Reflex or transparent sight glass showing the level directly. Common on older plant; many operators now use magnetic gauges, which are tagged LG too. No separate component; magnetic-level-gauge is the closest.',
  variants: ['Stacked or overlapping glasses are drawn as two or three offset rectangles', 'Look-alike: magnetic level gauge (chamber with a float and a flag indicator)'],
  svg: svg(140, 120, VW + p('M34 24H60M34 96H60') + r(60, 14, 14, 92) + p('M64 30V90', thin(1.2)) + c(108, 60, 18, W) + t(108, 65, 13, 'LG') + p('M74 60H90', thin(1.6))) })

S({ id: 'lg-magnetic', name: 'Magnetic level gauge', cat: 'primary-elements', std: STD_E, component: 'magnetic-level-gauge', physical: true, tags: ['LG', 'LI'], isa: ['LG', 'LI'],
  drawn: 'A chamber beside the vessel on two nozzles, with a float inside and a column of indicator flaps (half-filled marks) on its face, and an LG bubble.',
  meaning: 'Float-and-magnet level indicator on a bypass chamber, readable from a distance. Often carries a level transmitter too. Maps to the magnetic-level-gauge component.',
  variants: ['Often drawn exactly like a gauge glass and tagged LG; the datasheet distinguishes them', 'A clamp-on magnetostrictive LT on the chamber is drawn as a separate LT bubble'],
  svg: svg(140, 120, VW + p('M34 24H56M34 96H56') + r(56, 12, 16, 96) + r(58, 64, 12, 12, B) + p('M76 24h6M76 34h6M76 44h6M76 54h6', thin(1.4)) + p('M76 66h6M76 76h6M76 86h6M76 96h6', thin(5)) + c(112, 60, 16, W) + t(112, 65, 12, 'LG')) })

S({ id: 'lt-displacer', name: 'Displacer level transmitter', cat: 'primary-elements', std: STD_E, physical: true, tags: ['LT'], isa: ['LT', 'LIT', 'LDT'],
  drawn: 'An external cage beside the vessel on two nozzles, with a long slender displacer hanging inside from a torque tube at the top, and an LT bubble.',
  meaning: 'Buoyancy (displacer) level or interface transmitter. Typical on separators for oil/water interface. No dedicated component; model it as a level transmitter note on the vessel.',
  variants: ['Internal displacers (inside the vessel) are drawn as the displacer inside the vessel outline', 'Interface service may be tagged LDT or LT with "INTERFACE"'],
  svg: svg(140, 120, VW + p('M34 22H56M34 98H56') + r(56, 14, 26, 92) + p('M69 18V30') + r(64, 30, 10, 60, 'rx="5"') + p('M82 18H96', thin(1.6)) + c(112, 18, 15, W) + t(112, 23, 12, 'LT')) })

S({ id: 'lt-dp-level', name: 'Differential pressure level transmitter', cat: 'primary-elements', std: STD_E, component: 'dp-transmitter', physical: true, tags: ['LT'], isa: ['LT', 'LIT'],
  drawn: 'An LT bubble with two impulse lines to the vessel: one from a low nozzle (high side) and one from a high nozzle (low side). Remote seals are drawn as capillaries (line with × marks).',
  meaning: 'Level from hydrostatic head: the most common level transmitter on separators and drums. Maps to the dp-transmitter component; the bubble letters (LT) give the service.',
  variants: ['With diaphragm seals the lines carry × marks (capillaries)', 'Bubble-tube (purge) level measurement looks similar with a purge supply'],
  svg: svg(140, 120, VW + p('M34 100H80V76M34 20H80V44', thin(1.6)) + c(80, 60, 16, W) + t(80, 65, 12, 'LT') + t(96, 98, 10, 'H', { w: 'normal' }) + t(96, 26, 10, 'L', { w: 'normal' })) })

// vessel-top instruments
const VT = p('M6 54H134M6 54V116M134 54V116', thin(3)) + p('M10 92H130', dash('5 3') + ' ' + thin(1.4)) + p('M62 54V42H78V54')
S({ id: 'lt-gwr', name: 'Guided wave radar level transmitter', cat: 'primary-elements', std: STD_E, component: 'guided-wave-radar', physical: true, tags: ['LT'], isa: ['LT', 'LIT'],
  drawn: 'An LT bubble on a vessel-top (or chamber-top) nozzle, with a straight rod or cable probe running down into the liquid.',
  meaning: 'Guided wave radar: a pulse travels down the probe and reflects at the surface or interface. Separators, drums and bridles. Maps to the guided-wave-radar component.',
  variants: ['Often mounted in an external chamber (bridle), drawn like a displacer cage with a probe', 'Some legends mark it "GWR" beside the bubble'],
  svg: svg(140, 120, VT + p('M70 54V110', thin(2)) + p('M66 110h8', thin(3)) + p('M70 42V36', thin(1.6)) + c(70, 20, 16, W) + t(70, 25, 12, 'LT')) })

S({ id: 'lt-radar', name: 'Non-contact radar level transmitter', cat: 'primary-elements', std: STD_E, physical: true, tags: ['LT'], isa: ['LT', 'LIT'],
  drawn: 'An LT bubble on a vessel-top nozzle, with a cone (horn antenna) pointing down and wave arcs (unguided signal) towards the liquid.',
  meaning: 'Free-space radar for tanks and sumps: storage tanks, open drains and caissons. No dedicated component; guided-wave-radar is the closest stand-in.',
  variants: ['Ultrasonic level transmitters are drawn the same and marked "US"'],
  svg: svg(140, 120, VT + p('M62 54L56 66H84L78 54') + p('M58 76q12 6 24 0M54 84q16 8 32 0', thin(1.6)) + p('M70 42V36', thin(1.6)) + c(70, 20, 16, W) + t(70, 25, 12, 'LT')) })

S({ id: 'lt-nuclear', name: 'Nuclear (gamma) level transmitter', cat: 'primary-elements', std: STD_E, physical: true, tags: ['LT', 'RE'], isa: ['LT', 'RE'],
  drawn: 'A source holder (small box) on one side of the vessel and a detector rod on the other, joined by a wavy (radiation) line across the vessel, with an LT bubble on the detector.',
  meaning: 'Gamma level or density measurement through the vessel wall: slug catchers, desanders, profilers in separators. Needs radiation controls. No dedicated component.',
  variants: ['The source holder may be marked with the radiation trefoil or "RS"', 'Density profilers have many detectors in a vertical row'],
  svg: svg(140, 120, p('M30 8V112M100 8V112', thin(3)) + p('M34 80H96', dash('5 3') + ' ' + thin(1.4)) + r(8, 46, 18, 22, B) + r(104, 24, 8, 72) + p('M26 57c6-8 10 8 16 0s10 8 16 0 10 8 16 0 10 8 16 0', thin(1.6)) + p('M112 40H118', thin(1.6)) + c(126, 40, 12, W) + t(126, 44, 10, 'LT')) })

S({ id: 'ls-vibrating-fork', name: 'Vibrating fork level switch', cat: 'primary-elements', std: STD_E, component: 'level-switch', physical: true, tags: ['LS', 'LSH', 'LSL', 'LSHH', 'LSLL'], isa: ['LSH', 'LSL', 'LSHH', 'LSLL'],
  drawn: 'A short side nozzle into the vessel with two small prongs (the fork) inside, and an LS bubble (LSH, LSHH…) outside.',
  meaning: 'Point level switch for high or low alarms and trips, independent of the transmitter. Maps to the level-switch component.',
  variants: ['Many legends draw only the LSHH bubble on the vessel without the fork', 'Capacitance and float switches use the same bubble letters'],
  svg: svg(140, 120, VW + p('M34 40H60') + p('M34 40H22M22 35V45M22 35H10M22 45H10', thin(2)) + c(80, 40, 20, W) + t(80, 44.5, 12, 'LSHH')) })

S({ id: 'ls-float', name: 'Float level switch', cat: 'primary-elements', std: STD_E, physical: true, tags: ['LS', 'LSH', 'LSL'], isa: ['LSH', 'LSL'],
  drawn: 'A float (circle) on a short arm inside the vessel, pivoted at the wall, with an LS bubble outside.',
  meaning: 'Mechanical float switch: sumps, drain drums, day tanks and lube-oil reservoirs. No dedicated component; level-switch is the nearest stand-in.',
  variants: ['Cage-mounted float switches sit in an external chamber like a displacer'],
  svg: svg(140, 120, VW + p('M34 40H60') + c(34, 40, 3, B) + p('M34 40L20 48') + c(14, 52, 7, W) + c(80, 40, 20, W) + t(80, 44.5, 13, 'LSH')) })

S({ id: 'at-analyser', name: 'Analyser (with sample probe)', cat: 'primary-elements', std: STD_E, physical: true, tags: ['AT', 'AE', 'AIT'], isa: ['AT', 'AE', 'AIT', 'AI'],
  drawn: 'An AT (or AE) bubble linked to a probe that dips into the line, with the measured component written beside the bubble (O2, H2S, H2O, OIW, BS&W, CO2…).',
  meaning: 'Online analyser: water dew point, H2S, oxygen, oil-in-water, BS&W or water-cut. In-line probes sit on the pipe; extractive analysers have a sample line to an analyser shelter (analyser-shelter). No single component for the probe.',
  variants: ['The analyte is written beside the bubble, not as part of the tag', 'Extractive systems show a sample line, conditioning box and return', 'Gas chromatographs on metering skids are AT with "GC"'],
  svg: svg(120, 112, PIPE() + p('M60 52V100', thin(2)) + p('M55 100h10', thin(3)) + bubble(60, 32, { r: 20, top: 'AT' }) + t(98, 30, 11, 'H2S')) })

S({ id: 'diaphragm-seal', name: 'Diaphragm (remote) seal with capillary', cat: 'primary-elements', std: STD_E, physical: true, tags: ['PT', 'LT'], isa: [],
  drawn: 'A small flat seal on the pipe or vessel nozzle (a short rectangle with a curved diaphragm line), joined to a transmitter bubble by a capillary (a line with × marks).',
  meaning: 'Remote seal protecting a transmitter from corrosive, viscous or hot process fluid. Part of the transmitter; model the transmitter only.',
  variants: ['Some legends write "DS" or "SEAL" beside the instrument'],
  svg: svg(120, 112, PIPE() + r(20, 80, 24, 10) + p('M22 90q10 6 20 0', thin(1.6)) + p('M32 80V32H40', thin(1.4)) + p('M27 60l10 8M37 60l-10 8M27 42l10 8M37 42l-10 8', thin(1.4)) + bubble(60, 32, { r: 20, top: 'PT' })) })

S({ id: 've-vibration-element', name: 'Vibration element / transmitter on a machine', cat: 'primary-elements', std: STD_E + ' / API 670', component: 'vibration-probe', physical: true, tags: ['VE', 'VT'], isa: ['VE', 'VT', 'VXE', 'VYE', 'VI', 'VSHH'],
  drawn: 'A VE (or VT) bubble joined by a short line to a small square or dot on the outline of a motor, pump, compressor or bearing. Often in pairs (A / B or X / Y), one per bearing or per axis, with VI / VA / VSHH functions downstream.',
  meaning: 'Machinery vibration sensor: proximity probes (shaft) or accelerometers (casing) on the bearings, wired to a proximitor junction box and a protection rack. V as the first letter is vibration in ISA 5.1. Maps to the vibration-probe component on each monitored bearing; set pair for X-Y probes.',
  variants: ['Some legends draw only the bubble beside the machine with a note such as NOTE / TYP. for every bearing', 'VXE / VYE mark the X and Y probes of a pair; ZE on a machine is an axial position (thrust) probe and also maps to the vibration-probe component', 'Look-alike: V on a valve tag (XV, HV) is a valve, not vibration; check the first letter'],
  svg: svg(150, 100, c(40, 54, 26) + t(40, 63, 24, 'M') + r(66, 49, 7, 10, W) + p('M73 54H94', thin(1.6)) + bubble(116, 54, { r: 20, top: 'VE' })) })

S({ id: 'voting-annotation', name: 'Voting (MooN) annotation', cat: 'instruments', std: STD_I + ' / IEC 61511', physical: false, tags: [],
  drawn: 'Text such as 1oo2, 2oo2 or 2oo3 written beside the signal lines where two or more measurements join into one alarm, trip or SIS function.',
  meaning: 'M-out-of-N voting: 1oo2 trips when either of two sensors trips (safe, more spurious trips); 2oo2 needs both; 2oo3 needs any two of three. It shows how many field sensors exist: model N of them. Logic only, nothing physical beyond the sensors.',
  variants: ['Some legends put the voting inside the logic box (e.g. UZ 2oo3)', 'F&G uses the same notation for detector voting (2ooN confirmed gas or fire)'],
  svg: svg(150, 90, p('M10 20H70V50M10 80H70V50', dash('6 4')) + p('M70 50H126', dash('6 4')) + p('M118 44l8 6-8 6', thin(1.6)) + t(98, 38, 14, '1oo2')) })

S({ id: 'cms-system', name: 'Condition monitoring / machinery protection system (CMS)', cat: 'instruments', std: STD_I + ' / API 670', physical: false, tags: [],
  drawn: 'A rectangle labelled CMS (or MPS, VMS), or the letters CMS written beside vibration and bearing-temperature alarm functions.',
  meaning: 'The machinery protection and condition monitoring system: an API 670 rack that receives the VE / ZE / bearing TE signals, raises alarms and trips (often voted 1oo2 or 2oo2), and passes trends to analysis software. Not physical on the P&ID; in a twin the rack sits in an equipment-room system-cabinet.',
  variants: ['Some legends draw it as a DCS-style square with the CMS tag', 'The machine trip from the CMS usually goes to the motor MCC or the SIS'],
  svg: svg(130, 70, r(15, 15, 100, 40, W) + t(65, 41, 16, 'CMS') + p('M2 35H15M115 35H128', thin(1.6))) })
