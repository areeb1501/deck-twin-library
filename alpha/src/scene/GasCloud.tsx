/**
 * Live gas clouds and fires from the simulation's incidents (deck-local; mount inside the deck group). The particle
 * work is in fx/plumeFx.ts; this file reads the incident each frame and sizes the plumes from the same models the
 * detectors use, so what is drawn is what the F&G system senses.
 *  - gasRelease: the dispersion model's cloud (sim/fg.ts cloudShape) as low dense mist thickest at the source, with a
 *    white condensing jet at the leak. The 20 % LEL and LFL contours are drawn on the deck with the F&G coverage layer.
 *  - fire: flames sized by Heskestad's flame height, soot, embers, a glow and scorch on the deck, and white steam
 *    instead of soot once deluge reaches it. A release above the deck plate burns as a directed jet fire.
 *    Smoke and steam thin out over several seconds after the fire is out.
 * Shapes follow the incident's current rate and age every frame without React re-renders. One fire light stays mounted
 * at zero: adding a light on ignition would recompile every lit material mid-incident.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { usePlant } from '../state/plantStore'
import { DECK_WORLD_Y, useStore } from '../state/store'
import { ALPHA_DECK, CELLAR_FLOOR, LQ, RP, WEATHER_FLOOR, WHP, WI } from '../model/site'
import type { PlanRect, Vec3 } from '../model/types'
import { cloudShape, downwind, flameHeight, floorAt, S_LOW } from '../sim/fg'
import { getLive, getWind, useIncidents } from '../sim/fg/live'
import type { Incident } from '../sim/types'
import { envNight } from './env/envShared'
import { zoneDeluge } from './fx/simRead'
import { contourMaterial, decalMaterial, plumeAtlas, plumeGeometry, plumeMaterial, prng } from './fx/plumeFx'
import { QUALITY, useQuality } from './perf/quality'

const noPick = () => null
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
const CONTOUR = new THREE.PlaneGeometry(2, 2, 1, 1)
const COUNT = { flame: 150, smoke: 110, ember: 90, vapour: 300, jet: 90 }

const isGas = (i: Incident) => i.fault.kind === 'gasRelease'
const isFire = (i: Incident) => i.fault.kind === 'fire'
const posOf = (i: Incident) => i.pos ?? ('at' in i.fault ? i.fault.at : undefined)
const find = (id: string) => (getLive().incidents ?? []).find((i) => i.id === id)

/** a stable direction for an incident's release (it doesn't swing with the wind) */
function releaseDir(id: string) {
  const r = prng([...id].reduce((s, c) => s * 31 + c.charCodeAt(0), 7))
  const a = r() * Math.PI * 2
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
}

/** the deck above a point and how far the plume can spread under it before reaching open air */
function deckAbove(pos: Vec3, base: number, offshore: boolean) {
  const none = { ceil: 1e4, edge: new THREE.Vector4(1e4, 1e4, 1e4, 1e4) }
  if (!offshore) return none
  const deck = ([ALPHA_DECK, WHP.deck, RP.deck, WI.deck, LQ.deck] as PlanRect[]).find((r) => pos[0] >= r.x0 && pos[0] <= r.x1 && pos[2] >= r.z0 && pos[2] <= r.z1)
  if (!deck) return none
  const alpha = deck === ALPHA_DECK
  const above = base < -1 ? -0.7 : alpha && base < WEATHER_FLOOR - 1 ? WEATHER_FLOOR - 0.7 : null
  if (above === null || base < CELLAR_FLOOR - 1) return none
  return { ceil: above - base, edge: new THREE.Vector4(pos[0] - deck.x0, deck.x1 - pos[0], pos[2] - deck.z0, deck.z1 - pos[2]) }
}

/** scales a plume's soft lighting with the time of day: smoke and mist are dim at night */
const ambient = (c: THREE.Color) => {
  const k = 1 - 0.8 * envNight.value
  return c.setRGB(k, k, k * (1 + 0.1 * envNight.value))
}

/** how many of each particle this quality level draws */
const useShare = () => useQuality((s) => QUALITY.fx[s.level])

