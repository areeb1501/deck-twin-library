/**
 * Procedural gait shared by the walk-mode avatar and the field workers (no clips, no allocation per frame).
 *
 *  - the phase advances with signed distance travelled (one step ≈ 0.5–0.78 m walking, ≈ 1.75 m running), so
 *    walking backwards plays the cycle in reverse and stopping freezes it; turning on the spot shuffles;
 *  - walk ↔ run blend on |speed|, gait ↔ idle blend (breathing, contrapposto weight shift, look-around) at rest;
 *  - pelvis height from leg forward kinematics: the lowest heel / ball / toe touches the floor, so the vertical
 *    bob is emergent and the stance foot never sinks or floats; with a toe joint the toes stay flat on the floor
 *    through push-off while the heel rolls up (heel → ball → toe);
 *  - counter-rotating pelvis / shoulders, arm swing with elbow bend and wrist follow-through, the head held level
 *    and pointed down the path, a forward lean and pumping arms when running.
 */
import { BALL, HEEL, HIP_H, HIP_X, SHIN, THIGH, TOE_TIP } from './body'

const TAU = Math.PI * 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smooth = (x: number, a: number, b: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const damp = (x: number, target: number, rate: number, dt: number) => x + (target - x) * (1 - Math.exp(-rate * dt))
export const wrapPi = (a: number) => a - TAU * Math.round(a / TAU)
/** smooth periodic bump centred at c (width w, radians) */
const bump = (x: number, c: number, w: number) => {
  const d = wrapPi(x - c)
  return Math.exp(-(d * d) / (w * w))
}
/** step length (m) for a given |speed| */
const stepLength = (a: number) => (a <= 2.2 ? 0.5 + 0.28 * (a / 2.2) : Math.min(1.85, 0.78 + ((a - 2.2) / 4.3) * 0.97))

/** gait parameters, blended walk → run */
interface Gait {
  hipAmp: number
  hipOff: number
  kneeSwing: number
  kneeStance: number
  toeOff: number
  heelStrike: number
  armAmp: number
  armOff: number
  elbow: number
  elbowSwing: number
  lean: number
  twist: number // pelvis yaw
  shoulderTwist: number // net shoulder yaw
  roll: number
  sway: number
  flight: number
  armIn: number // forearms swing across the body (running)
}
const WALK_G: Gait = {
  hipAmp: 0.44, hipOff: 0.03, kneeSwing: 1.0, kneeStance: 0.16, toeOff: 0.5, heelStrike: 0.22,
  armAmp: 0.36, armOff: 0.02, elbow: 0.22, elbowSwing: 0.32, lean: -0.045, twist: 0.08, shoulderTwist: 0.075,
  roll: 0.035, sway: 0.022, flight: 0, armIn: 0.02,
}
const RUN_G: Gait = {
  hipAmp: 0.66, hipOff: 0.2, kneeSwing: 1.85, kneeStance: 0.42, toeOff: 0.75, heelStrike: 0.1,
  armAmp: 0.72, armOff: 0.12, elbow: 1.45, elbowSwing: 0.25, lean: -0.2, twist: 0.1, shoulderTwist: 0.17,
  roll: 0.03, sway: 0.012, flight: 0.06, armIn: 0.22,
}
const gaitKeys = Object.keys(WALK_G) as (keyof Gait)[]

export interface Leg {
  hip: number
  knee: number
  ankle: number
  /** toe flex at the ball (positive: toes up relative to the foot) */
  toe: number
}
type V = [number, number, number]
/** joint angles (Euler XYZ, radians) and offsets for one frame; index 0 = left, 1 = right */
export interface Pose {
  hipsX: number
  hipsY: number
  hips: V
  spine: V
  /** −1…1 breathing (chest scale) */
  breathe: number
  /** idle weight 0…1 */
  idle: number
  neck: V
  shoulder: [V, V]
  shoulderLift: [number, number]
  elbow: [number, number]
  wrist: [V, V]
  hip: [V, V]
  knee: [number, number]
  ankle: [number, number]
  toe: [number, number]
}
export interface GaitState {
  init: boolean
  prevX: number
  prevZ: number
  prevYaw: number
  speed: number
  move: number
  run: number
  turn: number
  phase: number
  t: number
  seed: number
  g: Gait
  L: Leg
  R: Leg
  pose: Pose
}
const v3 = (): V => [0, 0, 0]
export function createGait(seed = 0): GaitState {
  return {
    init: false, prevX: 0, prevZ: 0, prevYaw: 0, speed: 0, move: 0, run: 0, turn: 0, phase: 0, t: seed * 7.3, seed,
    g: { ...WALK_G }, L: { hip: 0, knee: 0, ankle: 0, toe: 0 }, R: { hip: 0, knee: 0, ankle: 0, toe: 0 },
    pose: {
      hipsX: 0, hipsY: HIP_H, hips: v3(), spine: v3(), breathe: 0, idle: 1, neck: v3(),
      shoulder: [v3(), v3()], shoulderLift: [0, 0], elbow: [0, 0], wrist: [v3(), v3()],
      hip: [v3(), v3()], knee: [0, 0], ankle: [0, 0], toe: [0, 0],
    },
  }
}

/** one leg at gait phase ψ (hip forward-most at ψ = π/2, swing for cos ψ > 0) */
function legAt(psi: number, g: Gait, amp: number, out: Leg, toeJoint: boolean) {
  const hip = g.hipOff * amp + g.hipAmp * amp * Math.sin(psi)
  const swing = Math.max(0, Math.cos(psi + 0.25))
  const knee = -(0.04 + g.kneeSwing * Math.sqrt(amp) * Math.pow(swing, 1.5) + g.kneeStance * amp * bump(psi, 2.25, 0.55))
  // global foot pitch: toe up at heel strike, toe down through push-off, flat in mid-stance
  const foot = amp * (g.heelStrike * bump(psi, Math.PI / 2 - 0.1, 0.45) - g.toeOff * bump(psi, -Math.PI / 2 + 0.15, 0.5))
  // stance: sole kept near level; swing: the foot hangs off the shin (slightly dorsiflexed for clearance)
  const sw = 0.6 * Math.pow(Math.max(0, Math.cos(psi + 0.35)), 0.7)
  out.hip = hip
  out.knee = knee
  out.ankle = (foot - hip - knee) * (1 - sw) + sw * amp * 0.12
  // toe break: while the heel is up (foot pitched toe-down) the toes stay flat on the floor
  out.toe = toeJoint ? Math.max(0, -(hip + knee + out.ankle)) * (1 - sw / 0.6) : 0
}
/** lowest sole point (heel, ball, toe tip) below the hip joint (negative), by sagittal forward kinematics */
function soleLow(l: Leg) {
  const a1 = l.hip
  const a2 = a1 + l.knee
  const a3 = a2 + l.ankle
  const ay = -THIGH * Math.cos(a1) - SHIN * Math.cos(a2)
  // a point [f, y] of the ankle frame rotated by a3: height = f sin a3 + y cos a3
  const h = ay + HEEL[0] * Math.sin(a3) + HEEL[1] * Math.cos(a3)
  const b = ay + BALL[0] * Math.sin(a3) + BALL[1] * Math.cos(a3)
  const t = b + TOE_TIP * Math.sin(a3 + l.toe)
  return Math.min(h, b, t)
}

/**
 * Advance the gait to the figure's current plan position / heading and write `st.pose`.
 * `published`: the mover's own signed speed (m/s) if it has one; otherwise speed is measured from displacement.
 */
export function stepGait(st: GaitState, x: number, z: number, yaw: number, published: number | undefined, dt: number, toeJoint = true) {
  st.t += dt
  if (!st.init) {
    st.init = true
    st.prevX = x
    st.prevZ = z
    st.prevYaw = yaw
  }
  let dx = x - st.prevX
  let dz = z - st.prevZ
  let dyaw = wrapPi(yaw - st.prevYaw)
  st.prevX = x
  st.prevZ = z
  st.prevYaw = yaw
  // teleports (walk-to, level change, re-entering walk mode): no stride, no spin
  if (Math.hypot(dx, dz) > 1.5 || Math.abs(dyaw) > 0.8) dx = dz = dyaw = 0

  // ---- speed (signed: negative walking backwards); the measured plan distance also covers sideways steps
  const d = Math.hypot(dx, dz)
  const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz
  const pub = published !== undefined && Number.isFinite(published) ? published : 0
  const sign = pub !== 0 ? Math.sign(pub) : fwd < -0.3 * d ? -1 : 1
  const sp = sign * Math.max(Math.abs(pub), d / dt)
  st.speed = damp(st.speed, sp, 9, dt)
  const a = Math.abs(st.speed)
  st.move = damp(st.move, smooth(a, 0.05, 1.0), 10, dt)
  st.run = damp(st.run, smooth(a, 2.8, 5.2), 6, dt)
  const yawRate = Math.abs(dyaw) / dt
  st.turn = damp(st.turn, (1 - smooth(a, 0.2, 0.8)) * smooth(yawRate, 0.15, 0.9), 8, dt)

  // ---- phase: distance travelled (signed), plus a shuffle while turning on the spot
  st.phase += (sign * d * Math.PI) / stepLength(Math.max(a, d / dt)) // one step = half a cycle
  st.phase += (Math.abs(dyaw) / 0.75) * Math.PI * (1 - st.move)
  st.phase = wrapPi(st.phase)

  const g = st.g
  for (const k of gaitKeys) g[k] = lerp(WALK_G[k], RUN_G[k], st.run)
  const w = Math.max(st.move, st.turn) // gait weight vs idle
  const idleW = 1 - w
  const amp = clamp01(st.move * lerp(0.55, 1, smooth(a, 0.3, 2.0)) + st.turn * 0.4)
  const phL = st.phase
  const sL = Math.sin(phL)
  const cL = Math.cos(phL)
  const P = st.pose
  P.idle = idleW

  // ---- legs
  legAt(phL, g, amp, st.L, toeJoint)
  legAt(phL + Math.PI, g, amp, st.R, toeJoint)
  const T = st.t + st.seed * 3.1
  const shift = Math.sin(T * 0.42) * 0.8 + Math.sin(T * 0.17 + 1.3) * 0.2 // slow weight shift (+: onto the right leg)
  const legs = [st.L, st.R]
  for (let i = 0; i < 2; i++) {
    const l = legs[i]
    // contrapposto: the unweighted leg relaxes at the knee, its heel a little up
    const free = Math.max(0, i === 0 ? shift : -shift)
    l.hip = l.hip * w + idleW * 0.03 * free
    l.knee = l.knee * w + idleW * (-0.035 - 0.11 * free)
    l.ankle = l.ankle * w + idleW * (0.035 + 0.05 * free)
    l.toe *= w
  }
  // ---- pelvis (sways over the stance foot, the swing side drops slightly)
  const sway = w * g.sway * amp * cL + idleW * 0.02 * shift
  const roll = w * g.roll * amp * cL + idleW * 0.03 * shift
  const twist = -w * g.twist * amp * sL
  P.hips[0] = 0
  P.hips[1] = twist
  P.hips[2] = roll
  P.hipsX = sway
  // hip joint heights from the roll; pelvis height so the lowest sole touches the floor
  const yL = -HIP_X * Math.sin(roll)
  const yR = HIP_X * Math.sin(roll)
  let hipsY = HIP_H + Math.max(-yL - soleLow(st.L) - HIP_H, -yR - soleLow(st.R) - HIP_H)
  hipsY += st.run * w * g.flight * Math.max(0, Math.sin(2 * phL - 0.6))
  P.hipsY = hipsY
  for (let i = 0; i < 2; i++) {
    const l = legs[i]
    // legs stay plumb under lateral sway / roll
    P.hip[i][0] = l.hip
    P.hip[i][1] = 0
    P.hip[i][2] = -roll - sway / HIP_H
    P.knee[i] = l.knee
    P.ankle[i] = l.ankle
    P.toe[i] = l.toe
  }

  // ---- spine, head
  const breathe = Math.sin(T * 1.65)
  P.breathe = breathe
  const lean = w * g.lean * amp + idleW * 0.012 * breathe
  const shoulderTwist = w * g.shoulderTwist * amp * sL
  P.spine[0] = lean
  P.spine[1] = shoulderTwist - twist
  P.spine[2] = -roll * 0.6
  // head stabilised: level, pointed down the path, a small nod with the running bounce, idle look-around
  const look = idleW * 0.16 * Math.sin(T * 0.23) * Math.sin(T * 0.11 + 1)
  const nod = st.run * w * 0.035 * Math.sin(2 * phL + 0.4) + idleW * 0.025 * Math.sin(T * 0.19 + 2)
  P.neck[0] = -lean * 0.92 + nod
  P.neck[1] = -shoulderTwist * 0.95 + look
  P.neck[2] = roll * 0.4 * -0.85

  // ---- arms (the left arm swings with the right leg)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    const ph = i === 0 ? -1 : 1
    const swing = ph * sL * g.armAmp * amp
    const sh = P.shoulder[i]
    sh[0] = w * (g.armOff * amp + swing) + idleW * (0.03 + 0.01 * breathe)
    sh[1] = -s * w * g.armIn * amp
    sh[2] = s * (0.075 + 0.03 * st.run * w) + s * 0.006 * breathe * idleW
    P.shoulderLift[i] = idleW * 0.003 * breathe + w * 0.006 * amp * Math.max(0, ph * sL)
    // the elbow bends more on the forward swing; the hand trails the swing (follow-through)
    P.elbow[i] = w * (g.elbow * Math.max(amp, st.run) + g.elbowSwing * Math.max(0, swing)) + idleW * 0.16
    const wr = P.wrist[i]
    wr[0] = -0.04 * P.elbow[i] - w * 0.14 * amp * ph * cL
    wr[1] = s * -0.15 * st.run * w
    wr[2] = 0
  }
}
