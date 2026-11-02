// Visitor analytics for /alpha and /alpha/demo: PostHog with session replay, on the hostnames people visit only. Google and Simple Analytics are in each page's HTML.
const POSTHOG_TOKEN = 'phc_oVUf4ryT4VD5SszDbynQTMhyoCrXxLaRweiLawmNZqGt'
const POSTHOG_HOSTS = ['decktwin.com', 'www.decktwin.com', 'deck-twin-demo.demoareeb.workers.dev']

export async function initAnalytics() {
  if (!POSTHOG_HOSTS.includes(location.hostname)) return
  const { default: posthog } = await import('posthog-js')
  posthog.init(POSTHOG_TOKEN, { api_host: 'https://us.i.posthog.com', defaults: '2026-05-30', session_recording: { blockSelector: '.label-layer' } })
}