export function GasCloud() {
  const incidents = useIncidents()
  const ids = incidents.filter((i) => (isGas(i) || isFire(i)) && posOf(i)).map((i) => `${i.fault.kind}:${i.id}`)
  const key = ids.join('|')
  const list = useMemo(() => (key ? key.split('|') : []).map((k) => k.split(':') as ['gasRelease' | 'fire', string]), [key])
  // build the noise atlas while nothing is burning, so the first ignition doesn't hitch
  useEffect(() => {
    const id = requestIdleCallback(() => plumeAtlas())
    return () => cancelIdleCallback(id)
  }, [])
  return (
    <group>
      <FireLight />
      {list.map(([kind, id]) => (kind === 'gasRelease' ? <Cloud key={id} id={id} /> : <Fire key={id} id={id} />))}
    </group>
  )
}

/** the one fire light: follows the largest burning fire, flickering */
function FireLight() {
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    const l = light.current
    if (!l) return
    let top: Incident | null = null
    for (const i of getLive().incidents ?? []) if (isFire(i) && i.burning && posOf(i) && (i.rate ?? 0) > (top?.rate ?? 0)) top = i
    const pos = top && posOf(top)
    if (!top || !pos) {
      l.intensity = 0
      return
    }
    const mw = top.rate ?? 1
    const H = flameHeight(mw)
    const t = clock.elapsedTime
    const flick = 1 + 0.16 * Math.sin(t * 17) + 0.11 * Math.sin(t * 29 + 1.2) + 0.07 * Math.sin(t * 7.3)
    l.position.set(pos[0], pos[1] + H * 0.45, pos[2])
    // the sun drowns a fire by day; at night it lights the whole bay
    l.intensity = (9 + 7 * Math.sqrt(mw)) * flick * (0.55 + 1.4 * envNight.value)
    l.distance = 14 + 9 * Math.sqrt(mw)
  })
  return <pointLight ref={light} color="#ff7a30" intensity={0} distance={20} decay={1.7} />
}

