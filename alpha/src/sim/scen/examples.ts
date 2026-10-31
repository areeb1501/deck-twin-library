/**
 * Built-in scenarios written as specs. They teach a model the format (agents/scenarioPrompt.ts), and tests/scenario-spec.test.ts
 * runs each beside its hand-written twin in sim/scen/library.ts under the same scripted response, so the two must stay equal.
 */
import type { Cond, GoalSpec, ScenarioSpec } from './spec'

const noAlphaShutdown: Cond = { is: 'not', cond: { is: 'anyShutdown', platform: 'Alpha' } }

const ack = (id: string, text: string, tag: string, from: string, window = 60): GoalSpec => ({
  id,
  text,
  kind: 'do',
  category: 'alarms',
  from,
  window,
  deadline: window * 4,
  check: { is: 'acked', tag },
  reason: `${text}, not done within ${window} s`,
  lesson: 'Acknowledge first, then act: an acknowledged alarm tells the rest of the team someone owns it.',
})

/** library.ts s1: a control valve fails, a ticking level, a field action that clears the fault */
export const SPEC_LEVEL: ScenarioSpec = {
  version: 1,
  title: 'HP separator high level: LV-1101 fails closed',
  difficulty: 'foundation',
  category: 'process',
  platforms: ['Alpha', 'WHP-N'],
  summary: 'The HP separator oil level controller output fails low and LV-1101 drives shut. With no oil leaving V-1100 the level climbs to LAH in ~3.5 min and LAHH (PSD) under 2 min later.',
  objectives: ['Recognise a rising level from the LAH alarm and the trend', 'Cut production fast enough to stop LAHH', 'Get the control valve bypassed and recover production'],
  briefing: ['Day shift, normal operation. All ten wells on line at 60 % choke, ≈ 49 000 bbl/d export, both platforms producing.', 'The instrument technician reported LIC-1101 (HP separator oil level) "hunting" last night; a work order is open.'],
  expected: ['Acknowledge LT-1101 high (LAH 72 %).', 'Cut inflow immediately: choke every well down to ≤ 20 % before the level reaches LAHH 83 %.', 'Send the field operator to line up the LV-1101 bypass.', 'When the level is back below 65 %, bring the wells back to 60 %.'],
  hints: ['Look at the Process page: what is LV-1101 doing while the level rises?', 'The level rises at about 0.11 %/s at full inflow: every minute counts.'],
  timeline: [
    { id: 'fault0', at: 90, label: 'LIC-1101 output fails low: LV-1101 strokes closed', do: [{ do: 'setValve', tag: 'LV-1101', cmd: 'closed' }] },
    { id: 'fault', after: { step: 'fault0', seconds: 0 }, when: { is: 'valve', tag: 'LV-1101', op: '<', value: 0.05 }, label: 'LV-1101 stuck closed', do: [{ do: 'levelControlFail', tag: 'LV-1101', key: 'inc' }] },
    { id: 'lah', when: { is: 'metric', metric: 'hpLevel', op: '>=', value: 72 } },
    { id: 'lahh', when: { is: 'shutdown', cause: 'lahh-1101' } },
    { id: 'fixed', when: { is: 'all', of: [{ is: 'fired', step: 'fault' }, { is: 'not', cond: { is: 'incident', incident: 'inc' } }] } },
  ],
  actions: [
    {
      id: 'bypass',
      label: 'Field: line up the LV-1101 bypass and control the level by hand',
      who: 'field',
      delay: 180,
      available: { is: 'incident', incident: 'inc' },
      detail: 'The field operator opens the bypass globe valve around LV-1101 (≈ 3 min to get there and line up)',
      do: [{ do: 'clear', incident: 'inc' }],
      reports: [{ text: 'Field operator: LV-1101 bypass lined up, level under hand control, LV-1101 isolated for the technician' }],
    },
  ],
  goals: [
    ack('ack-lah', 'Acknowledge the LAH alarm on LT-1101', 'LT-1101', 'lah'),
    { id: 'cut', text: 'Cut production to ≤ 30 % of potential before LAHH', kind: 'do', category: 'time', from: 'fault', window: 180, deadline: 260, check: { is: 'metric', metric: 'chokeFactor', op: '<=', value: 0.3 }, reason: 'Production was not cut back before the level reached LAHH', lesson: 'With the outflow gone, only cutting the inflow buys time. Choke back hard first; restore later.' },
    { id: 'bypass', text: 'Send a field operator to bypass LV-1101', kind: 'do', category: 'time', from: 'fault', window: 240, deadline: 600, check: { is: 'ordered', action: 'bypass' }, reason: 'The LV-1101 bypass was not ordered promptly', lesson: 'Fix the cause in parallel with the mitigation: the field operator needs minutes to get there.' },
    { id: 'no-lahh', text: 'Avoid the LAHH-1101 trip (PSD at 83 %)', kind: 'avoid', category: 'safety', penalty: 50, critical: true, check: { is: 'fired', step: 'lahh' }, reason: 'LAHH-1101 tripped the platform (PSD): inflow was not cut back in time', lesson: 'From LAH (72 %) to LAHH (83 %) takes under 2 minutes at full inflow. Cut the chokes FIRST, then fix the cause.' },
    { id: 'restore', text: 'Restore production once the level is under control', kind: 'do', category: 'production', from: 'fixed', window: 360, deadline: 1200, check: { is: 'all', of: [{ is: 'metric', metric: 'chokeFactor', op: '>=', value: 0.9 }, noAlphaShutdown, { is: 'metric', metric: 'hpLevel', op: '<', value: 72 }] }, reason: 'Production was not restored after the level was recovered', lesson: 'Deferred production is lost for good: bring the wells back once the level is back near normal.' },
  ],
  complete: { is: 'all', of: [{ is: 'fired', step: 'fixed' }, { is: 'metric', metric: 'chokeFactor', op: '>=', value: 0.9 }, noAlphaShutdown, { is: 'metric', metric: 'hpLevel', op: '<', value: 65 }] },
  maxDuration: 1800,
  ideal: { deferredBoe: 300, note: 'Chokes cut to 5 % as the level passes 70 %, bypass ordered at once (3 min), wells back at 60 % once the level is below 60 %' },
}

