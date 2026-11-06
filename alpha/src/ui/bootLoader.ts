/**
 * The loader on the twin's page: plain HTML and CSS in demo/index.html, so it is on screen before any script runs, and it
 * moves on a composited transform, so it keeps moving while the plant is built on the main thread. It comes off when the
 * static batcher has finished, which is when the plant is ready to use, not merely when the first frame is out.
 */
const el = () => document.getElementById('boot-loader')

export const bootStage = (text: string) => {
  const stage = el()?.querySelector('.bl-stage')
  if (stage) stage.textContent = text
}

/** out of the way for the password gate */
export const bootHide = () => el()?.classList.add('bl-hidden')
export const bootShow = () => el()?.classList.remove('bl-hidden')

/** the plant is ready: fade out, then leave the page for good */
export function bootDone() {
  const loader = el()
  if (!loader || loader.classList.contains('bl-off')) return
  loader.classList.add('bl-off')
  setTimeout(() => loader.remove(), 300)
}
