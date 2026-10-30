/**
 * Cause & effect matrix: what the safety systems do, and why. The simulation (state/sim.ts) raises
 * shutdowns by these row ids; the HMI shows the table so it is clear what the plant actually does.
 *
 * Hierarchy (NORSOK S-001 / ISO 13702 style): APS > ESD1 > ESD2 > PSD > USD. A shutdown includes
 * every effect of the levels below it and never initiates a higher one. Shutdowns latch: they stay
 * in until the cause has cleared AND the operator resets them, then the platform is restarted.
 *
 * Voting: one detector at the high setpoint alarms; two in the same zone (2ooN) confirm the event.
 * Gas setpoints 20 % LEL low / 60 % LEL high (point), 1 / 3 LEL·m (open path).
 */
import type { CauseEffectRow } from './types'

export const CAUSE_EFFECT: CauseEffectRow[] = [
  // ---------------------------------------------------------------- process (PSD)
  {
    id: 'lahh-1101',
    cause: 'HP separator level high-high (LAHH-1101, 3 000 mm)',
    level: 'PSD',
    scope: 'platform',
    effects: ['Inlet ESDV-1001 closes', 'Well wing valves close', 'Export pumps and compressor stop', 'WHP-N PSD (upstream)'],
    loss: 'oil',
  },
  {
    id: 'pahh-1101',
    cause: 'HP separator pressure high-high (PAHH-1101, 40 barg)',
    level: 'PSD',
    scope: 'platform',
    effects: ['Inlet ESDV-1001 closes', 'Well wing valves close', 'PSV-1101 lifts to flare at 42 barg if pressure keeps rising'],
    loss: 'gas',
  },
  {
    id: 'ia-ll',
    cause: 'Instrument air header low-low (PALL-4603, 5.5 barg)',
    level: 'PSD',
    scope: 'platform',
    effects: ['Fail-closed valves would drift shut: controlled PSD instead', 'Wells, export and compression stop'],
    loss: 'utilities',
  },
  {
    id: 'blackout',
    cause: 'Loss of main power (no turbine generator on the bus)',
    level: 'PSD',
    scope: 'platform',
    effects: ['Emergency generator starts (15 s) for essential loads', 'Process stops', 'WHP-N PSD (upstream)'],
    loss: 'power',
  },
  {
    id: 'export-blocked',
    cause: 'Export blocked (receiving terminal / riser) → separator level rises to LAHH',
    level: 'alarm',
    scope: 'platform',
    effects: ['Export flow falls to zero', 'HP separator level rises → LAHH-1101 PSD'],
    loss: 'export',
  },
  {
    id: 'upstream-psd',
    cause: 'PSD / ESD on Alpha (WHP-N wells have nowhere to flow)',
    level: 'PSD',
    scope: 'platform',
    effects: ['WHP-N well wing valves close', 'Bridge ESDV-N2003 closes'],
    loss: 'controlSafety',
  },
  // ---------------------------------------------------------------- machinery (USD)
  {
    id: 'k2200-surge',
    cause: 'Compressor surge — anti-surge valve FV-2201 failed (high vibration)',
    level: 'USD',
    scope: 'unit',
    effects: ['K-2200 trips (local reset)', 'HP gas goes to flare through the pressure control valve'],
    loss: 'gas',
  },
  {
    id: 'cm-hh',
    cause: 'Cooling medium temperature high-high (TAHH-6303, 55 °C)',
    level: 'USD',
    scope: 'unit',
    effects: ['K-2200 trips on high discharge temperature', 'Gas to flare'],
    loss: 'utilities',
  },
  {
    id: 'load-shed',
    cause: 'Power demand above running generation (under-frequency)',
    level: 'USD',
    scope: 'unit',
    effects: ['Load shedding in priority order: drilling rig, export compressor, seawater lift B'],
    loss: 'power',
  },
  {
    id: 'auto-changeover',
    cause: 'Duty machine trips with the standby on auto',
    level: 'alarm',
    scope: 'unit',
    effects: ['Standby machine starts (pumps 15 s, turbine generator 3 min)'],
    loss: 'controlSafety',
  },
  // ---------------------------------------------------------------- fire & gas
  {
    id: 'gas-low',
    cause: 'Gas detected, 1ooN at low setpoint (20 % LEL / 1 LEL·m)',
    level: 'alarm',
    scope: 'zone',
    effects: ['Alarm in CCR', 'Operator investigates (CCTV, field check)'],
    loss: 'controlSafety',
  },
  {
    id: 'gas-high',
    cause: 'Gas detected, 1ooN at high setpoint (60 % LEL / 3 LEL·m)',
    level: 'alarm',
    scope: 'zone',
    effects: ['High-priority alarm', 'Crane and hot work suspended'],
    loss: 'controlSafety',
  },
  {
    id: 'gas-confirmed',
    cause: 'Confirmed gas, 2ooN at high setpoint in one fire zone',
    level: 'ESD2',
    scope: 'zone',
    effects: ['PSD of the platform', 'Zone ESD valves close, zone blowdown to flare', 'Ignition sources in the zone isolated', 'HVAC dampers close', 'General alarm (gas) — muster'],
    loss: 'controlSafety',
  },
  {
    id: 'fire-single',
    cause: 'Flame seen by one detector (1ooN)',
    level: 'alarm',
    scope: 'zone',
    effects: ['High-priority alarm', 'Operator confirms by CCTV — can release deluge manually'],
    loss: 'controlSafety',
  },
  {
    id: 'fire-confirmed',
    cause: 'Confirmed fire, 2ooN flame (or 2ooN heat / smoke in a module)',
    level: 'ESD1',
    scope: 'platform',
    effects: ['Total platform ESD: every ESD valve closes', 'Full blowdown to flare', 'Deluge in the fire zone', 'Firewater pumps start', 'Turbines to diesel', 'General alarm (fire) — muster'],
    loss: 'controlSafety',
  },
  // ---------------------------------------------------------------- manual
  {
    id: 'manual',
    cause: 'Manual ESD push-button (CCR console)',
    level: 'PSD',
    scope: 'platform',
    effects: ['Level chosen by the operator: PSD, ESD2 (zone), ESD1, APS'],
    loss: 'controlSafety',
  },
  {
    id: 'aps',
    cause: 'Abandon platform (manual, CCR or lifeboat station)',
    level: 'APS',
    scope: 'field',
    effects: ['ESD1 on every platform', 'Turbine generators stop', 'Only emergency generator / UPS loads stay', 'General alarm (abandon)'],
    loss: 'controlSafety',
  },
]

export const CE_BY_ID = Object.fromEntries(CAUSE_EFFECT.map((r) => [r.id, r]))
