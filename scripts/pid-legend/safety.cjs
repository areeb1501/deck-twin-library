// Fire & gas devices and fire protection, and electrical single-line symbols.
const { B, W, svg, p, c, r, t, thin, dash, bow, valve, cat, S } = require('./lib.cjs')

const STD_FG = 'Offshore F&G layout practice (ISA 5.1-style letter codes) / ISO 7240 / NFPA 72'
const STD_FP = 'NFPA 15 / NFPA 13 / NFPA 20 / ISO 13702 (fire protection) / company legend practice'
const STD_EL = 'IEC 60617 (single-line diagram symbols)'

cat('fire-gas', 'Fire & gas and fire protection')
cat('electrical', 'Electrical (single-line)')

const det = (letters, extra = '', fs = 14) => svg(100, 80, c(50, 40, 24, W) + t(50, 40 + fs * 0.36, fs, letters) + extra)
S({ id: 'fg-gas-detector', name: 'Point gas detector (flammable)', cat: 'fire-gas', std: STD_FG, component: 'point-gas-detector', physical: true, tags: ['GD', 'GT', 'AT'], isa: ['AT', 'AE'],
  drawn: 'A small bubble (or hexagon or triangle, by legend) with "GD", often with the gas noted (HC, CH4) and the zone or voting group beside it.',
  meaning: 'Catalytic or infrared point detector for flammable gas, alarming at about 20 % LEL and confirming at about 60 % LEL with 2ooN voting. Maps to the point-gas-detector component.',
  variants: ['F&G layouts differ widely: circles, triangles or hexagons with GD, IR, HC or "G"', 'P&IDs may draw it as an ISA bubble AT/AE with "LEL"', 'Duct (HVAC inlet) detectors are drawn on the duct'],
  svg: det('GD') })

S({ id: 'fg-toxic-gas-detector', name: 'Toxic gas detector (H2S, CO)', cat: 'fire-gas', std: STD_FG, component: 'toxic-gas-detector', physical: true, tags: ['GD', 'TD', 'AT'], isa: ['AT'],
  drawn: 'A detector bubble marked with the toxic gas, usually "H2S" (or "CO").',
  meaning: 'Electrochemical toxic gas detector, usually H2S with alarms at about 5 and 10 ppm. Maps to the toxic-gas-detector component. Hydrogen detectors (battery rooms) are marked "H2" and map to the hydrogen-detector component.',
  variants: ['Some legends use a triangle with T or TOX'],
  svg: det('H2S', '', 13) })

S({ id: 'fg-open-path', name: 'Open-path (line-of-sight) gas detector', cat: 'fire-gas', std: STD_FG, component: 'open-path-gas-detector', physical: true, tags: ['OGD', 'OPGD', 'LOS'], isa: [],
  drawn: 'A transmitter box and a receiver box joined by a dashed beam line, marked OGD or Tx/Rx.',
  meaning: 'Infrared beam detector covering a path (LEL·m), for perimeters and modules. Maps to the open-path-gas-detector component.',
  variants: ['Some legends draw a single box with a long dashed arrow'],
  svg: svg(180, 60, r(6, 18, 26, 24) + t(19, 35, 12, 'T') + p('M32 30H148', thin(1.8) + ' ' + dash('8 5')) + p('M148 30l-10-5v10z', B) + r(148, 18, 26, 24) + t(161, 35, 12, 'R')) })

S({ id: 'fg-acoustic-leak-detector', name: 'Acoustic (ultrasonic) gas leak detector', cat: 'fire-gas', std: STD_FG, component: 'acoustic-gas-leak-detector', physical: true, tags: ['UGD', 'AGD', 'UGLD'], isa: [],
  drawn: 'A detector bubble with "UGD" and curved sound arcs beside it.',
  meaning: 'Ultrasonic leak detector that senses the sound of high-pressure gas leaks, independent of wind dilution. Maps to the acoustic-gas-leak-detector component.',
  variants: ['Some legends mark it "AGLD" or draw a microphone symbol'],
  svg: svg(120, 80, c(46, 40, 24, W) + t(46, 45, 13, 'UGD') + p('M76 30a14 14 0 0 1 0 20M84 24a22 22 0 0 1 0 32M92 18a30 30 0 0 1 0 44', thin(1.6))) })

S({ id: 'fg-flame-detector', name: 'Flame detector', cat: 'fire-gas', std: STD_FG, component: 'flame-detector', physical: true, tags: ['FD', 'BS', 'IR3'], isa: ['BE', 'BS'],
  drawn: 'A detector bubble with "FD" and a dashed cone showing its field of view.',
  meaning: 'Optical flame detector (IR3, UV/IR), voting 2ooN for confirmed fire. Maps to the flame-detector component.',
  variants: ['ISA letter B (burner, combustion) is used on some P&IDs: BE or BS', 'The cone shows the aiming direction on F&G layouts'],
  svg: svg(130, 80, c(34, 40, 24, W) + t(34, 45, 14, 'FD') + p('M58 34L124 10M58 46L124 70', thin(1.6) + ' ' + dash('6 4')) + p('M116 12a40 40 0 0 1 0 56', thin(1.4) + ' ' + dash('3 3'))) })

