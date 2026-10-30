"""
The SAM 3.1 web API (modal/PLAN.md). Modal supplies the GPU; this file supplies the routes.

    GET  /health       no key; says the service is up, nothing else
    POST /v1/segment   image + noun phrases → detections
    POST /v1/ppe       camera frame + zone → detections and safety alerts

`segmenter` is any `(image: bytes, prompts: list[str], threshold: float, return_masks: bool) -> dict` that returns
`{model, image, detections}`. The tests pass a fake one, so the routes run without a GPU.
"""
from __future__ import annotations

import time
from typing import Callable

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from . import ppe
from .schema import PpeRequest, SegmentRequest, decode_image
from .security import install_guard

Segmenter = Callable[[bytes, list[str], float, bool], dict]


def create_sam_app(segmenter: Segmenter, api_key: str | None, **guard) -> FastAPI:
    app = FastAPI(title="Deck Twin SAM 3.1", docs_url=None, redoc_url=None, openapi_url=None)
    install_guard(app, api_key, **guard)

    @app.get("/health")
    def health():
        return {"status": "ok", "model": "sam-3.1"}

    @app.post("/v1/segment")
    def segment(body: SegmentRequest):
        try:
            image = decode_image(body.image_base64)
        except ValueError as e:
            return JSONResponse({"error": str(e)}, status_code=400)
        t0 = time.perf_counter()
        result = segmenter(image, body.prompts, body.threshold, body.return_masks)
        return {**result, "ms": round((time.perf_counter() - t0) * 1000)}

    @app.post("/v1/ppe")
    def check_ppe(body: PpeRequest):
        try:
            image = decode_image(body.image_base64)
        except ValueError as e:
            return JSONResponse({"error": str(e)}, status_code=400)
        t0 = time.perf_counter()
        result = segmenter(image, ppe.PPE_PROMPTS, ppe.SEEN_THRESHOLD, body.return_masks)
        detections = ppe.match_people(result["detections"], [p.model_dump() for p in body.people])
        height = (result.get("image") or {}).get("h")
        alerts = ppe.evaluate(detections, zone=body.zone, camera=body.camera, permit=body.permit, threshold=body.threshold, frame_height=height)
        return {**result, "detections": detections, "alerts": alerts, "camera": body.camera, "zone": body.zone, "ms": round((time.perf_counter() - t0) * 1000)}

    return app
