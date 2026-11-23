"""Audit provisional agent review coverage and summarize completed packets."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data/evaluation/experiments/adaptive-bank/review"
FORMATS = ("mainIdeas", "quiz", "flashcards")
spec = importlib.util.spec_from_file_location("adaptive_review_validator", Path(__file__).with_name("validate-reviews.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def measure(packet, review):
    result = {}
    priorities = {concept["id"]: concept["priority"] for concept in packet["referenceConcepts"]}
    for name in FORMATS:
        scores = review["conceptScores"][name]
        judgments = review["itemJudgments"][name]
        high = [cid for cid in scores if priorities[cid] == "high"]
        result[name] = {"referenceCount": len(scores), "credit": sum(v["credit"] for v in scores.values()),
                        "highPriorityCount": len(high), "highPriorityCredit": sum(scores[cid]["credit"] for cid in high),
                        "itemCount": len(judgments),
                        "correctSupported": sum(v["correctness"] == "correct_supported" for v in judgments.values()),
                        "minorIssues": sum(v["correctness"] == "minor_issue" for v in judgments.values()),
                        "seriousErrors": sum(v["correctness"] == "serious_error" for v in judgments.values()),
                        "usefulnessSum": sum(v["usefulness"] for v in judgments.values()),
                        "usefulness2": sum(v["usefulness"] == 2 for v in judgments.values()),
                        "duplicateFlags": sum(v["duplicateOf"] is not None for v in judgments.values())}
    result["union"] = {"referenceCount": len(priorities),
                       "credit": sum(max(review["conceptScores"][name][cid]["credit"] for name in FORMATS)
                                     for cid in priorities),
                       "highPriorityCount": sum(priority == "high" for priority in priorities.values()),
                       "highPriorityCredit": sum(max(review["conceptScores"][name][cid]["credit"] for name in FORMATS)
                                                 for cid, priority in priorities.items() if priority == "high")}
    return result


def main():
    mapping = read(REVIEW / "coordinator-map.json")
    packets = []
    for case_doc, entry in mapping.items():
        directory = REVIEW / entry["packetId"]
        packet = read(directory / "packet.json")
        reviews = []
        for path in sorted(directory.glob("review-*.json")):
            module.validate(path)
            review = read(path)
            reviews.append({"file": path.name, "measure": measure(packet, review)})
        packets.append({"caseDocument": case_doc, "packetId": entry["packetId"],
                        "reviewCount": len(reviews), "reviews": reviews})
    output = {"packetCount": len(packets), "packetsWithReview": sum(bool(p["reviewCount"]) for p in packets),
              "reviewCount": sum(p["reviewCount"] for p in packets), "packets": packets}
    target = REVIEW / "progress-summary.json"
    target.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"{output['packetsWithReview']}/{output['packetCount']} packets reviewed; {output['reviewCount']} validated reviews")
    for packet in packets:
        if not packet["reviewCount"]:
            print(f"NEXT {packet['packetId']}")
            break


if __name__ == "__main__":
    main()
