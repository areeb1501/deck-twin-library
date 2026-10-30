"""Detections to alerts: the 65 % rule, PPE geometry and the zone rules (modal/PLAN.md)."""
import pytest

from dt_gateway.ppe import ALERT_THRESHOLD, PROMPT_FLAME, PROMPT_HAT, PROMPT_PERSON, PROMPT_SMOKE, PROMPT_VEST, evaluate, match_people, overlap

PERSON_BOX = [0.40, 0.20, 0.60, 0.80]
HAT_BOX = [0.45, 0.20, 0.55, 0.28]  # centre inside the top 25 % of the person
VEST_BOX = [0.42, 0.40, 0.58, 0.55]  # inside the 30–65 % band


def det(label, box, score=0.9):
    return {"label": label, "box": box, "score": score}


def person(score=0.9):
    return det(PROMPT_PERSON, PERSON_BOX, score)


def kinds(alerts):
    return sorted(a["kind"] for a in alerts)


def test_threshold_is_the_agreed_65_percent():
    assert ALERT_THRESHOLD == 0.65


def test_fully_dressed_person_raises_nothing():
    assert evaluate([person(), det(PROMPT_HAT, HAT_BOX), det(PROMPT_VEST, VEST_BOX)]) == []


def test_no_hat_and_no_vest_on_open_deck():
    assert kinds(evaluate([person()])) == ["noHardHat", "noVest"]


def test_person_below_threshold_raises_nothing():
    assert evaluate([person(score=0.64)]) == []


def test_person_at_threshold_raises():
    assert evaluate([person(score=0.65)]) != []


def test_custom_threshold():
    assert evaluate([person(score=0.5)], threshold=0.4) != []


def test_unsure_hat_still_counts_as_worn():
    alerts = evaluate([person(), det(PROMPT_HAT, HAT_BOX, 0.4), det(PROMPT_VEST, VEST_BOX)])
    assert alerts == []


def test_hat_on_the_floor_is_not_worn():
    floor_hat = det(PROMPT_HAT, [0.45, 0.72, 0.55, 0.80])
    assert kinds(evaluate([person(), floor_hat, det(PROMPT_VEST, VEST_BOX)])) == ["noHardHat"]


def test_someone_elses_hat_is_not_worn():
    other_hat = det(PROMPT_HAT, [0.05, 0.20, 0.15, 0.28])
    assert kinds(evaluate([person(), other_hat, det(PROMPT_VEST, VEST_BOX)])) == ["noHardHat"]


def test_each_person_is_judged_alone():
    left = det(PROMPT_PERSON, [0.10, 0.2, 0.30, 0.8])
    right = det(PROMPT_PERSON, [0.60, 0.2, 0.80, 0.8])
    hat = det(PROMPT_HAT, [0.15, 0.2, 0.25, 0.28])
    vest = det(PROMPT_VEST, [0.12, 0.4, 0.28, 0.55])
    alerts = evaluate([left, right, hat, vest])
    assert kinds(alerts) == ["noHardHat", "noVest"]
    assert all(a["box"] == right["box"] for a in alerts)


def test_zone_0_entry_alerts_even_with_full_ppe():
    alerts = evaluate([person(), det(PROMPT_HAT, HAT_BOX), det(PROMPT_VEST, VEST_BOX)], zone=0)
    assert kinds(alerts) == ["zone0Entry"]
    assert alerts[0]["zone"] == 0


def test_zone_0_entry_with_permit_is_allowed():
    assert evaluate([person()], zone=0, permit=True) == []


@pytest.mark.parametrize("zone", [1, 2])
def test_zones_1_and_2_list_what_is_missing(zone):
    alerts = evaluate([person(), det(PROMPT_VEST, VEST_BOX)], zone=zone)
    assert kinds(alerts) == ["zonePpe"]
    assert alerts[0]["zone"] == zone
    assert alerts[0]["missing"] == ["hardHat"]


def test_safe_zone_uses_the_plain_kinds():
    assert kinds(evaluate([person()], zone="safe")) == ["noHardHat", "noVest"]


def test_flame_and_smoke_above_threshold_alert():
    alerts = evaluate([det(PROMPT_FLAME, [0.1, 0.1, 0.2, 0.2]), det(PROMPT_SMOKE, [0.3, 0.1, 0.4, 0.2], 0.7)])
    assert kinds(alerts) == ["fire", "fire"]
    assert alerts[0]["label"] == PROMPT_FLAME


