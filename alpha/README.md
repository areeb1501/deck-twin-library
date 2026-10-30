# /alpha: private Deck Twin demo

Two pages, served unlisted on the library site:

| Path | What |
|---|---|
| `/alpha/` | Landing page (`index.html`, `landing/`): plain HTML and CSS, no WebGL |
| `/alpha/demo/` | The twin (`demo/index.html`, `src/`, `bridge/`, `lite/`) |

- The twin draws its UI at 90 % here (`twin-scale` in `demo/index.html`, set by `lite/boot.ts`). The 3D viewport isn't scaled, so picking and the canvas size are unchanged.
- The landing page carries the library site's nav (plain HTML in `index.html`, so a new site tab goes in both places). Search and ⌘K open a dialog on the page itself (`landing/search.ts`), with the site's ranking and the same results. It fetches `/r/index.json` on first use. It has no theme toggle: the page is dark only.
- Linked from the library home page since 2026-10-30, at the user's request. Still not in the sitemap, robots.txt or llms.txt.
- `noindex, nofollow` meta tags in both pages, plus an `X-Robots-Tag` header from `../public/_headers`, which is tracked so a deploy from GitHub keeps it.
- Tracked in git since 2026-10-30, so the repo must stay private: making it public exposes this code and the page. `../public/alpha/` (build output) stays local, listed in `.git/info/exclude`.
- `src/` began as a copy of `../../deck-twin`, and this folder is now the source. Edit `src/` here. There is no refresh from `deck-twin` any more.
- The Workers button has a stepper beside it: 10 on shift by default, 1 to 24, kept between visits. `WORKER_COUNT` in `src/state/store.ts` sets the cap. `node tools/crew.mjs` tests it against the dev server.
- Anyone with the URL can open it. Build with `DEMO_PASSWORD` set to add the password gate to the twin.

## Media

Clips and stills are in the private R2 bucket `deck-twin-alpha-media`, under `v2/`, served at `/alpha/media/*` by `worker.js`, which also sets noindex and handles the range requests Safari needs for video. The bucket has no public URL. They were cut from `../../deck-twin/video/out/clips`: 1280 to 1920 px wide, H.264 with no sound, each with a same-named `.webp` poster. The two long films, `hero-flyover` (25.6 s) and `walk-bridge` (13 s), have `data-film` in `index.html`: each also has `.av1.mp4` and a small `-sm.mp4` cut, and a baked dissolve so the loop has no jump. Objects are cached as immutable, so a changed file needs a new name or a `v2/`. In dev, `/alpha/media` proxies to the live site. `landing/media.sh` rebuilds and uploads the whole set; change `SET` in it for a new version.

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

## Loading plant.json

`bridge/` lets the twin load a library `plant.json` and draw the real registry components. `lite/boot.ts` loads it before the app starts.

| File | What |
|---|---|
| `bridge/index.ts` | Registers the format and the renderer with the engine's seams. Everything heavy loads on demand. |
| `bridge/load.ts` | Runs `cli/check.mjs` and `resolve()`, the code behind `deck-twin check` and `<Plant>`, so a file that passes the CLI loads here. Builds the engine shell: one invisible proxy per item, plus data-only lines. |
| `bridge/LibraryLayer.tsx` | Draws `<Plant>` in the plant root, measures each item, tags meshes for picking, and joins registry materials to the section box and x-ray. |
| `bridge/brief.ts` | The rules behind the plant menu's *Agent rules* button. |

Imported plants have no process model, so the ticker, alarm bar, Operations, maintenance and the console are hidden for them.

## Commands (run in this folder)

| Task | Command |
|---|---|
| Dev server | `npm run dev` → http://localhost:5191/alpha/demo/ |
| Tests | `npm test` |
| Rebuild | `npm run build` (writes `../public/alpha`) |
| Save raw CCTV feeds | `node tools/cctv-frames.mjs [outDir]`, with the dev server running |
| Deploy | `cd .. && npm run deploy` (the library build copies `public/alpha` into `dist`) |

## Remove it

```
git rm -r alpha
rm -rf public/alpha public/_headers
```

Then remove the two lines from `.git/info/exclude`, take `main`, the assets `binding` and `run_worker_first`, and `r2_buckets` out of `wrangler.jsonc`, and delete the `deck-twin-alpha-media` bucket. Then run `npm run deploy`.
