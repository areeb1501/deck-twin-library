/**
 * GPU particle plumes for fires and gas releases (mounted by scene/GasCloud.tsx). Every particle is an instanced
 * camera-facing quad whose whole path is computed in the vertex shader from its seed and the clock, so nothing is
 * uploaded per frame and an incident costs a handful of draw calls. They are ordinary scene objects, so the CCTV
 * cameras see them too.
 *
 *  - flame:  puffs eroded by a noise atlas, coloured by a temperature ramp, tapering towards the tip
 *  - smoke:  buoyant soot that widens with height, drifts downwind and turns to white steam under deluge
 *  - ember:  small bright sparks thrown up on the plume
 *  - vapour: low dense mist filling the dispersion model's ellipsoid, thickest at the source
 *  - jet:    white condensing jet at the leak point
 *
 * A plume that reaches the deck above spreads out under it and climbs past the deck edge, as real smoke does.
 */
import * as THREE from 'three'

/** deterministic PRNG (render stays pure) */
export function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- noise atlas
const TILE = 256
const SIZE = TILE * 2
let atlas: THREE.DataTexture | null = null

/** 2 x 2 atlas of soft billows. R = density, G = sun-side shading, B = fine detail. Built once, on the first incident. */
export function plumeAtlas() {
  if (atlas) return atlas
  const rnd = prng(90210)
  const lattice = Float32Array.from({ length: 65536 }, () => rnd())
  const at = (x: number, y: number) => lattice[((x & 255) << 8) | (y & 255)]
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const value = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = smooth(x - xi)
    const v = smooth(y - yi)
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u
    return a + (b - a) * v
  }
  const fbm = (x: number, y: number) => {
    let s = 0
    let k = 0.5
    for (let i = 0; i < 5; i++) {
      s += k * value(x, y)
      x = x * 2.03 + 11.7
      y = y * 2.03 + 5.3
      k *= 0.5
    }
    return s
  }
  const dens = new Float32Array(SIZE * SIZE)
  const fine = new Float32Array(SIZE * SIZE)
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const ox = tx * 37 + 3
      const oy = ty * 53 + 7
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const u = (x + 0.5) / TILE - 0.5
          const v = (y + 0.5) / TILE - 0.5
          const n = fbm(u * 4.2 + ox, v * 4.2 + oy)
          const r = Math.hypot(u, v) * 2 + (n - 0.5) * 0.55
          const fall = Math.max(0, 1 - r)
          const i = (y + ty * TILE) * SIZE + x + tx * TILE
          dens[i] = Math.min(1, smooth(Math.min(1, fall * 1.7)) * (0.45 + 1.05 * n))
          fine[i] = fbm(u * 15 + oy, v * 15 + ox)
        }
    }
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      const d = dens[i]
      // light from above and to one side: the slope of the density towards the light
      const up = dens[Math.min(SIZE - 1, y + 3) * SIZE + Math.max(0, x - 3)]
      const dn = dens[Math.max(0, y - 3) * SIZE + Math.min(SIZE - 1, x + 3)]
      const shade = Math.min(1, Math.max(0, 0.55 + (dn - up) * 2.4))
      data[i * 4] = d * 255
      data[i * 4 + 1] = shade * 255
      data[i * 4 + 2] = fine[i] * 255
      data[i * 4 + 3] = 255
    }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  atlas = t
  return t
}

// ---------------------------------------------------------------- shared shader parts
const QUAD = new THREE.PlaneGeometry(1, 1)

/** `n` instanced quads, each with a random seed */
export function plumeGeometry(n: number, seed: number) {
  const rnd = prng(seed)
  const g = new THREE.InstancedBufferGeometry()
  g.index = QUAD.index
  g.setAttribute('position', QUAD.getAttribute('position'))
  g.setAttribute('uv', QUAD.getAttribute('uv'))
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(Float32Array.from({ length: n * 4 }, () => rnd()), 4))
  g.instanceCount = n
  return g
}

