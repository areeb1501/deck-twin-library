/**
 * /alpha landing page: plain HTML, no WebGL. Clips and stills come from the R2 bucket through /alpha/media (worker.js).
 * A clip loads as it nears the screen and plays only while it's on it. With reduced motion or data saver on, the posters
 * stay still and no video is fetched. The two long films (data-film) come in three cuts: a small one for phones, AV1 where the
 * browser plays it, and H.264 for the rest.
 */
import '@fontsource-variable/archivo/wdth.css'
import './landing.css'
import { initSearch } from './search'

const MEDIA = '/alpha/media/v2'
const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
const still = matchMedia('(prefers-reduced-motion: reduce)').matches || !!connection?.saveData

const clips = [...document.querySelectorAll<HTMLVideoElement>('video[data-clip]')]

const av1 = !!document.createElement('video').canPlayType('video/mp4; codecs="av01.0.08M.08"')
const small = matchMedia('(max-width: 820px)').matches

function source(v: HTMLVideoElement) {
  const cut = v.dataset.film === undefined ? '' : small ? '-sm' : av1 ? '.av1' : ''
  return `${MEDIA}/${v.dataset.clip}${cut}.mp4`
}

function prepare(v: HTMLVideoElement) {
  if (!v.poster) v.poster = `${MEDIA}/${v.dataset.clip}.webp`
  if (!still && !v.src) v.src = source(v)
}
const play = (v: HTMLVideoElement) => void v.play().catch(() => {})

// a browser that refuses autoplay keeps the poster, which still reads as a picture
const near = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) (prepare(e.target as HTMLVideoElement), near.unobserve(e.target))
  },
  { rootMargin: '80% 0px' },
)
const inView = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement
      if (still) continue
      if (e.isIntersecting) play(v)
      else v.pause()
    }
  },
  { threshold: 0.15 },
)

// the stage plays one clip at a time, so its videos are driven by the story below rather than by what's in view
const staged = (v: HTMLVideoElement) => v.dataset.beat !== undefined
for (const v of clips) {
  if (v.dataset.now !== undefined) prepare(v)
  else near.observe(v)
  if (!staged(v)) inView.observe(v)
}

for (const img of document.querySelectorAll<HTMLImageElement>('img[data-still]')) {
  img.loading = 'lazy'
  img.src = `${MEDIA}/${img.dataset.still}.webp`
}

const mac = /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
if (mac) document.querySelector('[data-mod]')!.textContent = '⌘'
initSearch(document.querySelector<HTMLElement>('.top-search')!)

const menuBtn = document.querySelector<HTMLButtonElement>('.top-menu-btn')!
const menu = document.querySelector<HTMLElement>('.top-menu')!
const setMenu = (open: boolean) => {
  menu.hidden = !open
  menuBtn.setAttribute('aria-expanded', String(open))
  menuBtn.closest('.top')!.classList.toggle('menu-open', open)
}
menuBtn.addEventListener('click', () => setMenu(!!menu.hidden))
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false)
})

const beats = [...document.querySelectorAll<HTMLLIElement>('.beats li')]
const screens = [...document.querySelectorAll<HTMLVideoElement>('.screen video')]
const stage = document.querySelector<HTMLElement>('.stage')

function show(i: number) {
  beats.forEach((b, n) => b.classList.toggle('on', n === i))
  screens.forEach((v, n) => {
    v.classList.toggle('on', n === i)
    if (n === i) {
      prepare(v)
      if (!still) {
        v.currentTime = 0
        play(v)
      }
    } else v.pause()
  })
}

// the beat crossing the middle of the viewport is the one on screen
const story = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) show(beats.indexOf(e.target as HTMLLIElement))
  },
  { rootMargin: '-50% 0px -50% 0px' },
)
for (const b of beats) story.observe(b)

// the stage only runs while its section is on screen
if (stage)
  new IntersectionObserver(([e]) => {
    const v = screens.find((x) => x.classList.contains('on'))
    if (!v || still) return
    if (e.isIntersecting) play(v)
    else v.pause()
  }).observe(stage)
