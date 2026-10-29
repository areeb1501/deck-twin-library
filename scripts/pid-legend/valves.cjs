// Valves, check valves, relief devices, actuators and operators.
const { B, W, svg, p, c, r, t, thin, dash, bow, stubs, valve, stem, dome, arrow, cat, S } = require('./lib.cjs')

const STD_V = 'ISO 10628-2 (group 21, valves) / PIP PIC001'
const STD_C = 'ISO 10628-2 (group 22, check valves) / PIP PIC001'
const STD_R = 'ISO 10628-2 (group 23, safety valves and fittings) / PIP PIC001 / API 520'
const STD_A = 'ISA 5.1-2009/2022 (final control element actuators) / PIP PIC001'
const HV = ['HV']

cat('valves', 'Valves')
cat('check-valves', 'Check valves')
cat('relief', 'Relief, regulators and safety devices')
cat('actuators', 'Actuators, operators and valve accessories')

// ---------- valves ----------
S({ id: 'valve-gate', name: 'Gate valve', cat: 'valves', std: STD_V, component: 'gate-valve', physical: true, tags: HV,
  drawn: 'Two open triangles meeting tip to tip on the pipe (a bow-tie), with nothing in the middle. A handwheel stem (a T on top) is optional.',
  meaning: 'Manual isolation valve, normally fully open or fully closed, not for throttling. On PIP/ISA-style legends the plain bow-tie is the gate valve; on ISO 10628 drawings the plain bow-tie is a generic valve, so check the legend.',
  variants: ['ISO 10628-2: the plain bow-tie means "valve, general"', 'Filled (black) bow-tie: normally closed', 'Some legends add a short vertical bar at the tips to mean gate specifically', 'Size/class appear only in the line number, not in the symbol'],
  svg: svg(120, 52, valve(26)) })

S({ id: 'valve-globe', name: 'Globe valve', cat: 'valves', std: STD_V, component: 'globe-valve', physical: true, tags: HV,
  drawn: 'Bow-tie with a solid black dot where the triangle tips meet.',
  meaning: 'Manual throttling valve: regulating flow, control-valve bypasses, and vents and drains that are opened slowly. A globe body with an actuator on top is a control valve (see act-diaphragm).',
  variants: ['Some legends draw the dot as a small filled circle with a stem and handwheel', 'Bypass globe valves around a control valve are normally closed: the body or dot may be filled', 'Look-alikes: open circle = ball valve, small rectangle = plug valve'],
  svg: svg(120, 52, valve(26) + c(60, 26, 6, B)) })

S({ id: 'valve-ball', name: 'Ball valve', cat: 'valves', std: STD_V, component: 'ball-valve', physical: true, tags: HV,
  drawn: 'Bow-tie with an open (white) circle at the centre, where the tips meet.',
  meaning: 'Quarter-turn isolation valve: full-bore isolation, pigging lines, ESD and on/off duty when actuated. Small sizes have a lever, large ones a gear.',
  variants: ['Full-bore vs reduced-bore is usually written as FB / RB next to the symbol', 'Trunnion vs floating is not shown, only on the valve datasheet', 'Look-alikes: filled dot = globe valve, small rectangle = plug valve'],
  svg: svg(120, 52, valve(26) + c(60, 26, 8, W)) })

S({ id: 'valve-ball-encircled', name: 'Ball valve, encircled style', cat: 'valves', std: STD_V, component: 'ball-valve', physical: true, tags: HV,
  drawn: 'A circle large enough to enclose the bow-tie, so it reads as a circle with an X in it, usually between two flange bars on the line.',
  meaning: 'Ball valve in legends that draw the ball as a full circle around the bow-tie (common on European and NORSOK-style drawings). Becomes ball-valve; a filled bow-tie or NC beside it means normally closed.',
  variants: ['Check the sheet legend: a few legends use the encircled X for a general or special valve', 'Look-alike: a circle with an X on an electrical or lighting drawing is a lamp, not a valve'],
  svg: svg(120, 60, p('M4 30H38M82 30H116') + p('M38 14V46M82 14V46') + c(60, 30, 18) + p('M47 17L73 43M47 43L73 17')) })

S({ id: 'valve-butterfly', name: 'Butterfly valve', cat: 'valves', std: STD_V, component: 'butterfly-valve', physical: true, tags: HV,
  drawn: 'Two short vertical lines across the pipe (wafer body between flanges) with a diagonal line through the middle (the disc) and a dot at its centre (the shaft).',
  meaning: 'Quarter-turn disc valve used for large low-pressure lines: seawater, cooling water, firewater and HVAC. Can isolate or throttle.',
  variants: ['Very common alternative (PIP-style): a bow-tie with a vertical line through the centre and a dot', 'Some legends draw the disc as a thin ellipse instead of a line', 'Triple-offset (metal-seated) types are only identified on the datasheet'],
  svg: svg(120, 52, p('M4 26H44M76 26H116') + p('M44 10V42M76 10V42') + p('M50 40L70 12') + c(60, 26, 3.5, B)) })

S({ id: 'valve-plug', name: 'Plug valve', cat: 'valves', std: STD_V, component: 'plug-valve', physical: true, tags: HV,
  drawn: 'Bow-tie with a small upright rectangle (the plug) at the centre.',
  meaning: 'Quarter-turn valve with a tapered or cylindrical plug, often lubricated. Used for isolation in sandy or dirty service and on wellhead / manifold duties.',
  variants: ['Some legends fill the rectangle', 'Multi-port plug valves are drawn with three or four triangles (see the 3-way valve)', 'Look-alikes: open circle = ball valve, filled dot = globe valve'],
  svg: svg(120, 52, valve(26) + r(55, 16, 10, 20, W)) })

S({ id: 'valve-needle', name: 'Needle valve', cat: 'valves', std: STD_V, component: 'needle-valve', physical: true, tags: HV,
  drawn: 'Small bow-tie with a stem carrying a solid triangle pointing down onto the body (the needle), topped by a handwheel bar.',
  meaning: 'Fine-throttling instrument valve, ½" and below: instrument roots, gauge isolation, sample and purge lines. Usually not modelled at plant scale.',
  variants: ['Often drawn without the needle as a plain small bow-tie on an instrument impulse line', 'Instrument manifolds (2-, 3-, 5-valve) are drawn as boxes or groups of small valves'],
  svg: svg(120, 80, valve(54) + p('M60 54V18M48 18h24') + p('M53 32h14l-7 12z', B)) })

