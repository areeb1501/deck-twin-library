// Equipment: vessels, columns, tanks, heat transfer, pumps, compressors and drivers, separation, oilfield and packages.
const { B, W, svg, p, c, r, e, t, thin, dash, bow, valve, cat, S } = require('./lib.cjs')

const vcap = (x, y, w, h, ry) => `M${x} ${y + ry}a${w / 2} ${ry} 0 0 1 ${w} 0V${y + h - ry}a${w / 2} ${ry} 0 0 1 -${w} 0z`
const hcap = (x, y, w, h, rx) => `M${x + rx} ${y}H${x + w - rx}a${rx} ${h / 2} 0 0 1 0 ${h}H${x + rx}a${rx} ${h / 2} 0 0 1 0 -${h}z`
const STD_VS = 'ISO 10628-2 (groups 1-2, vessels, tanks and columns) / PIP PIC001'
const STD_HX = 'ISO 10628-2 (groups 3-5, heat exchangers, furnaces, cooling towers) / PIP PIC001 / TEMA'
const STD_PU = 'ISO 10628-2 (group 15, liquid pumps) / PIP PIC001'
const STD_MC = 'ISO 10628-2 (groups 16, 17 and 20, compressors, blowers, engines) / PIP PIC001'
const STD_SP = 'ISO 10628-2 (groups 6, 8 and 28, filters, separators, agitators) / PIP PIC001'
const STD_OF = 'Company / operator legend practice (API 6A, API 521, API 537) / PIP PIC001'
const M = (x, y, rr = 14, letter = 'M') => c(x, y, rr) + t(x, y + rr * 0.36, rr * 0.95, letter)

cat('vessels', 'Vessels, columns and tanks')
cat('exchangers', 'Heat transfer equipment')
cat('pumps', 'Pumps')
cat('machines', 'Compressors, blowers and drivers')
cat('separation', 'Filters, separators and mixers')
cat('oilfield', 'Flare, wellhead, pipeline and packages')

// ---------- vessels ----------
S({ id: 'vessel-vertical', name: 'Vertical vessel', cat: 'vessels', std: STD_VS, component: 'vertical-separator', physical: true, tags: ['V', 'D'],
  drawn: 'A tall rectangle with rounded (dished) top and bottom heads, with nozzles: inlet on the side, gas at the top, liquid at the bottom. Equipment tag and design data written beside it.',
  meaning: 'Vertical pressure vessel: scrubber, KO drum, flash drum or receiver. Gas/liquid duty with small liquid volume becomes vertical-separator; an air or nitrogen receiver becomes air-receiver. Read the title and service.',
  variants: ['ISO 10628-2 shows support skirt, legs or brackets as extra marks under the vessel', 'Internals (mesh pad, vane pack, inlet device) are often drawn inside', 'Jacketed or insulated vessels have hatching or a second outline'],
  svg: svg(100, 170, p(vcap(26, 22, 48, 126, 16)) + p('M4 74H26M50 22V6M50 148V166')) })

S({ id: 'vessel-scrubber', name: 'Vertical scrubber with mist eliminator', cat: 'vessels', std: STD_VS, component: 'vertical-separator', physical: true, tags: ['V'],
  drawn: 'A vertical vessel with a band near the top filled with a zig-zag or cross-hatch (the mesh pad or vane pack) and an inlet on the side below it.',
  meaning: 'Gas scrubber or KO drum: compressor suction scrubbers, fuel-gas scrubbers, inlet KO drums. Becomes vertical-separator with mesh or vane internals.',
  variants: ['Vane packs may be drawn as vertical zig-zags', 'Cyclonic internals are drawn as small cones', 'Filter-separators are horizontal with cartridges, see separation'],
  svg: svg(100, 170, p(vcap(26, 22, 48, 126, 16)) + r(26, 44, 48, 12) + p('M26 56l6-12 6 12 6-12 6 12 6-12 6 12 6-12 6 12', thin(1.6)) + p('M4 80H34M34 80v10', thin(2.5)) + p('M50 22V6M50 148V166')) })

S({ id: 'vessel-horizontal', name: 'Horizontal vessel', cat: 'vessels', std: STD_VS, component: 'horizontal-separator', physical: true, tags: ['V', 'D'],
  drawn: 'A long horizontal rectangle with rounded heads at both ends, with nozzles on the top and bottom.',
  meaning: 'Horizontal drum: two-phase separator, surge drum, KO drum or drain drum. Becomes horizontal-separator (set the service: 2-phase, 3-phase or KO).',
  variants: ['Saddle supports are drawn as small trapezoids underneath', 'A horizontal vessel on saddles holding LPG is a bullet (see tank-bullet)'],
  svg: svg(160, 96, p(hcap(18, 20, 124, 52, 22)) + p('M48 20V6M112 20V6M112 72V90')) })

S({ id: 'separator-three-phase', name: 'Three-phase separator (with boot and weir)', cat: 'vessels', std: STD_VS, component: 'horizontal-separator', physical: true, tags: ['V'],
  drawn: 'A horizontal vessel with a small vertical boot under it (a short rectangle), and an upright weir plate inside towards the outlet end. Separate oil and water outlets.',
  meaning: 'Oil/gas/water separator: HP and LP production separators, test separators. Water settles into the boot or before the weir, and oil spills over the weir into the oil bucket. Becomes horizontal-separator with service 3-phase.',
  variants: ['Some have no boot: interface level is held with a weir and separate oil and water outlets', 'Bucket-and-weir layouts show two plates', 'Inlet device, mesh pad and vortex breakers may also be drawn'],
  svg: svg(160, 110, p(hcap(18, 20, 124, 52, 22)) + p('M108 72V42', thin(2)) + p('M58 72V94H82V72') + p('M30 46H104', dash('5 3') + ' ' + thin(1.2)) + p('M30 60H104', dash('2 3') + ' ' + thin(1.2)) + p('M40 20V6M120 20V6M120 72V96M70 94V108')) })

S({ id: 'column-trayed', name: 'Trayed column', cat: 'vessels', std: STD_VS + ' (X8101 tray column)', component: 'column', physical: true, tags: ['T', 'C'],
  drawn: 'A tall vertical vessel with dished heads and short horizontal lines inside that alternate from left to right (the trays).',
  meaning: 'Tray column: stabilisers, TEG contactors, amine contactors and fractionators. Becomes column (trayed).',
  variants: ['ISO draws trays as dashed horizontal lines', 'Tray numbers are written at feed and draw-off points', 'Bubble-cap and valve trays have small caps or marks on the tray lines'],
  svg: svg(100, 220, p(vcap(30, 18, 40, 186, 14)) + Array.from({ length: 9 }, (_, i) => p(i % 2 ? `M42 ${46 + i * 16}H70` : `M30 ${46 + i * 16}H58`, thin(1.8))).join('') + p('M50 18V4M50 204V216M4 110H30M70 46H96')) })

S({ id: 'column-packed', name: 'Packed column', cat: 'vessels', std: STD_VS + ' (X8015 fixed bed)', component: 'column', physical: true, tags: ['T', 'C'],
  drawn: 'A tall vertical vessel with one or more rectangles crossed corner to corner (an X), the packed beds, each with a short distributor line above it.',
  meaning: 'Packed column: structured or random packing for TEG contactors, strippers and scrubbers. Becomes column (packed).',
  variants: ['Beds may be drawn as dotted or hatched areas', 'An X box is also the ISO symbol for a fixed catalyst or adsorbent bed; read the service'],
  svg: svg(100, 220, p(vcap(30, 18, 40, 186, 14)) + p('M30 54H70L30 98H70ZM30 54L70 98M30 98L70 54', thin(1.8)) + p('M30 126H70V170H30ZM30 126L70 170M30 170L70 126', thin(1.8)) + p('M36 46H64M36 118H64', dash('4 3') + ' ' + thin(1.6)) + p('M50 18V4M50 204V216M4 110H30M70 40H96')) })

S({ id: 'tank-cone-roof', name: 'Cone-roof storage tank', cat: 'vessels', std: STD_VS + ' (X2063 conical roof, flat bottom)', component: 'storage-tank', physical: true, tags: ['T', 'TK'],
  drawn: 'A wide flat-bottomed rectangle with a shallow pointed (conical) roof.',
  meaning: 'Atmospheric storage tank (API 650): diesel, water, produced water, slop or crude storage. Becomes storage-tank.',
  variants: ['A breather valve and flame arrester are usually drawn on the roof', 'Insulated or heated tanks show hatching or coils'],
  svg: svg(160, 120, p('M20 40L80 18L140 40V110H20z') + p('M4 58H20M140 100H156M80 18V6')) })

