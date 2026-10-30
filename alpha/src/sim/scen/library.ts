/**
 * The training scenario library: twelve classic offshore OTS exercises on the Alpha field, each
 * grounded in what the engine (state/sim.ts) actually does — timings below were measured at 60×:
 *
 *   HP separator inflow with no oil outflow:  LAH 72 % ≈ 3.5 min, LAHH 83 % (PSD) ≈ 5.2 min
 *   instrument air without K-4600:            PAL 6.5 barg ≈ 9 min, PALL 5.5 barg (PSD) ≈ 13 min
 *   cooling medium without circulation:       45 °C ≈ 4 min, TAHH 55 °C (K-2200 trip) ≈ 7.7 min
 *   2 kg/s at the K-2200 discharge:           confirmed gas → ESD2 in < 30 s, detectors clear ≈ 11 min
 *   2 MW pool fire under V-1100:              ESD1 + deluge in < 30 s, out ≈ 10.5 min
 *   one turbine running (25 MW) trips:        blackout + PSD at once; the standby takes 3 min
 *
 * Scenarios that need the RP riser platform or the WI water-injection platform declare `requires`
 * and show as unavailable when those tags are not in the loaded plant.
 */
import * as A from '../alpha'
import type { Fault, PlatformId } from '../types'
import { acked, activeIncidents, anyShutdown, chokeFactor, fmtEl, has, incident, latched, on, operatorActions, pointAt, restarted, runningNow, st, vpos, wellsOf, zoneGas, zoneOfPoint } from './helpers'
import type { Ctx, Objective, Scenario, ScenarioAction } from './types'

// ---------------------------------------------------------------- shared pieces

const plainPos = (c: Ctx, tag: string, y = 1) => {
  const e = c.plant.equipment.find((x) => x.tag === tag)
  return e ? ([e.position[0], y, e.position[2]] as [number, number, number]) : pointAt(c.plant, tag, 1)
}

/** a release / fire at a stored point; keeps the zone */
function release(c: Ctx, key: string, f: Fault) {
  const id = c.inject(f)
  c.data[key] = id
  if ('at' in f && !c.data.zone) c.data.zone = zoneOfPoint(c.plant, f.at)
  return id
}

const MUSTER: ScenarioAction = {
  id: 'muster',
  label: 'PA: sound the general alarm, muster at the primary muster stations',
  who: 'operator',
  detail: 'Platform PA / general alarm. Personnel go to their muster stations and are counted (POB).',
  run: () => 'General alarm sounded: personnel mustering at the lifeboat stations',
}
const POB: ScenarioAction = {
  id: 'pob',
  label: 'Muster check: account for all personnel on board',
  who: 'operator',
  delay: 300,
  available: (c) => c.did.muster !== undefined,
  run: () => 'Muster complete: all 68 POB accounted for (incl. 2 in the field response team)',
}
const HOTWORK: ScenarioAction = {
  id: 'hotwork',
  label: 'PA: suspend all hot work and crane operations',
  who: 'operator',
  detail: 'Cause & effect "gas high": crane and hot work are suspended on any gas alarm',
  run: () => 'Hot-work permits suspended, cranes stopped and loads landed',
}
const cctv = (where: (c: Ctx) => string): ScenarioAction => ({
  id: 'cctv',
  label: 'Check the area on CCTV',
  who: 'operator',
  run: (c) => where(c),
})

/** objective: an alarm on `tag` acknowledged within `window` s of `from` */
const ackObj = (id: string, text: string, tag: string | RegExp, from: string, window = 60): Objective => ({
  id,
  text,
  kind: 'do',
  category: 'alarms',
  from,
  window,
  deadline: window * 4,
  check: (c) => acked(c, tag),
  reason: `${text}, not done within ${window} s`,
  lesson: 'Acknowledge first, then act: an acknowledged alarm tells the rest of the team someone owns it.',
})
/** avoid: an LAHH-1101 PSD on Alpha */
const noLahh = (critical = true): Objective => ({
  id: 'no-lahh',
  text: 'Avoid the LAHH-1101 trip (PSD at 83 %)',
  kind: 'avoid',
  category: 'safety',
  penalty: 50,
  critical,
  check: (c) => c.mark.lahh !== undefined,
  reason: 'LAHH-1101 tripped the platform (PSD): an avoidable escalation: inflow was not cut back in time',
  lesson: 'From LAH (72 %) to LAHH (83 %) takes under 2 minutes at full inflow. Cut the chokes FIRST, then fix the cause.',
})
const lahMarks = [
  { id: 'lah', when: (c: Ctx) => (c.s.process?.hpLevel ?? 0) >= A.HP.lah },
  { id: 'lahh', when: (c: Ctx) => latched(c.s, { causeId: 'lahh-1101', since: c.t0 }).length > 0 },
]
/** avoid: escalating above the level the event needs (manual ESD1 / APS) */
const noOverEscalation = (needed: string): Objective => ({
  id: 'no-overesc',
  text: `Use the right shutdown level (${needed}): do not escalate to ESD1 / APS`,
  kind: 'avoid',
  category: 'safety',
  penalty: 10,
  check: (c) => latched(c.s, { causeId: /^(manual|aps)$/, since: c.t0 }).some((x) => x.level === 'ESD1' || x.level === 'APS'),
  reason: `Escalated to ESD1 / APS: ${needed} already made the area safe; a total ESD also stops utilities and power for no benefit`,
  lesson: 'Pick the lowest shutdown level that makes the hazard safe. Higher levels cost restart time and remove the utilities you may need.',
})
/** the fault's incident is gone (cleared by a field action or decayed) */
const goneMark = (id: string, key: string, after: string) => ({ id, when: (c: Ctx) => c.mark[after] !== undefined && !incident(c.s, c.data[key]) })
const fieldReport = (text: string) => () => text

const rp = A.TAGS.rp
const wi = A.TAGS.wi

// ================================================================= 1 — LV-1101 fails closed
const s1: Scenario = {
  id: 'hp-level-lv1101',
  n: 1,
  title: 'HP separator high level: LV-1101 fails closed',
  difficulty: 'foundation',
  category: 'process',
  platforms: ['Alpha', 'WHP-N'],
  summary: 'The HP separator oil level controller output fails low and LV-1101 drives shut. With no oil leaving V-1100 the level climbs to LAH in ~3.5 min and LAHH (PSD) under 2 min later.',
  objectives: ['Recognise a rising level from the LAH alarm and the trend', 'Cut production fast enough to stop LAHH', 'Get the control valve bypassed and recover production'],
  briefing: [
    'Day shift, normal operation. All ten wells on line at 60 % choke, ≈ 49 000 bbl/d export, both platforms producing.',
    'The instrument technician reported LIC-1101 (HP separator oil level) "hunting" last night; a work order is open.',
    'Field operators are on their rounds on the production deck. Weather: SW 7 m/s.',
  ],
  expected: [
    'Acknowledge LT-1101 high (LAH 72 %) and look at the HP separator: level rising, LV-1101 shut, export pumps running at no flow.',
    'Cut inflow immediately: choke every well down to ≤ 20 % (or shut wells in) before the level reaches LAHH 83 %.',
    'Send the field operator to line up the LV-1101 bypass (hand control of the level).',
    'When the level is back below 65 %, bring the wells back to 60 %.',
  ],
  hints: ['Look at the Process page: what is LV-1101 doing while the level rises?', 'The level rises at about 0.11 %/s at full inflow: every minute counts. Use the Operations panel chokes.', 'The scenario panel has a field action for the bypass.'],
  timeline: [
    { id: 'fault0', at: 90, label: 'LIC-1101 output fails low: LV-1101 strokes closed', run: (c) => c.act((g) => g.setValve(A.TAGS.oilLv, 'closed', 'LIC-1101 output failed')) },
    { id: 'fault', after: ['fault0', 0], when: (c) => vpos(c.s, A.TAGS.oilLv) < 0.05, label: 'LV-1101 stuck closed (levelControlFail)', run: (c) => void (c.data.inc = c.inject({ kind: 'levelControlFail', tag: A.TAGS.oilLv })) },
    ...lahMarks,
    goneMark('fixed', 'inc', 'fault'),
  ],
  actions: [
    {
      id: 'bypass',
      label: 'Field: line up the LV-1101 bypass and control the level by hand',
      who: 'field',
      delay: 180,
      available: (c) => !!incident(c.s, c.data.inc),
      detail: 'The field operator opens the bypass globe valve around LV-1101 (≈ 3 min to get there and line up)',
      run: (c) => {
        c.act((g) => g.clearIncident(String(c.data.inc)))
        return 'Field operator: LV-1101 bypass lined up, level under hand control, LV-1101 isolated for the technician'
      },
    },
  ],
  goals: [
    ackObj('ack-lah', 'Acknowledge the LAH alarm on LT-1101', 'LT-1101', 'lah'),
    {
      id: 'cut',
      text: 'Cut production to ≤ 30 % of potential before LAHH',
      kind: 'do',
      category: 'time',
      from: 'fault',
      window: 180,
      deadline: 260,
      check: (c) => chokeFactor(c.s, c.plant) <= 0.3,
      reason: 'Production was not cut back before the level reached LAHH',
      lesson: 'With the outflow gone, only cutting the inflow buys time. Choke back hard first; restore later.',
    },
    {
      id: 'bypass',
      text: 'Send a field operator to bypass LV-1101',
      kind: 'do',
      category: 'time',
      from: 'fault',
      window: 240,
      deadline: 600,
      check: (c) => c.did.bypass !== undefined,
      reason: 'The LV-1101 bypass was not ordered promptly',
      lesson: 'Fix the cause in parallel with the mitigation: the field operator needs minutes to get there.',
    },
    noLahh(),
    {
      id: 'restore',
      text: 'Restore production once the level is under control',
      kind: 'do',
      category: 'production',
      from: 'fixed',
      window: 360,
      deadline: 1200,
      check: (c) => chokeFactor(c.s, c.plant) >= 0.9 && !anyShutdown(c.s, 'Alpha') && (c.s.process?.hpLevel ?? 100) < A.HP.lah,
      reason: 'Production was not restored after the level was recovered',
      lesson: 'Deferred production is lost for good: bring the wells back once the level is back near normal.',
    },
  ],
  complete: (c) => c.mark.fixed !== undefined && chokeFactor(c.s, c.plant) >= 0.9 && !anyShutdown(c.s, 'Alpha') && (c.s.process?.hpLevel ?? 100) < 65,
  maxDuration: 1800,
  ideal: { deferredBoe: 300, note: 'Chokes cut to 5 % as the level passes 70 %, bypass ordered at once (3 min), wells back at 60 % once the level is below 60 %' },
}