S({ id: 'valve-diaphragm', name: 'Diaphragm valve', cat: 'valves', std: STD_V, physical: true, tags: HV,
  drawn: 'Bow-tie with a curved arc (the diaphragm bonnet) spanning the top of the body where the tips meet, and a stem above.',
  meaning: 'Valve that closes by pressing an elastomer diaphragm onto a weir. Used for corrosive, slurry or chemical-injection service. No dedicated 3D component; use globe-valve and note the real type.',
  variants: ['Some legends draw a small dome or a horizontal bar above the tips', 'Weir type vs straight-through is only on the datasheet'],
  svg: svg(120, 60, valve(36) + p('M44 28a16 12 0 0 1 32 0') + p('M60 16V6M50 6h20')) })

S({ id: 'valve-pinch', name: 'Pinch valve', cat: 'valves', std: STD_V, physical: true, tags: HV,
  drawn: 'A flexible sleeve: two curved lines bowing in towards the centre between short end bars, with two solid arrowheads pressing in from above and below.',
  meaning: 'Valve that closes by squeezing a rubber sleeve. Used for slurry, sand and abrasive service. Rare offshore. No dedicated component; use a generic valve and note it.',
  variants: ['Legends vary widely: some show a bow-tie with "P" or "PINCH" beside it', 'Air-operated pinch valves show the air connection to the body'],
  svg: svg(120, 72, p('M4 36H30M90 36H116') + p('M30 18V54M90 18V54') + p('M30 18Q60 40 90 18M30 54Q60 32 90 54') + p('M54 4h12l-6 12z', B) + p('M54 68h12l-6-12z', B)) })

S({ id: 'valve-knife-gate', name: 'Knife gate valve', cat: 'valves', std: STD_V, component: 'knife-gate-valve', physical: true, tags: HV,
  drawn: 'Bow-tie with a thin upright rectangle (the knife blade) through the centre that rises above the body, then a stem and handwheel bar.',
  meaning: 'Gate valve with a sharpened blade that cuts through solids. Used for slurry, sand, drains and low-pressure bulk lines.',
  variants: ['Some legends draw only a vertical line through the tips', 'Look-alike: needle valve has a solid triangle on the stem, not a blade'],
  svg: svg(120, 72, valve(46) + r(56.5, 18, 7, 42, W) + p('M60 18V6M48 6h24')) })

S({ id: 'valve-angle', name: 'Angle valve', cat: 'valves', std: STD_V, physical: true, tags: HV,
  drawn: 'Two triangles at right angles: one pointing in from the side (inlet) and one pointing up from below (outlet), tips meeting, with a stem and handwheel on top.',
  meaning: 'Globe-type valve whose outlet is at 90° to the inlet. Common for drains, chokes and blowdown. A spring on top makes it a relief valve, not an angle valve.',
  variants: ['A dot at the tips makes it an angle globe valve', 'With an actuator it is an angle control valve', 'With a spring or a pilot box it is a PSV (see relief)'],
  svg: svg(120, 100, p('M4 40H30M60 70V96') + p('M30 24v32l30-16z') + p('M44 70h32L60 40z') + p('M60 40V12M48 12h24')) })

S({ id: 'valve-3way', name: 'Three-way valve', cat: 'valves', std: STD_V, physical: true, tags: ['HV', 'TV', 'XV'],
  drawn: 'Three triangles meeting tip to tip: left, right and one pointing up from below, each with a pipe stub. Usually carries an actuator or handwheel.',
  meaning: 'Diverting or mixing valve, e.g. a cooling-medium bypass (TCV) or a PSV changeover. With an actuator, arrows on the ports show the failed flow path. No dedicated component; use ball-valve or control-valve and note it.',
  variants: ['A filled triangle marks the port that is normally closed', 'PSV changeover (interlocked) valves are often drawn as a pair of 3-way valves joined by a dashed mechanical link', 'Plug-type 3-way bodies show a small rectangle at the centre'],
  svg: svg(120, 100, p('M4 40H30M90 40H116M60 70V96') + bow(60, 40) + p('M44 70h32L60 40z') + p('M60 40V12M48 12h24')) })

S({ id: 'valve-4way', name: 'Four-way valve', cat: 'valves', std: STD_V, physical: true, tags: ['HV', 'XV'],
  drawn: 'Four triangles meeting at one point, like two bow-ties crossed, with a pipe stub on every side.',
  meaning: 'Four-port diverter: flow reversal (e.g. backflushing a filter or a meter prover diverter). No dedicated component.',
  variants: ['Filled triangles mark closed ports', 'Prover four-way diverters are often drawn as a box labelled "4-way"'],
  svg: svg(120, 88, p('M4 44H30M90 44H116M60 14V2M60 74V86') + bow(60, 44) + p('M44 14h32L60 44zM44 74h32L60 44z')) })

S({ id: 'valve-normally-closed', name: 'Normally closed valve', cat: 'valves', std: STD_V, component: 'gate-valve', physical: true, tags: HV,
  drawn: 'Bow-tie with both triangles filled solid black.',
  meaning: 'The valve is closed in normal operation: drains, bypasses, crossovers, spare connections. Read the body type from the legend; the fill only means closed. Set the valve normally closed in the model.',
  variants: ['Some legends fill only the inner part, or write NC beside an open bow-tie', 'Filled globe, ball or plug valves keep their centre mark', 'A few old legends use filled bodies for check valves instead, so check the legend'],
  svg: svg(120, 52, valve(26, { fl: 1, fr: 1 })) })