S({ id: 'tank-dome-roof', name: 'Dome-roof storage tank', cat: 'vessels', std: STD_VS + ' (X8200 dished roof)', component: 'storage-tank', physical: true, tags: ['T', 'TK'],
  drawn: 'A wide flat-bottomed rectangle with a curved (domed) roof.',
  meaning: 'Atmospheric or low-pressure tank with a self-supporting dome roof. Becomes storage-tank.',
  variants: ['Geodesic aluminium domes over floating-roof tanks are drawn as a dome with the floating roof inside'],
  svg: svg(160, 120, p('M20 44a60 24 0 0 1 120 0V110H20z') + p('M4 62H20M140 100H156M80 20V6')) })

S({ id: 'tank-floating-roof', name: 'Floating-roof tank', cat: 'vessels', std: STD_VS, component: 'storage-tank', physical: true, tags: ['T', 'TK'],
  drawn: 'A flat-bottomed tank with an open top and a horizontal deck floating inside below the rim, often with a rolling ladder drawn diagonally from the rim to the deck.',
  meaning: 'External floating-roof tank (API 650 Annex C) for crude and volatile products: the roof rides on the liquid to cut vapour losses. Becomes storage-tank.',
  variants: ['Internal floating roofs are drawn inside a cone or dome roof', 'The roof drain (articulated) is drawn as a pipe from the deck to the shell'],
  svg: svg(160, 120, p('M20 22V110H140V22') + p('M24 54H136v6H24z') + p('M40 60v8M120 60v8', thin(1.8)) + p('M26 22L56 54', thin(1.8)) + p('M12 28H20M140 28h8', thin(1.8)) + p('M4 96H20M140 100H156')) })

S({ id: 'tank-sphere', name: 'Spherical tank (sphere)', cat: 'vessels', std: STD_VS + ' (2063 / X8010 spherical vessel)', component: 'spherical-tank', physical: true, tags: ['T', 'TK', 'V'],
  drawn: 'A circle standing on vertical legs.',
  meaning: 'Pressurised sphere for LPG, butane or NGL storage. Becomes spherical-tank.',
  variants: ['ISO draws a plain circle for "spherical vessel" and adds legs for "on legs"'],
  svg: svg(160, 120, c(80, 56, 42) + p('M44 76V116M116 76V116M38 116H50M110 116H122') + p('M80 98V116M80 14V4')) })

S({ id: 'tank-bullet', name: 'Bullet tank (horizontal pressure storage)', cat: 'vessels', std: STD_VS, component: 'bullet-tank', physical: true, tags: ['T', 'TK', 'V'],
  drawn: 'A horizontal vessel with rounded heads standing on two saddles, sometimes inside a mound (a hump of earth).',
  meaning: 'Horizontal pressure storage for LPG, propane or NGL. Becomes bullet-tank. It looks like a horizontal drum; tell them apart by the tag and service.',
  variants: ['Mounded bullets are drawn under a curved earth line'],
  svg: svg(160, 104, p(hcap(14, 20, 132, 48, 22)) + p('M42 68L36 86H60L54 68M106 68L100 86H124L118 68') + p('M80 20V6M80 68V96')) })

S({ id: 'caisson', name: 'Caisson (sump / pump caisson)', cat: 'vessels', std: STD_OF, component: 'caisson', physical: true, tags: ['CS', 'X'],
  drawn: 'A long vertical tube hanging down from the deck through the sea surface (a wavy line), open at the bottom.',
  meaning: 'Deck-hung caisson: seawater lift and firewater pump caissons, open drain and produced-water disposal caissons. Becomes caisson.',
  variants: ['Pump caissons show a vertical turbine or submersible pump inside', 'Disposal caissons show the inlet near the top and an open end'],
  svg: svg(160, 170, p('M4 20H156', thin(3)) + p('M70 8V160M90 8V160') + p('M4 70q10-8 20 0t20 0 20 0M106 70q10-8 20 0t20 0 20 0', thin(1.6)) + p('M4 36H70', thin(2.5))) })

S({ id: 'slug-catcher', name: 'Slug catcher (finger type)', cat: 'vessels', std: STD_OF, component: 'slug-catcher', physical: true, tags: ['V', 'SC'],
  drawn: 'Several long parallel pipes (fingers) joined at the inlet end by a manifold, with gas risers at the inlet end and a liquid header at the far end.',
  meaning: 'Pipeline slug catcher at an onshore terminal: the fingers store liquid slugs and the gas leaves from the top. Becomes slug-catcher.',
  variants: ['Vessel-type slug catchers are drawn as a large horizontal drum'],
  svg: svg(180, 120, p('M30 14V106', thin(3)) + [28, 60, 92].map((y) => p(`M30 ${y - 7}H160a6 7 0 0 1 0 14H30`)).join('') + p('M4 60H30M40 21V4M164 106H176M150 35V106H164', thin(2.2))) })

// ---------- heat transfer ----------
const shellBEM = p('M36 22H144V66H36z') + p('M36 22H26a10 22 0 0 0 0 44H36M144 22H154a10 22 0 0 1 0 44H144') + p('M36 34H144M36 44H144M36 54H144', thin(1.2))
S({ id: 'hx-general', name: 'Heat exchanger (general)', cat: 'exchangers', std: STD_HX + ' (X8079)', component: 'shell-and-tube-exchanger', physical: true, tags: ['E', 'HX'],
  drawn: 'A circle with a zig-zag line passing through it (one fluid) and pipe stubs on the circle (the other fluid).',
  meaning: 'Any heat exchanger, drawn generically (common on PFDs and simplified P&IDs). Usually a shell-and-tube unit, so map it to shell-and-tube-exchanger unless the title, tag or datasheet says plate, air-cooled or hairpin.',
  variants: ['ISO 10628-2 also uses it for "condenser"', 'Some legends draw two concentric circles or a circle with a horizontal coil'],
  svg: svg(120, 100, c(60, 50, 30) + p('M8 90L36 68H50L70 32H84L112 10', thin(2)) + p('M112 10l-12 3 6 7z', B) + p('M60 20V4M60 80V96')) })

S({ id: 'hx-fixed-tubesheet', name: 'Shell-and-tube exchanger, fixed tubesheet (BEM)', cat: 'exchangers', std: STD_HX, component: 'shell-and-tube-exchanger', physical: true, tags: ['E'],
  drawn: 'A horizontal shell with a rounded bonnet at each end and straight tube lines running the full length between two tubesheets.',
  meaning: 'Fixed-tubesheet exchanger (TEMA BEM/NEN): cheap and tight, but the tube bundle can\'t be pulled, so it is used for clean shell-side fluid. Becomes shell-and-tube-exchanger (temaType BEM).',
  variants: ['Simplified legends draw just a rectangle with a zig-zag tube line', 'An expansion bellows on the shell means a large thermal difference'],
  svg: svg(180, 90, shellBEM + p('M16 44H4M164 44H176M60 22V8M120 66V82')) })

S({ id: 'hx-u-tube', name: 'Shell-and-tube exchanger, U-tube (BEU / AEU)', cat: 'exchangers', std: STD_HX, component: 'shell-and-tube-exchanger', physical: true, tags: ['E'],
  drawn: 'A horizontal shell with a channel head at one end only, a rounded shell cover at the other, and tube lines drawn as a U bending back.',
  meaning: 'U-tube exchanger: one tubesheet, removable bundle, takes thermal expansion. High-pressure gas coolers and heaters. Becomes shell-and-tube-exchanger (temaType AEU/BEU).',
  variants: ['The U may be drawn as one hairpin line'],
  svg: svg(180, 90, p('M36 22H140a14 22 0 0 1 0 44H36z') + p('M36 22H26a10 22 0 0 0 0 44H36M16 44H36') + p('M36 32H128a12 12 0 0 1 0 24H36', thin(1.4)) + p('M26 22V8M26 66V82M120 22V8M60 66V82')) })

S({ id: 'hx-floating-head', name: 'Shell-and-tube exchanger, floating head (AES)', cat: 'exchangers', std: STD_HX, component: 'shell-and-tube-exchanger', physical: true, tags: ['E'],
  drawn: 'A horizontal shell with a flat channel cover at one end and a larger domed shell cover at the other; inside the cover, a small floating-head arc closes the straight tubes.',
  meaning: 'Floating-head exchanger (TEMA AES/AET): removable bundle and free expansion, for dirty or fouling service such as crude coolers. Becomes shell-and-tube-exchanger (temaType AES).',
  variants: ['Often simplified to the fixed-tubesheet symbol with "AES" written beside it'],
  svg: svg(180, 90, r(14, 22, 22, 44) + p('M36 22H144V66H36') + p('M144 14V74M144 14a22 30 0 0 1 0 60') + p('M136 30a8 14 0 0 1 0 28V30') + p('M36 34H136M36 44H136M36 54H136', thin(1.2)) + p('M25 22V8M25 66V82M60 22V8M120 66V82')) })

