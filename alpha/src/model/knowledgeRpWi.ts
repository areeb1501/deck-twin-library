/**
 * Knowledge entries for the riser & export platform (RP) and the water-injection platform (WI): fiscal
 * metering, SSIV control, riser ESD valves, seawater filtration, vacuum deaeration, water-injection pumps
 * and dissolved-oxygen analysers. Merged into KNOWLEDGE by model/knowledge.ts.
 */
import type { Knowledge, KnowledgeParam } from './knowledgeTypes'

const p = (name: string, ideal: string, unit?: string, note?: string): KnowledgeParam => ({ name, ideal, ...(unit ? { unit } : {}), ...(note ? { note } : {}) })

export const RP_WI_KNOWLEDGE: Knowledge[] = [
  // ───────────────────────────── export metering ─────────────────────────────
  {
    id: 'metering-oil',
    title: 'Oil Fiscal (Custody-Transfer) Metering Skid',
    summary:
      'Measures the crude leaving the field to custody-transfer accuracy. Its figures are what the oil is sold, taxed and allocated on, so every barrel through it is money.',
    howItWorks:
      'The export stream is split over parallel meter runs (usually ultrasonic or turbine meters, one run per 100 % of flow plus a spare), each with upstream straight pipe and a flow conditioner. Temperature and pressure transmitters on each run and a densitometer feed a flow computer that corrects the volume to standard conditions (API MPMS tables) and subtracts water from the BS&W analyser. An automatic flow-proportional sampler fills a receiver for laboratory analysis. The meters are proved regularly against a calibrated prover loop or a master meter connected through the prover valves.',
    useCases: [
      'Custody transfer of crude from the platform into a shared export pipeline or onto a shuttle tanker',
      'Allocation of the commingled export back to fields and licence owners',
      'Fiscal reporting to the regulator (e.g. NSTA / Norwegian Offshore Directorate measurement regulations)',
      'Pipeline leak detection by mass balance against the receiving terminal',
    ],
    parameters: [
      p('Overall uncertainty', '≤ 0.25', '% of volume', 'Typical fiscal oil requirement'),
      p('Meter factor drift between provings', '< 0.02–0.05', '%'),
      p('BS&W at the meter', '< 0.5', '% vol', 'Export spec; higher suggests separator / coalescer problems upstream'),
      p('Run velocity', '1–4', 'm/s', 'Inside the meter calibration range'),
      p('Sampler grab rate', 'flow-proportional', '', 'Receiver filled to 70–80 % per batch'),
    ],
    instrumentation: ['Ultrasonic / turbine meters per run', 'Run PT and TT', 'Densitometer', 'BS&W (water-cut) analyser', 'Automatic sampler', 'Flow computer and supervisory computer'],
    issues: [
      'Meter factor shifts from wax, debris or changed viscosity (re-prove)',
      'Free water or gas in the stream giving over-reads and poor BS&W correction',
      'Flow-conditioner damage after pigging debris',
      'Failed sampler or under-filled receiver invalidating the batch',
      'Configuration errors in the flow computer (wrong density or K-factor), an audit finding',
    ],
    maintenance: [
      'Meter proving per the measurement manual (weekly to monthly, and after any change)',
      'Densitometer and transmitter calibration checks against references',
      'Sampler and receiver checks each batch; lab comparison of BS&W',
      'Inspection of strainers and flow conditioners after pigging',
      'Witnessed calibration and audit by the authorities / partners',
    ],
    safety: [
      'Full export pressure (≈ 90–100 barg): isolate and depressurise a run before opening it',
      'Hydrocarbon release risk at sample points and the prover connection: gas detection close by',
      'Seal the fiscal valves; any break of a seal is logged and reported',
    ],
    standards: ['API MPMS (Manual of Petroleum Measurement Standards)', 'ISO 12242 / API MPMS 5.8 (ultrasonic liquid meters)', 'ISO 3171 (automatic sampling)', 'OIML R 117', 'NSTA Measurement Guidelines'],
  },
  {
    id: 'metering-gas',
    title: 'Gas Export Metering Skid',
    summary:
      'Fiscal measurement of the export gas: flow, composition and quality, so the gas can be sold on energy (heating value) and checked against the pipeline entry specification.',
    howItWorks:
      'Multipath ultrasonic meters (or orifice runs) in parallel runs measure the actual flow. A flow computer uses the pressure, temperature and the composition from an online gas chromatograph to calculate density, standard volume and energy (AGA 8 / ISO 6976). Hydrocarbon and water dew point analysers check that the gas will not drop liquid in the pipeline. Spare runs allow a meter to be taken out for verification without stopping export.',
    useCases: [
      'Custody transfer into a gas trunk line, sold on energy (GJ / therms)',
      'Allocation of commingled gas between fields',
      'Proof that the export meets pipeline entry specs (dew points, CO₂, H₂S, Wobbe)',
      'Leak detection by line pack / mass balance',
    ],
    parameters: [
      p('Overall uncertainty (energy)', '≤ 1.0', '%'),
      p('Water dew point', '< −10 at export pressure', '°C', 'Set by the pipeline entry specification'),
      p('Hydrocarbon dew point', '< −2 at cricondentherm', '°C', 'Typical North Sea entry spec'),
      p('Meter velocity', '2–20', 'm/s'),
      p('GC repeatability (CV)', '< 0.05', '%'),
    ],
    instrumentation: ['Ultrasonic meters with diagnostics', 'Run PT / TT', 'Gas chromatograph', 'Water and hydrocarbon dew point analysers', 'Flow computer'],
    issues: [
      'Liquid carry-over (poor dehydration upstream) contaminating the meter and dew point analysers',
      'Ultrasonic path failure or noise from control valves upstream',
      'GC calibration gas running out, losing the composition',
      'Dew point excursions forcing export to be shut in',
    ],
    maintenance: [
      'Daily review of meter diagnostics (speed of sound against the calculated value)',
      'GC calibration with certified gas',
      'Periodic meter verification, run switching, transmitter checks',
      'Analyser sample-system filter changes',
    ],
    safety: [
      'High-pressure gas (≈ 140 barg): leak-tight sample lines, gas detection, controlled venting',
      'Calibration gas cylinders secured and segregated',
    ],
    standards: ['ISO 17089 (ultrasonic gas meters)', 'AGA Report 9 / AGA 8', 'ISO 6976 (calorific value)', 'ISO 5167 (orifice)', 'EN 1776'],
  },
  // ───────────────────────────── riser safety ─────────────────────────────
  {
    id: 'ssiv-panel',
    title: 'SSIV Hydraulic Control Panel',
    summary:
      'Hydraulic power unit that holds open the subsea isolation valves (SSIVs) on the export pipelines a little away from the platform, and closes them on ESD so the pipeline inventory cannot feed a riser fire.',
    howItWorks:
      'An HPU with electric or air-driven pumps charges accumulators to the SSIV operating pressure. Hydraulic supply runs down the riser in an umbilical to the fail-safe-close actuators on the SSIVs, which sit 50–500 m out on the seabed. Venting the supply through a dump valve on ESD-1 (or on loss of hydraulics) lets the actuator springs close the SSIVs. Position indication comes back on the umbilical or by acoustic telemetry.',
    useCases: [
      'Isolating large export pipeline inventories from the platform risers in a fire or riser rupture',
      'Pipeline shutdown and pressure testing',
      'Meeting the regulator’s pipeline safety requirements for risers inside the platform safety zone',
    ],
    parameters: [
      p('Hydraulic supply pressure', '300–345', 'barg', 'Low-pressure alarm before the SSIV could drift'),
      p('Accumulator precharge', '≈ 0.9 × minimum operating pressure', 'bar N₂'),
      p('SSIV closing time', '< 60–120', 's', 'As set in the safety case'),
      p('Reservoir level', '40–80', '%'),
    ],
    instrumentation: ['Supply pressure transmitter', 'Reservoir level', 'SSIV open / closed indication', 'Dump-valve position'],
    issues: [
      'Umbilical hose or fitting leak bleeding the supply down (SSIV slowly closing)',
      'Contaminated hydraulic fluid (NAS class) damaging valves subsea',
      'Accumulator precharge loss slowing the response',
    ],
    maintenance: ['Periodic SSIV function and closure-time tests (per performance standard)', 'Fluid sampling and filter changes', 'Accumulator precharge checks', 'Leak-off tests on the valve seats'],
    safety: ['High-pressure hydraulics: never loosen a fitting under pressure', 'SSIV status is a safety-critical element; any inhibit needs a risk assessment and permit'],
    standards: ['ISO 14723 / API 6DSS (subsea pipeline valves)', 'ISO 13628-6 (subsea production control)', 'Pipelines Safety Regulations 1996 (UK)', 'NORSOK U-001'],
  },
  {
    id: 'valve-riser-esdv',
    title: 'Riser ESD Valve',
    summary:
      'The topsides emergency shutdown valve right at the riser, the boundary between the platform and the pipeline. It closes on process or emergency shutdown and keeps the pipeline inventory off the platform.',
    howItWorks:
      'A full-bore ball (or through-conduit gate) valve with a spring-return, fail-closed actuator, piped to an air or hydraulic supply through solenoid valves controlled by the ESD system. Loss of signal or supply closes it. It sits as close to the riser as practical, often on the cellar deck at the riser top, inside fire protection, with a partial-stroke test facility and position switches.',
    useCases: ['Isolating oil and gas export risers on PSD / ESD', 'Pipeline isolation for pigging, maintenance and pressure tests', 'Fire protection of the platform from the pipeline inventory (with the SSIV)'],
    parameters: [
      p('Closing time', '< 10–30', 's', 'As set in the performance standard'),
      p('Leakage class', 'ISO 5208 rate A–B', ''),
      p('Partial-stroke test', '10–20', '% travel', 'Monthly or quarterly, without stopping flow'),
    ],
    instrumentation: ['Open / closed limit switches', 'Supply pressure', 'Partial-stroke test panel'],
    issues: ['Seat leakage found in the closure test', 'Slow stroking from sticky actuators or blocked exhaust', 'Spurious closure from a failed solenoid, causing a production trip'],
    maintenance: ['Full-stroke and leak test at the regulatory interval (typically 6–12 months)', 'Partial-stroke tests in between', 'Actuator spring and seal inspection; passive fire protection checks'],
    safety: ['Safety-critical element (SIL 2–3): any override needs authorisation', 'Never open against a full differential; equalise first'],
    standards: ['API 6D / ISO 14313', 'IEC 61511', 'API RP 14C', 'ISO 5208'],
  },
  // ───────────────────────────── water injection ─────────────────────────────
  {
    id: 'wi-filtration',
    title: 'Seawater Filtration Package',
    summary:
      'Coarse strainers and fine filters that clean the lifted seawater before deaeration and injection, so the injection wells do not plug with silt, plankton or scale.',
    howItWorks:
      'Self-cleaning coarse strainers (about 80–100 µm) remove debris and marine growth. Fine filtration follows in several parallel vessels: dual-media (anthracite / garnet) or cartridge filters down to about 2 µm. When the pressure drop across a filter reaches its set point it is taken out of service and backwashed with filtered water and air scour while the others carry the flow. Biocide dosed upstream controls bacteria in the beds.',
    useCases: ['Seawater injection for pressure support / voidage replacement', 'Pre-treatment for sulphate-removal membranes', 'Utility and cooling water polishing'],
    parameters: [
      p('Filtered water quality', '98 % removal of ≥ 2', 'µm'),
      p('ΔP across a clean fine filter', '0.2–0.5', 'bar', 'Backwash at about 1.0 bar'),
      p('Turbidity out', '< 1–2', 'NTU'),
      p('Backwash frequency', '1–3 per filter per day', ''),
    ],
    instrumentation: ['ΔP transmitters per filter', 'Turbidity analyser', 'Flow transmitter', 'Backwash valve position'],
    issues: ['Media loss or channelling after a bad backwash', 'Fast ΔP rise during plankton blooms', 'Bacterial growth in the beds (SRB, souring the reservoir)'],
    maintenance: ['Backwash sequence checks', 'Media top-up and inspection', 'Strainer screen inspection', 'Analyser calibration'],
    safety: ['Confined space when opening filter vessels', 'Biocide and backwash air under pressure'],
    standards: ['NORSOK P-001', 'ISO 13703', 'Operator water-injection quality specifications'],
  },
  {
    id: 'deaerator',
    title: 'Vacuum Deaerator',
    summary:
      'A packed tower held under vacuum that strips the dissolved oxygen out of the injection water, so it does not corrode the carbon-steel injection system or the well tubulars.',
    howItWorks:
      'Filtered seawater is sprayed over structured packing in one or two stages under vacuum from liquid-ring vacuum pumps (or with stripping gas). The low pressure makes the dissolved oxygen come out of solution, and it is drawn off overhead. The tower stands high enough that the sump gives the injection pumps the NPSH they need. An oxygen scavenger (bisulphite) dosed in the sump or the pump suction removes the last traces. A level controller holds the sump level.',
    useCases: ['Seawater injection water treatment', 'Boiler feedwater deaeration (with steam stripping)', 'Low-oxygen water for sulphate-removal and injection systems'],
    parameters: [
      p('Dissolved O₂ out', '< 10–20', 'ppb', 'Before scavenger polishing'),
      p('Tower pressure', '−0.9 to −0.95', 'barg', 'Vacuum'),
      p('Sump level', '40–60', '%', 'Low-low trips the injection pumps'),
      p('Scavenger residual', '0.5–2', 'ppm', 'Excess bisulphite'),
    ],
    instrumentation: ['O₂ analyser on the outlet', 'Pressure (vacuum) transmitter', 'Level transmitter', 'Vacuum pump status'],
    issues: ['Air in-leakage at flanges or seals raising the outlet O₂', 'Packing fouling or collapse', 'Vacuum pump failure', 'Level swings causing injection pump trips'],
    maintenance: ['O₂ analyser calibration', 'Vacuum leak tests', 'Packing inspection at turnarounds', 'Vacuum pump service'],
    safety: ['Vessel is designed for full vacuum; never isolate the vacuum breaker / PSV', 'Confined-space entry procedures for internal work'],
    standards: ['ASME VIII', 'NORSOK P-001', 'NACE SP0499 (corrosion control in injection systems)'],
  },
  {
    id: 'pump-water-injection',
    title: 'Water Injection Pump',
    summary:
      'High-pressure multistage centrifugal pump that pushes treated seawater down the injection wells to keep the reservoir pressure up and sweep oil toward the producers.',
    howItWorks:
      'A barrel-type multistage pump (often 6–12 stages, here shown on a skid) raises deaerated water from a few bar to 150–300 barg. A large electric motor, usually on a variable-speed drive, sets the speed to meet the header pressure and injection rate. A balance drum takes the axial thrust; mechanical seals with seal-water support keep it tight. Minimum-flow recirculation protects it at low demand, and a discharge check valve and isolation valve sit on each pump. Two pumps share the duty in parallel.',
    useCases: ['Reservoir pressure maintenance and waterflood sweep', 'Produced-water re-injection', 'Injection for disposal'],
    parameters: [
      p('Discharge pressure', '200–250', 'barg', 'Above reservoir injection pressure plus friction'),
      p('Suction pressure', '> NPSH required + margin', 'barg'),
      p('Bearing temperature', '< 90', '°C'),
      p('Vibration', '< 4.5', 'mm/s RMS'),
      p('Motor power', '≈ 2–3', 'MW each'),
    ],
    instrumentation: ['Suction and discharge PTs', 'Flow transmitter (minimum-flow control)', 'Bearing temperature and vibration probes', 'Motor winding temperatures', 'VSD speed'],
    issues: ['Cavitation from low suction pressure (deaerator level) or air ingress', 'Balance-drum or seal wear from solids', 'Vibration from operating far from best efficiency point', 'Trips on power dips (large electrical load)'],
    maintenance: ['Condition monitoring of vibration and bearing temperature', 'Seal and balance-drum inspection at overhaul', 'Performance testing against the curve', 'VSD and motor electrical checks'],
    safety: ['Very high discharge pressure: confirm isolation and depressurisation before any work', 'Large rotating machine: guards in place, local stop accessible', 'High-voltage motor and VSD: electrical permits and LOTO'],
    standards: ['API 610', 'API 614', 'IEC 60034', 'API 670 (machinery protection)'],
  },
  {
    id: 'inst-at-o2',
    title: 'Dissolved Oxygen Analyser',
    summary:
      'Online analyser measuring dissolved oxygen in the injection water in parts per billion, the key check that deaeration and scavenging are working.',
    howItWorks:
      'A continuous sample from the pump suction or deaerator outlet flows through an electrochemical (galvanic / polarographic) or optical (luminescent) sensor cell. Oxygen diffusing through a membrane is reduced at the cathode, or quenches a luminescent dye; the signal is proportional to the oxygen partial pressure and is temperature-compensated to ppb.',
    useCases: ['Water injection quality control', 'Boiler feedwater', 'Monitoring air in-leakage into vacuum systems'],
    parameters: [p('Dissolved O₂', '< 10–20', 'ppb'), p('Response time (T90)', '< 60', 's'), p('Sample flow', 'as per vendor (steady)', '')],
    instrumentation: ['Sample conditioning panel', 'Flow indicator', 'Transmitter with alarm outputs'],
    issues: ['Air in-leakage at sample fittings reading falsely high', 'Membrane fouling or drift', 'Sample line too long, slowing response'],
    maintenance: ['Calibration against zero (sulphite) and air', 'Membrane / electrolyte or sensor-cap replacement', 'Sample line leak checks'],
    safety: ['Sample lines are at process pressure: use the sample panel isolations'],
    standards: ['ASTM D888', 'NACE SP0499'],
  },
]
