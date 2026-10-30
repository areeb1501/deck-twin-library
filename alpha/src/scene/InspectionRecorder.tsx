/**
 * Records what the inspection units see (plan 12): their own camera, rendered off-screen from inside the twin,
 * on the CCTV feed's pipeline (half-float target, asynchronous read-back, tone mapping on the CPU).
 *
 * Runs whether or not the console is open. At most one frame a turn: a marked moment first (each scan, each stop for
 * a worker), otherwise the mission clock's cadence, so a fast-forwarded mission is still covered end to end, and it
 * never asks more of the GPU than one small render every MIN_GAP_MS. The unit's own body is hidden from its camera.
 * The SIMULATED mark and the clock are burned into the picture, so they stay with the frame wherever it goes.
 */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CLIP_H, CLIP_W, captureInfo, claimCapture, nextCapture, pushClipFrame, unitBodies, unitPose, type UnitId } from '../safety/inspection'
import { fmtClock } from '../sim/types'
import { CULL_LAYER } from './perf/batching'
import { toDisplay } from './CctvRenderer'

const MIN_GAP_MS = 80
/** camera height above the unit's reference point, m */
const LENS: Record<UnitId, number> = { robot: 1.28, drone: -0.34 }

function burnIn(g: CanvasRenderingContext2D, info: NonNullable<ReturnType<typeof captureInfo>>, mark: string | null) {
  const W = CLIP_W
  const H = CLIP_H
  g.font = '600 11px ui-monospace, Menlo, monospace'
  g.textBaseline = 'top'
  const text = (s: string, x: number, y: number, c = '#f4f4f2', align: CanvasTextAlign = 'left') => {
    g.textAlign = align
    g.fillStyle = 'rgba(0,0,0,0.7)'
    g.fillText(s, x + 1, y + 1)
    g.fillStyle = c
    g.fillText(s, x, y)
  }
  g.fillStyle = 'rgba(0,0,0,0.62)'
  g.fillRect(6, 6, 74, 16)
  g.fillStyle = '#f39c1f'
  g.fillRect(6, 6, 3, 16)
  text('SIMULATED', 13, 9, '#ffd7a0')
  text(fmtClock(info.t), W - 8, 8, '#f4f4f2', 'right')
  text(`${info.mission}${info.ff > 1 ? ` · ×${info.ff}` : ''}`, W - 8, 22, '#c9cdd0', 'right')
  text(`${info.label}${info.tag ? ` · ${info.tag}` : ''}`, 8, H - 18)
  if (info.hold) {
    g.fillStyle = 'rgba(160,30,20,0.86)'
    g.fillRect(0, H - 40, W, 17)
    text(info.hold, W / 2, H - 37, '#fff', 'center')
  } else if (mark?.startsWith('scan')) text('SCANNING', W - 8, H - 18, '#b8f0c8', 'right')
}

export function InspectionRecorder() {
  const st = useRef<{ rt: THREE.WebGLRenderTarget; cam: THREE.PerspectiveCamera; canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; img: ImageData; buf: Uint16Array | Uint8Array; half: boolean; pending: boolean; last: number } | null>(null)
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CLIP_W
    canvas.height = CLIP_H
    const g = canvas.getContext('2d', { willReadFrequently: true })!
    const cam = new THREE.PerspectiveCamera(58, CLIP_W / CLIP_H, 0.15, 900)
    // small details culled for the main view (it may be far away) still exist for a camera right next to them
    cam.layers.enable(CULL_LAYER)
    const rt = new THREE.WebGLRenderTarget(CLIP_W, CLIP_H, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 })
    st.current = { rt, cam, canvas, g, img: g.createImageData(CLIP_W, CLIP_H), buf: new Uint16Array(CLIP_W * CLIP_H * 4), half: true, pending: false, last: 0 }
    return () => {
      rt.dispose()
      st.current = null
    }
  }, [])

  useFrame(({ gl, scene }) => {
    const c = st.current
    if (!c || c.pending || document.hidden) return
    const now = performance.now()
    if (now - c.last < MIN_GAP_MS) return
    const want = nextCapture()
    if (!want) return
    const info = captureInfo(want.unit)
    if (!info) return
    c.last = now
    claimCapture(want.unit, want.mark)

    const p = unitPose[want.unit]
    c.cam.position.set(p.x, p.y + LENS[want.unit], p.z)
    c.cam.up.set(0, 1, 0)
    c.cam.lookAt(p.look.x, p.look.y, p.look.z)
    c.cam.updateMatrixWorld(true)

    // ---- render (restore everything the main pipeline relies on)
    const body = unitBodies[want.unit]
    const shown = body?.visible
    if (body) body.visible = false
    const prevTarget = gl.getRenderTarget()
    const prevAuto = gl.autoClear
    const prevOverride = scene.overrideMaterial
    scene.overrideMaterial = null
    gl.setRenderTarget(c.rt)
    gl.autoClear = false
    gl.clear(true, true, true)
    gl.render(scene, c.cam)
    gl.setRenderTarget(prevTarget)
    gl.autoClear = prevAuto
    scene.overrideMaterial = prevOverride
    if (body) body.visible = shown ?? true

    // ---- read back without a GPU stall, paint, burn in, keep
    c.pending = true
    const done = (px: Uint16Array | Uint8Array) => {
      toDisplay(c.img.data, px, CLIP_W, CLIP_H)
      c.g.putImageData(c.img, 0, 0)
      burnIn(c.g, info, want.mark)
      pushClipFrame(want.unit, info.mission, c.canvas.toDataURL('image/jpeg', 0.72), want.mark, info.t, info.clock)
    }
    const px = c.buf
    gl.readRenderTargetPixelsAsync(c.rt, 0, 0, CLIP_W, CLIP_H, px)
      .then(() => done(px))
      .catch(() => {
        // half-float read-back unsupported here: 8-bit from now on (the first frame is lost)
        if (c.half) {
          c.half = false
          c.rt.dispose()
          c.rt = new THREE.WebGLRenderTarget(CLIP_W, CLIP_H, { type: THREE.UnsignedByteType, depthBuffer: true, samples: 0 })
          c.buf = new Uint8Array(CLIP_W * CLIP_H * 4)
        }
      })
      .finally(() => {
        c.pending = false
      })
  })
  return null
}