// ================================================================= 2 — export pump trip, standby fails
const s2: Scenario = {
  id: 'export-pump-standby',
  n: 2,
  title: 'Export pump trip: the standby fails to start',
  difficulty: 'foundation',
  category: 'machinery',
  platforms: ['Alpha'],
  summary: 'Duty export pump P-1500A trips on a seal leak. The auto-changeover starts P-1500B, which trips on start (motor protection relay). With no export pump the HP separator fills to LAHH in ~5 min.',
  objectives: ['Read a failed auto-changeover', 'Reset a CCR-resettable trip and start the standby', 'Know which trip must NOT be reset (seal leak)'],
  briefing: [
    'Normal operation, ≈ 49 000 bbl/d export through P-1500A (duty); P-1500B on standby with auto-changeover in AUTO.',
    'P-1500A has had a rising seal-pot level for two days; mechanical is planning a seal change next week.',
  ],
  expected: [
    'Acknowledge the P-1500A and P-1500B trip alarms and read the trip causes on the Machines page.',
    'P-1500B tripped on its motor protection relay: reset it from the CCR and start it (15 s start).',
    'Do NOT reset or restart P-1500A: a seal leak is a hydrocarbon leak, it needs isolation and repair.',
    'Watch the HP separator level; if P-1500B will not run before LAH, cut the chokes.',
  ],
  hints: ['Machines page: which trip is local reset, which is not?', 'P-1500B can be reset from the console.'],
  timeline: [
    {
      id: 'trip',
      at: 60,
      label: 'P-1500A trips (mechanical seal leak); auto-started P-1500B trips on start',
      run: (c) => {
        c.inject({ kind: 'trip', tag: 'P-1500A', cause: 'Mechanical seal leak: high seal-pot level', local: true, repairH: 6 })
        c.inject({ kind: 'trip', tag: 'P-1500B', cause: 'Failed to start: motor protection relay operated (resettable from the CCR)' })
      },
    },
    ...lahMarks,
  ],
  actions: [{ id: 'isolate', label: 'Field: isolate P-1500A for the seal change (close suction / discharge, drain)', who: 'field', delay: 300, run: fieldReport('Field operator: P-1500A isolated, drained to closed drains and vented, ready for the permit') }],
  goals: [
    ackObj('ack', 'Acknowledge the export pump trip alarms', /^P-1500[AB]$/, 'trip', 60),
    { id: 'reset-b', text: 'Reset the P-1500B trip from the CCR', kind: 'do', category: 'time', from: 'trip', window: 90, deadline: 240, check: (c) => c.mark.trip !== undefined && st(c.s, 'P-1500B') !== 'tripped', reason: 'P-1500B was not reset in time', lesson: 'A failed auto-start must be spotted at once: the auto-changeover will not try again.' },
    { id: 'start-b', text: 'Start P-1500B', kind: 'do', category: 'time', from: 'trip', window: 120, deadline: 280, check: (c) => on(c.s, 'P-1500B'), reason: 'P-1500B was not started before the level reached LAHH' },
    noLahh(),
    {
      id: 'leave-a',
      text: 'Leave P-1500A tripped (seal leak: do not restart)',
      kind: 'avoid',
      category: 'safety',
      penalty: 15,
      check: (c) => operatorActions(c).some((a) => a.tag === 'P-1500A' && (a.action === 'start' || a.action === 'resetTrip' || a.action === 'localReset')),
      reason: 'Tried to reset / restart P-1500A with a seal leak: restarting a leaking pump risks a hydrocarbon release',
      lesson: 'Some trips protect people, not the machine: never restart a pump that tripped on a seal leak.',
    },
    { id: 'isolate', text: 'Have P-1500A isolated for repair', kind: 'do', category: 'time', optional: true, from: 'trip', window: 600, check: (c) => c.did.isolate !== undefined },
  ],
  complete: (c) => runningNow(c.s, 'P-1500B') && (c.s.process?.hpLevel ?? 100) < 62 && !anyShutdown(c.s, 'Alpha'),
  maxDuration: 1200,
  ideal: { deferredBoe: 20, note: 'P-1500B running within 2 min, level never reaches LAH' },
}

