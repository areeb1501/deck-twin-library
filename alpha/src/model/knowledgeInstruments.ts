/**
 * Knowledge base — instruments (process transmitters, gauges, analysers, fire & gas detectors and
 * drilling / well-control measurements). Merged into KNOWLEDGE by model/knowledge.ts.
 */
import type { Knowledge, KnowledgeParam } from './knowledgeTypes'

const p = (name: string, ideal: string, unit?: string, note?: string): KnowledgeParam => ({ name, ideal, ...(unit ? { unit } : {}), ...(note ? { note } : {}) })

export const INSTRUMENT_KNOWLEDGE: Knowledge[] = [
  // ───────────────────────────── pressure ─────────────────────────────
  {
    id: 'inst-pt',
    title: 'Pressure Transmitter (PT)',
    summary:
      'An electronic transmitter that measures line or vessel pressure and sends a 4–20 mA (usually HART) signal to the DCS for control and alarms, or to the SIS for trips such as PAHH / PALL.',
    howItWorks:
      'Process pressure acts on an isolating diaphragm; a fill fluid transfers it to a capacitive, piezo-resistive or resonant silicon sensor. The electronics linearise and temperature-compensate the reading and output 4–20 mA proportional to the calibrated range, with HART digital data superimposed for diagnostics. The transmitter is mounted on a 2- or 3-valve manifold via short impulse lines (or close-coupled) so it can be isolated, vented and calibrated in situ. Safety transmitters are separate from control transmitters and often voted 2oo3.',
    useCases: [
      'Separator and scrubber pressure control (PIC driving a PCV or the gas outlet valve)',
      'High-high / low-low pressure trips (PAHH / PALL) per API RP 14C safety analysis, wired to the SIS',
      'Compressor suction / discharge pressure for anti-surge and performance monitoring',
      'Pump suction and discharge pressure (NPSH and dead-head protection)',
      'Wellhead tubing head and annulus pressure monitoring',
      'Fuel gas, instrument air and firewater ring pressure (low pressure starts standby or firewater pumps)',
    ],
    parameters: [
      p('Normal reading', '40–70', '% of span', 'range chosen so normal operation sits mid-scale'),
      p('Reference accuracy', '±0.04–0.1', '% of span', 'typical modern smart transmitter'),
      p('Output signal', '4–20', 'mA', '3.8 / 20.5 mA saturation, < 3.6 or > 21 mA = fault (NAMUR NE 43)'),
      p('Trip set point margin', '≥ 5–10', '% below PSV set', 'PAHH set below PSV set pressure so the SIS acts first'),
      p('Response time', '< 0.5', 's', 'including damping; keep damping low on trip transmitters'),
      p('Long-term drift', '< 0.1–0.2', '% URL / 5 yr', 'typical'),
      p('Voting (SIS)', '1oo2 or 2oo3', '', 'per SIL verification'),
    ],
    instrumentation: [
      '2- or 3-valve instrument manifold with vent / test connection',
      'HART signal to DCS (PIC / PI) and separate SIS input for PAHH / PALL',
      'Asset management system for diagnostics and calibration records',
      'Heat tracing on impulse lines in hydrate / waxy service',
    ],
    issues: [
      'Plugged or frozen impulse line (hydrates, wax, sand): reading goes flat or sluggish',
      'Manifold left closed or equalising valve open after maintenance: false steady reading',
      'Diaphragm damage or fill-fluid loss from over-pressure or corrosion: drift / offset',
      'Liquid trapped in gas impulse lines (or gas in liquid lines): offset error',
      'Water ingress into the housing or cable gland: intermittent or bad-quality signal',
      'Wrong range or damping configured after replacement: trip too slow or never reached',
    ],
    maintenance: [
      'Calibration / as-found check typically every 12–24 months (risk-based)',
      'Proof test of SIS transmitters at the interval set by the SIL calculation (commonly 12–24 months)',
      'Blow-down / flush impulse lines in dirty service, check heat tracing before winter',
      'Compare redundant transmitters continuously (deviation alarm) to catch drift',
      'Inspect Ex enclosure, glands and earthing during periodic Ex inspection (IEC 60079-17)',
    ],
    safety: [
      'Always isolate, vent and depressurise via the manifold before removing a transmitter',
      'Bypassing a trip transmitter needs a formal override / inhibit permit and compensating measures',
      'Use the correct Ex certification (Ex d or Ex ia) for the hazardous area zone',
      'Sour service requires NACE MR0175 / ISO 15156 compliant wetted parts',
    ],
    standards: ['IEC 61508 / IEC 61511 (SIS)', 'API RP 14C (safety analysis, PSH / PSL)', 'API RP 551 (process measurement)', 'NORSOK I-001 / I-002', 'NAMUR NE 43', 'IEC 60079 (Ex equipment)'],
  },
  {
    id: 'inst-pi',
    title: 'Pressure Indicator (PI)',
    summary:
      'A pressure indication point, either a local digital indicator or a DCS display-only tag, used by operators to read pressure without any control or trip function.',
    howItWorks:
      'A PI is any pressure measurement whose only job is indication. Locally it may be a loop-powered digital display or an indicating transmitter; in the control system it is the display tag of a transmitter that has no controller attached. Because it has no control action, it is often used to check equipment condition, e.g. pump discharge pressure or pressure after a regulator.',
    useCases: [
      'Local pressure indication at pump discharge, regulators and package skids',
      'Remote indication on DCS graphics for monitoring trends',
      'Field check against the control transmitter during troubleshooting',
      'Potable water and utility system pressure monitoring',
    ],
    parameters: [
      p('Normal reading', '30–70', '% of scale', 'select range so normal sits mid-scale'),
      p('Accuracy', '±0.25–1', '% of span', 'typical digital indicator'),
      p('Display update', '≤ 1', 's', ''),
      p('Over-range capability', '≥ 1.3×', 'full scale', 'should survive the system design pressure'),
    ],
    instrumentation: ['Root valve and isolation / bleed valve', 'Loop-powered display or DCS indication tag', 'Optional HART for remote diagnostics'],
    issues: [
      'Blocked tapping gives stale reading: operators trust a wrong number',
      'Display fogging or battery / loop power failure',
      'Pulsation from reciprocating equipment causing unreadable fluctuations (fit snubber)',
      'Incorrect units or range after replacement',
    ],
    maintenance: [
      'Functional check against a reference every 24–48 months',
      'Visual inspection on routine operator rounds',
      'Check isolation valves are open and tapping not blocked during PM',
    ],
    safety: [
      'Isolate and vent before removal; never break an instrument fitting under pressure',
      'Do not use an indication-only tag as a basis for overriding a trip',
      'Ensure Ex rating suits the area',
    ],
    standards: ['API RP 551', 'NORSOK I-001', 'IEC 60079 (Ex equipment)'],
  },
  {
    id: 'inst-pg',
    title: 'Pressure Gauge (PG)',
    summary:
      'A local mechanical Bourdon-tube dial gauge that gives operators an independent, power-free pressure reading at the equipment.',
    howItWorks:
      'Pressure enters a curved, flattened Bourdon tube which tends to straighten as pressure rises; a linkage and gear segment turn the pointer over a dial. Process gauges for offshore use are stainless, liquid-filled (glycerine or silicone) to damp vibration, and have a solid front with a blow-out back so that if the tube ruptures the energy vents rearwards, away from the operator. Diaphragm seals are used for viscous, corrosive or dirty service.',
    useCases: [
      'Local reading at pump suction / discharge, filters and compressor packages',
      'Verification of transmitter readings during rounds',
      'Pressure on vessels before entry or maintenance (proving zero energy)',
      'Utility systems: instrument air, nitrogen, firewater, potable water',
      'Test gauges during hydrotests and leak tests',
    ],
    parameters: [
      p('Normal reading', '1/3 to 2/3', 'of full scale', 'never above 75 % for steady pressure, 2/3 for pulsating'),
      p('Accuracy class', '1.0 (process) / 0.25 (test)', '% of span', 'EN 837-1 / ASME B40.100 grade'),
      p('Dial size', '100–160', 'mm', 'typical offshore'),
      p('Over-range protection', '1.3×', 'full scale', 'or fit an over-pressure protector'),
      p('Case', 'solid front, blow-out back', '', 'safety pattern'),
    ],
    instrumentation: ['Root valve plus gauge isolation / bleed (block and bleed) valve', 'Pulsation snubber or siphon where needed', 'Diaphragm seal in dirty or corrosive service'],
    issues: [
      'Pointer stuck or bent from over-pressure: Bourdon tube permanently deformed',
      'Fill fluid leakage or discoloured window: unreadable dial',
      'Needle flutter from pump pulsation: wears movement, fit a snubber',
      'Zero offset after mechanical shock',
      'Blocked tapping in waxy or sandy service: reads zero while line is live',
    ],
    maintenance: [
      'Check zero when isolated and calibrate / replace every 24–36 months (risk-based)',
      'Replace any gauge not returning to zero or with damaged window',
      'Verify block and bleed valves operate and are not passing',
    ],
    safety: [
      'Never stand in front of a gauge during rapid pressurisation; blow-out back protects only if fitted correctly',
      'Do not rely on a gauge reading zero to prove isolation; vent and check via the bleed',
      'Use the correct gauge material and range for the service (e.g. oxygen-clean or sour service)',
    ],
    standards: ['EN 837-1 / -3', 'ASME B40.100', 'NACE MR0175 / ISO 15156 (sour service)', 'NORSOK I-001'],
  },
  // ───────────────────────────── temperature ─────────────────────────────
  {
    id: 'inst-tt',
    title: 'Temperature Transmitter (TT)',
    summary:
      'An RTD (Pt100) sensor in a thermowell with a head-mounted transmitter, sending temperature as 4–20 mA / HART to the DCS or SIS.',
    howItWorks:
      'A platinum resistance element (Pt100, 100 ohm at 0 °C, IEC 60751 Class A or B) changes resistance with temperature. A 3- or 4-wire connection removes lead resistance error and the transmitter converts it to a linear signal. The sensor sits inside a solid-drilled thermowell welded or flanged into the pipe, so it can be withdrawn without breaking containment. Thermowells must be checked for wake-frequency (vortex-induced) vibration at maximum flow per ASME PTC 19.3 TW. Thermocouples (type K) are used for high temperatures such as gas turbine exhaust.',
    useCases: [
      'Cooler outlet temperature control (TIC to cooling-medium TCV)',
      'Compressor discharge high-temperature trip (TAHH)',
      'Hydrate / wax margin monitoring on flowlines and separator inlets',
      'TEG reboiler and still column temperature',
      'Bearing and winding temperatures on pumps, compressors and motors',
    ],
    parameters: [
      p('Sensor accuracy', '±(0.15 + 0.002|t|)', '°C', 'IEC 60751 Class A'),
      p('Transmitter accuracy', '±0.1–0.2', '°C', 'typical'),
      p('Response time (in thermowell)', '10–60', 's', 'T63; depends on well design and spring-loaded tip contact'),
      p('Thermowell immersion', 'tip in central 1/3 of pipe', '', 'minimum ~ 50 mm, avoid excessive length'),
      p('Wake frequency ratio', '< 0.8', 'fs / fn', 'ASME PTC 19.3 TW-2016 in-line resonance limit'),
      p('Normal reading', '30–70', '% of span', ''),
    ],
    instrumentation: ['Solid-drilled thermowell with flanged connection', 'Head-mounted or remote HART transmitter', 'Test thermowell next to custody / critical points', 'SIS input for TAHH'],
    issues: [
      'Thermowell fatigue failure from vortex shedding: loss of containment',
      'Poor sensor-to-well contact (no spring loading): slow, low reading',
      'Open-circuit or broken RTD: transmitter drives to upscale / downscale burnout',
      'Fouling or wax build-up on the thermowell: lag in reading',
      'Moisture in terminal head: ground faults and noise',
    ],
    maintenance: [
      'Loop check / calibration every 24–36 months; sensor comparison with test thermometer',
      'Proof test TAHH functions per SIL interval',
      'Inspect thermowell for erosion / corrosion at turnaround in sandy service',
      'Check head seals and cable glands during Ex inspection',
    ],
    safety: [
      'Never remove a thermowell under pressure; only the sensor insert is removable live',
      'Wake-frequency calculation must be redone if flow rates increase',
      'Hot surfaces: piping may exceed 60 °C touch limit',
    ],
    standards: ['ASME PTC 19.3 TW', 'IEC 60751 (RTD)', 'IEC 60584 (thermocouples)', 'API RP 551', 'IEC 61511', 'NORSOK I-001'],
  },
  {
    id: 'inst-tg',
    title: 'Temperature Gauge (TG)',
    summary: 'A local bimetallic dial thermometer in a thermowell, giving operators a power-free temperature reading at the equipment.',
    howItWorks:
      'A helical bimetal strip (two metals with different expansion coefficients) inside the stem twists as temperature changes and rotates the pointer directly. The stem sits in a thermowell so it can be removed live. "Every-angle" heads let the dial face the walkway. Gas-filled (capillary) thermometers are used where the dial must be remote from the measurement point.',
    useCases: [
      'Local cooler inlet / outlet temperature checks on rounds',
      'Pump and compressor lube oil temperature',
      'Utility heat exchangers (cooling medium, seawater)',
      'Cross-check of a temperature transmitter',
    ],
    parameters: [
      p('Accuracy', '±1', '% of full scale', 'EN 13190 class 1, typical'),
      p('Normal reading', '1/3 to 2/3', 'of scale', ''),
      p('Dial size', '100–150', 'mm', ''),
      p('Response time', '30–90', 's', 'in thermowell'),
    ],
    instrumentation: ['Thermowell (shared design rules with TT)', 'Adjustable every-angle head'],
    issues: [
      'Pointer stuck or off-zero after over-temperature',
      'Fogged or cracked window from thermal shock or sun',
      'Stem not bottomed in the thermowell: reads low and slow',
      'Vibration-induced wear of the pointer',
    ],
    maintenance: ['Compare with calibrated reference every 24–36 months', 'Replace damaged or unreadable gauges', 'Add heat-transfer paste in the well where specified'],
    safety: ['Remove only the stem, never the thermowell, with the line live', 'Hot surface burn risk when reading close to uninsulated piping', 'A cracked or eroded thermowell is a pressure boundary failure; report any weep at the thermowell connection immediately'],
    standards: ['EN 13190', 'ASME B40.200', 'ASME PTC 19.3 TW (thermowell)', 'NORSOK I-001'],
  },
  // ───────────────────────────── level ─────────────────────────────
  {
    id: 'inst-lt',
    title: 'Level Transmitter (LT)',
    summary:
      'Measures liquid or oil/water interface level in separators, scrubbers, drums and tanks and sends it to the DCS for level control and to the SIS for LAHH / LALL trips.',
    howItWorks:
      'Several technologies are used. Differential pressure (DP) transmitters infer level from hydrostatic head between a bottom and top tapping, compensated for density. Guided-wave radar (GWR) sends a microwave pulse down a probe in a bridle and times the reflection from the surface (and from the interface with a second, weaker echo). Displacers sense the buoyancy change of a float element and are still common for interface. Nucleonic profilers are used for difficult emulsion / foam. On atmospheric tanks a non-contact radar gives % level. The level signal feeds a controller that throttles the liquid outlet valve (LV) to hold level in band.',
    useCases: [
      'Separator oil level and oil/water interface control',
      'Scrubber and KO drum liquid level with LAHH to prevent carryover to compressors / flare',
      'Low-low level trip to prevent gas blow-by into downstream liquid systems',
      'Closed drain, diesel and potable water tank level (% or m³)',
      'TEG contactor sump level control to regeneration',
    ],
    parameters: [
      p('Normal liquid level (NLL)', '40–60', '% of span', 'typical; set between LAL and LAH'),
      p('Alarm / trip bands', 'LALL 10, LAL 20, LAH 80, LAHH 90', '%', 'typical; plant uses these values on tanks'),
      p('Accuracy (GWR)', '±3–5', 'mm', 'typical'),
      p('Accuracy (DP)', '±0.1', '% span', 'plus density uncertainty'),
      p('Interface detection', '≥ 0.1', 'SG difference', 'needed for GWR / DP interface'),
      p('Control response', '3–10', 'min', 'averaging level control on separators to smooth outlet flow'),
    ],
    instrumentation: [
      'External bridle / standpipe shared with the magnetic level gauge',
      'Independent LT for SIS (LAHH / LALL), separate from control LT',
      'Level control valve (LV) on the liquid outlet',
      'Heat tracing on bridles in waxy service',
    ],
    issues: [
      'Foam or emulsion layer giving false surface: level reads high / unstable',
      'Density change (water cut, temperature) causing DP level errors',
      'Wax, sand or scale build-up on the GWR probe or displacer: stuck or drifting reading',
      'Plugged bridle nozzles: level in bridle no longer represents vessel',
      'Interface lost in thick emulsion: water carryover to oil outlet or oil to water',
    ],
    maintenance: [
      'Compare LT against magnetic level gauge each shift / on rounds',
      'Flush bridles and check isolation valves every 6–12 months in dirty service',
      'Proof test LAHH / LALL per SIL interval (often 12 months)',
      'Re-verify density configuration after changes in field fluids',
    ],
    safety: [
      'LAHH on scrubbers protects compressors from liquid slugs; never inhibit without a permit',
      'LALL prevents gas blow-by to low-pressure systems (overpressure risk)',
      'Isolate and drain bridles via closed drain, never to open deck',
      'Nucleonic gauges need radiation protection controls and licensing',
    ],
    standards: ['API RP 14C (LSH / LSL)', 'IEC 61511', 'API RP 551', 'NORSOK I-001 / P-002', 'IEC 60079 (Ex)'],
  },
  {
    id: 'inst-lg',
    title: 'Level Gauge (LG)',
    summary: 'A local magnetic (or reflex glass) level gauge that shows the operator the actual liquid level in a vessel without any power.',
    howItWorks:
      'A magnetic level gauge has a non-magnetic chamber (bridle) connected to the vessel top and bottom. A float with a magnet rides at the liquid surface (or at the interface if its density is between oil and water) and flips coloured flaps or a follower on the outside indicator. Reflex or transparent glass gauges show the liquid directly but are vulnerable to breakage, so magnetic gauges are standard offshore. Gauges often carry switches or a transmitter on the same chamber.',
    useCases: [
      'Visual confirmation of separator / scrubber / drum level on rounds',
      'Verification of LT readings during troubleshooting',
      'Level checks during start-up when transmitters may be unreliable',
      'Tank contents gauging on utility tanks',
    ],
    parameters: [
      p('Float SG margin', '≥ 0.1', '', 'float density must differ from the fluid to track surface / interface'),
      p('Visible range', 'covers LALL to LAHH', '', 'plus margin above and below'),
      p('Agreement with LT', '± 2–5', '% span', 'investigate if larger'),
      p('Design pressure', '≥ vessel design', 'barg', ''),
    ],
    instrumentation: ['Top and bottom isolation valves and drain / vent', 'Clamp-on level switches or GWR in the same chamber', 'Heat tracing in waxy service'],
    issues: [
      'Float stuck from wax, sand or scale: gauge shows a frozen level',
      'Flaps flipped by vibration or external magnet: false indication',
      'Plugged connection nozzles: gauge does not follow vessel',
      'Float collapsed by over-pressure or wrong density float fitted',
    ],
    maintenance: [
      'Blow down / flush chamber periodically in dirty service',
      'Reset flaps with a magnet and verify float movement during PM (6–12 months)',
      'Inspect float and chamber at vessel turnaround',
    ],
    safety: [
      'Drain gauge chamber to closed drain only',
      'Glass gauges need guards and ball-check valves to limit release if broken',
      'Do not rely solely on the gauge to declare a vessel empty before entry',
    ],
    standards: ['API RP 551', 'NORSOK I-001', 'ASME B31.3 (chamber piping)', 'PED / ASME VIII (pressure chamber)'],
  },
  // ───────────────────────────── flow ─────────────────────────────
  {
    id: 'inst-ft-gas',
    title: 'Gas Flow Transmitter (FT, gas)',
    summary:
      'Measures gas flow rate (typically MMscfd) using an orifice plate and DP transmitter for process use, or an ultrasonic meter for fiscal / export metering.',
    howItWorks:
      'An orifice plate creates a pressure drop proportional to the square of flow; a DP transmitter with pressure and temperature compensation computes standard volume flow per ISO 5167 in the flow computer or DCS. Beta ratio (bore / pipe ID) is kept between about 0.2 and 0.75 with adequate straight runs or a flow conditioner. Multipath ultrasonic meters time sound pulses with and against the flow to give velocity directly, with low pressure loss and wide turndown, and are the standard for fiscal gas export metering with a gas chromatograph for composition.',
    useCases: [
      'Export gas metering (fiscal / custody transfer)',
      'Separator and test separator gas rate for well testing and allocation',
      'Compressor anti-surge flow measurement',
      'Fuel gas consumption to turbines and flare gas metering',
      'Gas lift injection rate per well',
    ],
    parameters: [
      p('Orifice beta ratio', '0.2–0.75', '', 'ISO 5167-2 limits'),
      p('Orifice DP at max flow', '250–500', 'mbar', 'typical design'),
      p('Turndown (orifice)', '3:1 to 4:1', '', 'per DP transmitter; use stacked DP for wider'),
      p('Uncertainty (fiscal ultrasonic)', '≤ ±1.0', '% of mass', 'typical fiscal requirement'),
      p('Uncertainty (process orifice)', '±1–2', '% of rate', ''),
      p('Straight run', '10–30 D upstream', '', 'or flow conditioner'),
    ],
    instrumentation: ['DP transmitter plus PT and TT for compensation', 'Flow computer and gas chromatograph (fiscal)', 'Senior orifice fitting for plate change under pressure', 'Anti-surge controller input'],
    issues: [
      'Orifice plate edge erosion or reversed plate: under-reading',
      'Liquid carryover into gas meter: over-reading and wet-gas error',
      'Ultrasonic transducer fouling or path failure: reduced accuracy',
      'Wrong gas composition or density in flow computer',
      'Impulse line plugging or hydrates on DP cells',
    ],
    maintenance: [
      'Orifice plate inspection every 6–12 months (fiscal) for edge sharpness and flatness',
      'Ultrasonic meter diagnostic review (speed of sound, path gains) monthly',
      'DP / PT / TT calibration per metering regulation (often 3–6 monthly for fiscal)',
      'Flow computer audit and GC calibration with certified gas',
    ],
    safety: [
      'Senior fitting plate changes must follow the procedure; never open with pressure in the upper chamber',
      'Anti-surge flow signals are safety-related to the compressor; test after maintenance',
      'Gas sampling and GC carrier gas cylinders require handling controls',
    ],
    standards: ['ISO 5167-1/-2', 'AGA 3 / AGA 9 (ultrasonic)', 'ISO 17089-1', 'NORSOK I-106 (fiscal metering)', 'API MPMS Ch. 14', 'OIML R 137'],
  },
  {
    id: 'inst-ft-liquid',
    title: 'Liquid Flow Transmitter (FT, liquid)',
    summary:
      'Measures oil, water or chemical flow (m³/h or m³/d) using orifice plates, Coriolis mass meters or electromagnetic meters depending on fluid and accuracy needed.',
    howItWorks:
      'Orifice plates with DP transmitters are robust and cheap for process duty. Coriolis meters vibrate measuring tubes and detect the phase shift caused by mass flow, giving direct mass flow and density (hence water cut estimation) with high accuracy, so they are used on test separators and oil export. Magnetic flowmeters measure the voltage induced in a conductive liquid (water, not oil) moving through a magnetic field and suit produced water and seawater. Small chemical injection rates use positive displacement or thermal mass meters.',
    useCases: [
      'Oil export and allocation metering (Coriolis or turbine / ultrasonic fiscal)',
      'Test separator oil and water rates for well tests',
      'Produced water overboard and reinjection flow',
      'Cooling medium and seawater circulation flow',
      'Chemical injection rate verification at each point',
      'Pump minimum-flow recycle control',
    ],
    parameters: [
      p('Coriolis accuracy', '±0.1–0.2', '% of rate', 'typical liquid mass'),
      p('Magmeter accuracy', '±0.2–0.5', '% of rate', 'conductivity > 5 µS/cm'),
      p('Orifice accuracy', '±1–2', '% of rate', ''),
      p('Velocity in meter', '1–5', 'm/s', 'typical design range'),
      p('Pump minimum flow', '≥ 20–30', '% of BEP', 'set point for recycle'),
    ],
    instrumentation: ['Coriolis / magmeter / orifice + DP cell', 'Flow computer or DCS totaliser', 'Prover or master meter connections for fiscal oil', 'Minimum-flow control valve on pumps'],
    issues: [
      'Gas entrainment in liquid: Coriolis density and flow errors',
      'Wax or scale coating on tubes / electrodes: drift',
      'Erosion of orifice edge by sand: under-reading',
      'Zero shift on Coriolis due to stress or temperature',
      'Empty-pipe or partially filled conditions on magmeters',
    ],
    maintenance: [
      'Zero verification of Coriolis meters at no-flow, 3–6 monthly',
      'Meter proving for fiscal oil per regulation (often monthly)',
      'Orifice plate inspection 12 monthly',
      'Electrode cleaning on magmeters in scaling service',
    ],
    safety: [
      'Isolate, drain and depressurise before removing an in-line meter',
      'Low-flow trips on pumps protect from overheating; keep them functional',
      'Chemicals (methanol, biocide) require PPE during meter work',
    ],
    standards: ['ISO 5167', 'ISO 10790 (Coriolis)', 'API MPMS Ch. 5 / Ch. 6', 'NORSOK I-106', 'OIML R 117'],
  },
  {
    id: 'inst-pdt',
    title: 'Differential Pressure Transmitter (PDT)',
    summary:
      'Measures the pressure difference across a filter, strainer, mesh pad, exchanger or hydrocyclone to indicate fouling or control a pressure-differential ratio.',
    howItWorks:
      'A DP cell with high- and low-pressure sides connected to tappings upstream and downstream of the item reports the difference. On filters the rising dP shows clogging; on hydrocyclones two DP readings (inlet–reject and inlet–water outlet) form the pressure differential ratio (PDR), the controlled variable that sets reject flow and separation efficiency. On scrubbers a rising mesh pad dP warns of fouling or flooding.',
    useCases: [
      'Pump suction strainer and filter fouling alarms',
      'Hydrocyclone PDR control (typical PDR 1.6–2.0)',
      'Demister / vane pack dP on scrubbers and contactors',
      'Heat exchanger fouling trend',
      'Fuel gas filter / coalescer change-out timing',
    ],
    parameters: [
      p('Clean filter dP', '0.1–0.3', 'bar', 'typical; change-out at 1.0 bar or vendor limit'),
      p('Hydrocyclone PDR', '1.6–2.0', '', 'ratio of the two DPs, typical'),
      p('Hydrocyclone inlet-to-overflow dP', '2–6', 'bar', 'typical; plant nominal 2.1 bar'),
      p('Mesh pad dP', '< 5–10', 'mbar', 'clean; rising trend indicates fouling'),
      p('Static pressure rating', '≥ system design', 'barg', 'cell must withstand line pressure on both sides'),
    ],
    instrumentation: ['5-valve manifold with equalising valve', 'Paired PDTs for hydrocyclone PDR controller', 'PDV / reject valve on hydrocyclone overflow'],
    issues: [
      'Equalising valve left open: reads zero',
      'One impulse leg plugged: reading drifts or goes negative',
      'Over-range from one-sided pressurisation damages the cell',
      'Filter bypass or collapsed element: dP falls unexpectedly',
    ],
    maintenance: [
      'Zero check with equalising valve, every 6–12 months',
      'Calibrate 24 monthly',
      'Trend dP to plan filter change-outs and exchanger cleaning',
    ],
    safety: [
      'Follow manifold valve sequence (equalise first) to avoid over-ranging',
      'Filter change-out requires isolation, depressurisation and gas-free check',
      'Pyrophoric iron sulphide on sour filter elements can ignite in air: keep wet',
    ],
    standards: ['API RP 551', 'NORSOK I-001', 'IEC 60079 (Ex)'],
  },
  // ───────────────────────────── analysers ─────────────────────────────
  {
    id: 'inst-at-h2s',
    title: 'H₂S Detector / Analyser',
    summary:
      'Measures hydrogen sulphide concentration in ppm, either in ambient air (toxic gas detection at the rotary table, shakers or process modules) or in the process stream.',
    howItWorks:
      'Fixed ambient detectors use electrochemical cells or metal-oxide-semiconductor sensors that produce a signal proportional to H₂S concentration. They are placed low to medium height near likely release points since H₂S is heavier than air. Alarms at the plant are typically 10 ppm (low, warning) and 20 ppm (high) and drive beacons and sounders and, on drilling, muster to upwind safe briefing areas. Process H₂S analysers use lead-acetate tape or UV / TDLAS spectroscopy to monitor gas quality.',
    useCases: [
      'Drill floor / rotary table monitoring during drilling into sour zones',
      'Shale shaker and mud pit room: H₂S released from returning mud',
      'Process modules on sour fields',
      'Export / fuel gas H₂S quality monitoring',
      'Produced water degasser and tank vents',
    ],
    parameters: [
      p('Alarm 1 (low)', '10', 'ppm', 'plant setting; typical first alarm'),
      p('Alarm 2 (high)', '20', 'ppm', 'plant setting; general alarm / muster'),
      p('Normal background', '< 1', 'ppm', 'plant nominal 0.2–0.4 ppm'),
      p('Response time T90', '< 30', 's', 'electrochemical, typical'),
      p('Measuring range', '0–50 or 0–100', 'ppm', ''),
      p('Sensor life', '2–3', 'years', 'electrochemical cells, typical'),
    ],
    instrumentation: ['Fire and gas panel inputs with beacons and sounders', 'Portable personal H₂S monitors (worn on drill floor)', 'Breathing air cascade / escape sets at work locations', 'Wind sock for muster direction'],
    issues: [
      'Sensor poisoning or drying in hot / dry environments: loss of sensitivity',
      'Cross-sensitivity to other gases (SO₂, mercaptans): nuisance alarms',
      'Mud spray or water blocking the sensor head',
      'Sensor not replaced at end of life: fails to detect',
    ],
    maintenance: [
      'Bump test with known concentration monthly (or as F&G philosophy)',
      'Full calibration every 3–6 months',
      'Replace electrochemical cells per vendor life (2–3 years)',
      'Check weather / splash guards regularly',
    ],
    safety: [
      'H₂S is lethal above ~ 500–700 ppm and paralyses sense of smell above ~ 100 ppm',
      'On alarm, move upwind to the safe briefing area and don breathing apparatus',
      'Never enter a confined space without H₂S gas test and permit',
      'Sour service drilling requires H₂S contingency plan and drills',
    ],
    standards: ['API RP 49 (drilling with H₂S)', 'API RP 55', 'IEC 60079-29-1 / EN 45544 (toxic detection)', 'NORSOK S-001', 'ISO 13702'],
  },
  {
    id: 'inst-at-oiw',
    title: 'Oil-in-Water Analyser (AT, OiW)',
    summary:
      'On-line analyser that measures dispersed oil concentration in produced water before discharge overboard, to demonstrate compliance with discharge limits.',
    howItWorks:
      'Most offshore OiW monitors use UV fluorescence: aromatic compounds in the oil fluoresce when excited by UV light and the emitted intensity is proportional to oil concentration. Others use light scattering or image analysis. The analyser takes a side-stream sample from the produced water caisson line, with automatic window cleaning, and is correlated against laboratory reference measurements (OSPAR reference method GC-FID, ISO 9377-2).',
    useCases: [
      'Compliance monitoring of produced water discharge overboard',
      'Performance monitoring of hydrocyclones and degasser',
      'Early warning of separator interface upsets',
      'Optimising demulsifier / flocculant chemical dosing',
    ],
    parameters: [
      p('Discharge limit', '30', 'mg/l', 'OSPAR monthly average, typical regulatory limit'),
      p('Normal reading', '10–20', 'ppm', 'plant nominal 14'),
      p('High alarm', '29', 'ppm', 'plant setting'),
      p('High-high alarm', '40', 'ppm', 'plant setting: consider diverting to reinjection / slop'),
      p('Correlation to lab', '± 10–20', '%', 'checked monthly typical'),
    ],
    instrumentation: ['Sample conditioning and auto-cleaning window', 'Hydrocyclone PDR control', 'Produced water flow meter for mass discharge', 'Lab GC-FID reference sampling'],
    issues: [
      'Window fouling by oil, scale or biofilm: drift high or low',
      'Gas bubbles in sample: scattering errors',
      'Change in crude aromatic content: fluorescence correlation shifts',
      'Sample line blockage: stale reading',
    ],
    maintenance: [
      'Weekly window clean check and validation',
      'Monthly correlation with lab reference samples',
      'Annual vendor service and calibration',
    ],
    safety: [
      'Produced water can contain H₂S, benzene and NORM: use PPE',
      'Excursions must be reported to the regulator per permit',
      'UV source and electrical components are Ex rated',
    ],
    standards: ['OSPAR Recommendation 2001/1 (amended)', 'ISO 9377-2', 'OSPAR Agreement 2005-15 (reference method)', 'NORSOK I-001'],
  },
  {
    id: 'inst-at-dewpoint',
    title: 'Gas Water Dew Point Analyser (AT)',
    summary:
      'Continuously measures the water dew point of the dried gas downstream of the TEG contactor to prove the gas meets export / pipeline specification.',
    howItWorks:
      'A conditioned sample of dry gas flows over a sensor: typically a chilled-mirror (direct dew point), aluminium oxide or quartz crystal microbalance hygrometer, or a tunable diode laser (TDLAS) measuring water content directly. The result is reported as dew point at line pressure, or converted to a reference pressure. Hydrocarbon dew point (cricondentherm) is sometimes measured by a separate chilled-mirror analyser to confirm no liquid hydrocarbons drop out in the pipeline.',
    useCases: [
      'Export gas water dew point compliance (pipeline specification)',
      'TEG dehydration performance monitoring (lean TEG purity, circulation)',
      'Hydrate risk management in export pipelines',
      'Fuel gas quality to turbines (with hydrocarbon dew point)',
    ],
    parameters: [
      p('Water dew point spec', '≤ −18', '°C', 'plant spec at export pressure; contracts vary'),
      p('Normal reading', '−18 to −25', '°C', 'typical with lean TEG ≥ 99 wt %'),
      p('High alarm', '−10', '°C', 'plant setting'),
      p('Water content equivalent', '< 60–100', 'mg/Sm³', 'typical pipeline spec'),
      p('Accuracy', '±1–2', '°C dew point', 'chilled mirror / TDLAS'),
    ],
    instrumentation: ['Heated sample line and conditioning system', 'TEG contactor and regeneration instrumentation (reboiler temperature, lean TEG flow)', 'Export gas metering / GC'],
    issues: [
      'Glycol carryover contaminating the sensor: slow response / high reading',
      'Sample line condensation or leak: false wet or dry reading',
      'Sensor drift (aluminium oxide): needs regular verification',
      'Poor lean TEG concentration or low circulation: real dew point excursion',
    ],
    maintenance: [
      'Verify against portable chilled mirror monthly',
      'Replace sample filters and check for glycol monthly',
      'Calibrate / recertify sensor annually',
    ],
    safety: [
      'Sample system carries high-pressure gas; isolate and vent before work',
      'Off-spec gas may form hydrates in export line: notify control room',
      'Analyser house requires gas detection and ventilation',
    ],
    standards: ['ISO 6327', 'ISO 18453', 'ISO 23874 (hydrocarbon dew point)', 'ISO 10715 (gas sampling)', 'NORSOK I-001'],
  },
  {
    id: 'inst-at-air-dewpoint',
    title: 'Instrument Air Dew Point Analyser (AT)',
    summary: 'Monitors the pressure dew point of instrument air at the dryer outlet to prevent water in the air system that would corrode or freeze valve actuators.',
    howItWorks:
      'A thin-film polymer or aluminium oxide capacitive sensor in the dryer outlet line senses moisture and reports pressure dew point. Desiccant dryers alternate between drying and regeneration towers; a rising dew point shows saturated desiccant, failed purge or a switching valve fault.',
    useCases: [
      'Instrument air dryer performance monitoring',
      'Protecting control valve and ESDV actuators from moisture',
      'Nitrogen generation feed air quality',
      'Compressor package health monitoring',
    ],
    parameters: [
      p('Pressure dew point', '≤ −40', '°C', 'ISO 8573-1 class 2 typical spec; plant nominal −42'),
      p('High alarm', '−30', '°C', 'plant setting'),
      p('Air pressure', '7–9', 'barg', 'typical header'),
      p('Accuracy', '±2–3', '°C dew point', ''),
    ],
    instrumentation: ['Desiccant dryer with tower switching valves', 'Instrument air receiver pressure transmitter', 'Oil carry-over indicator on compressor outlet'],
    issues: [
      'Desiccant saturated or contaminated with oil: dew point rises',
      'Tower switching valve stuck: no regeneration',
      'Sensor drift over time',
      'Wet air reaching actuators: corrosion, ice in cold weather, sticking valves',
    ],
    maintenance: ['Check sensor against portable meter every 6 months', 'Replace desiccant per vendor (3–5 years)', 'Calibrate annually'],
    safety: [
      'Instrument air is a safety-critical utility: low pressure causes fail-safe trips',
      'Depressurise dryer towers before opening',
      'Never use instrument air for breathing',
    ],
    standards: ['ISO 8573-1', 'ISA-7.0.01', 'NORSOK P-002'],
  },
  {
    id: 'inst-at-mudgas',
    title: 'Mud Gas Detector (Gas Trap)',
    summary:
      'Mud-logging gas trap at the shakers that extracts gas from the returning drilling mud and reports total gas in "gas units", an early indicator of formation gas entering the well.',
    howItWorks:
      'An agitator in the possum belly or flow line degasses a constant volume of returning mud. The released gas is drawn by vacuum line to the mud-logging unit where a flame ionisation detector or catalytic sensor reports total hydrocarbons in gas units, and a chromatograph splits C1–C5. Background gas is the steady level while drilling; connection and trip gas are spikes when pumps stop and swab occurs. A rising background is a warning of underbalance.',
    useCases: [
      'Kick and underbalance early warning while drilling',
      'Formation evaluation: identifying hydrocarbon-bearing zones',
      'Monitoring connection and trip gas to judge mud weight margin',
      'Correlation with H₂S monitoring at the shakers',
    ],
    parameters: [
      p('Background gas', '< 2', 'gas units', 'typical; plant nominal 0.8'),
      p('High alarm', '5', 'gas units', 'plant setting'),
      p('High-high alarm', '15', 'gas units', 'plant setting: notify driller, consider flow check'),
      p('Lag time', 'bottoms-up time', 'min', 'gas reading lags the bit by the annular travel time'),
      p('Trap level', 'constant immersion', '', 'variable immersion gives misleading readings'),
    ],
    instrumentation: ['Mud logging unit (FID total gas, chromatograph)', 'H₂S sensors at shakers and rotary', 'Pit volume totaliser and flow-out sensor', 'Standpipe pressure'],
    issues: [
      'Trap immersion changes with flow rate: false rise or fall',
      'Gas line blocked or leaking: under-reading',
      'Oil-based mud gas solubility masking kicks',
      'Recycled gas from mud returning to the well',
    ],
    maintenance: [
      'Calibrate FID / chromatograph with standard gas each well section or per logging contractor',
      'Check vacuum line and trap motor daily',
      'Clean trap of cuttings regularly',
    ],
    safety: [
      'Rising gas plus pit gain or flow-out increase = possible kick: perform flow check and shut in if flowing',
      'Shaker area may contain flammable gas and H₂S: gas detection and ventilation required',
      'Keep ignition sources away from the shaker / degasser area',
    ],
    standards: ['API RP 59 (well control operations)', 'IADC Well Control guidelines', 'NORSOK D-010', 'API RP 49 (H₂S)'],
  },
  {
    id: 'inst-at',
    title: 'Process Analyser (AT)',
    summary: 'A generic on-line analyser measuring a fluid property or composition, gas quality, moisture, oxygen, pH, sulphur or water cut, for control, quality or environmental compliance.',
    howItWorks:
      'Analysers take a sample through a sample conditioning system (filtering, pressure reduction, heating) to an instrument such as a gas chromatograph, infrared or laser spectrometer, oxygen cell, pH probe or water-cut meter. Results go to the DCS as 4–20 mA or Modbus. Analysers are housed in ventilated, gas-detected analyser houses or field enclosures.',
    useCases: [
      'Gas composition and calorific value for fiscal metering',
      'Water cut on oil export',
      'Oxygen content in flare / blanket gas',
      'pH and chlorine in seawater treatment',
      'Environmental emissions monitoring',
    ],
    parameters: [
      p('Sample lag time', '< 60', 's', 'typical target'),
      p('Availability', '≥ 95', '%', 'typical target'),
      p('Validation frequency', 'weekly to monthly', '', 'with certified standard'),
      p('Accuracy', 'per application', '', 'see vendor data'),
    ],
    instrumentation: ['Sample probe and conditioning system', 'Analyser house with HVAC and gas detection', 'Calibration gas cylinders / standards'],
    issues: [
      'Sample system blockage or leak: stale or wrong reading',
      'Calibration drift',
      'Contamination of the sensor (glycol, oil, water)',
      'Long sample lag making control sluggish',
    ],
    maintenance: ['Routine validation with standards', 'Filter changes in sample system', 'Annual vendor service'],
    safety: [
      'Sample lines carry process fluid at pressure: isolate before maintenance',
      'Calibration gas cylinders must be secured and stored correctly',
      'Analyser houses can accumulate gas: check detectors before entry',
    ],
    standards: ['ISO 10715 (gas sampling)', 'IEC 61285 (analyser houses)', 'API RP 555 (process analysers)', 'NORSOK I-001'],
  },
  // ───────────────────────────── fire & gas ─────────────────────────────
  {
    id: 'inst-fd',
    title: 'Flame Detector (IR3)',
    summary:
      'Triple-infrared optical flame detector that senses the characteristic CO₂ emission flicker of hydrocarbon fires and signals the fire and gas system within seconds.',
    howItWorks:
      'Three IR sensors look at the 4.3 µm CO₂ emission band and two reference bands. A real hydrocarbon fire produces strong 4.3 µm radiation that flickers at 1–10 Hz, while sunlight, hot surfaces and arc welding do not match the ratio and flicker pattern, giving high false-alarm immunity. Each detector covers a cone (about 90° horizontal field of view) and range is quoted for a standard n-heptane pan fire. Detectors are mapped so that critical areas are seen by at least two detectors and executive actions (ESD, deluge) use 2ooN voting.',
    useCases: [
      'Process modules: separators, compressors, pumps and wellhead area',
      'Gas turbine enclosures and generator areas',
      'Drill floor and well bay',
      'Helideck and fuel storage areas',
      'Flare KO drum and riser areas',
    ],
    parameters: [
      p('Field of view', '~ 90', '° cone', 'horizontal, typical; sensitivity falls off at edges'),
      p('Detection range', '~ 60', 'm', '0.1 m² n-heptane pan fire, high sensitivity, typical'),
      p('Response time', '< 5–10', 's', 'typical to alarm'),
      p('Voting for executive action', '2ooN', '', 'one detector = alarm, two = confirmed fire / deluge'),
      p('Coverage target', '≥ 90', '% of area seen by 2 detectors', 'mapping target, typical'),
      p('Window cleanliness', 'clean, built-in optical test OK', '', 'self-test monitors window'),
    ],
    instrumentation: ['Fire and gas logic solver with cause and effect matrix', 'Deluge valves and firewater pumps', 'Beacons and PA / GA alarms', 'CCTV for confirmation'],
    issues: [
      'Window contaminated by salt, oil mist or ice: reduced range, "dirty window" fault',
      'Detector knocked out of alignment: area no longer covered',
      'Obstructions added after mapping (scaffold, new equipment): blind spots',
      'Spurious alarm from flare radiation or hot work if poorly located',
    ],
    maintenance: [
      'Functional test with an IR test lamp every 6–12 months (or per SIL proof test interval)',
      'Window cleaning every 3–6 months offshore',
      'Re-check coverage mapping after any layout change',
      'Inhibit via F&G panel during testing with a permit',
    ],
    safety: [
      'Fire detection triggers ESD, blowdown and deluge: inhibits must be controlled',
      'Hot work near detectors needs inhibit and fire watch rather than covering detectors',
      'Detectors are safety-critical elements with performance standards',
    ],
    standards: ['EN 54-10', 'FM 3260', 'IEC 61508 / 61511', 'ISO 13702', 'NORSOK S-001', 'NFPA 72'],
  },
  {
    id: 'inst-gd',
    title: 'Point Gas Detector (IR, %LEL)',
    summary:
      'Infrared point detector that measures flammable hydrocarbon gas concentration as % of the lower explosive limit and raises alarms or initiates ESD and ignition-source isolation.',
    howItWorks:
      'Gas diffuses into an optical cell where hydrocarbons absorb IR at about 3.3 µm. Comparing the absorption against a reference wavelength gives concentration, calibrated against methane (or a target gas) as %LEL. IR detectors are immune to poisoning (unlike catalytic beads) and fail safe on obscured optics. Detectors are placed near potential leak sources and at ventilation inlets of rooms (HVAC intakes), with heads pointing down and weather / splash guards fitted.',
    useCases: [
      'Process areas near flanges, valves, compressors and pumps',
      'HVAC air intakes to LER, CCR and accommodation (shut dampers on gas)',
      'Gas turbine enclosures',
      'Wellhead area and drill floor',
      'Analyser houses',
    ],
    parameters: [
      p('Low alarm', '20', '% LEL', 'typical (10 % LEL at HVAC intakes)'),
      p('High alarm / action', '60', '% LEL', 'typical; 2ooN voting for ESD'),
      p('Response time T90', '< 10', 's', 'with weather protection, typical'),
      p('Measuring range', '0–100', '% LEL', ''),
      p('Accuracy', '±3', '% LEL', 'at 0–50 % LEL, typical'),
      p('Normal reading', '0', '% LEL', 'anything sustained above 3–5 % should be investigated'),
    ],
    instrumentation: ['Fire and gas system logic (cause and effect)', 'HVAC damper closure and ignition source isolation', 'Beacons, sounders, PA', 'Calibration gas and test hood'],
    issues: [
      'Optics contaminated by water, salt or oil: beam block fault',
      'Detector located where gas cannot reach it (wrong height for the gas density)',
      'Calibration against methane while leak gas is heavier: under-reading',
      'Weather protection missing or blocked: slow response',
    ],
    maintenance: [
      'Bump test with calibration gas monthly to quarterly per F&G philosophy',
      'Full calibration every 6–12 months',
      'Clean optics and check weather guards during rounds',
      'Proof test with gas per SIL interval',
    ],
    safety: [
      'Gas detection initiates ESD, ignition source isolation and HVAC shutdown: inhibits under permit only',
      'On high gas alarm, follow muster instructions and avoid ignition sources',
      'Do not mask detectors with plastic during work',
    ],
    standards: ['IEC 60079-29-1 / -2', 'EN 50271 (SIL)', 'ISO 13702', 'NORSOK S-001', 'IEC 61511', 'API RP 14C / API RP 14G'],
  },
  {
    id: 'inst-ogd',
    title: 'Open-Path Gas Detector (LEL·m)',
    summary:
      'An infrared beam between a transmitter and receiver that detects flammable gas clouds anywhere along a path of up to about 100–200 m, reported as LEL·metres.',
    howItWorks:
      'An IR source sends a beam to a receiver; hydrocarbons in the path absorb specific wavelengths. The integrated absorption gives concentration multiplied by cloud width (LEL·m). A 1 LEL·m reading could be a 1 m cloud at 100 % LEL or 10 m at 10 % LEL. They are ideal for perimeters, along pipe racks and module boundaries where point detectors would need many heads.',
    useCases: [
      'Perimeter of process modules and along walkways',
      'Wellhead areas and drill floor',
      'Between platforms or bridge entries to the LQ',
      'Open deck areas where point detectors are impractical',
    ],
    parameters: [
      p('Low alarm', '1', 'LEL·m', 'typical'),
      p('High alarm', '3', 'LEL·m', 'typical; 2ooN for executive action'),
      p('Range', '0–5', 'LEL·m', 'plant configuration'),
      p('Path length', '5–200', 'm', 'model dependent'),
      p('Response time', '< 5', 's', 'typical'),
      p('Signal strength', '> 50', '%', 'below this indicates misalignment or dirty optics'),
    ],
    instrumentation: ['Transmitter and receiver with alignment telescope', 'F&G logic', 'Beacons and sounders'],
    issues: [
      'Beam block (people, vehicles, scaffolding, fog, heavy rain): fault rather than alarm',
      'Misalignment from structural movement or thermal expansion',
      'Dirty optics from salt spray',
      'Sunlight into the receiver at low sun angles',
    ],
    maintenance: [
      'Functional test with gas filter / test film every 6–12 months',
      'Alignment check and optics cleaning quarterly',
      'Review beam block fault history for layout issues',
    ],
    safety: [
      'Beam block faults remove coverage: compensating measures needed',
      'Does not locate a leak; follow up with portable detector',
      'Inhibit only via F&G panel with permit',
    ],
    standards: ['IEC 60079-29-4', 'ISO 13702', 'NORSOK S-001', 'IEC 61511'],
  },
  {
    id: 'inst-hd',
    title: 'Heat Detector',
    summary: 'A point detector that alarms when temperature exceeds a fixed threshold or rises faster than a set rate, used in enclosed rooms and machinery spaces.',
    howItWorks:
      'Electronic thermistor-based heat detectors compare temperature with a fixed limit (typically 57–78 °C depending on class) and also respond to a rapid rate of rise (around 8–10 °C/min). They are robust in dirty or humid areas where smoke detectors would give false alarms, such as generator rooms, pump houses and kitchens. Fusible plugs and linear heat cables are alternatives in machinery spaces.',
    useCases: [
      'Emergency generator room and diesel firewater pump houses',
      'Turbine and compressor enclosures (with flame and gas detection)',
      'Galley and laundry in accommodation',
      'Workshops and stores',
    ],
    parameters: [
      p('Fixed temperature alarm', '68–78', '°C', 'typical; at least 20–30 °C above max ambient'),
      p('Rate-of-rise', '8–10', '°C/min', 'typical class A1R'),
      p('Normal ambient', '< 40–50', '°C', 'check against room HVAC'),
      p('Coverage', '≤ 25–50', 'm² per detector', 'typical, depends on ceiling height'),
    ],
    instrumentation: ['Fire and gas panel loop', 'Room ventilation shutdown / damper closure', 'Fixed suppression (water mist, CO₂, foam) release logic'],
    issues: [
      'Nuisance alarm from hot exhaust or poor ventilation',
      'Slow detection of smouldering fires (inherent limitation)',
      'Damage during maintenance work',
      'Wrong temperature class installed',
    ],
    maintenance: ['Functional test with heat source annually or per F&G test schedule', 'Visual inspection quarterly', 'Replace after any exposure above rating'],
    safety: [
      'Heat detectors may release gaseous suppression: evacuate room on pre-alarm',
      'Lock out CO₂ / suppression systems before entry into protected spaces',
      'Never cover detectors during hot work; inhibit via F&G permit',
    ],
    standards: ['EN 54-5', 'NFPA 72', 'ISO 13702', 'NORSOK S-001'],
  },
  {
    id: 'inst-sd',
    title: 'Smoke Detector (Optical)',
    summary: 'Optical scattering smoke detector used in clean enclosed rooms, LER, CCR, switchgear, accommodation, to give early warning of electrical or smouldering fires.',
    howItWorks:
      'An LED shines into a dark chamber; smoke particles scatter light onto a photodiode and the signal is reported as % obscuration per metre. Addressable detectors report analogue values so the panel can compensate for drift and flag dirty chambers. Aspirating systems (VESDA) draw air through pipes for very early detection in switchgear and under-floor cable spaces.',
    useCases: [
      'Local equipment room and switchgear',
      'Central control room and under-floor cable voids',
      'Accommodation cabins and corridors',
      'HVAC return ducts',
    ],
    parameters: [
      p('Alarm threshold', '2–4', '% obs/m', 'typical, optical point detector'),
      p('Normal reading', '< 0.5', '% obs/m', ''),
      p('Coverage', '≤ 60–100', 'm² per detector', 'typical, ceiling height dependent'),
      p('Response', '< 30', 's', 'typical in test'),
    ],
    instrumentation: ['Addressable fire panel loop', 'HVAC shutdown / damper closure', 'Gaseous suppression release (inert gas)', 'Aspirating smoke detection in electrical rooms'],
    issues: [
      'Dust or insects in chamber: false alarm or drift',
      'Steam, cooking or welding fumes: nuisance alarms',
      'Detector covered during work and not uncovered',
      'High air velocity near HVAC diffusers diluting smoke',
    ],
    maintenance: ['Functional test with test smoke annually', 'Clean or replace heads per drift compensation warnings', 'Panel loop and battery checks'],
    safety: [
      'Smoke in electrical rooms can be toxic: evacuate and use BA for investigation',
      'Confirm suppression system lockout before entering protected rooms',
      'Detector caps must be removed after work',
    ],
    standards: ['EN 54-7', 'EN 54-20 (aspirating)', 'NFPA 72', 'ISO 13702', 'NORSOK S-001'],
  },
  {
    id: 'inst-mac',
    title: 'Manual Alarm Call Point (MAC)',
    summary: 'A manually operated break-glass or push button point where personnel can raise a fire alarm or initiate an ESD; red for fire, yellow for ESD.',
    howItWorks:
      'Pressing the frangible or resettable element opens or changes a supervised contact on the F&G or ESD loop. The panel identifies the location, sounds the general alarm and initiates the actions in the cause and effect matrix (e.g. fire pumps start). MACs are placed at escape routes, exits from modules and at muster routes so anyone discovering a fire can raise the alarm within a short walking distance.',
    useCases: [
      'Escape routes and module exits',
      'Stairways and muster points',
      'Drill floor and wellhead area (ESD push buttons)',
      'Accommodation corridors and galley',
    ],
    parameters: [
      p('Travel distance to nearest MAC', '≤ 30', 'm', 'typical design rule'),
      p('Mounting height', '1.2–1.5', 'm', 'above floor'),
      p('Signal', 'supervised contact / addressable', '', 'line fault monitored'),
      p('Colour', 'red = fire, yellow = ESD', '', ''),
    ],
    instrumentation: ['F&G / ESD panel', 'General alarm and PA system', 'Firewater pump start logic'],
    issues: [
      'Accidental operation by impact: spurious alarm / ESD',
      'Covers missing or element damaged',
      'Location blocked by scaffolding or stored material',
      'Corroded terminals: loop faults',
    ],
    maintenance: ['Functional test (with test key) annually or per F&G test schedule', 'Visual inspection on rounds', 'Replace broken elements immediately'],
    safety: [
      'Any person discovering a fire must activate the nearest MAC and report',
      'Keep MAC access clear at all times',
      'ESD push buttons shut in the facility: use only in genuine emergency',
    ],
    standards: ['EN 54-11', 'NFPA 72', 'ISO 13702', 'NORSOK S-001'],
  },
  // ───────────────────────────── drilling / well control ─────────────────────────────
  {
    id: 'inst-standpipe',
    title: 'Standpipe Pressure (Drilling)',
    summary:
      'Pressure in the standpipe between the mud pumps and the top drive: the driller\'s key indicator of circulating system health, bit performance and well control.',
    howItWorks:
      'A pressure transmitter (usually a hammer-union diaphragm sensor) on the standpipe manifold measures the pressure the mud pumps must generate to circulate mud down the drill string, through the bit nozzles and up the annulus. Changes at constant pump rate show events: a gradual fall can indicate a washout in the string, a sudden fall a twist-off or lost nozzle, a rise a plugged nozzle or packing-off. During a kick, standpipe pressure is used with the choke to keep bottom-hole pressure constant (drillers method / wait-and-weight).',
    useCases: [
      'Drilling circulation monitoring at constant SPM',
      'Kick circulation: shut-in drill pipe pressure (SIDPP) and kill sheet',
      'Detecting washouts, plugged nozzles and pack-offs',
      'Slow circulation rate (SCR) pressures recorded each tour for well control',
    ],
    parameters: [
      p('Normal pressure', '~ 212', 'bar', 'plant nominal; depends on depth, flow rate and mud'),
      p('High alarm', '300', 'bar', 'plant setting'),
      p('High-high', '330', 'bar', 'plant setting; below standpipe / pump relief rating'),
      p('Pressure change alert', '± 10–15', 'bar', 'at constant SPM, typical'),
      p('System rating', '345 (5000 psi)', 'bar', 'typical standpipe manifold rating'),
    ],
    instrumentation: ['Mud pump stroke counters (SPM)', 'Choke manifold and drill pipe pressure gauges', 'Drilling data acquisition / driller cabin display', 'Pop-off (relief) valves on mud pumps'],
    issues: [
      'Gradual pressure loss: drill string washout',
      'Sudden pressure loss: twist-off or bit nozzle lost',
      'Pressure spike: plugged nozzles, packing off, annular bridging',
      'Gas cutting of mud: pressure reduction and kick indicator',
      'Sensor diaphragm damage from hammering and pulsation',
    ],
    maintenance: [
      'Calibrate standpipe transducer each well or every 6 months',
      'Check against mechanical standpipe gauge on each tour',
      'Inspect hammer unions and high-pressure mud lines per rig integrity plan',
    ],
    safety: [
      'High-pressure mud lines: exclusion zone during pressure testing and pumping',
      'Mud pump relief valves must be set below system rating and vented safely',
      'Record SCRs every tour and after mud weight changes for well control readiness',
    ],
    standards: ['API RP 59', 'API 16C (choke and kill)', 'IADC Drilling Manual', 'NORSOK D-001 / D-010'],
  },
  {
    id: 'inst-hookload',
    title: 'Hook Load (Deadline Anchor Load Cell)',
    summary: 'Measures the weight hanging from the travelling block via a load cell on the drill line deadline anchor, giving weight on bit and detecting stuck pipe or overpull.',
    howItWorks:
      'The fixed (dead) end of the drilling line is wrapped around a deadline anchor drum; tension in the deadline acts on a hydraulic or electronic load cell. Multiplying by the number of lines strung (and correcting for sheave friction) gives hook load. Weight on bit is the difference between the free-hanging string weight and the hook load while drilling. Overpull or set-down weight while tripping indicates hole problems.',
    useCases: [
      'Weight on bit control while drilling',
      'Detection of overpull, tight hole and stuck pipe',
      'Casing running and landing weight confirmation',
      'Protection of derrick and hoisting equipment from overload',
    ],
    parameters: [
      p('Normal hook load', '~ 182', 't', 'plant nominal; depends on string weight and buoyancy'),
      p('High alarm', '360', 't', 'plant setting, below derrick / top drive rated capacity'),
      p('Weight on bit', '5–25', 't', 'typical, depends on bit type and hole size'),
      p('Accuracy', '±1–2', '% of reading', 'typical'),
    ],
    instrumentation: ['Drawworks encoder / block position', 'Top drive torque and RPM', 'Driller\'s display and data recorder', 'Crown and floor saver protection'],
    issues: [
      'Calibration error after slipping / cutting drill line',
      'Hydraulic load cell leaks: reading drifts low',
      'Wrong number of lines strung configured',
      'Sheave friction causing differences between tripping in and out',
    ],
    maintenance: ['Calibrate deadline anchor sensor annually and after line string-up', 'Inspect deadline anchor and drill line per slip-and-cut programme', 'Check hydraulic hoses and fittings'],
    safety: [
      'Do not exceed rated hook load of derrick, top drive and drill pipe',
      'Overpull limits defined per string: know them before tripping',
      'Personnel clear of the drill floor during jarring and high overpull',
    ],
    standards: ['API Spec 4F (derricks)', 'API RP 9B (wire rope)', 'API Spec 8C', 'IADC Drilling Manual'],
  },
  {
    id: 'inst-pit-volume',
    title: 'Mud Pit Volume / Trip Tank Level',
    summary:
      'Level sensors on the active mud pits and trip tank that total the mud volume, the primary means of detecting a kick (pit gain) or losses while drilling and tripping.',
    howItWorks:
      'Ultrasonic or radar level sensors above each pit, converted to volume by the pit geometry, feed a pit volume totaliser (PVT). Any unexplained increase (pit gain) means formation fluid is entering the well; a decrease means losses to the formation. While tripping, the small trip tank isolates the well so the hole-fill volume can be compared with the pipe displacement on each stand. Alarms are set tight around the current volume and reset after transfers.',
    useCases: [
      'Kick detection while drilling (pit gain)',
      'Loss detection (pit loss)',
      'Trip monitoring: hole fill against calculated displacement using the trip tank',
      'Mud transfer and treatment management',
    ],
    parameters: [
      p('Active pit volume', '~ 142', 'm³', 'plant nominal'),
      p('Pit gain / loss alarm', '± 1.5–2', 'm³', 'typical; plant lo 130 / hi 154 m³'),
      p('Trip tank volume', '~ 38', 'm³', 'plant nominal; typically 5–8 m³ resolution tank on small rigs'),
      p('Trip tank resolution', '< 0.1', 'm³', 'to detect swabbing per stand'),
      p('Sensor accuracy', '± 5–10', 'mm level', 'ultrasonic / radar'),
    ],
    instrumentation: ['Flow-out paddle and flow-in (pump strokes)', 'Mud gas and H₂S at shakers', 'Driller\'s PVT display with alarms', 'Trip sheet for displacement comparison'],
    issues: [
      'Mud transfers or additions without telling the driller: false gain alarms',
      'Rig motion (floaters) or agitators causing level noise',
      'Foam or surface solids affecting ultrasonic readings',
      'Alarms set too wide or muted: late kick detection',
    ],
    maintenance: [
      'Verify pit sensors against manual dip each tour',
      'Clean sensors of mud spray daily',
      'Function test alarms at the driller\'s console before drilling each section',
    ],
    safety: [
      'Any unexplained pit gain: stop drilling, flow check, shut in if flowing',
      'All transfers must be communicated to the driller and mud logger',
      'Mud pit rooms may contain gas / H₂S: gas detection and ventilation required',
    ],
    standards: ['API RP 59', 'API Std 53', 'IADC Well Control (WellSharp)', 'NORSOK D-010'],
  },
  {
    id: 'inst-flow-out',
    title: 'Flow-Out Sensor (Flowline Paddle)',
    summary: 'A paddle sensor in the return flowline that measures relative mud return flow (% flow), compared with flow-in from the pumps to give the fastest indication of a kick or losses.',
    howItWorks:
      'A hinged paddle hangs in the partially filled return flowline from the bell nipple to the shakers; the deflection angle increases with flow and is output as % of full scale. At steady pump rate the % flow is stable; a rise with constant pumps indicates the well is flowing (kick), a fall indicates losses. Higher-end systems use Coriolis meters in the returns (as on MPD rigs) for quantitative delta-flow.',
    useCases: [
      'Early kick detection (flow-out increase) before pit gain is significant',
      'Loss circulation detection',
      'Flow check confirmation when pumps are off',
      'Monitoring for ballooning / breathing formations',
    ],
    parameters: [
      p('Normal flow-out', '~ 62', '% flow', 'plant nominal at drilling rate'),
      p('Low alarm', '40', '% flow', 'plant setting: possible losses'),
      p('High alarm', '80', '% flow', 'plant setting: possible kick'),
      p('Delta flow alert', '± 5–10', '% of flow', 'typical relative change at constant SPM'),
    ],
    instrumentation: ['Mud pump stroke counters (flow-in)', 'Pit volume totaliser', 'Standpipe pressure', 'Mud gas detector'],
    issues: [
      'Paddle stuck with cuttings or mud gel: no change in reading',
      'Calibration varies with mud properties and flow regime',
      'Flowline blockage giving false high reading',
      'Rig heave (floaters) affecting reading',
    ],
    maintenance: ['Check paddle free movement and clean each tour', 'Function check against pump rate changes', 'Inspect sensor seals and wiring'],
    safety: [
      'Flow with pumps off = shut the well in per standing instructions',
      'Do not ignore small trends: combine with pit volume and gas',
      'Flowline area can release gas and H₂S: gas detection required',
    ],
    standards: ['API RP 59', 'API Std 53', 'IADC Well Control guidelines', 'NORSOK D-010'],
  },
  {
    id: 'inst-sand-detector',
    title: 'Acoustic Sand Detector',
    summary:
      'A non-intrusive clamp-on sensor that listens for the ultrasonic noise of sand grains hitting the pipe wall and estimates the sand production rate of a well.',
    howItWorks:
      'Mounted on the outside of a bend downstream of the choke, a piezo-electric sensor picks up high-frequency (ultrasonic) noise generated when sand particles strike the wall. The raw signal is filtered to remove flow noise and converted to a sand rate in g/s using a calibration that depends on flow velocity. Rising sand noise when the choke is opened shows the well is above its maximum sand-free rate.',
    useCases: [
      'Setting maximum sand-free rates during well bean-up',
      'Continuous sand monitoring on sand-prone wells',
      'Protecting chokes, bends and manifolds from erosion',
      'Triggering desander dumps and erosion inspections',
    ],
    parameters: [
      p('Sand rate', 'As low as practical (< 0.5–1 typical normal)', 'g/s', 'Plant alarm 2 / 5 g/s on flowlines'),
      p('Mounting position', '≥ 1–2 pipe diameters after a bend', '', 'Where particles impact the wall'),
      p('Flow velocity for detection', '> 1–2', 'm/s', 'Below this sand is not detected reliably'),
      p('Background (flow) noise', 'Stable baseline, recorded sand-free', 'raw units'),
    ],
    instrumentation: ['Clamp-on acoustic sensor', 'Signal processor with velocity input', 'Erosion probes (ER / intrusive) for confirmation', 'Choke position and FTHP for correlation'],
    issues: [
      'Flow noise or choke noise misread as sand (false positives)',
      'Poor calibration giving wrong g/s figures; trends are more reliable than absolute values',
      'Loose clamp or poor acoustic coupling',
      'Low velocity masking real sand production',
    ],
    maintenance: ['Check coupling and baseline quarterly', 'Re-calibrate with sand injection tests or after rate changes', 'Correlate with erosion probe and UT readings'],
    safety: ['Sand erosion can thin pipe walls rapidly; treat a sand alarm as an integrity alarm', 'Cut back the choke on high sand per procedure', 'Clamp-on installation is non-intrusive, no breaking containment'],
    standards: ['DNV-RP-O501 (sand erosion)', 'API RP 14E', 'IEC 60079 (Ex sensors)'],
  },
  {
    id: 'inst-at-watercut',
    title: 'Water Cut Analyser',
    summary:
      'An analyser that measures the fraction of water in a liquid hydrocarbon stream, used for well testing, allocation and oil export quality.',
    howItWorks:
      'Most offshore water-cut meters use microwave or capacitance/impedance sensing. Oil and water have very different dielectric properties, so the measured permittivity of the mixture gives the water fraction. Microwave meters cover the full 0–100 % range including water-continuous flow. Coriolis meters infer water cut from density instead. Salinity and temperature compensation are critical.',
    useCases: [
      'Water cut on test separator or MPFM liquid legs',
      'BS&W monitoring of export crude',
      'Detecting water breakthrough in individual wells',
      'Control of dehydration and electrostatic coalescers',
    ],
    parameters: [
      p('Accuracy (oil-continuous)', '± 0.5–2', '% absolute', 'Typical'),
      p('Accuracy (water-continuous)', '± 2–5', '% absolute', 'Salinity dependent'),
      p('Gas content', '< 2–5 (typical limit)', '% GVF', 'Free gas corrupts readings'),
      p('Salinity setting', 'Matches latest water analysis', 'g/l'),
    ],
    instrumentation: ['Microwave or capacitance probe', 'Temperature compensation', 'Sample point for lab BS&W comparison'],
    issues: ['Free gas bubbles causing noisy or low readings', 'Wrong salinity setting biasing results', 'Coating of the probe by wax or scale', 'Emulsion phase inversion near 40–60 % water cut'],
    maintenance: ['Compare to lab samples weekly or per test', 'Update salinity after water analysis', 'Clean probe on drift'],
    safety: ['Sampling exposes operators to hydrocarbons and H₂S', 'Probe removal under pressure only with a rated retraction tool', 'Do not rely on the analyser alone for export custody transfer; lab BS&W governs fiscal quantities'],
    standards: ['API MPMS Chapter 10 (sediment and water)', 'ISO 3171 (sampling)', 'API MPMS Chapter 20'],
  },
]