S({ id: 'hx-kettle', name: 'Kettle reboiler', cat: 'exchangers', std: STD_HX + ' (TEMA K shell)', component: 'shell-and-tube-exchanger', physical: true, tags: ['E'],
  drawn: 'A small channel and tube bundle at one end, with the shell swelling into a much larger diameter over the bundle (a kettle), a weir plate at the far end, and a vapour outlet on top.',
  meaning: 'Kettle (TEMA K) reboiler or vaporiser: liquid boils around the bundle, vapour leaves the top and liquid spills over the weir. Glycol regeneration, propane chillers. Map to shell-and-tube-exchanger and note the kettle shell.',
  variants: ['Thermosyphon reboilers are drawn as vertical shell-and-tube exchangers beside the column'],
  svg: svg(180, 100, r(14, 34, 22, 44) + p('M36 34H54L70 12H144a18 33 0 0 1 0 66H36z') + p('M36 50H118a10 10 0 0 1 0 20H36', thin(1.4)) + p('M134 78V50', thin(2)) + p('M60 44H128', dash('5 3') + ' ' + thin(1.2)) + p('M110 12V2M80 78V96M150 78V96M25 34V22M25 78V92')) })

S({ id: 'hx-condenser', name: 'Condenser', cat: 'exchangers', std: STD_HX, component: 'shell-and-tube-exchanger', physical: true, tags: ['E'],
  drawn: 'A shell-and-tube exchanger with a large vapour inlet on top, a small condensate outlet (often from a boot or hotwell) underneath, and cooling medium through the tube side.',
  meaning: 'Shell-side condenser: overhead condensers, regeneration still condensers. Same hardware as a shell-and-tube unit, so map it to shell-and-tube-exchanger (or air-cooled-exchanger if drawn with a fan).',
  variants: ['ISO 10628-2 uses the general exchanger symbol for condensers', 'Air-cooled condensers are drawn as an air cooler'],
  svg: svg(180, 96, shellBEM + p('M84 66V78H100V66') + p('M90 22V4', thin(3.5)) + p('M92 78V92M16 44H4M164 44H176')) })

S({ id: 'hx-plate', name: 'Plate heat exchanger', cat: 'exchangers', std: STD_HX, component: 'plate-heat-exchanger', physical: true, tags: ['E'],
  drawn: 'A rectangle (frame) with many thin vertical lines inside (the plates) and four connections, usually all on one end plate.',
  meaning: 'Gasketed or welded plate exchanger: compact cooling-medium/seawater coolers, TEG coolers. Becomes plate-heat-exchanger.',
  variants: ['Some legends draw a rectangle with a diagonal zig-zag', 'Printed-circuit (diffusion-bonded) exchangers are drawn as a solid block, which is a different component (printed-circuit-heat-exchanger)'],
  svg: svg(120, 110, r(30, 14, 60, 82) + p('M38 14V96M46 14V96M54 14V96M62 14V96M70 14V96M78 14V96', thin(1.2)) + p('M4 28H30M4 82H30M90 28H116M90 82H116')) })

S({ id: 'hx-air-cooler', name: 'Air-cooled exchanger (fin-fan)', cat: 'exchangers', std: STD_HX + ' / API 661', component: 'air-cooled-exchanger', physical: true, tags: ['E', 'AC'],
  drawn: 'A long horizontal bundle (a rectangle with a zig-zag or straight tube passes) with header boxes at the ends and a fan (a circle with blades) beside or under it, often with an M motor.',
  meaning: 'Fin-fan cooler: compressor discharge coolers, lube-oil and condensate coolers onshore. Becomes air-cooled-exchanger.',
  variants: ['Forced draught: fan below; induced draught: fan above', 'Louvres and VFD drives are drawn as extra marks', 'Some legends draw a rectangle with an X and a fan circle'],
  svg: svg(140, 120, r(20, 20, 100, 26) + r(10, 16, 10, 34) + r(120, 16, 10, 34) + p('M20 33l8-8 8 16 8-16 8 16 8-16 8 16 8-16 8 16 8-16 8 16 8-8', thin(1.4)) + c(70, 74, 16) + p('M59 63L81 85M59 85L81 63', thin(1.8)) + p('M70 90V96') + M(70, 106, 10) + p('M4 24H10M130 42H136')) })

S({ id: 'hx-double-pipe', name: 'Double-pipe (hairpin) exchanger', cat: 'exchangers', std: STD_HX, component: 'hairpin-exchanger', physical: true, tags: ['E'],
  drawn: 'A U-shaped (hairpin) pipe drawn as a pipe within a pipe: an inner line running through an outer annulus around the bend.',
  meaning: 'Hairpin or double-pipe exchanger: small duties at high pressure, sample coolers, small gas coolers. Becomes hairpin-exchanger.',
  variants: ['Simplified: two concentric lines with in and out arrows'],
  svg: svg(150, 90, p('M24 20H118a24 24 0 0 1 0 48H24M24 36H118a8 8 0 0 1 0 16H24M24 20V36M24 52V68') + p('M8 28H118a16 16 0 0 1 0 32H8', thin(1.4)) + p('M44 20V6M44 68V84')) })

S({ id: 'heater-fired', name: 'Fired heater', cat: 'exchangers', std: STD_HX + ' (group 4) / API 560', component: 'fired-heater', physical: true, tags: ['H', 'F'],
  drawn: 'A tall box (radiant section) with burners (small flames or triangles) along the floor, a narrower convection box above, and a tapered stack on top. A coil (zig-zag) runs through.',
  meaning: 'Direct-fired process heater: hot-oil heaters, glycol reboilers, crude heaters (mostly onshore). Becomes fired-heater.',
  variants: ['Simplified: a rectangle with a flame triangle under it', 'Box vs cylindrical heaters look similar on P&IDs'],
  svg: svg(120, 190, r(24, 80, 72, 90) + r(36, 48, 48, 32) + p('M48 48L54 14H66L72 48') + p('M34 96L86 104L34 112L86 120L34 128L86 136L34 144', thin(1.6)) + p('M42 50h36M42 58h36M42 66h36M42 74h36', thin(1.2)) + p('M40 186l5-12 5 12M55 186l5-12 5 12M70 186l5-12 5 12', thin(2)) + p('M24 170H96') + p('M4 58H36M96 150H116')) })

S({ id: 'heater-electric', name: 'Electric heater', cat: 'exchangers', std: STD_HX + ' (X2070 electrical heating)', component: 'electric-heater', physical: true, tags: ['E', 'H', 'EH'],
  drawn: 'A horizontal vessel with a heating element drawn as a zig-zag (resistor) inside, and a terminal box at one end.',
  meaning: 'Electric process heater: fuel-gas superheaters, regeneration-gas heaters, start-up heaters. Becomes electric-heater.',
  variants: ['ISO 10628-2 shows a small resistor rectangle on the vessel side', 'Some legends write "EH" or "ELECTRIC" inside'],
  svg: svg(170, 90, r(6, 28, 22, 32) + p(hcap(28, 22, 128, 44, 18)) + p('M28 44H40l6-10 8 20 8-20 8 20 8-20 8 20 8-20 8 20 8-20 8 20 6-10', thin(1.6)) + p('M60 22V8M130 66V82')) })

S({ id: 'cooling-tower', name: 'Cooling tower', cat: 'exchangers', std: STD_HX + ' (group 5)', component: 'cooling-tower', physical: true, tags: ['CT'],
  drawn: 'A tapering box with a fan on top (induced draught), water spray or fill inside, and a basin at the bottom.',
  meaning: 'Evaporative cooling tower for the onshore cooling-water system. Becomes cooling-tower.',
  variants: ['Natural-draught towers are drawn as a hyperbolic outline', 'Fan below = forced draught'],
  svg: svg(130, 150, p('M20 128L32 44H98L110 128z') + r(46, 24, 38, 20) + p('M50 34H80M65 26V42', thin(1.8)) + p('M36 84H94M38 96H92', thin(1.2)) + p('M40 70l3 6M56 70l3 6M72 70l3 6M88 70l3 6', thin(1.4)) + p('M12 128H118V140H12z') + p('M110 60H126M118 136H128')) })

// ---------- pumps ----------
const base = (x1, x2, y) => p(`M${x1 + 6} ${y}l-8 16h${x2 - x1 + 4}l-8-16`)
S({ id: 'pump-centrifugal', name: 'Centrifugal pump', cat: 'pumps', std: STD_PU, component: 'centrifugal-pump', physical: true, tags: ['P'],
  drawn: 'A circle with the suction at the centre of one side and the discharge leaving tangentially from the top, standing on a small base. Often a small triangle inside points towards the discharge (drawn here).',
  meaning: 'Horizontal centrifugal pump: the default process and utility pump. Becomes centrifugal-pump (API 610 OH2); use between-bearings-pump for multistage BB units and vertical-inline-pump for OH3 when the datasheet says so.',
  variants: ['Some legends omit the inner triangle; ISO-style legends may draw a "V" from the suction side instead', 'The driver (M) may be drawn joined by a shaft line', 'Spared pumps A/B are drawn twice'],
  svg: svg(120, 100, c(56, 52, 26) + p('M56 26H100V12') + p('M4 52H30') + p('M48 40l20 12-20 12z', thin(2)) + base(38, 74, 76)) })