const COMMON = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uH;        // flame height, m (vapour: cloud half-length)
uniform float uD;        // base diameter, m
uniform float uCeil;     // height of the deck above, relative to the plume base, m
uniform vec4 uEdge;      // distance to the deck edge towards -x, +x, -z, +z, m
uniform vec2 uLean;      // downwind unit vector scaled by how hard the wind bends the plume
uniform vec3 uAxis;      // flame axis: straight up for a pool fire, along the release for a jet fire
uniform float uK;        // 0..1 overall strength
uniform float uSteam;    // 0..1 deluge on the fire
varying vec2 vUv;
varying vec2 vTile;
varying float vLife;
varying float vA;
varying vec3 vTint;
varying float vUp;
uniform float uFloorY;   // world height of the deck plate under the plume

vec3 underDeck(vec3 p, float ang, float reach) {
  float over = p.y - uCeil;
  if (over <= 0.0) return p;
  vec2 d = normalize(vec2(cos(ang), sin(ang)) + uLean * 1.2);
  float run = over * reach;
  float tx = d.x > 0.0 ? uEdge.y / max(d.x, 1e-3) : uEdge.x / max(-d.x, 1e-3);
  float tz = d.y > 0.0 ? uEdge.w / max(d.y, 1e-3) : uEdge.z / max(-d.y, 1e-3);
  float edge = min(tx, tz);
  vec2 xz = p.xz + d * min(run, edge);
  float y = uCeil - 0.35 - 0.9 * fract(ang * 7.31);
  float past = run - edge;
  if (past > 0.0) {
    xz += d * min(past, 2.5);
    y = uCeil + past * 0.95;
  }
  return vec3(xz.x, y, xz.y);
}

void billboard(vec3 centre, float size, float spin, float tile, float stretch) {
  vec4 mv = modelViewMatrix * vec4(centre, 1.0);
  float c = cos(spin), s = sin(spin);
  vec2 q = position.xy * vec2(1.0, stretch);
  mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c) * size;
  gl_Position = projectionMatrix * mv;
  vUp = (inverse(viewMatrix) * mv).y - uFloorY;
  vUv = uv * 0.5 + vec2(mod(tile, 2.0), floor(mod(tile, 4.0) / 2.0)) * 0.5;
  // no popping when the camera walks through it
  vA *= smoothstep(0.25, 2.2, -mv.z);
}
`

const END = /* glsl */ `
  #include <colorspace_fragment>
`
/** fragments fade out just above the deck plate, so a quad never shows a hard line where it cuts the deck */
const SOFT = (m: string) => /* glsl */ `varying float vUp;\nfloat ground() { return smoothstep(0.0, ${m}, vUp); }\n`

const FLAME_VS = /* glsl */ `${COMMON}
void main() {
  float T = (0.5 + 0.4 * aSeed.x) * (0.75 + 0.05 * uH);
  float l = fract(uTime / T + aSeed.y);
  float ang = aSeed.z * 6.2832;
  float rad = sqrt(aSeed.w) * uD * 0.56;
  float along = uH * pow(l, 0.9) * (0.45 + 0.85 * aSeed.x);
  float f = along / uH;
  float neck = pow(max(0.0, 1.0 - f * 0.92), 1.1);
  vec2 d = vec2(cos(ang), sin(ang));
  vec3 p = uAxis * along;
  p.xz += d * rad * neck;
  // turbulence grows up the flame: large slow licks plus fine fast ones
  float w = uTime * 5.5;
  p.xz += vec2(sin(w + aSeed.y * 9.0 + along * 1.2), cos(w * 0.8 + aSeed.w * 7.0 - along)) * uD * 0.16 * f;
  p.xz += vec2(sin(uTime * 2.1 + along * 0.5), cos(uTime * 1.7 - along * 0.4)) * uD * 0.1 * f * f;
  p.xz += uLean * along * f * 0.9;
  p = underDeck(p, ang, 1.15);
  float size = mix(uD * 0.3, uD * 0.13, l) * (0.6 + 0.8 * aSeed.w) + 0.14;
  vLife = l;
  vA = uK * smoothstep(0.0, 0.1, l) * (1.0 - smoothstep(0.62, 1.0, l));
  vTint = vec3(0.0);
  // tongues: stretched along the rise, only a little off vertical
  billboard(p, size, (aSeed.x - 0.5) * 0.7 + sin(uTime * 3.0 + aSeed.z * 9.0) * 0.18, floor(aSeed.y * 4.0), 1.5 + 1.1 * aSeed.w);
}`

const FLAME_FS = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vLife;
varying float vA;
${SOFT('0.7')}
void main() {
  vec4 t = texture2D(uMap, vUv);
  float e = mix(0.16, 0.66, vLife);
  float a = smoothstep(e, e + 0.22, t.r + (t.b - 0.5) * 0.5) * vA * ground();
  if (a < 0.004) discard;
  // temperature: bright yellow in the body, orange, then deep red and sooty at the tip
  float temp = clamp((1.0 - vLife * 0.95) * (0.42 + 0.85 * t.r), 0.0, 1.0);
  vec3 col = mix(vec3(0.42, 0.03, 0.004), vec3(1.7, 0.27, 0.014), smoothstep(0.12, 0.44, temp));
  col = mix(col, vec3(3.2, 1.2, 0.1), smoothstep(0.46, 0.85, temp));
  float soot = smoothstep(0.5, 0.92, vLife);
  // each tongue adds little light and hides a little of what is behind it, so the flame keeps its dark folds
  gl_FragColor = vec4(col * (1.0 - soot * 0.92) * a * 0.46, a * mix(0.55, 0.9, soot));
  ${END}
}`

