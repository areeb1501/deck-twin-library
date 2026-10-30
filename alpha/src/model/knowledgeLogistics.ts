/**
 * Knowledge entries for the plan-13 items (model/logistics.ts): the offshore materials store and laydown
 * (B-9510) and the compact meter prover on RP (X-R155). Merged into KNOWLEDGE by model/knowledge.ts.
 */
import type { Knowledge, KnowledgeParam } from './knowledgeTypes'

const p = (name: string, ideal: string, unit?: string, note?: string): KnowledgeParam => ({ name, ideal, ...(unit ? { unit } : {}), ...(note ? { note } : {}) })

export const LOGISTICS_KNOWLEDGE: Knowledge[] = [
  {
    id: 'materials-store',
    title: 'Offshore Materials Store & Laydown',
    summary:
      'The platform’s warehouse: a containerised walk-in store holding the critical (A-class) and redundancy (B-class) spares, preventive-maintenance kits and consumables that must be on the installation, next to a crane-served laydown where supply-vessel cargo is landed, checked and sent back. Alpha’s offshore store holds the A/B-class spares; the stock, orders and logistics are on Control room → Spares & supply (simulated data).',
    howItWorks:
      'Cargo comes out on the supply vessel (or, when it is urgent and light, on the helicopter). Crane CR-A1 lifts the containers and baskets from the vessel alongside the east face to the laydown, where the storeman checks them against the purchase order and books the goods receipt. Parts are binned in the store by location; a work order reserves its parts when it is raised (a kitted job has everything set aside on the shelf) and the parts are issued to the job when it starts. Min / max rules raise a requisition when the stock position (offshore + onshore base + on order − reserved) falls to the reorder point, and slow movers, repairables and empty containers go back to shore as backload. The store is where reliability meets logistics: a missing seal cartridge can keep a compressor down for months, so the critical spares list is set from the criticality of the equipment and the vendor lead time, not from what was used last year.',
    useCases: [
      'Holding insurance spares for production-critical machines (dry-gas seal cartridges, mechanical seals, bearings, couplings)',
      'PM kits staged for planned maintenance campaigns',
      'Consumables: filters, gaskets, lube oil, chemicals, gas cylinders, PPE',
      'Receiving supply-vessel and helicopter cargo; backloading repairables, waste and empty containers',
      'Laydown for scaffolding, pipe spools and equipment during shutdowns and projects',
    ],
    parameters: [
      p('Critical (A-class) spares on board', '100', '%', 'Or a documented, risk-assessed cover from the onshore base'),
      p('First-pass fill rate (jobs kitted from offshore stock)', '≥ 95', '%'),
      p('Stock record accuracy (cycle counts)', '≥ 98', '%'),
      p('Work orders waiting for materials', '< 5', '% of open WOs'),
      p('Laydown deck loading', 'Within the deck rating (typically 5–15)', 't/m²', 'Marked on the laydown kerb'),
      p('Offshore container / lifting-set certificates', 'Valid', '', 'DNV 2.7-1 / EN 12079 container, 6-monthly lifting-gear inspection'),
    ],
    instrumentation: ['Inventory system (SAP MM / Maximo / IFS) with bin locations and reservations', 'Barcode / RFID goods receipt and issue', 'Smoke detection and extinguishers in the store', 'Crane load indicator (SWL / radius) for laydown lifts'],
    issues: [
      'Stock-out of a long-lead critical spare — the machine waits for the part and production is deferred',
      'Wrong, obsolete or unidentifiable parts (superseded part numbers, missing tags)',
      'Shelf-life expiry: elastomers, adhesives, chemicals, batteries',
      'Stored rotating spares damaged by vibration and corrosion (brinelled bearings, seized shafts)',
      'Laydown overloaded or blocking escape routes and fire-fighting access',
      'Dangerous goods (gas cylinders, chemicals, radioactive sources) not segregated',
    ],
    maintenance: [
      'Cycle counts by criticality class; reconcile reservations against open work orders',
      'Preservation of stored rotating spares: turn shafts, keep desiccant and nitrogen purges, inspect monthly',
      'Shelf-life review and quarantine of expired stock',
      'Inspect containers, baskets, slings and shackles; reject anything out of certificate',
      'Backload obsolete and surplus stock; keep the laydown clear and marked',
    ],
    safety: [
      'Crane lifts to the laydown: banksman in charge, tag lines, nobody under a suspended load, stop at the wind and sea-state limits',
      'Open containers on the laydown carefully: cargo may have shifted in transit',
      'Segregate and label dangerous goods to IMDG; keep gas cylinders upright in a rack',
      'Manual handling: use the store’s lifting aids for heavy parts',
      'Keep escape routes, fire monitors and lifeboat access clear of cargo',
    ],
    standards: [
      'ISO 55000 (asset management) / ISO 14224 (equipment criticality data)',
      'DNV 2.7-1 / EN 12079 (offshore containers)',
      'EN 13852-1 / API 2C (offshore cranes)',
      'LOLER / PUWER (lifting equipment)',
      'IMDG Code (dangerous goods)',
      'NORSOK R-003 / Step Change in Safety lifting guidance',
    ],
  },
  {
    id: 'meter-prover',
    title: 'Meter Prover (compact piston prover)',
    summary:
      'The in-service reference for a fiscal oil meter: a precision barrel of known volume that the oil is diverted through, so the meter’s pulses can be compared with that volume and its meter factor updated. Custody-transfer contracts and regulators require regular proving — here of the ultrasonic meter runs on X-R150.',
    howItWorks:
      'A 4-way diverter sends the metered oil through the prover barrel. A piston with a low-friction seal travels between two optical or magnetic detector switches, sweeping a volume that is known from a water-draw calibration. The flow computer counts the meter pulses in that time (with pulse interpolation, because a compact prover sweeps only tens of litres), corrects the prover and the oil to base conditions for temperature and pressure (CTS, CPS, CTL, CPL) and works out the meter factor = prover volume ÷ indicated meter volume. A proof is a set of consecutive runs that must repeat within a tight band; the new factor is applied to the meter when it is close to the previous one. Ultrasonic meters need more passes or a master-meter proof because their pulse output is delayed and noisier.',
    useCases: [
      'Proving custody-transfer and fiscal allocation oil meters',
      'Checking a meter after maintenance, a product change or a change in flow conditions',
      'Supporting the metering uncertainty statement to the regulator and the buyer',
    ],
    parameters: [
      p('Meter factor', '0.9950–1.0050', '', 'Change ≤ 0.25 % from the previous proof'),
      p('Repeatability (5 consecutive runs)', '≤ 0.05', '%', 'API MPMS 4.8'),
      p('Proving frequency', 'Monthly or on a change of conditions', '', 'Set by the contract / regulator'),
      p('Oil metering system uncertainty', '≤ 0.25', '%'),
      p('Temperature stability during the proof', '≤ 0.2', '°C'),
    ],
    instrumentation: ['Detector switches (optical)', 'Prover inlet / outlet temperature and pressure', 'Diverter-valve seal integrity (double block and bleed)', 'Flow computer with pulse interpolation'],
    issues: [
      'Piston or diverter seal leakage — the swept volume is wrong',
      'Detector switch wear or drift',
      'Temperature not stable, or gas in the oil',
      'Ultrasonic meter pulse delay needing many passes',
      'Prover out of calibration (overdue water draw)',
    ],
    maintenance: [
      'Water-draw recalibration of the base volume (typically every 1–5 years)',
      'Replace piston seals and test the diverter for leakage',
      'Check detector switches and the flow-computer configuration (audit trail)',
    ],
    safety: [
      'High-pressure oil (96 barg): depressurise, drain and isolate before opening the barrel',
      'Leak test after any break of containment',
      'Proving sequences interlocked with the metering skid ESD',
    ],
    standards: ['API MPMS Ch. 4.2 / 4.8 (displacement provers, proving operations)', 'API MPMS Ch. 5.8 (ultrasonic liquid meters)', 'API MPMS Ch. 12.2 (meter factor calculation)', 'OIML R 117-1'],
  },
]