// ================================================================= 3 — anti-surge failure
const s3: Scenario = {
  id: 'compressor-surge',
  n: 3,
  title: 'Compressor surge: anti-surge valve failed while wells are beaned back',
  difficulty: 'advanced',
  category: 'machinery',
  platforms: ['Alpha'],
  summary: 'FV-2201 (K-2200 anti-surge recycle) fails closed. Well services then bean back both gas wells for sand checks; compressor flow falls towards the surge line with no recycle to protect it.',
  objectives: ['Understand the surge line: flow vs speed', 'Protect a compressor whose anti-surge valve has failed', 'Weigh compressor speed against gas production'],
  briefing: [
    'The field is choked back to 50 % for a reservoir pressure survey. Compressor K-2200 at 92 % speed.',
    'From 06:03 well services will bean back gas wells XT-130 and XT-N102 to 10 % over ~15 min for sand checks.',
    'Instrument: FV-2201 has a sticky positioner, keep an eye on it.',
  ],
  expected: [
    'Acknowledge FV-2201 position discrepancy: the anti-surge valve is not moving, the compressor has no surge protection.',
    'Watch K-2200 surge margin on the Process page as the gas wells bean back.',
    'Before the margin reaches 0 %: reduce K-2200 speed (≈ 75 %) or raise gas flow from the other wells.',
    'Call the instrument technician for FV-2201.',
  ],
  hints: ['Surge margin = how far the flow is above the surge line. Less speed moves the surge line down.', 'Operations panel → compressor speed.'],
  setup: { chokes: 50 },
  timeline: [
    {
      id: 'asv',
      at: 60,
      label: 'FV-2201 anti-surge valve fails closed (positioner)',
      run: (c) => {
        c.inject({ kind: 'antiSurgeFail' })
        c.inject({ kind: 'valveStuck', tag: A.TAGS.antiSurge })
      },
    },
    {
      id: 'bean',
      at: 180,
      label: 'Well services bean back XT-130 / XT-N102 from 50 % to 10 % over 15 min',
      ramp: {
        dur: 900,
        apply: (c, f) =>
          c.act((g) => {
            for (const w of ['XT-130', 'XT-N102']) if (has(c.plant, w)) g.setChoke(w, Math.round(50 - 40 * f))
          }),
      },
    },
    { id: 'low', when: (c) => c.mark.asv !== undefined && on(c.s, A.TAGS.compressor) && (c.s.process?.surgeMargin ?? 100) < 10 },
    { id: 'surge', when: (c) => st(c.s, A.TAGS.compressor) === 'tripped' && /surge/i.test(c.s.machines?.[A.TAGS.compressor]?.tripCause ?? '') },
  ],
  actions: [{ id: 'tech', label: 'Call the instrument technician to FV-2201', who: 'operator', delay: 900, run: fieldReport('Instrument technician: FV-2201 positioner air supply blocked, cleaned; valve stroked OK (controller still in manual)') }],
  goals: [
    ackObj('ack-fv', 'Acknowledge the FV-2201 position discrepancy', A.TAGS.antiSurge, 'asv', 120),
    {
      id: 'protect',
      text: 'Reduce K-2200 speed (≤ 82 %) or raise gas flow before surge',
      kind: 'do',
      category: 'time',
      from: 'low',
      window: 60,
      deadline: 180,
      check: (c) => (c.s.knobs?.compressorSpeed ?? 92) <= 82 || (c.mark.low !== undefined && c.el - c.mark.low > 30 && (c.s.process?.surgeMargin ?? 0) >= 12),
      reason: 'K-2200 was not protected as its flow fell towards the surge line',
      lesson: 'Without the anti-surge valve the operator IS the surge protection: lower speed, more flow, or a controlled stop.',
    },
    {
      id: 'no-surge',
      text: 'Avoid a K-2200 surge trip',
      kind: 'avoid',
      category: 'safety',
      penalty: 40,
      critical: true,
      check: (c) => c.mark.surge !== undefined,
      reason: 'K-2200 surged and tripped on high vibration: surge reverses flow through the machine and can wreck the seals and bearings',
      lesson: 'Surge is violent and fast (seconds). Act on the trend, not on the trip.',
    },
    { id: 'tech', text: 'Call the instrument technician to FV-2201', kind: 'do', category: 'time', optional: true, from: 'asv', window: 600, check: (c) => c.did.tech !== undefined },
  ],
  complete: (c) => c.mark.bean !== undefined && c.el > c.mark.bean + 1000 && runningNow(c.s, A.TAGS.compressor) && (c.s.process?.surgeMargin ?? 0) > 5,
  settle: 60,
  maxDuration: 1500,
  ideal: { deferredBoe: 150, note: 'Field choked to 50 % (wells loss) + gas wells at 10 %; compressor kept on line at reduced speed' },
}

// ================================================================= 4 — turbine trip, blackout
const s4: Scenario = {
  id: 'gtg-blackout',
  n: 4,
  title: 'Turbine generator trip: blackout and recovery',
  difficulty: 'intermediate',
  category: 'power',
  platforms: ['Alpha', 'WHP-N', 'LQ'],
  summary: 'GT-8100A (the only turbine on line) flames out. The standby\'s auto-start selector was left in MANUAL after maintenance: blackout, emergency generator, PSD. Instrument air now runs down on its receivers (~13 min).',
  objectives: ['Recover main power: start the standby turbine', 'Reset the blackout PSD and restart in the right order', 'Beat the instrument-air clock'],
  briefing: [
    'GT-8100A on line carrying ≈ 17 MW; GT-8100B on standby after a borescope inspection.',
    'Maintenance left the auto-changeover (standby auto-start) selector in MANUAL: it is not back in AUTO yet.',
    'Drilling in progress. The emergency generator B-9310 is healthy.',
  ],
  expected: [
    'Recognise the blackout: main bus 0 MW, emergency generator running, PSD on Alpha and WHP-N.',
    'Start GT-8100B from the console at once (3 min start sequence).',
    'When main power is back: reset the blackout PSD, then Restart Alpha (WHP-N follows).',
    'Reset the GT-8100A trip so it becomes the standby, and put auto-changeover back to AUTO.',
    'All of it before instrument air reaches PALL (5.5 barg, ≈ 13 min) or a second PSD follows.',
  ],
  hints: ['Machines page: GT-8100B → Start.', 'Shutdown page: reset, then Restart Alpha.', 'K-4600 (instrument air) restarts with the platform restart.'],
  setup: { knobs: { autoChangeover: false } },
  timeline: [
    { id: 'trip', at: 60, label: 'GT-8100A flame-out (fuel gas control valve fault)', run: (c) => c.inject({ kind: 'trip', tag: 'GT-8100A', cause: 'Flame-out: fuel gas control valve fault' }) },
    { id: 'power', when: (c) => c.mark.trip !== undefined && c.el > c.mark.trip + 5 && (c.s.result?.powerAvailable ?? 0) > 0 },
    { id: 'pall', when: (c) => latched(c.s, { causeId: 'ia-ll', since: c.t0 }).length > 0 },
  ],
  goals: [
    { id: 'start-b', text: 'Start the standby turbine GT-8100B', kind: 'do', category: 'time', from: 'trip', window: 120, deadline: 600, check: (c) => on(c.s, 'GT-8100B'), reason: 'GT-8100B was not started promptly: the platform stayed blacked out', lesson: 'In a blackout, power comes first: nothing else can be restarted without it.' },
    { id: 'reset', text: 'Reset the blackout PSD once main power is back', kind: 'do', category: 'time', from: 'power', window: 180, deadline: 900, check: (c) => c.mark.power !== undefined && !latched(c.s, { causeId: 'blackout' }).some((x) => !x.resetAt), reason: 'The blackout PSD was not reset after power was restored' },
    { id: 'restart', text: 'Restart Alpha (WHP-N follows)', kind: 'do', category: 'production', from: 'power', window: 300, deadline: 1200, check: (c) => restarted(c, 'Alpha', 1) || (c.mark.power !== undefined && !anyShutdown(c.s, 'Alpha')), reason: 'Alpha was not restarted after power came back' },
    {
      id: 'no-pall',
      text: 'Restore instrument air before PALL (≈ 13 min)',
      kind: 'avoid',
      category: 'safety',
      penalty: 20,
      check: (c) => c.mark.pall !== undefined,
      reason: 'Instrument air reached PALL-4603: a second PSD because K-4600 was not back before the receivers ran down',
      lesson: 'A blackout starts several clocks at once: instrument air (~13 min) is the one that bites.',
    },
    {
      id: 'producing',
      text: 'Production back above 35 000 bbl/d within 25 min of the trip',
      kind: 'do',
      category: 'production',
      critical: true,
      from: 'trip',
      window: 900,
      deadline: 1500,
      check: (c) => c.mark.power !== undefined && restarted(c, 'Alpha', 35000),
      reason: 'Production was not restored within 25 min of the turbine trip',
    },
    { id: 'reset-a', text: 'Reset GT-8100A so it is available as the standby', kind: 'do', category: 'time', optional: true, from: 'trip', window: 900, check: (c) => c.mark.trip !== undefined && st(c.s, 'GT-8100A') !== 'tripped' },
    { id: 'auto', text: 'Put the auto-changeover back to AUTO', kind: 'do', category: 'time', optional: true, from: 'trip', window: 900, check: (c) => c.mark.trip !== undefined && c.s.knobs?.autoChangeover === true },
  ],
  complete: (c) => (c.s.result?.oilExport ?? 0) >= 40000 && !anyShutdown(c.s, 'Alpha') && c.mark.power !== undefined,
  maxDuration: 2400,
  ideal: { deferredBoe: 350, note: 'GT-8100B started at once, blackout PSD reset and Alpha restarted as soon as it is on line (~3.5 min), wells ramp back over 10 min' },
}

