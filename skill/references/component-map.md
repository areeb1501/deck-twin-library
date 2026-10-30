# Component map: drawing → registry name

Find what the drawing or datasheet calls the item, then use the registry name. Confirm the props and ports with `deck-twin info <name>`. If `list` shows a name that isn't here, `list` wins.

## Vessels & tanks

| On the drawing | Component | Props to set |
|---|---|---|
| 3-phase separator, production / test separator, FWKO | `horizontal-separator` | `service: "3-phase"`, `diameter`, `length`, `pressure`, `rating`, nozzle NPS |
| 2-phase separator, LP separator, slug catcher (small) | `horizontal-separator` | `service: "2-phase"` |
| Flare KO drum, closed drain drum, horizontal KO drum | `horizontal-separator` | `service: "ko-drum"` |
| Gas scrubber, suction scrubber, fuel gas scrubber, vertical separator | `vertical-separator` | `diameter`, `height`, `support` |
| TEG contactor, amine absorber, stabiliser, stripper, fractionator, any trayed or packed column | `column` | `diameter`, `height`, `sections` |
| Filter separator, gas filter (horizontal) | `filter-separator` | |
| Cartridge filter, coalescer, filter housing (vertical) | `cartridge-filter` | |
| Atmospheric storage tank, API 650 tank, diesel/water storage | `storage-tank` | `diameter`, `height`, `roof` |
| LPG sphere, butane sphere | `spherical-tank` | |
| Instrument air receiver, N₂ receiver, accumulator, buffer vessel | `air-receiver` | |
| Desander, sand separator | `desander` |
| Bullet tank (horizontal LPG / NGL storage) | `bullet-tank` |
| Slug catcher (finger type) | `slug-catcher` | |

## Heat transfer & flare

| On the drawing | Component |
|---|---|
| Shell & tube exchanger, cooler, heater, reboiler (TEMA AES/BEM/AEU/AKT) | `shell-and-tube-exchanger` (`tema`) |
| Air cooler, fin-fan, air-cooled heat exchanger | `air-cooled-exchanger` (`bays`) |
| Plate exchanger, PHE, gasketed plate-and-frame | `plate-heat-exchanger` |
| Fired heater, direct-fired heater (vertical cylindrical) | `fired-heater` |
| Electric process heater | `electric-heater` |
| Double pipe / hairpin exchanger | `hairpin-exchanger` |
| Printed circuit / diffusion-bonded compact exchanger (PCHE) | `printed-circuit-heat-exchanger` |
| Cooling tower (onshore) | `cooling-tower` |
| Offshore flare boom | `flare-boom` |
| Flare stack (onshore) | `flare-stack` |
| Cold vent, vent stack | `vent-stack` |

## Rotating equipment

| On the drawing | Component |
|---|---|
| Centrifugal pump, export pump, transfer pump, booster, end-suction pump (API 610 OH2) | `centrifugal-pump` |
| Inline pump (OH3) | `vertical-inline-pump` |
| Multistage / between-bearings pump (BB2, BB3), water injection pump, high-head pump | `between-bearings-pump` |
| Seawater lift pump, caisson pump, vertical turbine pump (VS1) | `vertical-turbine-pump` |
| Firewater pump (diesel driven) | `diesel-firewater-pump` |
| Plunger / reciprocating pump (API 674) | `reciprocating-pump` |
| Chemical / dosing / metering pump (API 675) | `metering-pump` |
| Centrifugal compressor, export compressor, recompression (API 617) | `centrifugal-compressor` (`driver`: motor / gas-turbine) |
| Gas-turbine-driven compressor train | `gas-turbine-compressor` |
| Reciprocating compressor (API 618) | `reciprocating-compressor` |
| Screw compressor, air compressor package | `screw-compressor` |
| Gas turbine generator, GTG, power generation turbine (API 616) | `gas-turbine-generator` |
| Emergency diesel generator, EDG | `diesel-generator` |
| Electric motor (standalone) | `electric-motor` |
| Fan, blower, HVAC supply/extract fan | `centrifugal-fan` |
| Progressive cavity pump (PCP, mono pump) | `progressive-cavity-pump` |
| Submersible seawater / caisson pump (ESP-style) | `submersible-pump` |

## Wells & pipelines