for (const [id, name, txt, closed, how, mean] of [
  ['valve-locked-open', 'Locked open valve', 'LO', false, 'padlock or chain', 'The valve is locked in the open position, for example the isolation valves under a PSV or on a vent, so it cannot be shut by mistake. Model it as normally open and note "LO".'],
  ['valve-locked-closed', 'Locked closed valve', 'LC', true, 'padlock or chain', 'The valve is locked closed, for example a drain or a spool to a flare, so it cannot be opened by mistake. Model it as normally closed and note "LC".'],
  ['valve-car-sealed-open', 'Car-sealed open valve', 'CSO', false, 'numbered car seal (wire tag)', 'The valve is sealed open with a car seal. Breaking the seal needs a permit, and seals are audited. Typical on PSV inlet and outlet isolations. Model it as normally open and note "CSO".'],
  ['valve-car-sealed-closed', 'Car-sealed closed valve', 'CSC', true, 'numbered car seal (wire tag)', 'The valve is sealed closed with a car seal. Model it as normally closed and note "CSC".'],
]) {
  S({ id, name, cat: 'valves', std: 'PIP PIC001 / company legend practice', component: 'gate-valve', physical: true, tags: HV,
    drawn: `A valve body with the letters "${txt}" written beside or above it${closed ? '. The body is often drawn filled because the valve is closed' : ''}.`,
    meaning: `${mean} The lock or seal is a ${how}; the body type is read from the bow-tie, and gate-valve is only the default.`,
    variants: ['The letters can be below the body or at the end of a leader', 'Some legends add a small padlock or a "C" hook', 'Ball valves with LO/LC have an open circle in the bow-tie'],
    svg: svg(120, 66, valve(46, closed ? { fl: 1, fr: 1 } : {}) + t(60, 18, 15, txt)) })
}

S({ id: 'valve-float', name: 'Float-operated valve', cat: 'valves', std: STD_V, physical: true, tags: ['LCV', 'LV'],
  drawn: 'Bow-tie with a stem rising to a horizontal lever that ends in a circle (the float).',
  meaning: 'Self-acting level valve (ball-cock): tank make-up water, diesel day tank fill, drain pots. No instrument loop; the float moves the valve directly.',
  variants: ['Sometimes drawn with a dashed mechanical link from the valve to a float inside the tank', 'Tagged LCV (self-actuated level control valve)'],
  svg: svg(140, 92, valve(70) + p('M60 70V36H112') + c(60, 36, 3, B) + c(124, 36, 12)) })

S({ id: 'valve-double-block-bleed', name: 'Double block and bleed', cat: 'valves', std: 'PIP PIC001 / API 6D (DBB / DIB)', physical: true, tags: HV,
  drawn: 'Two isolation valves in series on the pipe with a small bleed valve on a branch between them, often inside a dashed box when it is a single-body DBB valve.',
  meaning: 'Positive isolation for maintenance: both blocks are shut and the cavity between them is bled to a safe place. Required on high-pressure hydrocarbon isolations and instrument connections. Model the block valves as ball-valve or gate-valve and list the bleed as not modelled.',
  variants: ['Single-body DBB valves (two balls in one body) are drawn as one box with two bow-ties', 'The bleed may go to a closed drain or a vent line', 'Instrument DBB manifolds are often shown as a single rectangle labelled DBB'],
  svg: svg(220, 82, p('M4 56H30M90 56H130M190 56H216') + bow(60, 56) + c(60, 56, 7, W) + bow(160, 56) + c(160, 56, 7, W) + p('M110 56V44') + p('M102 20h16l-8 12zM102 44h16l-8-12z') + p('M110 20V6')) })

S({ id: 'valve-damper', name: 'Damper (louvre)', cat: 'valves', std: 'ISO 10628-2 / HVAC practice (ISO 14617-8)', physical: true, tags: ['HD', 'FD', 'MD'],
  drawn: 'A rectangle across the duct with several parallel slanted blades inside.',
  meaning: 'Duct damper on HVAC, fired-heater stack or fan systems. A fire damper (FD) closes on fire; a gas-tight damper isolates enclosures on gas detection. No dedicated component.',
  variants: ['Single-blade dampers look like a butterfly valve on a duct', 'Fire dampers may be marked FD or carry a fusible-link note', 'Motorised dampers carry an M actuator'],
  svg: svg(120, 60, p('M4 30H36M84 30H116') + r(36, 10, 48, 40) + p('M42 22l12-8M42 38l33-22M52 46l28-19')) })

S({ id: 'choke-fixed', name: 'Fixed (positive) choke', cat: 'valves', std: 'API 6A / company wellhead legend', component: 'choke-valve', physical: true, tags: ['CH', 'FO'],
  drawn: 'An angle body (inlet triangle from the side, outlet triangle below) with a plain cap on top instead of a handwheel, and an orifice (a split bar) across the outlet.',
  meaning: 'Wellhead or manifold choke with a fixed-size bean (orifice). Changing rate means changing the bean, so there is no handwheel. Sits on the christmas-tree wing outlet.',
  variants: ['Some legends draw a bow-tie with "CH" or a bean (small black rectangle) inside', 'Bean size is written as a fraction of an inch in 64ths, e.g. 32/64"'],
  svg: svg(120, 100, p('M4 40H30M60 70V96') + p('M30 24v32l30-16z') + p('M44 70h32L60 40z') + p('M60 40V30') + r(50, 18, 20, 12) + p('M48 84H56M64 84H72')) })

S({ id: 'choke-adjustable', name: 'Adjustable choke', cat: 'valves', std: 'API 6A / ISO 14617 (adjustability arrow)', component: 'choke-valve', physical: true, tags: ['HCV', 'CH', 'PCV'],
  drawn: 'An angle body with a handwheel stem and a long diagonal arrow through the body (the ISO mark for "adjustable").',
  meaning: 'Wellhead choke whose opening is set by hand or by an actuator (with an actuator it is a choke control valve, often HCV or PCV). Controls well rate and drops pressure from wellhead to manifold.',
  variants: ['Actuated chokes carry a stepping actuator or an M motor', 'Some legends draw a bow-tie with a diagonal arrow', 'Choke position may be shown as % or 64ths'],
  svg: svg(120, 100, p('M4 40H30M60 70V96') + p('M30 24v32l30-16z') + p('M44 70h32L60 40z') + p('M60 40V12M48 12h24') + p('M30 82L86 22', thin(1.8)) + p('M86 22l-11 3 7 7z', B)) })

// ---------- check valves ----------
S({ id: 'check-general', name: 'Check valve (general)', cat: 'check-valves', std: STD_C, component: 'swing-check-valve', physical: true, tags: ['NRV', 'CV'],
  drawn: 'Bow-tie with the downstream (outlet) triangle filled black, and a flow arrow above it.',
  meaning: 'Non-return valve: flow only in the arrow direction. Found on pump discharges, compressor discharges and anywhere back-flow must be stopped. The filled side points the way flow goes. Swing type is the default when the legend does not say.',
  variants: ['ISA/US style: an open triangle against a vertical bar (the seat), with or without an arrow', 'Some legends draw "N" or "NRV" beside a plain bow-tie', 'Check the arrow, not the fill, for direction if the drawing is mirrored'],
  svg: svg(120, 80, valve(50, { fr: 1 }) + arrow(44, 20, 76)) })

