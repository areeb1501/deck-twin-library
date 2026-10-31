# Plan: SAM 3.1 service

Real SAM 3.1 for the CCTV pipeline, built and tested on its own before the twin is wired to it.

**Decisions.**
- **SAM 3.1 only on Modal.** Muse models come from inference providers, so nothing else is hosted here.
- **Meta's `sam3` code, not Ultralytics.** SAM 3.1 needs the latest repo code. The older `sam3-*` apps on the account
  stay as they are.
- **The public site starts simulated.** It holds no keys. Real SAM 3.1 runs only when an operator turns it on, on the site's Modal GPU if one is connected, or on their own Meta key.

**Honesty.** The CCTV page says *simulated* for as long as it runs the simulated
detector. A real result gets the label `sam-3.1` from the `model` field the service returns.

## Status

| Step | State |
|---|---|
| Service, security, zone alerts, Meta client | done (`modal/`) |
| Offline and live tests, CI | done |
| Deployed to Modal | done: the `deck-twin-sam31` app |
| CCTV cameras wired to it | done: the 11 colour cameras, in turn. Thermal cameras stay simulated |
| Operator's own Meta key | done: main monitor only, images. Not yet run against the real API with a valid key |
| Review the last 10 s | done: one press tracks a recorded clip, on the same key. Not yet run against the real API with a valid key |

## Owns

- `modal/`: `sam31.py`, `setup.sh`, `smoke.py`, `dt_gateway/`, `tests/`
- `alpha/tools/cctv-frames.mjs`: saves raw feeds for testing
- `alpha/meta-sam-route.js`, `alpha/src/safety/metaSam.ts`, `metaKey.ts`, `metaStream.ts`: the operator's own Meta key
- `alpha/meta-sam-video-route.js`, `alpha/src/safety/metaReview.ts`: reviewing a clip on that key

## How the twin calls it

- `alpha/sam-route.js` holds the URL and key, read from the environment: Worker secrets in production, `modal/.env.local` on the dev server. The browser never sees either.
- `alpha/src/safety/samClient.ts` sends the main monitor every other frame and the other colour cameras in turn, about two frames a second, only while the camera page is open in a visible tab.
- The live video always stays on top. Masks fade on it between answers, moving a camera clears them, and nothing is sent until the head has rested for a second. A tile's badge says `SAM 3.1` or `SIM` from where its detections came from.
- With no secrets set, the route says so and the site runs the simulated detector.
- The switch is off on every load and is never remembered. Leaving the camera page turns it off.

## Your own Meta key

The Detector model card on the camera page takes a key from dev.meta.ai. The operator pays Meta directly and no GPU of ours is involved.

**The route.** The browser posts the key, one JPEG and the noun phrases to `alpha/meta-sam-route.js`, on the Worker in production and the dev server locally. It calls `POST /v1/responses` with the frame as a base64 `image_url`, so nothing is uploaded and no files pile up (Files API uploads never expire by default). It returns the raw output text, and the browser decodes the masks with `@meta-sam/parser`, which keeps the Worker within its CPU limit. The route accepts only the five noun phrases the twin uses, at most three at a time, so it can't be used to spend on anything else.

**Why a server route.** Meta's auth docs say to keep keys out of client code. `api.meta.ai` answers preflights with `Access-Control-Allow-Headers: *`, which the Fetch standard says does not cover `Authorization`. Chrome 152 allowed a direct call anyway; other browsers may not.

**The key.** Kept encrypted in IndexedDB under a non-extractable AES key (`metaKey.ts`). It travels in the POST body because Workers invocation logs can record headers, and the route never stores or logs it.

**What it shows.** A scan replaces only what it looked for. With flame and smoke unticked, the twin's fire detection stays on that camera, marked simulated, so a fire call-up keeps its box. The tag on the monitor says how old the scan is. A camera goes back to the twin as soon as it leaves the main monitor.

**What it costs.** SAM 3.1 is $2.50 per 1,000 images, and each noun phrase on a frame is one image. The Modal cadence of five prompts, two frames a second, would be about $90 an hour here. So:

| Guard | Rule |
|---|---|
| Off by default | Every load starts simulated |
| Where | Only the main monitor's camera, only on the camera page, only in a visible tab, never a thermal camera |
| When | One scan at a time, every 5, 10 or 20 s. A camera must stay up and still for 1 s first, so scrolling past one or panning it is free |
| Prompts | `person` first. Hard hat and vest only if someone is big enough to judge, so an empty frame costs one image. Flame and smoke are opt-in |
| Limit | 200 images per turn-on (about $0.50), then it turns itself off |
| Errors | Any error turns it off, with the reason. There are no retries |

At the default settings that is at most $5.40 an hour, and $1.80 an hour on empty frames. The running count on the card is requests × list price, an estimate rather than Meta's bill.

