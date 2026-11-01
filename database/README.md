# Database

The console's metadata in Cloudflare D1: accounts, sessions, console views and a log of paid model calls. Plant data, alarms and scenarios stay in the twin.

| File | What it does |
|---|---|
| `schema.sql` | Creates the tables and indexes. Safe to run again. |
| `seed.sql` | Loads account types, console views, tabs and two starter admin accounts. Safe to run again. |
| `init.sh` | Runs both with Wrangler, against the local database unless you pass `--remote`. |

## Tables

| Table | Holds |
|---|---|
| `organisations` | Each company using the console |
| `account_types` | `user` (sign-up), `system_admin`, `super_admin`, and what each may do |
| `console_views` | `all`, `operations`, `finance`, `hse` |
| `console_pages` | One row per console tab |
| `console_view_pages` | Which tabs each view shows |
| `users` | Accounts, each with an account type and an assigned view |
| `sessions` | Signed-in browsers, as a hash of the cookie |
| `model_requests` | One row per forwarded model call: who, route, status, duration. Never a key, prompt or frame. |
| `audit_log` | Who changed what |

## Account types and views

An account has two separate settings. The account type decides what it may do, and the view decides which tabs it sees.

| Account type | Views | Can also |
|---|---|---|
| Sign-up user | The one view assigned to it. Never `all`: the schema refuses it. | |
| System admin | All four, switched at the top right of the console | Manage users in its organisation |
| Super admin | All four | Manage users and organisations everywhere |

| View | Label | Tabs |
|---|---|---|
| `all` | System admin | All 20 |
| `operations` | Operator | 14: process, alarms, shutdown, F&G, response, machines, maintenance and shift work |
| `finance` | Finance | 5: economics, spares, dashboard, trends, maintenance |
| `hse` | HSE | 12: risk, CCTV, inspections, F&G, alarms, shutdown, response, maintenance and drills |

`seed.sql` and `alpha/src/state/views.ts` hold the same lists, and `alpha/tests/database.test.ts` fails if they differ.

## Set up

Create the database, then add the printed id to `wrangler.jsonc`. Workers Builds uses the `previews` block for branch builds, so the binding goes in both places.

```bash
npx wrangler d1 create deck-twin
```

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "deck-twin", "database_id": "<id>" }],
"previews": {
  "d1_databases": [{ "binding": "DB", "database_name": "deck-twin", "database_id": "<id>" }]
}
```

Load it locally, then for real:

```bash
./database/init.sh
```

```bash
./database/init.sh --remote
```

## What changes when `DB` is bound

The Worker works without this database. Binding it does two things in `alpha/session-route.js`:

- `GET /alpha/api/session` reports the signed-in user from the `dt_session` cookie.
- `POST` to the SAM 3.1 and model routes needs a signed-in user whose view includes the tab that uses the route. Each call is logged in `model_requests`.

**Sign-in is not built yet.** Nothing creates a session, so binding `DB` closes the model routes to everyone until a sign-in route exists. Until then the console shows the default system admin, set in `alpha/src/state/account.ts`.
