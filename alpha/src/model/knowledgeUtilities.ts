/**
 * Knowledge entries for utility packages, modules, utility pumps, power generation and lifting.
 * Merged into KNOWLEDGE by model/knowledge.ts.
 */
import type { Knowledge, KnowledgeParam } from './knowledgeTypes'

const p = (name: string, ideal: string, unit?: string, note?: string): KnowledgeParam => ({ name, ideal, ...(unit ? { unit } : {}), ...(note ? { note } : {}) })

export const UTILITY_KNOWLEDGE: Knowledge[] = [
  // ───────────────────────────── chemical / utility packages ─────────────────────────────
  {
    id: 'chem-injection',
    title: 'Chemical Injection Package',
    summary:
      'A bunded skid of chemical storage tanks and positive-displacement metering pumps that doses production chemicals (corrosion inhibitor, scale inhibitor, demulsifier, antifoam, biocide) into wells, flowlines and process streams at controlled rates.',
    howItWorks:
      'Each chemical has its own storage tank with level indication, a suction strainer and one or more diaphragm (or plunger) metering pumps. Stroke length and speed set the flow, which is usually trimmed against a calibration pot or a per-point flowmeter. Discharge lines carry a pulsation damper, a relief valve back to the tank and a check valve at the injection quill so process pressure cannot back-flow into the skid. A drip tray or bund collects leaks to the open drain.',
    useCases: [
      'Corrosion inhibitor into flowlines, export oil and gas pipelines (typically 10–50 ppm on liquid)',
      'Scale inhibitor at the wellhead or downhole to stop barium/calcium carbonate and sulphate deposition',
      'Demulsifier upstream of the separators to speed oil/water separation and hit the BS&W spec',
      'Antifoam at the separator inlet when foaming oils cause level instability and carryover',
      'Biocide batch dosing to water systems and pipelines to control SRB and microbiologically induced corrosion',
    ],
    parameters: [
      p('Dose rate accuracy', '± 1–2', '%', 'Of set point, verified against calibration pot'),
      p('Pump discharge pressure', '> process pressure + 10–20', '%', 'Margin over injection-point pressure; relief valve set above maximum'),
      p('Tank level', '30–90', '%', 'Low-level alarm to trigger refill before pumps lose suction'),
      p('Corrosion inhibitor dose', '10–50', 'ppm', 'Typical, set by corrosion monitoring (coupons, ER probes)'),
      p('Scale inhibitor dose', '5–30', 'ppm', 'Typical, on produced water, above minimum inhibitor concentration'),
      p('Pulsation damper precharge', '60–80', '% of discharge pressure', 'Nitrogen precharge, check monthly'),
    ],
    instrumentation: ['Tank level transmitters and sight glasses', 'Calibration pots per pump', 'Discharge pressure gauges', 'Per-point flowmeters (thermal or Coriolis) where fitted', 'Bund leak / high-level switch'],
    issues: [
      'Loss of dose: pump vapour lock, blocked suction strainer or ruptured diaphragm',
      'Under-dosing from worn check valves inside the pump head, leading to under-protected lines',
      'Chemical incompatibility (e.g. corrosion inhibitor with scale inhibitor) causing gunking and plugged quills',
      'Injection quill plugging or erosion at high-velocity points',
      'Overdosing demulsifier or corrosion inhibitor, which can stabilise emulsions and cause foaming or water quality failures',
    ],
    maintenance: [
      'Daily dose-rate check against calibration pot and record in chemical log',
      'Monthly strainer clean and pulsation damper precharge check',
      'Diaphragm and check-valve replacement every 6–12 months (typical) or per vendor hours',
      'Annual relief valve test and injection quill inspection/retrieval',
      'Periodic tank cleaning and chemical compatibility review on any product change',
    ],
    safety: [
      'Hazardous chemicals: review SDS, wear goggles, face shield and chemical gloves when sampling or refilling',
      'Methanol and some inhibitors are flammable: skid is in a hazardous area, Ex-rated motors and grounding during transfer',
      'Discharge lines are at full process pressure: isolate, bleed and confirm zero energy before breaking containment',
      'Bund must be kept clear and drained to prevent spills reaching sea',
    ],
    standards: ['API RP 14C (safety analysis of process systems)', 'API 675 (positive displacement controlled-volume pumps)', 'NORSOK P-002 / P-100', 'ISO 13703 / API RP 14E (piping)', 'OSPAR HOCNF chemical registration (North Sea)'],
  },
  {
    id: 'teg-regen',
    title: 'TEG Regeneration Package',
    summary:
      'Regenerates the rich triethylene glycol leaving the contactor by boiling off absorbed water, returning lean TEG at 99–99.9 wt % so the contactor can keep meeting the gas dew point spec.',
    howItWorks:
      'Rich TEG from the contactor is let down to a flash drum (typically 4–6 barg) where dissolved hydrocarbons flash off to fuel or flare. It then passes through particulate and carbon filters and the lean/rich exchanger before entering the still column on top of the reboiler. The reboiler heats the glycol to about 200–204 °C; water vapour leaves the still column overhead to atmosphere or a vent condenser. Stripping gas injected below the reboiler in a Stahl column pushes lean TEG purity above 99 wt %. Lean glycol overflows to the surge drum, is cooled in the lean/rich exchanger and a glycol cooler, and is pumped back to the contactor top tray.',
    useCases: [
      'Gas dehydration ahead of export pipelines to meet water dew point spec and avoid hydrates and corrosion',
      'Dehydration upstream of gas lift or gas injection compression',
      'Fuel gas conditioning on platforms with gas turbines',
      'Onshore gas plants where dehydration precedes NGL recovery (with enhanced regeneration)',
    ],
    parameters: [
      p('Reboiler temperature', '200–204', '°C', 'Do not exceed ~ 204 °C: TEG thermal degradation accelerates'),
      p('Lean TEG purity', '99.0–99.9', 'wt %', '99.5 %+ needs stripping gas'),
      p('Flash drum pressure', '4–6', 'barg', 'Typical; releases dissolved hydrocarbons'),
      p('Still column overhead temperature', '98–105', '°C', 'High temperature means glycol losses to vent'),
      p('Stripping gas rate', '0.03–0.1', 'Sm³ per litre TEG', 'Typical'),
      p('Lean TEG to contactor', '5–10 above inlet gas', '°C', 'Warmer than gas to prevent hydrocarbon condensation and foaming'),
      p('TEG pH', '7.0–8.5', '', 'Below 6.5 indicates degradation / acid gas pickup'),
      p('Glycol losses', '< 15', 'L/MMscm', 'Typical target; higher means carryover or vent losses'),
    ],
    instrumentation: ['Reboiler TT with high temperature trip', 'Surge drum and flash drum LT', 'Lean TEG FT to contactor', 'Still column overhead TT', 'Fuel gas / fire tube burner management system', 'TEG purity sampling point (lab)'],
    issues: [
      'Glycol degradation (low pH, black colour) from reboiler overheating or oxygen ingress',
      'Foaming in contactor caused by hydrocarbon liquids, solids or corrosion inhibitor in the glycol',
      'Lean TEG purity low from low reboiler temperature, insufficient stripping gas or flooded still column',
      'High glycol losses from still overhead carryover or contactor foaming',
      'Fouling of the lean/rich exchanger and filters by salts, sludge and corrosion products',
      'Fire tube hot spots or burner faults in direct-fired reboilers',
    ],
    maintenance: [
      'Weekly glycol sampling: purity, pH, hydrocarbon content, salts, iron',
      'Change particulate filters on dP (typically every 1–3 months) and carbon filter every 3–6 months',
      'Annual burner management system function test and fire tube inspection',
      'Clean lean/rich exchanger and inspect still column packing at turnaround',
      'Top up glycol and record losses daily',
    ],
    safety: [
      'Hot glycol at ~ 200 °C: burn hazard, personnel protection insulation on hot surfaces',
      'Still column vent may contain BTEX and H₂S: vent to a safe location, monitor exposure',
      'Direct-fired reboiler: flame arrestor and burner management system with flame failure trip',
      'Flash drum gas is flammable: routed to fuel or flare via PCV and PSV',
    ],
    standards: ['API Spec 12GDU (glycol-type gas dehydration units)', 'API RP 14C', 'API 556 (fired heaters)', 'GPSA Engineering Data Book, Section 20', 'NORSOK P-002'],
  },
  {
    id: 'methanol-injection',
    title: 'Methanol Injection Package',
    summary:
      'High-pressure methanol pumps that inject hydrate inhibitor into wells, trees and flowlines, mainly during start-up, shut-in and depressurisation when pipework is cold and full of water-wet gas.',
    howItWorks:
      'Methanol is stored in a nitrogen-blanketed tank and delivered by plunger or diaphragm pumps rated above shut-in wellhead pressure. Individual injection lines with needle valves, flowmeters and check valves feed each christmas tree (downstream of the choke or into the annulus/chemical injection valve) and selected flowlines. Methanol shifts the hydrate equilibrium curve to lower temperatures; the required rate is calculated from water rate and the needed hydrate depression.',
    useCases: [
      'Hydrate inhibition on well start-up when cold flowlines see Joule-Thomson cooling across the choke',
      'Shut-in and restart of gas producers where flowline pressure sits inside the hydrate region',
      'Hydrate plug remediation by injection either side of a suspected plug',
      'Pressure equalisation across closed valves (master, SSV, SCSSV) before opening',
      'Pipeline commissioning and dewatering',
    ],
    parameters: [
      p('Discharge pressure', '> SITHP + margin', 'barg', 'Must exceed shut-in tubing head pressure'),
      p('Injection rate', '0.5–5', 'm³/h total', 'Typical, sized from water rate and hydrate margin'),
      p('Methanol concentration in water phase', '20–40', 'wt %', 'Typical, from hydrate curve (Hammerschmidt / simulation)'),
      p('Hydrate temperature margin', '3–5', '°C', 'Operating temperature above hydrate curve after inhibition'),
      p('Tank blanket pressure', '20–50', 'mbarg', 'Nitrogen, keeps oxygen and moisture out'),
      p('Tank level', '> 30', '%', 'Enough for a full field restart'),
    ],
    instrumentation: ['Per-well flowmeters', 'Discharge pressure transmitters', 'Tank LT with low alarm', 'Needle valves on each injection line', 'Nitrogen blanket regulator'],
    issues: [
      'Insufficient methanol rate during start-up leading to hydrate plugs in chokes or flowlines',
      'Injection line plugging or check valve failure allowing well fluid back into the system',
      'Pump capacity limited when several wells are restarted at once',
      'Methanol in export oil/gas exceeding customer spec and causing downstream refinery issues',
      'Corrosion of carbon steel by oxygenated, wet methanol',
    ],
    maintenance: [
      'Check per-well injection rates before each planned start-up',
      'Monthly pump function test and calibration',
      'Pump packing / plunger seal replacement per vendor hours (typically 4000–8000 h)',
      'Annual relief valve recertification',
      'Verify nitrogen blanket and tank vent flame arrestor quarterly',
    ],
    safety: [
      'Methanol is toxic (skin and ingestion) and highly flammable with an almost invisible flame: use IR flame detection nearby',
      'Very high discharge pressure: pressure-rated hoses and lines, isolate and bleed before work',
      'Wear chemical gloves, goggles and use respiratory protection during transfers',
      'Bonding and grounding during bulk transfer to avoid static ignition',
    ],
    standards: ['API 675 (metering pumps)', 'API 674 (reciprocating pumps)', 'API RP 14C', 'NORSOK P-002', 'ISO 13628-6 (if subsea service)'],
  },
  {
    id: 'wellhead-hpu',
    title: 'Wellhead Hydraulic Control Panel (HPU)',
    summary:
      'The hydraulic power unit and control panel that holds the well surface safety valves (SSV) and downhole safety valves (SCSSV) open and closes them on ESD, fire or loss of pressure.',
    howItWorks:
      'Electric or pneumatic pumps charge accumulators with hydraulic fluid: a low-pressure circuit (typically 345 barg) for the SSV actuators and wing valves and a high-pressure circuit (typically 690 barg) for the SCSSV control lines. Each well has a module with three-way valves that vent its control lines on demand. ESD signals, a fusible loop (pneumatic tubing with fusible plugs running around the wellbay) or low hydraulic pressure dump the supply, closing wing, SSV and then SCSSV in a timed sequence. Valves are fail-safe closed: the spring and well pressure shut them when hydraulics vent.',
    useCases: [
      'Holding open and sequencing closure of surface and subsurface safety valves on every producer and injector',
      'Executing ESD-1 / ESD-2 platform shutdowns and individual well shut-ins',
      'Fire protection of the wellbay via the fusible loop',
      'Supply for hydraulically actuated chokes and wing valves',
    ],
    parameters: [
      p('SSV / wing supply pressure', '345', 'barg', 'Typical (5000 psi); per plant design'),
      p('SCSSV supply pressure', '690', 'barg', 'Typical (10 000 psi); must exceed SITHP + valve opening pressure'),
      p('Accumulator precharge', '~ 50–60', '% of minimum system pressure', 'Nitrogen'),
      p('Wing / SSV closure time', '< 10–30', 's', 'Typical, per safety requirement spec'),
      p('SCSSV closure time', '< 60–120', 's', 'Typical; downhole valve closes after surface valves'),
      p('Hydraulic fluid cleanliness', 'NAS 1638 class 6 or better', '', 'ISO 4406 17/15/12 typical'),
      p('Reservoir level', '50–90', '%', 'Low-level alarm'),
    ],
    instrumentation: ['Supply header PT for LP and HP circuits', 'Per-well control line pressure gauges', 'Reservoir LT and TT', 'Fusible loop pressure switch', 'Pump run/fail status to SIS'],
    issues: [
      'Control line leaks (wellhead penetrator, fittings) causing slow pressure decay and spurious well trips',
      'Contaminated hydraulic fluid causing sticking valves and erratic closures',
      'Accumulator bladder failure or lost precharge reducing stored energy',
      'SCSSV failing its leak-off test after debris or scale on the flapper',
      'Fusible loop damage from mechanical impact causing unplanned shut-ins',
    ],
    maintenance: [
      'Weekly check of system pressures, reservoir level and pump run hours',
      'Six-monthly SCSSV and SSV function and leak tests (or per regulator; often 6–12 months)',
      'Accumulator precharge check every 3–6 months',
      'Hydraulic fluid sampling and filter change on dP or quarterly',
      'Annual fusible loop integrity and timing test',
    ],
    safety: [
      'Stored energy at up to 690 barg: never loosen fittings under pressure, fluid injection injury risk',
      'The panel is a safety-critical element: bypasses only under permit with risk assessment',
      'Closure sequence matters: wing, then SSV, then SCSSV, to avoid closing downhole valve against flow',
      'Keep the fusible loop intact and the manual ESD stations accessible',
    ],
    standards: ['API 6A (wellhead and tree equipment)', 'API 14A / ISO 10432 (SCSSV)', 'API RP 14B (SCSSV systems)', 'API RP 14C', 'ISO 10418', 'NORSOK D-010 (well integrity)'],
  },
  {
    id: 'hypochlorite',
    title: 'Sodium Hypochlorite Generator (Electrochlorination)',
    summary:
      'Generates sodium hypochlorite on site by electrolysing seawater, and doses it into the seawater lift pump suctions to stop marine growth in caissons, pipework and heat exchangers.',
    howItWorks:
      'Filtered seawater flows through electrolyser cells fed with DC current from a transformer-rectifier. Chloride ions are oxidised at the anode to form hypochlorite, while hydrogen is produced at the cathode. The product flows to a degassing tank where hydrogen is diluted with blower air below 25 % LEL and vented to a safe location. The hypochlorite is then dosed continuously into the seawater lift pump suctions, with periodic shock dosing.',
    useCases: [
      'Antifouling of seawater lift caissons, filters and pipework',
      'Protecting seawater coolers and plate exchangers from mussel and barnacle fouling',
      'Firewater ring antifouling (where seawater-filled)',
      'Treatment of injection water ahead of deaeration (with residual removed downstream)',
    ],
    parameters: [
      p('Free chlorine residual at pump suction', '0.5–2', 'ppm', 'Continuous dose; check at the cooler outlet'),
      p('Shock dose', '2–5', 'ppm for 15–30 min', 'Typical daily or weekly'),
      p('Product concentration', '1000–2000', 'ppm', 'Typical as generated'),
      p('Cell current', 'Per design', 'A', 'Rising voltage at constant current indicates scaling'),
      p('Seawater flow through cells', '> minimum', 'm³/h', 'Low flow trips the rectifier (hydrogen accumulation)'),
      p('Hydrogen in degas tank vent', '< 25', '% LEL', 'After air dilution'),
    ],
    instrumentation: ['Cell flow switch / FT', 'Rectifier voltage and current', 'Degas tank LT', 'Dilution blower status', 'Chlorine residual analyser'],
    issues: [
      'Cell scaling with calcium/magnesium deposits increasing voltage and reducing output',
      'Low residual from under-dosing, allowing marine growth and fouled coolers',
      'Over-dosing causing corrosion of copper-nickel and stainless equipment',
      'Hydrogen accumulation if dilution blower fails',
      'Clogged dosing lines and nozzles at the caissons',
    ],
    maintenance: [
      'Daily residual chlorine measurement',
      'Acid cleaning of cells on voltage rise (typically every 1–3 months)',
      'Quarterly dilution blower and flow-switch function test',
      'Annual rectifier inspection and thermographic survey',
      'Electrode replacement typically every 5–7 years',
    ],
    safety: [
      'Hydrogen generation: dilution air, ventilation and interlocks are safety critical',
      'Hypochlorite is corrosive and releases chlorine gas if mixed with acid (including cleaning acid)',
      'High DC current at the cells and rectifier: electrical isolation required',
      'Discharge of residual chlorine is regulated; keep within permit',
    ],
    standards: ['NORSOK M-503 (cathodic protection, for interaction)', 'NORSOK P-002', 'IEC 60079 (hazardous area for hydrogen)', 'NACE SP0176 / ISO 15589', 'Local discharge permits (e.g. OSPAR)'],
  },
  {
    id: 'nitrogen-package',
    title: 'Nitrogen Generation Package (Membrane)',
    summary:
      'Produces nitrogen from compressed air using hollow-fibre membranes, for purging, tank and vessel blanketing and compressor dry gas seal separation gas.',
    howItWorks:
      'Instrument-quality compressed air is filtered, heated slightly and passed through bundles of hollow polymer fibres. Oxygen, water vapour and CO₂ permeate through the fibre walls faster than nitrogen and are vented, leaving a nitrogen-rich stream at the outlet. Purity is controlled by flow and temperature: less flow means higher purity. Product goes to a buffer receiver and distribution header, with an oxygen analyser diverting off-spec gas to vent.',
    useCases: [
      'Purging equipment and pipework of hydrocarbons and oxygen before start-up or maintenance',
      'Blanketing of chemical tanks, cooling medium expansion drum and methanol storage',
      'Separation (barrier) gas for compressor dry gas seals',
      'Flare header purge to prevent air ingress',
      'Leak testing with nitrogen/helium',
    ],
    parameters: [
      p('Nitrogen purity', '95–99', '% N₂', 'Typical; higher purity reduces capacity'),
      p('Oxygen content', '< 1–5', '% O₂', 'Per user requirement; seal gas often < 1 %'),
      p('Feed air pressure', '7–10', 'barg', 'From instrument air system'),
      p('Feed air temperature', '35–50', '°C', 'Heated for membrane efficiency'),
      p('Product dew point', '< −40', '°C', 'Typical'),
      p('Membrane dP', 'Per vendor', 'bar', 'Rise indicates fouling'),
    ],
    instrumentation: ['Oxygen analyser on product', 'Feed and product PT', 'Feed heater TT', 'Product FT', 'Filter PDT'],
    issues: [
      'Purity drop from membrane ageing or high feed temperature',
      'Oil or water carryover from the air system damaging membranes',
      'High demand during purging dragging header pressure down and starving dry gas seals',
      'Analyser drift giving false confidence on purity',
    ],
    maintenance: [
      'Weekly purity and flow check',
      'Coalescing and carbon filter replacement every 6 months or on dP',
      'Oxygen analyser calibration monthly',
      'Membrane module replacement typically every 7–10 years',
    ],
    safety: [
      'Asphyxiation: nitrogen gives no warning, enclosed spaces need gas testing and oxygen monitors',
      'Never use nitrogen as breathing air or connect to breathing air lines',
      'Vent oxygen-enriched permeate to a safe location away from hydrocarbons',
      'Pressure system: PSV on buffer receiver',
    ],
    standards: ['ISO 8573-1 (air quality for feed)', 'ASME VIII (receivers)', 'NORSOK P-002', 'API 692 (dry gas seal systems)', 'EN 1012 / ISO 1217 for compressors'],
  },
  {
    id: 'afff-foam',
    title: 'AFFF Foam Concentrate Skid',
    summary:
      'Stores aqueous film-forming foam concentrate and proportions it into firewater so deluge and monitor systems can lay a vapour-sealing foam blanket over hydrocarbon pool fires.',
    howItWorks:
      'Foam concentrate is held in an atmospheric or bladder tank. When a foam-enhanced deluge or monitor system activates, a proportioner (bladder tank with ratio controller, balanced pressure pump or in-line inductor) meters concentrate into the firewater stream at 1 % or 3 % depending on concentrate type. The foam solution is aspirated at the nozzles; AFFF forms an aqueous film over the fuel surface that suppresses vapour release and cools the fire.',
    useCases: [
      'Helideck firefighting (monitors and pop-up nozzles)',
      'Foam-enhanced deluge over process areas with liquid hydrocarbon inventory (separators, pumps, drains)',
      'Wellbay and drill floor pool fire protection',
      'Diesel and fuel storage tank areas',
    ],
    parameters: [
      p('Proportioning ratio', '1 or 3', '%', 'Per concentrate type; tolerance typically −0 / +30 %'),
      p('Concentrate stock', '≥ design + reserve', 'm³', 'For required discharge duration (helideck typically 5 min, process 15 min)'),
      p('Foam solution application rate', '≥ 4.1', 'L/min/m²', 'Typical minimum for hydrocarbon spills; helideck per CAP 437'),
      p('Concentrate temperature', '2–49', '°C', 'Typical storage range; check product data'),
      p('Expansion ratio', '> 5:1', '', 'Low-expansion foam'),
    ],
    instrumentation: ['Tank LT / sight glass', 'Proportioner inlet and outlet PT', 'Foam valve position switches', 'Concentrate temperature'],
    issues: [
      'Concentrate degradation (sedimentation, viscosity change) from age or temperature',
      'Proportioner out of ratio causing weak or wasteful foam',
      'Bladder rupture in bladder tanks contaminating concentrate with water',
      'Blocked nozzles or strainers from sediment',
      'Regulatory phase-out of fluorinated (PFAS) foam requiring change to fluorine-free foam',
    ],
    maintenance: [
      'Weekly tank level and valve line-up check',
      'Annual concentrate sample to lab for quality testing',
      'Annual proportioning test (ideally with test fluid or flow-meter method to avoid discharge)',
      'Five-yearly bladder inspection',
    ],
    safety: [
      'Foam system is a safety-critical element: impairments need compensating measures',
      'AFFF contains PFAS: contain test discharges and avoid release to sea where possible',
      'Slippery decks after discharge',
      'Wear gloves and eye protection when handling concentrate',
    ],
    standards: ['NFPA 11 (low-, medium-, high-expansion foam)', 'NFPA 16 (foam-water deluge)', 'CAP 437 (helideck standards)', 'ISO 13702 (fire and explosion strategies)', 'NORSOK S-001'],
  },
  {
    id: 'chem-skid',
    title: 'Utility / Chemical Package Skid',
    summary:
      'A self-contained skid that packages tanks, pumps, filters and controls for a utility or chemical service so it can be installed and commissioned as one unit.',
    howItWorks:
      'Package skids are built and tested by a vendor with their own local control panel, instrumentation and interconnecting piping on a structural base with a drip tray or bund. Process tie-ins are made at skid-edge flanges. The package typically runs on its own PLC and reports status, alarms and trips to the platform DCS and SIS.',
    useCases: [
      'Chemical dosing (inhibitors, demulsifier, biocide)',
      'Utility generation (nitrogen, hypochlorite, fresh water)',
      'Hydraulic power for wellheads or valves',
      'Glycol regeneration and other process support units',
    ],
    parameters: [
      p('Discharge pressure', 'Per package datasheet', 'barg'),
      p('Tank level', '30–90', '%', 'Typical normal band'),
      p('Pump vibration', '< 4.5', 'mm/s RMS', 'ISO 10816/20816, for rotating equipment on skid'),
      p('Bund level', 'Empty', '', 'Liquid in the bund indicates a leak'),
    ],
    instrumentation: ['Tank level', 'Pump discharge pressure', 'Flow indication', 'Local control panel with common alarm to DCS'],
    issues: [
      'Pump seal or diaphragm leaks',
      'Blocked strainers and filters',
      'Package PLC faults or communication loss to DCS',
      'Corrosion of skid base and bund under drip trays',
    ],
    maintenance: [
      'Daily operator round: levels, leaks, pressures',
      'Quarterly strainer clean and instrument calibration',
      'Annual relief valve test',
      'Vendor service per package manual',
    ],
    safety: [
      'Check SDS for any chemicals on the skid',
      'Isolate electrical and process energy before work',
      'Keep bunds drained and drip trays clear',
    ],
    standards: ['NORSOK P-002 / P-100', 'API RP 14C', 'IEC 60079 (hazardous area equipment)', 'ASME B31.3'],
  },

  // ───────────────────────────── modules / buildings ─────────────────────────────
  {
    id: 'module-ler',
    title: 'Local Equipment Room / Electrical & Control Building',
    summary:
      'A fire-rated, pressurised room housing the switchgear, motor control centres, variable-speed drives, UPS and control / safety system cabinets that run the process modules around it.',
    howItWorks:
      'The LER is an A60-rated steel module located in a non-hazardous area or made safe by overpressure ventilation. The HVAC system draws air from a safe location, filters and conditions it and keeps the room at a slight positive pressure (around +50 Pa) so flammable gas cannot enter. Gas detectors at the HVAC inlet close the fire dampers and trip non-essential electrics on gas detection. Cables enter via a cable cellar below a raised floor, through certified multi-cable transits that maintain the fire rating.',
    useCases: [
      'Housing 6.6 kV / 690 V / 400 V switchboards and MCCs for process motors',
      'Variable speed drives for large motors such as the export gas compressor',
      'UPS and battery systems for control, safety and emergency lighting',
      'DCS, SIS and F&G marshalling and controller cabinets',
      'Telecoms and network equipment',
    ],
    parameters: [
      p('Room overpressure', '+50', 'Pa', 'Typical minimum relative to outside, alarm on loss'),
      p('Room temperature', '18–25', '°C', 'Typical; electronics derate above ~ 35 °C'),
      p('Relative humidity', '30–60', '%', 'Avoid condensation and static'),
      p('HVAC inlet gas detection', '20 / 60', '% LEL', 'Alarm / executive action (close dampers, trip HVAC)'),
      p('Fire rating', 'A60', '', 'Walls toward hazardous areas; H rating where facing hydrocarbon fire'),
      p('UPS autonomy', '30–60', 'min', 'Typical for safety systems; per design'),
    ],
    instrumentation: ['Differential pressure (room vs outside)', 'Room TT and humidity', 'Smoke detectors (optical) and heat detectors', 'Gas detectors at HVAC inlet', 'Battery room hydrogen detection', 'Fire damper position switches'],
    issues: [
      'Loss of pressurisation from doors left open or damaged seals',
      'HVAC failure causing overheating of VSDs and UPS',
      'Battery degradation reducing UPS autonomy',
      'Dust and humidity causing tracking or partial discharge in switchgear',
      'Multi-cable transit seals broken after cable modifications, compromising fire rating',
    ],
    maintenance: [
      'Monthly HVAC filter check and pressurisation test',
      'Annual thermographic survey of switchgear and MCCs',
      'Quarterly UPS and battery checks, annual discharge test',
      'Annual F&G function test of detectors and damper closure',
      'Periodic switchgear maintenance and protection relay testing (typically 3–5 years)',
    ],
    safety: [
      'Arc flash and shock hazards: only authorised persons, correct PPE and switching permits',
      'Keep doors closed to maintain overpressure and fire integrity',
      'Inert gas or water mist suppression may be fitted: follow lock-out before entering if released',
      'Hydrogen from vented lead-acid batteries: ventilation must run',
    ],
    standards: ['IEC 61892 (mobile and fixed offshore units, electrical)', 'IEC 60079-13 (pressurised rooms)', 'IEC 62271 / IEC 61439 (switchgear and assemblies)', 'NORSOK E-001 / H-001 (HVAC)', 'SOLAS / IMO FTP code (A60)'],
  },
  {
    id: 'module-ccr',
    title: 'Central Control Room (CCR)',
    summary:
      'The pressurised, fire-protected room from which operators monitor and control the whole platform through the DCS, safety instrumented system and fire and gas system.',
    howItWorks:
      'Operator consoles show process graphics, alarms and trends from the distributed control system (DCS), with separate dedicated screens or hardwired panels for the safety instrumented system (SIS/ESD) and fire and gas (F&G) system. A CCTV wall, PA/GA, radio and telecoms complete the room. The CCR is located in or next to the living quarters behind a firewall, with an HVAC overpressure system and gas detection on the air intakes so it remains habitable during an incident.',
    useCases: [
      'Day-to-day process control, start-up and shutdown',
      'Alarm response and emergency coordination (ESD, blowdown, general alarm)',
      'Permit to work coordination and isolation status overview',
      'Communication with helicopters, vessels and onshore support',
    ],
    parameters: [
      p('Alarm rate per operator', '< 1 (acceptable) / ~ 6 (manageable)', 'alarms per 10 min', 'Steady state, EEMUA 191 / ISA 18.2 targets'),
      p('Standing alarms', '< 10', '', 'Typical target'),
      p('Room overpressure', '+50', 'Pa', 'Typical'),
      p('Room temperature', '20–24', '°C'),
      p('Lighting at console', '300–500', 'lux', 'Dimmable, glare-free'),
      p('Noise level', '< 45–55', 'dB(A)', 'Typical ergonomic target'),
    ],
    instrumentation: ['Operator workstations (DCS/SIS/F&G)', 'Hardwired ESD and GA push-buttons', 'Smoke detection and room gas detection at HVAC inlet', 'CCTV', 'PA/GA and radio consoles'],
    issues: [
      'Alarm floods during upsets overwhelming operators',
      'Nuisance and stale alarms reducing response to real ones',
      'Bypassed or inhibited safety functions not tracked',
      'HVAC or UPS failure making the room uninhabitable or blind',
      'Display or network faults causing loss of view',
    ],
    maintenance: [
      'Monthly alarm KPI review and bad actor rationalisation',
      'Periodic proof testing of hardwired ESD push-buttons (per SIL verification, typically annually)',
      'Annual HVAC and damper F&G function test',
      'UPS checks and system backups per maintenance plan',
    ],
    safety: [
      'Maintain an override/inhibit register for all bypassed safety functions',
      'Keep the room pressurised and doors closed',
      'Escape routes to the temporary refuge kept clear',
      'Controlled access to engineering stations (cyber security)',
    ],
    standards: ['EEMUA 191 (alarm systems)', 'ISA 18.2 / IEC 62682 (alarm management)', 'IEC 61511 (SIS)', 'ISO 11064 (control centre ergonomics)', 'IEC 62443 (industrial cyber security)', 'NORSOK I-002 / S-001'],
  },
  {
    id: 'module-emergency-generator',
    title: 'Emergency Generator Module',
    summary:
      'A diesel engine generator in its own fire-rated module that starts automatically on loss of main power and feeds the emergency switchboard: emergency lighting, F&G, UPS chargers, telecoms, firewater support, HVAC to the temporary refuge.',
    howItWorks:
      'A diesel engine with its own battery (and often hydraulic or air) starting system drives an alternator connected to the emergency switchboard. On undervoltage at the emergency board, the engine cranks, reaches speed and closes onto the dead bus automatically. It runs from a dedicated day tank sized for many hours of operation, has its own radiator cooling and is independent of platform utilities. The module is located away from the main generators and hazardous areas to survive the incidents that might take them out.',
    useCases: [
      'Power for safety systems and temporary refuge after loss of main power',
      'Black start of the main gas turbines',
      'Supply during maintenance or when main generators are shut down',
      'Backup for drilling and accommodation essential loads',
    ],
    parameters: [
      p('Start to load time', '≤ 45', 's', 'Typical requirement (SOLAS allows 45 s)'),
      p('Day tank endurance', '18', 'h', 'Per plant design; typically 18–24 h at full load'),
      p('Starting attempts', '≥ 6', 'consecutive', 'Typical from batteries or air'),
      p('Load', '30–80', '% of rating', 'Avoid long low-load running (wet stacking)'),
      p('Jacket water temperature', '75–90', '°C', 'Keep-warm heater when on standby'),
      p('Lube oil pressure', '3–5', 'bar', 'Typical at rated speed; low-pressure trip'),
    ],
    instrumentation: ['Engine speed, oil pressure and coolant temperature', 'Day tank LT', 'Battery charger and voltage', 'Generator voltage, frequency, kW', 'Heat and smoke detectors in module', 'Fuel shut-off valve status'],
    issues: [
      'Failure to start from flat batteries or faulty starter',
      'Wet stacking and carbon build-up from prolonged light-load running',
      'Diesel contamination (water, microbial growth) blocking filters',
      'Overheating from blocked radiator or failed louvres',
      'Auto-transfer logic faults preventing breaker closing',
    ],
    maintenance: [
      'Weekly no-load start and run test',
      'Monthly on-load test (typically ≥ 30 min, ideally > 50 % load)',
      'Annual black-out test of automatic start and load acceptance',
      'Fuel and lube oil sampling quarterly; filter changes per engine hours',
      'Battery capacity test annually',
    ],
    safety: [
      'Hot surfaces and exhaust: insulation and spark arrestor',
      'Fire detection with automatic fuel shut-off and suppression in module',
      'Air intake and exhaust located away from potential gas release',
      'Combustion air must not be closed by the F&G system while the engine is required',
    ],
    standards: ['IEC 61892 (offshore electrical installations)', 'SOLAS Chapter II-1 Reg. 43/44', 'ISO 8528 (reciprocating engine generating sets)', 'NORSOK E-001', 'NFPA 110 (onshore reference)'],
  },
  {
    id: 'module-firewater-pump-house',
    title: 'Firewater Pump House',
    summary:
      'A fire-rated enclosure housing the diesel driver, gearbox, controller and day tank for a firewater pump, so the pump can run independently of platform power during a fire.',
    howItWorks:
      'The diesel engine drives the caisson firewater pump through a right-angle gearbox. A dedicated controller starts the engine automatically on low firewater ring pressure, F&G confirmed fire, or manual command from the CCR or locally. Two independent battery banks provide redundant starting. The day tank sits inside the house with enough fuel for the required run time; the engine has its own cooling (heat exchanger fed from pump discharge or radiator). Pump houses are separated so one fire cannot take out both pumps.',
    useCases: [
      'Housing firewater pump drivers in an A60 enclosure separate from the process area',
      'Providing an independent, self-contained firewater supply for deluge, sprinklers, hydrants and monitors',
      'Redundant firewater capacity (typically 2 × 100 % or 4 × 50 %)',
    ],
    parameters: [
      p('Auto start on ring pressure', 'Typically 1–2 bar below jockey pressure', 'barg', 'Staggered start set points per pump'),
      p('Time to full flow', '< 30', 's', 'Typical requirement from start signal'),
      p('Day tank endurance', '≥ 18', 'h', 'Typical design; check site requirement'),
      p('Battery banks', '2 × independent', '', 'Each able to give 6 cranking cycles (NFPA 20)'),
      p('Engine coolant temperature', '75–90', '°C'),
      p('Room temperature', '> 5', '°C', 'Heaters keep engine ready to start'),
    ],
    instrumentation: ['Engine controller (speed, oil pressure, temperature, run hours)', 'Day tank LT', 'Pump discharge PT', 'Heat / flame detection in the house', 'Battery voltage'],
    issues: [
      'Failure to start from weak batteries or fuel supply problems',
      'Engine overheating if cooling water supply is blocked',
      'Controller left in manual/off after testing',
      'Diesel contamination or day tank low after testing',
      'Gearbox oil degradation or leaks',
    ],
    maintenance: [
      'Weekly automatic start and run test (typically 30 min)',
      'Annual full-flow pump performance test',
      'Day tank refill after each test; quarterly fuel sampling',
      'Battery and charger checks weekly, replacement every 3–5 years typical',
      'Engine and gearbox service per running hours',
    ],
    safety: [
      'Firewater pumps are safety-critical: report any impairment immediately and apply compensating measures',
      'Engine may start automatically at any time: guards in place, keep clear of rotating shafts',
      'Hot exhaust and diesel fuel in an enclosed space',
      'Noise: hearing protection mandatory when running',
    ],
    standards: ['NFPA 20 (stationary fire pumps)', 'NFPA 25 (inspection and testing of water-based fire systems)', 'NORSOK S-001', 'ISO 13702', 'SOLAS / FSS Code'],
  },
  {
    id: 'module-generic',
    title: 'Enclosed Module',
    summary:
      'A prefabricated steel room on the deck that protects equipment or people from weather, noise, hazardous atmosphere or fire.',
    howItWorks:
      'Modules are built onshore, outfitted and lifted onto the deck as a unit. Walls and roofs are fire-rated where they face hazardous areas, with HVAC providing cooling, ventilation and (where needed) overpressure to keep gas out. Cables and pipes enter through certified penetrations that preserve fire and gas-tight integrity.',
    useCases: [
      'Electrical and control equipment rooms',
      'Generator and pump houses',
      'Workshops, stores and laboratories',
      'Control rooms and offices',
    ],
    parameters: [
      p('Overpressure (if pressurised)', '+50', 'Pa', 'Typical'),
      p('Indoor temperature', '18–30', '°C', 'Typical, depends on contents'),
      p('Fire rating toward hazards', 'A60 / H60', '', 'Per fire and explosion analysis'),
      p('Air changes', '6–12', 'per hour', 'Typical ventilation rate'),
    ],
    instrumentation: ['Smoke and heat detectors', 'HVAC inlet gas detectors', 'Room temperature', 'Door position switches'],
    issues: [
      'HVAC failure causing overheating',
      'Doors left open breaking overpressure and fire integrity',
      'Corrosion around penetrations and roof',
      'Damaged multi-cable transits after modifications',
    ],
    maintenance: [
      'Monthly HVAC checks',
      'Annual F&G and damper function tests',
      'Annual inspection of fire doors, seals and penetrations',
    ],
    safety: [
      'Keep fire doors closed',
      'Know the escape routes and muster point',
      'Gas test before entry if the module is unventilated',
    ],
    standards: ['SOLAS / IMO FTP Code', 'NORSOK C-002 / H-001', 'IEC 60079-13', 'ISO 13702'],
  },

  // ───────────────────────────── utility pumps ─────────────────────────────
  {
    id: 'caisson-seawater-lift',
    title: 'Seawater Lift Pump (Caisson)',
    summary:
      'A vertical, electric-driven multistage pump hung inside a caisson that lifts seawater from below the sea surface up to the deck for cooling, firewater make-up and utility services.',
    howItWorks:
      'The pump bowl assembly sits near the bottom of the caisson, well below lowest astronomical tide and wave troughs, so it always has submergence. A long column pipe with line-shaft or a submersible motor carries water up to the discharge head on the deck, where a vertical motor sits on top. Hypochlorite is dosed at the pump suction to prevent marine growth. Discharge passes through coarse filters (typically 2 × 100 %) before going to the seawater/cooling medium coolers and other users.',
    useCases: [
      'Cooling water for the cooling medium / seawater exchangers',
      'Supply to electrochlorination and freshwater makers',
      'Firewater ring jockey/make-up (on some installations)',
      'Water injection feed (larger installations)',
    ],
    parameters: [
      p('Submergence above bowl', '> required', 'm', 'Per vendor; protects against vortexing at lowest sea level'),
      p('Operating point', '80–110', '% of BEP flow', 'Run near best efficiency point'),
      p('Vibration (motor)', '< 4.5', 'mm/s RMS', 'ISO 10816/20816 typical alarm level'),
      p('Motor bearing temperature', '< 80–90', '°C', 'Typical alarm'),
      p('Discharge pressure', '4–10', 'barg', 'Typical'),
      p('Free chlorine residual', '0.5–2', 'ppm', 'At pump suction / cooler outlet'),
    ],
    instrumentation: ['Discharge PT', 'Discharge FT', 'Motor vibration and bearing TT', 'Motor current', 'Filter PDT downstream'],
    issues: [
      'Marine growth blocking suction strainer or caisson if hypochlorite dosing fails',
      'Line shaft bearing wear and vibration',
      'Corrosion and erosion of bowls and impellers (seawater, sand)',
      'Caisson damage or fatigue from wave loading',
      'Low flow / pump cycling when coolers bypass',
    ],
    maintenance: [
      'Daily check of pressure, flow, current and vibration',
      'Monthly changeover between duty and standby',
      'Annual vibration analysis and motor insulation test',
      'Pull and overhaul pump typically every 3–5 years (major lift operation)',
      'Periodic ROV or diver inspection of caisson',
    ],
    safety: [
      'Pulling the pump is a heavy lift: lifting plan and certified rigging',
      'Isolate motor electrically and the discharge before work',
      'Hypochlorite dosing lines: chemical hazard',
      'Caisson openings are a fall and dropped-object hazard',
    ],
    standards: ['API 610 VS-type pumps (or ISO 13709)', 'ISO 10816 / 20816 (vibration)', 'NORSOK P-002', 'API RP 2A (caisson structural)'],
  },
  {
    id: 'caisson-firewater',
    title: 'Firewater Pump (Diesel, Caisson)',
    summary:
      'A diesel-driven vertical caisson pump that supplies seawater to the firewater ring main for deluge, sprinklers, hydrants and monitors. It starts automatically on low ring pressure or confirmed fire.',
    howItWorks:
      'The pump bowls hang in a caisson below sea level. A diesel engine in a protected pump house drives the line shaft through a right-angle gearbox, so the pump is independent of platform electrical power. A jockey pump keeps the ring pressurised; when deluge opens and ring pressure falls, or F&G confirms fire, the controller starts the duty pump, then the standby pump on staggered set points. Discharge is through a check valve into the ring main, with a test return line and pressure relief.',
    useCases: [
      'Feeding deluge systems over process modules and wellbay',
      'Hydrants, hose reels and monitors',
      'Foam systems via the AFFF proportioners',
      'Water curtains for escape routes and temporary refuge protection',
    ],
    parameters: [
      p('Rated capacity', 'Largest fire area demand + hose allowance', 'm³/h', 'Typically 2 × 100 % or 4 × 50 %'),
      p('Shut-off head', '≤ 140', '% of rated head', 'NFPA 20 curve requirement'),
      p('Overload capacity', '150 % flow at ≥ 65 % rated head', '', 'NFPA 20 performance test'),
      p('Time to rated flow', '< 30', 's', 'Typical requirement from start signal'),
      p('Ring main pressure (standby)', '8–12', 'barg', 'Typical, held by jockey pump'),
      p('Vibration', '< 4.5', 'mm/s RMS', 'ISO 10816/20816'),
      p('Gearbox oil temperature', '< 90', '°C', 'Typical alarm'),
    ],
    instrumentation: ['Ring main PT (start signals)', 'Discharge PT and FT (test line)', 'Engine controller signals to CCR', 'Gearbox oil TT', 'Heat detectors in pump house'],
    issues: [
      'Failure to start (battery, fuel, controller in wrong mode)',
      'Marine growth blocking the suction or strainers',
      'Reduced performance from impeller wear or bowl corrosion',
      'Line shaft and gearbox vibration',
      'Ring main leaks causing frequent jockey pump cycling and nuisance starts',
    ],
    maintenance: [
      'Weekly automatic start and run test',
      'Annual flow test across the performance curve (churn, 100 %, 150 %)',
      'Gearbox oil sampling quarterly',
      'Pump pull and overhaul typically every 5 years',
      'Strainer inspection after testing and during marine growth season',
    ],
    safety: [
      'Safety-critical: impairment requires compensating measures and notification',
      'Automatic start: keep clear of rotating shafts and couplings',
      'High pressure water: do not open test lines without control',
      'Noise and exhaust fumes in the pump house',
    ],
    standards: ['NFPA 20 (fire pumps)', 'NFPA 25 (inspection and testing)', 'ISO 13702', 'NORSOK S-001', 'API 610 VS1 (mechanical reference)'],
  },
  {
    id: 'pump-cooling-medium',
    title: 'Cooling Medium Circulation Pump',
    summary:
      'A centrifugal pump that circulates the closed-loop cooling medium (TEG/water) from the expansion drum through the seawater cooler to the process coolers and back.',
    howItWorks:
      'The pump takes suction from the expansion drum, which provides static head and absorbs thermal expansion. It pushes cooling medium through the cooling medium / seawater cooler and out to process users such as the crude cooler and gas aftercoolers, where temperature control valves set the flow. Using a closed fresh-water loop keeps seawater (corrosive and fouling) away from most process exchangers. Pumps are usually 2 × 100 % with auto-changeover on low discharge pressure.',
    useCases: [
      'Cooling crude oil before storage or export',
      'Compressor gas aftercoolers and interstage coolers',
      'Lube oil and seal oil coolers',
      'HVAC chillers and generator coolers',
    ],
    parameters: [
      p('NPSHa margin', '≥ 1 m or NPSHa/NPSHr ≥ 1.3', '', 'Typical design margin'),
      p('Operating point', '80–110', '% of BEP flow', ''),
      p('Vibration', '< 4.5', 'mm/s RMS', 'ISO 10816/20816'),
      p('Bearing temperature', '< 80–85', '°C', 'Typical alarm level'),
      p('Supply temperature', '25–40', '°C', 'Typical cooling medium supply'),
      p('Return temperature', '45–70', '°C', 'Typical'),
      p('Discharge pressure', '5–10', 'barg', 'Typical'),
    ],
    instrumentation: ['Discharge PT (auto-start of standby)', 'Header FT', 'Supply and return TT', 'Bearing TT / vibration', 'Motor current'],
    issues: [
      'Mechanical seal leaks (glycol loss, drum level dropping)',
      'Cavitation from low expansion drum level or blocked suction strainer',
      'Bearing failure from lubrication problems or misalignment',
      'Loss of cooling to process users if both pumps trip',
      'Glycol degradation or corrosion inhibitor depletion causing internal corrosion',
    ],
    maintenance: [
      'Monthly duty/standby changeover',
      'Monthly vibration monitoring',
      'Clean suction strainers on dP or during changeover',
      'Lube oil change typically every 4000–8000 h',
      'Annual alignment check and cooling medium sample (glycol %, inhibitor, pH)',
    ],
    safety: [
      'Rotating equipment: guards in place, isolate motor before work',
      'Hot cooling medium on return side: burn hazard',
      'Glycol is harmful if swallowed: contain spills',
    ],
    standards: ['API 610 / ISO 13709 (centrifugal pumps)', 'API 682 (mechanical seals)', 'ISO 10816 / 20816 (vibration)', 'NORSOK P-002'],
  },
  {
    id: 'pump-potable-water',
    title: 'Potable Water Pump',
    summary:
      'A small centrifugal pump that distributes drinking water from the potable water tank to the accommodation, galley, safety showers and eyewash stations.',
    howItWorks:
      'The pump draws from the potable water tank and maintains pressure in the distribution ring, usually via a hydrophore (pressure tank) so the pump starts and stops on pressure switches. Water may pass through UV sterilisation and a final filter before distribution. Safety showers and eyewash stations on the process deck are often tempered and supplied from this system.',
    useCases: [
      'Accommodation drinking, washing and galley water',
      'Safety showers and eyewash stations',
      'Utility stations for washdown (on some platforms)',
    ],
    parameters: [
      p('Distribution pressure', '3–6', 'barg', 'Typical'),
      p('Operating point', '80–110', '% of BEP flow'),
      p('Vibration', '< 4.5', 'mm/s RMS', 'ISO 10816/20816'),
      p('Bearing temperature', '< 80', '°C'),
      p('NPSHa margin', '≥ 1', 'm', 'Above NPSHr'),
      p('Free chlorine residual', '0.2–0.5', 'ppm', 'Typical at outlets'),
    ],
    instrumentation: ['Discharge pressure switches / PT', 'Hydrophore level and pressure', 'Chlorine residual sampling', 'UV unit alarm'],
    issues: [
      'Frequent start/stop from waterlogged hydrophore (lost air cushion)',
      'Mechanical seal leaks',
      'Bacterial contamination (Legionella in dead legs, warm water)',
      'Low pressure at remote outlets from blocked filters',
    ],
    maintenance: [
      'Weekly water quality sample (chlorine, pH)',
      'Monthly bacteriological sampling (typical)',
      'Quarterly flushing of dead legs and safety showers',
      'Annual pump and hydrophore inspection',
    ],
    safety: [
      'Water quality is a health-critical system: maintain chlorination and sampling records',
      'Isolate pump electrically before work',
      'Safety showers must always be available near chemical areas',
    ],
    standards: ['WHO Guidelines for drinking-water quality', 'ILO Maritime Labour Convention (MLC 2006)', 'ISO 9906 (pump acceptance tests)', 'Oil & Gas UK / local health guidance on offshore water'],
  },
  {
    id: 'compressor-instrument-air',
    title: 'Instrument Air Compressor Package',
    summary:
      'Oil-free screw compressors with filters and desiccant dryers that produce clean, dry compressed air for valve actuators, instruments, purging and the nitrogen generator.',
    howItWorks:
      'Air is drawn from a safe weather-deck location through an intake filter and compressed in oil-free rotary screw stages with intercooling and aftercooling. Condensate is separated and drained. A twin-tower desiccant dryer adsorbs moisture to give a pressure dew point around −40 °C, switching towers on a timed or dew-point controlled cycle with purge air regeneration. Particulate filters follow, and the air goes to the receiver and distribution header. Usually 2 × 100 % compressors with lead/lag control on header pressure.',
    useCases: [
      'Supply to pneumatic control valve and ESD valve actuators',
      'Instrument purge and pressurised enclosures (Ex p)',
      'Feed to membrane nitrogen generator',
      'Plant air for tools (via a separate, lower priority header)',
    ],
    parameters: [
      p('Header pressure', '7–10', 'barg', 'Typical; low-pressure alarm and standby start'),
      p('Pressure dew point', '≤ −40', '°C', 'ISO 8573-1 class 2 for moisture'),
      p('Particle / oil class', 'ISO 8573-1 class 1.2.1 to 2.2.2', '', 'Typical instrument air spec'),
      p('Discharge temperature (after aftercooler)', '< 40–45', '°C'),
      p('Vibration', '< 4.5', 'mm/s RMS', 'ISO 10816/20816'),
      p('Dryer tower switching', '4–10', 'min cycle', 'Typical heatless dryer'),
    ],
    instrumentation: ['Header PT (load/unload and standby start)', 'Dew point analyser after dryer', 'Discharge TT per stage', 'Filter PDT', 'Vibration and motor current'],
    issues: [
      'High dew point from saturated desiccant or failed tower switching valves, leading to wet air and frozen or sticking actuators',
      'Compressor overheating from fouled coolers',
      'Air leaks across the platform raising demand and causing low header pressure',
      'Condensate drain traps stuck closed or open',
      'Intake drawing in gas or exhaust if location compromised',
    ],
    maintenance: [
      'Daily check of dew point, pressures and drains',
      'Quarterly filter element replacement or on dP',
      'Desiccant replacement typically every 3–5 years',
      'Compressor element overhaul per running hours (vendor schedule)',
      'Annual leak survey of the air distribution system',
    ],
    safety: [
      'Instrument air loss fails valves to their safe position: plant will trip',
      'Stored pressure energy in receivers and lines',
      'Intake gas detection may trip the compressor; never relocate intake hoses into hazardous areas',
      'Noise: hearing protection near running compressors',
    ],
    standards: ['ISO 8573-1 (compressed air purity classes)', 'API 619 (rotary-type positive displacement compressors)', 'ISA 7.0.01 (instrument air quality)', 'ASME VIII (receivers, dryers)', 'NORSOK P-002'],
  },
  {
    id: 'ia-receiver',
    title: 'Instrument Air Receiver',
    summary:
      'A pressure vessel that stores dry instrument air to smooth demand peaks and to keep valves and instruments working for a period after the compressors stop.',
    howItWorks:
      'Dry air from the compressors and dryers fills the receiver, which acts as a buffer between supply and the distribution header. If the compressors trip, the stored volume between normal pressure and the minimum actuator supply pressure gives a hold-up time so the plant can be shut down in a controlled way and ESD valves can still stroke. A PSV protects the vessel and a drain removes any condensate.',
    useCases: [
      'Buffering instrument air demand peaks (valve strokes, purges)',
      'Hold-up air supply after loss of compressors',
      'Dedicated air storage for ESD valve actuators (separate receivers in some designs)',
    ],
    parameters: [
      p('Operating pressure', '7–9', 'barg', 'Typical'),
      p('PSV set pressure', '10', 'barg', 'Per plant design'),
      p('Hold-up time', '10–15', 'min', 'Typical from normal to minimum pressure with no compressor'),
      p('Minimum supply pressure', '4–5', 'barg', 'Typical lower limit for actuators'),
      p('Dew point', '≤ −40', '°C', 'Water in the drain means dryer problems'),
    ],
    instrumentation: ['PT with low-pressure alarm', 'Pressure gauge', 'Automatic or manual drain', 'PSV'],
    issues: [
      'Water collecting in the bottom from dryer failure',
      'Internal corrosion if wet air has been present',
      'PSV leaking or passing',
      'Insufficient hold-up after system extensions increase demand',
    ],
    maintenance: [
      'Daily drain check',
      'PSV recertification typically every 2–3 years (per inspection plan)',
      'Statutory pressure vessel inspection (external annual, internal per RBI, typically 4–6 years)',
      'Hold-up time test after modifications',
    ],
    safety: [
      'Stored energy: depressurise before opening any fittings',
      'Do not exceed PSV set pressure; never isolate the PSV',
      'Pressure vessel registration and inspection is a legal requirement in most jurisdictions',
    ],
    standards: ['ASME VIII Div 1 / PED (EN 13445)', 'API 520 / 521 (relief)', 'ISO 8573-1', 'NORSOK P-002'],
  },
  {
    id: 'cm-expansion-drum',
    title: 'Cooling Medium Expansion Drum',
    summary:
      'A small nitrogen-blanketed vessel at the high point of the closed cooling medium loop that absorbs thermal expansion, provides pump suction head and lets entrained gas escape.',
    howItWorks:
      'The drum is connected to the pump suction. As the cooling medium (typically 30 % TEG in fresh water) heats up and expands, the level rises; as it cools, the level falls. A nitrogen blanket keeps oxygen out and gives a slight positive pressure. Air or gas in the loop separates in the drum and vents. A level rise can indicate process gas or liquid leaking into the loop through a tube leak in a process cooler, so drum level and gas detection on the vent are important leak indicators.',
    useCases: [
      'Thermal expansion volume for the closed cooling loop',
      'Pump suction head and NPSH for cooling medium pumps',
      'Make-up and chemical addition point for the loop',
      'Early detection of process cooler tube leaks',
    ],
    parameters: [
      p('Glycol concentration', '30', 'wt % TEG', 'Per plant; freeze and corrosion protection'),
      p('Blanket pressure', '0.5–2', 'barg', 'Typical, nitrogen'),
      p('PSV set pressure', '6', 'barg', 'Per plant design'),
      p('Normal level', '40–60', '%', 'Varies with loop temperature'),
      p('pH of medium', '8–10', '', 'Typical with corrosion inhibitor'),
    ],
    instrumentation: ['LT with high/low alarms', 'PT', 'Nitrogen regulator', 'Vent gas detector (some designs)', 'Sample point'],
    issues: [
      'Rising level or pressure from a process exchanger tube leak (hydrocarbon ingress)',
      'Falling level from pump seal leaks or loop leaks',
      'Oxygen ingress if blanket fails, causing corrosion',
      'Glycol degradation or inhibitor depletion',
    ],
    maintenance: [
      'Daily level and pressure check',
      'Monthly cooling medium sample (glycol %, pH, inhibitor, hydrocarbons)',
      'PSV recertification per inspection plan',
      'Statutory vessel inspection per RBI',
    ],
    safety: [
      'Unexpected level rise: suspect hydrocarbon ingress and treat the loop as potentially gassy',
      'Nitrogen blanket: asphyxiation risk if venting in enclosed areas',
      'Glycol is harmful if ingested',
    ],
    standards: ['ASME VIII / PED', 'API 520 / 521', 'NORSOK P-002', 'ISO 13703'],
  },
  {
    id: 'diesel-day-tank',
    title: 'Diesel Day Tank',
    summary:
      'A local diesel storage tank that holds the immediate fuel supply for an emergency generator, firewater pump engine or crane, sized for many hours of independent running.',
    howItWorks:
      'Diesel is transferred from the main bulk storage, usually through a centrifuge or filter coalescer that removes water and dirt (fuel polishing). The day tank feeds the engine by gravity or a supply pump, with the engine return line back to the tank. A low-point drain removes settled water, and a remotely operated quick-closing valve on the outlet lets the CCR cut fuel in a fire. A vent with flame screen goes to a safe location; overfill goes back to storage or a bund.',
    useCases: [
      'Emergency generator fuel supply',
      'Firewater pump diesel engines',
      'Crane engines and lifeboat/rescue boat refuelling (via separate systems)',
      'Dual-fuel gas turbine back-up fuel (larger tanks)',
    ],
    parameters: [
      p('Endurance', '18–24', 'h', 'Typical at full load of the consumer'),
      p('Normal level', '> 80', '%', 'Keep topped up after tests'),
      p('Water content', '< 200', 'mg/kg', 'Typical fuel spec; drain water daily'),
      p('Diesel flash point', '> 60', '°C', 'Marine gas oil requirement'),
      p('Fuel cleanliness', 'ISO 4406 18/16/13', '', 'Typical for modern engines'),
    ],
    instrumentation: ['LT with low/high alarms', 'Local sight glass', 'Quick-closing valve status', 'Vent flame screen'],
    issues: [
      'Water accumulation and microbial growth (diesel bug) blocking filters',
      'Tank not refilled after testing',
      'Leaking quick-closing valve or failing remote operation',
      'Overfilling during transfer',
    ],
    maintenance: [
      'Daily water drain check',
      'Quarterly fuel sample (water, microbial, particles)',
      'Annual test of the quick-closing valve from the CCR',
      'Periodic tank cleaning (typically 5 years)',
    ],
    safety: [
      'Flammable liquid: no hot work nearby without permit',
      'Bund and drip tray to contain spills',
      'Remote fuel cut-off must be functional for fire fighting',
    ],
    standards: ['SOLAS Chapter II-2 (fuel oil arrangements)', 'NFPA 30 / NFPA 37', 'ISO 8217 (marine fuels)', 'NORSOK P-002'],
  },
  {
    id: 'potable-water-tank',
    title: 'Potable Water Tank',
    summary:
      'Storage for drinking water made by the watermaker or delivered by supply boat, kept chlorinated and protected against contamination for the accommodation and safety showers.',
    howItWorks:
      'Water from reverse-osmosis watermakers or bunkered from supply boats is remineralised and chlorinated, then stored in coated or stainless tanks. Vents are screened, overflows trapped and the tank is reserved for potable water only. The potable water pumps and hydrophore distribute it. Residual chlorine is monitored and topped up to stop bacterial growth.',
    useCases: [
      'Drinking, cooking and washing water for the living quarters',
      'Safety showers and eyewash stations',
      'Reserve water for several days of POB if watermakers fail',
    ],
    parameters: [
      p('Free chlorine residual', '0.2–0.5', 'ppm', 'Typical in tank'),
      p('pH', '6.5–8.5', '', 'WHO guideline range'),
      p('Storage endurance', '3–7', 'days of POB', 'Typical'),
      p('Temperature', '< 25', '°C', 'Warmer water promotes Legionella growth'),
      p('Coliforms / E. coli', '0', 'per 100 mL', 'WHO'),
    ],
    instrumentation: ['LT', 'Chlorine residual analyser or manual sampling', 'Temperature'],
    issues: [
      'Bacterial contamination from poor chlorination or contaminated bunkering hoses',
      'Coating breakdown and corrosion inside the tank',
      'Sediment build-up',
      'Cross-contamination from non-potable connections',
    ],
    maintenance: [
      'Daily chlorine and pH test',
      'Monthly bacteriological sample (typical)',
      'Annual tank inspection, cleaning and disinfection (typical 1–2 years)',
      'Dedicated, clean bunkering hoses, flushed before use',
    ],
    safety: [
      'Confined space entry for tank cleaning: permit, gas test, standby person',
      'Chlorination chemicals are corrosive: PPE when dosing',
      'Never cross-connect potable with any process or utility system',
    ],
    standards: ['WHO Guidelines for drinking-water quality', 'ILO Maritime Labour Convention 2006', 'ISO 15748 (ships and marine technology, potable water)', 'Oil & Gas UK guidance on offshore water quality'],
  },

  // ───────────────────────────── power ─────────────────────────────
  {
    id: 'gtg',
    title: 'Gas Turbine Generator',
    summary:
      'The platform main power plant: an aero-derivative or industrial gas turbine burning fuel gas (or diesel) and driving an 11 kV generator through a gearbox, supplying all process and utility electrical loads.',
    howItWorks:
      'Air is drawn through a filter house, compressed in an axial compressor and burned with fuel gas in a dry low emission (DLE) or diffusion combustor. Hot gas expands through the gas generator turbine and a power turbine that drives the generator via a reduction gearbox. Exhaust leaves through a stack (sometimes through a waste heat recovery unit). A control system manages speed and load sharing; on gas loss the unit can switch to diesel. The enclosure has its own ventilation, gas and fire detection and fire suppression.',
    useCases: [
      'Main power generation for offshore platforms and FPSOs',
      'Power for large compressor and pump motors via the switchboard',
      'Waste heat recovery for process heating (with WHRU)',
      'Island power for remote onshore facilities',
    ],
    parameters: [
      p('Load', '50–90', '% of rated', 'DLE emissions guaranteed above ~ 50 % load; N+1 configuration typical'),
      p('Exhaust gas temperature', '450–550', '°C', 'Typical; spread between thermocouples is a combustor health indicator'),
      p('Fuel gas supply pressure', '18', 'barg', 'Per plant design; superheated ≥ 25 K above dew point'),
      p('Vibration (casing)', '< 12–25', 'mm/s', 'Typical alarm for aero-derivatives per vendor'),
      p('Inlet filter dP', '< 10', 'mbar', 'Typical; change elements on high dP'),
      p('Heat rate', '9,500–11,500', 'kJ/kWh', 'Typical simple cycle at base load'),
      p('Generator output', '11 kV, 50 Hz', '', 'Per plant'),
      p('Lube oil supply temperature', '40–55', '°C', 'Typical'),
    ],
    instrumentation: ['Exhaust thermocouples (multiple)', 'Speed probes', 'Vibration probes (proximity and casing)', 'Fuel gas PT and TT', 'Inlet filter PDT', 'Generator winding and bearing RTDs', 'Enclosure gas and flame detectors'],
    issues: [
      'Compressor fouling (salt, hydrocarbons) reducing output and raising heat rate',
      'Liquid carryover in fuel gas causing combustion damage or flame-out',
      'High exhaust temperature spread from combustor or fuel nozzle problems',
      'Inlet filter blockage in salt-laden or misty conditions',
      'Trips on vibration, overspeed or load rejection during electrical faults',
      'DLE combustion instability (rumble) at low load',
    ],
    maintenance: [
      'Online water wash daily or weekly; offline crank wash every 1–3 months (typical)',
      'Borescope inspection typically every 4000–8000 h',
      'Gas generator change-out or hot section overhaul at ~ 25,000–50,000 h',
      'Monthly lube oil sampling',
      'Inlet filter element replacement on dP',
      'Annual protection and fire system function tests',
    ],
    safety: [
      'Enclosure has automatic fire suppression (water mist or CO₂): never enter without locking it out',
      'Hot surfaces and exhaust above 500 °C',
      'Fuel gas leak risk: enclosure gas detection trips the unit and closes fuel ESD valve',
      'High voltage generator terminals and arc flash hazard',
      'Noise above 85 dB(A) near the enclosure',
    ],
    standards: ['API 616 (gas turbines for petroleum service)', 'ISO 3977 (gas turbines procurement)', 'ISO 21789 (gas turbine safety)', 'API 613 / API 677 (gears)', 'IEC 60034 (rotating electrical machines)', 'NFPA 37'],
  },
  {
    id: 'transformer',
    title: 'Oil-Immersed Power Transformer',
    summary:
      'Steps generator or grid voltage between voltage levels (for example 11 kV to 6.6 kV) to feed switchboards that supply process motors and distribution transformers.',
    howItWorks:
      'Primary and secondary windings on a laminated steel core are immersed in insulating mineral oil (or ester fluid) in a sealed or conservator tank. The oil insulates and carries heat to radiators: ONAN means natural oil and air circulation; ONAF adds fans for higher rating. A Buchholz relay detects gas generated by internal faults, while winding and oil temperature indicators drive fans, alarms and trips. Protection relays (differential, overcurrent, restricted earth fault) trip the breakers on faults.',
    useCases: [
      'Stepping 11 kV generator voltage to 6.6 kV for large motor switchboards',
      'Distribution transformers 6.6 kV to 690 V / 400 V',
      'Power-from-shore and export cable interfaces',
      'Supply to VSDs (multi-winding phase-shifting transformers)',
    ],
    parameters: [
      p('Top oil temperature', '< 85–95', '°C', 'Typical alarm / trip ~ 95 / 105 °C'),
      p('Winding hot-spot temperature', '< 98', '°C', 'Normal ageing reference (IEC 60076-7); alarm ~ 110–120 °C'),
      p('Load', '< 80–100', '% of ONAF rating', 'Typical, with redundancy for N-1'),
      p('Oil moisture', '< 20', 'ppm', 'Typical for 11 kV class'),
      p('Oil breakdown voltage', '> 50', 'kV', 'Typical acceptance (IEC 60422)'),
      p('Dissolved gas (acetylene)', '< 1–2', 'ppm', 'Any rise indicates arcing'),
    ],
    instrumentation: ['Oil and winding temperature indicators', 'Buchholz relay (conservator type)', 'Pressure relief device', 'Oil level indicator', 'Online DGA monitor (larger units)'],
    issues: [
      'Overheating from overload, fan failure or blocked radiators',
      'Insulation ageing accelerated by moisture and heat',
      'Internal partial discharge or arcing detected by DGA',
      'Oil leaks from gaskets and radiators',
      'Bushing failures and tap changer wear',
    ],
    maintenance: [
      'Monthly visual inspection: oil level, leaks, silica gel breather',
      'Annual oil sample for DGA, moisture and breakdown voltage',
      'Annual thermographic survey of terminations',
      'Protection relay testing typically every 3–5 years',
      'Electrical tests (insulation resistance, tan delta) at major outages',
    ],
    safety: [
      'High voltage: switching only by authorised persons, earth before work',
      'Oil fire risk: bund to contain oil, fire detection and possibly deluge',
      'Do not approach a transformer that has tripped on Buchholz until investigated',
      'Arc flash risk at terminations',
    ],
    standards: ['IEC 60076 (power transformers)', 'IEC 60076-7 (loading guide)', 'IEC 60599 (DGA interpretation)', 'IEC 60422 (oil maintenance)', 'IEC 61892', 'NORSOK E-001'],
  },

  // ───────────────────────────── lifting ─────────────────────────────
  {
    id: 'crane',
    title: 'Offshore Pedestal Crane',
    summary:
      'The platform pedestal crane that lifts containers, equipment and supplies between supply vessels and the decks, and handles materials around the installation.',
    howItWorks:
      'A slewing crane house sits on a pedestal welded to the deck structure, with a lattice or box boom luffed by wire rope or hydraulic cylinders. The main and auxiliary (whip) hoists are driven by diesel-hydraulic or electric winches. A load moment indicator measures hook load and boom angle and limits the crane to its rated chart; offboard lifts use dynamic factors that depend on sea state. Gross overload protection lets the boom shed load before structural failure. Personnel lifting requires additional brakes and a certified mode.',
    useCases: [
      'Supply vessel offloading and backloading',
      'Lifting equipment for maintenance (pump pulls, valve change-outs)',
      'Drilling tubulars and consumables handling',
      'Personnel transfer by basket (where permitted)',
    ],
    parameters: [
      p('Safe working load (SWL)', 'Per load chart', 't', 'Reduced with radius and for offboard lifts in waves'),
      p('Wind speed limit', '< 20', 'm/s', 'Typical for lifting operations; lower for personnel lifts'),
      p('Significant wave height (offboard)', 'Per load chart', 'm', 'Defines dynamic factor and allowable SWL'),
      p('Load moment indicator', '< 100', '% of rated moment', 'Cut-out at 100 %, warning at ~ 90 %'),
      p('Hydraulic oil temperature', '30–60', '°C', 'Typical'),
      p('Wire rope condition', 'Within discard criteria', '', 'ISO 4309'),
    ],
    instrumentation: ['Load moment indicator / safe load indicator', 'Anemometer at boom tip or crane house', 'Boom angle sensor', 'Hoist limit switches', 'Camera at hook (some cranes)'],
    issues: [
      'Wire rope wear, broken wires or kinks',
      'Slew bearing wear and bolt fatigue',
      'Hydraulic leaks and overheating',
      'Load moment indicator faults or incorrect configuration',
      'Dropped objects from poor rigging or failed slings',
    ],
    maintenance: [
      'Pre-use checks every shift (limits, brakes, LMI)',
      'Thorough examination every 6 months for personnel lifting / 12 months otherwise (LOLER)',
      'Wire rope inspection per ISO 4309 and replacement on discard criteria',
      'Slew bearing bolt tension checks and wear measurement annually',
      'Load test at installation and after major repair',
    ],
    safety: [
      'Only certified crane operators, banksmen and riggers; clear communications',
      'Never walk under a suspended load; exclusion zones on the laydown area',
      'Stop lifting outside wind, sea-state or visibility limits',
      'Dropped object prevention: certified rigging and tag lines',
      'Lifts over live process equipment need a specific lift plan',
    ],
    standards: ['API Spec 2C (offshore pedestal-mounted cranes)', 'EN 13852-1 (offshore cranes)', 'API RP 2D (operation and maintenance)', 'LOLER 1998 (UK)', 'ISO 4309 (wire ropes)', 'NORSOK R-002'],
  },
]
