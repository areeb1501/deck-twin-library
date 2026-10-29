# Research notes

These are the sources the component agents used, and the design decisions each source drove, so later work doesn't have to repeat the research.

**How reliable is it?**
- **Vendor lists:** each component's `vendors` in `_meta*.ts` names only manufacturers whose pages or datasheets were actually seen.
- **Values:** anything not taken from a source is marked `// typical` or `approx` in the code.
- **Missing standards:** licensed standards (ISO 10628, ISA 5.1, IEC 60617, NFPA 170, PIP PIC001) were not available. The P&ID symbols are drawn from established convention, not copied from any legend.

Ask before redoing any of this research: check here first.

## Standards data (`registry/lib/standards`)

| Table | Basis | Spot checks that passed |
|---|---|---|
| Pipe | ASME B36.10M / B36.19M, NPS 1/8–48, 17 schedules | OD increases with NPS. Wall thickness increases with schedule. |
| Flanges | B16.5, Class 150–2500; B16.47 Series A (approx) | OD > bolt circle > raised face > pipe OD at every size and class. |
| Fittings | B16.9 | LR elbow = 1.5 × NPS |
| Valve face-to-face | B16.10, API 609, API 594, ISA 75.08.01 | Class 300 6" gate = 403 mm. Class 150 6" gate = 267 mm. Class 600 4" gate = 432 mm. |
| PSVs | API 526 | J orifice = 3"×4". P = 4"×6". T = 8"×10". |
| Motors | IEC 60072 | Shaft height H equals the frame number. |
| Sections | EN 10365 / 10056 / 10210, AISC W-shapes | Not recorded |
| Access | ISO 14122 | Not recorded |
| Colours | ISO 14726, ISO 3864, RAL. RAL colours are approximate sRGB. | Not recorded |

Flange convention: `thickness` and `hubLength` exclude the raised face for every class.

## Piping and flanges