S({ id: 'check-swing', name: 'Swing check valve', cat: 'check-valves', std: STD_C, component: 'swing-check-valve', physical: true, tags: ['NRV'],
  drawn: 'Two vertical end bars across the pipe with a disc hanging diagonally from a pivot dot at the top (the hinged clapper), and a flow arrow above.',
  meaning: 'Check valve with a hinged disc that swings open with flow. The usual type for horizontal liquid lines and large pipe.',
  variants: ['Often drawn simply as the general check (bow-tie with one side filled)', 'Tilting-disc check valves are drawn the same way'],
  svg: svg(120, 80, p('M4 50H40M80 50H116') + p('M40 32V68M80 32V68') + c(48, 36, 3, B) + p('M48 36L72 64') + arrow(44, 18, 76)) })

S({ id: 'check-lift', name: 'Lift (piston) check valve', cat: 'check-valves', std: STD_C, component: 'check-valve-piston', physical: true, tags: ['NRV'],
  drawn: 'Bow-tie with the outlet triangle filled and an open circle (the piston or disc) where the tips meet, with a flow arrow above.',
  meaning: 'Globe-pattern check valve with a piston or disc that lifts off its seat. Good for high pressure, small bore and pulsating flow (reciprocating pumps and compressors).',
  variants: ['Some legends draw a globe-valve body with an arrow', 'Look-alike: ball check (ball in front of a seat bar), stop-check (adds a handwheel)'],
  svg: svg(120, 80, valve(50, { fr: 1 }) + c(60, 50, 7, W) + arrow(44, 20, 76)) })

S({ id: 'check-ball', name: 'Ball check valve', cat: 'check-valves', std: STD_C, physical: true, tags: ['NRV'],
  drawn: 'An open triangle pointing downstream at a small black ball, which sits against a vertical bar (the seat).',
  meaning: 'Check valve with a free ball. Used on small lines, metering-pump discharges and chemical injection. No dedicated component; use check-valve-piston if it must be modelled.',
  variants: ['Some legends draw a bow-tie with a filled circle in the outlet side', 'Injection check valves at the quill are often drawn as this symbol'],
  svg: svg(120, 80, p('M4 50H30M66 50H116') + p('M30 34v32l26-16z') + c(60, 50, 6, B) + p('M66 34V66') + arrow(44, 20, 76)) })

S({ id: 'check-dual-plate', name: 'Dual-plate check valve', cat: 'check-valves', std: STD_C + ' / API 594', component: 'dual-plate-check-valve', physical: true, tags: ['NRV'],
  drawn: 'Two vertical bars (a wafer between flanges) with two short plates hinged at the centre and opening downstream in a "<" shape, and a flow arrow above.',
  meaning: 'Wafer check valve with two spring-loaded half-discs on a central hinge pin. Short and light, so common on compressor and pump discharges and on large water lines.',
  variants: ['Many legends just use the general check symbol and write "dual plate" or "DPC"', 'Some draw a single vertical bar with a filled triangle'],
  svg: svg(120, 80, p('M4 50H44M76 50H116') + p('M44 32V68M76 32V68') + c(54, 50, 2.5, B) + p('M54 50L70 38M54 50L70 62') + arrow(44, 18, 76)) })

S({ id: 'check-stop', name: 'Stop-check valve', cat: 'check-valves', std: STD_C, physical: true, tags: ['NRV'],
  drawn: 'A lift check (bow-tie, outlet filled, open circle at the centre) with a stem and handwheel on top, and a flow arrow beside it.',
  meaning: 'Screw-down non-return valve: acts as a check valve, but the handwheel can also hold it shut. Used on boiler feeds and parallel pump discharges. No dedicated component; use check-valve-piston and note the handwheel.',
  variants: ['Some legends draw a globe valve with an arrow and a handwheel'],
  svg: svg(120, 80, valve(54, { fr: 1 }) + c(60, 54, 7, W) + p('M60 47V20M48 20h24') + arrow(80, 22, 110)) })

// ---------- relief ----------
const angleBody = p('M60 94V118M90 64H116') + p('M44 94h32L60 64zM90 48v32L60 64z')
S({ id: 'psv-spring', name: 'Pressure safety valve (spring loaded)', cat: 'relief', std: STD_R + ' / ISA 5.1', component: 'pressure-safety-valve', physical: true, tags: ['PSV', 'PRV', 'TSV', 'SV'], isa: ['PSV', 'PRV', 'TSV'],
  drawn: 'An angle body with the inlet from below and the outlet to the side, and a zig-zag spring on top capped by a short bar. A PSV bubble with the loop number usually sits beside it (not drawn here), with the set pressure and the orifice size (e.g. "3L4").',
  meaning: 'Last-line overpressure protection. It lifts at the set pressure and relieves to flare, vent or atmosphere. Inlet size, orifice letter and outlet size read "3L4" = 3" inlet, L orifice, 4" outlet. TSVs are small thermal-relief valves on blocked-in liquid lines.',
  variants: ['Bellows-balanced PSVs have a small bellows drawn under the spring', 'Some legends draw a straight-through body with a spring', 'PSVs often sit between LO/CSO isolation valves, with a spare PSV on a changeover valve'],
  svg: svg(120, 120, angleBody + p('M60 64V58l-10-4 20-6-20-6 20-6-20-6 10-4V22M48 22h24')) })

S({ id: 'psv-pilot', name: 'Pilot-operated relief valve', cat: 'relief', std: STD_R, component: 'pressure-safety-valve', physical: true, tags: ['PSV'], isa: ['PSV'],
  drawn: 'An angle relief body with a piston chamber (a box) on top instead of a spring, and a small spring-loaded pilot beside it with a sensing line back to the inlet.',
  meaning: 'Relief valve whose main piston is held shut by inlet pressure and released by a small pilot. Tight up to the set point, so used where operating pressure is close to set pressure (gas export, large flare loads).',
  variants: ['The pilot can be drawn as a small PSV symbol or a box with "P"', 'Remote-sensing pilots have the sensing line run to the vessel, not the valve inlet'],
  svg: svg(120, 120, angleBody + p('M60 64V50') + r(44, 26, 32, 24) + p('M44 40H76', thin(1.8)) + r(10, 28, 20, 16) + p('M20 28l-5-3 10-3-10-3 10-3-5-3', thin(1.8)) + p('M30 36H44M20 44V106H60', thin(1.6))) })

