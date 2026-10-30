/** Walk-mode overlay: centre crosshair, key hints, and a plan minimap (click to teleport). */
import { useEffect, useMemo, useState } from 'react'
import { usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import { footprints } from '../model/footprint'
import { placeWalker, walkPose } from '../scene/Walk'

const W = 220

export function WalkHud() {
  const walk = useStore((s) => s.walk)
  const lookAt = useStore((s) => s.lookAt)
  const setWalk = useStore((s) => s.setWalk)
  if (!walk) return null
  return (
    <>
      <div className={`crosshair ${lookAt ? 'on' : ''}`} />
      <div className="walk-hint small">
        <b>Walkthrough</b> · ↑↓ walk · ←→ turn · Q/E step sideways · drag to look · Shift run · click an item to pin it ·{' '}
        <button className="link" onClick={() => setWalk(false)}>Exit (Esc)</button>
      </div>
      <Minimap />
    </>
  )
}

function Minimap() {
  const plant = usePlant()
  const lookAt = useStore((s) => s.lookAt?.tag)
  const selected = useStore((s) => s.selected?.tag)
  const [, setTick] = useState(0)
  useEffect(() => {
    let id = 0
    const loop = () => {
      setTick((t) => (t + 1) % 1e6)
      id = window.setTimeout(() => (raf = requestAnimationFrame(loop)), 66)
    }
    let raf = requestAnimationFrame(loop)
    return () => (cancelAnimationFrame(raf), clearTimeout(id))
  }, [])
  const e = plant.deck.extent
  const sw = e.maxX - e.minX
  const sh = e.maxZ - e.minZ
  const H = (W * sh) / sw
  const sx = (x: number) => ((x - e.minX) / sw) * W
  const sz = (z: number) => ((z - e.minZ) / sh) * H
  const fps = useMemo(() => footprints(plant.equipment, 0), [plant])
  const x = sx(walkPose.x)
  const y = sz(walkPose.z)
  const deg = (-walkPose.yaw * 180) / Math.PI
  return (
    <div className="minimap" title="Click to walk there">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onClick={(ev) => {
          const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect()
          placeWalker(e.minX + ((ev.clientX - r.left) / W) * sw, e.minZ + ((ev.clientY - r.top) / H) * sh)
        }}
      >
        <rect x={0} y={0} width={W} height={H} rx={4} className="mm-deck" />
        {fps.map((f, i) => {
          const tag = plant.equipment[i].tag
          return (
            <rect
              key={tag}
              x={sx(f.x0)}
              y={sz(f.z0)}
              width={sx(f.x1) - sx(f.x0)}
              height={sz(f.z1) - sz(f.z0)}
              className={`mm-eq ${tag === selected ? 'sel' : tag === lookAt ? 'look' : ''}`}
            />
          )
        })}
        <g transform={`translate(${x} ${y}) rotate(${deg})`}>
          <path d="M0 0 L-16 -30 A34 34 0 0 1 16 -30 Z" className="mm-cone" />
          <circle r={4} className="mm-me" />
        </g>
      </svg>
      <div className="muted small">N ↑ · {plant.name}</div>
    </div>
  )
}
