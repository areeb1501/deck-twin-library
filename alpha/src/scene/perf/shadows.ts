/**
 * On-demand shadow map refresh (see ShadowOnDemand in Scene.tsx). The sun never moves, so the shadow
 * map is only re-rendered after something changes: a short burst of consecutive frames (so the change
 * shows at once), then a refresh every ~300 ms while the scene settles (lazy mounts, shader warm-up).
 * Time-based rather than frame-based so a slow frame rate does not stretch a "90 frame" window to 10 s
 * of extra shadow passes.
 */
export const shadowState = { burst: 0, until: 0, next: 0 }

/** re-render the shadow map now and keep refreshing it for `settleMs` */
export function requestShadows(settleMs = 2500) {
  shadowState.burst = Math.max(shadowState.burst, 2)
  shadowState.until = Math.max(shadowState.until, performance.now() + settleMs)
}

/** call once per frame; true when the shadow map should be re-rendered this frame */
export function shadowTick(now: number) {
  const s = shadowState
  if (s.burst > 0) {
    s.burst--
    s.next = now + 300
    return true
  }
  if (now < s.until && now >= s.next) {
    s.next = now + 300
    return true
  }
  return false
}