def test_flame_below_threshold_is_ignored():
    assert evaluate([det(PROMPT_FLAME, [0.1, 0.1, 0.2, 0.2], 0.5)]) == []


def test_alerts_are_sorted_most_confident_first():
    alerts = evaluate([person(0.7), det(PROMPT_FLAME, [0.1, 0.1, 0.2, 0.2], 0.95)])
    assert alerts[0]["kind"] == "fire"


def test_alert_shape_matches_the_twin_detection():
    alert = evaluate([person()], zone=1, camera="CCTV-A01")[0]
    assert alert["camera"] == "CCTV-A01"
    assert alert["model"] == "sam-3.1"
    assert alert["box"] == PERSON_BOX
    assert alert["confidence"] == 0.9


def tag(worker, box=PERSON_BOX, zone=None, permit=False):
    return {"workerId": worker, "box": box, "zone": zone, "permit": permit}


def test_overlap_of_boxes():
    assert overlap([0, 0, 1, 1], [0, 0, 1, 1]) == 1
    assert overlap([0, 0, 1, 1], [2, 2, 3, 3]) == 0


def test_a_tagged_person_gets_a_name():
    named = match_people([person()], [tag("w02")])
    assert named[0]["workerId"] == "w02"


def test_a_tag_far_from_anyone_names_nobody():
    named = match_people([person()], [tag("w02", box=[0.0, 0.0, 0.05, 0.05])])
    assert "workerId" not in named[0]


def test_a_tag_never_invents_a_person():
    assert match_people([], [tag("w02")]) == []


def test_each_worker_is_used_once():
    left = det(PROMPT_PERSON, [0.10, 0.2, 0.30, 0.8], 0.9)
    near = det(PROMPT_PERSON, [0.12, 0.2, 0.32, 0.8], 0.8)
    named = match_people([left, near], [tag("w01", box=left["box"])])
    assert [d.get("workerId") for d in named] == ["w01", None]


def test_the_closest_tag_wins():
    named = match_people([person()], [tag("w01", box=[0.5, 0.2, 0.7, 0.8]), tag("w02", box=[0.41, 0.2, 0.61, 0.8])])
    assert named[0]["workerId"] == "w02"


def test_matching_leaves_other_detections_alone():
    hat = det(PROMPT_HAT, HAT_BOX)
    assert match_people([person(), hat], [tag("w01")])[1] == hat


def test_a_named_person_is_judged_in_their_own_zone():
    named = match_people([person()], [tag("w07", zone=1)])
    alerts = evaluate(named, zone=2)
    assert kinds(alerts) == ["zonePpe"]
    assert alerts[0]["zone"] == 1
    assert alerts[0]["workerId"] == "w07"


def test_a_named_person_without_a_zone_uses_the_cameras():
    named = match_people([person()], [tag("w07")])
    assert evaluate(named, zone=2)[0]["zone"] == 2


def test_a_named_person_in_zone_0_with_a_permit_is_allowed():
    named = match_people([person()], [tag("w07", zone=0, permit=True)])
    assert evaluate(named) == []


def test_plain_alerts_carry_the_name_too():
    named = match_people([person()], [tag("w02")])
    assert {a["workerId"] for a in evaluate(named)} == {"w02"}


def test_the_camera_decides_what_is_worn_not_the_tag():
    named = match_people([person(), det(PROMPT_HAT, HAT_BOX), det(PROMPT_VEST, VEST_BOX)], [tag("w02", zone=1)])
    assert evaluate(named) == []


def test_a_figure_too_small_to_judge_raises_no_ppe_alert():
    far = det(PROMPT_PERSON, [0.5, 0.5, 0.52, 0.55])  # 14 px tall in a 288 px frame
    assert evaluate([far], frame_height=288) == []


def test_the_same_figure_is_judged_in_a_bigger_frame():
    near = det(PROMPT_PERSON, [0.5, 0.5, 0.52, 0.55])
    assert evaluate([near], frame_height=1080) != []


def test_a_far_figure_in_zone_0_still_alerts():
    far = det(PROMPT_PERSON, [0.5, 0.5, 0.52, 0.55])
    assert kinds(evaluate([far], zone=0, frame_height=288)) == ["zone0Entry"]


def test_unknown_zone_is_rejected():
    with pytest.raises(ValueError):
        evaluate([], zone=3)