S({ id: 'fg-heat-detector', name: 'Heat detector', cat: 'fire-gas', std: STD_FG, component: 'heat-detector', physical: true, tags: ['HD', 'TS'], isa: ['TSH'],
  drawn: 'A detector bubble with "HD" (sometimes a TSH bubble, or a square in building legends).',
  meaning: 'Fixed-temperature or rate-of-rise heat detector in enclosures, turbine hoods and accommodation. Maps to the heat-detector component.',
  variants: ['Building fire-alarm legends (NFPA 170, BS 5839) use their own forms; check the legend', 'Linear heat-detection cable is drawn as a dashed line with LHD'],
  svg: det('HD') })

S({ id: 'fg-smoke-detector', name: 'Smoke detector', cat: 'fire-gas', std: STD_FG, component: 'smoke-detector', physical: true, tags: ['SD'], isa: [],
  drawn: 'A detector bubble with "SD".',
  meaning: 'Point smoke detector (optical or ionisation) in control rooms, LERs, E-houses and quarters. Maps to the smoke-detector component. Beam detectors (beam-smoke-detector) and aspirating systems (aspirating-smoke-detector) are separate components.',
  variants: ['Aspirating (VESDA) systems are a box "ASD" with a sampling pipe with holes', 'Beam smoke detectors are drawn as a Tx/reflector pair', 'In-duct smoke detectors are drawn on the HVAC duct'],
  svg: det('SD') })

S({ id: 'fg-manual-call-point', name: 'Manual call point (MAC)', cat: 'fire-gas', std: STD_FG + ' / ISO 7240-11', component: 'manual-call-point', physical: true, tags: ['MAC', 'MCP', 'HS'], isa: ['HS'],
  drawn: 'A square with a smaller filled circle inside (the break-glass button), sometimes marked MAC or MCP.',
  meaning: 'Manual alarm call point. Pressing it raises a fire alarm (and on many platforms initiates ESD or GA). Maps to the manual-call-point component. ESD push-buttons look similar but are marked ESD.',
  variants: ['Yellow (ESD) vs red (fire) call points are distinguished only by text or colour', 'NFPA-style legends: a small rectangle with "F" or "MS" (manual station)'],
  svg: svg(80, 80, r(14, 14, 52, 52) + r(24, 24, 32, 32, thin(1.6)) + c(40, 40, 8, B)) })

S({ id: 'fg-beacon', name: 'Alarm beacon (visual)', cat: 'fire-gas', std: STD_FG + ' / IEC 60617 (signal lamp)', component: 'alarm-beacon', physical: true, tags: ['XL', 'BCN'], isa: ['XL'],
  drawn: 'A circle with an X inside (the IEC lamp symbol) and short rays around it, often with the colour noted (red, yellow, blue).',
  meaning: 'Flashing beacon for general alarm, gas or fire alarm, CO2 release or prepare-to-abandon. The color gives the meaning. Maps to the alarm-beacon component.',
  variants: ['Some legends draw a dome with rays or write "B" in a circle', 'Often combined with a sounder as one device'],
  svg: svg(100, 90, c(50, 46, 20) + p('M36 32L64 60M36 60L64 32', thin(2)) + p('M50 14V4M22 22l-7-7M78 22l7-7M18 46H8M82 46H92', thin(1.8))) })

S({ id: 'fg-sounder', name: 'Alarm sounder / bell', cat: 'fire-gas', std: STD_FG + ' / IEC 60617 (bell, sounder)', component: 'alarm-beacon', physical: true, tags: ['XA', 'SNDR'], isa: ['XA'],
  drawn: 'A half-circle dome sitting on a flat base line (the IEC bell or sounder), with its connection below.',
  meaning: 'Electronic sounder or bell for fire, gas and general alarm. Usually paired with a beacon; maps to the alarm-beacon component (beacon and sounder). Large-area PA/GA horns are the loudspeaker symbol.',
  variants: ['Horn symbols (a trumpet shape) are also used for sounders'],
  svg: svg(100, 80, p('M24 50a26 26 0 0 1 52 0z') + p('M18 50H82') + p('M50 50V74')) })

S({ id: 'fg-horn-speaker', name: 'PA/GA loudspeaker (horn)', cat: 'fire-gas', std: STD_FG + ' / IEC 60617 (loudspeaker)', component: 'pa-loudspeaker', physical: true, tags: ['LS', 'PA'], isa: [],
  drawn: 'A small rectangle with a flared trumpet (trapezoid) opening out of it, the IEC loudspeaker or horn.',
  meaning: 'PA/GA horn loudspeaker carrying alarm tones and voice messages across the plant. Maps to the pa-loudspeaker component.',
  variants: ['Ceiling speakers in buildings are drawn as a circle with a small square'],
  svg: svg(100, 80, r(16, 30, 16, 20) + p('M32 30L70 12V68L32 50') + p('M4 40H16')) })

