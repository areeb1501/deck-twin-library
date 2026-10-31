// SAM 3.1 tracking one recorded clip on the operator's own Meta key: the Worker in production, the dev server locally. Same rules
// as meta-sam-route.js: the key is used for this one request and never stored, logged or sent anywhere but Meta, and it travels in
// the body. The clip goes inline as a base64 `video_url`, so nothing is left in Meta's Files API to expire or delete, and the prompt
// is fixed, so this can't be used to spend on anything else. Meta's event stream passes straight through, undecoded: a long answer
// costs the Worker no CPU, and the browser reads it (src/safety/metaReview.ts).
import { API, KEY, PASS_THROUGH, refuse } from './meta-sam-route.js'
import { json } from './sam-route.js'

export const META_VIDEO_ROUTE = '/alpha/api/meta-sam-video'
// a 15 s clip at 1 Mbit/s as base64 is about 2.5 MB. Meta's own inline limit is 50 MB
const MAX_BODY = 4_000_000
const VIDEO = 'data:video/mp4;base64,'

/** `person` through one clip. `one_bit` masks are the small ones, which Meta recommends for video */
export const videoBody = (video) => ({
  model: 'sam-3.1',
  input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'person' }, { type: 'input_video', video_url: video }] }],
  stream: true,
  metadata: { mask_encoding: 'one_bit', include_confidence: 'true' },
})

export async function metaVideoRoute(request, env) {
  const no = await refuse(request, env, MAX_BODY)
  if (no) return no
  const body = await request.json().catch(() => null)
  if (typeof body?.key !== 'string' || !KEY.test(body.key) || typeof body.video !== 'string' || !body.video.startsWith(VIDEO)) return json({ error: 'bad request' }, 400)
  let upstream
  try {
    upstream = await fetch(API, {
      method: 'POST',
      headers: { authorization: `Bearer ${body.key}`, 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(videoBody(body.video)),
    })
  } catch {
    return json({ error: 'Meta did not answer' }, 502)
  }
  if (!upstream.ok || !upstream.body) return json({ error: 'Meta did not answer' }, PASS_THROUGH.has(upstream.status) ? upstream.status : 502)
  return new Response(upstream.body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' } })
}