const SMOKE_VS = /* glsl */ `${COMMON}
void main() {
  float T = 5.0 + 4.0 * aSeed.x;
  float l = fract(uTime / T + aSeed.y);
  float ang = aSeed.z * 6.2832;
  vec2 d = vec2(cos(ang), sin(ang));
  float v = 2.2 + 0.55 * sqrt(uH + 1.0);
  float y0 = uH * (0.4 + 0.55 * aSeed.w);
  float rise = v * T * pow(l, 0.85);
  float y = y0 + rise;
  float wide = uD * 0.42 + 0.17 * rise;
  vec3 p = uAxis * y0 + vec3(0.0, rise, 0.0);
  p.xz += d * wide * sqrt(aSeed.w);
  p.xz += vec2(sin(uTime * 0.5 + aSeed.y * 13.0 + y * 0.22), cos(uTime * 0.43 + aSeed.x * 11.0 - y * 0.19)) * (0.3 + 0.1 * rise);
  p.xz += uLean * rise * 0.75;
  p = underDeck(p, ang, 1.0);
  float size = (uD * 0.75 + 1.1 + 0.32 * rise) * (0.75 + 0.5 * aSeed.x);
  vLife = l;
  vA = uK * smoothstep(0.0, 0.1, l) * (1.0 - smoothstep(0.5, 1.0, l));
  // the underside glows where the plume leaves the flame
  vTint = vec3(1.0, 0.36, 0.08) * 1.5 * exp(-rise / max(1.5, uH * 0.5)) * uFlameLit;
  billboard(p, size, aSeed.x * 1.0 - 0.5 + l * 0.5, floor(aSeed.w * 4.0), 1.0);
}`

const SMOKE_FS = /* glsl */ `
uniform sampler2D uMap;
uniform float uSteam;
uniform vec3 uAmbient;
varying vec2 vUv;
varying float vLife;
varying float vA;
varying vec3 vTint;
${SOFT('0.8')}
void main() {
  vec4 t = texture2D(uMap, vUv);
  float e = mix(0.04, 0.34, vLife);
  float a = smoothstep(e, e + 0.42, t.r + (t.b - 0.5) * 0.3) * vA * ground();
  if (a < 0.004) discard;
  vec3 soot = mix(vec3(0.012, 0.012, 0.014), vec3(0.09, 0.088, 0.085), t.g) * uAmbient;
  vec3 steam = mix(vec3(0.36, 0.38, 0.4), vec3(0.97, 0.98, 1.0), t.g) * uAmbient;
  vec3 col = mix(soot, steam, uSteam) + vTint * (0.35 + 0.65 * (1.0 - t.g));
  float k = a * mix(0.93, 0.34, uSteam);
  gl_FragColor = vec4(col * k, k);
  ${END}
}`