function Cloud({ id }: { id: string }) {
  const plant = usePlant()
  const offshore = (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha'
  const contours = useStore((s) => s.layers.fireGas)
  const root = useRef<THREE.Group>(null)
  const jetRoot = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Group>(null)
  const share = useShare()
  const [fx] = useState(() => {
    const seed = [...id].reduce((s, c) => s * 31 + c.charCodeAt(0), 11)
    return {
      vapour: { geo: plumeGeometry(COUNT.vapour, seed), mat: plumeMaterial('vapour') },
      jet: { geo: plumeGeometry(COUNT.jet, seed + 1), mat: plumeMaterial('jet') },
      contour: contourMaterial(S_LOW),
      dir: releaseDir(id).setY(0.12).normalize(),
    }
  })
  useEffect(() => {
    fx.vapour.geo.instanceCount = Math.round(COUNT.vapour * share)
    fx.jet.geo.instanceCount = Math.round(COUNT.jet * share)
  }, [fx, share])
  useEffect(
    () => () => {
      for (const p of [fx.vapour, fx.jet]) (p.geo.dispose(), p.mat.dispose())
      fx.contour.dispose()
    },
    [fx],
  )

  useFrame(({ clock }) => {
    const inc = find(id)
    const g = root.current
    const j = jetRoot.current
    if (!g || !j) return
    const pos = inc && posOf(inc)
    const rate = inc ? (inc.rate ?? (inc.fault.kind === 'gasRelease' ? inc.fault.rateKgS : 0)) : 0
    const t = getLive().t ?? 0
    const sh = pos && rate > 0.02 ? cloudShape({ pos, rateKgS: rate, age: Math.max(0, t - inc!.at) }, getWind(), offshore) : null
    if (!pos || !sh || sh.R < 0.1) {
      g.visible = j.visible = false
      return
    }
    g.visible = j.visible = true
    const time = clock.elapsedTime
    const w = getWind()
    const h = sh.centre[1] - sh.floor + sh.c
    // cloud frame: origin on the deck plate under the ellipsoid centre, sized to the fringe of the model's envelope
    g.position.set(sh.centre[0], sh.floor + 0.03, sh.centre[2])
    const v = fx.vapour.mat.uniforms
    v.uTime.value = time
    v.uBox.value.set(sh.a * 1.2, h * 1.05, sh.b * 1.2)
    v.uRot.value.set(sh.dir[0], sh.dir[1])
    v.uK.value = Math.min(1, 0.42 + 0.34 * Math.sqrt(rate))
    v.uFloorY.value = sh.floor + DECK_WORLD_Y
    ambient(v.uAmbient.value)
    // the jet shows where the leak is, and quietens as the source depressurises
    j.position.set(pos[0], pos[1], pos[2])
    const u = fx.jet.mat.uniforms
    u.uTime.value = time
    u.uH.value = 1.6 + 2.6 * Math.sqrt(rate)
    u.uAxis.value.copy(fx.dir)
    u.uLean.value.set(sh.dir[0], sh.dir[1]).multiplyScalar(w.speed / (w.speed + 6))
    u.uK.value = Math.min(1, 0.25 + 0.5 * Math.sqrt(rate))
    u.uFloorY.value = sh.floor + DECK_WORLD_Y
    ambient(u.uAmbient.value)
    const c = ring.current
    if (c) {
      c.position.set(sh.centre[0], sh.floor + 0.05, sh.centre[2])
      c.rotation.set(-Math.PI / 2, 0, Math.atan2(-sh.dir[1], sh.dir[0]))
      c.scale.set(sh.a * S_LOW * 1.04, sh.b * S_LOW * 1.04, 1)
    }
  })
  return (
    <>
      <group ref={root} visible={false}>
        <mesh geometry={fx.vapour.geo} material={fx.vapour.mat} raycast={noPick} frustumCulled={false} renderOrder={7} />
      </group>
      <group ref={jetRoot} visible={false}>
        <mesh geometry={fx.jet.geo} material={fx.jet.mat} raycast={noPick} frustumCulled={false} renderOrder={8} />
      </group>
      {contours && (
        <group ref={ring}>
          <mesh geometry={CONTOUR} material={fx.contour} raycast={noPick} renderOrder={5} />
        </group>
      )}
    </>
  )
}

function Fire({ id }: { id: string }) {
  const plant = usePlant()
  const offshore = (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha'
  const root = useRef<THREE.Group>(null)
  const glow = useRef<THREE.Mesh>(null)
  const scorch = useRef<THREE.Mesh>(null)
  const share = useShare()
  const ease = useRef({ flame: 0, smoke: 0, steam: 0, born: -1 })
  const [fx] = useState(() => {
    const seed = [...id].reduce((s, c) => s * 31 + c.charCodeAt(0), 5)
    return {
      flame: { geo: plumeGeometry(COUNT.flame, seed), mat: plumeMaterial('flame') },
      smoke: { geo: plumeGeometry(COUNT.smoke, seed + 1), mat: plumeMaterial('smoke') },
      ember: { geo: plumeGeometry(COUNT.ember, seed + 2), mat: plumeMaterial('ember') },
      glow: decalMaterial(0),
      scorch: decalMaterial(1),
      dir: releaseDir(id),
    }
  })
  useEffect(() => {
    for (const k of ['flame', 'smoke', 'ember'] as const) fx[k].geo.instanceCount = Math.round(COUNT[k] * share)
  }, [fx, share])
  useEffect(
    () => () => {
      for (const p of [fx.flame, fx.smoke, fx.ember]) (p.geo.dispose(), p.mat.dispose())
      fx.glow.dispose()
      fx.scorch.dispose()
    },
    [fx],
  )

  useFrame(({ clock }, dt) => {
    const inc = find(id)
    const g = root.current
    if (!g) return
    const pos = inc && posOf(inc)
    const e = ease.current
    if (!inc || !pos) {
      g.visible = false
      return
    }
    const burning = inc.burning !== false
    const time = clock.elapsedTime
    if (e.born < 0) e.born = time
    const mw = Math.max(0.2, inc.rate ?? (inc.fault.kind === 'fire' ? inc.fault.sizeMW : 1))
    const steamOn = zoneDeluge(inc.zone)
    // ignition flares up over a few seconds; once out, the flames go quickly and the smoke lingers
    const toFlame = burning ? Math.min(1, 0.3 + (time - e.born) / 3) : 0
    e.flame += (toFlame - e.flame) * Math.min(1, dt * (burning ? 2.4 : 3.5))
    e.smoke += ((burning ? 1 : 0) - e.smoke) * Math.min(1, dt / (burning ? 1.2 : 7))
    e.steam += ((steamOn ? 1 : 0) - e.steam) * Math.min(1, dt / 4)
    if (e.flame < 0.01 && e.smoke < 0.01) {
      g.visible = false
      return
    }
    g.visible = true
    const H = flameHeight(mw) * (0.6 + 0.4 * e.flame)
    const D = Math.max(0.6, Math.sqrt((4 * (mw / 1.5)) / Math.PI))
    const floor = floorAt(pos, offshore)
    const jet = pos[1] - floor > 0.8
    const base = jet ? pos[1] : floor + 0.03
    g.position.set(pos[0], base, pos[2])
    const w = getWind()
    const [dx, dz] = downwind(w)
    const bend = w.speed / (w.speed + 4)
    const { ceil, edge } = deckAbove(pos, base, offshore)
    const axis = jet ? fx.dir.clone().multiplyScalar(0.92).setY(0.38).normalize() : new THREE.Vector3(0, 1, 0)
    for (const m of [fx.flame.mat, fx.smoke.mat, fx.ember.mat]) {
      const u = m.uniforms
      u.uTime.value = time
      u.uH.value = jet ? H * 1.25 : H
      u.uD.value = jet ? D * 0.45 : D
      u.uCeil.value = ceil
      u.uEdge.value.copy(edge)
      u.uLean.value.set(dx, dz).multiplyScalar(bend)
      u.uAxis.value.copy(axis)
      u.uSteam.value = e.steam
      u.uFloorY.value = floor + DECK_WORLD_Y
      ambient(u.uAmbient.value)
    }
    fx.flame.mat.uniforms.uK.value = e.flame
    fx.smoke.mat.uniforms.uK.value = e.smoke
    fx.smoke.mat.uniforms.uFlameLit.value = e.flame
    fx.ember.mat.uniforms.uK.value = e.flame
    const flick = 0.85 + 0.15 * Math.sin(time * 19) * Math.sin(time * 7.7)
    const gm = glow.current
    if (gm) {
      gm.scale.set(D * 4 + H * 1.8, 1, D * 4 + H * 1.8)
      gm.position.set(0, floor - base + 0.06, 0)
      fx.glow.uniforms.uK.value = e.flame * flick * (0.4 + 0.75 * envNight.value)
    }
    const sm = scorch.current
    if (sm) {
      sm.scale.set(D * 2.6, 1, D * 2.6)
      sm.position.set(0, floor - base + 0.045, 0)
      // the deck darkens over the first minute of burning and stays dark
      const age = Math.max(0, (getLive().t ?? 0) - inc.at)
      fx.scorch.uniforms.uK.value = Math.min(1, age / 60 + 0.25)
    }
  })
  return (
    <group ref={root} visible={false}>
      <mesh ref={scorch} geometry={PLANE} material={fx.scorch} raycast={noPick} renderOrder={3} />
      <mesh ref={glow} geometry={PLANE} material={fx.glow} raycast={noPick} renderOrder={4} />
      <mesh geometry={fx.smoke.geo} material={fx.smoke.mat} raycast={noPick} frustumCulled={false} renderOrder={9} />
      <mesh geometry={fx.flame.geo} material={fx.flame.mat} raycast={noPick} frustumCulled={false} renderOrder={10} />
      <mesh geometry={fx.ember.geo} material={fx.ember.mat} raycast={noPick} frustumCulled={false} renderOrder={11} />
    </group>
  )
}