// ================================================================= 5 — instrument air
const s5: Scenario = {
  id: 'instrument-air',
  n: 5,
  title: 'Loss of instrument air: K-4600 trip',
  difficulty: 'foundation',
  category: 'utilities',
  platforms: ['Alpha', 'WHP-N'],
  summary: 'The instrument air compressor K-4600 trips on high discharge temperature (local reset). The air receivers hold the header for ≈ 13 min before PALL forces a PSD: fail-closed valves would otherwise drift shut.',
  objectives: ['Know what instrument air feeds and how long the receivers last', 'Use the field operator for a local reset', 'Restore a single-train utility before it shuts the plant down'],
  briefing: ['Normal operation. K-4600 is a single-train package (no standby compressor); header at 8.6 barg.', 'One field operator is on the production deck, ≈ 3 min from the package.'],
  expected: [
    'Acknowledge the K-4600 trip: it is a machinery-protection trip, reset at the machine only.',
    'Send the field operator to reset K-4600 locally (≈ 3 min).',
    'Start K-4600 from the console as soon as it is reset (1 min start), before the header falls to 6.5 barg (PAL).',
    'Keep an eye on PT-4603: PALL at 5.5 barg shuts the platform down.',
  ],
  hints: ['The scenario panel lists the field operator tasks for locally-reset machines.', 'Trends page: instrument air header.'],
  timeline: [
    { id: 'trip', at: 60, label: 'K-4600 trips: 2nd-stage high discharge temperature (local reset)', run: (c) => c.inject({ kind: 'trip', tag: A.TAGS.iaCompressor, cause: '2nd-stage high discharge temperature', local: true }) },
    { id: 'ialow', when: (c) => (c.s.process?.iaPressure ?? 9) < 6.5 },
    { id: 'pall', when: (c) => latched(c.s, { causeId: 'ia-ll', since: c.t0 }).length > 0 },
  ],
  goals: [
    ackObj('ack', 'Acknowledge the K-4600 trip alarm', A.TAGS.iaCompressor, 'trip', 60),
    { id: 'dispatch', text: 'Send the field operator to reset K-4600 locally', kind: 'do', category: 'time', from: 'trip', window: 120, deadline: 480, check: (c) => c.did[`field:${A.TAGS.iaCompressor}`] !== undefined || st(c.s, A.TAGS.iaCompressor) !== 'tripped', reason: 'The field operator was sent too late (or not at all)', lesson: 'Local resets cost travel time: dispatch first, investigate on the way.' },
    { id: 'start', text: 'Start K-4600 before the header reaches PAL 6.5 barg', kind: 'do', category: 'time', from: 'trip', window: 480, deadline: 760, check: (c) => on(c.s, A.TAGS.iaCompressor), reason: 'K-4600 was not restarted before the air ran out' },
    { id: 'no-pall', text: 'Avoid the PALL-4603 PSD', kind: 'avoid', category: 'safety', penalty: 50, critical: true, check: (c) => c.mark.pall !== undefined, reason: 'Instrument air fell to PALL-4603 (5.5 barg): the platform shut down (PSD)', lesson: 'Instrument air is a single point of failure: ~13 min of receiver hold-up is all you get.' },
  ],
  complete: (c) => runningNow(c.s, A.TAGS.iaCompressor) && (c.s.process?.iaPressure ?? 0) >= 7.8 && !anyShutdown(c.s, 'Alpha'),
  maxDuration: 1500,
  ideal: { deferredBoe: 20, note: 'Field reset in ~4 min, K-4600 back on line, no production lost' },
}

// ================================================================= 6 — confirmed gas at the compressor
const s6: Scenario = {
  id: 'gas-compressor',
  n: 6,
  title: 'Confirmed gas release at the export compressor',
  difficulty: 'intermediate',
  category: 'fire & gas',
  platforms: ['Alpha', 'WHP-N'],
  summary: 'A 2 kg/s flange leak on the K-2200 discharge is seen by two detectors: confirmed gas → automatic ESD2 of the compression zone, blowdown to flare, general alarm. The operator runs the emergency, then the recovery.',
  objectives: ['Run an ESD2: verify, muster, account for POB', 'Isolate the leak before restarting', 'Reset only once the gas has cleared; restart in order'],
  briefing: ['Normal operation, ≈ 49 000 bbl/d. Wind SW 7 m/s: the compression module is upwind of the LQ.', 'A mechanical team re-torqued flanges on the K-2200 discharge yesterday (PTW-2213, closed out).'],
  expected: [
    'Acknowledge the gas alarms; read the F&G page: which zone, how many detectors.',
    'Verify the ESD2 executed: zone ESD valves shut, BDV-2201 open (blowdown), ignition sources off.',
    'Sound the general alarm and muster; check POB.',
    'Once the gas reading has dropped below the high setpoint, send the field team to isolate the leaking flange.',
    'Reset the ESD2 only after the gas has cleared and the leak is isolated, then Restart Alpha.',
  ],
  hints: ['F&G page: zone A-P-COMP.', 'Shutdown page: reset is refused while gas is still detected, the reason tells you why.', 'Restarting with the leak still there re-pressurises it.'],
  setup: { knobs: { wind: { from: 240, speed: 7 } } },
  timeline: [
    { id: 'leak', at: 60, label: '2 kg/s flange leak at the K-2200 discharge', run: (c) => void release(c, 'inc', { kind: 'gasRelease', at: plainPos(c, A.TAGS.compressor)!, rateKgS: 2, source: A.TAGS.compressor, label: 'Flange leak at K-2200 discharge' }) },
    { id: 'esd2', when: (c) => latched(c.s, { platform: 'Alpha', level: 'ESD2', since: c.t0 }).length > 0 },
    { id: 'clear', when: (c) => c.mark.esd2 !== undefined && zoneGas(c.s, c.data.zone as string) === 'normal' },
    goneMark('isolated', 'inc', 'leak'),
  ],
  actions: [
    MUSTER,
    POB,
    {
      id: 'verify',
      label: 'Verify the ESD2 executed (valves, blowdown, ignition sources)',
      who: 'operator',
      available: (c) => c.mark.esd2 !== undefined,
      run: (c) => {
        const ids = new Set((c.s.shutdowns ?? []).map((x) => x.id))
        const closed = Object.entries(c.s.valves ?? {}).filter(([, v]) => v.cmd === 'closed' && v.by && ids.has(v.by))
        const shut = closed.filter(([, v]) => v.pos < 0.05).map(([t]) => t)
        const moving = closed.filter(([, v]) => v.pos >= 0.05).map(([t]) => t)
        return `ESD2 verified: ${shut.length} ESD valves closed (${shut.slice(0, 6).join(', ')}${shut.length > 6 ? ' …' : ''})${moving.length ? `, still stroking: ${moving.join(', ')}` : ''}; ${A.TAGS.bdv.map((b) => `${b} ${Math.round(vpos(c.s, b) * 100)} % open`).join(', ')}; K-2200 ${st(c.s, A.TAGS.compressor)}; HP separator ${(c.s.process?.hpPressure ?? 0).toFixed(1)} barg`
      },
    },
    {
      id: 'isolate',
      label: 'Field (BA team): isolate the leaking flange, close the hand valves either side',
      who: 'field',
      delay: 420,
      available: (c) => c.mark.esd2 !== undefined && !!incident(c.s, c.data.inc) && !['high', 'confirmed'].includes(zoneGas(c.s, c.data.zone as string)),
      detail: 'Only once the zone reads below the high setpoint: the team approaches from upwind in breathing apparatus',
      run: (c) => {
        if (incident(c.s, c.data.inc)) c.act((g) => g.clearIncident(String(c.data.inc)))
        return 'Field team: leaking flange on the K-2200 discharge isolated and depressurised, gas test 0 % LEL'
      },
    },
  ],
  goals: [
    { id: 'verify', text: 'Verify the ESD2 executed', kind: 'do', category: 'time', from: 'esd2', window: 120, deadline: 600, check: (c) => c.did.verify !== undefined, reason: 'The ESD2 actions were not verified', lesson: 'Never assume the safety system did its job: check that the valves moved and blowdown started.' },
    { id: 'muster', text: 'Sound the general alarm and muster', kind: 'do', category: 'safety', penalty: 30, critical: true, from: 'esd2', window: 120, deadline: 300, check: (c) => c.did.muster !== undefined, reason: 'No muster was called for a confirmed gas release', lesson: 'Confirmed gas means people go to muster: the CCR owns that call.' },
    { id: 'pob', text: 'Account for all personnel (POB)', kind: 'do', category: 'safety', penalty: 10, from: 'esd2', window: 600, deadline: 1200, check: (c) => c.did.pob !== undefined, reason: 'POB was not checked after the muster' },
    { id: 'isolate', text: 'Isolate the leak', kind: 'do', category: 'time', from: 'esd2', window: 900, deadline: 1800, check: (c) => c.did.isolate !== undefined, reason: 'The leak was not isolated by the field team', lesson: 'Blowdown empties the inventory; the field team makes it permanent before anyone restarts.' },
    {
      id: 'no-early',
      text: 'Do not restart with the leak still active',
      kind: 'avoid',
      category: 'safety',
      penalty: 25,
      check: (c) => c.mark.esd2 !== undefined && !anyShutdown(c.s, 'Alpha') && !!incident(c.s, c.data.inc),
      reason: 'Alpha was restarted while the leak was still active: re-pressurising a leaking flange',
    },
    noOverEscalation('ESD2'),
    { id: 'restart', text: 'Reset the ESD2 and restart Alpha after the gas has cleared', kind: 'do', category: 'production', from: 'isolated', window: 600, deadline: 1500, check: (c) => restarted(c, 'Alpha', 1), reason: 'Alpha was not restarted after the gas cleared', lesson: 'Reset, then Restart: ESD valves open, the compressor restarts and the wells ramp back over ~10 min.' },
  ],
  complete: (c) => c.mark.isolated !== undefined && restarted(c, 'Alpha', 30000),
  maxDuration: 3000,
  ideal: { deferredBoe: 850, note: 'Verify + muster at once, BA team isolates the leak as soon as the gas drops below the high setpoint, reset and restart when the zone is clear, 10 min ramp' },
}