S({ id: 'pump-vertical-inline', name: 'Vertical in-line pump', cat: 'pumps', std: STD_PU, component: 'vertical-inline-pump', physical: true, tags: ['P'],
  drawn: 'A pump circle with suction and discharge on the same horizontal line (in-line), and a motor box (M) mounted directly above it.',
  meaning: 'Close-coupled vertical in-line pump (API 610 OH3/OH4): cooling medium, chemicals, small duties. Becomes vertical-inline-pump.',
  variants: ['Often drawn as an ordinary centrifugal pump with a note "vertical in-line"'],
  svg: svg(120, 104, c(60, 74, 22) + p('M4 74H38M82 74H116') + p('M52 64l18 10-18 10z', thin(2)) + p('M60 52V44') + r(42, 8, 36, 36) + t(60, 32, 16, 'M')) })

S({ id: 'pump-vertical-turbine', name: 'Vertical turbine (caisson) pump', cat: 'pumps', std: STD_PU, component: 'vertical-turbine-pump', physical: true, tags: ['P'],
  drawn: 'A motor on top of a discharge head on the deck, with a long column running down into a caisson or sump and a stack of bowls (stages) and a suction bell at the bottom, below the water line.',
  meaning: 'Line-shaft vertical turbine pump (API 610 VS1): seawater lift and firewater pumps on caissons. Becomes vertical-turbine-pump.',
  variants: ['Diesel-driven firewater versions have DE instead of M (see the fire pump)', 'Simplified: a centrifugal pump symbol with a long dip pipe'],
  svg: svg(120, 200, M(60, 18, 14) + p('M60 32V36') + r(44, 36, 32, 20) + p('M76 46H116') + p('M8 56H112', thin(3)) + p('M54 56V140M66 56V140') + p('M50 140h20l4 10H46zM46 150h28v12H46zM46 162h28l6 14H40z') + p('M8 96q8-6 16 0t16 0M80 96q8-6 16 0t16 0', thin(1.4))) })

S({ id: 'pump-submersible', name: 'Submersible pump', cat: 'pumps', std: STD_PU, component: 'submersible-pump', physical: true, tags: ['P'],
  drawn: 'A capsule (pump and motor in one) at the bottom of a caisson or sump, below the water line, hanging from its discharge pipe; the power cable runs up beside it.',
  meaning: 'Electric submersible pump: seawater lift caissons, open-drain and sump pumps. Becomes submersible-pump.',
  variants: ['Some legends draw a centrifugal pump circle inside a sump outline with "SUB"'],
  svg: svg(120, 200, p('M8 30H112', thin(3)) + p('M36 30V192M84 30V192') + p('M60 14V136') + p('M60 14H112') + r(48, 136, 24, 48, 'rx="10"') + p('M48 158H72', thin(1.4)) + p('M70 30V136', thin(1.2) + ' ' + dash('5 3')) + p('M40 80q6-5 11 0t11 0 11 0 11 0', thin(1.4))) })

S({ id: 'pump-reciprocating', name: 'Reciprocating (plunger) pump', cat: 'pumps', std: STD_PU, component: 'reciprocating-pump', physical: true, tags: ['P'],
  drawn: 'A cylinder (rectangle) with a piston or plunger (T shape) inside, connected to a crank circle, with suction and discharge connections on the cylinder head.',
  meaning: 'Positive displacement plunger pump (API 674): high-pressure injection, glycol circulation, mud pumps and pigging. Becomes reciprocating-pump (use mud-pump for drilling mud pumps).',
  variants: ['ISO draws a circle with a piston mark inside', 'Pulsation dampeners and a relief valve on the discharge are usually drawn nearby'],
  svg: svg(120, 100, r(16, 34, 50, 32) + p('M40 36V64M40 50H86', thin(2.5)) + c(92, 50, 12) + p('M24 34V16M24 66V84') + p('M18 22l6-6 6 6M18 78l6 6 6-6', thin(1.6))) })

S({ id: 'pump-gear', name: 'Gear pump', cat: 'pumps', std: STD_PU, physical: true, tags: ['P'],
  drawn: 'A rounded casing with two meshing gears (two touching circles) inside, suction on one side and discharge on the other.',
  meaning: 'Rotary positive displacement pump: lube oil, fuel oil and chemical transfer. No dedicated component; usually part of a package.',
  variants: ['Some legends draw a pump circle with two small circles inside', 'Look-alike: PD flowmeter (smaller, on the line, with an FQ bubble)'],
  svg: svg(120, 100, r(24, 28, 72, 46, 'rx="23"') + c(49, 51, 12) + c(73, 51, 12) + p('M4 51H24M96 51H116') + base(36, 84, 74)) })

S({ id: 'pump-screw', name: 'Screw pump', cat: 'pumps', std: STD_PU, physical: true, tags: ['P'],
  drawn: 'A long casing with a helical screw (a zig-zag along the axis) inside, suction underneath and discharge on top, with a drive shaft out of one end.',
  meaning: 'Twin or triple screw pump: crude transfer, lube oil, multiphase boosting. No dedicated component.',
  variants: ['Multiphase twin-screw pumps carry an "MPP" note'],
  svg: svg(120, 100, r(18, 36, 76, 30, 'rx="6"') + p('M24 51l6-10 6 20 6-20 6 20 6-20 6 20 6-20 6 20 6-20 6 10', thin(1.6)) + p('M30 66V86M84 36V16M94 51H116')) })

S({ id: 'pump-metering', name: 'Metering (dosing) pump', cat: 'pumps', std: STD_PU + ' / API 675', component: 'metering-pump', physical: true, tags: ['P'],
  drawn: 'A pump circle with an internal triangle and a long diagonal arrow through it (adjustable capacity); diaphragm heads may be drawn as a curved line inside.',
  meaning: 'Diaphragm or plunger metering pump (API 675): chemical injection, methanol, corrosion inhibitor. Usually part of the chemical injection package. Becomes metering-pump.',
  variants: ['Some legends write "MP" or draw a diaphragm arc on the head', 'Multi-head pumps are drawn as several circles on one driver'],
  svg: svg(120, 100, c(56, 50, 24) + p('M48 38l18 12-18 12z', thin(2)) + p('M22 86L92 16', thin(1.8)) + p('M92 16l-12 3 7 7z', B) + p('M4 50H32M56 26V8')) })

S({ id: 'pump-progressive-cavity', name: 'Progressive cavity pump', cat: 'pumps', std: STD_PU, component: 'progressive-cavity-pump', physical: true, tags: ['P'],
  drawn: 'A long horizontal casing with a single sine-shaped rotor inside, suction at one end on top and discharge at the other end, often with a motor box.',
  meaning: 'Single-screw (Moineau) pump: sludge, oily water, drain sump and polymer duties. Becomes progressive-cavity-pump.',
  variants: ['Some legends draw a box with a helix and "PCP"'],
  svg: svg(130, 90, r(30, 32, 70, 28) + p('M34 46c6-12 12-12 16 0s12 12 16 0 12-12 16 0 10 12 14 0', thin(1.6)) + p('M40 32V14M100 46H126') + r(4, 36, 20, 20) + t(14, 51, 12, 'M') + p('M24 46H30')) })

// ---------- compressors, blowers, drivers ----------
S({ id: 'compressor-centrifugal', name: 'Centrifugal compressor', cat: 'machines', std: STD_MC, component: 'centrifugal-compressor', physical: true, tags: ['K', 'C'],
  drawn: 'A trapezoid lying on its side: wide at the suction end, narrow at the discharge end, with a shaft line to the driver.',
  meaning: 'Centrifugal (turbo) compressor (API 617): export, booster, flash-gas and recompression. Becomes centrifugal-compressor; a gas-turbine-driven train is gas-turbine-compressor.',
  variants: ['Multi-stage casings may show several trapezoids on one shaft', 'Anti-surge recycle (FV with UIC/FIC) and dry gas seals are drawn around it', 'Look-alike: a turbine trapezoid widens in the flow direction'],
  svg: svg(130, 104, p('M20 20L84 38V66L20 84z') + p('M4 52H20M76 36V8H126') + p('M84 52H100') + M(114, 52, 12)) })

