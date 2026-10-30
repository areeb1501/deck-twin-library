// The server route to SAM 3.1: the key stays on the server, only this site can call it, and what the browser sees is safe.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { SAM_ROUTE, samRoute } from '../alpha/sam-route.js'

const ORIGIN = 'https://decktwin.com'
const URL_ = `${ORIGIN}${SAM_ROUTE}`
const ENV = { DECK_TWIN_SAM_URL: 'https://sam.example', DECK_TWIN_API_KEY: 'server-key' }

const post = (body = '{}', headers = {}) =>
  new Request(URL_, { method: 'POST', body, headers: { origin: ORIGIN, 'content-length': String(body.length), 'cf-connecting-ip': '1.2.3.4', ...headers } })

function upstream(t, status = 200, body = '{"detections":[]}') {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    return new Response(body, { status })
  })
  return calls
}

describe('sam route', () => {
  test('says when it is connected', async () => {
    assert.deepEqual(await (await samRoute(new Request(URL_), ENV)).json(), { ready: true })
  })

  test('says when it is not connected', async () => {
    assert.deepEqual(await (await samRoute(new Request(URL_), {})).json(), { ready: false })
  })

  test('the status answer holds no secret', async () => {
    assert.ok(!(await (await samRoute(new Request(URL_), ENV)).text()).includes('server-key'))
  })

  test('answers 503 to a frame when it is not connected', async (t) => {
    const calls = upstream(t)
    assert.equal((await samRoute(post(), {})).status, 503)
    assert.equal(calls.length, 0)
  })

  test('refuses other methods', async () => {
    assert.equal((await samRoute(new Request(URL_, { method: 'PUT' }), ENV)).status, 405)
  })

  test('refuses another site', async (t) => {
    const calls = upstream(t)
    assert.equal((await samRoute(post('{}', { origin: 'https://evil.example' }), ENV)).status, 403)
    assert.equal(calls.length, 0)
  })

  test('refuses a request with no origin', async (t) => {
    const calls = upstream(t)
    const request = new Request(URL_, { method: 'POST', body: '{}', headers: { 'content-length': '2' } })
    assert.equal((await samRoute(request, ENV)).status, 403)
    assert.equal(calls.length, 0)
  })

  test('refuses an oversized frame', async (t) => {
    const calls = upstream(t)
    assert.equal((await samRoute(post('{}', { 'content-length': '2000001' }), ENV)).status, 413)
    assert.equal(calls.length, 0)
  })

  test('needs a content length', async () => {
    const request = new Request(URL_, { method: 'POST', body: '{}', headers: { origin: ORIGIN } })
    assert.equal((await samRoute(request, ENV)).status, 411)
  })

  test('adds the key and forwards the frame', async (t) => {
    const calls = upstream(t)
    const r = await samRoute(post('{"camera":"A01"}'), ENV)
    assert.equal(r.status, 200)
    assert.equal(calls[0].url, 'https://sam.example/v1/ppe')
    assert.equal(calls[0].init.headers['x-api-key'], 'server-key')
    assert.equal(calls[0].init.body, '{"camera":"A01"}')
  })

  test('limits each visitor separately', async (t) => {
    upstream(t)
    const keys = []
    const SAM_LIMIT = { limit: async ({ key }) => (keys.push(key), { success: false }) }
    const r = await samRoute(post(), { ...ENV, SAM_LIMIT })
    assert.equal(r.status, 429)
    assert.equal(r.headers.get('retry-after'), '60')
    assert.deepEqual(keys, ['1.2.3.4'])
  })

  test('hides an upstream key failure', async (t) => {
    upstream(t, 401, '{"error":"missing or invalid API key"}')
    const r = await samRoute(post(), ENV)
    assert.equal(r.status, 502)
    assert.ok(!(await r.text()).includes('API key'))
  })

  test('answers 502 when Modal is unreachable', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('connect ECONNREFUSED sam.example')
    })
    const r = await samRoute(post(), ENV)
    assert.equal(r.status, 502)
    assert.ok(!(await r.text()).includes('sam.example'))
  })

  test('passes a bad frame answer through', async (t) => {
    upstream(t, 400, '{"error":"image must be JPEG or PNG"}')
    assert.equal((await samRoute(post(), ENV)).status, 400)
  })

  test('nothing it sends is cached or indexed', async (t) => {
    upstream(t)
    const r = await samRoute(post(), ENV)
    assert.equal(r.headers.get('cache-control'), 'no-store')
    assert.match(r.headers.get('x-robots-tag'), /noindex/)
  })
})