// ================================================================= 7 — fire at the HP separator
const s7: Scenario = {
  id: 'fire-hp-separator',
  n: 7,
  title: 'Fire at the HP separator',
  difficulty: 'intermediate',
  category: 'fire & gas',
  platforms: ['Alpha', 'WHP-N'],
  summary: 'A pool fire under V-1100 is confirmed by two flame detectors: ESD1 (total platform ESD), full blowdown, deluge in the separation zone, firewater pumps start, turbines change to diesel. The operator verifies, musters and manages the recovery.',
  objectives: ['Run an ESD1 fire emergency from the CCR', 'Verify deluge and firewater', 'Restart only when the fire team declares the area safe'],
  briefing: ['Normal operation, ≈ 49 000 bbl/d. Both diesel firewater pumps on standby (auto on low ring-main pressure).', 'A drain-pot flange under V-1100 was reported weeping on the last round.'],
  expected: [
    'Acknowledge the fire alarms; F&G page: which zone, how many flame detectors.',
    'Sound the general alarm and muster (the GA goes automatically: the PA call and POB check are yours).',
    'Verify deluge released in the zone and the firewater ring main is held by the fire pumps.',
    'Do not reset anything while the fire burns. When it is out, send the fire team to confirm and gas-test.',
    'Reset ESD1, restart Alpha.',
  ],
  hints: ['F&G page → zone A-P-SEP, deluge column.', 'Reset is refused while flame detectors are in alarm.'],
  timeline: [
    { id: 'fire', at: 60, label: '2 MW pool fire under V-1100 (drain-pot flange)', run: (c) => void release(c, 'inc', { kind: 'fire', at: plainPos(c, A.TAGS.sep, 1.5)!, sizeMW: 2, source: A.TAGS.sep, label: 'Pool fire under V-1100' }) },
    { id: 'esd1', when: (c) => latched(c.s, { platform: 'Alpha', level: 'ESD1', since: c.t0 }).length > 0 },
    { id: 'out', when: (c) => c.mark.fire !== undefined && !activeIncidents(c.s, 'fire').some((i) => i.burning) },
  ],
  actions: [
    MUSTER,
    POB,
    {
      id: 'deluge',
      label: 'Verify deluge and firewater (valves open, ring main, fire pumps)',
      who: 'operator',
      available: (c) => c.mark.fire !== undefined,
      run: (c) => {
        const dz = Object.values(c.s.fg ?? {}).filter((z) => z.deluge).map((z) => z.zone)
        const fw = A.TAGS.fwPumps.map((t) => `${t} ${st(c.s, t)}`).join(', ')
        return `Deluge ${dz.length ? `released in ${dz.join(', ')}` : 'NOT released'}; ring main ${(c.s.process?.fwPressure ?? 0).toFixed(1)} barg; ${fw}`
      },
    },
    { id: 'fireteam', label: 'Fire team: confirm the fire is out, cool, gas-test for re-entry', who: 'field', delay: 300, available: (c) => c.mark.out !== undefined, run: fieldReport('Fire team: fire out, steelwork cooled, gas test 0 % LEL, area safe for re-entry; flange to be repaired before restart of V-1100 drains') },
  ],
  goals: [
    { id: 'muster', text: 'Sound the general alarm and muster', kind: 'do', category: 'safety', penalty: 30, critical: true, from: 'esd1', window: 120, deadline: 300, check: (c) => c.did.muster !== undefined, reason: 'No muster was called for a confirmed fire' },
    { id: 'deluge', text: 'Verify deluge released and firewater pressure held', kind: 'do', category: 'safety', penalty: 10, from: 'esd1', window: 180, deadline: 600, check: (c) => c.did.deluge !== undefined, reason: 'Deluge / firewater were not verified', lesson: 'Deluge is the fire\'s main enemy: confirm the valve opened and the pumps hold the ring main.' },
    { id: 'pob', text: 'Account for all personnel (POB)', kind: 'do', category: 'safety', penalty: 10, from: 'esd1', window: 600, deadline: 1200, check: (c) => c.did.pob !== undefined, reason: 'POB was not checked after the muster' },
    { id: 'fireteam', text: 'Have the fire team confirm the area safe', kind: 'do', category: 'time', from: 'out', window: 300, deadline: 1200, check: (c) => c.did.fireteam !== undefined, reason: 'The area was not confirmed safe by the fire team' },
    {
      id: 'no-early',
      text: 'Do not restart before the fire team has declared the area safe',
      kind: 'avoid',
      category: 'safety',
      penalty: 20,
      check: (c) => c.mark.esd1 !== undefined && !anyShutdown(c.s, 'Alpha') && c.did['fireteam:done'] === undefined,
      reason: 'Alpha was restarted before the fire team declared the area safe',
    },
    { id: 'restart', text: 'Reset ESD1 and restart Alpha', kind: 'do', category: 'production', from: 'out', window: 900, deadline: 2100, check: (c) => restarted(c, 'Alpha', 1), reason: 'Alpha was not restarted after the fire' },
  ],
  complete: (c) => c.mark.out !== undefined && restarted(c, 'Alpha', 30000),
  maxDuration: 3600,
  ideal: { deferredBoe: 950, note: 'ESD1 at once, fire out ~11 min, fire team confirms ~5 min later, reset and restart, 10 min ramp' },
}

