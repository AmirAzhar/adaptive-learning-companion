"""Aggregate validated provisional reviews by case, retaining raw denominators.

For overlap packets, the alpha review is the primary arithmetic input; both independent
reviews remain available and their differences are reported separately.
"""
from __future__ import annotations

import importlib.util
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXP = ROOT / "data/evaluation/experiments/adaptive-bank"
REVIEW = EXP / "review"
FORMATS = ("mainIdeas", "quiz", "flashcards")
spec = importlib.util.spec_from_file_location("adaptive_review_validator", Path(__file__).with_name("validate-reviews.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fresh():
    return {"referenceCount": 0, "credit": 0, "highPriorityCount": 0, "highPriorityCredit": 0,
            "itemCount": 0, "correctSupported": 0, "minorIssues": 0, "seriousErrors": 0,
            "usefulnessSum": 0, "usefulness2": 0, "duplicateFlags": 0,
            "thirds": {str(third): {"referenceCount": 0, "credit": 0} for third in (1, 2, 3)}}


def main():
    mapping = read(REVIEW / "coordinator-map.json")
    adjudications = read(REVIEW / "serious-adjudication.json") if (REVIEW / "serious-adjudication.json").exists() else []
    adjudication_map = {(entry["packetId"], entry["format"], entry["itemId"]): entry for entry in adjudications}
    if len(adjudication_map) != len(adjudications):
        raise ValueError("Duplicate serious-error adjudication")
    cases = defaultdict(lambda: {name: fresh() for name in (*FORMATS, "union")})
    unreviewed = []
    invalid_gold = []
    applied_adjudications = []
    for key, entry in mapping.items():
        case_id, _ = key.split("/", 1)
        directory = REVIEW / entry["packetId"]
        packet = read(directory / "packet.json")
        source_text = ' '.join((directory / "source.md").read_text(encoding="utf-8").split())
        path = directory / "review-primary.json"
        if not path.exists():
            path = directory / "review-alpha.json"
        if not path.exists():
            unreviewed.append(entry["packetId"])
            continue
        module.validate(path)
        review = read(path)
        for (packet_id, fmt, item_id), decision in adjudication_map.items():
            if packet_id != packet["packetId"]:
                continue
            judgment = review["itemJudgments"][fmt].get(item_id)
            if not judgment or judgment["correctness"] != "serious_error":
                raise ValueError(f"Adjudication has no primary serious flag: {packet_id}/{fmt}/{item_id}")
            if decision["verdict"] not in ("correct_supported", "minor_issue", "serious_error"):
                raise ValueError(f"Invalid adjudication verdict: {packet_id}/{item_id}")
            judgment["correctness"] = decision["verdict"]
            if "usefulness" in decision:
                judgment["usefulness"] = decision["usefulness"]
            applied_adjudications.append({"packetId": packet_id, "format": fmt, "itemId": item_id,
                                          "verdict": decision["verdict"], "wrongKey": decision["wrongKey"]})
        for concept in packet["referenceConcepts"]:
            cid = concept["id"]
            if ' '.join(concept["evidenceExcerpt"].split()) not in source_text:
                invalid_gold.append({"caseDocument": key, "packetId": packet["packetId"], "conceptId": cid,
                                     "reason": "Approved evidence excerpt absent from frozen source."})
                continue
            third = str(concept["location"]["third"])
            if third not in ("1", "2", "3"):
                raise ValueError(f"Unexpected third: {third}")
            for name in (*FORMATS, "union"):
                credit = (max(review["conceptScores"][fmt][cid]["credit"] for fmt in FORMATS)
                          if name == "union" else review["conceptScores"][name][cid]["credit"])
                acc = cases[case_id][name]
                acc["referenceCount"] += 1
                acc["credit"] += credit
                if concept["priority"] == "high":
                    acc["highPriorityCount"] += 1
                    acc["highPriorityCredit"] += credit
                acc["thirds"][third]["referenceCount"] += 1
                acc["thirds"][third]["credit"] += credit
        for name in FORMATS:
            acc = cases[case_id][name]
            judgments = review["itemJudgments"][name].values()
            acc["itemCount"] += len(review["itemJudgments"][name])
            acc["correctSupported"] += sum(v["correctness"] == "correct_supported" for v in judgments)
            acc["minorIssues"] += sum(v["correctness"] == "minor_issue" for v in judgments)
            acc["seriousErrors"] += sum(v["correctness"] == "serious_error" for v in judgments)
            acc["usefulnessSum"] += sum(v["usefulness"] for v in judgments)
            acc["usefulness2"] += sum(v["usefulness"] == 2 for v in judgments)
            acc["duplicateFlags"] += sum(v["duplicateOf"] is not None for v in judgments)
    if len(applied_adjudications) != len(adjudications):
        raise ValueError("Some adjudications did not match a reviewed packet")
    output = {"status": "provisional_agent_review_incomplete" if unreviewed else "provisional_agent_review_complete",
              "unreviewedPackets": unreviewed, "invalidGoldReferences": invalid_gold,
              "appliedAdjudications": applied_adjudications, "cases": dict(cases),
              "note": "Alpha is primary for overlap packets; beta reviews and differences remain separate. Six serious flags have separate source-based adjudication. Invalid source references are excluded from adjusted denominators while original review files remain intact. Gold has no Java data-structures concepts."}
    target = EXP / "review-aggregate.provisional.json"
    target.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(output["status"], f"{len(unreviewed)} packets remaining; {len(invalid_gold)} invalid gold references excluded")
    for case_id, formats in cases.items():
        print(case_id, {name: f"{formats[name]['credit']}/{formats[name]['referenceCount']}" for name in (*FORMATS, "union")})


if __name__ == "__main__":
    main()