S({ id: 'fg-deluge-valve', name: 'Deluge valve', cat: 'fire-gas', std: STD_FP + ' (NFPA 15)', component: 'deluge-valve-skid', physical: true, tags: ['DV', 'XV'], isa: ['XV'],
  drawn: 'A valve drawn filled (normally closed) on the firewater supply with a trip actuator on top (often a solenoid "S" box or hydraulic latch), and "DV" or the deluge zone written beside it. Open (dry) pipework leads to the nozzles downstream.',
  meaning: 'Deluge valve: opens on confirmed fire (or manually) to flood a zone through open nozzles. Maps to the deluge-valve-skid component (valve set with isolations, trim and test line).',
  variants: ['Alarm check valves for wet sprinkler systems look similar and are marked "ACV"', 'The skid usually shows LO isolation valves either side'],
  svg: svg(120, 110, valve(80, { fl: 1, fr: 1 }) + p('M60 80V54') + r(40, 26, 40, 28) + t(60, 46, 15, 'D') + r(86, 14, 20, 18) + t(96, 28, 12, 'S') + p('M80 32H86', thin(1.6)) + t(60, 108, 12, 'DV')) })

S({ id: 'fg-sprinkler', component: 'deluge-nozzle', name: 'Sprinkler head (closed)', cat: 'fire-gas', std: STD_FP + ' (NFPA 13)', physical: true, tags: ['SPK'], isa: [],
  drawn: 'A small drop from the pipe ending in a closed head: a small filled circle (the glass bulb) with a short deflector bar.',
  meaning: 'Automatic sprinkler: opens on its own when its bulb bursts. Used in quarters, workshops and stores. Maps to the deluge-nozzle component, which also covers sprinkler heads.',
  variants: ['Building legends draw a small circle with a cross, or a filled dot', 'Upright vs pendent is written beside it'],
  svg: svg(80, 90, p('M4 14H76') + p('M40 14V52') + c(40, 60, 7, B) + p('M28 72H52', thin(3))) })

S({ id: 'fg-deluge-nozzle', component: 'deluge-nozzle', name: 'Deluge (open) spray nozzle', cat: 'fire-gas', std: STD_FP + ' (NFPA 15)', physical: true, tags: ['NZ'], isa: [],
  drawn: 'A small drop from the pipe ending in an open nozzle (a small triangle), with dashed spray lines fanning out.',
  meaning: 'Open water-spray nozzle on deluge pipework. All nozzles in the zone discharge together when the deluge valve opens. Maps to the deluge-nozzle component.',
  variants: ['Foam-water nozzles are drawn the same with "F"', 'Nozzle layouts are usually on separate fire-protection drawings'],
  svg: svg(100, 90, p('M4 14H96') + p('M50 14V44') + p('M44 44h12l-6 10z') + p('M50 56L22 86M50 56L50 88M50 56L78 86', thin(1.4) + ' ' + dash('5 4'))) })

S({ id: 'fg-water-mist', name: 'Water mist nozzle / system', cat: 'fire-gas', std: STD_FP + ' (NFPA 750)', physical: true, tags: ['WM'], isa: [],
  drawn: 'A nozzle on a small-bore line with a fine dotted spray cone, often inside an enclosure outline and marked "WM".',
  meaning: 'High-pressure water mist for turbine hoods, generator enclosures and machinery spaces. Usually a vendor package with its own pump and cylinders. No dedicated component.',
  variants: ['Mist skids are drawn as a package box with cylinders or a pump'],
  svg: svg(100, 90, p('M4 14H96', thin(1.8)) + p('M50 14V44') + p('M44 44h12l-6 10z', B) + Array.from({ length: 15 }, (_, i) => { const row = Math.floor(i / 5) + 1, k = (i % 5) - 2; return c(50 + k * 7 * row * 0.7, 58 + row * 9, 1.5, B) }).join('') + t(84, 40, 11, 'WM')) })

S({ id: 'fg-hydrant', component: 'fire-hydrant', name: 'Fire hydrant', cat: 'fire-gas', std: STD_FP, physical: true, tags: ['HYD', 'FH'], isa: [],
  drawn: 'A pillar on the firewater main with a cap on top and two hose outlets on the sides.',
  meaning: 'Hydrant on the firewater ring main for hoses. Mostly onshore; offshore uses hose reels and monitors. Maps to the fire-hydrant component.',
  variants: ['Plot-plan legends draw a circle with a cross or a filled half-circle'],
  svg: svg(100, 100, p('M4 90H96') + p('M38 90V36H62V90') + p('M34 36h32a16 10 0 0 0-32 0z') + p('M38 54H24M62 54H76') + p('M24 48v12M76 48v12', thin(3))) })