| On the drawing | Component |
|---|---|
| Christmas tree, producer, injector | `christmas-tree` (`wellType`) |
| Wellhead without tree (casing head + spools, suspended well) | `wellhead-housing` |
| Production / test manifold | `production-manifold` (`slots`) |
| Pig launcher, pig receiver, pig trap | `pig-launcher` (`type`) |
| BOP stack | `bop-stack` |
| Choke valve (API 6A) | `choke-valve` |
| Riser, export riser, import riser | `riser` |
| Wellhead control panel, WHCP | `wellhead-control-panel` |
| Drilling rig, derrick | `drilling-derrick` |

## Onshore & terminals

| On the drawing | Component |
|---|---|
| Marine loading arm (jetty) | `marine-loading-arm` |
| Truck / road tanker loading bay, gantry | `truck-loading-bay` |
| Pipeline block valve station, MLV | `pipeline-valve-station` |
| Packaged steam boiler (fire-tube) | `packaged-boiler` |
| Oily water separator, CPI / API separator | `oily-water-separator` |
| Tank bund, dike wall | `bund-wall` |
| Perimeter / security fence and gate | `perimeter-fence` |
| HV circuit breaker (outdoor, live tank) | `hv-circuit-breaker` |
| HV disconnector / isolator, earth switch | `disconnector` |
| CT, VT, CVT (outdoor) | `instrument-transformer` (`kind`) |
| Surge arrester | `surge-arrester` |
| Substation busbar gantry | `busbar-gantry` |
| Warehouse, workshop, control building | `industrial-building` (`kind`) |
| Gatehouse, security barrier | `gatehouse` |

## Drilling & subsea

| On the drawing | Component |
|---|---|
| Mud pump (triplex / multiplex, API 7K) | `mud-pump` |
| Choke & kill manifold (API 16C) | `choke-manifold` |
| Shale shaker | `shale-shaker` |
| Mud pit / active tank with agitators | `mud-tank` |
| Pipe-handling catwalk, V-door ramp | `pipe-handling-catwalk` |
| Cementing unit | `cement-unit` |
| Coiled tubing unit (reel, cabin, power pack) | `coiled-tubing-unit` |
| Subsea production manifold | `subsea-manifold` |
| PLET (pipeline end termination) | `plet` |
| UTA (umbilical termination assembly) | `umbilical-termination-assembly` |
| Subsea Xmas tree (vertical) | `subsea-tree` |

Subsea items stand on the seabed: y = 0 is the mudline in their frame.

## Valves (go in `inline`, except PSV)

| P&ID symbol / tag prefix | Component |
|---|---|
| Gate valve, isolation valve (HV/XV manual) | `gate-valve` |
| Ball valve | `ball-valve` |
| Globe valve | `globe-valve` |
| Check valve, NRV (swing) | `swing-check-valve` |
| Wafer / dual-plate check | `dual-plate-check-valve` |
| Butterfly valve | `butterfly-valve` |
| Plug valve | `plug-valve` |
| Control valve: LV, PV, FV, TV, PCV, LCV, TCV, FCV | `control-valve` |
| ESDV, SDV, XV (actuated shutdown) | `esd-valve` |
| BDV, blowdown valve | `blowdown-valve` |
| MOV, motor-operated valve | `motor-operated-valve` |
| Needle valve, instrument root valve | `needle-valve` |
| Lift / piston check valve | `check-valve-piston` |
| Knife gate valve (slurry, sand) | `knife-gate-valve` |
| PSV, PRV, safety valve | `pressure-safety-valve`. This is an **item**: wire `inlet` from the vessel's `psv` port, and `outlet` to the flare header. |

## Piping specials (go in `inline`)

| P&ID | Component |
|---|---|
| Y-strainer | `y-strainer` |
| Basket / temporary strainer | `basket-strainer` |
| Spectacle blind, spade | `spectacle-blind` |
| Flow sight glass | `sight-glass` |
| Spool piece | `pipe-spool` |
| Concentric / eccentric reducer | `reducer` |

| Flanged joint (flange pair, gasket, studs) | `flanged-joint` (inline) |
| Blind flange, end blind | `blind-flange` |
| Gasket (spiral-wound, RTJ ring, sheet) | `gasket` |
| Stud bolts and nuts for a flange | `stud-bolt-set` |
| Pipe clamp, riser clamp | `pipe-clamp` |
| Pipe support: shoe, guide, anchor, U-bolt, dummy leg, trunnion | `pipe-support` |
| Utility / hose station | `utility-station` |