## Video

SAM 3.1 also tracks objects through a clip, with stable ids and up to 16 objects a frame. Live scanning stays on images, for the reasons below. Tracking is built for one job: "Review the last 10 s" on the camera page.

- **Price.** $0.20 per 1,000 frames, with at least 50 frames billed per request: at least $0.01 per noun phrase per clip, which is four images.
- **Cheaper per frame, not per look.** A 50-frame clip costs 0.02 cents a frame against 0.25 cents for an image. For one look every few seconds, images still cost less.
- **Not real time.** The answer can't start until the clip has been recorded, so it lags by the clip length plus processing. A 5 s clip at 10 fps means about 5 s of delay, and $7.20 an hour for one noun phrase if run back to back.
- **Format.** MP4 or MOV in H.264, H.265 or MPEG-4. WebM and VP9 are refused, so a recorder must check `MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')`. Up to 15,000 frames a request.
- **Noun phrases or marked objects.** A noun phrase finds every match. Box and point prompts mark up to 16 objects and `metadata.propagation_direction` picks which frames are tracked; `forward` costs less than the default `both`. A request can't mix the two.
- **Best fit.** Incident review, which is where tracking helps most, for a known price on each press.

### Review the last 10 s

The Detector model card shows the button while the Meta switch is on, on a colour camera, where the browser can record H.264 in MP4. It is hidden elsewhere, so Firefox doesn't get it.

**Recording.** The clip is made in the browser and goes nowhere until the button is pressed. MediaRecorder can't cut a clip out of a running recording, so overlapping takes run: one starts every 5 s, and each is thrown away at 15 s. The oldest always holds the last 10 s, and a press sends all of it, so a clip is 10 to 15 s long. Changing camera or hiding the tab starts over, because a clip must show one camera with no gap.

**One canvas per take.** Chrome writes a frame only when a canvas changes, and a recorder added to a shared stream repeats a frame to the others. So each take copies the monitor onto its own canvas every 300 ms. Measured in Chrome, that gives exactly one frame per copy, within 2 ms of the time noted. The replay needs those times, because `<Nf>` counts frames, not seconds, and timers run late under load. The monitor repaints about twice a second, so some frames repeat.

**The route.** `alpha/meta-sam-video-route.js` has the same origin check, rate limit and key rules as the image route, with a 4 MB limit. The clip goes inline as a base64 `video_url`, so nothing is left in Files API storage to expire or delete. Meta's inline limit is 50 MB, and a 13 s clip of twin footage is about 0.2 MB. The prompt is fixed to `person`. Meta's event stream passes straight through undecoded, so a long answer costs the Worker no CPU, and the browser reads it with `parseVideoStream`.

**The replay.** It has its own panel beside the monitors, labelled as a recording. The live video is never covered, and scans carry on. A track is kept or dropped whole, on its best score.

| Guard | Rule |
|---|---|
| Off by default | Nothing records until the switch is on |
| When | One press, one request, one at a time. Nothing is sent on a timer |
| Price | A frame every 300 ms for at most 15 s is at most 50 frames, so a press should bill the 50-frame minimum: $0.01, shown before the press. That rests on Meta counting the file's frames, which is not yet confirmed |
| Limit | Counts as 4 images against the same 200 per turn-on, and it stops at the limit before sending |
| Errors | Any error turns the switch off, with the reason. There are no retries |

**Still to check with a real key.** None of this has run against Meta yet.

- **Does Meta take the clip?** Chrome writes a fragmented MP4 (`ftyp moov moof mdat mfra`). The `moov` comes first, as faststart needs, but it holds no samples, so Meta may remux it. `ffmpeg -c copy -movflags +faststart` keeps all 43 frames of a test clip with the same timestamps, so a plain remux is safe.
- **How does Meta count frames?** The docs say one output line per frame and billing per frame segmented, and their recipes keep the source frame rate. They don't say what happens to a clip this slow, about 3 fps at an uneven rate. If Meta resampled it to a fixed rate, one press could bill several times $0.01, the card would under-count, and the masks would drift against the picture. Check the first real press on Meta's usage page.
- **Other browsers.** One frame per copy was measured in Chrome only. Safari would show the button but has not been tried.

## Verify

- `pytest -m "not live"` in `modal/`, then `pytest -m live` after a deploy.
- `python smoke.py --zone 0 --camera CCTV-A01` returns `zone0Entry` when a person is in the frame.
- `node tools/sam-live.mjs` and `node tools/sam-recall.mjs` in `alpha/` run the real model through the real page.
- `node tools/meta-sam-mock.mjs` and `node tools/meta-review-mock.mjs` in `alpha/` drive the real page with Meta faked, at no cost. The second needs `ffprobe`, and checks the clip Meta would get.
