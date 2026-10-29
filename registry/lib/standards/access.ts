// Access rules after ISO 14122-2/3/4, OSHA 1910 Subpart D and NORSOK C-001 (metres). Typical design values — verify against the governing standard.

export const ACCESS = {
  handrail: { height: 1.1, kneeRail: 0.5, toePlate: 0.1, postSpacingMax: 1.5 },
  stair: { angleDeg: 38 /* typical ≤ 45 */, riser: 0.18, tread: 0.25, widthMin: 0.8, landingEvery: 3.0 },
  ladder: { rungPitch: 0.3, width: 0.45, cageStart: 2.3, hoopSpacing: 0.9, cageDia: 0.7, maxFlight: 6.0 },
  walkway: { widthMin: 0.8, headroom: 2.1 },
  platform: { gratingThickness: 0.03 },
} as const

/**
 * Even risers close to the 180 mm target; going set by the stair angle. `steps` counts risers;
 * the top riser lands on the upper floor, so the horizontal run is (steps − 1) goings.
 */
export function stairFlight(
  rise: number,
  angleDeg: number = ACCESS.stair.angleDeg,
): { steps: number; riser: number; going: number; run: number; angleDeg: number } {
  const h = Math.max(0, Number.isFinite(rise) ? rise : 0)
  const ang = Math.min(60, Math.max(20, Number.isFinite(angleDeg) ? angleDeg : ACCESS.stair.angleDeg))
  const steps = Math.max(1, Math.round(h / ACCESS.stair.riser))
  const riser = h / steps
  const going = riser / Math.tan((ang * Math.PI) / 180)
  return { steps, riser, going, run: going * (steps - 1), angleDeg: ang }
}