| Weld-neck flange (RF / FF / RTJ) | `weld-neck-flange` (`facing`) |
| Slip-on flange | `slip-on-flange` |
| Socket-weld flange | `socket-weld-flange` |
| Threaded flange | `threaded-flange` |
| Lap-joint flange and stub end | `lap-joint-flange` |
| Swivel-ring flange | `swivel-ring-flange` |
| Weldolet, sockolet, threadolet, nipolet, elbolet, latrolet | `olet` (`kind`) |
| Socket-weld / threaded fitting (elbow, tee, coupling, half-coupling, union, cap, plug, swage) | `small-bore-fitting` (`kind`) |
| Expansion joint, bellows (single, tied, hinged, gimbal, pressure-balanced) | `expansion-joint` (inline) |
| Flexible hose, armoured hose, rotary / chiksan loop | `flexible-hose` (inline) |
| Monolithic insulating joint, insulating gasket kit | `insulating-joint` (inline) |
| Rupture disc / bursting disc holder | `rupture-disc` (inline) |
| Restriction orifice (single or multi-stage) | `restriction-orifice` (inline) |
| Steam trap | `steam-trap` (inline) |
| Hammer union (Fig 1502) | `hammer-union` (inline) |
| Drain hub, tundish | `drain-hub` |

The router makes elbows and flanges. It does not branch a line: where one line joins another, add a `tee` as an item (see "Branches" in [plant-json.md](plant-json.md)). Add `elbow` as an item only for hand-built piping.

## Instruments

| P&ID bubble | Component |
|---|---|
| PT, PIT | `pressure-transmitter` |
| PDT, FT on an orifice, LT (DP type) | `dp-transmitter` |
| FE/FT orifice | `orifice-flowmeter` (inline) |
| Coriolis meter | `coriolis-flowmeter` (inline) |
| Ultrasonic meter, USM | `ultrasonic-flowmeter` (inline) |
| Magmeter | `magnetic-flowmeter` (inline) |
| LT (radar / GWR) | `guided-wave-radar` |
| LG, magnetic level gauge | `magnetic-level-gauge` |
| TT, TE/TW | `temperature-transmitter` |
| PI, pressure gauge | `pressure-gauge` |
| TI, dial thermometer | `temperature-gauge` |
| FE/FT vortex | `vortex-flowmeter` (inline) |
| LSH / LSL / LSLL (vibrating fork) | `level-switch` |
| PSH / PSL / PSHH / PSLL | `pressure-switch` |
| VE / VT / VXE / VYE / ZE on a motor, pump, compressor or bearing | `vibration-probe`, one per monitored bearing (`pair` for X-Y probes). VI / VA / VSHH and CMS boxes are logic: no extra component |

## Fire, gas & safety

| Item | Component |
|---|---|
| Gas detector (point) | `point-gas-detector` |
| Flame detector | `flame-detector` |
| Open-path gas detector | `open-path-gas-detector` |
| Manual call point, ESD push-button | `manual-call-point` |
| Beacon / sounder | `alarm-beacon` |
| Deluge valve set | `deluge-valve-skid` |
| Fire monitor | `fire-monitor` |
| Hose reel | `hose-reel` |
| Safety shower / eyewash | `safety-shower` |
| Extinguisher (portable on bracket, cabinet, wheeled) | `fire-extinguisher` (`unit`, `agent`) |
| Windsock | `windsock` |
| Heat detector | `heat-detector` |
| Smoke detector | `smoke-detector` |
| Lifebuoy, life ring station | `life-ring` |
| Toxic gas detector (H2S, CO, SO2, NH3, Cl2, O2) | `toxic-gas-detector` (`gas`) |
| Acoustic / ultrasonic gas leak detector | `acoustic-gas-leak-detector` |
| Hydrogen detector (battery room, electrolyser) | `hydrogen-detector` |
| Aspirating smoke detector (VESDA type) | `aspirating-smoke-detector` |
| Beam smoke detector | `beam-smoke-detector` |
| PA / GA loudspeaker, horn | `pa-loudspeaker` |
| Emergency light, escape-route luminaire | `emergency-light` |
| Escape / exit / muster point sign | `escape-sign` |
| Emergency telephone (Ex, hood or booth) | `emergency-telephone` |
| Fire hydrant | `fire-hydrant` |
| Deluge nozzle, sprinkler head, water-mist nozzle | `deluge-nozzle` (`kind`) |
| Breathing apparatus cabinet | `breathing-apparatus-cabinet` |
| First aid station, stretcher | `first-aid-station` |
| Lifejacket box | `lifejacket-box` |
| Fire blanket | `fire-blanket` |