S({ id: 'compressor-reciprocating', name: 'Reciprocating compressor', cat: 'machines', std: STD_MC, component: 'reciprocating-compressor', physical: true, tags: ['K', 'C'],
  drawn: 'A cylinder rectangle with a double-acting piston inside, joined by a rod to a crank circle, with suction on top and discharge underneath each cylinder.',
  meaning: 'Reciprocating compressor (API 618): instrument air, fuel-gas boosting, high-pressure small flows. Becomes reciprocating-compressor (instrument-air packages become instrument-air-package).',
  variants: ['Each stage cylinder may be drawn separately with pulsation bottles', 'It looks like a reciprocating pump; the tag (K) and the service decide'],
  svg: svg(130, 104, r(12, 32, 56, 40) + p('M40 32V72', thin(3)) + p('M68 52H92') + c(104, 52, 12) + p('M26 32V12M54 72V92') + p('M20 18l6-6 6 6M48 86l6 6 6-6', thin(1.6))) })

S({ id: 'compressor-screw', name: 'Screw compressor', cat: 'machines', std: STD_MC, component: 'screw-compressor', physical: true, tags: ['K', 'C'],
  drawn: 'A casing containing two meshing helical rotors (two zig-zags side by side), with suction and discharge connections and a shaft to the driver.',
  meaning: 'Rotary screw compressor (API 619): instrument and utility air, flash gas and vapour recovery. Becomes screw-compressor.',
  variants: ['Some legends draw the centrifugal trapezoid with "SCREW" written beside it', 'Oil-injected packages show an oil separator vessel downstream'],
  svg: svg(130, 104, r(16, 28, 76, 48, 'rx="10"') + p('M22 42l6-8 6 16 6-16 6 16 6-16 6 16 6-16 6 16 6-8M22 62l6-8 6 16 6-16 6 16 6-16 6 16 6-16 6 16 6-8', thin(1.6)) + p('M30 28V10M78 76V94M92 52H100') + M(114, 52, 12)) })

S({ id: 'compressor-axial', name: 'Axial compressor', cat: 'machines', std: STD_MC, physical: true, tags: ['K', 'C'],
  drawn: 'A long trapezoid narrowing in the flow direction with rows of short vertical lines inside (the blade rows), and a shaft.',
  meaning: 'Axial-flow compressor: large air or gas flows, mainly as the compressor section of a gas turbine. As a separate machine it is rare offshore. No dedicated component.',
  variants: ['Usually seen only as part of the gas-turbine symbol'],
  svg: svg(130, 104, p('M14 18L100 36V68L14 86z') + p('M30 26V78M44 30V74M58 32V72M72 34V70M86 36V68', thin(1.4)) + p('M100 52H126M4 52H14')) })

S({ id: 'blower-fan', name: 'Blower / centrifugal fan', cat: 'machines', std: STD_MC + ' (group 17)', component: 'centrifugal-fan', physical: true, tags: ['K', 'B', 'F', 'FN'],
  drawn: 'A circle (the scroll) with the outlet leaving tangentially as a short rectangular duct, and curved blades (or a small fan wheel) drawn inside.',
  meaning: 'Centrifugal fan or blower: HVAC supply and extract, combustion air, purge air. Becomes centrifugal-fan.',
  variants: ['Axial fans are drawn as a circle with a propeller', 'Positive displacement (roots) blowers are drawn as a circle with two lobes'],
  svg: svg(120, 100, c(54, 54, 30) + p('M54 24H104V44H82') + c(54, 54, 8) + p('M54 46q10-10 18-6M62 54q10 10 6 18M54 62q-10 10-18 6M46 54q-10-10-6-18', thin(1.6))) })

S({ id: 'ejector', name: 'Ejector / eductor', cat: 'machines', std: STD_MC + ' (jet pump)', physical: true, tags: ['J', 'EJ', 'X'],
  drawn: 'A converging nozzle inside a body that narrows to a throat and then widens (diffuser): the motive fluid enters at the nozzle end, suction comes in from the side, and the mixture leaves at the wide end.',
  meaning: 'Jet pump with no moving parts: gas ejectors for low-pressure flash gas recovery, water eductors for sand jetting and drains. No dedicated component.',
  variants: ['Some legends draw two triangles (nozzle and diffuser) tip to tip with a side branch'],
  svg: svg(130, 100, p('M24 34H56L70 44H80L118 30M24 66H56L70 56H80L118 70') + p('M24 34V66M118 30V70') + p('M4 50H24M28 44H46L54 50L46 56H28', thin(1.8)) + p('M40 66V94M118 50H128')) })

S({ id: 'turbo-expander', name: 'Turbo-expander (expander-compressor)', cat: 'machines', std: STD_MC, physical: true, tags: ['K', 'KT', 'EX'],
  drawn: 'Two trapezoids on one shaft: the expander widens in the flow direction and the compressor narrows, back to back.',
  meaning: 'Expander drives a compressor from the energy of a gas pressure drop (NGL recovery, dew-pointing). No dedicated component.',
  variants: ['A generator-loaded expander has a G circle instead of the compressor'],
  svg: svg(130, 104, p('M10 40L50 22V82L10 64z') + p('M50 52H80') + p('M80 22L120 40V64L80 82z') + p('M4 52H10M30 32V10M100 32V10')) })

const gt = (x) => p(`M${x} 30L${x + 30} 40V64L${x} 74z`) + c(x + 40, 52, 8) + p(`M${x + 50} 40L${x + 80} 28V76L${x + 50} 64z`) + p(`M${x + 30} 52H${x + 32}M${x + 48} 52H${x + 50}`)
S({ id: 'driver-gas-turbine', name: 'Gas turbine', cat: 'machines', std: STD_MC + ' (group 20)', physical: true, tags: ['GT', 'KT'],
  drawn: 'A compressor trapezoid (narrowing), a small combustor circle, and a turbine trapezoid (widening), on a common shaft, with air in and exhaust out.',
  meaning: 'Gas turbine driver (API 616). Not modelled alone: with a generator it becomes gas-turbine-generator, and with a compressor it becomes gas-turbine-compressor.',
  variants: ['Many legends draw a box with "GT"', 'Two-shaft turbines show a separate power turbine trapezoid'],
  svg: svg(130, 104, gt(10) + p('M90 52H126') + p('M4 52H10') + p('M80 28V10', thin(2))) })

S({ id: 'gas-turbine-generator', name: 'Gas turbine generator set', cat: 'machines', std: STD_MC + ' / IEC 60617 (G)', component: 'gas-turbine-generator', physical: true, tags: ['GT', 'G', 'TG'],
  drawn: 'A gas turbine (two trapezoids with a combustor circle, or a box marked GT) on a shaft to a circle marked "G".',
  meaning: 'Main power generation: a gas turbine driving a generator, running on fuel gas with diesel backup. Becomes gas-turbine-generator.',
  variants: ['Electrical drawings show only the G circle on the single-line diagram'],
  svg: svg(160, 104, gt(6) + p('M86 52H118') + c(134, 52, 18) + t(134, 58, 16, 'G')) })

S({ id: 'gas-turbine-compressor', name: 'Gas-turbine-driven compressor train', cat: 'machines', std: STD_MC, component: 'gas-turbine-compressor', physical: true, tags: ['K', 'GT'],
  drawn: 'A gas turbine symbol on a shaft to a compressor trapezoid.',
  meaning: 'Gas-turbine-driven centrifugal compressor (export or injection). Becomes gas-turbine-compressor.',
  variants: ['Electric-motor-driven compressors show an M circle instead (then centrifugal-compressor)'],
  svg: svg(180, 104, gt(6) + p('M86 52H104') + p('M104 26L164 40V64L104 78z') + p('M118 30V8M150 64V90')) })

S({ id: 'driver-steam-turbine', name: 'Steam turbine', cat: 'machines', std: STD_MC + ' (group 20)', physical: true, tags: ['ST', 'KT', 'T'],
  drawn: 'A trapezoid widening in the flow direction, with steam in at the narrow end and exhaust at the wide end, and a shaft to the driven machine.',
  meaning: 'Steam turbine driver: onshore and refinery pumps, compressors and generators. Not used offshore. No dedicated component.',
  variants: ['A turbine trapezoid widens in the flow direction; a compressor trapezoid narrows'],
  svg: svg(130, 104, p('M20 38L80 20V84L20 66z') + p('M28 36V10M70 84V98') + p('M80 52H126')) })

S({ id: 'driver-motor', name: 'Electric motor (driver)', cat: 'machines', std: STD_MC + ' / IEC 60617', component: 'electric-motor', physical: true, tags: ['PM', 'KM', 'M'],
  drawn: 'A circle containing "M" joined by a shaft line to the driven pump, fan or compressor.',
  meaning: 'Electric motor driver. Usually part of the pump or compressor package; becomes electric-motor if modelled separately.',
  variants: ['Variable-speed motors are marked VSD/VFD or have a diagonal arrow', 'Electrical drawings use "M" with "3~"'],
  svg: svg(120, 80, c(40, 40, 24) + t(40, 47, 20, 'M') + p('M64 40H116')) })