/** library.ts s5: a local-reset trip, the automatic field:<machine> order, a slow clock */
export const SPEC_AIR: ScenarioSpec = {
  version: 1,
  title: 'Loss of instrument air: K-4600 trip',
  difficulty: 'foundation',
  category: 'utilities',
  platforms: ['Alpha', 'WHP-N'],
  summary: 'The instrument air compressor K-4600 trips on high discharge temperature (local reset). The air receivers hold the header for ≈ 13 min before PALL forces a PSD: fail-closed valves would otherwise drift shut.',
  objectives: ['Know what instrument air feeds and how long the receivers last', 'Use the field operator for a local reset', 'Restore a single-train utility before it shuts the plant down'],
  briefing: ['Normal operation. K-4600 is a single-train package (no standby compressor); header at 8.6 barg.', 'One field operator is on the production deck, ≈ 3 min from the package.'],
  expected: ['Acknowledge the K-4600 trip: it is a machinery-protection trip, reset at the machine only.', 'Send the field operator to reset K-4600 locally (≈ 3 min).', 'Start K-4600 from the console as soon as it is reset (1 min start), before the header falls to 6.5 barg (PAL).', 'Keep an eye on PT-4603: PALL at 5.5 barg shuts the platform down.'],
  hints: ['The scenario panel lists the field operator tasks for locally-reset machines.', 'Trends page: instrument air header.'],
  timeline: [
    { id: 'trip', at: 60, label: 'K-4600 trips: 2nd-stage high discharge temperature (local reset)', do: [{ do: 'trip', tag: 'K-4600', cause: '2nd-stage high discharge temperature', local: true }] },
    { id: 'ialow', when: { is: 'metric', metric: 'iaPressure', op: '<', value: 6.5 } },
    { id: 'pall', when: { is: 'shutdown', cause: 'ia-ll' } },
  ],
  goals: [
    ack('ack', 'Acknowledge the K-4600 trip alarm', 'K-4600', 'trip'),
    { id: 'dispatch', text: 'Send the field operator to reset K-4600 locally', kind: 'do', category: 'time', from: 'trip', window: 120, deadline: 480, check: { is: 'any', of: [{ is: 'ordered', action: 'field:K-4600' }, { is: 'not', cond: { is: 'machine', tag: 'K-4600', state: 'tripped' } }] }, reason: 'The field operator was sent too late (or not at all)', lesson: 'Local resets cost travel time: dispatch first, investigate on the way.' },
    { id: 'start', text: 'Start K-4600 before the header reaches PAL 6.5 barg', kind: 'do', category: 'time', from: 'trip', window: 480, deadline: 760, check: { is: 'machine', tag: 'K-4600', state: 'on' }, reason: 'K-4600 was not restarted before the air ran out' },
    { id: 'no-pall', text: 'Avoid the PALL-4603 PSD', kind: 'avoid', category: 'safety', penalty: 50, critical: true, check: { is: 'fired', step: 'pall' }, reason: 'Instrument air fell to PALL-4603 (5.5 barg): the platform shut down (PSD)', lesson: 'Instrument air is a single point of failure: ~13 min of receiver hold-up is all you get.' },
  ],
  complete: { is: 'all', of: [{ is: 'machine', tag: 'K-4600', state: 'running' }, { is: 'metric', metric: 'iaPressure', op: '>=', value: 7.8 }, noAlphaShutdown] },
  maxDuration: 1500,
  ideal: { deferredBoe: 20, note: 'Field reset in ~4 min, K-4600 back on line, no production lost' },
}

