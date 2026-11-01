/** The noun phrases SAM 3.1 is asked for, in one place for the browser and the Worker. The rule matches `Phrase` in modal/dt_gateway/schema.py. */
export const PERSON = 'person'
export const BUILT_IN = [PERSON, 'hard hat', 'high-visibility vest', 'flame', 'smoke']
/** what the operator may add. The Meta route takes three to a request, and 5 + 3 is the most the Modal route asks for on a frame */
export const MAX_TYPED = 3
const PHRASE = /^[a-z0-9][a-z0-9 -]{0,39}$/

export const isPhrase = (text: unknown) => typeof text === 'string' && PHRASE.test(text)

/** what was typed in the form SAM is asked for it, or null if it can't be sent */
export function cleanPhrase(text: string) {
  const clean = text.trim().toLowerCase().replace(/\s+/g, ' ')
  return isPhrase(clean) ? clean : null
}
