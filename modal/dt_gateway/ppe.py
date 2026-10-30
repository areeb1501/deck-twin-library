"""
Turns SAM 3.1 detections on one camera frame into safety alerts (modal/PLAN.md).

Output kinds and fields match `Detection` in alpha/src/safety/types.ts, so results can merge into `useCctv.live`
without translation. The zone rules mirror the table in alpha/src/safety/hazardAreas.ts:
  - Zone 0: nobody enters without a permit;
  - Zones 1 and 2: hard hat and vest, seen by the camera;
  - gasMonitor is not checked here. A camera can't see a clip-on monitor, and the twin takes it from the worn tag.
"""
from __future__ import annotations

from typing import Iterable

#: noun phrases for SAM. It is asked one concept at a time.
PROMPT_PERSON = "person"
PROMPT_HAT = "hard hat"
PROMPT_VEST = "high-visibility vest"
PROMPT_FLAME = "flame"
PROMPT_SMOKE = "smoke"
PPE_PROMPTS = [PROMPT_PERSON, PROMPT_HAT, PROMPT_VEST, PROMPT_FLAME, PROMPT_SMOKE]

#: a person or a hazard must beat this to raise an alert
ALERT_THRESHOLD = 0.65
#: PPE counts as worn from this score. Lower on purpose: an unsure hat must not become a "no hat" alert.
SEEN_THRESHOLD = 0.30
#: a figure shorter than this, in pixels, is too small to judge PPE on: a hat is only a few pixels across
MIN_FIGURE_PX = 50

ZONE_VALUES = (0, 1, 2, "safe", None)


def box_of(person: dict, top: float, bottom: float) -> tuple[float, float, float, float]:
    """Horizontal band of a person box, as fractions of its height from the top."""
    x0, y0, x1, y1 = person["box"]
    h = y1 - y0
    return x0, y0 + h * top, x1, y0 + h * bottom


def wears_hat(person: dict, hats: Iterable[dict]) -> bool:
    """A hat whose centre lies in the top 25 % of the person box."""
    x0, y0, x1, y1 = box_of(person, 0.0, 0.25)
    for hat in hats:
        hx0, hy0, hx1, hy1 = hat["box"]
        cx, cy = (hx0 + hx1) / 2, (hy0 + hy1) / 2
        if x0 <= cx <= x1 and y0 <= cy <= y1:
            return True
    return False


def wears_vest(person: dict, vests: Iterable[dict]) -> bool:
    """A vest overlapping the 30–65 % height band of the person box."""
    x0, y0, x1, y1 = box_of(person, 0.30, 0.65)
    for vest in vests:
        vx0, vy0, vx1, vy1 = vest["box"]
        if min(x1, vx1) > max(x0, vx0) and min(y1, vy1) > max(y0, vy0):
            return True
    return False


def overlap(a: list[float], b: list[float]) -> float:
    """Intersection over union of two boxes."""
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    if w <= 0 or h <= 0:
        return 0.0
    both = w * h
    return both / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - both)


def match_people(detections: list[dict], people: list[dict], floor: float = 0.1) -> list[dict]:
    """
    Puts identity on the people SAM found. `people` is where the twin's worn tags say each worker is in this frame:
    `{workerId, box, zone, permit}`. It only names someone SAM saw. It never adds a person, and SAM's own judgement of
    what they wear is what counts. Most confident person first, each worker used once.
    """
    free = list(people)
    named = {}
    found = [d for d in detections if d["label"] == PROMPT_PERSON]
    for person in sorted(found, key=lambda d: -d["score"]):
        best = max(free, key=lambda p: overlap(person["box"], p["box"]), default=None)
        if best is None or overlap(person["box"], best["box"]) < floor:
            continue
        free.remove(best)
        named[id(person)] = {"workerId": best["workerId"], "zone": best.get("zone"), "permit": bool(best.get("permit"))}
    return [{**d, **named[id(d)]} if id(d) in named else d for d in detections]


def evaluate(
    detections: list[dict],
    *,
    zone: int | str | None = None,
    camera: str | None = None,
    permit: bool = False,
    threshold: float = ALERT_THRESHOLD,
    frame_height: int | None = None,
) -> list[dict]:
    """
    One alert per finding, highest confidence first.

    detections: `{label, box: [x0, y0, x1, y1] normalised, score}`, as the segment endpoints return them.
    zone: the hazardous-area zone the camera looks at. None or "safe" uses the plain PPE kinds. A person named by
    match_people uses their own zone and permit instead.
    """
    if zone not in ZONE_VALUES:
        raise ValueError(f"zone must be 0, 1, 2, 'safe' or null, not {zone!r}")

    def of(label: str, floor: float) -> list[dict]:
        return [d for d in detections if d["label"] == label and d["score"] >= floor]

    hats = of(PROMPT_HAT, SEEN_THRESHOLD)
    vests = of(PROMPT_VEST, SEEN_THRESHOLD)
    alerts: list[dict] = []

    def alert(kind: str, source: dict, **extra) -> None:
        alerts.append({"kind": kind, "label": source["label"], "box": source["box"], "confidence": source["score"], "camera": camera, "model": "sam-3.1", **extra})

    for person in of(PROMPT_PERSON, threshold):
        who = {"workerId": person["workerId"]} if person.get("workerId") else {}
        own_zone = person["zone"] if person.get("zone") is not None else zone
        own_permit = person.get("permit", False) or permit
        if own_zone == 0:
            if not own_permit:
                alert("zone0Entry", person, zone=0, **who)
            continue
        if frame_height and (person["box"][3] - person["box"][1]) * frame_height < MIN_FIGURE_PX:
            continue
        missing = []
        if not wears_hat(person, hats):
            missing.append("hardHat")
        if not wears_vest(person, vests):
            missing.append("vest")
        if not missing:
            continue
        if own_zone in (1, 2):
            alert("zonePpe", person, zone=own_zone, missing=missing, **who)
        else:
            if "hardHat" in missing:
                alert("noHardHat", person, **who)
            if "vest" in missing:
                alert("noVest", person, **who)

    for label in (PROMPT_FLAME, PROMPT_SMOKE):
        for hazard in of(label, threshold):
            alert("fire", hazard)

    return sorted(alerts, key=lambda a: -a["confidence"])
