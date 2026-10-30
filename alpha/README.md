# /alpha: private Deck Twin demo

Two pages, served unlisted on the library site:

| Path | What |
|---|---|
| `/alpha/` | Landing page (`index.html`, `landing/`): plain HTML and CSS, no WebGL |
| `/alpha/demo/` | The twin (`demo/index.html`, `src/`, `bridge/`, `lite/`), a copy of `../../deck-twin` |

- Not linked from the site, not in the sitemap, robots.txt or llms.txt.
- `noindex, nofollow` meta tags in both pages, plus an `X-Robots-Tag` header from `../public/_headers`.
- Tracked in git since 2026-10-30, so the repo must stay private: making it public exposes this code and the page. `../public/alpha/` (build output) and `../public/_headers` stay local, listed in `.git/info/exclude`.
- `src/` and `public/` are a copy of `../../deck-twin`. Edit there, then run `npm run refresh`: anything edited directly in `alpha/src` is deleted by the next refresh. Files outside `src/` (`landing/`, `lite/`, `bridge/`, `worker.js`, this README, the configs) belong here.
- Anyone with the URL can open it. Build with `DEMO_PASSWORD` set to add the password gate to the twin.

## Media

Clips and stills are in the private R2 bucket `deck-twin-alpha-media`, under `v1/`, served at `/alpha/media/*` by `worker.js`, which also sets noindex and handles the range requests Safari needs for video. The bucket has no public URL. They were cut from `../../deck-twin/video/out/clips`: 1280 to 1920 px wide, H.264 with no sound, each with a same-named `.webp` poster. Objects are cached as immutable, so a changed file needs a new name or a `v2/`. In dev, `/alpha/media` proxies to the live site. `landing/media.sh` rebuilds and uploads the whole set; change `SET` in it for a new version.

## Phones and small screens

`demo/index.html` loads `lite/boot.ts`, not `src/main.tsx`. It picks a tier before the 3.8 MB twin is fetched:

| Device | Gets |
|---|---|
| Laptop, desktop, 12.9" iPad, anything with a fine pointer | the full twin |
| Phones and smaller tablets (touch only, short side under 1024 px) | `lite/lite.ts`: model renders, console screenshots, design facts and the "best viewed on a larger, GPU-enabled device" note. No WebGL |
| No WebGL2, or a screen under 340 px | a "not compatible" note |

Phones can't open the twin from the light view (the user's choice: it crashes them). The images in `lite/img/` are
captures of the twin: renders via `?tick` plus `__snap` (camera presets, walk view, the V-1100 section box) and
headless screenshots of the console pages.
`lite/` sits outside `src/`, so `npm run refresh` keeps it.

## Loading plant.json

`bridge/` lets the twin load a library `plant.json` and draw the real registry components. It lives outside `src/` because a
deck-twin build can't reach `../registry`, and `npm run refresh` keeps it. `lite/boot.ts` loads it before the app starts.

| File | What |
|---|---|
| `bridge/index.ts` | Registers the format and the renderer with the engine's seams. Everything heavy loads on demand. |
| `bridge/load.ts` | Runs `cli/check.mjs` and `resolve()`, the code behind `deck-twin check` and `<Plant>`, so a file that passes the CLI loads here. Builds the engine shell: one invisible proxy per item, plus data-only lines. |
| `bridge/LibraryLayer.tsx` | Draws `<Plant>` in the plant root, measures each item, tags meshes for picking, and joins registry materials to the section box and x-ray. |
| `bridge/brief.ts` | The rules behind the plant menu's *Agent rules* button. |

Imported plants have no process model, so the ticker, alarm bar, Operations, maintenance and the console are hidden for them.

Commit changes to `src/` in `../../deck-twin` first, with the same title here after `npm run refresh`.

## Commands (run in this folder)

| Task | Command |
|---|---|
| Refresh the copy from `../../deck-twin` and rebuild | `npm run refresh` |
| Rebuild only | `npm run build` (writes `../public/alpha`) |
| Deploy | `cd .. && npm run deploy` (the library build copies `public/alpha` into `dist`) |

## Remove it

```
git rm -r alpha
rm -rf public/alpha public/_headers
```

Then remove the two lines from `.git/info/exclude`, take `main`, the assets `binding` and `run_worker_first`, and `r2_buckets` out of `wrangler.jsonc`, and delete the `deck-twin-alpha-media` bucket. Then run `npm run deploy`.