// ================================================================= 8 — single-detector gas alarm, growing leak
const s8: Scenario = {
  id: 'gas-single-detector',
  n: 8,
  title: 'Single-detector gas alarm in a poorly covered area',
  difficulty: 'advanced',
  category: 'fire & gas',
  platforms: ['Alpha'],
  summary: 'A low-point drain valve under the oil export header starts to weep. Only one detector sees it, the F&G mapping shows this corner of the export area is poorly covered, so voting never confirms. The leak grows; left alone it ignites.',
  objectives: ['Treat a single-detector alarm as real until proven otherwise', 'Investigate safely and fast', 'Take the decision to shut down manually at the right level (ESD2) before escalation'],
  briefing: [
    'Normal operation. The night shift drained the oil export header for a valve change at the LV-1301 station and re-pressurised it at 05:30.',
    'F&G mapping (console → F&G, viewer → Layers → F&G heatmap) shows the export area A-P-EXP below its gas-coverage target.',
    'Wind SW 7 m/s.',
  ],
  expected: [
    'Acknowledge the gas alarm; on the F&G page note it is ONE detector: voting will not confirm it.',
    'Check CCTV and send the field operator with a portable detector (upwind approach).',
    'Suspend hot work and crane operations.',
    'When the leak is confirmed (or the reading climbs), initiate a manual ESD2 for zone A-P-EXP, isolation + blowdown, before it escalates.',
    'Muster after the ESD; do not over-escalate to ESD1.',
  ],
  hints: ['Shutdown page → ESD2 push-button, choose the zone.', 'A single high detector in a poorly covered zone may be the only warning you get.'],
  setup: { knobs: { wind: { from: 240, speed: 7 } } },
  timeline: [
    {
      id: 'leak1',
      at: 60,
      label: 'Export header low-point drain weeping: 0.5 kg/s',
      run: (c) => {
        // under the 10" export header between the pumps and the LV-1301 station (deck-local), in zone A-P-EXP
        c.data.at = [18.5, 1, -12] as [number, number, number]
        release(c, 'inc1', { kind: 'gasRelease', at: c.data.at as [number, number, number], rateKgS: 0.5, source: '10"-PO-1601-D6A-N', label: 'Export header low-point drain' })
      },
    },
    { id: 'alarm', when: (c) => c.mark.leak1 !== undefined && zoneGas(c.s, c.data.zone as string) !== 'normal' },
    { id: 'isolated', when: (c) => latched(c.s, { platform: 'Alpha', since: c.t0 }).some((x) => x.level !== 'USD') },
    { id: 'leak2', after: ['leak1', 480], only: (c) => c.mark.isolated === undefined, label: 'Drain valve failing: leak grows by 1.5 kg/s', run: (c) => void release(c, 'inc2', { kind: 'gasRelease', at: c.data.at as [number, number, number], rateKgS: 1.5, source: '10"-PO-1601-D6A-N', label: 'Export header drain failing' }) },
    { id: 'leak3', after: ['leak1', 960], only: (c) => c.mark.isolated === undefined, label: 'Drain valve blown: another 3 kg/s', run: (c) => void release(c, 'inc3', { kind: 'gasRelease', at: c.data.at as [number, number, number], rateKgS: 3, source: '10"-PO-1601-D6A-N', label: 'Export header drain blown' }) },
    { id: 'confirmed', when: (c) => latched(c.s, { causeId: 'gas-confirmed', since: c.t0 }).length > 0 && c.mark.manual === undefined },
    { id: 'manual', when: (c) => latched(c.s, { platform: 'Alpha', causeId: 'manual', since: c.t0 }).length > 0 && c.mark.confirmed === undefined },
    {
      id: 'ignite',
      after: ['leak1', 1200],
      only: (c) => c.mark.isolated === undefined && activeIncidents(c.s, 'gasRelease').length > 0,
      label: 'Unisolated leak ignites (hot surface): 10 MW jet fire',
      run: (c) => void release(c, 'fire', { kind: 'fire', at: c.data.at as [number, number, number], sizeMW: 10, source: '10"-PO-1601-D6A-N', label: 'Ignited leak at the export header' }),
    },
  ],
  actions: [
    cctv((c) => (activeIncidents(c.s, 'gasRelease').length ? 'CCTV camera 12: faint vapour haze under the oil export header, no flame' : 'CCTV camera 12: nothing visible under the export header')),
    {
      id: 'investigate',
      label: 'Field: investigate the gas alarm with a portable detector (approach from upwind)',
      who: 'field',
      delay: 240,
      run: (c) => (activeIncidents(c.s, 'gasRelease').length ? 'Field operator: audible hiss at the export header low-point drain, portable detector 45 % LEL at 2 m, LEAK CONFIRMED, withdrawing upwind' : 'Field operator: nothing found at the export header, portable detector 0 % LEL'),
    },
    HOTWORK,
    MUSTER,
    POB,
  ],
  goals: [
    { id: 'investigate', text: 'Investigate the alarm (CCTV / field operator)', kind: 'do', category: 'time', from: 'alarm', window: 180, deadline: 600, check: (c) => c.did.investigate !== undefined || c.did.cctv !== undefined, reason: 'The single-detector alarm was not investigated', lesson: 'A single detector cannot vote: your investigation is the second "detector".' },
    { id: 'hotwork', text: 'Suspend hot work and crane operations', kind: 'do', category: 'safety', penalty: 10, from: 'alarm', window: 180, deadline: 600, check: (c) => c.did.hotwork !== undefined, reason: 'Hot work and cranes were not suspended on the gas alarm', lesson: 'Remove ignition sources on any gas alarm: that is what the C&E "gas high" row asks for.' },
    {
      id: 'shutdown',
      text: 'Shut down manually before the leak escalates',
      kind: 'do',
      category: 'safety',
      penalty: 40,
      critical: true,
      from: 'alarm',
      window: 600,
      deadline: 1080,
      check: (c) => c.mark.manual !== undefined,
      reason: 'No manual shutdown before the leak escalated: the operator waited for the F&G voting that this zone cannot deliver',
      lesson: 'Where detection is poor, the operator must make the ESD decision on investigation evidence.',
    },
    {
      id: 'esd2',
      text: 'Use ESD2 for zone A-P-EXP (isolation + blowdown)',
      kind: 'do',
      category: 'safety',
      penalty: 10,
      from: 'alarm',
      window: 900,
      deadline: 1200,
      check: (c) => latched(c.s, { platform: 'Alpha', level: 'ESD2', causeId: 'manual', since: c.t0 }).length > 0,
      reason: 'ESD2 of the zone (isolation + blowdown) was not used: a PSD alone isolates but does not blow down the leaking inventory',
    },
    { id: 'no-esc', text: 'Avoid escalation (confirmed gas / ignition)', kind: 'avoid', category: 'safety', penalty: 40, critical: true, check: (c) => c.mark.confirmed !== undefined || c.mark.ignite !== undefined, reason: 'The leak escalated: confirmed gas / ignition before the operator acted', lesson: 'Leaks grow. Minutes spent waiting for certainty are minutes the inventory feeds the leak.' },
    noOverEscalation('ESD2'),
    { id: 'muster', text: 'Muster after the shutdown', kind: 'do', category: 'safety', penalty: 15, from: 'isolated', window: 180, deadline: 600, check: (c) => c.did.muster !== undefined, reason: 'No muster after the gas shutdown' },
  ],
  complete: (c) => c.mark.isolated !== undefined && c.el > c.mark.isolated + 600 && zoneGas(c.s, c.data.zone as string) === 'normal',
  settle: 60,
  maxDuration: 2400,
  ideal: { deferredBoe: 550, note: 'Leak confirmed by the field ~5 min after the alarm, manual ESD2 at once; plant stays down for the repair' },
}

// ================================================================= 9 — cooling
const s9: Scenario = {
  id: 'cooling-seawater',
  n: 9,
  title: 'Cooling failure: seawater lift pump trip, standby fails',
  difficulty: 'intermediate',
  category: 'utilities',
  platforms: ['Alpha'],
  summary: 'Seawater lift pump P-6400A trips on vibration (repair needed). The auto-started P-6400B trips on low discharge pressure: its suction strainer is blocked. With no seawater the cooling medium heats up; K-2200 trips on TAHH 55 °C in ≈ 7.7 min.',
  objectives: ['Follow a utility failure to its process consequence', 'Use the field operator for a local fix under time pressure', 'Know which pump can be recovered and which cannot'],
  briefing: ['Normal operation. Cooling medium supply at 32 °C. Seawater lift P-6400A duty, P-6400B standby on AUTO.', 'Marine growth was found in the P-6400B strainer last month.'],
  expected: [
    'Acknowledge both pump trips; read the causes: P-6400A needs repair, P-6400B a local reset after the strainer is cleaned.',
    'Send the field operator to clean the P-6400B strainer and reset it (≈ 4 min).',
    'Start P-6400B from the console before the cooling medium reaches 55 °C.',
  ],
  hints: ['Trends / Process page: cooling medium TT-6303.', 'P-6400A is under repair: resetting it will be refused.'],
  timeline: [
    {
      id: 'trip',
      at: 60,
      label: 'P-6400A trips (vibration, repair 8 h); auto-started P-6400B trips (strainer blocked)',
      run: (c) => {
        c.inject({ kind: 'trip', tag: 'P-6400A', cause: 'High vibration: motor NDE bearing', local: true, repairH: 8 })
        c.inject({ kind: 'trip', tag: 'P-6400B', cause: 'Low discharge pressure on start: suction strainer blocked', local: true })
      },
    },
    { id: 'hot', when: (c) => (c.s.process?.cmTemp ?? 0) >= 45 },
    { id: 'k2trip', when: (c) => st(c.s, A.TAGS.compressor) === 'tripped' && /cooling|temperature/i.test(c.s.machines?.[A.TAGS.compressor]?.tripCause ?? '') },
  ],
  actions: [
    {
      id: 'strainer',
      label: 'Field: clean the P-6400B suction strainer and reset the pump locally',
      who: 'field',
      delay: 240,
      run: (c) => {
        const r = c.act((g) => g.resetTrip('P-6400B', { local: true }))
        return r ? `Field operator at P-6400B: ${r}` : 'Field operator: P-6400B strainer cleaned (mussel shell), pump reset locally, ready to start'
      },
    },
  ],
  goals: [
    ackObj('ack', 'Acknowledge the seawater pump trip alarms', 'P-6400B', 'trip', 60),
    { id: 'dispatch', text: 'Send the field operator to P-6400B', kind: 'do', category: 'time', from: 'trip', window: 120, deadline: 360, check: (c) => c.did.strainer !== undefined || c.did['field:P-6400B'] !== undefined, reason: 'The field operator was not sent to P-6400B in time' },
    { id: 'start', text: 'Start P-6400B before the cooling medium reaches 55 °C', kind: 'do', category: 'time', from: 'trip', window: 360, deadline: 460, check: (c) => on(c.s, 'P-6400B'), reason: 'P-6400B was not running before the cooling medium reached TAHH' },
    { id: 'no-k2', text: 'Avoid the K-2200 high-temperature trip', kind: 'avoid', category: 'safety', penalty: 35, critical: true, check: (c) => c.mark.k2trip !== undefined, reason: 'K-2200 tripped on TAHH-6303 (cooling medium 55 °C): gas went to flare', lesson: 'A utility failure shows up as a process trip somewhere else: follow the chain: seawater → cooling medium → compressor.' },
    {
      id: 'leave-a',
      text: 'Do not try to restart P-6400A (under repair)',
      kind: 'avoid',
      category: 'safety',
      penalty: 5,
      check: (c) => operatorActions(c).some((a) => a.tag === 'P-6400A' && a.action === 'start'),
      reason: 'Tried to start P-6400A while it was under repair',
    },
  ],
  complete: (c) => runningNow(c.s, 'P-6400B') && (c.s.process?.cmTemp ?? 99) < 38 && runningNow(c.s, A.TAGS.compressor),
  maxDuration: 1500,
  ideal: { deferredBoe: 20, note: 'Strainer cleaned and P-6400B on line within ~5 min; compressor never trips' },
}