S({ id: 'driver-diesel-engine', name: 'Diesel engine (driver)', cat: 'machines', std: STD_MC + ' (group 20)', physical: true, tags: ['DE', 'D'],
  drawn: 'A rectangle marked "DE" (or "D"), joined by a shaft to the driven machine, with fuel and exhaust connections.',
  meaning: 'Diesel engine driver: firewater pumps, emergency and essential generators, crane engines. With a pump it is diesel-firewater-pump; with a generator it is diesel-generator.',
  variants: ['ISO draws an engine as a rectangle with a cross or a piston mark'],
  svg: svg(120, 80, r(10, 18, 52, 44) + t(36, 46, 18, 'DE') + p('M62 40H116M24 18V6')) })

S({ id: 'diesel-generator-set', name: 'Diesel generator set', cat: 'machines', std: STD_MC + ' / IEC 60617 (G)', component: 'diesel-generator', physical: true, tags: ['DG', 'EG', 'G'],
  drawn: 'A "DE" rectangle on a shaft to a "G" circle.',
  meaning: 'Emergency or essential diesel generator: starts on main power failure and feeds the emergency switchboard. Becomes diesel-generator.',
  variants: ['On the single-line diagram only the G circle is shown'],
  svg: svg(140, 80, r(8, 18, 52, 44) + t(34, 46, 18, 'DE') + p('M60 40H92') + c(110, 40, 18) + t(110, 46, 16, 'G')) })

// ---------- separation ----------
S({ id: 'filter-general', name: 'Filter (general)', cat: 'separation', std: STD_SP + ' (group 6)', physical: true, tags: ['F', 'S'],
  drawn: 'A vessel outline divided by a dashed line (the filter medium), with inlet on one side and outlet on the other.',
  meaning: 'Any filter: liquid filter, gas filter, bag filter. If cartridges are drawn it is cartridge-filter; with a coalescing and vane section it is filter-separator.',
  variants: ['Some legends draw a rectangle with a dashed diagonal', 'Duplex filters are two such vessels with changeover valves'],
  svg: svg(100, 150, p(vcap(26, 18, 48, 114, 14)) + p('M26 80H74', thin(2) + ' ' + dash('6 4')) + p('M4 50H26M74 110H96M50 18V6')) })

S({ id: 'filter-cartridge', name: 'Cartridge filter', cat: 'separation', std: STD_SP, component: 'cartridge-filter', physical: true, tags: ['F', 'S'],
  drawn: 'A vertical vessel with a tubesheet line across it and several narrow rectangles (cartridges) hanging from it.',
  meaning: 'Cartridge filter or coalescer housing: fuel-gas filters, injection-water polishing, chemical filters. Becomes cartridge-filter.',
  variants: ['Bag filters are drawn with U-shaped bags', 'A dp gauge (PDI) is almost always drawn across it'],
  svg: svg(100, 160, p(vcap(24, 14, 52, 130, 14)) + p('M24 48H76') + r(32, 54, 8, 60) + r(46, 54, 8, 60) + r(60, 54, 8, 60) + p('M4 120H24M76 34H96M50 144V156')) })

S({ id: 'filter-media', name: 'Media filter (multimedia / nutshell)', cat: 'separation', std: STD_SP, component: 'water-filter-package', physical: true, tags: ['F'],
  drawn: 'A vertical vessel partly filled with a dotted area (the filter bed), with an inlet distributor on top and a collector at the bottom.',
  meaning: 'Deep-bed filter: seawater injection filtration, produced-water nutshell filters. Usually several in parallel with backwash. Becomes water-filter-package.',
  variants: ['Layers may be shown with different hatching (anthracite, sand, garnet)'],
  svg: svg(100, 160, p(vcap(24, 14, 52, 130, 14)) + p('M24 64H76M24 120H76') + Array.from({ length: 24 }, (_, i) => c(30 + (i % 6) * 8 + ((Math.floor(i / 6) % 2) * 4), 72 + Math.floor(i / 6) * 12, 1.6, B)).join('') + p('M50 14V4M50 144V156M76 40H96')) })

S({ id: 'filter-separator', name: 'Filter-separator / coalescer', cat: 'separation', std: STD_SP, component: 'filter-separator', physical: true, tags: ['V', 'F'],
  drawn: 'A horizontal vessel with two sections: filter or coalescer elements (dashed rectangles) in the first, a vane pack (zig-zag) in the second, and a liquid sump under each.',
  meaning: 'Two-stage gas filter-separator: fuel-gas and seal-gas conditioning, sales-gas polishing. Becomes filter-separator.',
  variants: ['Vertical coalescers are drawn as a vertical vessel with cartridges', 'Liquid-liquid coalescers show a hatched coalescing pack'],
  svg: svg(180, 110, p(hcap(14, 20, 152, 52, 20)) + p('M100 20V72') + r(36, 32, 54, 10, dash('4 3') + ' ' + thin(1.6)) + r(36, 50, 54, 10, dash('4 3') + ' ' + thin(1.6)) + p('M118 24l6 8-6 8 6 8-6 8 6 8-6 8M130 24l6 8-6 8 6 8-6 8 6 8-6 8', thin(1.6)) + p('M50 72V88H70V72M120 72V88H140V72') + p('M30 20V6M150 20V6M60 88V100M130 88V100')) })

S({ id: 'cyclone', name: 'Cyclone (gas-solid or gas-liquid)', cat: 'separation', std: STD_SP + ' (group 8)', physical: true, tags: ['V', 'CY'],
  drawn: 'A cylinder on top of a cone pointing down, with a tangential inlet at the side of the cylinder, a gas outlet tube dipping in from the top and a solids or liquid outlet at the cone tip.',
  meaning: 'Centrifugal separator. In oil and gas, cyclonic internals and cyclone separators remove liquids or sand from gas. No dedicated component; desanders and hydrocyclones have their own.',
  variants: ['Multicyclone banks are drawn as several small cones in one vessel'],
  svg: svg(100, 160, p('M26 20H74V70L54 130H46L26 70z') + p('M42 6V48H58V6', thin(2)) + p('M4 30H26M50 130V156')) })

S({ id: 'hydrocyclone', name: 'Hydrocyclone (de-oiling liner)', cat: 'separation', std: STD_SP, component: 'hydrocyclone-package', physical: true, tags: ['X', 'Z'],
  drawn: 'A long narrow cone lying on its side: tangential inlet at the wide end, a small reject (oil) outlet on the axis at the wide end, and the clean water outlet at the narrow tip. Packages show a vessel holding many liners.',
  meaning: 'De-oiling hydrocyclone for produced water: removes oil droplets by spinning. Becomes hydrocyclone-package (the vessel with liners and its reject and water lines).',
  variants: ['Package P&IDs draw one vessel with "liners" written inside', 'Desanding hydrocyclones are the same shape, mounted vertically, with sand out at the tip'],
  svg: svg(140, 90, p('M20 32H44L118 44V56L44 68H20z') + p('M30 32V12M20 50H4M118 50H136') + p('M24 44H40', thin(1.4))) })

S({ id: 'desander', name: 'Desander', cat: 'separation', std: STD_SP, component: 'desander', physical: true, tags: ['V', 'DS'],
  drawn: 'A vertical vessel with an inverted cone (cyclone liner) inside and a sand accumulator chamber at the bottom with a sand dump valve.',
  meaning: 'Wellhead or produced-water desander: removes sand before the separators. Becomes desander.',
  variants: ['Multiple liners in one vessel are drawn as several cones', 'The sand outlet goes to a sand-handling or jetting system (SD lines)'],
  svg: svg(100, 170, p(vcap(24, 14, 52, 140, 14)) + p('M34 40H66L54 104H46z', thin(2)) + p('M24 118H76', dash('5 3') + ' ' + thin(1.4)) + p('M4 46H34M50 14V4M50 154V166')) })

S({ id: 'agitator', name: 'Agitator / mixer in vessel', cat: 'separation', std: STD_SP + ' (group 28)', physical: true, tags: ['A', 'AG', 'MX'],
  drawn: 'A vessel or tank with a motor (M) on top, a shaft running down into the liquid, and an impeller (two short blades or a propeller) at the bottom.',
  meaning: 'Stirred vessel: chemical make-up tanks, mud tanks, polymer and flocculant mixing. Model the tank; note the agitator.',
  variants: ['ISO shows different impeller marks (propeller, anchor, turbine)', 'Side-entry mixers come in through the shell'],
  svg: svg(120, 160, p('M20 40V140H100V40') + p('M14 40H106') + M(60, 22, 12) + p('M60 34V122') + p('M44 116l16 6 16-6M44 128l16-6 16 6', thin(2))) })

S({ id: 'static-mixer', name: 'Static (in-line) mixer', cat: 'separation', std: STD_SP, physical: true, tags: ['MX', 'X'],
  drawn: 'A short in-line rectangle on the pipe with alternating diagonal or helical elements inside.',
  meaning: 'Motionless mixer: mixes injected chemicals, wash water or demulsifier into the main flow. No dedicated component.',
  variants: ['Mixing valves (globe-type) and mixing tees are drawn as valves and tees'],
  svg: svg(120, 60, p('M4 30H32M88 30H116') + r(32, 14, 56, 32) + p('M36 18l8 24M48 42l8-24M60 18l8 24M72 42l8-24', thin(1.6))) })

