"""Record independent-review agreement without overwriting either review."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data/evaluation/experiments/adaptive-bank/review"
FORMATS = ("mainIdeas", "quiz", "flashcards")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    comparisons = []
    for directory in sorted(REVIEW.glob("A-*")):
        alpha = directory / "review-alpha.json"
        beta = directory / "review-beta.json"
        if not alpha.exists() or not beta.exists():
            continue
        a, b = read(alpha), read(beta)
        packet = read(directory / "packet.json")
        if a["packetId"] != b["packetId"] or a["packetId"] != packet["packetId"]:
            raise ValueError(f"Packet mismatch: {directory}")
        formats = {}
        for name in FORMATS:
            ca, cb = a["conceptScores"][name], b["conceptScores"][name]
            ia, ib = a["itemJudgments"][name], b["itemJudgments"][name]
            formats[name] = {
                "conceptCreditDifferences": [cid for cid in ca if ca[cid]["credit"] != cb[cid]["credit"]],
                "correctnessDifferences": [iid for iid in ia if ia[iid]["correctness"] != ib[iid]["correctness"]],
                "duplicateDifferences": [iid for iid in ia if ia[iid]["duplicateOf"] != ib[iid]["duplicateOf"]],
                "usefulnessDifferences": [iid for iid in ia if ia[iid]["usefulness"] != ib[iid]["usefulness"]],
                "alphaUsefulnessSum": sum(v["usefulness"] for v in ia.values()),
                "betaUsefulnessSum": sum(v["usefulness"] for v in ib.values()),
                "itemCount": len(ia),
            }
        comparisons.append({"packetId": packet["packetId"], "formats": formats})
    target = REVIEW / "overlap-comparison.json"
    target.write_text(json.dumps({"comparisons": comparisons}, indent=2) + "\n", encoding="utf-8")
    print(f"Compared {len(comparisons)} independent packet pairs")
    for comparison in comparisons:
        print(comparison["packetId"], {name: {"credit": len(value["conceptCreditDifferences"]),
                                              "correctness": len(value["correctnessDifferences"]),
                                              "usefulness": len(value["usefulnessDifferences"])}
                                       for name, value in comparison["formats"].items()})


if __name__ == "__main__":
    main()
