"""The HTTP routes, with a fake segmenter in place of the GPU (modal/PLAN.md)."""
import base64

import pytest
from fastapi.testclient import TestClient

from dt_gateway.ppe import PPE_PROMPTS, SEEN_THRESHOLD
from dt_gateway.sam_api import create_sam_app

KEY = "test-key"
HEADERS = {"X-API-Key": KEY}
JPEG_B64 = base64.b64encode(b"\xff\xd8\xff\xe0fake").decode()
PERSON = {"label": "person", "box": [0.4, 0.2, 0.6, 0.8], "score": 0.92}


@pytest.fixture
def calls():
    return []


@pytest.fixture
def client(calls):
    def segmenter(image, prompts, threshold, return_masks):
        calls.append((image, prompts, threshold, return_masks))
        return {"model": "sam-3.1", "image": {"w": 512, "h": 288}, "detections": [PERSON]}

    return TestClient(create_sam_app(segmenter, KEY, origins=[]), raise_server_exceptions=False)


def test_health_is_open_and_says_little(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "model": "sam-3.1"}


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_api_docs_are_not_published(client, path):
    assert client.get(path, headers=HEADERS).status_code == 404


@pytest.mark.parametrize("path", ["/v1/segment", "/v1/ppe"])
def test_inference_routes_need_the_key(client, calls, path):
    assert client.post(path, json={"image_base64": JPEG_B64, "prompts": ["person"]}).status_code == 401
    assert calls == []