// ================================================================= 10 — riser leak on RP
const s10: Scenario = {
  id: 'rp-riser-leak',
  n: 10,
  title: 'Riser leak on RP: export lost',
  difficulty: 'advanced',
  category: 'export',
  platforms: ['RP', 'Alpha', 'WHP-N'],
  summary: 'A gas release at the RP riser topsides puts RP into ESD: the riser ESD valves close, so Alpha can no longer export oil. The HP separator fills; unless the operator cuts production, LAHH trips Alpha.',
  objectives: ['See the knock-on of a remote platform shutdown on the host', 'Cut production in time', 'Recover in order: RP first, then Alpha'],
  requires: { tags: [rp.oilRiser, rp.gasRiser, rp.oilMeter], why: 'needs the RP riser & export platform' },
  briefing: ['Normal operation. RP (normally unattended) carries the oil and gas export risers; its ESD valves close on an RP ESD.', 'Wind SW 7 m/s.'],
  expected: [
    'Acknowledge the RP gas / ESD alarms; note the export path is now closed.',
    'Cut Alpha production at once (chokes to ≤ 20 % or a controlled PSD): the separator has ~5 min of hold-up.',
    'Confirm RP is unmanned and nobody is on the bridge.',
    'When the RP gas has cleared: reset and restart RP, then restore Alpha.',
  ],
  hints: ['Overview: RP lamp. Process page: export flow and HP level.', 'A controlled PSD is better than an LAHH trip.'],
  setup: { knobs: { wind: { from: 240, speed: 7 } } },
  timeline: [
    { id: 'leak', at: 60, label: '2 kg/s release at the RP gas riser topsides', run: (c) => void release(c, 'inc', { kind: 'gasRelease', at: pointAt(c.plant, rp.gasRiser, 1) ?? pointAt(c.plant, rp.oilRiser, 1)!, rateKgS: 2, source: rp.gasRiser, label: 'RP gas riser topsides flange' }) },
    {
      id: 'rpesd',
      after: ['leak', 120],
      only: (c) => !anyShutdown(c.s, 'RP'),
      label: 'RP F&G confirms gas → ESD2 on RP',
      run: (c) => c.act((g) => g.initiate('ESD2', 'RP', c.data.zone as string | undefined, 'RP F&G: confirmed gas at the risers')),
    },
    { id: 'rpdown', when: (c) => anyShutdown(c.s, 'RP') },
    ...lahMarks,
    { id: 'clear', when: (c) => c.mark.rpdown !== undefined && !incident(c.s, c.data.inc) },
  ],
  actions: [{ id: 'unmanned', label: 'Confirm RP is unmanned and the bridge is clear (radio / POB board)', who: 'operator', run: fieldReport('POB board: nobody on RP or the west bridge') }, MUSTER],
  goals: [
    { id: 'cut', text: 'Cut Alpha production (≤ 20 %) or shut Alpha in under control', kind: 'do', category: 'time', from: 'rpdown', window: 120, deadline: 240, check: (c) => chokeFactor(c.s, c.plant) <= 0.2 || latched(c.s, { platform: 'Alpha', causeId: 'manual', since: c.t0 }).length > 0, reason: 'Alpha production was not cut after export was lost', lesson: 'A remote shutdown is your problem too: no export means the host separator fills.' },
    noLahh(),
    { id: 'unmanned', text: 'Confirm RP is unmanned', kind: 'do', category: 'safety', penalty: 10, from: 'rpdown', window: 300, deadline: 900, check: (c) => c.did.unmanned !== undefined, reason: 'Nobody checked that RP and the bridge were clear of people' },
    { id: 'restart', text: 'Restart RP once the gas has cleared, then restore Alpha', kind: 'do', category: 'production', optional: true, from: 'clear', window: 900, check: (c) => !anyShutdown(c.s, 'RP') && (c.s.result?.oilExport ?? 0) > 25000 },
  ],
  complete: (c) => c.mark.clear !== undefined && !anyShutdown(c.s, 'RP') && (c.s.result?.oilExport ?? 0) > 30000,
  maxDuration: 3000,
  ideal: { deferredBoe: 1050, note: 'Alpha choked back within 2 min of the RP ESD, RP restarted after the gas cleared, Alpha restored' },
}

// ================================================================= 11 — water injection pump trip
const s11: Scenario = {
  id: 'wi-pump-trip',
  n: 11,
  title: 'Water injection pump trip: reservoir support lost',
  difficulty: 'foundation',
  category: 'utilities',
  platforms: ['WI', 'WHP-N'],
  summary: 'Injection pump P-W310A trips on vibration (local reset). Injection halves, the reservoir pressure starts to fall and production efficiency declines slowly: the loss is booked to "reservoir". 2.6 MW of power is freed.',
  objectives: ['Recognise a slow, quiet loss (no alarm flood, no trip of the process)', 'Use the field operator on a remote platform', 'Restore injection within the reservoir window'],
  requires: { tags: [...wi.injPumps], why: 'needs the WI water-injection platform' },
  briefing: ['Both injection pumps P-W310A / B running (2 × 50 %), ≈ 40 000 bwpd into XT-N106. Reservoir pressure at 100 %.', 'WI is reached over the bridge from WHP-N (≈ 7 min walk).'],
  expected: [
    'Acknowledge the P-W310A trip; note injection has halved (Overview / KPIs: reservoir).',
    'Send the field operator to WI to reset P-W310A locally.',
    'Restart P-W310A within 30 minutes.',
  ],
  hints: ['KPIs: deferred production by category, watch "Reservoir support".'],
  timeline: [{ id: 'trip', at: 60, label: 'P-W310A trips: pump DE bearing vibration (local reset)', run: (c) => c.inject({ kind: 'trip', tag: wi.injPumps[0], cause: 'High vibration: pump DE bearing', local: true }) }],
  goals: [
    ackObj('ack', 'Acknowledge the P-W310A trip', wi.injPumps[0], 'trip', 120),
    { id: 'dispatch', text: 'Send the field operator to WI to reset P-W310A', kind: 'do', category: 'time', from: 'trip', window: 300, deadline: 900, check: (c) => c.did[`field:${wi.injPumps[0]}`] !== undefined || st(c.s, wi.injPumps[0]) !== 'tripped', reason: 'Nobody was sent to WI' },
    { id: 'restart', text: 'Restart P-W310A within 30 min', kind: 'do', category: 'production', critical: true, from: 'trip', window: 1200, deadline: 1800, check: (c) => on(c.s, wi.injPumps[0]), reason: 'Injection was not restored within 30 minutes', lesson: 'Reservoir losses are slow and invisible on the alarm list, but they are real barrels.' },
  ],
  complete: (c) => runningNow(c.s, wi.injPumps[0]) && (c.s.process?.wiRate ?? 0) >= 39000,
  maxDuration: 2700,
  ideal: { deferredBoe: 20, note: 'Field reset at WI ~10 min after the trip, pump back on line' },
}

