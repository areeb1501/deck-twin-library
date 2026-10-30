/**
 * Watches the real frame rate and steps render quality down when the browser struggles (below ~38
 * fps for 1.5 s) and back up when there is headroom (above ~56 fps for 5 s), so the twin stays smooth
 * on a laptop and crisp on a workstation. Sets the canvas pixel ratio; Effects / DetailCull read the
 * level for ambient occlusion and small-detail culling.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { QUALITY, useQuality, type QualityLevel } from './quality'

export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr)
  const level = useQuality((s) => s.level)
  const win = useRef({ t0: 0, frames: 0, low: 0, high: 0, settle: 0 })

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, QUALITY.dpr[level]))
    // a level change re-allocates render targets: give it a moment before judging again
    win.current.settle = performance.now() + 1500
  }, [level, setDpr])

  useFrame(() => {
    const w = win.current
    const now = performance.now()
    if (!w.t0) w.t0 = now
    w.frames++
    const dt = now - w.t0
    if (dt < 500) return
    const fps = (w.frames * 1000) / dt
    w.t0 = now
    w.frames = 0
    const q = useQuality.getState()
    useQuality.setState({ fps: q.fps * 0.6 + fps * 0.4 })
    // a hidden tab or a long main-thread stall is not a rendering problem
    if (!q.auto || now < w.settle || document.hidden || dt > 2000) return
    if (fps < 38) {
      w.low += dt
      w.high = 0
    } else if (fps > 56) {
      w.high += dt
      w.low = 0
    } else w.low = w.high = 0
    if (w.low > 1500 && q.level < 2) {
      q.setLevel((q.level + 1) as QualityLevel)
      w.low = 0
    } else if (w.high > 5000 && q.level > 0) {
      q.setLevel((q.level - 1) as QualityLevel)
      w.high = 0
    }
  })
  return null
}