S({ id: 'fg-fire-monitor', name: 'Fire monitor', cat: 'fire-gas', std: STD_FP, component: 'fire-monitor', physical: true, tags: ['FM', 'MON'], isa: [],
  drawn: 'A riser from the firewater main with a swivel joint (circle) on top and a nozzle barrel angled out of it, sometimes with an arc showing its sweep.',
  meaning: 'Fixed water or foam monitor covering helidecks, wellbays and tank areas. Maps to the fire-monitor component.',
  variants: ['Remote-controlled monitors carry an M actuator', 'Foam-water monitors are marked "F"'],
  svg: svg(110, 100, p('M4 92H106') + p('M40 92V54') + c(40, 46, 8) + p('M45 40L78 18L84 26L50 50z') + p('M92 14a40 40 0 0 1 8 30', thin(1.4) + ' ' + dash('4 4'))) })

S({ id: 'fg-hose-reel', name: 'Fire hose reel', cat: 'fire-gas', std: STD_FP, component: 'hose-reel', physical: true, tags: ['HR'], isa: [],
  drawn: 'A drum (two concentric circles) fed from the firewater line through a valve, with a hose ending in a nozzle.',
  meaning: 'Fire hose reel at escape routes and process areas. Maps to the hose-reel component.',
  variants: ['Foam hose reels are marked "F"', 'Layout legends draw a circle with "HR"'],
  svg: svg(120, 90, p('M4 46H22') + bow(30, 46, { w: 8, h: 6 }) + p('M38 46H44') + c(64, 46, 22) + c(64, 46, 7) + p('M64 68Q90 84 104 64') + p('M100 60l8-6 2 10z', B)) })

S({ id: 'fg-extinguisher', name: 'Portable fire extinguisher', cat: 'fire-gas', std: 'ISO 7010 (F001) / NFPA 170 / company layout practice', component: 'fire-extinguisher', physical: true, tags: ['EXT', 'FE'], isa: [],
  drawn: 'A canister outline with a handle and short hose, marked with the agent: DP (dry powder), CO2, F (foam) or W (water).',
  meaning: 'Portable or wheeled extinguisher. Shown on safety layouts more than P&IDs. Maps to the fire-extinguisher component.',
  variants: ['Layouts often use a triangle or circle with the agent letters', 'Wheeled units are drawn with wheels'],
  svg: svg(90, 110, p('M26 34a19 12 0 0 1 38 0V100H26z') + p('M38 22h14V12H38zM52 16h14l8 10', thin(2)) + t(45, 74, 15, 'DP')) })

S({ id: 'fg-fire-pump', name: 'Firewater pump (diesel driven)', cat: 'fire-gas', std: STD_FP + ' (NFPA 20)', component: 'diesel-firewater-pump', physical: true, tags: ['P', 'FWP'], isa: [],
  drawn: 'A pump (centrifugal circle, or a vertical turbine pump into a caisson) driven by a "DE" diesel engine box, discharging into the firewater ring main.',
  meaning: 'Diesel firewater pump that starts on low ring-main pressure or a fire signal. Maps to the diesel-firewater-pump component. Electric firewater and jockey pumps are drawn with M.',
  variants: ['Offshore pumps are usually vertical caisson pumps with a right-angle gearbox', 'Jockey pumps keep the ring main pressurised and are drawn small with M'],
  svg: svg(150, 90, r(6, 26, 46, 36) + t(29, 50, 16, 'DE') + p('M52 44H70') + c(94, 44, 24) + p('M86 32l20 12-20 12z', thin(2)) + p('M94 20H140V6')) })

S({ id: 'fg-foam', name: 'Foam system (concentrate tank and proportioner)', cat: 'fire-gas', std: STD_FP + ' (NFPA 11)', physical: true, tags: ['C', 'X'], isa: [],
  drawn: 'A small vertical tank of foam concentrate (marked AFFF or F) joined to an in-line proportioner (a venturi-like body) on the firewater line.',
  meaning: 'AFFF foam skid: proportions foam concentrate into firewater for helideck and wellbay monitors and deluge. No dedicated component.',
  variants: ['Bladder tanks are drawn with an internal bladder line', 'Some legends write "FOAM" in a box'],
  svg: svg(150, 100, p('M12 50a20 8 0 0 1 40 0V96H12z') + t(32, 80, 10, 'AFFF') + p('M4 30H84M116 30H146') + r(84, 18, 32, 24) + p('M88 23L97 28H103L112 23M88 37L97 32H103L112 37', thin(1.6)) + p('M52 70H100V42', thin(1.8))) })
S({ id: 'fg-inert-gas', name: 'CO2 / inert gas extinguishing system', cat: 'fire-gas', std: STD_FP + ' (NFPA 12 / NFPA 2001)', physical: true, tags: ['X', 'CO2'], isa: [],
  drawn: 'A bank of cylinders on a manifold with a release valve, piped to discharge nozzles inside an enclosure outline, marked CO2, IG-541 or N2.',
  meaning: 'Total-flooding gas system for turbine hoods, switch rooms and generator enclosures. The release is interlocked with a beacon and sounder and the enclosure dampers. No dedicated component (gas-cylinder-quad is for nitrogen bottles).',
  variants: ['Clean-agent (FM-200, Novec) systems are drawn the same'],
  svg: svg(170, 110, [22, 50, 78].map((x) => p(`M${x - 10} 104V38a10 10 0 0 1 20 0V104z`) + p(`M${x} 28V20`)).join('') + p('M22 20H120') + p('M118 4H166V104H118z', dash('6 4') + ' ' + thin(1.6)) + p('M120 20H140V44M136 44h8l-4 8z') + t(66, 13, 11, 'CO2')) })