S({ id: 'silencer', name: 'Silencer', cat: 'separation', std: STD_SP + ' / company legend practice', physical: true, tags: ['SL', 'X'],
  drawn: 'A short fat cylinder (rounded rectangle) on a vent, exhaust or blow-off line, with baffles or a perforated tube inside.',
  meaning: 'Reduces noise: gas-turbine exhausts, PSV and blowdown discharges to atmosphere, steam vents. No dedicated component; vent-stack may include one.',
  variants: ['Often written simply as "SILENCER" on the line'],
  svg: svg(120, 70, p('M4 35H30M90 35H116') + r(30, 14, 60, 42, 'rx="10"') + p('M30 35H90', dash('3 3') + ' ' + thin(1.6)) + p('M46 14V28M60 42V56M74 14V28', thin(1.6))) })

// ---------- oilfield and packages ----------
S({ id: 'flare-stack', name: 'Flare stack / tip', cat: 'oilfield', std: STD_OF + ' / API 537', component: 'flare-stack', physical: true, tags: ['FS', 'FL', 'X'],
  drawn: 'A tall vertical stack with a flame shape at the tip, often with a molecular seal (a bulge) below the tip and pilot and ignition lines.',
  meaning: 'Elevated flare: burns relief and blowdown gas. Becomes flare-stack (offshore booms are flare-boom).',
  variants: ['Ground or enclosed flares are drawn as a box with a flame', 'HP and LP tips may be drawn side by side'],
  svg: svg(100, 190, p('M44 44V176H56V44') + p('M40 44H60') + p('M50 38c-12-8-6-20 0-32 3 9 14 18 0 32z') + r(42, 70, 16, 20, 'rx="6"') + p('M4 170H44') + p('M64 60V170', thin(1.4) + ' ' + dash('5 3'))) })

S({ id: 'flare-boom', name: 'Flare boom', cat: 'oilfield', std: STD_OF + ' / API 537', component: 'flare-boom', physical: true, tags: ['FB', 'X'],
  drawn: 'A long lattice boom (two parallel lines with a zig-zag between them) angled up and out from the platform edge, with the flare header inside it and a flame at the tip.',
  meaning: 'Offshore flare boom carrying the flare header out from the platform. Becomes flare-boom.',
  variants: ['P&IDs often draw it as a flare stack with "BOOM" noted'],
  svg: svg(180, 130, p('M10 120L150 30M24 126L160 42') + p('M17 123L38 113L44 103L66 95L72 85L94 77L100 67L122 59L128 49L150 41', thin(1.2)) + p('M155 34c-10-6-6-18 2-28 2 8 12 18-2 28z') + p('M4 120H24', thin(3))) })

S({ id: 'flare-ko-drum', name: 'Flare knock-out drum', cat: 'oilfield', std: STD_OF + ' / API 521', component: 'horizontal-separator', physical: true, tags: ['V'],
  drawn: 'A horizontal drum with flare inlets at one or both ends on top, the gas outlet to the flare from the top centre, and a liquid outlet underneath (often to pumps).',
  meaning: 'Flare KO drum: catches liquid droplets before the flare. Becomes horizontal-separator with service KO, fed by the flare header.',
  variants: ['Vertical KO drums are drawn as a vertical vessel', 'Liquid seal drums (water seal) are drawn with a dip pipe'],
  svg: svg(160, 100, p(hcap(14, 22, 132, 50, 22)) + p('M30 22V6M130 22V6M80 22V4M80 72V92') + p('M30 10l-4 6h8zM130 10l-4 6h8z', B)) })

S({ id: 'vent-stack', name: 'Cold vent stack', cat: 'oilfield', std: STD_OF + ' / API 521', component: 'vent-stack', physical: true, tags: ['VS', 'X'],
  drawn: 'A vertical stack with an open top and no flame, sometimes with a small rain cap or dispersion arrows at the top.',
  meaning: 'Atmospheric vent for low-pressure hydrocarbon vents (TEG still, flash, riser blowdown). Becomes vent-stack.',
  variants: ['A flame arrester or snuffing connection may be drawn at the tip'],
  svg: svg(100, 180, p('M44 30V170H56V30') + p('M40 30H60') + p('M50 24V6M42 14l8-8 8 8', thin(1.6)) + p('M4 160H44')) })

const barrel = p('M34 30H104L120 42V58L104 70H34z') + p('M28 24V76', thin(4)) + c(28, 80, 3, B)
S({ id: 'pig-launcher', name: 'Pig launcher', cat: 'oilfield', std: STD_OF, component: 'pig-launcher', physical: true, tags: ['L', 'PL'],
  drawn: 'An enlarged barrel (a fat pipe section) with a quick-opening closure door (thick bar) at the back end, a reducer to the pipeline at the front, a kicker line from the back of the barrel through a valve to the main line, and a flow arrow away from the door.',
  meaning: 'Launches pigs into an export pipeline or flowline. Becomes pig-launcher. A pig signaller (XI) is often drawn on the outgoing line.',
  variants: ['The pig itself may be drawn as a dashed bullet inside the barrel', 'Pressure gauges, vents and drains on the barrel are typical'],
  svg: svg(170, 110, barrel + p('M120 50H166') + p('M42 30V12H140V50', thin(2)) + bow(92, 12, { w: 10, h: 7 }) + p('M48 50h36', thin(1.4) + ' ' + dash('5 3')) + p('M140 90H166M160 84l6 6-6 6', thin(1.8))) })

S({ id: 'pig-receiver', name: 'Pig receiver', cat: 'oilfield', std: STD_OF, component: 'pig-launcher', physical: true, tags: ['L', 'PR'],
  drawn: 'The mirror of a launcher: the pipeline enters through a reducer into the enlarged barrel, which ends at a closure door, with a bypass line and a flow arrow towards the door.',
  meaning: 'Receives pigs at the end of a pipeline. Becomes pig-launcher (the same component serves launcher and receiver).',
  variants: ['A pig basket or bar tee at the barrel outlet may be drawn'],
  svg: svg(170, 110, p('M136 30H66L50 42V58L66 70H136z') + p('M142 24V76', thin(4)) + c(142, 80, 3, B) + p('M4 50H50') + p('M20 50V12H128V30', thin(2)) + bow(76, 12, { w: 10, h: 7 }) + p('M8 90H34M28 84l6 6-6 6', thin(1.8))) })

const vbow = (x, y, w = 10, h = 14, f = false) => p(`M${x - w} ${y - h}h${2 * w}L${x} ${y}zM${x - w} ${y + h}h${2 * w}L${x} ${y}z`, f ? B : '')
S({ id: 'christmas-tree', name: 'Christmas tree (wellhead valves)', cat: 'oilfield', std: STD_OF + ' (API 6A)', component: 'christmas-tree', physical: true, tags: ['XT', 'WH'],
  drawn: 'A vertical stack of valves on the wellhead: lower and upper master valves, a cross with a production wing valve (actuated) and a kill wing to the side, a swab valve and tree cap on top, and a choke on the production wing outlet.',
  meaning: 'Surface christmas tree on a well. The upper master (SSV) and production wing valves are usually actuated and tripped by the wellhead control panel. Becomes christmas-tree; the wing outlet line goes to the manifold through the choke.',
  variants: ['Each valve may carry its tag (LMV, UMV/SSV, PWV, KWV, SV)', 'The SCSSV downhole is drawn as a valve in the tubing below the wellhead', 'Annulus valves (A/B annulus) appear on the wellhead below the tree'],
  svg: svg(180, 210, p('M70 170V164') + r(46, 170, 48, 26) + vbow(70, 150) + vbow(70, 112) + p('M70 164V164M70 136V126M70 98V88M60 50h20') + p('M70 88V70') + vbow(70, 56) + p('M70 42V30') + r(60, 18, 20, 12) + p('M70 88H96M70 88H44') + bow(110, 88, { w: 14, h: 10 }) + p('M110 88V68') + r(100, 54, 20, 14) + bow(30, 88, { w: 10, h: 7 }) + p('M124 88H140') + p('M140 78L160 88L140 98z') + p('M150 104L170 66', thin(1.6)) + p('M160 88H178') + p('M70 122H90', thin(1.4)) + r(90, 115, 14, 14)) })

