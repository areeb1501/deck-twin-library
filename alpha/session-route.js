// Accounts on the site's Worker: who is signed in, and a check in front of every paid model call.
// Everything here needs the D1 binding `DB` (see database/README.md). Without it the routes behave as they did before.
import { json } from './sam-route.js'

export const SESSION_ROUTE = '/alpha/api/session'
const COOKIE = 'dt_session'

const USER = `
  SELECT u.id, u.organisation_id, u.name, u.email, u.account_type, u.console_view,
         o.name AS organisation, t.label AS account_label, t.can_switch_views
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  JOIN organisations o ON o.id = u.organisation_id
  JOIN account_types t ON t.key = u.account_type
  WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`

const VIEWS = `
  SELECT v.key, v.label, v.description, p.page_key
  FROM console_views v
  JOIN console_view_pages p ON p.view_key = v.key
  ORDER BY v.sort, p.page_key`

const cookie = (request) => (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1]

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** the signed-in user, or null */
export async function currentUser(request, env) {
  const token = env.DB && cookie(request)
  if (!token) return null
  return env.DB.prepare(USER).bind(await sha256(token), new Date().toISOString()).first()
}

/** the views this user may open, as { key: { label, description, pages } } */
async function viewsFor(user, env) {
  const { results } = await env.DB.prepare(VIEWS).all()
  const views = {}
  for (const r of results) {
    if (!user.can_switch_views && r.key !== user.console_view) continue
    ;(views[r.key] ??= { label: r.label, description: r.description, pages: [] }).pages.push(r.page_key)
  }
  return views
}

export async function sessionRoute(request, env) {
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405, { Allow: 'GET' })
  const services = { database: !!env.DB, sam: !!(env.DECK_TWIN_SAM_URL && env.DECK_TWIN_API_KEY) }
  const user = await currentUser(request, env)
  if (!user) return json({ user: null, services })
  return json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      organisation: user.organisation,
      accountType: user.account_type,
      accountLabel: user.account_label,
      canSwitchViews: !!user.can_switch_views,
      view: user.console_view,
    },
    views: await viewsFor(user, env),
    services,
  })
}

const mayOpen = async (user, pages, env) => {
  if (user.can_switch_views) return true
  const { results } = await env.DB.prepare('SELECT page_key FROM console_view_pages WHERE view_key = ?').bind(user.console_view).all()
  return results.some((r) => pages.includes(r.page_key))
}

/** Puts a paid model route behind sign-in and records each call. `pages` are the console tabs that use the route */
export async function modelRequest(request, env, ctx, handle, pages) {
  if (!env.DB || request.method !== 'POST') return handle(request, env)
  const user = await currentUser(request, env)
  if (!user) return json({ error: 'sign in required' }, 401)
  if (!(await mayOpen(user, pages, env))) return json({ error: 'not available in this view' }, 403)
  const started = Date.now()
  const response = await handle(request, env)
  const row = env.DB.prepare('INSERT INTO model_requests (organisation_id, user_id, route, status, duration_ms) VALUES (?, ?, ?, ?, ?)')
    .bind(user.organisation_id, user.id, new URL(request.url).pathname, response.status, Date.now() - started)
    .run()
  ctx.waitUntil(row.catch(() => {}))
  return response
}
