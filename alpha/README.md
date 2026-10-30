# /alpha: private copy of the Deck Twin app

A copy of `../../deck-twin` (the full Alpha field), served unlisted at `/alpha/` on the library site.

- Not linked from the site, not in the sitemap, robots.txt or llms.txt.
- `noindex, nofollow` meta tag in `index.html`, plus an `X-Robots-Tag` header from `../public/_headers` (also git-excluded).
- Tracked in git since 2026-10-30, so the repo must stay private: making it public exposes this code and the page. `../public/alpha/` (build output) and `../public/_headers` stay local, listed in `.git/info/exclude`.
- `src/` and `public/` are a copy of `../../deck-twin`. Edit there, then run `npm run refresh`: anything edited directly in `alpha/src` is deleted by the next refresh. Files outside `src/` (`lite/`, this README, the configs) belong here.
- Anyone with the URL can open it. Build with `DEMO_PASSWORD` set to add the password gate.

## Phones and small screens

`index.html` loads `lite/boot.ts`, not `src/main.tsx`. It picks a tier before the 3.8 MB twin is fetched:

| Device | Gets |
|---|---|
| Laptop, desktop, 12.9" iPad, anything with a fine pointer | the full twin |
| Phones and smaller tablets (touch only, short side under 1024 px) | `lite/lite.ts`: model renders, console screenshots, design facts and the "best viewed on a larger, GPU-enabled device" note. No WebGL |
| No WebGL2, or a screen under 340 px | a "not compatible" note |

Phones can't open the twin from the light view (the user's choice: it crashes them). The images in `lite/img/` are
captures of the twin: renders via `?tick` plus `__snap` (camera presets, walk view, the V-1100 section box) and
headless screenshots of the console pages.
`lite/` sits outside `src/`, so `npm run refresh` keeps it.

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
npm run deploy
```

Then remove the two lines from `.git/info/exclude`.
