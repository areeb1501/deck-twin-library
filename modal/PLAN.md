# Plan: SAM 3.1 service

Real SAM 3.1 for the CCTV pipeline, built and tested on its own before the twin is wired to it.

**Decisions.**
- **SAM 3.1 only on Modal.** Muse models come from inference providers, so nothing else is hosted here.
- **Meta's `sam3` code, not Ultralytics.** SAM 3.1 needs the latest repo code. The older `sam3-*` apps on the account
  stay as they are.
- **The public site stays simulated.** It has no keys and no gateway.

**Honesty.** The CCTV page says *simulated* for as long as it runs the simulated
detector. A real result gets the label `sam-3.1` from the `model` field the service returns.

## Status

| Step | State |
|---|---|
| Service, security, zone alerts, Meta client | done (`modal/`) |
| Offline and live tests, CI | done |
| Deployed to Modal | done: the `deck-twin-sam31` app |
| CCTV cameras wired to it | done: the 11 colour cameras, in turn. Thermal cameras stay simulated |

## Owns

- `modal/`: `sam31.py`, `setup.sh`, `smoke.py`, `dt_gateway/`, `tests/`
- `alpha/tools/cctv-frames.mjs`: saves raw feeds for testing

## How the twin calls it

- `alpha/sam-route.js` holds the URL and key, read from the environment: Worker secrets in production, `modal/.env.local` on the dev server. The browser never sees either.
- `alpha/src/safety/samClient.ts` sends the main monitor every other frame and the other colour cameras in turn, about two frames a second, only while the camera page is open in a visible tab.
- Each tile shows the frame SAM analysed, so masks line up with the picture. Its badge says `SAM 3.1` or `SIM` from where its detections came from.
- With no secrets set, the route says so and the site runs the simulated detector.

## Verify

- `pytest -m "not live"` in `modal/`, then `pytest -m live` after a deploy.
- `python smoke.py --zone 0 --camera CCTV-A01` returns `zone0Entry` when a person is in the frame.
- `node tools/sam-live.mjs` and `node tools/sam-recall.mjs` in `alpha/` run the real model through the real page.
