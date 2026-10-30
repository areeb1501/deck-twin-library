/**
 * "Walk to" from anywhere (console dashboard, alerts, CCTV, chat answers): close the console, enter
 * the walkthrough and stand a few metres in front of the item, facing it, on the right deck.
 *
 * The walker (scene/Walk.tsx) handles `requestFocus` while walking. It only exists once walk mode is
 * on, so the focus is requested a moment after walk mode starts (a fresh nonce, after the walker's
 * own mount placement).
 */
import { useStore } from '../state/store'
import { pickOf } from './hmi/nav'

export function walkToTag(tag: string): boolean {
  const pick = pickOf(tag)
  if (!pick) return false
  const st = useStore.getState()
  st.setHmi(null)
  if (st.craneCab) st.setCraneCab(null)
  st.select(pick)
  if (st.walk) {
    st.requestFocus(tag)
    return true
  }
  st.setWalk(true)
  window.setTimeout(() => useStore.getState().requestFocus(tag), 80)
  return true
}