// ================================================================= 12 — night shift
const s12: Scenario = {
  id: 'night-shift',
  n: 12,
  title: 'The night shift: seal failure during a high-wind crane lift, then a gas alarm',
  difficulty: 'advanced',
  category: 'combined',
  platforms: ['Alpha'],
  summary: 'A crane lift is under way in 16 m/s wind. Export pump P-1500A\'s seal fails and leaks; the standby takes over. Later a second, separate leak starts at the K-2200 discharge: small at first, then growing.',
  objectives: ['Hold the big picture through overlapping events', 'Stop simultaneous operations (crane) when the risk changes', 'Make the manual ESD decision on evidence'],
  briefing: [
    'Night shift. Crane lift of a container from the supply boat to the pipe deck is in progress; wind WNW 16 m/s and rising (lifting limit 15 m/s).',
    'All wells on line, ≈ 49 000 bbl/d. P-1500A duty, P-1500B standby on AUTO.',
    'One field operator and the crane crew on deck; everyone else in bed.',
  ],
  expected: [
    'Stop the crane lift now: the wind is above the lifting limit (and must be stopped on any gas alarm).',
    'P-1500A seal failure: confirm P-1500B took over, acknowledge, get P-1500A isolated by the field operator (that stops its leak).',
    'Second gas alarm in the compression area: CCTV / field investigation; suspend hot work.',
    'When the leak grows, initiate a manual ESD2 of zone A-P-COMP before the F&G confirms it; muster.',
  ],
  hints: ['Two leaks, two zones: A-P-EXP (pump) and A-P-COMP (compressor).', 'The crane is a SIMOPS hazard: a dropped load or a spark in a gas cloud.'],
  setup: { knobs: { wind: { from: 300, speed: 16 }, seaState: 2.5 } },
  timeline: [
    {
      id: 'seal',
      at: 120,
      label: 'P-1500A mechanical seal failure: trip + 0.5 kg/s seal leak',
      run: (c) => {
        c.inject({ kind: 'trip', tag: 'P-1500A', cause: 'Mechanical seal failure: seal leak detected', local: true, repairH: 6 })
        release(c, 'seal', { kind: 'gasRelease', at: plainPos(c, 'P-1500A')!, rateKgS: 0.5, source: 'P-1500A', label: 'P-1500A seal leak' })
        c.data.zone = undefined
      },
    },
    { id: 'gas1', when: (c) => c.mark.seal !== undefined && Object.values(c.s.fg ?? {}).some((z) => z.gas !== 'normal') },
    {
      id: 'leak',
      at: 900,
      label: '1 kg/s weep at the K-2200 discharge flange',
      run: (c) => {
        c.data.at = plainPos(c, A.TAGS.compressor)
        release(c, 'comp', { kind: 'gasRelease', at: c.data.at as [number, number, number], rateKgS: 1, source: A.TAGS.compressor, label: 'K-2200 discharge flange weep' })
        c.data.zone = zoneOfPoint(c.plant, c.data.at as [number, number, number])
      },
    },
    { id: 'gas2', when: (c) => c.mark.leak !== undefined && zoneGas(c.s, c.data.zone as string) !== 'normal' },
    { id: 'down', when: (c) => c.mark.leak !== undefined && latched(c.s, { platform: 'Alpha', since: c.t0 }).some((x) => x.level !== 'USD') },
    { id: 'manual', when: (c) => c.mark.leak !== undefined && latched(c.s, { platform: 'Alpha', causeId: 'manual', since: c.t0 }).length > 0 && c.mark.auto === undefined },
    { id: 'auto', when: (c) => latched(c.s, { causeId: 'gas-confirmed', since: c.t0 }).length > 0 && c.mark.manual === undefined },
    { id: 'grow', at: 1380, only: (c) => c.mark.down === undefined, label: 'K-2200 flange leak grows by 1.5 kg/s', run: (c) => void release(c, 'comp2', { kind: 'gasRelease', at: c.data.at as [number, number, number], rateKgS: 1.5, source: A.TAGS.compressor, label: 'K-2200 discharge flange leak growing' }) },
  ],
  actions: [
    { id: 'crane', label: 'Radio the crane operator: land the load and secure the crane', who: 'operator', run: fieldReport('Crane operator: load landed on the pipe deck, boom in the rest, crane secured') },
    {
      id: 'isolateP',
      label: 'Field: isolate P-1500A (close suction & discharge, drain and vent)',
      who: 'field',
      delay: 300,
      run: (c) => {
        if (incident(c.s, c.data.seal)) c.act((g) => g.clearIncident(String(c.data.seal)))
        return 'Field operator: P-1500A isolated, drained and vented, seal leak stopped'
      },
    },
    cctv((c) => (c.mark.leak !== undefined && activeIncidents(c.s, 'gasRelease').length ? 'CCTV: vapour plume at the K-2200 discharge flange, drifting ESE' : c.mark.seal !== undefined ? 'CCTV: liquid spray and vapour at the P-1500A seal' : 'CCTV: nothing unusual')),
    {
      id: 'investigate',
      label: 'Field: investigate the compression-area gas alarm (portable detector, upwind)',
      who: 'field',
      delay: 240,
      available: (c) => c.mark.leak !== undefined,
      run: (c) => (incident(c.s, c.data.comp) ? 'Field operator: leak at the K-2200 discharge flange, 30 % LEL at 3 m and rising, LEAK CONFIRMED' : 'Field operator: nothing found in the compression area'),
    },
    HOTWORK,
    MUSTER,
    POB,
  ],
  goals: [
    { id: 'crane', text: 'Stop the crane lift (wind above the 15 m/s limit)', kind: 'do', category: 'safety', penalty: 20, window: 300, deadline: 900, check: (c) => c.did.crane !== undefined || c.did.hotwork !== undefined, reason: 'The crane lift continued in wind above the lifting limit and during a gas alarm', lesson: 'SIMOPS: when the risk picture changes, stop the activities that do not need to happen now.' },
    ackObj('ack', 'Acknowledge the P-1500A trip and gas alarms', 'P-1500A', 'seal', 120),
    { id: 'isolateP', text: 'Have P-1500A isolated (stops the seal leak)', kind: 'do', category: 'time', from: 'seal', window: 600, deadline: 1200, check: (c) => c.did.isolateP !== undefined, reason: 'P-1500A was not isolated: its seal kept leaking' },
    { id: 'investigate', text: 'Investigate the compression-area gas alarm', kind: 'do', category: 'time', from: 'gas2', window: 180, deadline: 420, check: (c) => c.did.investigate !== undefined || (c.mark.gas2 !== undefined && c.did.cctv !== undefined && c.did.cctv >= c.mark.gas2) },
    {
      id: 'shutdown',
      text: 'Manual ESD2 of A-P-COMP before the F&G confirms the gas',
      kind: 'do',
      category: 'safety',
      penalty: 40,
      critical: true,
      from: 'gas2',
      window: 360,
      deadline: 480,
      check: (c) => c.mark.manual !== undefined,
      reason: 'No manual shutdown before the growing leak was confirmed by the F&G',
      lesson: 'On a confirmed leak (field report) you do not need two detectors to act.',
    },
    { id: 'no-auto', text: 'Avoid escalation to confirmed gas', kind: 'avoid', category: 'safety', penalty: 20, check: (c) => c.mark.auto !== undefined, reason: 'The leak grew until the F&G confirmed it (automatic ESD2)' },
    noOverEscalation('ESD2'),
    { id: 'muster', text: 'Muster after the shutdown', kind: 'do', category: 'safety', penalty: 15, from: 'down', window: 180, deadline: 600, check: (c) => c.did.muster !== undefined, reason: 'No muster after the gas shutdown' },
  ],
  complete: (c) => c.mark.down !== undefined && c.el > c.mark.down + 600,
  settle: 60,
  maxDuration: 2700,
  ideal: { deferredBoe: 550, note: 'Crane stopped at once, P-1500A isolated, manual ESD2 ~4 min after the second alarm' },
}

export const SCENARIOS: Scenario[] = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12]
export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]))

/** null when the plant has what the scenario needs, else why not */
export function unavailable(sc: Scenario, plant: { equipment: { tag: string }[]; valves: { tag: string }[]; custom?: unknown }): string | null {
  if (plant.custom || !plant.equipment.some((e) => e.tag === A.TAGS.sep)) return 'needs the Alpha field (V-1100)'
  if (!sc.requires) return null
  const missing = sc.requires.tags.filter((t) => !plant.equipment.some((e) => e.tag === t) && !plant.valves.some((v) => v.tag === t))
  return missing.length ? `${sc.requires.why} (missing ${missing.join(', ')})` : null
}

/** field-operator travel time to a machine, by platform, sim s */
export function travelTime(p: PlatformId): number {
  return p === 'Alpha' ? 180 : p === 'LQ' ? 150 : p === 'WHP-N' ? 360 : 420
}

export { fmtEl, wellsOf }
