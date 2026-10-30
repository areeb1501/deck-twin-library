// Visitor analytics: PostHog with session replay, on the production hostnames only.
import type { PostHog } from 'posthog-js'

const POSTHOG_TOKEN = 'phc_oVUf4ryT4VD5SszDbynQTMhyoCrXxLaRweiLawmNZqGt'
const POSTHOG_HOSTS = ['decktwin.com', 'www.decktwin.com']

let posthog: PostHog | null = null

export async function initAnalytics() {
  if (!POSTHOG_HOSTS.includes(location.hostname)) return
  const { default: ph } = await import('posthog-js')
  ph.init(POSTHOG_TOKEN, { api_host: 'https://us.i.posthog.com', defaults: '2026-05-30' })
  posthog = ph
}

export const track = (event: string, props?: Record<string, unknown>) => posthog?.capture(event, props)