S({ id: 'breather-valve', name: 'Pressure-vacuum (breather) valve', cat: 'relief', std: STD_R + ' / API 2000', physical: true, tags: ['PVRV', 'PSV'],
  drawn: 'A housing on a tank nozzle with two arrows inside: one pointing up (pressure relief out) and one pointing down (vacuum relief in), each over a weighted pallet.',
  meaning: 'Tank breather valve on atmospheric tanks (API 650/2000). It vents vapour when the tank fills or heats and lets air in when it empties. No dedicated component; note it on the storage-tank.',
  variants: ['Vacuum breakers alone show only the down arrow', 'Often combined with a flame arrester below it', 'Some legends draw a PSV symbol with "P/V" beside it'],
  svg: svg(120, 120, p('M60 92V118') + r(30, 48, 60, 44) + p('M46 32V78', thin(1.8)) + p('M40 72l6 10 6-10z', B) + p('M74 82V36', thin(1.8)) + p('M68 42l6-10 6 10z', B) + p('M40 48V40M80 48V40')) })

S({ id: 'rupture-disc', component: 'rupture-disc', name: 'Rupture disc (bursting disc)', cat: 'relief', std: STD_R + ' / ISO 4126-2', physical: true, tags: ['PSE', 'RD', 'BD'], isa: ['PSE'],
  drawn: 'Two short parallel bars (the holder) across a vertical pipe, with a curved arc between them bulging towards the outlet.',
  meaning: 'Non-reclosing relief device that bursts at a set pressure. Used alone, or under a PSV to protect it from corrosion (then a pressure gauge or PI is drawn between them). ISA tag is PSE. Becomes rupture-disc.',
  variants: ['Some legends draw a vertical pipe with a dashed or zig-zag line across it', 'Buckling-pin relief valves are drawn as a body with a pin and tagged PSE too'],
  svg: svg(120, 116, p('M60 112V72M60 48V6') + p('M38 72H82M38 48H82') + p('M40 68Q60 40 80 68')) })

S({ id: 'flame-arrester', name: 'Flame arrester', cat: 'relief', std: STD_R + ' / ISO 16852', physical: true, tags: ['FA'],
  drawn: 'An in-line rectangle on the pipe with zig-zag lines inside (the crimped-metal element).',
  meaning: 'Passive device that stops a flame front passing down a vent line or into a tank. Found on tank vents, drain-tank vents and on vent stacks. No dedicated component.',
  variants: ['Detonation arresters are drawn the same and marked "DA"', 'Some legends use a rectangle with crossed diagonal hatching'],
  svg: svg(120, 64, p('M4 32H36M84 32H116') + r(36, 12, 48, 40) + p('M52 12l-5 5 10 5-10 5 10 5-10 5 10 5-5 5M68 12l-5 5 10 5-10 5 10 5-10 5 10 5-5 5', thin(1.8))) })

S({ id: 'regulator-pressure', name: 'Self-actuated pressure regulator (PCV)', cat: 'relief', std: 'ISA 5.1-2009 (self-actuated regulators) / PIP PIC001', physical: true, tags: ['PCV'], isa: ['PCV'],
  drawn: 'A bow-tie body with a diaphragm dome on its stem, a spring above the dome, and a thin sensing line from the dome to the pipe downstream of the valve.',
  meaning: 'Pressure-reducing regulator with no instrument loop: downstream pressure acts on the diaphragm directly. Fuel gas, instrument air, nitrogen and blanket gas. Tag PCV. No dedicated component; control-valve is the closest stand-in.',
  variants: ['Internal sensing: no external line is drawn', 'Some legends draw the sensing line as a dashed or plain thin line', 'Blanketing regulators sit on a tank roof'],
  svg: svg(120, 108, valve(86) + p('M60 86V54') + dome(60, 54, 18) + p('M60 36l-7-3 14-4-14-4 14-4-7-3', thin(1.8)) + p('M78 50H104V86', thin(1.6))) })

S({ id: 'regulator-back-pressure', name: 'Back-pressure regulator', cat: 'relief', std: 'ISA 5.1-2009 (self-actuated regulators) / PIP PIC001', physical: true, tags: ['PCV', 'BPR'], isa: ['PCV'],
  drawn: 'Like the pressure regulator, but the thin sensing line runs from the dome to the pipe upstream of the valve.',
  meaning: 'Holds upstream pressure: it opens as upstream pressure rises. Used on separator gas outlets to flare, pump minimum-flow and seal systems. No dedicated component.',
  variants: ['Some legends write "BPR" beside it', 'Look at which side the sensing line goes to; that is the controlled side'],
  svg: svg(120, 108, valve(86) + p('M60 86V54') + dome(60, 54, 18) + p('M60 36l-7-3 14-4-14-4 14-4-7-3', thin(1.8)) + p('M42 50H16V86', thin(1.6))) })

S({ id: 'regulator-temperature', name: 'Self-actuated temperature regulator', cat: 'relief', std: 'ISA 5.1-2009 (self-actuated regulators, filled-system capillary)', physical: true, tags: ['TCV'], isa: ['TCV'],
  drawn: 'A bow-tie body with a diaphragm dome, and a capillary (line with small × marks) running from the dome to a sensing bulb.',
  meaning: 'Thermostatic valve driven by a filled bulb: lube-oil coolers, tracing and jacket water. No instrument loop and no dedicated component.',
  variants: ['The bulb may be drawn as a thermowell in the process line', 'Wax-element 3-way thermostatic valves are drawn as a 3-way valve with TCV'],
  svg: svg(132, 108, valve(86) + p('M60 86V54') + dome(60, 54, 18) + p('M78 46H112', thin(1.4)) + p('M86 42l6 8M92 42l-6 8M100 42l6 8M106 42l-6 8', thin(1.4)) + r(112, 40, 14, 12, B)) })

