/**
 * /alpha entry. Decides, before the 3.8 MB twin is fetched, whether this device can carry it.
 *   full         laptops, desktops, large tablets: load the twin (../src/main.tsx)
 *   lite         phones and small tablets: screenshots only (./lite.ts), no WebGL and no way into the twin
 *   unsupported  no WebGL2 or a very small screen: a short "not compatible" note
 * Lives outside src/ so `npm run refresh` (rsync --delete of src/) keeps it.
 */
export type Tier = 'full' | 'lite' | 'unsupported'

function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

function tier(): Tier {
  const shortSide = Math.min(screen.width, screen.height)
  const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
  if (!hasWebGL2() || shortSide < 340) return 'unsupported'
  // phones and tablets up to iPad Air size; a 12.9" iPad (1024 short side) gets the twin
  if (touch && shortSide < 1024) return 'lite'
  return 'full'
}

// Two separate loaders: merged into one import() expression, the bundler keeps only one branch's CSS
// (the twin then loads unstyled). Each loader keeps its own stylesheet preload this way.
async function loadTwin() {
  await import('../src/main.tsx')
}
async function loadLite(t: Exclude<Tier, 'full'>) {
  const m = await import('./lite')
  m.render(t)
}

const t = tier()
if (t === 'full') void loadTwin()
else void loadLite(t)