S({ id: 'fg-safety-shower', name: 'Safety shower and eyewash', cat: 'fire-gas', std: 'ANSI Z358.1 / ISO 7010 (E012) / company legend practice', component: 'safety-shower', physical: true, tags: ['SS', 'EW'], isa: [],
  drawn: 'A shower head (an inverted cone) on a pipe stand, often with a small eyewash bowl on the side, fed from potable water.',
  meaning: 'Emergency shower and eyewash station near chemical injection, battery rooms and laboratories. Maps to the safety-shower component.',
  variants: ['Layout legends use the ISO 7010 E012 / E011 pictograms'],
  svg: svg(100, 120, p('M30 116V20H60') + p('M50 28h20l-4 8H54z') + p('M54 42l-3 8M60 42v8M66 42l3 8', thin(1.4)) + p('M30 70H48') + p('M46 66a12 8 0 0 0 24 0z') + p('M4 116H96')) })

S({ id: 'fg-fusible-plug', name: 'Fusible plug loop', cat: 'fire-gas', std: STD_FG + ' / API RP 14C', physical: true, tags: ['FP', 'TSE'], isa: ['TSE'],
  drawn: 'An instrument-air (pneumatic //) loop with small fusible plug elements (small filled squares marked FP) placed around the wellhead or equipment.',
  meaning: 'Pneumatic fire detection: a plug melts in a fire, the loop pressure falls, and the wellhead or package shuts in. Typical on wellhead platforms. Not modelled; note it on the trees.',
  variants: ['API RP 14C tags them TSE', 'Some legends draw a circle with "FP" on the loop'],
  svg: svg(160, 60, p('M4 30H156', thin(1.6)) + p('M24 38l6-16M31 38l6-16M120 38l6-16M127 38l6-16', thin(1.4)) + r(70, 24, 12, 12, B) + t(76, 54, 11, 'FP')) })

// ---------- electrical ----------
const lead = (y1, y2, x = 40) => p(`M${x} ${y1}V${y2}`)
const blade = p('M40 84L24 46')
S({ id: 'el-transformer-2w', name: 'Two-winding transformer', cat: 'electrical', std: STD_EL, component: 'transformer', physical: true, tags: ['TR', 'T', 'TX'], isa: [],
  drawn: 'Two overlapping circles (one per winding) on the single-line diagram, with the rating and vector group written beside them.',
  meaning: 'Power or distribution transformer, e.g. 11/0.69 kV. Maps to the transformer component. ANSI drawings show two facing coils instead.',
  variants: ['A diagonal arrow through the circles = on-load tap changer', 'Winding symbols (Δ, Y, Yn) may be drawn inside the circles'],
  svg: svg(80, 130, lead(4, 28) + c(40, 48, 20) + c(40, 80, 20) + lead(100, 126)) })

S({ id: 'el-transformer-3w', name: 'Three-winding transformer', cat: 'electrical', std: STD_EL, component: 'transformer', physical: true, tags: ['TR', 'T'], isa: [],
  drawn: 'Three overlapping circles in a triangle: one primary on top, two secondaries below.',
  meaning: 'Transformer with two secondary windings, e.g. feeding two switchboard sections or a 12-pulse VFD. Maps to the transformer component.',
  variants: ['Autotransformers are a single circle with a tap'],
  svg: svg(100, 130, lead(4, 26, 50) + c(50, 46, 20) + c(36, 72, 20) + c(64, 72, 20) + p('M28 90L18 126M72 90L82 126')) })

S({ id: 'el-circuit-breaker', component: 'hv-circuit-breaker', name: 'Circuit breaker', cat: 'electrical', std: STD_EL, physical: true, tags: ['CB', 'Q'], isa: [],
  drawn: 'A switch (a lead with a diagonal blade) with a small × on the fixed contact.',
  meaning: 'Circuit breaker that makes, carries and interrupts fault current: incomers, feeders and bus ties. Inside a switchboard it is part of switchgear. In an outdoor substation (air-insulated bay) it maps to the hv-circuit-breaker component.',
  variants: ['ANSI legends draw a square box or two arcs; draw-out breakers show chevrons (» «) above and below', 'A filled square is often used for a closed breaker on SLD overviews'],
  svg: svg(80, 130, lead(4, 44) + blade + lead(84, 126) + p('M34 38l12 12M46 38L34 50', thin(2))) })

S({ id: 'el-disconnector', component: 'disconnector', name: 'Disconnector (isolator)', cat: 'electrical', std: STD_EL, physical: true, tags: ['DS', 'Q'], isa: [],
  drawn: 'A switch blade with a short bar across the fixed contact.',
  meaning: 'Off-load isolator giving a visible break for maintenance. Inside a switchboard it is part of switchgear. In an outdoor substation it maps to the disconnector component.',
  variants: ['Switch-disconnectors (load-break) add a small circle on the contact as well'],
  svg: svg(80, 130, lead(4, 44) + blade + lead(84, 126) + p('M30 44H50', thin(2.5))) })