/** library.ts s6: an emergency. F&G acts on its own, the trainee verifies, musters, isolates and restarts */
export const SPEC_GAS: ScenarioSpec = {
  version: 1,
  title: 'Confirmed gas release at the export compressor',
  difficulty: 'intermediate',
  category: 'fire & gas',
  platforms: ['Alpha', 'WHP-N'],
  summary: 'A 2 kg/s flange leak on the K-2200 discharge is seen by two detectors: confirmed gas → automatic ESD2 of the compression zone, blowdown to flare, general alarm. The operator runs the emergency, then the recovery.',
  objectives: ['Run an ESD2: verify, muster, account for POB', 'Isolate the leak before restarting', 'Reset only once the gas has cleared; restart in order'],
  briefing: ['Normal operation, ≈ 49 000 bbl/d. Wind SW 7 m/s: the compression module is upwind of the LQ.', 'A mechanical team re-torqued flanges on the K-2200 discharge yesterday (PTW-2213, closed out).'],
  expected: ['Acknowledge the gas alarms; read the F&G page: which zone, how many detectors.', 'Sound the general alarm and muster; check POB.', 'Once the gas reading has dropped below the high setpoint, send the field team to isolate the leaking flange.', 'Reset the ESD2 only after the gas has cleared and the leak is isolated, then Restart Alpha.'],
  hints: ['F&G page: zone A-P-COMP.', 'Shutdown page: reset is refused while gas is still detected, the reason tells you why.', 'Restarting with the leak still there re-pressurises it.'],
  setup: { knobs: { wind: { from: 240, speed: 7 } } },
  timeline: [
    { id: 'leak', at: 60, label: '2 kg/s flange leak at the K-2200 discharge', do: [{ do: 'gasRelease', at: 'K-2200', rateKgS: 2, label: 'Flange leak at K-2200 discharge', key: 'inc' }] },
    { id: 'esd2', when: { is: 'shutdown', platform: 'Alpha', level: 'ESD2' } },
    { id: 'clear', when: { is: 'all', of: [{ is: 'fired', step: 'esd2' }, { is: 'gasClear', incident: 'inc' }] } },
    { id: 'isolated', when: { is: 'all', of: [{ is: 'fired', step: 'leak' }, { is: 'not', cond: { is: 'incident', incident: 'inc' } }] } },
  ],
  actions: [
    { builtin: 'muster' },
    { builtin: 'pob' },
    {
      id: 'verify',
      label: 'Verify the ESD2 executed (valves, blowdown, ignition sources)',
      who: 'operator',
      available: { is: 'fired', step: 'esd2' },
      reports: [{ text: 'ESD2 verified: zone ESD valves closed, BDV-2201 open, K-2200 stopped' }],
    },
    {
      id: 'isolate',
      label: 'Field (BA team): isolate the leaking flange, close the hand valves either side',
      who: 'field',
      delay: 420,
      available: { is: 'all', of: [{ is: 'fired', step: 'esd2' }, { is: 'incident', incident: 'inc' }, { is: 'not', cond: { is: 'gas', level: 'high', incident: 'inc' } }] },
      detail: 'Only once the zone reads below the high setpoint: the team approaches from upwind in breathing apparatus',
      do: [{ do: 'clear', incident: 'inc' }],
      reports: [{ text: 'Field team: leaking flange on the K-2200 discharge isolated and depressurised, gas test 0 % LEL' }],
    },
  ],
  goals: [
    { id: 'verify', text: 'Verify the ESD2 executed', kind: 'do', category: 'time', from: 'esd2', window: 120, deadline: 600, check: { is: 'ordered', action: 'verify' }, reason: 'The ESD2 actions were not verified', lesson: 'Never assume the safety system did its job: check that the valves moved and blowdown started.' },
    { id: 'muster', text: 'Sound the general alarm and muster', kind: 'do', category: 'safety', penalty: 30, critical: true, from: 'esd2', window: 120, deadline: 300, check: { is: 'ordered', action: 'muster' }, reason: 'No muster was called for a confirmed gas release', lesson: 'Confirmed gas means people go to muster: the CCR owns that call.' },
    { id: 'pob', text: 'Account for all personnel (POB)', kind: 'do', category: 'safety', penalty: 10, from: 'esd2', window: 600, deadline: 1200, check: { is: 'ordered', action: 'pob' }, reason: 'POB was not checked after the muster' },
    { id: 'isolate', text: 'Isolate the leak', kind: 'do', category: 'time', from: 'esd2', window: 900, deadline: 1800, check: { is: 'ordered', action: 'isolate' }, reason: 'The leak was not isolated by the field team', lesson: 'Blowdown empties the inventory; the field team makes it permanent before anyone restarts.' },
    { id: 'no-early', text: 'Do not restart with the leak still active', kind: 'avoid', category: 'safety', penalty: 25, check: { is: 'all', of: [{ is: 'fired', step: 'esd2' }, noAlphaShutdown, { is: 'incident', incident: 'inc' }] }, reason: 'Alpha was restarted while the leak was still active: re-pressurising a leaking flange' },
    { id: 'no-overesc', text: 'Use the right shutdown level (ESD2): do not escalate to ESD1 / APS', kind: 'avoid', category: 'safety', penalty: 10, check: { is: 'any', of: [{ is: 'shutdown', cause: 'manual', atLeast: 'ESD1' }, { is: 'shutdown', cause: 'aps' }] }, reason: 'Escalated to ESD1 / APS: ESD2 already made the area safe; a total ESD also stops utilities and power for no benefit', lesson: 'Pick the lowest shutdown level that makes the hazard safe. Higher levels cost restart time and remove the utilities you may need.' },
    { id: 'restart', text: 'Reset the ESD2 and restart Alpha after the gas has cleared', kind: 'do', category: 'production', from: 'isolated', window: 600, deadline: 1500, check: { is: 'restarted', platform: 'Alpha' }, reason: 'Alpha was not restarted after the gas cleared', lesson: 'Reset, then Restart: ESD valves open, the compressor restarts and the wells ramp back over ~10 min.' },
  ],
  complete: { is: 'all', of: [{ is: 'fired', step: 'isolated' }, { is: 'restarted', platform: 'Alpha', oil: 30000 }] },
  maxDuration: 3000,
  ideal: { deferredBoe: 850, note: 'Verify + muster at once, BA team isolates the leak as soon as the gas drops below the high setpoint, reset and restart when the zone is clear, 10 min ramp' },
}

export const SPEC_EXAMPLES = [SPEC_LEVEL, SPEC_AIR, SPEC_GAS]
