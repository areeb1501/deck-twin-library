"""
SAM 3.1 through the Meta Model API (modal/PLAN.md).

The direct route: no GPU of ours, $2.50 per 1 000 images. Same flow as Meta's curl sample: POST /files, then a
streaming POST /responses with one noun phrase per request.

The answer is special-token text, one line per frame:
    <0f>0<|box;x1=353;y1=382;x2=453;y2=427;w=537;h=561;c=0.91|><|mask;x=0;y=0;c=0.91;data=…|>
Boxes carry the source frame size and, with include_confidence, a score. The twin needs boxes and scores, so masks
are left alone here. `meta-sam-parser` decodes them when an overlay needs the pixels.
"""
from __future__ import annotations

import json
import re
from typing import Iterable

import httpx

API_BASE = "https://api.meta.ai/v1"
MODEL = "sam-3.1"
TIMEOUT_S = 60.0

_BOX = re.compile(r"<\|box;([^|]*)\|>")


def sniff_image(data: bytes) -> tuple[str, str]:
    """(filename, mime) from the magic bytes. Anything else is refused before it costs money."""
    if data[:3] == b"\xff\xd8\xff":
        return "upload.jpg", "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "upload.png", "image/png"
    raise ValueError("image must be JPEG or PNG")


def normalise_box(x0: float, y0: float, x1: float, y1: float, w: int, h: int) -> list[float]:
    """Pixel corners to 0 … 1. SAM can overshoot the frame edge by a few pixels, so this clamps."""
    return [round(min(max(v / size, 0.0), 1.0), 4) for v, size in ((x0, w), (y0, h), (x1, w), (y1, h))]


def parse_boxes(text: str, label: str, threshold: float = 0.0) -> tuple[list[dict], tuple[int, int] | None]:
    """Detections from the output text, in normalised coords, plus the frame size as (w, h)."""
    detections, size = [], None
    for match in _BOX.finditer(text):
        fields = dict(part.split("=", 1) for part in match.group(1).split(";") if "=" in part)
        w, h = int(fields["w"]), int(fields["h"])
        size = (w, h)
        score = float(fields.get("c", 1.0))
        if score < threshold:
            continue
        box = normalise_box(int(fields["x1"]), int(fields["y1"]), int(fields["x2"]), int(fields["y2"]), w, h)
        detections.append({"label": label, "box": box, "score": round(score, 4)})
    return detections, size


def read_stream(lines: Iterable[str]) -> str:
    """Joins `response.output_text.delta` events into the output text."""
    text = []
    for line in lines:
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            break
        event = json.loads(payload)
        kind = event.get("type")
        if kind == "response.output_text.delta":
            text.append(event.get("delta", ""))
        elif kind == "response.completed":
            break
        elif kind in ("response.failed", "error"):
            raise RuntimeError(f"Meta Model API stream failed: {kind}")
    return "".join(text)


class MetaSam:
    """One API key, one HTTP client. `client` is injectable for tests."""

    def __init__(self, api_key: str, client: httpx.Client | None = None, base: str = API_BASE):
        self.base = base.rstrip("/")
        self.client = client or httpx.Client(timeout=TIMEOUT_S)
        self.headers = {"Authorization": f"Bearer {api_key}"}

    def upload(self, image: bytes) -> str:
        name, mime = sniff_image(image)
        r = self.client.post(f"{self.base}/files", headers=self.headers, data={"purpose": "user_data"}, files={"file": (name, image, mime)})
        r.raise_for_status()
        file_id = r.json().get("id")
        if not isinstance(file_id, str) or not file_id:
            raise ValueError("upload response had no file id")
        return file_id

    def request_body(self, file_id: str, prompt: str) -> dict:
        return {
            "model": MODEL,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt},
                        {"type": "input_image", "file_id": file_id},
                    ],
                }
            ],
            "stream": True,
            # metadata values are strings in this API
            "metadata": {"mask_encoding": "lossless", "include_confidence": "true"},
        }

    def segment_one(self, file_id: str, prompt: str, threshold: float) -> tuple[list[dict], tuple[int, int] | None]:
        headers = {**self.headers, "Content-Type": "application/json", "Accept": "text/event-stream"}
        with self.client.stream("POST", f"{self.base}/responses", headers=headers, json=self.request_body(file_id, prompt)) as r:
            r.raise_for_status()
            text = read_stream(r.iter_lines())
        return parse_boxes(text, prompt, threshold)

    def segment(self, image: bytes, prompts: list[str], threshold: float = 0.3) -> dict:
        """Same shape as the Modal endpoint's /v1/segment. Each prompt is one billed image."""
        file_id = self.upload(image)
        detections, size = [], None
        for prompt in prompts:
            found, frame = self.segment_one(file_id, prompt, threshold)
            detections.extend(found)
            size = frame or size
        return {"model": MODEL, "image": {"w": size[0], "h": size[1]} if size else None, "detections": detections}