S({ id: 'el-earthing-switch', component: 'disconnector', name: 'Earthing switch', cat: 'electrical', std: STD_EL, physical: true, tags: ['ES'], isa: [],
  drawn: 'A disconnector blade whose lower side goes straight to an earth symbol, branching off a main circuit.',
  meaning: 'Earths a circuit or busbar for safe maintenance, interlocked with the breaker. Inside a switchboard it is part of switchgear. In an outdoor substation it is the earthing blade of a disconnector (disconnector).',
  variants: ['Often drawn beside a cable feeder below the breaker'],
  svg: svg(100, 130, lead(4, 126, 20) + p('M20 30H60V44') + p('M50 44H70', thin(2.5)) + p('M60 84L44 48') + lead(84, 100, 60) + p('M46 100H74M51 107H69M56 114H64')) })

S({ id: 'el-fuse', name: 'Fuse', cat: 'electrical', std: STD_EL, physical: true, tags: ['F', 'FU'], isa: [],
  drawn: 'A small rectangle with the conductor line passing straight through it.',
  meaning: 'Fuse protecting a circuit, VT or small motor feeder. Part of switchgear or distribution boards; not modelled.',
  variants: ['A fuse-switch combines a switch blade with the fuse rectangle'],
  svg: svg(80, 120, lead(4, 116) + r(30, 36, 20, 48)) })

S({ id: 'el-contactor', name: 'Contactor', cat: 'electrical', std: STD_EL, physical: true, tags: ['K', 'KM'], isa: [],
  drawn: 'A switch blade with a small half-circle on the fixed contact.',
  meaning: 'Motor starter contactor in an MCC bucket: switches motors on and off, often with a thermal overload. Part of the MCC (switchgear); not modelled.',
  variants: ['Starters may be drawn as a box with "DOL", "Y/Δ" or "SS" (soft starter)'],
  svg: svg(80, 130, lead(4, 38) + p('M34 44a6 6 0 0 1 12 0', thin(2.2)) + blade + lead(84, 126)) })

S({ id: 'el-motor', name: 'Motor (electrical)', cat: 'electrical', std: STD_EL, component: 'electric-motor', physical: true, tags: ['M', 'PM'], isa: [],
  drawn: 'A circle containing "M" and "3~" at the end of a feeder.',
  meaning: 'Three-phase induction motor load with its kW rating. On the SLD it is the motor of a pump, fan or compressor; maps to the electric-motor component if modelled separately.',
  variants: ['"M" with "1~" = single-phase', 'Synchronous motors are marked "MS"'],
  svg: svg(80, 110, lead(4, 40) + c(40, 66, 26) + t(40, 66, 18, 'M') + t(40, 84, 12, '3~', { w: 'normal' })) })

S({ id: 'el-generator', name: 'Generator', cat: 'electrical', std: STD_EL, physical: true, tags: ['G'], isa: [],
  drawn: 'A circle containing "G" (often with a "~"), at the top of a feeder to the switchboard.',
  meaning: 'AC generator. On the SLD its driver is written beside it: GT means gas-turbine-generator, DG means diesel-generator.',
  variants: ['Some legends draw a circle with a sine wave only'],
  svg: svg(80, 110, c(40, 40, 26) + t(40, 40, 18, 'G') + t(40, 58, 14, '~', { w: 'normal' }) + lead(66, 106)) })

S({ id: 'el-vfd', name: 'Variable frequency drive (VFD)', cat: 'electrical', std: STD_EL, component: 'vfd-cabinet', physical: true, tags: ['VFD', 'VSD', 'U'], isa: [],
  drawn: 'A square split by a diagonal, with "~" in both halves (an AC/AC converter), feeding a motor.',
  meaning: 'Variable-speed drive for large pumps, compressors and fans. Maps to the vfd-cabinet component.',
  variants: ['Some legends draw two boxes: rectifier (~/=) then inverter (=/~)', 'Often written VSD'],
  svg: svg(80, 130, lead(4, 30) + r(16, 30, 48, 48) + p('M16 78L64 30') + t(30, 50, 15, '~', { w: 'normal' }) + t(50, 72, 15, '~', { w: 'normal' }) + lead(78, 126)) })