S({ id: 'production-manifold', name: 'Production / test manifold', cat: 'oilfield', std: STD_OF, component: 'production-manifold', physical: true, tags: ['M', 'MF'],
  drawn: 'Two parallel headers (production and test) with several incoming well lines; each well line has a valve to each header, so one well at a time can be routed to test.',
  meaning: 'Gathers well flowlines into the production header and diverts one well to the test separator. Becomes production-manifold (slots = number of well inlets).',
  variants: ['Three-header manifolds add an HP/LP or a gas-lift header', 'Multi-port selector valves (MSV) replace the valve pairs on newer designs'],
  svg: svg(180, 130, p('M10 40H176M10 96H176', thin(3)) + [40, 90, 140].map((x) => p(`M${x} 126V40`) + vbow(x, 68, 7, 10) + vbow(x, 112, 7, 9)).join('') + p('M168 34l8 6-8 6M168 90l8 6-8 6', thin(1.6))) })

S({ id: 'bop-stack', name: 'BOP stack', cat: 'oilfield', std: STD_OF + ' (API 16A / 53)', component: 'bop-stack', physical: true, tags: ['BOP'],
  drawn: 'A vertical stack: an annular preventer on top (a rounded block), then two or three ram blocks (rectangles with rams drawn as opposing filled triangles), with choke and kill side outlets and valves.',
  meaning: 'Blowout preventer stack on the wellhead during drilling and workover. Becomes bop-stack; the side outlets go to the choke & kill manifold (choke-manifold).',
  variants: ['Ram types are written beside each block (pipe, blind, shear)'],
  svg: svg(160, 190, r(46, 14, 68, 34, 'rx="14"') + [64, 104, 144].map((y) => r(40, y, 80, 28) + p(`M44 ${y + 6}v16l20-8zM116 ${y + 6}v16l-20-8z`, B)).join('') + p('M80 48V64M80 92V104M80 132V144M80 172V188') + p('M120 118H148M40 118H12') + bow(134, 118, { w: 7, h: 6 }) + bow(26, 118, { w: 7, h: 6 })) })

S({ id: 'riser', name: 'Riser', cat: 'oilfield', std: STD_OF, component: 'riser', physical: true, tags: ['R'],
  drawn: 'A line running from the topsides down through the sea surface (a wavy line) to the seabed (a hatched line), where it turns into the pipeline; often with an ESDV at the top and "RISER" or a pipeline number written on it.',
  meaning: 'Pipeline riser: import or export riser on the jacket. Becomes riser; the topsides riser ESDV is a separate esd-valve.',
  variants: ['Subsea isolation valves (SSIV) are drawn on the pipeline near the riser base', 'Flexible risers are drawn wavy'],
  svg: svg(160, 170, p('M60 4V140H156', thin(3)) + p('M4 60q8-6 16 0t16 0 16 0M84 60q8-6 16 0t16 0 16 0 16 0', thin(1.4)) + p('M4 150H156', thin(1.6)) + p('M10 150l-6 8M30 150l-6 8M50 150l-6 8M70 150l-6 8M90 150l-6 8M110 150l-6 8M130 150l-6 8M150 150l-6 8', thin(1.2))) })

S({ id: 'package-skid', name: 'Package / skid (generic)', cat: 'oilfield', std: STD_OF, physical: true, tags: ['X', 'A', 'PK'],
  drawn: 'A rectangle (often inside a dash-dot boundary) labelled with the package tag and name, standing on skid rails, with connections crossing its edge.',
  meaning: 'Vendor package whose internals are on the vendor P&IDs. Map it by name to the matching package component: chemical-injection-skid, instrument-air-package, teg-regeneration, nitrogen-generator, hydraulic-power-unit, hydrocyclone-package, water-filter-package, hypochlorite-generator or metering-skid.',
  variants: ['On overview P&IDs, packages are often a single labelled box'],
  svg: svg(160, 100, r(24, 16, 112, 60) + p('M18 82H142M18 88H142', thin(2)) + p('M4 46H24M136 46H156')) })

S({ id: 'chemical-injection-package', name: 'Chemical injection package', cat: 'oilfield', std: STD_OF, component: 'chemical-injection-skid', physical: true, tags: ['C', 'X', 'CI'],
  drawn: 'A dash-dot package boundary holding a chemical tank (or tote) and one or more metering pumps (pump circles with diagonal arrows), with injection lines leaving to the process.',
  meaning: 'Chemical injection skid: corrosion and scale inhibitor, demulsifier, methanol, biocide, antifoam. Becomes chemical-injection-skid (outlets = number of injection lines).',
  variants: ['Methanol packages are drawn the same', 'Each injection line often has a flow indicator and a check valve at the injection quill'],
  svg: svg(180, 120, r(8, 8, 164, 104, thin(2) + ' ' + dash('12 4 3 4')) + r(20, 26, 30, 70) + [74, 128].map((x) => c(x, 60, 16) + p(`M${x - 20} 80L${x + 20} 40`, thin(1.4))).join('') + p('M50 86H74V76M74 44V20H172M50 86H128V76M128 44V30H172')) })

S({ id: 'fiscal-metering-skid', name: 'Fiscal metering skid', cat: 'oilfield', std: STD_OF + ' / API MPMS / ISO 5167', component: 'metering-skid', physical: true, tags: ['X', 'FQ'],
  drawn: 'A dash-dot boundary with an inlet header, two or more parallel meter runs (each with isolation valves and a meter box or FE), an outlet header, and often a prover connection and a sampler.',
  meaning: 'Fiscal (custody transfer) metering for oil or gas export. Becomes metering-skid; a compact prover (compact-prover) is usually connected.',
  variants: ['Gas skids use ultrasonic or orifice runs; oil skids use turbine, Coriolis or ultrasonic runs', 'Flow computers are drawn as hexagons (computer functions)'],
  svg: svg(190, 120, r(8, 8, 174, 104, thin(2) + ' ' + dash('12 4 3 4')) + p('M20 30V90M170 30V90', thin(3)) + [36, 84].map((y) => p(`M20 ${y}H170`) + bow(44, y, { w: 10, h: 8 }) + r(82, y - 10, 26, 20, W) + t(95, y + 4, 11, 'FE') + bow(146, y, { w: 10, h: 8 })).join('') + p('M4 60H20M170 60H186')) })

S({ id: 'compact-prover', name: 'Meter prover (compact piston prover)', cat: 'oilfield', std: STD_OF + ' / API MPMS ch. 4', component: 'compact-prover', physical: true, tags: ['X'],
  drawn: 'A cylinder with a piston (a short vertical bar) inside and detector marks, with inlet and outlet connections and a 4-way or double-block valves to the meter runs.',
  meaning: 'Calibrates the fiscal meters in place. Becomes compact-prover.',
  variants: ['Pipe (ball) provers are drawn as a long U-loop with launching chambers'],
  svg: svg(170, 80, r(30, 22, 110, 36) + r(56, 22, 8, 36, B) + p('M80 18V22M118 18V22', thin(2)) + p('M4 40H30M140 40H166')) })

S({ id: 'hydraulic-power-unit', name: 'Hydraulic power unit (HPU)', cat: 'oilfield', std: STD_OF + ' / ISO 1219-1', component: 'hydraulic-power-unit', physical: true, tags: ['X', 'HPU'],
  drawn: 'A dash-dot package with an oil reservoir (open-top tank), a pump with a motor, and an accumulator (a capsule split by a line), with hydraulic supply and return lines leaving.',
  meaning: 'Wellhead HPU supplying hydraulic pressure to the SSVs, SCSSVs and wing valves through the wellhead control panel. Becomes hydraulic-power-unit.',
  variants: ['Accumulators alone (ISO 1219) are a capsule with a horizontal dividing line'],
  svg: svg(180, 120, r(8, 8, 164, 104, thin(2) + ' ' + dash('12 4 3 4')) + p('M20 46V96H60V46') + p('M24 62H56', dash('4 3') + ' ' + thin(1.2)) + p('M60 74H76') + c(90, 74, 14) + p('M84 66l12 8-12 8z', thin(1.6)) + p('M104 74H128V70') + p(vcap(118, 20, 20, 50, 8)) + p('M118 44H138', thin(1.6)) + p('M128 20V14H180') + p('M180 104H40V96', thin(1.6))) })

S({ id: 'gas-cylinder-bank', name: 'Gas cylinder bank', cat: 'oilfield', std: 'ISO 10628-2 (C0002 gas cylinder)', component: 'gas-cylinder-quad', physical: true, tags: ['X', 'N2'],
  drawn: 'A row of tall narrow cylinders with domed tops (gas bottles), each with a valve, joined to a common manifold.',
  meaning: 'Bottle rack or quad of compressed gas: nitrogen backup, calibration gas. Becomes gas-cylinder-quad. CO2 or inert-gas fire-suppression banks are drawn the same but belong to fire & gas.',
  variants: ['A single bottle is one cylinder symbol', 'Quads are often drawn as one box labelled "N2 QUAD"'],
  svg: svg(150, 130, [30, 66, 102].map((x) => p(`M${x - 12} 120V36a12 12 0 0 1 24 0V120z`) + p(`M${x} 24V14`)).join('') + p('M30 14H140', thin(2.2))) })
