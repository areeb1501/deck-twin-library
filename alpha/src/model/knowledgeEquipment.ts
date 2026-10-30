/**
 * Knowledge base — process equipment (separation, gas handling, heat exchange, pumping, wells and
 * drilling). Utility / safety / electrical packages are in knowledgeUtilities.ts.
 */
import type { Knowledge, KnowledgeParam } from './knowledgeTypes'

const p = (name: string, ideal: string, unit?: string, note?: string): KnowledgeParam => ({ name, ideal, ...(unit ? { unit } : {}), ...(note ? { note } : {}) })

export const EQUIPMENT_KNOWLEDGE: Knowledge[] = [
  // ───────────────────────────── separation ─────────────────────────────
  {
    id: 'sep-3phase',
    title: 'Three-Phase Production Separator',
    summary:
      'The first and largest pressure vessel the well fluids reach: a horizontal gravity separator that splits the multiphase stream into gas, oil and produced water at high pressure. Its stability sets the stability of the whole process.',
    howItWorks:
      'Well fluid enters through an inlet diverter (half-pipe or vane-type inlet device) that knocks out the bulk liquid and kills momentum. In the liquid section, residence time lets water droplets settle out of the oil and oil droplets rise out of the water; a weir or bucket-and-weir separates the oil chamber from the water section. Gas flows across the top, where small droplets settle out by gravity before a vane pack or mesh pad demister removes the rest. Three control loops hold it steady: pressure control on the gas outlet, oil level control on the oil outlet (LV) and oil/water interface control on the water outlet. Sand that settles in the bottom is removed by sand jetting.',
    useCases: [
      'First-stage (HP) separation on offshore production platforms and FPSOs',
      'Splitting gas to compression, oil to the LP stage and export, and water to produced water treatment',
      'Absorbing slugs from flowlines and risers through the liquid surge volume',
      'Setting the export oil vapour pressure together with the downstream LP stage',
      'Removing free water before oil heating or electrostatic treatment',
    ],
    parameters: [
      p('Operating pressure', '25–45 (typical HP stage)', 'barg', 'Held by PCV on the gas outlet; PSV set at design pressure (42 barg here)'),
      p('Oil retention time', '3–5', 'min', 'Longer (5–10 min) for heavy or foaming crudes; V-1100 is designed for 3 min'),
      p('Water retention time', '5–10', 'min', 'Sized for oil-in-water at the water outlet below ~ 1000–2000 ppm'),
      p('Normal liquid level (NLL)', '50–60', '% of ID', 'LAHH typically 75–80 %, LALL 15–20 %'),
      p('Oil/water interface level', '20–35', '% of ID', 'Kept well below the weir crest'),
      p('Gas outlet liquid carryover', '< 0.1', 'gal/MMscf', 'Demister design target; higher means flooded demister or high level'),
      p('Oil outlet BS&W', '< 5–10 (typical first stage)', '%', 'Final export spec < 0.5 % is reached downstream'),
      p('Water outlet oil-in-water', '< 1000', 'mg/l', 'Feed quality for the hydrocyclones'),
    ],
    instrumentation: [
      'PT / PIC on the vapour space with high-high pressure trip (PAHH) to the SIS',
      'Oil level LT (guided-wave radar or DP) plus independent LAHH / LALL switches',
      'Interface LT (displacer, GWR or nucleonic profiler) controlling the water outlet LV',
      'Magnetic level gauges (LG) for local verification of oil and interface levels',
      'TT on the inlet and liquid section; PDT across the demister on some designs',
      'Inlet ESDV and PSV(s) relieving to the HP flare',
    ],
    issues: [
      'Emulsion build-up at the interface (tight emulsion, solids, low temperature), causing poor water quality and erratic interface control',
      'Foaming crude carrying liquid into the gas outlet and the compressor scrubber',
      'Slugging from flowlines or risers causing level swings, high-level trips and flare events',
      'Sand accumulation reducing liquid volume and eroding level bridles and valves',
      'Level instrument drift or fouled displacers giving false level, leading to gas blow-by to the LP separator',
      'Wax or asphaltene deposition on internals at low temperatures',
    ],
    maintenance: [
      'Compare level transmitters against the level gauge every shift; calibrate LTs annually',
      'Proof-test LAHH, LALL and PAHH trips at the SIL-verified interval (typically 12–24 months)',
      'Run sand jetting on a schedule set by sand production (weekly to monthly)',
      'Internal inspection at turnaround (typically every 4–6 years per RBI) for corrosion, erosion and damaged internals',
      'Bench test or recertify the PSV every 2–3 years',
    ],
    safety: [
      'Gas blow-by through the oil outlet on low level can overpressure the LP separator; LALL closes the oil outlet',
      'High level carries liquid into the gas system and can wreck the compressor; LAHH trips the inlet',
      'Vessel entry requires gas-freeing, positive isolation (spades), gas testing and an H₂S check, plus a confined-space permit',
      'NORM scale and pyrophoric iron sulphide can be present inside; keep it wet and monitor during opening',
      'Fire case: deluge plus depressurisation through the BDV to the flare',
    ],
    standards: [
      'API Spec 12J (oil and gas separators)',
      'ASME BPVC Section VIII Div. 1 (pressure vessel design)',
      'API RP 14C / ISO 10418 (process safety analysis)',
      'API Std 521 / ISO 23251 (pressure relief and depressuring)',
      'NORSOK P-002 (process system design)',
      'IEC 61511 (safety instrumented systems)',
    ],
  },
  {
    id: 'sep-test',
    title: 'Test Separator',
    summary:
      'A smaller separator that takes one well at a time from the test header so its oil, gas and water rates can be measured. Well-test data drives reservoir management and production allocation.',
    howItWorks:
      'At the manifold, the operator diverts a single well from the production header to the test header. The test separator splits the stream (two-phase gas/liquid, or three-phase) and each outlet goes through a meter: an orifice or ultrasonic meter on the gas, and a coriolis meter on the liquid that also gives water cut from density. A pressure controller holds the separator near production header pressure so the well flows as it normally does. After a stabilisation period, the test runs for typically 6–24 hours and the measured rates are logged against the well. The outlets then recombine into the production system.',
    useCases: [
      'Periodic well testing for production allocation (monthly per well, typical)',
      'Monitoring water cut and GOR trends to spot water or gas breakthrough',
      'Testing wells after workovers, stimulation or new completions',
      'Clean-up flow of new wells, isolating debris from the main train',
      'Backup capacity when the production separator is limited',
    ],
    parameters: [
      p('Operating pressure', 'Close to production header pressure', 'barg', 'So the well flows as it does in production'),
      p('Stabilisation time before test', '2–4 (typical)', 'h', 'After switching the well to the test header'),
      p('Test duration', '6–24', 'h', 'Longer for slugging or low-rate wells'),
      p('Liquid retention time', '2–4', 'min', 'Two-phase test vessels'),
      p('Gas measurement uncertainty', '± 2–5', '%', 'Allocation-grade, not fiscal'),
      p('Liquid (coriolis) uncertainty', '± 0.5–1 (mass)', '%', 'Water cut uncertainty grows with gas entrainment'),
    ],
    instrumentation: [
      'Gas flow meter (orifice FT or ultrasonic) with PT/TT compensation',
      'Coriolis meter on the liquid outlet for mass, density and water cut',
      'PT / PCV on the gas outlet; LT / LV on the liquid outlet',
      'Sampling points for BS&W and gas composition',
      'PSV to flare and an inlet isolation valve at the manifold',
    ],
    issues: [
      'Gas entrainment in the liquid meter (low level, foaming) corrupting coriolis readings',
      'Slugging wells give unrepresentative rates over short tests',
      'Leaking manifold diverter valves let other wells into the test, giving falsely high rates',
      'Emulsion makes water cut measurement unreliable',
      'Meter calibration drift goes unnoticed without reconciliation against export volumes',
    ],
    maintenance: [
      'Reconcile the sum of well tests against fiscal export monthly (allocation factor near 1.0)',
      'Verify coriolis zero and calibration annually; inspect the orifice plate every 6–12 months',
      'Leak-test manifold test diverter valves at least annually',
      'Proof-test level and pressure trips per the SIL schedule',
      'PSV recertification every 2–3 years',
    ],
    safety: [
      'Switching wells at the manifold changes the overpressure scenario; follow the line-up procedure and check open/closed status',
      'Clean-up flows can carry sand, acid or completion brine; check compatibility and erosion limits',
      'H₂S may be present in individual wells; sample with gas detection and BA where required',
      'High-level and high-pressure trips protect downstream recombination points',
    ],
    standards: ['API Spec 12J', 'ASME BPVC Section VIII Div. 1', 'API MPMS Chapter 20 (allocation measurement)', 'ISO 5167 (orifice metering)', 'API RP 14C / ISO 10418'],
  },
  {
    id: 'sep-lp',
    title: 'LP (Second-Stage) Separator',
    summary:
      'The second separation stage. It flashes HP separator oil down to low pressure so dissolved gas comes out before the oil is cooled and exported. Its pressure largely sets export crude vapour pressure.',
    howItWorks:
      'Oil from the HP separator drops in pressure across the HP oil level control valve and enters the LP separator. Light components flash off as gas. That gas goes to the flare (as here, under back-pressure control) or to a recompressor, while the stabilised oil leaves on level control to the crude cooler and export pumps. Low pressure and residence time let gas bubbles disengage and give a stable oil true vapour pressure (TVP) or Reid vapour pressure (RVP). Some LP separators are three-phase and also remove water that came out in the flash.',
    useCases: [
      'Stabilising crude to meet export vapour pressure (RVP / TVP) specification',
      'Maximising liquid recovery through staged flashing',
      'Providing net positive suction head and surge volume for the export pumps',
      'Receiving reject oil from hydrocyclones and recovered oil from drains',
    ],
    parameters: [
      p('Operating pressure', '2–10 (typical)', 'barg', 'PSV set 8 barg on V-1300; held by PCV-1301 back-pressure'),
      p('Oil retention time', '3–5', 'min', 'Longer if foaming'),
      p('Normal liquid level', '50', '% of ID', 'Drives export flow via LV-1301'),
      p('Export crude TVP', '< 0.8–0.9 (typical)', 'bara', 'Or RVP ≤ 10–12 psia depending on export route'),
      p('Oil temperature', '50–80', '°C', 'Upstream of the crude cooler'),
      p('Oil BS&W at outlet', '< 0.5–1', '%', 'Export spec typically ≤ 0.5 %'),
    ],
    instrumentation: ['PT / PCV on the gas outlet', 'Oil LT with LAHH / LALL trips', 'Interface LT if three-phase', 'Level gauges for local check', 'TT on the oil outlet', 'PSV to LP flare'],
    issues: [
      'Gas blow-by from the HP separator on HP low level overpressures the vessel; the PSV is sized for it',
      'Foaming from rapid flashing carries oil into the flare (flare smoking, liquid at the tip)',
      'Low level cavitates export pumps, causing a trip',
      'High export RVP / TVP when separator pressure or temperature is wrong',
      'Wax deposition in cold weather or with high pour-point crude',
    ],
    maintenance: [
      'Calibrate level instruments annually; cross-check against gauges every shift',
      'Proof-test trips per SIL schedule',
      'Internal inspection per RBI (typically 4–6 years)',
      'PSV recertification every 2–3 years',
    ],
    safety: [
      'Gas blow-by case governs PSV sizing; never bypass LALL on the upstream separator',
      'Liquid carryover to the flare can produce burning rain; the flare KO drum is the last barrier',
      'Low-pressure vessels can be damaged by vacuum when steamed or cooled while isolated',
      'Standard vessel-entry precautions: isolation, gas freeing, H₂S and NORM checks',
    ],
    standards: ['API Spec 12J', 'ASME BPVC Section VIII Div. 1', 'API Std 521 / ISO 23251', 'API RP 14C / ISO 10418', 'NORSOK P-002'],
  },
  {
    id: 'sep-inlet',
    title: 'Inlet Separator / Slug Catcher',
    summary:
      'The first vessel at a gas facility or compressor station. It removes liquids (condensate, water, glycol, pigging slugs) from the incoming gas before scrubbing and compression.',
    howItWorks:
      'Incoming gas and any carried-over liquid pass through an inlet device. The liquid drops into a large hold-up volume sized to absorb slugs from the pipeline or pigging operations. Gas leaves through a mist eliminator to the compressor suction scrubbers, while liquid is level-controlled to condensate handling. On large pipelines this duty is split between a finger-type or vessel slug catcher and a smaller inlet separator.',
    useCases: [
      'Front end of gas compressor and processing stations',
      'Receiving liquid slugs from pipeline pigging',
      'Protecting compressors from liquid',
      'Recovering condensate for stabilisation or export',
    ],
    parameters: [
      p('Operating pressure', 'Pipeline arrival pressure (typical 40–90)', 'barg'),
      p('Slug volume capacity', 'Largest predicted pigging slug + margin', 'm³', 'From transient flow simulation'),
      p('Normal liquid level', '20–40', '% of ID', 'Kept low to leave slug volume'),
      p('Gas outlet liquid carryover', '< 0.1', 'gal/MMscf'),
      p('Gas velocity at demister', '≤ design K-factor (≈ 0.1 m/s mesh pad)', 'K, m/s'),
    ],
    instrumentation: ['PT and gas flow FT', 'Liquid LT with LAHH trip', 'Level gauge', 'TT on inlet', 'PSV and inlet ESDV'],
    issues: [
      'Undersized slug volume leads to high-level trips during pigging',
      'Hydrates at the inlet when gas cools by Joule-Thomson expansion',
      'Black powder or scale carried in from the pipeline',
      'Demister damage or flooding giving liquid carryover to compressors',
    ],
    maintenance: ['Calibrate level instruments annually', 'Proof-test LAHH / PAHH trips per SIL schedule', 'Internal inspection per RBI', 'PSV recertification every 2–3 years'],
    safety: ['High level is a compressor-protection trip, never inhibit during pigging', 'Pigging operations need coordinated procedures with the pipeline operator', 'Pyrophoric deposits when opened'],
    standards: ['API Spec 12J', 'ASME BPVC Section VIII Div. 1', 'API Std 521 / ISO 23251', 'API RP 14C / ISO 10418'],
  },
  {
    id: 'flare-ko-drum',
    title: 'Flare Knock-Out Drum',
    summary:
      'A large horizontal drum at the low point of the flare header that removes liquid droplets from relief and blowdown gas before it reaches the flare tip. Liquid at the tip causes burning rain.',
    howItWorks:
      'All PSV outlets, blowdown valves and pressure-control flaring go into the flare header, which slopes continuously (1:200 typical) down to the KO drum. Inside, the gas velocity drops enough for liquid droplets larger than the design size (300–600 µm, 600 µm here) to fall out. Gas leaves to the flare boom. Liquid collects in the drum, which is sized to hold the liquid from the worst relief case (typically 20–30 minutes of liquid inflow), and is pumped back to the process or drains. A purge or sweep gas keeps air out of the header continuously.',
    useCases: [
      'Last line of liquid removal before the HP and LP flare tips',
      'Collecting liquid from PSV and blowdown events',
      'Collecting condensed liquid from the flare header',
      'Providing liquid hold-up during emergency depressurisation',
    ],
    parameters: [
      p('Operating pressure', '0.1–1 (typical, near atmospheric)', 'barg', 'Back-pressure on PSVs must stay within limits'),
      p('Design droplet removal', '300–600', 'µm', 'API 521 sizing; V-2400 removes 600 µm'),
      p('Normal liquid level', '< 20', '% of ID', 'Kept low; pumped out on high level'),
      p('Liquid hold-up capacity', '20–30', 'min', 'Of the largest liquid relief case'),
      p('Header slope', '1:200 (minimum)', '', 'Free-draining to the drum, no pockets'),
      p('Header purge gas', 'Continuous, sized for O₂ < 6 % at the tip', '', 'Nitrogen or fuel gas'),
    ],
    instrumentation: ['Level transmitter with LAH (start pump) and LAHH alarm', 'Level gauge', 'Header PT and flare flow meter (ultrasonic)', 'TT for cold-temperature and heat tracing checks', 'Purge gas flow indicator'],
    issues: [
      'Liquid carryover to the flare from a high drum level or massive liquid relief, causing burning rain',
      'Freezing / auto-refrigeration in the header and drum during depressurisation (low-temperature embrittlement)',
      'Air ingress from loss of purge creating an explosive mixture in the header',
      'Pockets in the header filling with liquid, causing slug hammer during relief',
      'Drum pump failure leaving the drum without liquid capacity',
    ],
    maintenance: [
      'Test the level alarm and pump start monthly; keep drum level low',
      'Check purge gas flow daily',
      'Inspect the header supports and slope after modifications',
      'Internal inspection per RBI (corrosion under deposits, wet H₂S)',
    ],
    safety: [
      'The flare system must always be available; isolation needs locked-open valves and management of change',
      'Do not let the drum run full; burning liquid from the flare is a major hazard',
      'Minimum design metal temperature must cover cold blowdown cases',
      'H₂S and pyrophoric scale when opened',
    ],
    standards: ['API Std 521 / ISO 23251 (pressure-relieving and depressuring systems)', 'API Std 537 (flare details)', 'ASME BPVC Section VIII Div. 1', 'NORSOK P-002'],
  },
  {
    id: 'closed-drain-drum',
    title: 'Closed Drain Drum',
    summary:
      'A low-pressure drum that collects hydrocarbon liquids drained from pressurised process equipment through hard-piped connections, so they never reach the open drains or the sea.',
    howItWorks:
      'Vessel, pump and instrument drains are piped through a closed drain header that slopes to the drum. Liquid collects at near-atmospheric pressure; flashed gas vents to the LP flare. A level controller starts the closed drain pump, which returns oil to the LP separator or the process. Some designs have a boot or weir to separate water.',
    useCases: [
      'Draining vessels and pumps before maintenance',
      'Collecting level bridle and instrument drains',
      'Receiving liquid from scrubbers and filters',
      'Recovering hydrocarbons back into the process',
    ],
    parameters: [
      p('Operating pressure', '0.1–0.5 (typical)', 'barg', 'PSV set 3.5 barg on V-4400'),
      p('Normal liquid level', '20–40', '%', 'Pump starts on high level, stops on low level'),
      p('Return pump operation', 'Intermittent', '', 'Level-controlled'),
      p('Operating temperature', 'Ambient to 60', '°C'),
    ],
    instrumentation: ['Level transmitter with pump start / stop and LAHH', 'Level gauge', 'Pressure gauge', 'PSV to flare'],
    issues: [
      'Gas blow-through when a drain valve on a pressurised vessel is left open, overpressuring the drum',
      'Emulsion and sludge build-up',
      'Mixing incompatible fluids (glycol, methanol, chemicals)',
      'Pump failure leading to high level',
    ],
    maintenance: ['Check level alarms and pump function monthly', 'Clean out sludge per inspection findings', 'Internal inspection per RBI', 'PSV recertification every 2–3 years'],
    safety: [
      'Never drain HP vessels quickly to the closed drain; use the procedure and monitor drum pressure',
      'Keep drain valves closed and capped when not in use',
      'H₂S and benzene exposure during sampling and cleaning',
    ],
    standards: ['API Std 521 / ISO 23251', 'ASME BPVC Section VIII Div. 1', 'NORSOK P-002', 'ISO 13702 (fire and explosion control)'],
  },
  {
    id: 'pw-degasser',
    title: 'Produced Water Degasser',
    summary:
      'A low-pressure vessel that flashes dissolved gas out of produced water and gives remaining oil droplets a final chance to float off before discharge or reinjection.',
    howItWorks:
      'Produced water from the hydrocyclones drops to low pressure in the degasser. Dissolved gas comes out as fine bubbles, and as they rise they help float small oil droplets to the surface (a mild flotation effect). Skimmed oil goes over a weir to recovery; gas vents to the LP flare under pressure control; clean water leaves on level control to the produced water pumps. Retention time is typically around 5 minutes.',
    useCases: [
      'Final stage of produced water treatment before overboard discharge',
      'Degassing water before reinjection to protect pumps',
      'Recovering oil reject from the water stream',
      'Buffering flow to the produced water pumps',
    ],
    parameters: [
      p('Operating pressure', '0.5–3 (typical)', 'barg', 'PSV set 3.5 barg on V-4100'),
      p('Retention time', '3–5', 'min', 'V-4100 designed for 5 min'),
      p('Outlet oil-in-water', '< 30', 'mg/l', 'OSPAR monthly average limit for discharge'),
      p('Normal water level', '50–70', '%'),
      p('Oil skim', 'Intermittent', '', 'Based on oil pad thickness'),
    ],
    instrumentation: ['PT / PCV to flare', 'Water LT controlling outlet', 'Oil skim level or interface indication', 'OiW analyser downstream', 'PSV'],
    issues: [
      'Upstream separator upsets loading oil into the water',
      'Production chemicals (demulsifier overdose, scale inhibitor) stabilising oil droplets',
      'Solids and schmoo accumulation',
      'Gas carry-under to the pumps, causing cavitation',
    ],
    maintenance: ['Check skim operation daily', 'Flush solids per schedule', 'Calibrate level instruments annually', 'Internal inspection per RBI'],
    safety: ['H₂S release from produced water, so gas detection is needed', 'NORM scale in water equipment', 'Overpressure from upstream gas blow-by; PSV and LALL protect'],
    standards: ['OSPAR Recommendation 2001/1 (produced water discharges)', 'ASME BPVC Section VIII Div. 1', 'API Std 521', 'NORSOK P-002'],
  },
  {
    id: 'pw-hydrocyclone',
    title: 'Produced Water Hydrocyclone Package',
    summary:
      'A de-oiling package that uses centrifugal force in many small conical liners to strip oil droplets out of produced water. It is the main water-cleaning step on most offshore platforms.',
    howItWorks:
      'Water enters each liner tangentially and spins at high speed. The heavier water is thrown to the wall and leaves through the underflow. The lighter oil migrates to a low-pressure core and is rejected through a small overflow orifice at the top (typically 1–3 % of the flow). Performance is controlled by the pressure differential ratio (PDR): (inlet − reject) / (inlet − outlet), typically held around 1.6–2.2. Removal efficiency depends on droplet size, typically over 90 % for droplets larger than 10–15 µm. Liners are grouped in vessels and taken in or out of service to match the flow.',
    useCases: [
      'De-oiling produced water from separator water outlets',
      'Meeting overboard discharge limits (OSPAR 30 mg/l monthly average)',
      'Preparing water for reinjection',
      'Treating water with high flow and limited deck space',
    ],
    parameters: [
      p('Inlet pressure', '8–15 (typical)', 'barg', 'Needs enough pressure drop to spin; PSV set 19 barg on X-4200'),
      p('Pressure differential ratio (PDR)', '1.6–2.2', '', 'Controls reject; too low means oil carry-under'),
      p('Reject flow', '1–3', '% of feed', 'Reject goes to the LP separator'),
      p('Inlet oil-in-water', '< 1000–2000', 'mg/l'),
      p('Outlet oil-in-water', '< 30 (typical 10–25)', 'mg/l', 'Plant alarm at 29 ppm'),
      p('Flow per liner', 'Within vendor turndown (≈ 50–110 %)', '%', 'Take liners in or out of service to match flow'),
    ],
    instrumentation: ['PDT / PDR control on the reject line (PDV)', 'Inlet and outlet PT', 'Feed flow FT', 'Online OiW analyser at outlet', 'PSV on the vessel'],
    issues: [
      'Liner plugging from sand or scale, causing poor separation and high dP',
      'Wrong PDR setpoint leading to oil carry-under or excessive reject',
      'Low inlet pressure reducing the centrifugal force',
      'Small droplets from shearing in upstream control valves',
      'Liner wear from sand erosion',
    ],
    maintenance: [
      'Check PDR and OiW trends every shift',
      'Flush or backflush liners periodically; inspect liners annually',
      'Calibrate the OiW analyser against lab samples weekly',
      'Replace worn liners and O-rings per inspection',
    ],
    safety: ['Hydrocarbons and H₂S in the reject', 'NORM scale in liners; handle per radiation protection procedures', 'High-pressure water jet injury from leaks'],
    standards: ['OSPAR Recommendation 2001/1', 'ASME BPVC Section VIII Div. 1', 'NORSOK P-002', 'ISO 9377-2 (OiW analysis)'],
  },
  {
    id: 'desander',
    title: 'Wellhead Desander',
    summary:
      'A cyclonic separator installed at the wellhead or manifold that removes sand from the well stream before it can erode chokes, piping and separator internals.',
    howItWorks:
      'Well fluid enters a cyclone liner (or a bank of liners) inside a pressure vessel. The swirl throws the denser sand to the wall, where it spirals down into an accumulator; fluids leave through the top. The accumulator is isolated and flushed periodically, and the sand is sent to a sand cleaning or disposal system. Sand removal efficiency is typically 95–98 % for particles larger than 20–50 µm.',
    useCases: [
      'Sand-producing wells in unconsolidated reservoirs',
      'Protecting chokes and flowlines from erosion',
      'Keeping sand out of separators and produced water systems',
      'Well clean-up after completion or stimulation',
    ],
    parameters: [
      p('Pressure drop', '1–3 (typical)', 'bar'),
      p('Separation cut size', '20–50', 'µm', 'Particles removed at ~ 98 %'),
      p('Accumulator dump interval', 'Per sand rate (hours to days)', '', 'Based on accumulator level or weight'),
      p('Sand rate at outlet', 'As low as practical (< 1–5 typical acceptable)', 'kg/d'),
    ],
    instrumentation: ['PDT across the desander', 'Acoustic sand detector downstream', 'Accumulator level or weight indication', 'PT on inlet and outlet'],
    issues: ['Erosion of liners and outlet piping', 'Plugged accumulator from fines and wax', 'Bypass or overflow when the accumulator is full', 'Flushing valves eroded and passing'],
    maintenance: ['Dump the accumulator per sand rate', 'Inspect liners and erosion-prone bends (UT) at defined intervals', 'Check the sand detector and erosion probes monthly'],
    safety: ['Dumping a pressurised accumulator; follow a strict double-isolation and depressurise procedure', 'Sand-contaminated with oil and NORM', 'Erosion-thinned pipework can fail suddenly'],
    standards: ['DNV-RP-O501 (erosive wear in piping)', 'ASME BPVC Section VIII Div. 1', 'API RP 14E', 'API RP 14C'],
  },
  {
    id: 'suction-scrubber',
    title: 'Compressor Suction Scrubber',
    summary:
      'A vertical gas/liquid separator immediately upstream of a compressor. It removes the last liquid droplets because even small amounts of liquid can destroy a compressor.',
    howItWorks:
      'Gas enters through an inlet device, then flows upward through a mesh pad or vane pack and often a deck of axial cyclones. These coalesce and remove fine droplets (99.9 % removal of droplets of 10 µm and larger for V-2100). Separated liquid drains to the sump and is level-controlled to the closed drain or back to the process. Vertical orientation gives a small footprint and good removal of mist at high gas loads.',
    useCases: [
      'Protecting centrifugal and reciprocating compressors from liquid',
      'Removing condensate formed by cooling between compression stages',
      'Fuel gas and flash gas conditioning',
      'Upstream of glycol contactors to keep hydrocarbons out of the TEG',
    ],
    parameters: [
      p('Operating pressure', 'Compressor suction pressure (25–40 typical)', 'barg', 'PSV set 42 barg on V-2100'),
      p('Liquid removal efficiency', '99.9 % of droplets ≥ 10', 'µm', 'Cyclone deck design'),
      p('Gas outlet liquid carryover', '< 0.1', 'gal/MMscf'),
      p('Liquid level', 'Low, around 20–30 % of sump', '%', 'LAHH trips the compressor'),
      p('Demister dP', '< 50–100 (typical)', 'mbar', 'Rising dP means fouling or flooding'),
    ],
    instrumentation: ['Level LT with LAHH trip to compressor shutdown', 'Level gauge', 'PDT across the demister / cyclone deck', 'PT on the gas outlet', 'PSV to flare'],
    issues: [
      'Liquid carryover from flooding (high gas rate or high level), causing compressor damage',
      'Fouled or damaged demister from wax, salt or corrosion products',
      'Level instrument failure, the most critical compressor protection gap',
      'Foaming hydrocarbons carried over from upstream separation',
    ],
    maintenance: ['Proof-test LAHH compressor trip per SIL schedule (typically annually)', 'Trend demister dP weekly', 'Inspect internals at turnaround', 'PSV recertification every 2–3 years'],
    safety: ['LAHH must never be bypassed while the compressor runs', 'High-pressure gas; full depressurisation before opening', 'Pyrophoric iron sulphide in the internals'],
    standards: ['API Spec 12J', 'API Std 617 (centrifugal compressors, liquid protection)', 'ASME BPVC Section VIII Div. 1', 'API RP 14C'],
  },
  {
    id: 'fuel-gas-scrubber',
    title: 'Fuel Gas Scrubber',
    summary:
      'A small vertical knock-out vessel that removes liquids and particles from fuel gas before it is superheated and burned in gas turbines, heaters and pilots.',
    howItWorks:
      'Gas taken from the dry export gas or a compressor stage is reduced in pressure. This can make liquids condense, so the scrubber collects them with a mesh pad or cyclone internals before the gas reaches the fuel gas superheater and filters. Liquid drains on level control to the closed drain. Downstream, the gas is heated to about 25 K above its dew point so no liquid forms in the turbine fuel system.',
    useCases: ['Gas turbine fuel conditioning', 'Fired heater and reboiler fuel', 'Flare pilot and purge gas supply', 'Blanket gas'],
    parameters: [
      p('Operating pressure', '18–30 (typical)', 'barg', 'Fuel gas delivered at 18 barg here; PSV set 40 barg'),
      p('Liquid carryover', 'None', '', 'Turbine combustion is sensitive to liquids'),
      p('Superheat downstream', '≥ 25 (typical requirement)', 'K', 'Above hydrocarbon and water dew point'),
      p('Liquid level', 'Low', '%', 'LAHH trips the fuel supply'),
    ],
    instrumentation: ['LT with LAHH', 'Level gauge', 'PT / PCV for fuel gas pressure', 'TT downstream of the superheater', 'PSV'],
    issues: ['Liquid hydrocarbons or glycol in fuel gas, causing turbine combustion upsets and hot spots', 'Hydrates from pressure let-down', 'Filter blockage downstream', 'Level control failure'],
    maintenance: ['Check level and drain function weekly', 'Proof-test LAHH per SIL schedule', 'Inspect internals per RBI', 'Change downstream fuel gas filters on dP'],
    safety: ['Fuel gas feeds ignition sources; the ESDV closes on F&G', 'Gas release from small-bore connections', 'Isolation and purge before maintenance'],
    standards: ['ASME BPVC Section VIII Div. 1', 'ISO 21789 (gas turbine safety)', 'API RP 14C', 'NORSOK P-002'],
  },
  {
    id: 'teg-contactor',
    title: 'TEG Glycol Contactor',
    summary:
      'A tall absorption column in which lean triethylene glycol (TEG) flows down counter-current to wet gas and absorbs water. This dries the gas to its export water dew point and prevents hydrates and corrosion in the pipeline.',
    howItWorks:
      'Wet gas enters at the bottom of the column, often through an integral inlet scrubber section, and rises through trays or structured packing (8 stages here). Lean TEG is fed at the top, slightly warmer than the gas (5–10 °C) to avoid hydrocarbon condensation and foaming, and flows down, absorbing water. Dry gas leaves through a top mist eliminator. Rich TEG collects at the bottom and goes on level control to the regeneration package, where the water is boiled off and the TEG is returned lean. The achievable dew point depends mainly on lean TEG purity.',
    useCases: [
      'Dehydrating export gas to pipeline water dew point specification',
      'Preventing hydrate formation and wet-CO₂ corrosion in pipelines',
      'Dehydrating gas-lift and injection gas',
      'Drying fuel gas where required',
    ],
    parameters: [
      p('Lean TEG purity', '≥ 99 (98.5–99.9)', 'wt %', 'Stripping gas needed above ~ 99 %'),
      p('TEG circulation rate', '20–30', 'L per kg water removed', 'About 3 gal TEG per lb water typical'),
      p('Lean TEG temperature', 'Gas temperature + 5–10', '°C', 'Avoids hydrocarbon condensation and foaming'),
      p('Gas inlet temperature', '20–40 (typical)', '°C', 'Hotter gas holds more water and absorbs worse'),
      p('Dry gas water dew point', '−18 or better (spec)', '°C', 'At pipeline pressure; plant spec −18 °C'),
      p('Column dP', 'Stable, typically < 0.3–0.5', 'bar', 'Rising dP points to foaming or fouling'),
      p('Operating pressure', 'Export pressure (100–140 typical)', 'barg', 'PSV set 145 barg on T-5300'),
    ],
    instrumentation: ['Water dew point analyser (AT) on the dry gas', 'PDT across the packing', 'Rich TEG level LT / LV', 'Lean TEG flow FT and temperature TT', 'Gas inlet TT / PT', 'PSV'],
    issues: [
      'Foaming from hydrocarbon liquids, corrosion inhibitor or solids, causing TEG carryover and dew point loss',
      'Off-spec dew point from low lean TEG purity (reboiler too cold, stripping gas lost)',
      'Glycol losses through carryover (target < 10–15 L/MMscm)',
      'Hot inlet gas (cooler fouled) increasing the water load',
      'TEG degradation (pH drop, thermal breakdown) from an overheated reboiler or oxygen ingress',
    ],
    maintenance: [
      'Lab-analyse lean and rich TEG weekly (purity, pH, hydrocarbons, solids)',
      'Change TEG filters and carbon beds on dP or schedule',
      'Verify dew point analyser against a manual chilled-mirror check monthly',
      'Inspect packing and internals at turnaround',
    ],
    safety: [
      'High-pressure gas column; protect against overpressure from the export side',
      'Gas blow-by into the regeneration package if rich TEG level is lost; LALL closes the rich outlet',
      'Hot TEG burns and skin irritation',
    ],
    standards: ['ASME BPVC Section VIII Div. 1', 'GPSA Engineering Data Book (dehydration)', 'ISO 18453 (water dew point)', 'NORSOK P-002', 'API RP 14C'],
  },

  // ───────────────────────────── heat exchange ─────────────────────────────
  {
    id: 'hx-crude-cooler',
    title: 'Crude Oil Cooler',
    summary:
      'A shell-and-tube exchanger that cools stabilised crude from the LP separator before export or storage. Cooling reduces vapour pressure and protects pumps, pipelines and cargo tanks.',
    howItWorks:
      'Hot crude flows through the shell side (here) and closed-loop cooling medium (TEG/water) flows through the tubes. Heat passes through the tube walls to the cooling medium, which rejects it to seawater in the cooling medium cooler. A temperature control valve on the cooling medium supply (TCV) holds the crude outlet temperature. TEMA type and fouling factors are chosen for waxy, sandy crude on the shell side.',
    useCases: ['Cooling export crude to pipeline or tanker temperature limits', 'Reducing crude TVP and flashing in storage', 'Protecting export pump seals and flexible risers', 'Heat recovery (crude/crude exchangers) on some facilities'],
    parameters: [
      p('Crude inlet temperature', '50–80 (typical)', '°C'),
      p('Crude outlet temperature', '35–50 (typical)', '°C', 'Above wax appearance temperature'),
      p('Cooling medium supply / return', '≈ 25–35 / 45–60', '°C'),
      p('Shell-side pressure drop', '< 0.7–1.0', 'bar', 'Increase means fouling'),
      p('Approach temperature', '≥ 10', 'K', 'Typical design'),
      p('Fouling resistance (crude)', '0.0003–0.0005', 'm²K/W', 'Design allowance'),
    ],
    instrumentation: ['TT on crude in and out', 'TCV on cooling medium', 'PDT or PI across shell side', 'TT on cooling medium return', 'Thermal relief valve on the isolated side'],
    issues: [
      'Wax deposition on cold tube walls when crude cools below WAT',
      'Fouling from sand, asphaltene and scale, causing loss of duty',
      'Tube leaks letting crude into the cooling medium (gas in the expansion drum, hydrocarbons in CM)',
      'Over-cooling raising crude viscosity and export pump power',
    ],
    maintenance: ['Trend duty and U-value monthly', 'Clean (hydrojet or chemical) on performance', 'Eddy-current tube inspection at turnaround', 'Check CM for hydrocarbon contamination quarterly'],
    safety: ['Tube rupture: high-pressure crude into the lower-pressure cooling medium loop; rupture case is covered by the CM relief', 'Thermal expansion of blocked-in liquid; thermal relief needed', 'Hot surfaces'],
    standards: ['TEMA Standards', 'API Std 660 (shell-and-tube exchangers)', 'ASME BPVC Section VIII Div. 1', 'API Std 521 (tube rupture)'],
  },
  {
    id: 'hx-gas-aftercooler',
    title: 'Compressor Gas Aftercooler',
    summary:
      'A shell-and-tube cooler on the compressor discharge that removes the heat of compression before the gas goes to export, dehydration or the next stage.',
    howItWorks:
      'Hot discharge gas (100–150 °C) passes through the exchanger and cooling medium carries the heat away. A TCV on the cooling medium holds gas outlet temperature, typically 30–45 °C. That keeps the export pipeline coating and the TEG contactor within their limits and keeps water and heavy hydrocarbons condensing where they can be knocked out. Because gas is usually at high pressure, it is often on the tube side.',
    useCases: ['Compressor discharge cooling before export or dehydration', 'Interstage cooling between compressor stages', 'Anti-surge recycle cooling', 'Protecting pipeline coatings and flexible risers from high temperature'],
    parameters: [
      p('Gas inlet temperature', '100–150 (typical)', '°C'),
      p('Gas outlet temperature', '30–45', '°C', 'Above hydrate temperature'),
      p('Gas-side pressure drop', '< 0.5–1.0', 'bar', 'Direct loss in compressor head'),
      p('Cooling medium outlet temperature', '< 60', '°C', 'Limit scaling and CM degradation'),
      p('Approach temperature', '≥ 10', 'K'),
    ],
    instrumentation: ['TT on gas in / out', 'TCV on cooling medium', 'PT / PDT across gas side', 'TT on cooling medium return'],
    issues: ['Tube rupture: high-pressure gas into the cooling medium loop, which is a major relief case', 'Fouling reducing duty and raising discharge temperature', 'Hydrate formation in the outlet if over-cooled', 'Vibration-induced tube failure at high gas velocities'],
    maintenance: ['Monitor approach temperature monthly', 'Eddy-current tube inspection at turnaround', 'Check the CM expansion drum for gas (tube leak indicator)', 'Clean on performance'],
    safety: ['Tube rupture relief per API 521 (2/3 rule): CM side must withstand or relieve the full gas flow', 'High-temperature surfaces on the inlet', 'Gas detection near flanges'],
    standards: ['TEMA Standards', 'API Std 660', 'ASME BPVC Section VIII Div. 1', 'API Std 521 (tube rupture)'],
  },
  {
    id: 'hx-fuel-gas-superheater',
    title: 'Fuel Gas Superheater',
    summary:
      'A small heater that raises fuel gas temperature to about 25 K above its hydrocarbon and water dew points so no liquid can form in the gas turbine fuel system.',
    howItWorks:
      'Scrubbed fuel gas passes through a shell-and-tube exchanger heated by hot cooling medium, waste heat or an electric element. Gas turbine vendors require a minimum superheat (typically 25–28 K above dew point) at the fuel skid inlet. The let-down pressure drop cools the gas, so without the superheater liquid droplets could form and cause combustion instability or burner damage.',
    useCases: ['Gas turbine fuel conditioning', 'Preventing condensation after pressure let-down', 'Protecting dry low-emission (DLE) combustors', 'Heating fuel for fired heaters'],
    parameters: [
      p('Superheat above dew point', '≥ 25', 'K', 'Per turbine fuel specification'),
      p('Fuel gas outlet temperature', '40–60 (typical)', '°C'),
      p('Fuel gas pressure', '≈ 18', 'barg', 'Downstream of PCV-5305'),
      p('Pressure drop', '< 0.3', 'bar'),
    ],
    instrumentation: ['TT on gas outlet with low-temperature alarm', 'TCV on the heating medium', 'PT on the outlet', 'Heater element temperature trip (if electric)'],
    issues: ['Low superheat from heating medium failure, allowing liquid to reach the turbine', 'Fouling on the heating side', 'Electric heater element burnout', 'Overheating if the controller fails'],
    maintenance: ['Check outlet temperature daily', 'Inspect and test the heater element insulation annually (if electric)', 'Tube inspection at turnaround'],
    safety: ['Fuel gas in a hot equipment area: gas detection and the ESDV are essential', 'Hot surfaces', 'Electric heaters must be Ex-certified with temperature limiting'],
    standards: ['TEMA Standards', 'API Std 660', 'ISO 21789', 'IEC 60079 (Ex equipment, electric heaters)'],
  },
  {
    id: 'hx-cm-seawater-cooler',
    title: 'Cooling Medium / Seawater Cooler',
    summary:
      'The exchanger that rejects all the platform cooling-medium heat to seawater. It is the link between the closed TEG/water loop and the open seawater system.',
    howItWorks:
      'Warm cooling medium returning from the process coolers flows through one side, and seawater from the lift pumps flows through the other before dumping overboard. Plate exchangers of titanium are common, and shell-and-tube units with titanium or CuNi tubes are also used. Seawater is kept on the tube side so it can be cleaned. A TCV bypass holds the cooling medium supply temperature, and the seawater flow is kept high enough to stop marine growth settling.',
    useCases: ['Heat rejection from the closed cooling medium loop', 'Indirect seawater cooling, keeping seawater out of process exchangers', 'Supporting compressor and crude coolers', 'Cooling HVAC chillers and utilities'],
    parameters: [
      p('Seawater inlet temperature', '5–30 (site dependent)', '°C'),
      p('Seawater outlet temperature', '< 35–40', '°C', 'Limit for scaling and environmental discharge'),
      p('Cooling medium supply temperature', '25–35 (typical)', '°C'),
      p('Seawater velocity in tubes', '1.5–2.5', 'm/s', 'Too low fouls, too high erodes'),
      p('Seawater-side dP', 'Stable, increase means fouling', 'bar'),
    ],
    instrumentation: ['TT on CM in / out and SW out', 'TCV on CM bypass', 'PDT on seawater side', 'Hypochlorite residual check'],
    issues: ['Marine growth and biofouling when hypochlorite dosing fails', 'Calcium carbonate scaling at high seawater outlet temperatures', 'Galvanic corrosion at dissimilar metal joints', 'Tube or plate leaks contaminating the CM loop with seawater (chlorides)'],
    maintenance: ['Check hypochlorite residual daily', 'Backflush or clean seawater side on dP', 'Eddy-current or plate inspection at turnaround', 'Test CM for chlorides monthly'],
    safety: ['Hypochlorite (chlorine, hydrogen) hazards on the seawater side', 'Hot CM surfaces', 'Loss of cooling raises process temperatures across the platform'],
    standards: ['TEMA Standards', 'API Std 660 / API Std 662 (plate exchangers)', 'NORSOK M-001 (materials)', 'ASME BPVC Section VIII Div. 1'],
  },
  {
    id: 'hx-shell-tube',
    title: 'Shell-and-Tube Heat Exchanger',
    summary:
      'A general process heat exchanger: one fluid flows through a bundle of tubes and the other flows around them inside a shell, exchanging heat through the tube walls.',
    howItWorks:
      'The TEMA designation (e.g. AES, BEM) describes the front head, shell and rear head. Baffles direct the shell-side fluid across the tubes for good heat transfer. Floating heads or U-tubes allow thermal expansion. Fouling and corrosive fluids usually go in the tubes, which are easier to clean. Duty is controlled with a temperature control valve on one stream or a bypass.',
    useCases: ['Process cooling and heating', 'Compressor aftercooling', 'Crude and condensate cooling', 'Glycol and utility heat exchange'],
    parameters: [
      p('Approach temperature', '≥ 10 (typical)', 'K'),
      p('Shell-side pressure drop', '0.3–1.0 (typical)', 'bar'),
      p('Tube-side velocity', '1–2.5 (liquids)', 'm/s'),
      p('Fouling factor allowance', 'Per TEMA / service', 'm²K/W'),
    ],
    instrumentation: ['TT on all four nozzles', 'PI or PDT on both sides', 'TCV on one stream', 'Thermal relief valve'],
    issues: ['Fouling reducing duty', 'Tube leaks and cross-contamination', 'Flow-induced vibration damage', 'Gasket leaks at channel and shell flanges'],
    maintenance: ['Trend U-value and dP monthly', 'Tube inspection (eddy current) at turnaround', 'Hydrojet cleaning on performance', 'Replace gaskets at each opening'],
    safety: ['Tube rupture overpressure of the low-pressure side (API 521)', 'Thermal expansion of blocked-in fluid', 'Hot surfaces and flange leaks'],
    standards: ['TEMA Standards', 'API Std 660', 'ASME BPVC Section VIII Div. 1', 'API Std 521'],
  },

  // ───────────────────────────── rotating ─────────────────────────────
  {
    id: 'pump-crude-export',
    title: 'Crude Oil Export Pump',
    summary:
      'A multistage centrifugal pump that delivers stabilised crude from the LP separator to the export pipeline or tanker. Usually two installed (1 duty, 1 standby).',
    howItWorks:
      'An electric motor (450 kW, EExd here) drives the pump through a flexible coupling. Liquid enters the impeller eye and is flung outward, gaining velocity that the volute or diffuser converts to pressure. Multistage designs (API 610 BB3 / BB5) add head stage by stage. Flow is set by the LP separator level controller throttling the discharge, or by a variable speed drive. A minimum-flow recycle protects the pump at low throughput, and the standby pump starts automatically if the duty pump trips.',
    useCases: ['Crude export to pipelines', 'Transfer to FSO / shuttle tanker loading', 'Condensate export from gas facilities', 'Oil transfer between process stages'],
    parameters: [
      p('NPSH available margin', '≥ 1.0 m or NPSHa/NPSHr ≥ 1.3', 'm', 'LP separator level and pressure set NPSHa'),
      p('Operating point', '80–110 % of BEP flow', '%', 'Preferred operating region per API 610'),
      p('Vibration (bearing housing)', '< 4.5 (alarm ~ 7.1)', 'mm/s RMS', 'ISO 10816-3 / 20816-3 zone A/B'),
      p('Bearing temperature', '< 80 (alarm 90–95)', '°C'),
      p('Seal flush / barrier pressure', 'Per API 682 plan, typically ≥ 1.5 bar above seal chamber', 'bar'),
      p('Motor load', '70–95', '% of rated'),
      p('Minimum continuous flow', '≥ vendor MCSF (30–40 % BEP typical)', '%', 'Protected by minimum-flow recycle'),
    ],
    instrumentation: ['Suction and discharge PT / PG', 'Discharge flow FT (minimum flow protection)', 'Vibration probes / accelerometers and bearing TT', 'Seal leakage / seal pot level and pressure', 'Motor winding temperature (RTDs) and current'],
    issues: [
      'Cavitation from low NPSHa (low separator level, gas carry-under) causing noise, vibration and impeller damage',
      'Mechanical seal leaks from dry running, solids or misalignment',
      'Bearing failure from lubrication or misalignment',
      'Operating far from BEP causing recirculation, vibration and shaft deflection',
      'Wax or sand wear on wear rings, losing efficiency',
    ],
    maintenance: [
      'Daily operator rounds: vibration, temperatures, seal leakage, oil level',
      'Condition monitoring with vibration analysis monthly',
      'Oil change per hours (typical 4000–8000 h) or analysis',
      'Changeover duty / standby monthly to exercise both pumps',
      'Overhaul on condition (typically 3–5 years)',
    ],
    safety: [
      'Seal failure releases crude near an ignition-controlled area; gas detection and dual seals with alarms',
      'Isolate, drain and depressurise to closed drain before opening',
      'Rotating equipment guards; lock out the motor (electrical isolation)',
      'Reverse rotation from check valve failure',
    ],
    standards: ['API Std 610 / ISO 13709 (centrifugal pumps)', 'API Std 682 (mechanical seals)', 'ISO 10816-3 / ISO 20816-3 (vibration)', 'API Std 686 (installation)', 'IEC 60079 (Ex motors)'],
  },
  {
    id: 'pump-produced-water',
    title: 'Produced Water Pump',
    summary:
      'A centrifugal pump that sends treated produced water from the degasser to overboard discharge or reinjection.',
    howItWorks:
      'Takes suction from the degasser at low pressure and pumps the water through the oil-in-water analyser sample point to the overboard caisson, or to injection pumps. Flow follows degasser level. Duplex or super-duplex materials resist chloride corrosion and the solids in the water. Two installed pumps (2 × 100 %) allow online maintenance.',
    useCases: ['Overboard discharge of treated produced water', 'Feed to water injection / reinjection pumps', 'Transfer to onshore treatment', 'Recirculation for flushing'],
    parameters: [
      p('NPSH available margin', '≥ 1.0', 'm', 'Low-pressure, degassed suction'),
      p('Operating point', '80–110 % of BEP', '%'),
      p('Vibration', '< 4.5', 'mm/s RMS', 'ISO 10816-3'),
      p('Bearing temperature', '< 80', '°C'),
      p('Discharge OiW', '< 30', 'mg/l', 'Monthly average limit'),
    ],
    instrumentation: ['Suction / discharge PT', 'FT for flow and minimum flow', 'Vibration and bearing temperatures', 'OiW analyser on the discharge'],
    issues: ['Gas carry-under causing cavitation', 'Scale (BaSO₄, CaCO₃) and NORM deposits', 'Erosion from sand', 'Seal leaks'],
    maintenance: ['Daily rounds, vibration monitoring monthly', 'Changeover duty / standby monthly', 'Scale inspection at overhaul', 'Seal replacement on condition'],
    safety: ['H₂S and hydrocarbons in the water', 'NORM in scale; radiation survey before opening', 'Isolation and drain before maintenance'],
    standards: ['API Std 610 / ISO 13709', 'ISO 10816-3 / 20816-3', 'NORSOK M-001 (materials)', 'OSPAR 2001/1'],
  },
  {
    id: 'pump-closed-drain',
    title: 'Closed Drain Pump',
    summary:
      'A small pump that empties the closed drain drum, returning recovered hydrocarbons to the LP separator or process.',
    howItWorks:
      'Starts and stops on closed drain drum level. Often a vertical canned or horizontal centrifugal pump, sometimes a screw pump for viscous or emulsified liquid. Must cope with mixed oil, water, glycol and solids at low suction pressure.',
    useCases: ['Returning drained liquids to the process', 'Emptying the drum after maintenance drain-downs', 'Transferring flare KO drum liquids on some platforms'],
    parameters: [
      p('NPSH available margin', '≥ 1.0', 'm', 'Near-atmospheric suction'),
      p('Duty', 'Intermittent, level-controlled', ''),
      p('Vibration', '< 4.5', 'mm/s RMS'),
      p('Run time per start', 'Minutes', '', 'Frequent short cycles indicate a level problem'),
    ],
    instrumentation: ['Drum level start/stop', 'Discharge PI', 'Motor current', 'Check valve on discharge'],
    issues: ['Dry running from level instrument failure', 'Seal damage from solids', 'Vapour lock with light hydrocarbons', 'Blocked suction strainer'],
    maintenance: ['Function test monthly', 'Clean suction strainer on schedule', 'Seal inspection on condition'],
    safety: ['Hydrocarbon handling with H₂S possible', 'Lock-out before maintenance', 'Drain and flush before opening'],
    standards: ['API Std 610 / ISO 13709', 'ISO 10816-3', 'NORSOK P-002'],
  },
  {
    id: 'pump-centrifugal',
    title: 'Centrifugal Pump Package',
    summary:
      'An electric-motor-driven centrifugal pump on a common baseplate: the standard way to move liquids around a production facility.',
    howItWorks:
      'The motor spins the impeller, which accelerates liquid outward; the casing converts velocity to pressure. Head depends on impeller diameter and speed, and flow is set by the system curve, usually throttled by a control valve or set by a VSD. Mechanical seals keep the process fluid in, and bearings carry the shaft loads.',
    useCases: ['Oil and condensate transfer', 'Water handling', 'Utility circulation', 'Chemical and drain transfer'],
    parameters: [
      p('NPSH available margin', '≥ 1.0 m or ratio ≥ 1.3', 'm'),
      p('Operating point', '80–110 % of BEP', '%'),
      p('Vibration', '< 4.5', 'mm/s RMS', 'ISO 10816-3'),
      p('Bearing temperature', '< 80', '°C'),
      p('Motor load', '70–95', '%'),
    ],
    instrumentation: ['Suction / discharge pressure', 'Flow', 'Vibration and bearing temperature', 'Motor current'],
    issues: ['Cavitation from low NPSHa', 'Seal leaks', 'Bearing failure', 'Off-BEP operation vibration', 'Misalignment'],
    maintenance: ['Daily rounds', 'Vibration analysis monthly', 'Lube oil change per hours', 'Laser alignment after maintenance'],
    safety: ['Isolate, drain, lock out before maintenance', 'Coupling guards in place', 'Seal leak detection for hazardous fluids'],
    standards: ['API Std 610 / ISO 13709', 'API Std 682', 'ISO 10816-3 / 20816-3', 'API Std 686'],
  },
  {
    id: 'compressor-export-gas',
    title: 'Export Gas Compressor (Centrifugal)',
    summary:
      'A centrifugal (barrel) compressor train that raises separator gas to export pipeline pressure. It is usually the largest power consumer on the platform and the most complex rotating machine.',
    howItWorks:
      'An electric motor (often on a VSD) or gas turbine drives the compressor, sometimes through a speed-increasing gearbox. Gas enters each impeller eye, is accelerated and diffused, and pressure rises stage by stage inside a barrel casing. Dry gas seals with nitrogen or filtered process gas keep gas from leaking along the shaft. An anti-surge controller watches the operating point on the compressor map and opens a fast recycle valve before flow drops to the surge line. A lube oil system feeds the bearings, and vibration probes and thrust position sensors guard the rotor.',
    useCases: ['Gas export to pipeline', 'Gas reinjection for pressure maintenance', 'Gas lift supply', 'Flash gas recompression from LP stages'],
    parameters: [
      p('Surge margin', '≥ 10 (typical control line)', '% of flow from surge line', 'Anti-surge valve opens < 2 s'),
      p('Shaft vibration (proximity)', '< 25–50 (alarm per API 617)', 'µm p-p', 'Trip typically ≈ 75–100 µm'),
      p('Thrust bearing temperature', '< 100 (alarm ~ 110–115)', '°C'),
      p('Discharge temperature', '< 150–175', '°C', 'Limited by seals and aftercooler'),
      p('Polytropic efficiency', '75–85', '%', 'Falling efficiency means fouling or damage'),
      p('Dry gas seal primary vent flow', 'Within vendor band', 'Nm³/h', 'Rising flow indicates seal wear'),
      p('Lube oil supply pressure / temperature', '≈ 1.5–2.5 barg / 40–50 °C', ''),
    ],
    instrumentation: ['Anti-surge controller with suction / discharge PT, TT and flow FT', 'Radial vibration and axial position probes (API 670)', 'Bearing RTDs', 'Dry gas seal monitoring panel', 'Lube oil PT / TT and filter dP', 'Speed and VSD / driver monitoring'],
    issues: [
      'Surge from low flow or trip without anti-surge action, causing violent flow reversal and damage to seals, bearings and impellers',
      'Liquid ingestion from scrubber carryover, causing erosion or impeller failure',
      'Dry gas seal failure from contamination or reverse pressurisation',
      'Fouling of impellers reducing efficiency and capacity',
      'High vibration from imbalance, misalignment or rub',
    ],
    maintenance: ['Continuous condition monitoring of vibration and performance', 'Anti-surge valve stroke test (full stroke) at least annually', 'Lube oil analysis monthly', 'Dry gas seal replacement on condition (typically 3–5 years)', 'Major overhaul on condition (typically 5–8 years)'],
    safety: [
      'Blowdown on ESD depressurises the casing to flare through the BDV',
      'Enclosure or area gas detection with automatic shutdown and blowdown',
      'Large rotating inertia: never open with pressure or before rundown',
      'Seal gas and vent lines carry hydrocarbons to safe locations',
    ],
    standards: ['API Std 617 (axial and centrifugal compressors)', 'API Std 614 (lube and seal oil systems)', 'API Std 692 (dry gas seals)', 'API Std 670 (machinery protection)', 'ISO 10439'],
  },

  // ───────────────────────────── wells / production ─────────────────────────────
  {
    id: 'manifold',
    title: 'Production / Test Manifold',
    summary:
      'An assembly of headers and valves where the flowlines from individual wells are routed either to the production header or to the test header (test separator).',
    howItWorks:
      'Each well flowline arrives at a slot with a branch to each header, each with an isolation valve (ball or plug), and often a check valve and a choke upstream. Normally a well flows to the production header. To test it, the operator opens the test branch and closes the production branch, so only that well goes to the test separator. Pressure and temperature are monitored on each slot. Some manifolds use multiport selector valves instead of individual valves.',
    useCases: ['Collecting well streams into the production separator', 'Routing individual wells for testing', 'Isolating wells for intervention', 'Distributing gas lift or injection water to wells'],
    parameters: [
      p('Header pressure', 'Slightly above HP separator pressure', 'barg'),
      p('Header velocity', '< erosional velocity (API RP 14E C ≈ 100–150)', 'm/s', 'Lower with sand'),
      p('Valve tightness', 'Zero visible leakage (test diverters)', '', 'A passing valve corrupts well tests'),
      p('Design pressure', 'Shut-in tubing head pressure or protected by HIPPS', 'barg'),
    ],
    instrumentation: ['PT and TT on each well slot', 'PT on each header', 'Valve position indication', 'Sand detectors on headers (acoustic)'],
    issues: ['Erosion at tees and bends from sand', 'Passing diverter valves corrupting tests', 'Hydrate plugging during start-up', 'Wrong line-up sending a high-pressure well into a lower-rated header'],
    maintenance: ['Leak-test diverter valves annually', 'UT wall thickness at erosion-prone locations', 'Grease plug valves per schedule', 'Calibrate slot PT / TT'],
    safety: ['Line-up changes follow a procedure with double-checking', 'High pressure: full depressurisation before breaking containment', 'Hydrates: never try to blow a hydrate plug out with pressure from one side'],
    standards: ['ASME B31.3 (process piping)', 'API RP 14E', 'API Spec 6D (valves)', 'API RP 14C'],
  },
  {
    id: 'pig-trap',
    title: 'Pig Launcher / Receiver',
    summary:
      'A pressure-rated barrel with a quick-opening closure used to insert pigs into, or remove them from, a pipeline for cleaning, liquid removal and inline inspection.',
    howItWorks:
      'The barrel has an oversized major section (for loading the pig) reducing to the pipeline size, with a kicker line, a bypass, vent and drain. To launch: isolate, depressurise and drain the barrel, open the closure, load the pig, close, purge and pressurise. Then open the barrel valve and divert flow through the kicker to push the pig into the line. A pig signaller confirms passage. The receiver works in reverse at the far end. A pressure warning interlock (key interlock and bleed screw) prevents opening while pressurised.',
    useCases: ['Routine cleaning pigging of oil and gas export lines (wax, water, debris)', 'Intelligent pigging (ILI) for corrosion inspection', 'Batching and dewatering during commissioning', 'Liquid management in wet gas lines'],
    parameters: [
      p('Closure pressure before opening', '0 (verified)', 'barg', 'Via bleed and pressure gauge, interlocked'),
      p('Pig velocity', '1–5 (typical)', 'm/s', 'ILI tools need a narrow band'),
      p('Barrel major size', 'Line size + 2" (typical)', 'in'),
      p('Pigging frequency', 'Weekly to annually depending on service', ''),
    ],
    instrumentation: ['Pressure gauge on the barrel', 'Pig signaller (intrusive or non-intrusive)', 'Closure interlock with vent', 'Barrel drain and vent valves'],
    issues: ['Stuck pig from debris, wax build-up or damaged pig', 'Closure seal leaks', 'Pig passing the signaller undetected', 'Large liquid slugs arriving at the receiver'],
    maintenance: ['Inspect and replace closure seals per use or annually', 'Function test interlocks before each operation', 'Pressure test after closure maintenance'],
    safety: [
      'Opening a pressurised closure has caused fatalities; always verify zero pressure and use the interlock',
      'Pyrophoric debris and liquids in the barrel; keep debris wet',
      'H₂S and hydrocarbon release when opening',
    ],
    standards: ['ASME B31.4 / B31.8 (pipelines)', 'ASME BPVC Section VIII Div. 1 (closures)', 'NACE SP0102 (ILI)', 'DNV-ST-F101 (offshore pipelines)'],
  },
  {
    id: 'xmas-tree',
    title: 'Wellhead and Christmas Tree (Producer)',
    summary:
      'The stack of valves and spools on top of a well that contains reservoir pressure, controls flow, and gives access for wireline and intervention.',
    howItWorks:
      'The wellhead (casing head and tubing head spools) supports and seals the casing and tubing strings. The surface tree above it has a lower master valve (manual), an upper master valve which is a hydraulically actuated fail-close surface safety valve (SSV), a cross with the production wing valve (often actuated) leading to the choke and flowline, a kill wing valve, and a swab valve with a tree cap on top for intervention access. Down in the tubing, a surface-controlled subsurface safety valve (SCSSV, at about 300 m here) is held open by hydraulic pressure from the wellhead control panel and closes if pressure is lost. The choke sets the flowing rate. Annulus pressures (A, B and C) are monitored against their maximum allowable (MAASP).',
    useCases: ['Oil and gas production wells', 'Shutting in the well on ESD or for maintenance', 'Access for wireline, coiled tubing and well intervention', 'Chemical (methanol, scale inhibitor) injection into the wellstream'],
    parameters: [
      p('Flowing tubing head pressure (FTHP)', 'Well specific (e.g. 40–150)', 'barg', 'Trend against choke setting'),
      p('Choke opening', 'Set by production engineering', '% / 64ths in', 'Changes in small steps to avoid sand and coning'),
      p('A-annulus pressure', '< MAASP and below operating limit (typically < 50 % MAASP)', 'barg', 'Rising pressure indicates tubing or packer leak'),
      p('SCSSV control line pressure', 'Above opening pressure, typically 300–700', 'barg', 'Supplied by HPU (345 / 690 barg pumps here)'),
      p('SSV closure time', '< 10–30 (typical spec)', 's'),
      p('Flowing temperature', 'Above hydrate formation temperature', '°C', 'Methanol at start-up if not'),
    ],
    instrumentation: ['PT and TT downstream of the tree (FTHP / FTHT)', 'Annulus PT / PG on A and B annulus', 'Choke position', 'SSV and SCSSV position / control line pressure', 'Acoustic sand detector downstream of the choke'],
    issues: ['Sustained casing pressure in the annulus (well integrity issue)', 'Choke erosion from sand', 'SSV or SCSSV failing leak or function tests', 'Hydrates at the choke during start-up', 'Wax, scale or asphaltene deposition in the tubing'],
    maintenance: ['Function and leak test SSV, SCSSV and wing valves (typically every 6 months per regulator)', 'Grease and torque valves per schedule', 'Annulus pressure monitoring and bleed-off records', 'Choke trim inspection on sand-producing wells'],
    safety: ['Two independent barriers must always be in place (well barrier philosophy)', 'Never exceed MAASP; investigate any sustained annulus pressure', 'Fusible plugs / F&G close SSV on fire', 'Intervention work under permit with pressure control equipment'],
    standards: ['API Spec 6A / ISO 10423 (wellhead and tree)', 'API Spec 14A / ISO 10432 (SCSSV)', 'API RP 14B (SSSV systems)', 'NORSOK D-010 (well integrity)', 'API RP 90 (annular casing pressure)'],
  },
  {
    id: 'xmas-tree-injector',
    title: 'Wellhead and Christmas Tree (Injector / Suspended)',
    summary:
      'A tree on a water or gas injection well, or on a suspended well. It contains pressure and controls injection, with the same barrier philosophy as a producer.',
    howItWorks:
      'The valve stack is the same as on a producer: master valves, an actuated SSV, wing valves and a swab valve. Flow runs the other way: injection water or gas enters through the wing valve and goes down the tubing to the reservoir. A check valve and injection choke or control valve meter the rate. On a suspended well, the tree stays closed with barriers verified and pressures monitored until the well is reinstated or abandoned.',
    useCases: ['Water injection for reservoir pressure support', 'Gas injection or storage', 'Produced water reinjection', 'Suspended wells waiting for workover'],
    parameters: [
      p('Injection pressure', 'Below fracture pressure (well specific)', 'barg'),
      p('Injection rate', 'Per reservoir plan', 'm³/d'),
      p('A-annulus pressure', '< MAASP', 'barg'),
      p('SSV closure time', '< 10–30', 's'),
    ],
    instrumentation: ['Injection PT and flow FT', 'Annulus PT', 'SSV position', 'Check valve'],
    issues: ['Injectivity decline from solids or scale', 'Annulus pressure build-up', 'Backflow on shutdown (cross-flow) if check valves leak', 'Corrosion from oxygenated water'],
    maintenance: ['Barrier function tests per regulator (typically 6-monthly)', 'Injection water quality monitoring', 'Annulus monitoring'],
    safety: ['Two-barrier philosophy', 'Avoid fracturing above design', 'Pressure trapped under closed valves'],
    standards: ['API Spec 6A / ISO 10423', 'NORSOK D-010', 'API RP 14B'],
  },
  {
    id: 'drilling-rig',
    title: 'Platform Drilling Rig',
    summary:
      'The derrick, top drive, drill floor and mud system used to drill and complete new wells and work over existing ones from the platform.',
    howItWorks:
      'The drawworks and travelling block lift the drill string from the derrick. A top drive rotates it while mud pumps push drilling fluid down through the standpipe and drill pipe, out of the bit and back up the annulus. The mud carries cuttings to the shale shakers and holds back formation pressure with its hydrostatic head. The driller watches hook load, standpipe pressure, pit volume and flow-out continuously. A gain in pit volume or flow-out above flow-in is the first sign of a kick, which is shut in with the BOP.',
    useCases: ['Drilling new production and injection wells', 'Sidetracks and re-entries', 'Workovers and completions', 'Plug and abandonment'],
    parameters: [
      p('Hook load', 'Per string weight + overpull limits', 't', 'Nominal 182 t on the current section'),
      p('Standpipe pressure', 'Stable at set pump rate', 'bar', 'Sudden change means washout, plugged nozzles or kick'),
      p('Active pit volume', 'Stable ± 1–2', 'm³', 'Gain = possible kick, loss = losses to formation'),
      p('Mud weight', 'Above pore pressure, below fracture gradient', 'SG', '1.35 SG OBM here'),
      p('Flow-out', 'Matches flow-in', '%', 'Primary kick indicator'),
      p('Background gas', 'Low and stable', 'units'),
    ],
    instrumentation: ['Hook load (deadline anchor load cell)', 'Standpipe PT', 'Pit volume totaliser and trip tank level', 'Flow-out paddle', 'Mud gas trap', 'H₂S detectors at the rotary and shakers'],
    issues: ['Kicks (influx) from underbalance or swabbing', 'Lost circulation into weak formations', 'Stuck pipe (differential or pack-off)', 'Washouts in the drill string', 'Dropped objects from the derrick'],
    maintenance: ['Daily derrick and dropped-objects inspection', 'Drawworks brake and crown-o-matic tests per tour', 'Mud pump liner and valve changes on condition', 'Derrick inspection per API RP 4G (Category III/IV)'],
    safety: ['Well control: kick detection and BOP drills (pit drills, trip drills) weekly', 'Simultaneous operations (SIMOPS) with production need a matrix and permits', 'Dropped objects zone on the drill floor', 'H₂S contingency with BA sets'],
    standards: ['API RP 59 (well control)', 'API Spec 4F / RP 4G (derricks)', 'API Std 53 (BOP systems)', 'NORSOK D-001 / D-010', 'IADC guidelines'],
  },
  {
    id: 'bop',
    title: 'Blowout Preventer (BOP) Stack',
    summary:
      'A stack of hydraulically closed sealing elements on the wellhead during drilling. It shuts in the well and controls a kick so formation fluids cannot reach the surface uncontrolled.',
    howItWorks:
      'An annular preventer at the top uses a rubber packing element that can close on any pipe size, or on an open hole. Ram preventers below it have pipe rams that seal around the drill pipe and blind or shear rams that cut the pipe and seal the bore. Choke and kill lines with valves let the crew circulate out a kick through the choke manifold while the well is shut in. An accumulator unit stores hydraulic fluid under nitrogen precharge so the BOP can close even without power.',
    useCases: ['Shutting in a well on a kick', 'Circulating out influx through the choke manifold', 'Pressure testing casing', 'Emergency disconnect and securing the well'],
    parameters: [
      p('Accumulator system pressure', '3000', 'psi (207 bar)', 'Typical surface system'),
      p('Accumulator precharge', '1000 (typical)', 'psi', 'Checked before each well'),
      p('Annular closing time', '≤ 30 (< 18 3/4 in) / ≤ 45 (≥ 18 3/4 in)', 's', 'API Std 53 surface BOP'),
      p('Ram closing time', '≤ 30', 's', 'API Std 53 surface BOP'),
      p('Remaining pressure after closing all functions', '≥ 200 psi above precharge', 'psi', 'Accumulator sizing check'),
      p('Pressure test interval', '≤ 21 days (typical)', 'days', 'Plus function test weekly'),
    ],
    instrumentation: ['Accumulator pressure and manifold pressure', 'Annular regulator pressure', 'Choke and kill line pressures', 'Function position indication on the driller and remote panels'],
    issues: ['Annular element wear or failure to seal', 'Hydraulic leaks reducing closing pressure', 'Low precharge leaving insufficient usable volume', 'Shear rams unable to shear tool joints or heavy pipe'],
    maintenance: ['Function test weekly from alternating panels', 'Pressure test after installation and at least every 21 days', 'Accumulator drawdown test per API 53', 'Major inspection / recertification every 5 years'],
    safety: ['Well control is the highest-consequence hazard on the platform', 'Space out so a tool joint is not across the rams before closing', 'Trapped pressure in the stack; bleed through the choke manifold', 'BOP drills keep crews proficient'],
    standards: ['API Std 53 (BOP equipment systems)', 'API Spec 16A (drill-through equipment)', 'API Spec 16D (control systems)', 'NORSOK D-001 / D-010'],
  },

  // ───────────────────────────── generic fallbacks ─────────────────────────────
  {
    id: 'vessel-horizontal',
    title: 'Horizontal Pressure Vessel',
    summary:
      'A horizontal cylindrical pressure vessel on saddles. It is the usual form for separators, drums and tanks with large liquid volumes.',
    howItWorks:
      'Horizontal vessels give a large liquid surface area for gas disengagement and long residence time, so they suit separation of liquids and gas with a lot of liquid. Internals (inlet devices, weirs, demisters, vortex breakers) suit the service. Pressure, level and temperature are controlled by the connected loops, and the vessel is protected by a PSV.',
    useCases: ['Separators and knock-out drums', 'Surge and expansion drums', 'Storage tanks for diesel, chemicals or water', 'Degassers and drain drums'],
    parameters: [
      p('Operating pressure', 'Below 90 % of PSV set pressure', 'barg', 'Operating margin to avoid simmer'),
      p('Normal liquid level', '40–60 (service dependent)', '%'),
      p('Operating temperature', 'Within design limits and above MDMT', '°C'),
      p('Corrosion allowance consumption', 'Per inspection, within remaining life', 'mm'),
    ],
    instrumentation: ['PT', 'LT and level gauge', 'TT', 'PSV'],
    issues: ['Internal corrosion and erosion', 'Level instrument faults', 'Fouling or blocked nozzles', 'Saddle corrosion under insulation'],
    maintenance: ['External inspection annually', 'Internal inspection per RBI', 'PSV recertification every 2–3 years', 'Calibrate instruments annually'],
    safety: ['Overpressure protection must be in service', 'Confined space entry procedures', 'Positive isolation before entry'],
    standards: ['ASME BPVC Section VIII Div. 1', 'API 510 (vessel inspection)', 'API Std 521'],
  },
  {
    id: 'vessel-vertical',
    title: 'Vertical Pressure Vessel',
    summary:
      'A vertical cylindrical vessel on a skirt or legs. It is the usual form for scrubbers, columns and receivers where liquid volume is small or footprint is limited.',
    howItWorks:
      'Gas or liquid enters through a nozzle with an inlet device. Gas rises through mist-elimination internals and liquid collects in the bottom sump. The vertical form gives good gas/liquid separation in a small footprint and makes liquid level control simple.',
    useCases: ['Gas scrubbers and knock-out drums', 'Columns and contactors', 'Air receivers and accumulators', 'Water and chemical tanks'],
    parameters: [
      p('Operating pressure', 'Below 90 % of PSV set pressure', 'barg'),
      p('Liquid level', 'Low in gas service, per design in storage', '%'),
      p('Operating temperature', 'Within design limits', '°C'),
      p('Demister dP (gas service)', '< 50–100 (typical)', 'mbar', 'Rising dP means fouling or flooding'),
    ],
    instrumentation: ['PT', 'LT and level gauge', 'TT', 'PSV'],
    issues: ['Liquid carryover in gas service from high level or a damaged demister', 'Corrosion at the liquid line and under deposits in the sump', 'Skirt corrosion and fireproofing damage', 'Blocked drain or level bridle nozzles from solids, giving a false level'],
    maintenance: ['External inspection annually', 'Internal inspection per RBI', 'PSV recertification every 2–3 years'],
    safety: ['Overpressure protection must be in service', 'Confined space entry procedures', 'Working at height on top platforms'],
    standards: ['ASME BPVC Section VIII Div. 1', 'API 510', 'API Std 521'],
  },
  {
    id: 'mpfm',
    title: 'Multiphase Flow Meter (MPFM)',
    summary:
      'An inline meter that measures oil, gas and water rates of a well stream without separating it, so wells can be tested continuously instead of being routed through a test separator.',
    howItWorks:
      'A typical MPFM combines a venturi, which gives total mass or volume flow from differential pressure, with a phase-fraction measurement. That is usually a dual-energy gamma densitometer, sometimes with microwave or impedance sensors for water cut. Pressure and temperature, plus a PVT model of the fluid, convert line conditions to standard oil, gas and water rates. The meter is usually mounted vertically with upward flow after a blind tee to mix the stream. Accuracy depends on how well the configured fluid properties (densities, salinity, gas composition) match the real fluid.',
    useCases: [
      'Continuous well testing on wellhead platforms without a test separator',
      'Production allocation between wells, reservoirs or partners',
      'Detecting water breakthrough and GOR changes early',
      'Subsea and remote wells where test separators are not practical',
    ],
    parameters: [
      p('Liquid rate uncertainty', '± 5–10 (typical)', '% relative', 'Worse at very high gas volume fraction'),
      p('Gas rate uncertainty', '± 5–10 (typical)', '% relative'),
      p('Water cut uncertainty', '± 2–5', '% absolute', 'Depends on salinity setting'),
      p('Gas volume fraction (GVF)', 'Within meter envelope, typically < 95–98', '%', 'Wet-gas mode above this'),
      p('Venturi dP', 'Within calibrated range', 'mbar', 'Too low gives poor resolution'),
      p('Fluid property update', 'After each PVT sample or salinity change', ''),
    ],
    instrumentation: ['Venturi DP and line PT / TT', 'Gamma densitometer (radioactive source) and detectors', 'Water-cut / salinity sensor', 'Flow computer with PVT model'],
    issues: [
      'Wrong fluid properties (oil density, water salinity) biasing water cut and rates',
      'Scale, wax or sand deposits on the venturi or windows',
      'Slugging flow outside the meter averaging window',
      'Drift that goes unnoticed without reconciliation against the export total',
      'Source decay reducing gamma count rates over years',
    ],
    maintenance: [
      'Reconcile against test separator or fiscal totals monthly',
      'Update PVT and salinity after new samples (typically quarterly)',
      'Empty-pipe or static calibration checks per vendor (annually typical)',
      'Radioactive source leak test and survey per licence (typically 6–12 months)',
    ],
    safety: [
      'Gamma source: controlled area, licensed handling, shutter locked before work',
      'High-pressure well stream; isolate and depressurise before maintenance',
      'Sand erosion of the venturi throat and downstream piping',
    ],
    standards: ['API MPMS Chapter 20.3 (multiphase measurement)', 'NFOGM Handbook of Multiphase Flow Metering', 'ISO 5167 (venturi)', 'IAEA / national ionising radiation regulations'],
  },
  {
    id: 'temporary-refuge',
    title: 'Temporary Refuge / Local Control Room',
    summary:
      'A protected, fire-rated, gas-tight enclosure where personnel muster and shelter during a major emergency until they can be evacuated. On a small wellhead platform it often doubles as the local control room.',
    howItWorks:
      'The TR is built with A60 (or H-rated) fire walls, blast-resistant structure and a pressurised HVAC system that shuts its dampers when gas or smoke is detected at the intake. Internal air then keeps people safe for the required endurance time (typically 1–2 hours). It holds the muster list, communications (radio, PA, telephone), emergency lighting, smoke hoods or escape sets, and local ESD and F&G status panels. Escape routes lead to it from all work areas and on to the lifeboats, bridge or helideck.',
    useCases: [
      'Muster point during gas release, fire or abandon-platform alarms',
      'Command point for the onsite emergency response team',
      'Local control and ESD status for a normally unmanned or bridge-linked platform',
      'Shelter during severe weather',
    ],
    parameters: [
      p('Endurance time', '1–2 (typical requirement)', 'h', 'From the major accident hazard assessment'),
      p('Internal overpressure', '+50 (typical)', 'Pa', 'Keeps smoke and gas out'),
      p('Fire rating', 'A60 / H60–H120', '', 'Per fire hazard assessment'),
      p('CO₂ / O₂ inside after damper closure', 'CO₂ < 1–2 %, O₂ > 19 %', '%', 'Limits endurance time'),
      p('HVAC intake gas detection', 'Close dampers at 10–20 % LEL (typical)', '% LEL'),
    ],
    instrumentation: ['Gas detectors at HVAC intakes', 'Smoke detectors inside', 'Differential pressure indication', 'ESD / F&G mimic or status panel', 'PA / GA and radio'],
    issues: [
      'Door seals or penetrations leaking, failing pressurisation tests',
      'HVAC damper failure to close on gas detection',
      'Smoke ingress from adjacent fires through cable transits',
      'Muster count delays from out-of-date POB lists',
    ],
    maintenance: [
      'Weekly muster drills and POB checks',
      'Test HVAC shutdown and damper closure on gas detection (6–12 monthly)',
      'TR integrity / pressurisation test annually',
      'Check emergency equipment (escape sets, first aid, comms) monthly',
    ],
    safety: [
      'Keep TR doors closed; a propped door defeats pressurisation',
      'The TR must be survivable for the defined endurance time under all major accident scenarios',
      'Never store hydrocarbons or combustibles inside',
    ],
    standards: ['ISO 13702 (fire and explosion control, offshore)', 'ISO 15138 (HVAC offshore)', 'NORSOK S-001 (technical safety)', 'UK PFEER / Safety Case Regulations'],
  },
]
