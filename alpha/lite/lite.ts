/**
 * Light /alpha view for phones (see boot.ts): screenshots of the twin and the field's design basis, no WebGL.
 * The images are captures of the twin itself; every process figure and console value is design data or simulated.
 * Tapping a screenshot opens it full size for pinch-zoom; Back returns to the same place.
 */
import '@fontsource-variable/inter'
import './lite.css'
import field from './img/field.webp'
import overview from './img/overview.webp'
import cutaway from './img/cutaway.webp'
import separator from './img/separator.webp'
import pump from './img/pump.webp'
import compressor from './img/compressor.webp'
import lq from './img/lq.webp'
import ccr from './img/ccr.webp'
import dashboard from './img/hmi-dashboard.webp'
import economics from './img/hmi-economics.webp'
import process from './img/hmi-process.webp'
import risk from './img/hmi-risk.webp'
import cctv from './img/hmi-cctv.webp'
import type { Tier } from './boot'

type Shot = [src: string, title: string, text: string]

const MODEL: Shot[] = [
  [overview, 'Alpha PDQ', 'Production deck, drilling rig, cranes and the bridge to the accommodation platform.'],
  [cutaway, 'Inside the HP separator', 'Cutaway of V-1100 showing its internals and the oil and water layers.'],
  [separator, 'Inlet separation', 'V-1100 HP three-phase separator with its valves, instruments and piping.'],
  [pump, 'Crude export pump', 'Pump, coupling guard and motor on their skid, seen at walking height.'],
  [compressor, 'Gas compression', 'K-2200 export gas compressor and its driver, in the compression module.'],
  [lq, 'Living quarters', 'LQ platform: Central Control Room, lifeboats and the helideck.'],
  [ccr, 'Inside the control room', 'The Central Control Room on the LQ, with the fire and gas wall screen.'],
]

const CONSOLE: Shot[] = [
  [dashboard, 'Live dashboard', 'Field risk, production and availability, platform status and live sensors.'],
  [economics, 'Asset and economics', 'Production value, deferment, asset risk and insights in dollars.'],
  [process, 'Process overview', 'Mimic of Alpha and WHP-N: separation, compression, export and utilities.'],
  [risk, 'Risk and what-if', 'Rehearse a scenario, such as a fire at the HP separator, before it happens.'],
  [cctv, 'CCTV and PPE', 'Camera wall with simulated segmentation and thermal views.'],
]

const FACTS: [string, string][] = [
  ['5', 'bridge-linked platforms'],
  ['97', 'tagged equipment items'],
  ['155', 'process lines'],
  ['360', 'instruments and F&G devices'],
  ['49 000', 'bbl/d oil, design'],
  ['75', 'MMscfd gas, design'],
]

const PLATFORMS: [string, string][] = [
  ['Alpha PDQ', 'Processing, drilling, power and utilities'],
  ['WHP-N', 'Normally unattended wellhead platform, six wells'],
  ['WI', 'Water injection'],
  ['RP', 'Risers, fiscal metering and pig launchers'],
  ['LQ', 'Accommodation, control room and helideck'],
]

// the library site's mark, so the light view reads as part of the same product
const logo = `<svg class="lite-logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#fe5510"/><path d="M7 22h18M9.5 22v-6h13v6M12.5 16v-4h7v4M16 12V8.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="6.5" r="2" fill="#fff"/></svg>`

const monitor = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`

const figures = (shots: Shot[]) =>
  shots.map(([src, t, d]) => `<figure><a href="${src}"><img src="${src}" alt="${t}" loading="lazy" /></a><figcaption><b>${t}</b><span>${d}</span></figcaption></figure>`).join('')

export function render(tier: Exclude<Tier, 'full'>) {
  const root = document.getElementById('root')!
  document.body.classList.add('lite-body')
  try {
    if (localStorage.getItem('deck-twin-theme') === 'light') document.documentElement.classList.add('light')
  } catch {
    /* storage blocked: stay dark */
  }
  if (tier === 'unsupported') {
    root.innerHTML = `
      <main class="lite-block">
        ${logo}
        <h1>Not compatible with this device</h1>
        <p>The Alpha field digital twin is a full 3D model that needs a larger screen and a GPU-enabled device.</p>
        <p>Please open this link on a laptop, desktop or large tablet for the best experience.</p>
      </main>`
    return
  }
  root.innerHTML = `
    <main class="lite">
      <header class="lite-top">
        ${logo}<span class="lite-brand">Deck Twin</span><span class="lite-tag">Light view</span><a class="lite-about" href="/alpha/">About this demo</a>
      </header>
      <section class="lite-hero">
        <span class="lite-eyebrow">Offshore digital twin</span>
        <h1><span class="g">The Alpha field,</span> <span class="o">in 3D</span></h1>
        <p>Five bridge-linked offshore platforms in 62 m of water, generated from a plain data model and driven by a dynamic plant simulation.</p>
        <div class="lite-frame">
          <div class="lite-frame-bar">Alpha field, five platforms</div>
          <img src="${field}" alt="The Alpha field: five platforms linked by bridges" fetchpriority="high" />
        </div>
      </section>
      <aside class="lite-note">
        <div class="lite-icon">${monitor}</div>
        <div>
          <strong>Best viewed on a larger, GPU-enabled device.</strong>
          <span>This is a light preview for phones. Open the link on a laptop or desktop to walk the full 3D twin.</span>
        </div>
      </aside>
      <section class="lite-facts">
        ${FACTS.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}
      </section>
      <p class="lite-fine">Design basis. The process values, alarms and economics in the twin are simulated.</p>
      <h2 class="lite-h2">The 3D model</h2>
      <section class="lite-shots">${figures(MODEL)}</section>
      <h2 class="lite-h2">Control-room console</h2>
      <p class="lite-sub">Screens from the operator console. All values are simulated. Tap a screen to zoom in.</p>
      <section class="lite-shots">${figures(CONSOLE)}</section>
      <section class="lite-platforms">
        <h2>The field</h2>
        <ul>${PLATFORMS.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ul>
      </section>
      <footer class="lite-foot">
        <a href="/">${logo}Built with Deck Twin</a>
        <small>Images are captures of the 3D twin and its console.</small>
      </footer>
    </main>`
  // the page is built after load, so the browser can't restore the scroll on Back from a full-size image
  addEventListener('pagehide', () => sessionStorage.setItem(SCROLL_KEY, String(scrollY)))
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (nav?.type === 'back_forward') scrollTo(0, Number(sessionStorage.getItem(SCROLL_KEY) ?? 0))
}

const SCROLL_KEY = 'alpha.lite.y'
