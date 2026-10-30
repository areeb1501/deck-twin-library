"""
Request guard for every model endpoint (modal/PLAN.md).

Started from the X-API-Key check in the `sam3-inspect` app, then tightened:
  - the key compare is constant time and fails closed when no key is configured;
  - every route needs the key except /health, not only the POST ones;
  - CORS is an allow-list, never `*`;
  - body size and request rate are capped, because each call costs GPU time or API credit;
  - errors return a request id, never exception text.
"""
from __future__ import annotations

import hmac
import logging
import os
import time
import uuid
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

log = logging.getLogger("dt_gateway")

OPEN_PATHS = {"/health"}
#: base64 of a 512 × 288 CCTV frame is far below this; a 12 MP photo still fits
MAX_BODY_BYTES = 16 * 1024 * 1024
#: requests per minute, per container. The twin's camera page sends about two frames a second
RATE_PER_MINUTE = 240


def key_matches(supplied: str | None, expected: str | None) -> bool:
    """Constant-time compare. An unset server key rejects everything."""
    if not expected or not supplied:
        return False
    return hmac.compare_digest(supplied.encode(), expected.encode())


def supplied_key(request: Request) -> str | None:
    """X-API-Key, or `Authorization: Bearer …` for OpenAI-style clients."""
    key = request.headers.get("x-api-key")
    if key:
        return key
    auth = request.headers.get("authorization", "")
    return auth[7:] if auth.lower().startswith("bearer ") else None


class RateLimiter:
    """Sliding window. In memory, so the cap is per container; max_containers bounds the total."""

    def __init__(self, limit: int, window_s: float = 60.0):
        self.limit = limit
        self.window_s = window_s
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        q = self.hits[key]
        while q and now - q[0] >= self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True


def allowed_origins(env: dict | None = None) -> list[str]:
    """Comma-separated DECK_TWIN_ORIGINS. A `*` entry is dropped: the gateway is never open to any site."""
    env = os.environ if env is None else env
    raw = env.get("DECK_TWIN_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]


def install_guard(
    app: FastAPI,
    api_key: str | None,
    *,
    origins: list[str] | None = None,
    max_body: int = MAX_BODY_BYTES,
    rate_per_minute: int = RATE_PER_MINUTE,
) -> None:
    """Add auth, limits and safe errors to `app`. Call once, after creating it."""
    limiter = RateLimiter(rate_per_minute)

    @app.middleware("http")
    async def guard(request: Request, call_next):
        request_id = uuid.uuid4().hex[:12]
        if request.url.path in OPEN_PATHS:
            return await call_next(request)

        def refuse(status: int, error: str, headers: dict | None = None):
            return JSONResponse({"error": error, "request_id": request_id}, status_code=status, headers=headers)

        if not key_matches(supplied_key(request), api_key):
            return refuse(401, "missing or invalid API key")
        if not limiter.allow("gateway"):
            return refuse(429, "rate limit reached", {"Retry-After": "60"})
        if request.method == "POST":
            length = request.headers.get("content-length")
            if length is None or not length.isdigit():
                return refuse(411, "content-length required")
            if int(length) > max_body:
                return refuse(413, f"body over {max_body} bytes")
        try:
            return await call_next(request)
        except Exception:
            log.exception("request %s failed", request_id)
            return refuse(500, "internal error")

    # added last so it wraps the guard: refused requests still carry CORS headers for allowed sites
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins() if origins is None else origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type", "x-api-key", "authorization"],
    )