| Area | Source | What it drove |
|---|---|---|
| Fittings | [Weldbend catalogue](https://www.weldbend.com/catalog.pdf) | B16.9 dimensions and bevels |
| Gaskets | Flexitallic spiral-wound catalogue | Winding OD = RF − ¼"; centring-ring OD = bolt circle − bolt diameter; colour codes |
| Gaskets | TME R-ring sheet | RTJ pitch diameters |
| Y-strainer | [Eaton Model 85](https://store.hipco.com/images/additional/Eaton_Strainer_85_Data.pdf) | Face-to-face, leg length, blow-off size |
| Basket strainer | [Rosedale](https://www.rosedaleproducts.com/documents/2014-pdfs/rosedale-filter-basket-strainer-2014.pdf), [Sure Flow](https://sureflowequipment.com/wp-content/uploads/2017/05/BWEB150-Steel-Fabricated-Basket-Strainer.pdf) | Body 2× line size, davit, three legs |
| Sight glass | [L.J. Star](https://www.ljstar.com/wp-content/uploads/2019/11/flow-indicator-overview.pdf) | Face-to-face and square retainers |
| Pipe supports | PT&P Fig 300/1400, [APP Fig 3100](https://www.appmfg.com/hubfs/APP%20Metallic%20Pipe%20Shoe%20Fig-3100-1.pdf), Øglænd | Shoe heights and lengths, 3 mm guide gap, PTFE pad |
| Insulation jacketing | [Johns Manville guide](https://www.jm.com/content/dam/jm/global/en/industrial-insulation/metal-jacketing/IND_MetalJacketing_Install_Guide.pdf) | Bands at 229 mm |
| Olets | [Weldolet](https://hardhatengineer.com/weldolet-dimension-chart/) and [sockolet](https://hardhatengineer.com/sockolet-and-sockolet-dimensions) tables (MSS SP-97) | Olet dimensions |
| RTJ grooves | [Wermac](https://www.wermac.org/flanges/dimensions_ring-joint-facings_flanges_asme-b16.5.html) | Ring grooves R11–R79 |
| Slip-on flanges | [projectmaterials](https://blog.projectmaterials.com/flanges/slip-on-flange-dimensions-asme-ansi/) | Hub length Y and bore B |
| Socket-weld fittings | [Wermac B16.11](https://wermac.org/fittings/dim_sw_elbows.html) | B16.11 dimensions |
| Other specials | Witzenmann (hoses), Abdex and Kuriyama (Fig 1502 unions), GPT Pikotek (insulating kits), Fike and Continental Disc (rupture discs) | Seen in search results only |

## Valves

| Valve | Sources | What they drove |
|---|---|---|
| PSV | [Emerson Crosby J-Series](https://www.emerson.com/is/content/emerson/en/final-control/pressure-management/documents/data-sheets-j-series-direct-spring-pressure-relief-valves-crosby.pdf) | Closed bonnet with screwed cap, lever, a bonnet vent that must stay open on bellows valves, seal wire |
| Trunnion ball and ESDV | Cameron T30, A-T Controls IOM, Bettis G-series and CBB | Seat and stem sealant fittings, body bleed, jackscrew override |
| Gate and globe | Velan API 600 / API 623 | Flexible wedge, OS&Y |
| MOV | Rotork IQ3 | Electric actuator layout |
| Control valve | Fisher 657/667 | Diaphragm actuator layout |
| Dual-plate check | Crane DuoChek | Not recorded |
| Butterfly | Bray 30/31, Vanessa TOV | Extended neck for insulation |
| Plug | Nordstrom | Adjustable gland, sealant injection |
| Knife gate | DeZURIK KGN, Orbinox | MSS SP-81 lengths |

## Vessels

| Vessel | Sources | What they drove |
|---|---|---|
| Separators | SLB conventional separator sheet, Cimarron design form, Sulzer VersiSwirl, NOV | Inlet devices, weir, mesh pad, vortex breaker |
| Filter-separator | Parker PECO 75HTL | One sump per stage, DP across the tube sheet |
| Cartridge filter | Facet VCS, Parker DV, Ergil | Swing-bolt closure; inlet low, outlet high |
| Tanks | Superior Tank, Angus Fire K20H | Foam chambers, cooling ring |
| Spheres | CB&I Hortonsphere, Fabtank | Not recorded |
| Air receiver | Man Tank 302443 | Not recorded |
| Desander | NOV, Expro, Hunting | Not recorded |
| Bullet tank | DNOW, chemengonline LPG primer | Not recorded |
| Slug catcher | Wikipedia | Finger-type layout |

## Heat transfer and flare

| Equipment | Sources | What they drove |
|---|---|---|
| Air cooler | [Wermac](https://wermac.org/equipment/air-cooled_heatexchanger.html), Chart/Hudson | Fan coverage of at least 40 %, plug versus cover-plate headers |
| Plate exchanger | Alfa Laval GPHE, Schmidt manual, Danfoss | Not recorded |
| Shell-and-tube | TEMA type references | The AES S-cover is larger than the shell |
| Flares | Argo, OGJ, Zeeco, IChemE flare paper | Molecular seal, ignition panel, pilots |
| Fired heater | API 560 PA, red-bag layout guide | Snuffing steam, explosion doors, sootblowers |
| Vent stack | Storagetech / euromekanik end-of-line arresters | Not recorded |
| Electric heater | Chromalox, Exheat | Not recorded |
| Hairpin exchanger | US4570701 | Not recorded |
| PCHE | Heatric, Alfa Laval Hybloc | Not recorded |
| Cooling tower | SPX Marley | Not recorded |

## Rotating equipment

| Equipment | Sources | What they drove |
|---|---|---|
| Pumps | Flowserve VTP, Ruhrpumpen; Pentair Fairbanks Nijhuis fire pumps; Randolph right-angle gear; Framo; ITT Goulds 3600/3910/3700; Aldrich (API 674); Milton Roy Primeroyal (API 675); NETZSCH NEMO; WEG W22; Novenco and Hartzell fans | Not recorded |
| Gas turbine generator | Solar Titan 130 spec sheet | Lube vent separator, enclosure F&G |
| Gas turbine filter house | Siemens SGT-400 manual, Donaldson | 5-stage filter house |
| Centrifugal compressor | Baker Hughes MCL (split up to ~60 bar, barrel above), Elliott, Wermac rundown tank | Not recorded |
| Reciprocating compressor | Spectrum Acoustic and TNO (API 618 orifice plates), Ariel JGK/4 | Not recorded |
| Screw compressor | Howden, Kirloskar | Not recorded |
| Diesel generators | Cat C32 container, Cummins canopies, mtu offshore sets | 20/40 ft containers, sand-trap louvres |

## Wells, drilling and subsea

| Equipment | Sources | What they drove |
|---|---|---|
| Christmas tree | SLB opener devices, Sentry wellhead catalogue | Fusible lock-open on the SSV, test ports, lockdown screws |
| Pig traps | GD Engineering Bandlock, SPX, TD Williamson, enggcyclopedia | Eccentric reducer on launchers, concentric on receivers; balance line |
| Choke | WOM positive choke | Not recorded |
| WHCP | SLB WHCP page | Fusible loop, hi/lo pilots |
| Mud pumps | NOV 14-P-220 / 12-P-160, HMH TPK-1600, Bentec | Not recorded |
| Choke manifold | NOV HP choke and kill | Not recorded |
| Shakers and agitators | Brandt and Derrick | Not recorded |
| Catwalks | NOV, FET, HMH | Not recorded |
| Cementing | SLB CPS-730, US4158510 | Not recorded |
| Coiled tubing | Weatherford CTU | Not recorded |
| Subsea manifold | OneSubsea | Not recorded |
| PLET | Oil States, Turcomp | Not recorded |
| UTA | Viper V-Lock, Prysmian | Not recorded |
| Subsea tree | API 17D | Not recorded |

## Instruments, F&G and safety

| Equipment | Sources | What they drove |
|---|---|---|
| Transmitters and impulse lines | Rosemount 3051S / 305 drawings, Swagelok impulse-line notes | Lines fall 1:10 to the taps in gas service |
| Flow, level and temperature | Daniel 3415, Micro Motion, Magnetrol Atlas, Rosemount 9930 / 644, WIKA, Endress+Hauser, Rosemount 8800 / 2140, Ashcroft | Not recorded |
| Point gas detector | Honeywell Searchpoint Optima manual | IR head mounted horizontally into the junction box, deluge hood, remote gassing |
| Flame detector | Det-Tronics | Aim 10–20° down |
| Open-path detector | Searchline Excel | 2–120 m path |
| Call points and beacons | MEDC, E2S | Not recorded |
| Deluge set | Tyco DV-5 | Full trim list |
| Fire monitor | Elkhart, Akron | Inline oscillator, +80 / −15° travel |
| Hose reel | Angus | Not recorded |
| Safety shower | ANSI Z358.1 | Heights |
| Extinguishers | EN 3 colour zones | Not recorded |
| Windsock | Orga | Not recorded |
| Vibration probes | [Bently Nevada 31000/32000 probe housing](https://www.instrumart.com/products/44323/bently-nevada-31000-32000-proximity-probe-housings) (PPS body, stainless parts, conduit fittings, API 670 external mount; outline is in BN datasheet 141610, not seen); [Wilcoxon 793](https://www.directindustry.com/prod/wilcoxon-sensing-technologies/product-29441-2256042.html) | Top-exit accelerometer with a 2-pin MIL-C-5015 connector on a 1/4-28 stud. Probe and junction-box sizes are typical. |
| Toxic gas | Dräger Polytron, Honeywell Sensepoint XCD | Not recorded |
| Acoustic leak | Incus, FlexSonic | Not recorded |
| Hydrogen | Crowcon Xgard | Not recorded |
| Aspirating smoke | VESDA VLF-500 | Not recorded |
| Beam smoke | Fireray 5000 | Not recorded |
| PA speakers | Industronic | Not recorded |
| Emergency lighting and exit signs | CEAG | Not recorded |
| Telephone hoods | Storacall, GAI-Tronics | Not recorded |
| Hydrants | NAFFCO, Mueller | Not recorded |
| Deluge nozzles | Reliable MV | Not recorded |
| Lifesaving and first aid | Viking, Survitec, SHM, Ocean Safety | BA cabinets, stretchers, lifejacket boxes |

## Structure, lifting, electrical, interiors, packages, onshore

| Area | Sources | What they drove |
|---|---|---|
| Ladders | Delta Plus EN 14122-4 | One flight up to 10 m; flights of 6 m or less above that |
| Helideck | HSE netting note | Net below deck level |
| Grating | Lionweld Kennedy | Pitches of 20, 30 and 34 mm |
| Bridge bearings | Fluorocarbon, mageba | Not recorded |
| Cable tray | Niedax | Not recorded |
| Pipe racks | AISC journal | Bent spacing |
| Deck drains | US4372757 | Seal pots |
| Cranes | API 2C text | D/d ≥ 18, hook latch, anti-two-block, boom stops |
| Crane vendors | PALFINGER, Liebherr | Not recorded |
| Containers and cargo units | HZ Containers, OEG, DNV-ST-E271 | Not recorded |
| Gas quads | Linde, Wilhelmsen | Not recorded |
| Lifeboats | PALFINGER, Viking | Not recorded |
| Transformers | Hitachi Energy level indicators | Accessories |
| E-houses and switchgear | ABB, Siemens eHouse; NXAIR AFLR drawings | 0.8 m aisles |
| Ex equipment | R. STAHL | Not recorded |
| Lighting masts | Abacus base-hinged masts | Lowering mast instead of a ladder |
| Analyser houses | Control Global analyser-house article | Two doors, intake stack, external shutdown |
| UPS, NER and aids to navigation | EnerSys, Vishay, IALA O-139 | Not recorded |
| Control room | Vertiv Knürr, Winsted, Barco UniSee, Planar | Not recorded |
| Racks and raised floors | Rittal VX25, Emerson DeltaV CTO, Tate | Not recorded |
| CCTV | Videotec, Axis, Hernis | Not recorded |
| Doors and windows | MML, Baggerod, Bohamet | Not recorded |
| Packages | LEWA and Pulsafeeder (chemical injection); Emerson Daniel, KROHNE, Caldon (metering); Atlas Copco (instrument air); Croft, Kimray (TEG); Semco (HPU and N2); SLB Vortoil, CECO Peerless (hydrocyclones); Emerson compact prover; Evoqua (filters, hypochlorite) | Not recorded |
| Onshore | Emco Wheaton B0030 loading arm, Hitachi Energy SDF disconnector, Cleaver-Brooks CBEX boiler | Many HV vendor pages returned 403, so those items use typical values |
| Environment | Ported from the Deck Twin app (`src/scene/env/Ocean.tsx`, `Sky.tsx`): six Gerstner (trochoidal) waves tuned for Hs 1.5 m, three.js / drei `Sky` (Preetham model), Lightformer environment maps | Ocean `waveHeight` scales the wave table; sky colours, haze and night rig are the app's tuned values, not measured data |

## P&ID symbols

| Domain | Convention used |
|---|---|
| Process | ISO 10628-2 / PIP PIC001 |
| Instruments | ISA 5.1 |
| Electrical | IEC 60617 |
| Fire & gas | NFPA 170 / ISO 7240-style |
| Structures | Layout-plan convention |

- **Sources consulted:** Wikipedia's P&ID page, internal P&ID-to-component mapping notes, and schematex single-line-diagram shapes. Web search results for symbol tables were mostly low quality.
- **Where conventions vary widely:** coriolis, ultrasonic, vortex and magnetic flow elements, the PCHE, plug valves and F&G letters. Their entries say so.
- **Extended legend (`registry/pid/library.json`):** 293 symbols in 17 categories. Added on 2026-10-29 from a user's drawing: an offset spectacle blind, a vibration element, MooN voting, the CMS box, the encircled ball valve and the axial fan. 162 of them map to 124 components; 50 are not physical (signal lines, bubbles, connectors).
  - **Sources:**
    - [ISO 10628-2:2012 preview](https://cdn.standards.iteh.ai/samples/51841/8eb426031e364fd49f1bd17e19a744dd/ISO-10628-2-2012.pdf): the group list and registration numbers.
    - [EIT "How to read P&IDs"](https://iceweb.eit.edu.au/InstrDesignEng/How%20to%20read%20P&ID.pdf) and [Control Engineering](https://www.controleng.com/how-to-read-pids-3/): ISA bubbles, location bars and the letter table.
    - ISA notes on the [2022](https://www.isa.org/intech-home/2022/june-2022/departments/widely-used-isa-symbols-standard-isa-5-1-updated) and [2024](https://www.isa.org/news-press-releases/2024/october/widely-used-engineering-symbols-and-drawings-stand) revisions of 5.1.
    - The [skillscommons P&ID slides](https://www.skillscommons.org/bitstream/handle/taaccct/17375/PIDs_and_Symbols_Intro_Slides.pdf): line types.
    - The PIP PIC001 catalogue pages (the standard itself is paywalled).
  - **Caveats:**
    - The SIS diamond-in-square is per 5.1-2009. 5.1-2024 was not checked.
    - The FL/FI fail-action bar forms come from a single low-quality source, so prefer the letter forms.
    - The mechanical-link, EM and data-link line glyphs vary by legend.
    - NFPA 170 glyphs were not reproduced, because they could not be verified.
    - The IEC 60617 clause numbers were removed, because they were not verified.
  - **Regenerating:** the generator is in `scripts/pid-legend/`. `gen.cjs` builds from the `*.cjs` category files, and `validate.cjs` checks ids, SVG safety, orphans and component names against the registry.
- **Regenerating symbols for new components:** the generator is in `scripts/pid-gen/`. There is one `p-<category>.ts` file of entries per batch, and `h.ts` holds the SVG drawing helpers. Add the new component's entry to a `p-*.ts` file, then run `npx tsx scripts/pid-gen/gen.mts`. It rewrites `registry/pid/pid.json` and `symbols/`, and checks that every datasheet field maps to a real prop.