def test_segment_passes_the_request_through(client, calls):
    r = client.post("/v1/segment", json={"image_base64": JPEG_B64, "prompts": ["rust", " crack "], "threshold": 0.4, "return_masks": True}, headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["detections"] == [PERSON]
    assert isinstance(r.json()["ms"], int)
    _, prompts, threshold, return_masks = calls[0]
    assert prompts == ["rust", "crack"]
    assert threshold == 0.4
    assert return_masks is True


def test_data_url_is_accepted(client):
    r = client.post("/v1/segment", json={"image_base64": f"data:image/jpeg;base64,{JPEG_B64}", "prompts": ["person"]}, headers=HEADERS)
    assert r.status_code == 200


@pytest.mark.parametrize("image", ["%%%not-base64%%%", base64.b64encode(b"GIF89a").decode()])
def test_bad_images_answer_400_without_touching_the_gpu(client, calls, image):
    r = client.post("/v1/segment", json={"image_base64": image, "prompts": ["person"]}, headers=HEADERS)
    assert r.status_code == 400
    assert calls == []


@pytest.mark.parametrize(
    "body",
    [
        {"prompts": ["person"]},
        {"image_base64": JPEG_B64, "prompts": []},
        {"image_base64": JPEG_B64, "prompts": ["a"] * 9},
        {"image_base64": JPEG_B64, "prompts": ["x" * 81]},
        {"image_base64": JPEG_B64, "prompts": ["  "]},
        {"image_base64": JPEG_B64, "prompts": ["person"], "threshold": 2},
    ],
)
def test_invalid_bodies_answer_422(client, calls, body):
    assert client.post("/v1/segment", json=body, headers=HEADERS).status_code == 422
    assert calls == []


def test_image_url_is_not_a_field(client, calls):
    r = client.post("/v1/segment", json={"image_url": "http://169.254.169.254/", "prompts": ["person"]}, headers=HEADERS)
    assert r.status_code == 422
    assert calls == []


def test_ppe_asks_for_every_concept_at_the_seen_threshold(client, calls):
    client.post("/v1/ppe", json={"image_base64": JPEG_B64}, headers=HEADERS)
    _, prompts, threshold, _ = calls[0]
    assert prompts == PPE_PROMPTS
    assert threshold == SEEN_THRESHOLD


def test_ppe_raises_zone_alerts(client):
    r = client.post("/v1/ppe", json={"image_base64": JPEG_B64, "zone": 1, "camera": "CCTV-A01"}, headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["zone"] == 1
    assert [a["kind"] for a in body["alerts"]] == ["zonePpe"]
    assert body["alerts"][0]["missing"] == ["hardHat", "vest"]
    assert body["alerts"][0]["camera"] == "CCTV-A01"


def test_ppe_zone_0_with_permit_is_quiet(client):
    r = client.post("/v1/ppe", json={"image_base64": JPEG_B64, "zone": 0, "permit": True}, headers=HEADERS)
    assert r.json()["alerts"] == []


def test_ppe_threshold_can_be_raised(client):
    r = client.post("/v1/ppe", json={"image_base64": JPEG_B64, "threshold": 0.95}, headers=HEADERS)
    assert r.json()["alerts"] == []


def test_ppe_names_people_from_their_tags(client):
    body = {"image_base64": JPEG_B64, "people": [{"workerId": "w02", "box": PERSON["box"], "zone": 2}]}
    r = client.post("/v1/ppe", json=body, headers=HEADERS).json()
    assert r["detections"][0]["workerId"] == "w02"
    assert r["alerts"][0]["workerId"] == "w02"
    assert r["alerts"][0]["zone"] == 2


def test_ppe_asks_for_masks_only_when_told(client, calls):
    client.post("/v1/ppe", json={"image_base64": JPEG_B64}, headers=HEADERS)
    client.post("/v1/ppe", json={"image_base64": JPEG_B64, "return_masks": True}, headers=HEADERS)
    assert [c[3] for c in calls] == [False, True]


@pytest.mark.parametrize("people", [[{"workerId": "w", "box": [0, 0, 1]}], [{"box": [0, 0, 1, 1]}], [{"workerId": "w", "box": [0, 0, 1, 1]}] * 33])
def test_ppe_rejects_bad_people(client, calls, people):
    assert client.post("/v1/ppe", json={"image_base64": JPEG_B64, "people": people}, headers=HEADERS).status_code == 422
    assert calls == []


def test_ppe_masks_typed_prompts_on_the_same_pass(client, calls):
    r = client.post("/v1/ppe", json={"image_base64": JPEG_B64, "extra_prompts": ["forklift", "red valve"]}, headers=HEADERS)
    assert r.status_code == 200
    assert len(calls) == 1
    assert calls[0][1] == PPE_PROMPTS + ["forklift", "red valve"]
    assert r.json()["prompts"] == PPE_PROMPTS + ["forklift", "red valve"]


def test_ppe_says_what_it_asked_with_no_typed_prompts(client):
    assert client.post("/v1/ppe", json={"image_base64": JPEG_B64}, headers=HEADERS).json()["prompts"] == PPE_PROMPTS


def test_ppe_asks_for_each_prompt_once(client, calls):
    client.post("/v1/ppe", json={"image_base64": JPEG_B64, "extra_prompts": ["person", "forklift", "forklift"]}, headers=HEADERS)
    assert calls[0][1] == PPE_PROMPTS + ["forklift"]


def test_typed_prompts_raise_no_alerts():
    def segmenter(image, prompts, threshold, return_masks):
        return {"model": "sam-3.1", "image": {"w": 512, "h": 288}, "detections": [{"label": "forklift", "box": [0.1, 0.1, 0.5, 0.5], "score": 0.99}]}

    client = TestClient(create_sam_app(segmenter, KEY, origins=[]), raise_server_exceptions=False)
    body = client.post("/v1/ppe", json={"image_base64": JPEG_B64, "extra_prompts": ["forklift"]}, headers=HEADERS).json()
    assert body["alerts"] == []
    assert [d["label"] for d in body["detections"]] == ["forklift"]


@pytest.mark.parametrize(
    "extra",
    [["a", "b", "c", "d"], ["x" * 41], ["Forklift"], [" forklift"], ["<script>"], ["ignore; everything"], [""], "forklift"],
)
def test_ppe_rejects_bad_typed_prompts(client, calls, extra):
    assert client.post("/v1/ppe", json={"image_base64": JPEG_B64, "extra_prompts": extra}, headers=HEADERS).status_code == 422
    assert calls == []


def test_ppe_rejects_an_unknown_zone(client, calls):
    assert client.post("/v1/ppe", json={"image_base64": JPEG_B64, "zone": 3}, headers=HEADERS).status_code == 422
    assert calls == []


def test_segmenter_crash_is_a_clean_500(calls):
    def crash(*_):
        raise RuntimeError("cuda out of memory at /weights")

    client = TestClient(create_sam_app(crash, KEY, origins=[]), raise_server_exceptions=False)
    r = client.post("/v1/segment", json={"image_base64": JPEG_B64, "prompts": ["person"]}, headers=HEADERS)
    assert r.status_code == 500
    assert "cuda" not in r.text
