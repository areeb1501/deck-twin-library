#!/usr/bin/env python3
"""
Calls the deployed SAM 3.1 endpoint on one image and prints what it found (modal/PLAN.md).

    python smoke.py [image.jpg] [--zone 1] [--camera CCTV-A01]

Reads the URL and key from modal/.env.local. The first call after idle waits for a GPU, about a minute.
"""
import argparse
import base64
import json
from pathlib import Path

import httpx

HERE = Path(__file__).parent
DEFAULT_IMAGE = HERE / "tests" / "fixtures" / "twin-frame.jpg"


def load_env() -> dict:
    lines = (HERE / ".env.local").read_text().splitlines()
    return dict(line.split("=", 1) for line in lines if "=" in line and not line.startswith("#"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("image", nargs="?", default=str(DEFAULT_IMAGE))
    ap.add_argument("--zone", default=None, help="0, 1, 2 or safe")
    ap.add_argument("--camera", default=None)
    args = ap.parse_args()

    env = load_env()
    zone = int(args.zone) if args.zone in ("0", "1", "2") else args.zone
    body = {"image_base64": base64.b64encode(Path(args.image).read_bytes()).decode(), "zone": zone, "camera": args.camera}
    r = httpx.post(f"{env['DECK_TWIN_SAM_URL']}/v1/ppe", json=body, headers={"X-API-Key": env["DECK_TWIN_API_KEY"]}, timeout=300, follow_redirects=True)
    r.raise_for_status()
    print(json.dumps(r.json(), indent=2))


if __name__ == "__main__":
    main()
