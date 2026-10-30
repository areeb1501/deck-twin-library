"""
Real calls, skipped unless the keys are there (modal/PLAN.md). Each run spends a little.

    pytest -m live

  - the deployed endpoint: needs modal/.env.local, which setup.sh writes;
  - the Meta Model API: needs MODEL_API_KEY in the environment.
"""
import base64
import os
from pathlib import Path

import httpx
import pytest

from dt_gateway.meta_sam import MetaSam

HERE = Path(__file__).parent
FRAME = HERE / "fixtures" / "twin-frame.jpg"
ENV_FILE = HERE.parent / ".env.local"

pytestmark = pytest.mark.live


def gateway() -> dict:
    if not ENV_FILE.exists():
        pytest.skip("no modal/.env.local: run setup.sh first")
    return dict(line.split("=", 1) for line in ENV_FILE.read_text().splitlines() if "=" in line)


def post(path: str, body: dict, env: dict, key: str | None) -> httpx.Response:
    headers = {"X-API-Key": key} if key else {}
    return httpx.post(f"{env['DECK_TWIN_SAM_URL']}{path}", json=body, headers=headers, timeout=300, follow_redirects=True)


def frame_b64() -> str:
    return base64.b64encode(FRAME.read_bytes()).decode()


def test_deployed_endpoint_refuses_no_key():
    env = gateway()
    assert post("/v1/segment", {"image_base64": "x", "prompts": ["person"]}, env, None).status_code == 401


def test_deployed_endpoint_refuses_a_wrong_key():
    env = gateway()
    assert post("/v1/segment", {"image_base64": "x", "prompts": ["person"]}, env, "wrong").status_code == 401


def test_deployed_endpoint_docs_are_closed():
    env = gateway()
    assert httpx.get(f"{env['DECK_TWIN_SAM_URL']}/docs", follow_redirects=True).status_code in (401, 404)


def test_deployed_endpoint_finds_a_person_in_a_twin_frame():
    env = gateway()
    r = post("/v1/segment", {"image_base64": frame_b64(), "prompts": ["person"], "threshold": 0.3, "return_masks": True}, env, env["DECK_TWIN_API_KEY"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["model"] == "sam-3.1"
    assert body["detections"], "SAM 3.1 found no person in the twin frame"
    assert body["detections"][0]["polygons"]


def test_deployed_endpoint_raises_zone_alerts():
    env = gateway()
    r = post("/v1/ppe", {"image_base64": frame_b64(), "zone": 0, "camera": "CCTV-TEST", "threshold": 0.3}, env, env["DECK_TWIN_API_KEY"])
    assert r.status_code == 200, r.text
    assert any(a["kind"] == "zone0Entry" for a in r.json()["alerts"])


@pytest.mark.skipif(not os.environ.get("MODEL_API_KEY"), reason="MODEL_API_KEY is not set")
def test_meta_model_api_segments_a_twin_frame():
    result = MetaSam(os.environ["MODEL_API_KEY"]).segment(FRAME.read_bytes(), ["person"], threshold=0.3)
    assert result["model"] == "sam-3.1"
    assert result["image"], "the API returned no matches"
