/**
 * Live instrument values. Instruments the dynamic plant model drives (separator level and pressure,
 * instrument air, cooling medium, fuel gas, firewater, every F&G detector) read the model directly;
 * the rest come from a small simulated historian (smooth signal around the nominal) scaled by the
 * plant's throughput. Trends are the values actually recorded at each simulation tick.
 * Replace `sample()` with a real OPC UA / PI / MQTT feed to make the twin live.
 */
import type { Instrument } from '../model/types'
import { historianRaw, instrumentHistory, procValue, simScale } from '../state/sim'
import { usePlantStore } from '../state/plantStore'

/** live value of an instrument */
export function sample(inst: Instrument, t: number) {
  const o = procValue(inst.tag)
  // a little measurement noise on model-driven values
  if (o !== undefined) return o + (historianRaw(inst, t) - inst.nominal) * 0.15
  return historianRaw(inst, t) * simScale(inst, usePlantStore.getState().plant)
}

/** the last `n` recorded values (one per simulation tick), padded with the live value at the start */
export function history(inst: Instrument, t: number, n = 90, _dt = 2) {
  const h = instrumentHistory(inst.tag, n)
  if (h.length >= n) return h
  const v = sample(inst, t)
  return [...Array<number>(n - h.length).fill(h[0] ?? v), ...h]
}

export function fmt(v: number) {
  const a = Math.abs(v)
  return a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(2)
}