## Structure & access

| Item | Component |
|---|---|
| Deck, module floor, platform level | `deck-module` |
| Pipe rack, pipe way | `pipe-rack` |
| Stair | `stair` |
| Elevated access platform | `access-platform` |
| Jacket, substructure | `jacket` |
| Link bridge | `bridge` |
| Helideck | `helideck` |
| Column, beam, grating, handrail, ladder, cable tray | `steel-column`, `steel-beam`, `grating-panel`, `handrail`, `ladder`, `cable-tray` |
| Seawater / firewater pump caisson, drain caisson | `caisson` |
| Lift-installed equipment module frame | `module-frame` |

## Control room & interiors

| Item | Component |
|---|---|
| CCR / operator console, DCS workstation | `control-console` |
| Video wall, large-screen display | `video-wall` |
| Door (single, double, sliding, blast, roller shutter; A60 / H120) | `door` (`kind`, `fireRating`) |
| Window (fixed or blast-rated) | `window` |
| Room shell for a walk-in interior (control room, LER, office) | `room` |
| DCS / SIS / F&G marshalling or server cabinets | `system-cabinet` |
| Operator chair | `operator-chair` |
| Wall or ceiling screen, HMI panel | `wall-display` |
| CCTV camera (fixed or PTZ) | `cctv-camera` |
| Fire alarm / F&G / ESD mimic panel | `fire-alarm-panel` (`panel`: fire-alarm / esd-mimic) |
| Supervisor desk, meeting table | `desk` |

Screen components take a `screens` prop: an array of `THREE.Texture`. Pass CanvasTextures, video textures or render targets to show live data in the twin.

## Environment

Not on drawings. Use them for scene context in offshore views.

| Item | Component |
|---|---|
| Sea, mean sea level, waves | `ocean` (`waveHeight` = Hs, `wind`, `foam` rings at legs) |
| Sky, sun, night scene, scene lighting | `sky` (`mode`: day / night, `elevation`, `azimuth`) |

In a `plant.json`, prefer `"sea": { "level", "depth", "waves" }` over placing `ocean` as an item.

## Power, buildings, lifting, packages

| Item | Component |
|---|---|
| Transformer | `transformer` |
| Switchgear, MCC | `switchgear` |
| E-house, LER, switchroom module | `e-house` |
| Analyser house | `analyser-shelter` |
| LCS, local control station | `local-control-station` |
| Junction box | `junction-box` |
| Floodlight / lighting mast | `lighting-mast` |
| UPS, battery cabinets | `ups-battery-cabinet` |
| VFD / VSD cabinet | `vfd-cabinet` |
| Neutral earthing resistor (NER) | `neutral-earthing-resistor` |
| Navigation light, fog horn (aids to navigation) | `navigation-aid` |
| Pedestal crane | `pedestal-crane` |
| Monorail, hoist | `monorail-hoist` |
| Davit crane | `davit-crane` |
| Lifeboat, TEMPSC | `lifeboat-davit` |
| Container | `shipping-container` |
| Cargo basket | `cargo-basket` |
| Gas bottle quad | `gas-cylinder-quad` |
| Tote tank | `tote-tank` |
| Chemical injection package | `chemical-injection-skid` |
| Fiscal metering skid | `metering-skid` |
| Prover | `compact-prover` |
| Instrument air package | `instrument-air-package` |
| TEG regeneration package | `teg-regeneration` |
| HPU | `hydraulic-power-unit` |
| Nitrogen generator | `nitrogen-generator` |
| Hydrocyclone package | `hydrocyclone-package` |
| Multimedia / water filter package | `water-filter-package` |
| Hypochlorite generator | `hypochlorite-generator` |
