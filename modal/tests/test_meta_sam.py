"""The direct Meta Model API route, against a fake server (modal/PLAN.md)."""
import json

import httpx
import pytest

from dt_gateway.meta_sam import MODEL, MetaSam, normalise_box, parse_boxes, read_stream, sniff_image

JPEG = b"\xff\xd8\xff\xe0fake"
PNG = b"\x89PNG\r\n\x1a\nfake"
# the grammar from dev.meta.ai/docs/sam/reading-segmentation, with include_confidence on
LINE = "<0f>0<|box;x1=100;y1=50;x2=300;y2=150;w=400;h=200;c=0.91|><|mask;x=0;y=0;c=0.91;data=46,101,~abc|>,1<|box;x1=0;y1=0;x2=40;y2=20;w=400;h=200;c=0.42|><|mask;x=0;y=0;c=0.42;data=4,4,~d|>"


def sse(*events) -> str:
    return "".join(f"data: {json.dumps(e)}\n\n" for e in events)


def fake_api(prompt_outputs: dict[str, str], seen: list | None = None) -> httpx.Client:
    """Answers /files with an id and /responses with the text set for that prompt."""

    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if request.url.path.endswith("/files"):
            return httpx.Response(200, json={"id": "file-123"})
        body = json.loads(request.content)
        prompt = body["input"][0]["content"][0]["text"]
        text = prompt_outputs[prompt]
        mid = len(text) // 2  # split a token across two deltas, as a real stream can
        events = sse({"type": "response.output_text.delta", "delta": text[:mid]}, {"type": "response.output_text.delta", "delta": text[mid:]}, {"type": "response.completed"})
        return httpx.Response(200, text=events, headers={"content-type": "text/event-stream"})

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_parse_boxes_normalises_and_reads_the_score():
    found, size = parse_boxes(LINE, "person")
    assert size == (400, 200)
    assert found[0] == {"label": "person", "box": [0.25, 0.25, 0.75, 0.75], "score": 0.91}
    assert found[1]["score"] == 0.42


def test_normalise_box_clamps_overshoot_at_the_frame_edge():
    assert normalise_box(-1.7, 10, 1001, 100, 1000, 100) == [0.0, 0.1, 1.0, 1.0]


def test_parse_boxes_applies_the_threshold():
    found, size = parse_boxes(LINE, "person", threshold=0.5)
    assert len(found) == 1
    assert size == (400, 200)


def test_zero_matches_is_empty_text():
    assert parse_boxes("", "person") == ([], None)


def test_score_defaults_to_one_without_include_confidence():
    found, _ = parse_boxes("<0f>0<|box;x1=0;y1=0;x2=10;y2=10;w=10;h=10|>", "person")
    assert found[0]["score"] == 1.0


def test_read_stream_joins_deltas_and_stops_at_completed():
    lines = ['data: {"type":"response.output_text.delta","delta":"a"}', "", 'data: {"type":"response.output_text.delta","delta":"b"}', 'data: {"type":"response.completed"}', 'data: {"type":"response.output_text.delta","delta":"x"}']
    assert read_stream(lines) == "ab"


def test_read_stream_stops_at_done():
    assert read_stream(['data: {"type":"response.output_text.delta","delta":"a"}', "data: [DONE]"]) == "a"


def test_read_stream_raises_on_failure_event():
    with pytest.raises(RuntimeError):
        read_stream(['data: {"type":"response.failed"}'])


def test_sniff_image():
    assert sniff_image(JPEG) == ("upload.jpg", "image/jpeg")
    assert sniff_image(PNG) == ("upload.png", "image/png")
    with pytest.raises(ValueError):
        sniff_image(b"GIF89a")


def test_segment_uploads_once_and_asks_per_prompt():
    seen: list[httpx.Request] = []
    client = fake_api({"person": LINE, "flame": ""}, seen)
    result = MetaSam("k", client).segment(JPEG, ["person", "flame"], threshold=0.5)

    assert [r.url.path for r in seen] == ["/v1/files", "/v1/responses", "/v1/responses"]
    assert result["model"] == MODEL
    assert result["image"] == {"w": 400, "h": 200}
    assert [d["label"] for d in result["detections"]] == ["person"]


def test_request_matches_metas_sample():
    seen: list[httpx.Request] = []
    MetaSam("secret", fake_api({"person": LINE}, seen)).segment(JPEG, ["person"])

    upload, response = seen
    assert upload.headers["authorization"] == "Bearer secret"
    assert b'name="purpose"' in upload.content and b"user_data" in upload.content
    assert b'filename="upload.jpg"' in upload.content and b"image/jpeg" in upload.content

    body = json.loads(response.content)
    assert body["model"] == "sam-3.1"
    assert body["stream"] is True
    assert body["metadata"] == {"mask_encoding": "lossless", "include_confidence": "true"}
    assert body["input"][0]["content"][1] == {"type": "input_image", "file_id": "file-123"}
    assert response.headers["accept"] == "text/event-stream"


def test_upload_without_an_id_raises():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})))
    with pytest.raises(ValueError):
        MetaSam("k", client).upload(JPEG)


def test_api_errors_are_raised():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, json={"error": "bad key"})))
    with pytest.raises(httpx.HTTPStatusError):
        MetaSam("k", client).upload(JPEG)


def test_non_image_is_refused_before_any_request():
    seen: list = []
    with pytest.raises(ValueError):
        MetaSam("k", fake_api({}, seen)).segment(b"not an image", ["person"])
    assert seen == []
