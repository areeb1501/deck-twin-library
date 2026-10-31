/** Reads Meta's event stream, on the Worker for one image (meta-sam-route.js) and in the browser for one clip (metaReview.ts). */
export class Upstream extends Error {
  status: number
  constructor(status: number) {
    super(`Meta answered ${status}`)
    this.status = status
  }
}

/** the `response.output_text.delta` events of a stream, joined */
export async function readStream(body: ReadableStream<Uint8Array>) {
  const lines = body.pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>).getReader()
  let text = ''
  let rest = ''
  for (;;) {
    const { value, done } = await lines.read()
    const parts = (rest + (value ?? '')).split('\n')
    rest = done ? '' : parts.pop()!
    for (const line of parts) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return text
      const event = JSON.parse(payload)
      if (event.type === 'response.output_text.delta') text += event.delta ?? ''
      else if (event.type === 'response.completed') return text
      else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') throw new Upstream(502)
    }
    if (done) return text
  }
}