const EMBER_VS = /* glsl */ `${COMMON}
void main() {
  float T = 1.6 + 2.2 * aSeed.x;
  float l = fract(uTime / T + aSeed.y);
  float ang = aSeed.z * 6.2832;
  float climb = (uH * 0.9 + 3.0) * (0.4 + 0.9 * aSeed.w);
  vec3 p = vec3(cos(ang), 0.0, sin(ang)) * uD * 0.42 * aSeed.w;
  p.y = climb * l * (1.25 - 0.25 * l);
  p.xz += vec2(sin(uTime * 3.1 + aSeed.y * 40.0), cos(uTime * 2.7 + aSeed.x * 40.0)) * 0.5 * l;
  p.xz += uLean * climb * l * l * 1.1;
  p = underDeck(p, ang, 1.3);
  vLife = l;
  vA = uK * (1.0 - uSteam * 0.8) * smoothstep(0.0, 0.05, l) * (1.0 - smoothstep(0.6, 1.0, l)) * step(0.5, fract(uTime * (7.0 + 9.0 * aSeed.w) + aSeed.z));
  vTint = vec3(0.0);
  billboard(p, 0.05 + 0.07 * aSeed.x, 0.0, 0.0, 1.0);
}`

const EMBER_FS = /* glsl */ `
varying vec2 vUv;
varying float vLife;
varying float vA;
void main() {
  vec2 q = fract(vUv * 2.0) - 0.5;
  float a = smoothstep(0.5, 0.05, length(q)) * vA;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(6.0, 2.4, 0.5), vec3(1.6, 0.25, 0.04), vLife);
  gl_FragColor = vec4(col * a, 0.0);
  ${END}
}`

const VAPOUR_VS = /* glsl */ `${COMMON}
uniform vec3 uBox;     // half-length downwind, height, half-width of the cloud, m
uniform vec2 uRot;     // cos, sin of the downwind direction in plan
void main() {
  float T = 11.0 + 9.0 * aSeed.x;
  float l = fract(uTime / T + aSeed.y);
  float x = (l * 2.0 - 1.0);
  float w = sqrt(max(0.04, 1.0 - x * x));
  float z = (aSeed.z * 2.0 - 1.0) * w;
  float y = pow(aSeed.w, 2.2) * w;
  vec3 q = vec3(x, y, z);
  // eddies roll the mist as it drifts
  q.xz += vec2(sin(uTime * 0.31 + aSeed.w * 21.0 + x * 3.0), cos(uTime * 0.27 + aSeed.y * 19.0)) * 0.1;
  q.y += 0.05 * sin(uTime * 0.4 + aSeed.x * 17.0 + x * 4.0);
  vec3 p = vec3(q.x * uBox.x * uRot.x - q.z * uBox.z * uRot.y, 0.12 + max(0.0, q.y) * uBox.y, q.x * uBox.x * uRot.y + q.z * uBox.z * uRot.x);
  float r2 = dot(q, q);
  float size = (1.5 + 3.1 * aSeed.x) * (0.75 + 0.5 * l) * clamp(sqrt(uBox.x / 7.0), 0.55, 1.6);
  vLife = l;
  vA = uK * exp(-1.7 * r2) * smoothstep(0.0, 0.14, l) * (1.0 - smoothstep(0.8, 1.0, l));
  vTint = vec3(0.0);
  billboard(p, size, aSeed.x * 1.0 - 0.5 + l * 0.7, floor(aSeed.w * 4.0), 0.72);
}`

const VAPOUR_FS = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uAmbient;
varying vec2 vUv;
varying float vLife;
varying float vA;
${SOFT('0.9')}
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = smoothstep(0.1, 0.68, t.r + (t.b - 0.5) * 0.4) * vA * 0.62 * ground();
  if (a < 0.003) discard;
  vec3 col = mix(vec3(0.5, 0.53, 0.5), vec3(0.93, 0.95, 0.9), t.g) * uAmbient;
  gl_FragColor = vec4(col * a, a);
  ${END}
}`

const JET_VS = /* glsl */ `${COMMON}
void main() {
  float T = 0.5 + 0.35 * aSeed.x;
  float l = fract(uTime / T + aSeed.y);
  float along = uH * pow(l, 0.72) * (0.55 + 0.6 * aSeed.w);
  float ang = aSeed.z * 6.2832;
  vec3 u = normalize(cross(uAxis, vec3(0.0, 1.0, 0.1)));
  vec3 v = cross(uAxis, u);
  float r = (0.04 + 0.2 * along) * sqrt(aSeed.x);
  vec3 p = uAxis * along + (u * cos(ang) + v * sin(ang)) * r;
  p.xz += uLean * along * l * 0.35;
  p.y -= 0.08 * along * l;
  vLife = l;
  vA = uK * smoothstep(0.0, 0.04, l) * (1.0 - smoothstep(0.35, 1.0, l));
  vTint = vec3(0.0);
  billboard(p, 0.16 + along * 0.26, aSeed.y * 3.0, floor(aSeed.z * 4.0), 1.0);
}`

const JET_FS = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uAmbient;
varying vec2 vUv;
varying float vLife;
varying float vA;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = smoothstep(0.12, 0.6, t.r) * vA * 0.5;
  if (a < 0.004) discard;
  vec3 col = mix(vec3(0.72, 0.74, 0.76), vec3(1.0), t.g) * uAmbient;
  gl_FragColor = vec4(col * a, a);
  ${END}
}`