S({ id: 'el-ups', name: 'Uninterruptible power supply (UPS)', cat: 'electrical', std: STD_EL, component: 'ups-battery-cabinet', physical: true, tags: ['UPS'], isa: [],
  drawn: 'A rectifier box (~/=) and an inverter box (=/~) in series with a battery between them, often inside a dashed frame with a static bypass.',
  meaning: 'UPS that keeps control, F&G, ESD and telecom systems running on mains failure. Maps to the ups-battery-cabinet component.',
  variants: ['DC UPS systems show only the rectifier (charger) and the battery'],
  svg: svg(170, 110, p('M4 30H24') + r(24, 14, 32, 32) + p('M24 46L56 14') + t(34, 30, 12, '~', { w: 'normal' }) + t(46, 42, 12, '=', { w: 'normal' }) + p('M56 30H114') + r(114, 14, 32, 32) + p('M114 46L146 14') + t(124, 30, 12, '=', { w: 'normal' }) + t(136, 42, 12, '~', { w: 'normal' }) + p('M146 30H166') + p('M85 30V66') + p('M73 66H97M78 74H92', thin(2.5)) + p('M73 82H97M78 90H92', thin(2.5)) + p('M85 90V100')) })

S({ id: 'el-battery', name: 'Battery', cat: 'electrical', std: STD_EL, component: 'ups-battery-cabinet', physical: true, tags: ['BAT', 'G'], isa: [],
  drawn: 'Pairs of parallel plates: a long thin line (positive) and a short thick line (negative), repeated.',
  meaning: 'Battery bank for a UPS, a diesel engine start or switchgear tripping. Maps to the ups-battery-cabinet component when it is the UPS or DC battery room.',
  variants: ['A dashed line between two cells means many cells in series'],
  svg: svg(80, 110, lead(4, 34) + p('M18 34H62M28 44H52M18 62H62M28 72H52', thin(2.5)) + p('M40 44V62', dash('3 3') + ' ' + thin(1.4)) + lead(72, 106)) })

S({ id: 'el-busbar', name: 'Busbar', cat: 'electrical', std: STD_EL, physical: false, tags: ['BB'], isa: [],
  drawn: 'A thick horizontal line with feeders dropping from it, labelled with the board name and voltage.',
  meaning: 'Switchboard busbar section: main, essential and emergency boards. The busbar belongs to the switchboard (switchgear); it is not modelled separately.',
  variants: ['Bus couplers (ties) are drawn as a breaker linking two bars', 'Double busbars are two parallel thick lines'],
  svg: svg(160, 80, p('M8 24H152', thin(6)) + p('M40 24V76M80 24V76M120 24V76')) })

S({ id: 'el-current-transformer', component: 'instrument-transformer', name: 'Current transformer (CT)', cat: 'electrical', std: STD_EL, physical: true, tags: ['CT', 'T'], isa: [],
  drawn: 'A small circle around the conductor line, with secondary leads to a meter or relay.',
  meaning: 'Steps down current for protection relays and meters. Inside a switchboard it is part of switchgear. A free-standing outdoor CT maps to the instrument-transformer component.',
  variants: ['Ratio (e.g. 400/1 A) and class are written beside it', 'Some legends draw a small loop on the conductor'],
  svg: svg(100, 120, lead(4, 116) + c(40, 60, 13) + p('M53 54H76M53 66H76', thin(1.6))) })

S({ id: 'el-voltage-transformer', component: 'instrument-transformer', name: 'Voltage transformer (VT)', cat: 'electrical', std: STD_EL, physical: true, tags: ['VT', 'PT'], isa: [],
  drawn: 'Two small overlapping circles (like a power transformer, but smaller), on a fused tap from the busbar, with the secondary earthed.',
  meaning: 'Steps down voltage for metering, protection and synchronising. Inside a switchboard it is part of switchgear. A free-standing outdoor VT/CVT maps to the instrument-transformer component. Do not confuse it with a power transformer (bigger, in the main feeder path).',
  variants: ['ANSI legends call it a PT (potential transformer)'],
  svg: svg(80, 130, lead(4, 20) + r(34, 20, 12, 22) + lead(42, 50) + c(40, 62, 12) + c(40, 80, 12) + lead(92, 104) + p('M28 104H52M32 110H48M36 116H44')) })

S({ id: 'el-surge-arrester', component: 'surge-arrester', name: 'Surge arrester', cat: 'electrical', std: STD_EL, physical: true, tags: ['SA', 'F'], isa: [],
  drawn: 'A rectangle with a downward arrow inside, connected between the conductor and earth.',
  meaning: 'Protects transformers and cables from switching and lightning surges. Maps to the surge-arrester component in an outdoor substation or at a transformer; inside switchgear it is not modelled separately.',
  variants: ['Older legends show a spark gap (two arrows tip to tip)'],
  svg: svg(80, 130, lead(4, 34) + r(28, 34, 24, 44) + p('M40 40V68M34 60l6 10 6-10', thin(2)) + lead(78, 98) + p('M26 98H54M31 105H49M36 112H44')) })

S({ id: 'el-earth', name: 'Earth (ground)', cat: 'electrical', std: STD_EL, physical: false, tags: ['E', 'PE'], isa: [],
  drawn: 'A vertical lead ending in three horizontal lines that get shorter downward.',
  meaning: 'Connection to earth: neutral earthing, equipment and instrument earthing. Not modelled.',
  variants: ['Protective earth may be drawn in a circle', 'Clean (instrument) earth is sometimes marked IE'],
  svg: svg(80, 80, lead(4, 40) + p('M18 40H62M26 50H54M34 60H46')) })

