"""Check completeness and arithmetic inputs in an adaptive-bank packet review."""
from __future__ import annotations

import json
import sys
from pathlib import Path

FORMATS = ("mainIdeas", "quiz", "flashcards")


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate(review_path: Path):
    packet = read(review_path.parent / "packet.json")
    review = read(review_path)
    if review.get("packetId") != packet["packetId"] or review.get("reviewerType") != "agent" or review.get("status") != "provisional":
        raise ValueError("Packet identity or review status mismatch")
    concept_ids = {concept["id"] for concept in packet["referenceConcepts"]}
    if len(concept_ids) != len(packet["referenceConcepts"]):
        raise ValueError("Duplicate packet concept ID")
    result = {}
    for name in FORMATS:
        items = packet["generated"][name]
        item_ids = {item["id"] for item in items}
        if len(item_ids) != len(items):
            raise ValueError(f"Duplicate {name} item ID")
        scores = review["conceptScores"][name]
        judgments = review["itemJudgments"][name]
        if set(scores) != concept_ids:
            raise ValueError(f"{name}: reference concept IDs incomplete or extra")
        if set(judgments) != item_ids:
            raise ValueError(f"{name}: generated item IDs incomplete or extra")
        for concept_id, value in scores.items():
            if value.get("credit") not in (0, 0.5, 1):
                raise ValueError(f"{name}/{concept_id}: invalid credit")
            supporting = value.get("supportItemIds")
            if not isinstance(supporting, list) or any(item_id not in item_ids for item_id in supporting):
                raise ValueError(f"{name}/{concept_id}: invalid support item IDs")
            if bool(supporting) != bool(value["credit"]):
                raise ValueError(f"{name}/{concept_id}: credit/support mismatch")
        for item_id, value in judgments.items():
            if value.get("correctness") not in ("correct_supported", "minor_issue", "serious_error"):
                raise ValueError(f"{name}/{item_id}: invalid correctness")
            if value.get("usefulness") not in (0, 1, 2) or isinstance(value["usefulness"], bool):
                raise ValueError(f"{name}/{item_id}: invalid usefulness")
            if value["correctness"] == "serious_error" and value["usefulness"] != 0:
                raise ValueError(f"{name}/{item_id}: serious error cannot be useful")
            duplicate = value.get("duplicateOf")
            if duplicate is not None and (duplicate not in item_ids or duplicate == item_id):
                raise ValueError(f"{name}/{item_id}: invalid duplicate ID")
            note = value.get("evidenceNote")
            if not isinstance(note, str) or ((value["correctness"] != "correct_supported" or duplicate) and not note.strip()):
                raise ValueError(f"{name}/{item_id}: evidence note missing")
        result[name] = {"concepts": len(scores), "items": len(judgments),
                        "credit": sum(value["credit"] for value in scores.values()),
                        "correctSupported": sum(value["correctness"] == "correct_supported" for value in judgments.values()),
                        "seriousErrors": sum(value["correctness"] == "serious_error" for value in judgments.values())}
    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python evaluations/adaptive-bank/validate-reviews.py <review-json>")
    print(json.dumps(validate(Path(sys.argv[1])), indent=2))