S({ id: 'excess-flow-valve', name: 'Excess-flow valve', cat: 'relief', std: 'ISO 10628-2 / company legend practice', physical: true, tags: ['EFV'],
  drawn: 'A bow-tie with a spring drawn inside the inlet triangle and a flow arrow above.',
  meaning: 'Closes automatically when flow exceeds a set rate (a line break downstream). Found on instrument connections, LPG and chemical lines. No dedicated component.',
  variants: ['Usually just a check-valve-like symbol tagged EFV', 'Some legends write "XS" or "EFV" next to a plain bow-tie'],
  svg: svg(120, 80, valve(50) + p('M34 50l3-5 4 10 4-10 4 10 4-10 3 5', thin(1.6)) + arrow(44, 20, 76)) })

// ---------- actuators ----------
const V = (o = {}) => valve(86, o)
S({ id: 'op-handwheel', name: 'Handwheel operator', cat: 'actuators', std: STD_A, component: 'gate-valve', physical: true, tags: HV,
  drawn: 'A valve body with a stem and a short horizontal bar on top (the handwheel), a "T".',
  meaning: 'Manual valve operated by a handwheel. The body below tells the valve type; the handwheel just confirms it is manual. Tag HV if it has one.',
  variants: ['Most legends omit the handwheel on manual valves altogether', 'Hand-operated control valves are tagged HCV'],
  svg: svg(120, 104, V() + stem(60, 86, 50, true)) })

S({ id: 'op-lever', name: 'Lever operator', cat: 'actuators', std: STD_A, component: 'ball-valve', physical: true, tags: HV,
  drawn: 'A ball-valve body with a short stem and a lever drawn as a slanted line from the top of the stem.',
  meaning: 'Quarter-turn valve with a lever handle: small ball, plug and butterfly valves (typically 4" and below).',
  variants: ['Some legends draw the lever horizontally', 'A padlock or "LO" beside the lever means locked open'],
  svg: svg(120, 104, V() + c(60, 86, 8, W) + p('M60 78V58L98 42') + c(60, 58, 3, B)) })

S({ id: 'op-gear', name: 'Gear operator', cat: 'actuators', std: STD_A, component: 'ball-valve', physical: true, tags: HV,
  drawn: 'A valve body with a small square box (gearbox) on its stem, and a handwheel shaft coming out of the side of the box.',
  meaning: 'Manual valve with a gearbox, for large or high-pressure quarter-turn valves (ball, plug, butterfly) where a lever would be too hard to move.',
  variants: ['Some legends draw a handwheel T with "G" or "GO" beside it', 'Bevel-gear operators on gate valves are drawn the same'],
  svg: svg(120, 104, V() + c(60, 86, 8, W) + p('M60 78V62') + r(46, 38, 28, 24) + p('M74 50H94M94 38v24')) })

S({ id: 'op-handwheel-indicator', name: 'Manual operator with position indicator', cat: 'actuators', std: STD_A + ' (local indication)', physical: true, tags: HV, isa: ['ZI'],
  drawn: 'A handwheel valve with a small half-round dial with a pointer beside the stem, or a ZI bubble linked to the stem.',
  meaning: 'Manual valve with a local open/closed position indicator, often required on firewater and deluge isolation valves so the position can be checked at a glance.',
  variants: ['ISA style: a ZI bubble joined to the stem by a short line', 'Rising-stem gate valves are sometimes noted "OS&Y" (outside screw and yoke) instead'],
  svg: svg(120, 104, V() + stem(60, 86, 46, true) + p('M72 66a12 12 0 0 1 24 0z') + p('M84 66l7-9', thin(1.8)) + p('M60 66H72', thin(1.6))) })

S({ id: 'act-diaphragm', name: 'Diaphragm actuator (control valve)', cat: 'actuators', std: STD_A, component: 'control-valve', physical: true, tags: ['FV', 'LV', 'PV', 'TV', 'FCV', 'LCV', 'PCV', 'TCV'], isa: ['FV', 'LV', 'PV', 'TV', 'HV'],
  drawn: 'A bow-tie (often with a globe dot) with a stem and a dome-shaped head on top (a half circle sitting on a flat bar).',
  meaning: 'Pneumatic spring-diaphragm actuator: the classic modulating control valve. Its tag (FV/LV/PV/TV) names the loop, and FO/FC beside it gives the fail position. Becomes control-valve.',
  variants: ['The dome may be drawn flat-topped or as a full ellipse', 'A positioner box on the stem is common', 'The body may be a butterfly or ball with the same dome for rotary control valves'],
  svg: svg(120, 108, V() + p('M60 86V50') + dome(60, 50)) })

S({ id: 'act-positioner', name: 'Valve positioner', cat: 'actuators', std: STD_A, component: 'control-valve', physical: true, tags: ['ZC', 'FY', 'LY', 'PY'], isa: ['ZC'],
  drawn: 'A control valve with a small box on the stem below the dome (the positioner), joined to the stem, with a signal line entering the box.',
  meaning: 'Positioner on a control valve: compares the controller signal with stem position and drives the actuator. An accessory of the control valve; it is not modelled separately.',
  variants: ['Smart (HART/fieldbus) positioners may be shown as a bubble with ZC or as a box with "P"', 'Many P&IDs omit the positioner and show it only in the instrument index'],
  svg: svg(120, 108, V() + p('M60 86V50') + dome(60, 50) + r(80, 56, 22, 16) + p('M60 64H80', thin(1.6)) + p('M91 56V36', thin(1.6)) + p('M86 50l8-5M86 44l8-5', thin(1.4))) })

S({ id: 'act-piston-spring', name: 'Piston actuator, single acting (spring return)', cat: 'actuators', std: STD_A, component: 'esd-valve', physical: true, tags: ['ESDV', 'SDV', 'XV'], isa: ['XV', 'SDV'],
  drawn: 'A valve with a rectangle (the cylinder) on its stem; inside it a horizontal line (the piston) with a zig-zag spring above it.',
  meaning: 'Air or hydraulic cylinder with spring return. On/off shutdown valves (ESDV, SDV, XV) use it so the spring drives the valve safe on loss of air. With an ESDV/SDV/XV tag it becomes esd-valve; with BDV it becomes blowdown-valve.',
  variants: ['Spring and piston are often omitted: a plain rectangle on the stem', 'Scotch-yoke quarter-turn actuators are drawn the same on a ball valve', 'ISA 5.1-2009 draws the piston actuator as a rectangle with the stem through it'],
  svg: svg(120, 108, V() + c(60, 86, 8, W) + p('M60 78V46') + r(38, 20, 44, 34) + p('M40 46H80') + p('M60 46l-8-3 16-4-16-4 16-4-8-3', thin(1.6))) })

