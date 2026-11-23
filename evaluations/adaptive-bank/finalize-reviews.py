"""Mark all six cases provisionally scored after validating the review aggregate."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXP = ROOT / "data/evaluation/experiments/adaptive-bank"


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path: Path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    aggregate = read(EXP / "review-aggregate.provisional.json")
    progress_path = EXP / "progress.json"
    progress = read(progress_path)
    mapping = read(EXP / "review/coordinator-map.json")
    if (aggregate["status"] != "provisional_agent_review_complete" or aggregate["unreviewedPackets"] or
            len(mapping) != 30 or len(progress["cases"]) != 6 or
            {case["caseId"] for case in progress["cases"]} != set(aggregate["cases"])):
        raise RuntimeError("Review aggregate or case queue is incomplete")
    for case in progress["cases"]:
        if case["runStatus"] != "generated":
            raise RuntimeError(f"Case not generated: {case['caseId']}")
        case["reviewStatus"] = "provisionally_scored"
    progress["counts"]["provisionallyScored"] = len(progress["cases"])
    progress["status"] = "provisionally_scored_pending_human"
    progress["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    write(progress_path, progress)
    print(f"{progress['counts']['provisionallyScored']} cases provisionally scored; human review pending")


if __name__ == "__main__":
    main()
