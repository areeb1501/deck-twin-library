/**
 * Knowledge entries for the cold vent stacks (VS-A300, VS-R300) and the atmospheric tank vents (the LQ
 * diesel / potable-water tank goosenecks). The platform cranes (CR-*) use the 'crane' entry in
 * knowledgeUtilities.ts. Merged into KNOWLEDGE by model/knowledge.ts.
 */
import type { Knowledge, KnowledgeParam } from './knowledgeTypes'

const p = (name: string, ideal: string, unit?: string, note?: string): KnowledgeParam => ({ name, ideal, ...(unit ? { unit } : {}), ...(note ? { note } : {}) })

export const CRANE_VENT_KNOWLEDGE: Knowledge[] = [
  {
    id: 'vent-stack',
    title: 'Cold Vent Stack',
    summary:
      'A tall open stack that releases low-pressure hydrocarbon or process vapour to atmosphere without burning it, at a height and place where the gas disperses below its lower flammable limit before it can reach people, air intakes or ignition sources.',
    howItWorks:
      'Vent sources (glycol regenerator still column, low-pressure flash gas, tank breathing, riser or pipeline blowdown where flaring is not possible) are collected in a vent header and taken up the stack. The gas leaves the tip as a jet and is diluted by the wind: at moderate wind the plume bends over and mixes quickly; in near-calm air a gas heavier than air (cold, or with heavy hydrocarbons or water) can slump back towards the deck. A purge (nitrogen or fuel gas) and a flame arrestor or molecular seal at the tip keep air out of the header, and a snuffing system can put out a vent fire after a lightning strike. Dispersion modelling sets the height and location against the hazardous-area envelope and the helideck and HVAC intakes.',
    useCases: [
      'TEG regeneration still-column vent (water vapour with BTEX and some methane)',
      'Low-pressure flash gas from separators or tanks where recovery is uneconomic',
      'Emergency or planned blowdown of risers and pipelines on unmanned platforms without a flare',
      'Atmospheric relief of nitrogen, instrument air or utility gases',
    ],
    parameters: [
      p('Tip height', '≥ 3 m above anything within 15 m', 'm', 'And above the hazardous-area envelope of nearby plant'),
      p('Distance to HVAC / turbine air intakes', '> 15–30', 'm', 'Set by dispersion study; intakes upwind in the prevailing wind'),
      p('Exit velocity (continuous vents)', '> 3–5', 'm/s', 'Keeps the plume rising and avoids tip-wake downwash'),
      p('Concentration at platform level', '< 50 % LFL', '', 'Worst-case calm-wind dispersion'),
      p('Header purge', 'Continuous, positive', '', 'Prevents air ingress and flashback'),
      p('Vent rate (TEG still)', '0.02–0.1', 'MMscfd', 'Typical for a 50–80 MMscfd dehydration unit'),
    ],
    instrumentation: ['Vent header flow meter (ultrasonic)', 'Purge flow indicator / low-flow alarm', 'Tip temperature (vent-fire detection)', 'Gas detectors around the stack base and at nearby intakes'],
    issues: [
      'Gas reaching deck level or air intakes in calm, dense-gas conditions',
      'Vent fire from lightning or static ignition at the tip',
      'Liquid carry-over into the vent (hydrocarbon rain) after a knock-out drum fails',
      'Air ingress and flashback when the purge is lost',
      'Emissions: methane and BTEX venting is a reportable greenhouse-gas and air-quality source',
    ],
    maintenance: [
      'Check purge flow and the tip flame arrestor / seal',
      'Inspect the stack, guides and support tower for corrosion (splash of condensate at the tip)',
      'Drain the vent knock-out drum and test its high-level alarm',
      'Review vent volumes against the emissions permit and look for recovery options',
    ],
    safety: [
      'Treat the stack-tip area as a hazardous area; restrict access to the tip platform when venting',
      'Stop crane work and hot work near the stack during large vents or blowdown',
      'Keep helicopter approaches clear of the vent plume',
      'Snuffing / extinguishing arrangement ready for a vent fire',
    ],
    standards: ['API Std 521 / ISO 23251 (pressure-relieving and depressuring systems)', 'API RP 14C', 'EI 15 / IEC 60079-10-1 (area classification)', 'CAP 437 (helideck environment, plumes)', 'OSPAR / national methane-venting regulations'],
  },
  {
    id: 'tank-breather-vent',
    title: 'Atmospheric Tank Vent (gooseneck, flame arrestor)',
    summary:
      'The open vent on an atmospheric storage tank (diesel day tank, potable-water tank) that lets air in and vapour out as the tank fills, empties and warms, finished in a gooseneck so rain and spray cannot get in, with a flame arrestor on flammable service or an insect screen on water.',
    howItWorks:
      'A short line rises from the tank roof nozzle and turns down 180° at the top (gooseneck), so the outlet faces the deck and sheds rain and green water. On diesel and other flammable or combustible liquids a flame arrestor (a crimped metal element that quenches a flame front) sits at the outlet so an external fire cannot flash back into the vapour space. On potable water the outlet carries a fine stainless screen to keep insects and debris out of the drinking water. The vent is sized for the maximum filling and emptying rate plus thermal breathing, so the tank never sees pressure or vacuum it was not built for.',
    useCases: [
      'Diesel day tanks and storage tanks (flame arrestor, outlet away from ignition sources)',
      'Potable / fresh-water tanks (screened gooseneck, sanitary outlet)',
      'Lube-oil and chemical storage tanks (often with a pressure/vacuum valve)',
    ],
    parameters: [
      p('Tank pressure while filling', '< 20', 'mbar g', 'Atmospheric tanks: a few kPa design at most'),
      p('Vent capacity', '≥ max fill or draw rate + thermal breathing', 'm³/h', 'API 2000 / ISO 28300 sizing'),
      p('Flame arrestor pressure drop', '< 2', 'mbar', 'At design flow; rising ΔP means a fouled element'),
      p('Outlet height', '> 0.5', 'm above the roof / deck', 'And outside doorways, air intakes'),
    ],
    issues: [
      'Fouled or iced flame-arrestor element blocking the vent: tank collapse when pumping out',
      'Missing screen: insects and debris in potable water',
      'Water or spray ingress through a damaged gooseneck',
      'Diesel vapour release close to hot surfaces or air intakes',
    ],
    maintenance: [
      'Inspect and clean the flame-arrestor element (typically annually, more often in dusty or icing service)',
      'Check screens and goosenecks for corrosion and damage',
      'Confirm the vent is not blanked or valved off after maintenance',
    ],
    safety: [
      'Never isolate a tank vent while the tank is being filled or emptied',
      'Treat the vent outlet of a fuel tank as a hazardous-area source',
      'Potable-water tank vents must be kept sanitary (no contamination path)',
    ],
    standards: ['API Std 2000 / ISO 28300 (venting of storage tanks)', 'ISO 16852 / EN ISO 16852 (flame arresters)', 'NORSOK P-002', 'WHO / national potable-water rules offshore'],
  },
]