S({ id: 'act-piston-double', name: 'Piston actuator, double acting', cat: 'actuators', std: STD_A, physical: true, tags: ['XV', 'HV'], isa: ['XV'],
  drawn: 'A rectangle (cylinder) on the valve stem with a piston line across the middle and a signal port into each end, with no spring.',
  meaning: 'Cylinder powered in both directions. It stays put on loss of air (fail last), so it is used where the valve must not move on air failure, or with an accumulator. On/off valves (XV) mostly; use esd-valve only if the tag says ESDV/SDV.',
  variants: ['Ports may be drawn as short stubs with pneumatic (//) or hydraulic (L) marks', 'Often noted "FL" or "fail last"'],
  svg: svg(120, 108, V() + c(60, 86, 8, W) + p('M60 78V38') + r(38, 20, 44, 34) + p('M40 38H80') + p('M38 28H24M38 46H24')) })

S({ id: 'act-motor', name: 'Electric motor actuator (MOV)', cat: 'actuators', std: STD_A, component: 'motor-operated-valve', physical: true, tags: ['MOV', 'XV', 'HV'], isa: ['XV', 'HV'],
  drawn: 'A valve with a circle containing "M" on top of its stem.',
  meaning: 'Electric motor actuator: large isolation valves, pipeline and firewater valves, and tank valves where air is not available. It fails in place (last position) on power loss.',
  variants: ['Some legends draw a square with M', 'An integral control unit may be shown as a small box beside the M'],
  svg: svg(120, 104, V() + p('M60 86V56') + c(60, 38, 18) + t(60, 44, 16, 'M')) })

S({ id: 'act-solenoid', name: 'Solenoid actuator / solenoid valve (SOV)', cat: 'actuators', std: STD_A, physical: true, tags: ['SOV', 'XY', 'XV'], isa: ['XY', 'XV'],
  drawn: 'A square box containing "S" on the stem of a small valve, or a small S box on the air supply to a larger actuator.',
  meaning: 'Solenoid. On its own small valve it is a solenoid valve; on the air line of an ESDV actuator it is the SOV that vents the actuator to trip the valve. An accessory, not modelled separately; the main valve is what becomes esd-valve or blowdown-valve.',
  variants: ['Manual-reset solenoids add "R" in the box or beside it', 'De-energise-to-trip vs energise-to-trip is written on the C&E, not the symbol'],
  svg: svg(120, 104, V() + p('M60 86V58') + r(42, 26, 36, 32) + t(60, 49, 18, 'S')) })

S({ id: 'act-electro-hydraulic', name: 'Electro-hydraulic actuator', cat: 'actuators', std: STD_A, physical: true, tags: ['XV', 'ESDV', 'SDV'], isa: ['XV'],
  drawn: 'A rectangle on the valve stem marked "EH".',
  meaning: 'Self-contained actuator with its own electric pump and hydraulic cylinder. Used for remote, large or subsea-tie-in valves where there is no air. ESD duty makes it an esd-valve in the model.',
  variants: ['Some legends draw a hydraulic cylinder with an M beside it'],
  svg: svg(120, 104, V() + p('M60 86V56') + r(36, 26, 48, 30) + t(60, 47, 16, 'EH')) })

S({ id: 'act-hydraulic', name: 'Hydraulic actuator', cat: 'actuators', std: STD_A, physical: true, tags: ['XV', 'SSV', 'SCSSV'], isa: ['XV'],
  drawn: 'A cylinder rectangle on the stem with a piston line and "H", fed by a hydraulic signal line (a line with "L" marks).',
  meaning: 'Hydraulically powered cylinder, typical on wellhead valves (SSV/USV, wing valves) supplied from the wellhead HPU through the wellhead control panel.',
  variants: ['Wellhead surface safety valves are often drawn as a gate with a hydraulic piston and spring, tagged SSV or USV', 'The hydraulic supply line may be drawn without marks and just labelled HPU'],
  svg: svg(132, 108, V() + p('M60 86V46') + r(38, 20, 44, 34) + p('M40 46H80') + t(60, 40, 13, 'H') + p('M82 30H128', thin(1.6)) + p('M96 24v10h5M114 24v10h5', thin(1.4))) })

S({ id: 'valve-esdv', name: 'Emergency shutdown valve (ESDV)', cat: 'actuators', std: STD_A + ' / API 6D', component: 'esd-valve', physical: true, tags: ['ESDV', 'SDV', 'XV', 'SSIV'], isa: ['XV', 'UV'],
  drawn: 'A ball (or gate) valve with a spring-return cylinder on the stem, a small "S" box on its air supply, and "FC" written under the body.',
  meaning: 'Shutdown valve tripped by the ESD/PSD system. It fails closed: the spring shuts it when the SOV vents the air. Inlet, outlet, riser and fuel-gas isolations. Becomes esd-valve.',
  variants: ['Some companies tag it SDV or XV; riser valves are often ESDV-R…', 'The body may be drawn filled when normally closed', 'Partial-stroke test devices and limit switches (ZSO/ZSC) are often drawn beside it'],
  svg: svg(120, 120, V() + c(60, 86, 8, W) + p('M60 78V56') + r(42, 26, 36, 30) + p('M60 52l-7-3 14-4-14-4 14-4-7-3', thin(1.6)) + r(88, 16, 20, 18) + t(98, 30, 13, 'S') + p('M78 34H88', thin(1.6)) + t(60, 116, 13, 'FC')) })

S({ id: 'valve-bdv', name: 'Blowdown valve (BDV)', cat: 'actuators', std: STD_A + ' / API 521', component: 'blowdown-valve', physical: true, tags: ['BDV'], isa: ['BDV'],
  drawn: 'A valve body drawn filled (normally closed) with a spring-return actuator, an "S" box, and "FO" under the body. Its outlet goes to flare.',
  meaning: 'Depressuring valve. Closed in operation and opens on ESD or fire to blow inventory down to the flare (API 521: typically to 50 % or 6.9 barg within 15 min). Fails open. Becomes blowdown-valve.',
  variants: ['Usually followed by a restriction orifice (RO) to limit the flow', 'Tagged BDV, or XV with an FO mark'],
  svg: svg(120, 120, V({ fl: 1, fr: 1 }) + c(60, 86, 8, W) + p('M60 78V56') + r(42, 26, 36, 30) + p('M60 52l-7-3 14-4-14-4 14-4-7-3', thin(1.6)) + r(88, 16, 20, 18) + t(98, 30, 13, 'S') + p('M78 34H88', thin(1.6)) + t(60, 116, 13, 'FO')) })