S({ id: 'el-capacitor', name: 'Capacitor', cat: 'electrical', std: STD_EL, physical: true, tags: ['C'], isa: [],
  drawn: 'Two short parallel plates with a lead on each side.',
  meaning: 'Power-factor correction capacitor bank or harmonic filter. Part of switchgear; not modelled.',
  variants: ['Capacitor banks are often a single capacitor symbol with the kvar rating'],
  svg: svg(80, 110, lead(4, 48) + p('M18 48H62M18 60H62', thin(3)) + lead(60, 106)) })

S({ id: 'el-neutral-earthing-resistor', name: 'Neutral earthing resistor (NER)', cat: 'electrical', std: STD_EL, component: 'neutral-earthing-resistor', physical: true, tags: ['NER', 'R'], isa: [],
  drawn: 'A rectangle (resistor) between a transformer or generator neutral point and an earth symbol.',
  meaning: 'Limits earth-fault current on an MV system. Maps to the neutral-earthing-resistor component.',
  variants: ['ANSI resistors are drawn as a zig-zag'],
  svg: svg(80, 140, c(40, 24, 18) + t(40, 29, 14, 'Y', { w: 'normal' }) + lead(42, 56) + r(30, 56, 20, 40) + lead(96, 112) + p('M24 112H56M29 119H51M34 126H46')) })

S({ id: 'el-switchboard', name: 'Switchboard / MCC', cat: 'electrical', std: STD_EL, component: 'switchgear', physical: true, tags: ['SWB', 'SWG', 'MCC'], isa: [],
  drawn: 'A dashed frame around a busbar with an incoming breaker and outgoing feeders (breakers or contactors), labelled with the board tag and voltage.',
  meaning: 'HV/LV switchboard or motor control centre. Maps to the switchgear component (set the kind: MV, LV or MCC), usually inside an E-house (e-house).',
  variants: ['MCC buckets are drawn as contactor + overload + motor', 'Overview SLDs show each board as a single bar'],
  svg: svg(170, 130, r(6, 6, 158, 118, dash('7 4') + ' ' + thin(1.6)) + p('M20 50H150', thin(5)) + p('M85 0V16') + p('M85 16L76 40') + p('M80 14l10 10M90 14L80 24', thin(1.6)) + p('M85 40V50') + [40, 85, 130].map((x) => p(`M${x} 50V64L${x - 8} 90M${x} 92V124`) + p(`M${x - 5} 62l10 10M${x + 5} 62l-10 10`, thin(1.6))).join('')) })

S({ id: 'el-junction-box', name: 'Junction box', cat: 'electrical', std: 'IEC 60617 / instrument and electrical layout practice', component: 'junction-box', physical: true, tags: ['JB'], isa: [],
  drawn: 'A small square marked "JB" with cables entering it.',
  meaning: 'Field junction box (Ex e) where field cables meet multicore cables. Usually on loop and layout drawings, not P&IDs. Maps to the junction-box component.',
  variants: ['Instrument JBs and power JBs are distinguished by the tag (IJB, EJB)'],
  svg: svg(120, 90, r(36, 24, 48, 42) + t(60, 51, 16, 'JB') + p('M4 34H36M4 56H36M84 45H116', thin(1.6) + ' ' + dash('6 4'))) })

S({ id: 'el-local-control-station', name: 'Local control station (LCS)', cat: 'electrical', std: 'IEC 60617 / ISA 5.1 (HS) / company practice', component: 'local-control-station', physical: true, tags: ['LCS', 'HS'], isa: ['HS'],
  drawn: 'A small box beside a motor marked "LCS", with start/stop push-buttons (small circles) or HS bubbles, and a dashed signal line to the MCC.',
  meaning: 'Field push-button station for local start/stop and emergency stop of a motor. Maps to the local-control-station component.',
  variants: ['P&IDs often show it as an HS bubble joined to the motor by a dashed line'],
  svg: svg(150, 80, r(10, 16, 52, 48) + t(36, 32, 11, 'LCS') + c(26, 48, 6) + c(46, 48, 6, B) + p('M62 40H96', thin(1.6) + ' ' + dash('6 4')) + c(118, 40, 20) + t(118, 46, 16, 'M')) })

S({ id: 'el-protection-relay', name: 'Protection relay (ANSI device number)', cat: 'electrical', std: 'IEEE C37.2 (device numbers) / IEC 60617', physical: false, tags: ['R'], isa: [],
  drawn: 'A small circle or box with an ANSI device number (e.g. 50/51 overcurrent, 87 differential, 27 undervoltage), joined to a CT or VT by a dashed line.',
  meaning: 'Protection function inside the switchgear relay. Not on the plot; not modelled.',
  variants: ['IEC drawings may use symbolic forms (I>, I>>) instead of numbers'],
  svg: svg(130, 80, c(84, 40, 26) + t(84, 45, 13, '50/51') + p('M4 40H30', thin(1.6)) + c(34, 40, 6) + p('M40 40H58', thin(1.6) + ' ' + dash('5 3'))) })