export type PlumeKind = 'flame' | 'smoke' | 'ember' | 'vapour' | 'jet'
const SHADERS: Record<PlumeKind, [string, string]> = {
  flame: [FLAME_VS, FLAME_FS],
  smoke: [`uniform float uFlameLit;\n${SMOKE_VS}`, SMOKE_FS],
  ember: [EMBER_VS, EMBER_FS],
  vapour: [VAPOUR_VS, VAPOUR_FS],
  jet: [JET_VS, JET_FS],
}

/** a plume material with its own uniforms; `uTime` and the sizes are set from useFrame */
export function plumeMaterial(kind: PlumeKind) {
  const [vertexShader, fragmentShader] = SHADERS[kind]
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMap: { value: plumeAtlas() },
      uTime: { value: 0 },
      uH: { value: 1 },
      uD: { value: 1 },
      uCeil: { value: 1e4 },
      uEdge: { value: new THREE.Vector4(1e4, 1e4, 1e4, 1e4) },
      uLean: { value: new THREE.Vector2() },
      uAxis: { value: new THREE.Vector3(0, 1, 0) },
      uK: { value: 0 },
      uSteam: { value: 0 },
      uFlameLit: { value: 1 },
      uFloorY: { value: 0 },
      uAmbient: { value: new THREE.Color(1, 1, 1) },
      uBox: { value: new THREE.Vector3(1, 1, 1) },
      uRot: { value: new THREE.Vector2(1, 0) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  })
}

/** soft deck decal: `mode` 0 = glow under a fire, 1 = scorch mark */
export function decalMaterial(mode: 0 | 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: plumeAtlas() }, uK: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uK;
      varying vec2 vUv;
      void main() {
        vec2 q = vUv - 0.5;
        float r = length(q) * 2.0;
        ${mode === 0
          ? `float a = pow(max(0.0, 1.0 - r), 2.0) * uK;
             gl_FragColor = vec4(vec3(1.5, 0.55, 0.14) * a, 0.0);`
          : `float n = texture2D(uMap, vUv * 0.5 + 0.02).b;
             float a = smoothstep(1.0, 0.45, r + (n - 0.5) * 0.9) * uK * 0.86;
             gl_FragColor = vec4(vec3(0.015) * a, a);`}
        ${END}
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
}

/** engineering overlay on the deck: the 20 % LEL and LFL contours of the dispersion model */
export function contourMaterial(sLow: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uS: { value: sLow }, uK: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uS;
      uniform float uK;
      varying vec2 vP;
      float ring(float d, float w) { return 1.0 - smoothstep(0.0, w, abs(d)); }
      void main() {
        // the quad spans the 20 % LEL contour: s = 1 is the LFL envelope, s = uS the 20 % LEL one
        float s = length(vP) * uS * 1.04;
        float w = fwidth(s) * 1.6;
        vec3 amber = vec3(1.0, 0.72, 0.16);
        vec3 red = vec3(1.0, 0.2, 0.14);
        float aLow = ring(s - uS, w) * 0.9 + (1.0 - smoothstep(uS - w, uS, s)) * 0.07;
        float aLfl = ring(s - 1.0, w) * 0.95 + (1.0 - smoothstep(1.0 - w, 1.0, s)) * 0.13;
        vec3 col = mix(amber, red, aLfl / max(0.001, aLfl + aLow));
        float a = max(aLow, aLfl) * uK;
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
        ${END}
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })
}