// fail-action marks
const cvBase = V() + p('M60 86V50') + dome(60, 50)
const failArrow = {
  FO: p('M52 70l8-8 8 8', thin(2.2)),
  FC: p('M52 62l8 8 8-8', thin(2.2)),
  FL: p('M50 64H70M50 72H70', thin(2.2)),
  FI: p('M50 68H70', thin(2.2)),
}
const failName = { FO: 'Fail open', FC: 'Fail closed', FL: 'Fail locked (last position)', FI: 'Fail indeterminate' }
const failMean = {
  FO: 'On loss of air, power or signal the valve goes fully open. Typical for blowdown valves, cooling-water valves and anti-surge recycle valves.',
  FC: 'On loss of air, power or signal the valve goes fully closed. Typical for ESD valves, feed and fuel valves.',
  FL: 'On loss of motive power the valve stays where it was. Typical for motor-operated and double-acting valves.',
  FI: 'The fail position is not defined: the valve may drift. Seen on double-acting actuators without a lock-up.',
}
const failArrowDrawn = {
  FO: 'an upward arrowhead drawn on the stem between body and actuator',
  FC: 'a downward arrowhead drawn on the stem between body and actuator',
  FL: 'two short horizontal bars across the stem between body and actuator',
  FI: 'one short horizontal bar across the stem between body and actuator',
}
for (const k of ['FO', 'FC', 'FL', 'FI']) {
  S({ id: `fail-${k.toLowerCase()}-arrow`, name: `${failName[k]} (${k}), arrow form`, cat: 'actuators', std: 'ISA 5.1 (actuator action on failure)', physical: false, tags: [], isa: [k],
    drawn: `A control valve with ${failArrowDrawn[k]}.`,
    meaning: `${failMean[k]} It is a property of the valve (set its fail action to ${k}), not a separate item.`,
    variants: ['The letter form writes the letters below the body instead', 'The bar forms for FL/FI come from secondary sources describing ISA 5.1 and are less widely used than the letters; check the legend', 'On 3-way valves, arrows on the ports show the failed flow path'],
    svg: svg(120, 108, cvBase + failArrow[k]) })
}
for (const k of ['FO', 'FC', 'FL', 'FI']) {
  S({ id: `fail-${k.toLowerCase()}-letters`, name: `${failName[k]} (${k}), letter form`, cat: 'actuators', std: 'ISA 5.1 / PIP PIC001', physical: false, tags: [], isa: [k],
    drawn: `The letters "${k}" written just below (sometimes beside) a valve body.`,
    meaning: `${failMean[k]} Set the valve's fail action to ${k}.`,
    variants: [k === 'FL' ? 'Also written "FLP" or "FAIL LAST"' : 'Some legends write "AO/AC" (air to open / air to close) instead. Air-to-open means fail closed', 'The fail position is the shelf (no-air) position, not the normal operating position'],
    svg: svg(120, 120, cvBase + t(60, 116, 14, k)) })
}

S({ id: 'limit-switches', name: 'Valve limit switches (ZSO / ZSC)', cat: 'actuators', std: 'ISA 5.1-2009', physical: true, tags: ['ZSO', 'ZSC', 'ZSH', 'ZSL'], isa: ['ZSO', 'ZSC', 'ZSH', 'ZSL', 'ZS'],
  drawn: 'Two small bubbles marked ZSO and ZSC on either side of an actuated valve, joined to the stem by a short line.',
  meaning: 'Open and closed position switches on an actuated valve, wired to the DCS/SIS for valve status and ESD verification. Valve accessories: keep them as notes on the valve, not as separate items.',
  variants: ['Older drawings use ZSH (open) / ZSL (closed)', 'Sometimes one bubble "ZS" with "O/C" beside it', 'Transmitters of valve position are ZT'],
  svg: svg(160, 110, stubs(80, 86, 30, 8, 152) + bow(80, 86) + p('M80 86V50') + dome(80, 50) + p('M39 66H121', thin(1.6)) + c(24, 66, 15, W) + t(24, 70, 11, 'ZSC') + c(136, 66, 15, W) + t(136, 70, 11, 'ZSO')) })

S({ id: 'ip-converter', name: 'I/P converter', cat: 'actuators', std: 'ISA 5.1-2009 (function block)', physical: true, tags: ['FY', 'LY', 'PY', 'TY'], isa: ['FY', 'LY', 'PY', 'TY'],
  drawn: 'A bubble with "Y" as the second letter (e.g. FY) with a small square beside it containing "I/P". An electric (dashed) signal goes in and a pneumatic (//) signal comes out.',
  meaning: 'Converts the 4–20 mA controller output to a 0.2–1 barg air signal for the actuator. Often built into the positioner. Accessory of the control valve; not modelled separately.',
  variants: ['Function-block letters may be E/P or I/P', 'Behind-panel Y functions have a dashed bar in the bubble'],
  svg: svg(130, 100, p('M4 36H22', dash('6 4') + ' ' + thin(1.6)) + c(42, 36, 20, W) + t(42, 41, 13, 'FY') + r(70, 24, 30, 24) + t(85, 41, 11, 'I/P') + p('M62 36H70', thin(1.4)) + p('M42 56V96', thin(1.6)) + p('M36 74l10-6M36 82l10-6', thin(1.4))) })

S({ id: 'hand-switch', name: 'Hand switch (HS)', cat: 'actuators', std: 'ISA 5.1-2009', physical: true, tags: ['HS'], isa: ['HS', 'HSS', 'HZ'],
  drawn: 'A bubble with "HS" and a number, with an electric (dashed) signal line to the device it operates.',
  meaning: 'Push-button or selector: local start/stop for a motor, open/close for an MOV, a manual ESD push-button (often HS with a solid bar = control room). Field HS buttons are usually on a local control station (local-control-station).',
  variants: ['A solid bar in the bubble means panel/console mounted', 'ESD push-buttons are sometimes HZ or ESD-PB'],
  svg: svg(120, 64, c(30, 32, 20, W) + t(30, 37, 14, 'HS') + p('M50 32H116', dash('6 4') + ' ' + thin(1.6))) })
