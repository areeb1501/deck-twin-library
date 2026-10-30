# SAM 3.1 service

SAM 3.1 from Meta, running on a Modal GPU behind a secure API, plus a direct client for the same model on the Meta
Model API. Status and next steps: [PLAN.md](PLAN.md).

The twin's colour CCTV cameras call it through `alpha/sam-route.js`, the main monitor on every other frame. Thermal cameras stay simulated, and each tile says which it is.

| File | What |
|---|---|
| `sam31.py` | The Modal app: Meta's `sam3` code with the `facebook/sam3.1` checkpoint, on an A10G that scales to zero |
| `setup.sh` | Makes the key, creates the Modal secret, downloads the weights and deploys |
| `smoke.py` | Calls the deployed endpoint on one image |
| `dt_gateway/sam_api.py` | The routes |
| `dt_gateway/security.py` | Key check, rate limit, body limit, CORS, safe errors |
| `dt_gateway/ppe.py` | Detections to alerts: the 65 % rule, PPE geometry, Zones 0, 1 and 2 |
| `dt_gateway/meta_sam.py` | SAM 3.1 through the Meta Model API |
| `tests/` | Offline tests, and `live` tests that call the real endpoints |

## Setup

```bash
./setup.sh
```

It needs the Modal CLI logged in and a `huggingface-secret` Modal secret whose token has access to `facebook/sam3.1`.
It writes the endpoint URL and key to `modal/.env.local`, which git ignores. The key never goes to the browser.

## API

Every route except `/health` needs the key, as `X-API-Key` or `Authorization: Bearer`.

| Route | Body | Returns |
|---|---|---|
| `GET /health` | | `{status, model}` |
| `POST /v1/segment` | `image_base64`, `prompts` (1 to 8 noun phrases), `threshold` (0.3), `return_masks` | `{model, image, detections, ms}` |
| `POST /v1/ppe` | `image_base64`, `camera`, `zone` (0, 1, 2, `"safe"`), `permit`, `threshold` (0.65), `people`, `return_masks` | the same, plus `alerts` |

- A detection is `{label, box: [x0, y0, x1, y1] normalised, score}`, plus `polygons` when masks are asked for.
- Images are JPEG or PNG as base64. There is no URL input, so the service never fetches anything it is handed.
- `people` is where the twin's worn tags say each worker is: `{workerId, box, zone, permit}`. It names a person SAM found and gives their own zone. It never adds a person, and SAM alone decides what they wear.
- An alert matches `Detection` in `alpha/src/safety/types.ts`: `kind`, `box`, `confidence`, `camera`, `model`, and for zones
  `zone` and `missing`.

## Alert rules

A person, flame or smoke raises an alert from a score of 65 %. PPE is only judged on a figure at least 50 pixels tall: below that a hat is a few pixels across, so a guess would be a false alarm. PPE counts as worn from 30 %, so an unsure hat doesn't
become a false "no hat" alert.

| Zone | Alert |
|---|---|
| 0 | `zone0Entry` for anyone without a permit, whatever they wear |
| 1, 2 | `zonePpe`, listing the missing `hardHat` and `vest` |
| safe or unset | `noHardHat`, `noVest` |
| any | `fire` for flame or smoke |

A camera can't see a clip-on gas monitor, so that stays with the worn tag in the twin.

## Meta Model API

`MetaSam` in `dt_gateway/meta_sam.py` is the same flow as Meta's curl sample: upload to `/v1/files`, then a streaming
`/v1/responses` call for each noun phrase. Set `MODEL_API_KEY` to use it. It costs $2.50 per 1 000 images, and each
prompt counts as an image. The five PPE prompts cost about 1.25 cents a frame, so sample frames rather than stream.

## Tests

```bash
uv venv --python 3.12 && uv pip install -r requirements-dev.txt
uv run --no-project pytest -m "not live"   # offline, runs in CI
uv run --no-project pytest -m live         # real calls, by hand
```

`tests/fixtures/twin-frame.jpg` is a raw feed from `node alpha/tools/cctv-frames.mjs`, with no detection overlays.

## Cost

The GPU costs nothing while idle. A container stays up 5 minutes after the last request. `max_containers` is 2.
