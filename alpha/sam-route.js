// The browser's only way to SAM 3.1. The key stays here, on the server: the Worker in production, the dev server locally.
// GET says whether the model is connected. POST forwards one camera frame to the Modal endpoint.
export const SAM_ROUTE = '/alpha/api/sam'
// a 960 × 540 JPEG as base64, with the people list, is well under this
const MAX_BODY = 2_000_000
// what the browser may see of an upstream answer; anything else is our fault, not theirs
const PASS_THROUGH = new Set([200, 400, 422, 429])

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noarchive', ...extra } })

export async function samRoute(request, env) {
  const ready = !!(env.DECK_TWIN_SAM_URL && env.DECK_TWIN_API_KEY)
  if (request.method === 'GET') return json({ ready })
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, { Allow: 'GET, POST' })
  if (!ready) return json({ error: 'SAM 3.1 is not connected on this site' }, 503)
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'wrong origin' }, 403)
  const length = request.headers.get('content-length')
  if (!length || !/^\d+$/.test(length)) return json({ error: 'content-length required' }, 411)
  if (Number(length) > MAX_BODY) return json({ error: 'frame too large' }, 413)
  if (env.SAM_LIMIT) {
    const { success } = await env.SAM_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? 'local' })
    if (!success) return json({ error: 'rate limit reached' }, 429, { 'Retry-After': '60' })
  }
  let upstream
  try {
    upstream = await fetch(`${env.DECK_TWIN_SAM_URL}/v1/ppe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.DECK_TWIN_API_KEY },
      body: await request.text(),
    })
  } catch {
    return json({ error: 'SAM 3.1 did not answer' }, 502)
  }
  if (!PASS_THROUGH.has(upstream.status)) return json({ error: 'SAM 3.1 did not answer' }, 502)
  return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' } })
}
