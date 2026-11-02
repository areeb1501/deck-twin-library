# Deck Twin demo

The shareable demo: the Alpha field landing page at `/alpha/` and the twin at `/alpha/demo/`. `/` redirects to `/alpha/`, and every other path returns 404.

This branch is cut from `main` with the library site, CLI and docs removed. `registry/` and `cli/check.mjs` stay because the twin is built from them.

```bash
npm install --prefix alpha
```

```bash
npm run deploy
```

That builds into `dist/` and deploys the `deck-twin-demo` Worker, separate from the library site. To bring in new work, merge `main` and keep this branch's deletions.
