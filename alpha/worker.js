// The library site's Worker. It serves demo media from the private R2 bucket at /alpha/media/*, with the same noindex rule as
// the rest of /alpha, and hands everything else to the static assets. Range requests matter: Safari won't play video without them.
const PREFIX = '/alpha/media/'

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith(PREFIX)) return env.ASSETS.fetch(request)
    const head = request.method === 'HEAD'
    if (!head && request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })

    const key = decodeURIComponent(pathname.slice(PREFIX.length))
    const ranged = !head && request.headers.has('range')
    let object
    try {
      object = head ? await env.MEDIA.head(key) : await env.MEDIA.get(key, ranged ? { range: request.headers } : {})
    } catch {
      return new Response('Range not satisfiable', { status: 416 })
    }
    if (!object) return new Response('Not found', { status: 404 })

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('accept-ranges', 'bytes')
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive')
    if (ranged && object.range) {
      const { offset = 0, length = object.size - offset, suffix } = object.range
      const start = suffix ? object.size - suffix : offset
      const size = suffix ?? length
      headers.set('content-range', `bytes ${start}-${start + size - 1}/${object.size}`)
      headers.set('content-length', String(size))
      return new Response(object.body, { status: 206, headers })
    }
    headers.set('content-length', String(object.size))
    return new Response(head ? null : object.body, { headers })
  },
}
