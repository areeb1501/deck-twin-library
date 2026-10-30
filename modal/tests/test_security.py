"""Auth, limits and error handling of the endpoint guard (modal/PLAN.md)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from dt_gateway.security import RateLimiter, allowed_origins, install_guard, key_matches

KEY = "test-key"


def app_with_guard(api_key=KEY, **guard) -> TestClient:
    app = FastAPI()
    install_guard(app, api_key, origins=["http://localhost:5173"], **guard)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/echo")
    def echo():
        return {"ok": True}

    @app.get("/boom")
    def boom():
        raise RuntimeError("secret path /weights/sam3.1 leaked")

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    "supplied,expected,ok",
    [("a", "a", True), ("a", "b", False), (None, "a", False), ("", "a", False), ("a", None, False), ("a", "", False), (None, None, False)],
)
def test_key_matches(supplied, expected, ok):
    assert key_matches(supplied, expected) is ok


def test_health_needs_no_key():
    assert app_with_guard().get("/health").status_code == 200


def test_post_without_key_is_refused():
    assert app_with_guard().post("/echo", content=b"{}").status_code == 401


def test_get_routes_need_a_key_too():
    assert app_with_guard().get("/boom").status_code == 401


def test_wrong_key_is_refused():
    assert app_with_guard().post("/echo", content=b"{}", headers={"X-API-Key": "nope"}).status_code == 401


def test_x_api_key_and_bearer_both_work():
    client = app_with_guard()
    assert client.post("/echo", content=b"{}", headers={"X-API-Key": KEY}).status_code == 200
    assert client.post("/echo", content=b"{}", headers={"Authorization": f"Bearer {KEY}"}).status_code == 200


def test_unset_server_key_fails_closed():
    client = app_with_guard(api_key=None)
    assert client.post("/echo", content=b"{}", headers={"X-API-Key": ""}).status_code == 401
    assert client.post("/echo", content=b"{}", headers={"X-API-Key": "None"}).status_code == 401


def test_oversized_body_is_refused():
    client = app_with_guard(max_body=10)
    assert client.post("/echo", content=b"x" * 11, headers={"X-API-Key": KEY}).status_code == 413


def test_rate_limit_answers_429_with_retry_after():
    client = app_with_guard(rate_per_minute=2)
    headers = {"X-API-Key": KEY}
    assert [client.post("/echo", content=b"{}", headers=headers).status_code for _ in range(2)] == [200, 200]
    refused = client.post("/echo", content=b"{}", headers=headers)
    assert refused.status_code == 429
    assert refused.headers["retry-after"] == "60"


def test_rate_limiter_window_slides():
    limiter = RateLimiter(2, window_s=60)
    assert limiter.allow("k", now=0) and limiter.allow("k", now=1)
    assert not limiter.allow("k", now=2)
    assert limiter.allow("k", now=61)


def test_errors_never_return_exception_text():
    r = app_with_guard().get("/boom", headers={"X-API-Key": KEY})
    assert r.status_code == 500
    assert "weights" not in r.text
    assert r.json()["request_id"]


def test_cors_allows_only_listed_origins():
    client = app_with_guard()
    preflight = {"Access-Control-Request-Method": "POST"}
    good = client.options("/echo", headers={"Origin": "http://localhost:5173", **preflight})
    bad = client.options("/echo", headers={"Origin": "https://evil.example", **preflight})
    assert good.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers


def test_wildcard_origin_is_dropped():
    assert allowed_origins({"DECK_TWIN_ORIGINS": "*, https://decktwin.com"}) == ["https://decktwin.com"]
