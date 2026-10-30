/** Walk-mode overlay: centre crosshair, key hints, and a plan minimap (click to teleport). */
import { useEffect, useMemo, useState } from 'react'
import { usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import { footprints } from '../model/footprint'
import { levelAt, placeWalker, walkLevels, walkPose } from '../scene/Walk'

const W = 230
const HMAX = 250

export function WalkHud() {
  const walk = useStore((s) => s.walk)
  const lookAt = useStore((s) => s.lookAt)
  const setWalk = useStore((s) => s.setWalk)
  const view = useStore((s) => s.walkView)
  const setView = useStore((s) => s.setWalkView)
  if (!walk) return null
  return (
    <>
      {view === 'first' && <div className={`crosshair ${lookAt ? 'on' : ''}`} />}
      <div className="walk-hint small">
        <b>Walkthrough</b> · ↑↓ walk · ←→ turn · Q/E step sideways · drag to look · Shift run · 1–4 change level · doors open as you approach · click an item to pin it ·{' '}
        <button className="link" onClick={() => setView(view === 'third' ? 'first' : 'third')} title="V">
          {view === 'third' ? 'Hide person' : 'Show person'} (V)
        </button>{' '}
        · <button className="link" onClick={() => setWalk(false)}>Exit (Esc)</button>
      </div>
      <Minimap />
      <Levels />
    </>
  )
}

function Levels() {
  const plant = usePlant()
  const level = useStore((s) => s.walkLevel)
  const setLevel = useStore((s) => s.setWalkLevel)
  const levels = walkLevels(plant)
  if (levels.length < 2) return null
  return (
    <div className="walk-levels seg">
      {levels.map((l, i) => (
        <button key={l.id} className={i === level ? 'on' : ''} onClick={() => setLevel(i)} title={`Key ${i + 1}`}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

function Minimap() {
  const plant = usePlant()
  const lookAt = useStore((s) => s.lookAt?.tag)
  const selected = useStore((s) => s.selected?.tag)
  const level = useStore((s) => s.walkLevel)
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
  const levels = walkLevels(plant)
  const lv = levels[level] ?? levels[0]
  const minX = Math.min(...lv.areas.map((a) => a.x0))
  const maxX = Math.max(...lv.areas.map((a) => a.x1))
  const minZ = Math.min(...lv.areas.map((a) => a.z0))
  const maxZ = Math.max(...lv.areas.map((a) => a.z1))
  const k = Math.min(W / (maxX - minX), HMAX / (maxZ - minZ))
  const w = (maxX - minX) * k
  const h = (maxZ - minZ) * k
  const sx = (x: number) => (x - minX) * k
  const sz = (z: number) => (z - minZ) * k
  const fps = useMemo(() => footprints(plant.equipment, 0), [plant])
  const x = sx(walkPose.x)
  const y = sz(walkPose.z)
  const deg = (-walkPose.yaw * 180) / Math.PI
  return (
    <div className="minimap" title="Click to walk there">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        onClick={(ev) => {
          const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect()
          placeWalker(minX + (ev.clientX - r.left) / k, minZ + (ev.clientY - r.top) / k)
        }}
      >
        {lv.areas.map((a, i) => (
          <rect key={`a${i}`} x={sx(a.x0)} y={sz(a.z0)} width={(a.x1 - a.x0) * k} height={(a.z1 - a.z0) * k} rx={2} className="mm-deck" />
        ))}
        {(lv.obstacles ?? []).map((a, i) => (
          <rect key={`o${i}`} x={sx(a.x0)} y={sz(a.z0)} width={(a.x1 - a.x0) * k} height={(a.z1 - a.z0) * k} className="mm-obstacle" />
        ))}
        {fps.map((f, i) => {
          const e = plant.equipment[i]
          if (e.kind === 'proxy' || levelAt(levels, e.position[1]) !== level) return null
          return (
            <rect
              key={e.tag}
              x={sx(f.x0)}
              y={sz(f.z0)}
              width={(f.x1 - f.x0) * k}
              height={(f.z1 - f.z0) * k}
              className={`mm-eq ${e.tag === selected ? 'sel' : e.tag === lookAt ? 'look' : ''}`}
            />
          )
        })}
        <g transform={`translate(${x} ${y}) rotate(${deg})`}>
          <path d="M0 0 L-14 -26 A30 30 0 0 1 14 -26 Z" className="mm-cone" />
          <circle r={4} className="mm-me" />
        </g>
      </svg>
      <div className="muted small">N ↑ · {lv.label}</div>
    </div>
  )
}
